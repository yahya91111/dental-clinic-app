// ═══════════════════════════════════════════════════════════════
// AI Service Layer — Phase 5 (DB-backed + role router)
// ═══════════════════════════════════════════════════════════════
// Wires the full DCM AI stack:
//   - Core prompt           (lib/ai/core/corePrompt.ts)
//   - Per-role assistant    (TL or Doctor, picked by user.role)
//   - Shared knowledge RAG  (notifications principles + templates)
//   - Per-role RAG          (workflows + rules + examples)
//   - Full tool catalog     (lib/ai/tools/index.ts)
//
// Routing rule (resolveAssistantStack):
//   - doctor                       → Doctor prompt + Doctor RAG
//   - team_leader / coordinator /
//     super_admin                  → Team Leader prompt + TL RAG
//   - no user signed in            → Team Leader prompt + TL RAG
//     (safe default; tool permission gates still refuse writes
//     because requirePermission needs ctx.user to be set)
//
// Tool surface is identical for both roles. Per-action gating
// lives inside each tool via requirePermission(), so a Doctor
// calling a TL-only tool still gets refused at execution time.
// This keeps the router simple and the security model uniform.
//
// Public surface (sendMessage, buildScheduleContext, AIMessage)
// is unchanged; callers don't need to know which assistant ran.
// ═══════════════════════════════════════════════════════════════

import { CORE_PROMPT } from './ai/core/corePrompt';
import { TEAM_LEADER_PROMPT } from './ai/assistants/teamLeaderAssistant';
import { DOCTOR_PROMPT } from './ai/assistants/doctorAssistant';
import { SHARED_KNOWLEDGE_RAG, TEAM_LEADER_RAG, DOCTOR_RAG } from './ai/rag/_compiled';
import { ALL_TOOLS, executeTool } from './ai/tools';
import { supabase } from './supabase';
import { User } from '../permissions';

/**
 * Fetch unconsumed manual-action events for the clinic and format
 * them as a system-prompt block. Returns null if there are no
 * pending events (so we don't add a wasted block).
 *
 * The AI is responsible for calling `mark_events_consumed` after
 * processing — this function only reads.
 */
async function fetchPendingEventsBlock(clinicId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('ai_events')
    .select('id, event_type, payload, actor_name, created_at')
    .eq('clinic_id', clinicId)
    .eq('consumed', false)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error || !data || data.length === 0) return null;

  const lines = data.map(
    (e) =>
      `- [${e.id}] ${e.event_type} @ ${e.created_at}${e.actor_name ? ` by ${e.actor_name}` : ''}: ${JSON.stringify(e.payload)}`,
  );
  return (
    `\nPending manual-action events since the user's last AI session ` +
    `(${data.length}, oldest first):\n${lines.join('\n')}\n\n` +
    `These were captured by the ai_events triggers when someone in ` +
    `the clinic changed something through the UI directly (not via you). ` +
    `Per the react_to_system_event workflow:\n` +
    `  1. If the events are relevant to what the user is asking, react ` +
    `briefly (one short sentence acknowledging what changed, then offer ` +
    `the next action like a notify_prompt where appropriate).\n` +
    `  2. If the user's first message is unrelated to these events, do ` +
    `NOT bring them up — just answer the question. They will stay ` +
    `unconsumed for next session.\n` +
    `  3. AFTER you have read and decided what to do with an event, ` +
    `call mark_events_consumed with its id so it does not surface ` +
    `again. Mark consumed even if you chose not to mention it — the ` +
    `decision counts as processing.\n`
  );
}

/**
 * "First message in a session" heuristic. We treat any call with at
 * most one user message and no assistant turns as the start of a
 * fresh chat — that's when the events block is most valuable. On
 * follow-up turns we skip the fetch to keep tokens and latency low.
 */
function isFirstMessageOfSession(messages: AIMessage[]): boolean {
  if (messages.length === 0) return true;
  if (messages.length === 1 && messages[0].role === 'user') return true;
  return false;
}

