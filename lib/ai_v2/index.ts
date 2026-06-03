// ═══════════════════════════════════════════════════════════════
// AI V2 entry point — sendMessageV2
// ═══════════════════════════════════════════════════════════════
// نواة الذكاء V2 (Maestro). يحمّل:
//   - CORE_PROMPT_V2          (النواة المشتركة)
//   - TEAM_LEADER_PROMPT_V2   (مساعد التيم ليدر)
//   - CATALOG_V2              (قائمة الخوارزميات)
//
// النمط:
//   1. يبني system prompt من الطبقات الثلاث + هوية المستخدم
//   2. ينادي Anthropic API (Haiku 4.5 افتراضياً)
//   3. يدير tool use loop (يدعم الأدوات لما تُضاف)
//   4. يرجّع النص النهائي
//
// راجع: PLAN_AI_MAESTRO.md و README.md
// ═══════════════════════════════════════════════════════════════

import {
  CATALOG_V2,
  CORE_PROMPT_V2,
  TEAM_LEADER_PROMPT_V2,
} from './_compiled';
import { V2_TOOLS, dispatchV2Tool, type V2ToolContext } from './tools';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const getApiKey = () => process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 4096;
const MAX_TOOL_ROUNDS = 10;

export type V2Message = {
  role: 'user' | 'assistant';
  content: string;
};

export type V2User = {
  id: string;
  name: string;
  role: string;
  clinicId?: string;
  clinicName?: string;
};

export type SendMessageV2Options = {
  messages: V2Message[];
  user: V2User;
  clinicId?: string;
  contextData?: string;
};

export type SendMessageV2Result = {
  success: boolean;
  message: string;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    roundsUsed: number;
  };
};

/**
 * يبني كتلة "هوية المستخدم الحالي" التي تُحقن في system prompt.
 * بدونها الذكاء قد يخلط بين المستخدم وأطباء آخرين بنفس الدور.
 */
function buildUserIdentityBlock(user: V2User): string {
  const roleLabels: Record<string, string> = {
    super_admin: 'Super Admin',
    coordinator: 'Coordinator',
    team_leader: 'Team Leader',
    doctor: 'Doctor',
  };
  const roleLabel = roleLabels[user.role] || user.role;
  const clinicLine = user.clinicName
    ? `\n- Clinic: ${user.clinicName}${user.clinicId ? ` [clinic_id: ${user.clinicId}]` : ''}`
    : '';
  return (
    `\nCurrent signed-in user (the person you are talking to right now):\n` +
    `- Name: ${user.name}\n` +
    `- Role: ${roleLabel}\n` +
    `- User ID: ${user.id}${clinicLine}\n` +
    `\nWhen the user says "me", "I", "my schedule", they refer to this person. ` +
    `Use this ID to look them up. Do not confuse them with other staff who ` +
    `share their role.\n`
  );
}

/**
 * يبني "دفتر الأطباء" — كتلة نصّية تربط اسم كل طبيب بالـ id الخاص به،
 * وتُعلِّم الذكاء مَن هو تريني (يحتاج تحديد وضع) قبل البناء. بدونها كان
 * الذكاء يعرف الأسماء فقط فيخمّن الـ id ويفشل ثم يعيد المحاولة.
 *
 * يُحمّل بشكل lazy حتى لا يستورد supabase وقت الـ bundle (مهم لاختبارات Node).
 * عند أي فشل يرجّع سلسلة فارغة — السياق اختياري ولا يجب أن يكسر المحادثة.
 */
async function buildDoctorRosterBlock(clinicId: string): Promise<string> {
  try {
    const { loadDoctorRoster } = await import('../algorithms/schedule');
    const { doctors, error } = await loadDoctorRoster(clinicId);
    if (error || !doctors || doctors.length === 0) return '';

    const groupLabel: Record<string, string> = {
      group_a: 'A',
      group_b: 'B',
      board: 'Board',
    };
    const lines = doctors.map((d) => {
      const grp = groupLabel[d.groupTemplate.key] || d.groupTemplate.key;
      const tags: string[] = [`group ${grp}`];
      if (d.workStatus === 'trainee') tags.push('TRAINEE (needs mode before build)');
      else if (d.workStatus === 'light_duty') tags.push('light-duty');
      else if (d.workStatus === 'vacation') tags.push('on vacation');
      return `- ${d.name} [id: ${d.id}] — ${tags.join(' — ')}`;
    });

    return (
      `\nDoctors in your clinic (use the [id] whenever an action needs a ` +
      `specific doctor — never guess it):\n${lines.join('\n')}\n`
    );
  } catch {
    return '';
  }
}

