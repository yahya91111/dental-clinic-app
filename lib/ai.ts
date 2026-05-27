// ═══════════════════════════════════════════════════════════════
// AI Service Layer — Phase 4-A: Core + TL + RAG + read tools
// ═══════════════════════════════════════════════════════════════
// Fourth deployment of the new DCM AI. Wires up:
//   - Core prompt           (lib/ai/core/corePrompt.ts)
//   - Team Leader prompt    (lib/ai/assistants/teamLeaderAssistant.ts)
//   - Shared knowledge RAG  (notifications principles + templates)
//   - Team Leader RAG       (workflows + rules + examples)
//   - Read tools            (lib/ai/tools/index.ts)
//
// The AI can now query the live database to answer questions:
// list doctors, list groups, show the current schedule, look up
// a specific doctor's slots, etc. Read tools are safe (no
// modifications, no confirmation needed).
//
// Write tools come in the next phase (4-B onwards) and will be
// wrapped with permission checks.
//
// Routing note: the Team Leader assistant + TL RAG are loaded
// unconditionally for now. When the Doctor assistant is wired
// in, a router will pick the right prompt + RAG stack based on
// the signed-in user's role.
//
// Public surface (sendMessage, buildScheduleContext, AIMessage)
// is unchanged; the Schedule page works without modification.
// ═══════════════════════════════════════════════════════════════

import { CORE_PROMPT } from './ai/core/corePrompt';
import { TEAM_LEADER_PROMPT } from './ai/assistants/teamLeaderAssistant';
import { SHARED_KNOWLEDGE_RAG, TEAM_LEADER_RAG } from './ai/rag/_compiled';
import { READ_TOOLS, executeReadTool } from './ai/tools';

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
export async function sendMessage(
  messages: AIMessage[],
  contextData?: string,
  clinicId?: string,
  weekStart?: string,
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
    // System prompt: Core + TL assistant + shared knowledge + TL RAG.
    // The whole stack is cached for 1 hour — the first request in
    // a session pays the full token cost, every subsequent request
    // in the same hour pays the cache rate (~10% of full).
    const systemBlocks: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text: CORE_PROMPT,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
      {
        type: 'text',
        text: TEAM_LEADER_PROMPT,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
      {
        type: 'text',
        text: SHARED_KNOWLEDGE_RAG,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
      {
        type: 'text',
        text: TEAM_LEADER_RAG,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
    ];

    if (contextData) {
      systemBlocks.push({
        type: 'text',
        text: `\nCurrent runtime context (filtered by user permissions):\n${contextData}`,
      });
    }

    // Keep the last 10 messages (5 exchanges) to bound token cost.
    let conversation: Array<Record<string, unknown>> = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    if (conversation.length > 10) {
      conversation = conversation.slice(-10);
    }

    // Tools require clinicId + weekStart to query Supabase. If
    // either is missing we still run, but tool calls will fail
    // gracefully.
    const toolsEnabled = Boolean(clinicId && weekStart);
    const toolCtx = { clinicId: clinicId || '', weekStart: weekStart || '' };

    let allText = '';
    const MAX_ROUNDS = 10;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'extended-cache-ttl-2025-04-11',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4000,
          system: systemBlocks,
          tools: toolsEnabled ? READ_TOOLS : undefined,
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
      const toolResults: Array<Record<string, unknown>> = [];

      for (const block of data.content || []) {
        if (block.type === 'text') {
          allText += block.text;
        } else if (block.type === 'tool_use' && toolsEnabled) {
          const result = await executeReadTool(block.name, block.input, toolCtx);
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

    return { success: true, message: allText || '...' };
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
  slots?: Array<Record<string, unknown>>;
  groups?: Array<Record<string, unknown>>;
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
        for (const s of daySlots) {
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
    for (const g of data.groups) {
      const groupId = g.id || '';
      const groupDoctors = (g.doctors as Array<Record<string, unknown>>) || [];
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