/**
 * Pick the right assistant prompt + RAG stack for the signed-in
 * user. Returns a label too so the caller can log which path ran.
 */
function resolveAssistantStack(user: User | null | undefined) {
  if (user?.role === 'doctor') {
    return {
      label: 'doctor',
      assistantPrompt: DOCTOR_PROMPT,
      assistantRag: DOCTOR_RAG,
    };
  }
  return {
    label: 'team_leader',
    assistantPrompt: TEAM_LEADER_PROMPT,
    assistantRag: TEAM_LEADER_RAG,
  };
}

/**
 * Pick the model for this call. The previous weekly-build router
 * was retired along with the per-day build flow; until a new
 * router is in place we always use the smart model so multi-step
 * conversations stay coherent.
 */
function pickModelForCall(): { model: string; reason: string } {
  return { model: 'claude-sonnet-4-6', reason: 'default' };
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const getApiKey = () => process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '';

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Send a message to Claude with the full system stack
 * (Core + TL assistant + RAG) and the read tools wired in.
 *
 * Loops on tool_use: when Claude calls a read tool, we execute
 * it against Supabase, feed the result back, and continue until
 * Claude stops calling tools. MAX_ROUNDS guards against runaway
 * loops.
 */
export interface SendMessageOptions {
  /**
   * Called by the set_active_week tool when the AI wants the
   * Schedule UI to switch to a different week. The host screen
   * (currently Schedule/index.tsx) wires this to its own
   * `setSelectedWeekStart` setter.
   */
  onSetActiveWeek?: (weekStart: string) => void;
}

export async function sendMessage(
  messages: AIMessage[],
  contextData?: string,
  clinicId?: string,
  weekStart?: string,
  user?: User | null,
  options?: SendMessageOptions,
): Promise<AIResponse> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      success: false,
      message: '',
      error: 'API key not configured.',
    };
  }

  try {
    // Pick the assistant stack based on the signed-in user's role.
    const { assistantPrompt, assistantRag } = resolveAssistantStack(user);

    const { model: pickedModel, reason: modelReason } = pickModelForCall();
    // eslint-disable-next-line no-console
    console.log(`[AI] using model=${pickedModel} (${modelReason})`);

    // System prompt: Core + per-role assistant + shared knowledge
    // + per-role RAG. The whole stack is cached for 1 hour — the
    // first request in a session pays the full token cost, every
    // subsequent request in the same hour pays the cache rate
    // (~10% of full). Each role has its own cache key because the
    // assistant prompt and RAG text differ between roles.
    const systemBlocks: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text: CORE_PROMPT,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
      {
        type: 'text',
        text: assistantPrompt,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
      {
        type: 'text',
        text: SHARED_KNOWLEDGE_RAG,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
      {
        type: 'text',
        text: assistantRag,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
    ];

    // Identify the signed-in user to the AI. Without this block
    // the AI does not know who is talking to it, and may confuse
    // the current user with other staff named in the context
    // (e.g. picking the team leader listed inside a group instead
    // of the signed-in team leader).
    if (user) {
      const roleLabelMap: Record<string, string> = {
        super_admin: 'Super Admin',
        coordinator: 'Coordinator',
        team_leader: 'Team Leader',
        doctor: 'Doctor',
      };
      const roleLabel = roleLabelMap[user.role] || user.role;
      const clinicLine = user.clinicName
        ? `\n- Clinic: ${user.clinicName}${user.clinicId ? ` [clinic_id: ${user.clinicId}]` : ''}`
        : '';
      systemBlocks.push({
        type: 'text',
        text:
          `\nCurrent signed-in user (the person you are talking to right now):\n` +
          `- Name: ${user.name}\n` +
          `- Role: ${roleLabel}\n` +
          `- User ID: ${user.id}${clinicLine}\n` +
          `\nWhen the user says "me", "I", "my schedule", "add me", etc., ` +
          `they are referring to this person. Use this ID when looking ` +
          `them up in the schedule, groups, or any other data. Do not ` +
          `confuse them with other staff who share their role (e.g. ` +
          `another team leader listed inside a group).\n`,
      });
    }

    if (contextData) {
      systemBlocks.push({
        type: 'text',
        text: `\nCurrent runtime context (filtered by user permissions):\n${contextData}`,
      });
    }

    // On the first message of a session, pre-load any unconsumed
    // manual-action events for the clinic so the AI can react to
    // what happened while it was away. Skipped on follow-up turns
    // to save tokens — the AI can still call list_recent_ai_events
    // manually if it needs to.
    if (clinicId && isFirstMessageOfSession(messages)) {
      const eventsBlock = await fetchPendingEventsBlock(clinicId);
      if (eventsBlock) {
        systemBlocks.push({ type: 'text', text: eventsBlock });
      }
    }

    // Keep up to 40 most recent messages, but always anchor the
    // very first user message at the top so the AI never loses
    // the original intent ("create next week's schedule",
    // "أنشئ جدول"). Without this anchor, long multi-day builds
    // drift and the AI starts asking questions it already
    // answered earlier in the same session.
    const mapped: Array<Record<string, unknown>> = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    let conversation: Array<Record<string, unknown>>;
    if (mapped.length <= 40) {
      conversation = mapped;
    } else {
      const anchor = mapped[0];
      const tail = mapped.slice(-(40 - 1));
      conversation = [anchor, ...tail];
    }

    // Tools require clinicId + weekStart to query Supabase. If
    // either is missing we still run, but tool calls will fail
    // gracefully.
    const toolsEnabled = Boolean(clinicId && weekStart);
    const toolCtx = {
      clinicId: clinicId || '',
      weekStart: weekStart || '',
      user: user || null,
      uiCallbacks: {
        setActiveWeek: options?.onSetActiveWeek,
      },
    };

    let allText = '';
    const MAX_ROUNDS = 20;
    // Track tool calls + errors so we can surface them to the user
    // if the model returns without a final text summary (e.g., hit
    // max rounds or max_tokens mid-loop).
    const toolErrors: string[] = [];
    let lastStopReason: string | undefined;
    let roundsUsed = 0;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      roundsUsed = round + 1;
      const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'extended-cache-ttl-2025-04-11',
        },
        body: JSON.stringify({
          // Picked once per sendMessage call by pickModelForCall.
          // The smart model (Sonnet) handles intent capture, swap
          // workflows, and general questions. The cheap model
          // (Haiku) handles each per-day build during a sequential
          // schedule create — narrow scope, small payload.
          model: pickedModel,
          // 16K output tokens: a full day's slots is small (~600
          // tokens of JSON) but the smart model sometimes plans
          // out loud first; 16K gives both modes room to breathe.
          max_tokens: 16000,
          system: systemBlocks,
          tools: toolsEnabled ? ALL_TOOLS : undefined,
          messages: conversation,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return {
          success: false,
          message: '',
          error: `API Error: ${res.status} - ${errData.error?.message || 'Unknown'}`,
        };
      }

      const data = await res.json();
      lastStopReason = data.stop_reason;
      const toolResults: Array<Record<string, unknown>> = [];

      // Per-round summary: stop reason + usage so we can see if
      // the model hit max_tokens, ran out of tools, etc.
      // eslint-disable-next-line no-console
      console.log(
        `[AI round ${round + 1}] stop_reason=${data.stop_reason} ` +
          `output_tokens=${data.usage?.output_tokens ?? '?'} ` +
          `input_tokens=${data.usage?.input_tokens ?? '?'}`,
      );

      for (const block of data.content || []) {
        if (block.type === 'text') {
          allText += block.text;
          // eslint-disable-next-line no-console
          console.log(
            `[AI round ${round + 1}] TEXT:`,
            block.text.slice(0, 400),
          );
        } else if (block.type === 'tool_use' && toolsEnabled) {
          const result = await executeTool(block.name, block.input, toolCtx);
          // Truncate the input for logging — for big tools like
          // draft_weekly_schedule we just want a size indication.
          const inputStr = JSON.stringify(block.input);
          const inputPreview =
            inputStr.length > 300 ? inputStr.slice(0, 300) + `...(${inputStr.length} chars)` : inputStr;
          // eslint-disable-next-line no-console
          console.log(
            `[AI round ${round + 1}] TOOL ${block.name}:`,
            inputPreview,
            '→',
            result.slice(0, 300),
          );
          // Capture refusals/errors so we can surface them later if
          // the model never produces a wrap-up text.
          if (/^(Refused|Error|Tool error)/.test(result)) {
            toolErrors.push(`${block.name}: ${result}`);
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      // If the model is done (no tool calls) we exit the loop.
      if (data.stop_reason !== 'tool_use' || toolResults.length === 0) {
        break;
      }

      // Feed the assistant's tool calls back into the next round
      // along with the tool results.
      conversation.push({ role: 'assistant', content: data.content });
      conversation.push({ role: 'user', content: toolResults });
    }

    // If the loop exited without the AI producing a meaningful final
    // text, surface what we know so the user isn't staring at a
    // silent chat. This catches: hit MAX_ROUNDS, hit max_tokens
    // mid-tool-call, or a tool error the model ignored.
    if (!allText.trim() || allText.trim() === '...') {
      const reason =
        roundsUsed >= MAX_ROUNDS
          ? `هذي الجلسه احتاجت أكثر من ${MAX_ROUNDS} جوله أدوات وما اكتملت.`
          : lastStopReason === 'max_tokens'
            ? 'الرد كان طويل وانقطع. حاول طلب أصغر.'
            : 'الذكاء انتهى بدون رد نصي.';
      const errLine = toolErrors.length
        ? `\nآخر أخطاء بالأدوات:\n${toolErrors.slice(-3).join('\n')}`
        : '';
      return {
        success: false,
        message: '',
        error: `${reason}${errLine}`,
      };
    }

    return { success: true, message: allText };
  } catch (error) {
    return {
      success: false,
      message: '',
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

/**
 * Build a plain-text context summary from the current schedule
 * data, to be appended to the system prompt as runtime context.
 *
 * This is read-only data shown to the AI so it can answer
 * questions about the current schedule without guessing.
 */
export function buildScheduleContext(data: {
  clinicName?: string;
  weekStart?: string;
  clinicCount?: number;
  slots?: any[];
  groups?: any[];
}): string {
  let context = '';

  if (data.clinicName) context += `Clinic: ${data.clinicName}\n`;
  if (data.weekStart) context += `Week: ${data.weekStart}\n`;
  if (data.clinicCount) context += `Number of clinics: ${data.clinicCount}\n`;

  if (data.slots && data.slots.length > 0) {
    context += `\nCurrent schedule slots:\n`;
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
    for (const day of days) {
      const daySlots = data.slots.filter(
        (s) => s.day === day || s.day_of_week === day,
      );
      if (daySlots.length > 0) {
        context += `  ${day}:\n`;
        for (const s of daySlots as any[]) {
          const roleLabel =
            s.role === 'delegator'
              ? 'DLG'
              : `CL${s.clinicNumber || s.clinic_number}`;
          const periodLabel = s.period === 0 ? 'EX' : `P${s.period}`;
          context += `    ${periodLabel} - ${roleLabel}: ${s.doctorName || s.doctor_name} (${s.status})\n`;
        }
      }
    }
  } else {
    context += `\nSchedule is currently empty.\n`;
  }

  if (data.groups && data.groups.length > 0) {
    context += `\nDoctor groups:\n`;
    for (const g of data.groups as any[]) {
      const groupId = g.id || '';
      const groupDoctors: any[] = g.doctors || [];
      const doctorList =
        groupDoctors
          .map((d) => {
            const status = d.workStatus || d.work_status || 'active';
            const id = d.id || d.doctor_id || '';
            const statusStr = status !== 'active' ? ` (${status})` : '';
            return `${d.name}${statusStr} [${id}]`;
          })
          .join(', ') || 'empty';
      context += `  ${g.name} [group_id: ${groupId}]: ${doctorList}\n`;
    }
  }

  return context;
}