/**
 * يحدّ المحادثة إلى أحدث 40 رسالة مع تثبيت الرسالة الأولى.
 * هذا يمنع فقدان النية الأصلية في المحادثات الطويلة.
 */
function truncateConversation(messages: V2Message[]): V2Message[] {
  if (messages.length <= 40) return messages;
  const anchor = messages[0];
  const tail = messages.slice(-(40 - 1));
  return [anchor, ...tail];
}

export async function sendMessageV2(
  opts: SendMessageV2Options,
): Promise<SendMessageV2Result> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      success: false,
      message: '',
      error: 'API key not configured.',
    };
  }

  try {
    // Layered system prompt — كل طبقة لها cache key مستقل.
    // أول رسالة في الجلسة تكتب الكاش، الباقي يقرأ منه.
    const systemBlocks: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text: CORE_PROMPT_V2,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
      {
        type: 'text',
        text: TEAM_LEADER_PROMPT_V2,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
      {
        type: 'text',
        text: CATALOG_V2,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
      {
        type: 'text',
        text: buildUserIdentityBlock(opts.user),
      },
    ];

    // دفتر الأطباء (اسم ↔ id ↔ تريني) — يُجلب من DB حسب عيادة المستخدم.
    // اختياري: عند الفشل يرجّع فارغاً ولا يُحقن.
    if (opts.clinicId) {
      const rosterBlock = await buildDoctorRosterBlock(opts.clinicId);
      if (rosterBlock) {
        systemBlocks.push({ type: 'text', text: rosterBlock });
      }
    }

    if (opts.contextData) {
      systemBlocks.push({
        type: 'text',
        text: `\nCurrent runtime context (filtered by user permissions):\n${opts.contextData}`,
      });
    }

    const conversation: Array<Record<string, unknown>> = truncateConversation(
      opts.messages,
    ).map((m) => ({ role: m.role, content: m.content }));

    const toolCtx: V2ToolContext = {
      clinicId: opts.clinicId || '',
      user: opts.user,
    };

    const toolsEnabled = V2_TOOLS.length > 0;
    let allText = '';
    let inputTokensTotal = 0;
    let outputTokensTotal = 0;
    let roundsUsed = 0;
    let lastStopReason: string | undefined;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
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
          model: DEFAULT_MODEL,
          max_tokens: MAX_TOKENS,
          system: systemBlocks,
          tools: toolsEnabled ? V2_TOOLS : undefined,
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
      inputTokensTotal += data.usage?.input_tokens ?? 0;
      outputTokensTotal += data.usage?.output_tokens ?? 0;

      // eslint-disable-next-line no-console
      console.log(
        `[AI V2 round ${round + 1}] stop=${data.stop_reason} ` +
          `in=${data.usage?.input_tokens ?? '?'} out=${data.usage?.output_tokens ?? '?'}`,
      );

      const toolResults: Array<Record<string, unknown>> = [];
      // نصّ هذه الجولة وحدها. النصّ قبل استدعاء أداة = تمهيد ("سأبني الآن…")
      // يُهمَل؛ نُبقي فقط نصّ الجولة المنهية (الإجابة النهائية) لمنع التصاق
      // التمهيد بالنتيجة في رسالة المستخدم.
      let roundText = '';

      for (const block of data.content || []) {
        if (block.type === 'text') {
          roundText += block.text;
          // eslint-disable-next-line no-console
          console.log(
            `[AI V2 round ${round + 1}] TEXT:`,
            block.text.slice(0, 300),
          );
        } else if (block.type === 'tool_use' && toolsEnabled) {
          const result = await dispatchV2Tool(block.name, block.input, toolCtx);
          // eslint-disable-next-line no-console
          console.log(
            `[AI V2 round ${round + 1}] TOOL ${block.name} →`,
            result.slice(0, 200),
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      // انتهاء الدورة: لا أدوات → هذه الجولة هي الإجابة النهائية
      if (data.stop_reason !== 'tool_use' || toolResults.length === 0) {
        allText = roundText;
        break;
      }

      // ارجع للذكاء بنتائج الأدوات
      conversation.push({ role: 'assistant', content: data.content });
      conversation.push({ role: 'user', content: toolResults });
    }

    if (!allText.trim()) {
      const reason =
        roundsUsed >= MAX_TOOL_ROUNDS
          ? `تجاوزت ${MAX_TOOL_ROUNDS} جولات أدوات.`
          : lastStopReason === 'max_tokens'
            ? 'الرد كان طويلاً وانقطع.'
            : 'الذكاء انتهى بدون رد نصي.';
      return {
        success: false,
        message: '',
        error: reason,
      };
    }

    return {
      success: true,
      message: allText,
      usage: {
        inputTokens: inputTokensTotal,
        outputTokens: outputTokensTotal,
        roundsUsed,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: '',
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}
