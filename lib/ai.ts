// ═══════════════════════════════════════════════════════════════
// AI Service Layer — Phase 3: Core + TL assistant + RAG
// ═══════════════════════════════════════════════════════════════
// Third deployment of the new DCM AI. Wires up:
//   - Core prompt           (lib/ai/core/corePrompt.ts)
//   - Team Leader prompt    (lib/ai/assistants/teamLeaderAssistant.ts)
//   - Shared knowledge RAG  (notifications principles + templates)
//   - Team Leader RAG       (workflows + rules + examples)
//
// The RAG is auto-generated from .md files by
// scripts/build-rag.js. Re-run that script whenever any file
// under lib/ai/rag/ changes.
//
// No tools yet — the AI can now reason with full workflow
// knowledge but cannot execute actions. Tools come in the next
// phase.
//
// Routing note: the Team Leader assistant + TL RAG are loaded
// unconditionally for now. When the Doctor assistant is wired
// in, a router will pick the right prompt + RAG stack based on
// the signed-in user's role.
//
// Public surface kept unchanged so the Schedule page works
// without modification:
//   - sendMessage(messages, contextData?, clinicId?, weekStart?)
//   - buildScheduleContext(data)
//
// `clinicId` and `weekStart` are accepted but unused for now;
// they will be needed when tools are introduced.
// ═══════════════════════════════════════════════════════════════

import { CORE_PROMPT } from './ai/core/corePrompt';
import { TEAM_LEADER_PROMPT } from './ai/assistants/teamLeaderAssistant';
import { SHARED_KNOWLEDGE_RAG, TEAM_LEADER_RAG } from './ai/rag/_compiled';

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
 * Send a message to Claude with the Core prompt as system.
 * No tool use in this phase — the AI is conversational only.
 */
export async function sendMessage(
  messages: AIMessage[],
  contextData?: string,
  _clinicId?: string,
  _weekStart?: string,
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
    let conversation = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    if (conversation.length > 10) {
      conversation = conversation.slice(-10);
    }

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
    let text = '';
    for (const block of data.content || []) {
      if (block.type === 'text') {
        text += block.text;
      }
    }

    return { success: true, message: text || '...' };
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
