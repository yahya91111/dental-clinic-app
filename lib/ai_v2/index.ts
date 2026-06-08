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
  SCHEDULE_ASSISTANT_V2,
  REQUESTS_ASSISTANT_V2,
  CORE_PROMPT_V2,
  TEAM_LEADER_PROMPT_V2,
  DOCTOR_PROMPT_V2,
  KNOWLEDGE_INDEX,
} from './_compiled';
import { V2_TOOLS, dispatchV2Tool, type V2Tool, type V2ToolContext, type SchedulePreview } from './tools';
import { REQUESTS_TOOLS_V2, dispatchRequestToolV2 } from './tools_requests_v2';
export type { SchedulePreview } from './tools';

// ─── التوجيه بين المساعدين (جدول / طلبات) ───────────────────────
// مهمّة الإشعارات أُلغيت: التغطية والإشعارات صارت ضمن «الطلبات» (المحرّك يكتشف
// ويحسب، والذكاء يصوغ). طبقة الإرسال تبقى في lib/algorithms/notifications.ts.
export type V2Task = 'schedule' | 'requests';

type TaskBundle = {
  prompt: string;
  tools: V2Tool[];
  dispatch: (name: string, input: unknown, ctx: V2ToolContext) => Promise<string>;
};

const TASK_BUNDLES: Record<V2Task, TaskBundle> = {
  schedule: { prompt: SCHEDULE_ASSISTANT_V2, tools: V2_TOOLS, dispatch: dispatchV2Tool },
  requests: { prompt: REQUESTS_ASSISTANT_V2, tools: REQUESTS_TOOLS_V2, dispatch: dispatchRequestToolV2 },
};

// بوّابة تصنيف خفيفة للمحادثة الحرّة (بلا زرّ): تستنبط النيّة من آخر رسالة.
// الكلمات الواضحة تكفي؛ الافتراضي «جدول». (يمكن لاحقًا نداء نموذج للغموض.)
const REQUEST_HINTS = [
  'مرضي', 'طبي', 'استئذان', 'تفرّغ', 'تفرغ', 'اجاز', 'إجاز', 'تبديل', 'بدّل', 'بدل',
  'انقل', 'نقل القروب', 'عدد العياد', 'احتياط', 'تخفيف', 'متدرّب',
  // مسح/حذف/تفريغ الجدول (صياغات متعدّدة) — تقع في مهمّة الطلبات لا بناء الجدول
  'امسح', 'مسح الجدول', 'احذف', 'حذف الجدول', 'فرّغ', 'فرغ الجدول', 'الغِ الجدول', 'الغاء الجدول',
  // التغطية صارت ضمن الطلبات: النقص ومبادرة الليدر بنصّ حرّ
  'النقص يحتاج تغطية', 'تغطية', 'غطّي', 'غطي', 'يغطّي', 'يغطي', 'غطّها', 'غطها', 'تغطّي',
  'عيادة فاضية', 'عياده فاضيه', 'عيادة فارغة', 'عياده فارغه', 'فاضية', 'فارغة', 'نواقص', 'النواقص',
];
const SCHEDULE_HINTS = ['ابن الجدول', 'ابنِ الجدول', 'انشئ جدول', 'أنشئ جدول', 'وزّع', 'وزع', 'بناء الجدول', 'اعمل جدول', 'سوّ الجدول'];

function classifyTask(messages: V2Message[]): V2Task {
  // امسح رسائل المستخدم من الأحدث للأقدم؛ أوّل رسالة تحمل إشارة تحسم المهمّة.
  // هذا يُبقي المهمّة ثابتة عبر ردود التأكيد القصيرة («نعم/أكّد/تمام») التي لا
  // إشارة فيها — وإلّا عادت للافتراضيّ وضاع سياق الطلب عند التأكيد.
  const userMsgs = messages.filter((m) => m.role === 'user');
  for (let i = userMsgs.length - 1; i >= 0; i--) {
    const t = userMsgs[i]?.content ?? '';
    if (SCHEDULE_HINTS.some((h) => t.includes(h))) return 'schedule';
    if (REQUEST_HINTS.some((h) => t.includes(h))) return 'requests';
  }
  return 'schedule';
}

function resolveTask(opts: SendMessageV2Options): V2Task {
  // التوجيه الصريح من سياق الواجهة (زرّ/كرت) مقدَّم على التصنيف الحرّ.
  if (opts.task === 'schedule' || opts.task === 'requests') return opts.task;
  return classifyTask(opts.messages);
}

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
  /** المهمّة: من زرّ الواجهة (schedule/requests). إن غابت → تُستنبط من النصّ. */
  task?: V2Task;
};

export type SendMessageV2Result = {
  success: boolean;
  message: string;
  error?: string;
  /** حزمة معاينة جدول (لو بنى الذكاء معاينة هذه الرسالة) — الواجهة تعرضها وتحفظها */
  preview?: SchedulePreview;
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
function buildDoctorRosterBlock(
  doctors: Array<{ name: string; groupTemplate: { key: string }; workStatus: string }>,
): string {
  const groupLabel: Record<string, string> = {
    group_a: 'A',
    group_b: 'B',
    board: 'Board',
  };
  const lines = doctors.map((d, i) => {
    const grp = groupLabel[d.groupTemplate.key] || d.groupTemplate.key;
    const tags: string[] = [`group ${grp}`];
    if (d.workStatus === 'trainee') tags.push('TRAINEE');
    else if (d.workStatus === 'light_duty') tags.push('light-duty');
    else if (d.workStatus === 'vacation') tags.push('on vacation');
    return `${i + 1}. ${d.name} — ${tags.join(' — ')}`;
  });

  return (
    `\nDoctors in your clinic (use the NUMBER as doctorIndex whenever an ` +
    `action needs a specific doctor — never invent it):\n${lines.join('\n')}\n`
  );
}

/**
 * يبني كتلة "تاريخ اليوم" — غير مُخزَّنة بالكاش (متغيّرة يوميًّا). يحتاجها الذكاء
 * ليحلّ «اليوم»، «غدًا»، «الخميس الجاي»، والتواريخ النسبيّة. أيام العمل أحد–خميس.
 */
function buildTodayBlock(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
  return (
    `\nToday's date: ${y}-${m}-${d} (${weekday}). ` +
    `Resolve "today", "tomorrow", "this/next <weekday>", and any relative date ` +
    `from it. Work days are Sunday–Thursday; the week starts on Sunday.\n`
  );
}

/**
 * يبني فهرس المعرفة — أسطر صغيرة (اسم + متى تُجلب) تُحقن في system prompt
 * كي يعرف الذكاء ما هي الوثائق المتاحة فيستدعي fetch_knowledge بالاسم عند
 * الحاجة. الأجسام نفسها لا تُحمّل إلا عند الجلب (توفير توكن). يتوسّع تلقائياً:
 * أيّ وثيقة جديدة في knowledge/ تظهر هنا بعد إعادة البناء.
 */
function buildKnowledgeIndexBlock(): string {
  if (!KNOWLEDGE_INDEX.length) return '';
  const lines = KNOWLEDGE_INDEX.map((d) => `- ${d.name}: ${d.when || d.title}`);
  return (
    `\nReference docs you can fetch on demand with fetch_knowledge ` +
    `(pass the name). Fetch one only when you need to explain a concept or ` +
    `answer a "why/how" question — never for actual schedule results:\n` +
    `${lines.join('\n')}\n`
  );
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

  // أيّ مساعد نُشغّل: من الزرّ (task) أو باستنباط من النصّ
  const task = resolveTask(opts);
  const bundle = TASK_BUNDLES[task];

  try {
    // Layered system prompt — كل طبقة لها cache key مستقل.
    // النواة + الدور مشتركان دائمًا (يبقيان مُخزَّنين)، وبلوك المساعد يتغيّر
    // حسب المهمّة ولكلّ مساعد كاشه الخاصّ.
    const systemBlocks: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text: CORE_PROMPT_V2,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
      {
        type: 'text',
        // طبقة الدور حسب دور المستخدم: الطبيب العاديّ يأخذ طبقته، ومن هو
        // قائد فأعلى يأخذ طبقة القيادة (الصلاحيّات تُفرض في الكود أيضًا).
        text: opts.user.role === 'doctor' ? DOCTOR_PROMPT_V2 : TEAM_LEADER_PROMPT_V2,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
      {
        type: 'text',
        text: bundle.prompt,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
    ];

    // فهرس المعرفة (ثابت، يُخزَّن بالكاش) — يخبر الذكاء بالوثائق المتاحة فقط
    const knowledgeIndexBlock = buildKnowledgeIndexBlock();
    if (knowledgeIndexBlock) {
      systemBlocks.push({
        type: 'text',
        text: knowledgeIndexBlock,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      });
    }

    systemBlocks.push({
      type: 'text',
      text: buildUserIdentityBlock(opts.user),
    });

    // تاريخ اليوم (غير مُخزَّن بالكاش — متغيّر) لحلّ التواريخ النسبيّة
    systemBlocks.push({
      type: 'text',
      text: buildTodayBlock(),
    });

    // دفتر الأطباء (مرقّم) — يُحمّل مرّة واحدة: يُعرَض بالأرقام للذكاء، ويُمرَّر
    // للأدوات كي تترجم الأرقام إلى معرّفات (لا نُحمّل الذكاء نسخ المعرّفات).
    let rosterForTools: { id: string; name: string; groupKey?: string }[] = [];
    if (opts.clinicId) {
      try {
        const { loadDoctorRoster } = await import('../algorithms/schedule');
        const { doctors } = await loadDoctorRoster(opts.clinicId);
        if (doctors && doctors.length > 0) {
          rosterForTools = doctors.map((d) => ({ id: d.id, name: d.name, groupKey: d.groupTemplate.key }));
          systemBlocks.push({ type: 'text', text: buildDoctorRosterBlock(doctors) });
        }
      } catch {
        /* عند الفشل: لا دفتر، ولا حقن */
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

    // آخر معاينة بناها الذكاء هذه الرسالة (تُرجَّع للواجهة لتعرضها وتحفظها)
    let capturedPreview: SchedulePreview | undefined;
    const toolCtx: V2ToolContext = {
      clinicId: opts.clinicId || '',
      user: opts.user,
      roster: rosterForTools,
      onPreview: (p) => { capturedPreview = p; },
    };

    const activeTools = bundle.tools;
    const toolsEnabled = activeTools.length > 0;
    // eslint-disable-next-line no-console
    console.log(`[AI V2] task=${task} (tools=${activeTools.length})`);
    let allText = '';
    let lastNonEmptyText = '';
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
          tools: toolsEnabled ? activeTools : undefined,
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
      // نصّ هذه الجولة وحدها. عادةً النصّ قبل أداة تمهيد ("سأبني الآن…") نتجاوزه،
      // لكن قد تحمل جولة الأداة الإجابة النهائية ("تمّ التسجيل") ثمّ تأتي جولة
      // فارغة بعدها — فنحتفظ بآخر نصّ غير فارغ لئلّا تضيع الإجابة.
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
          const result = await bundle.dispatch(block.name, block.input, toolCtx);
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

      // احتفظ بآخر نصّ غير فارغ عبر الجولات (قد يكون الإجابة النهائية)
      if (roundText.trim()) lastNonEmptyText = roundText;

      // انتهاء الدورة: لا أدوات → هذه الجولة هي الإجابة النهائية. إن كانت فارغة
      // فالإجابة جاءت في جولة الأداة السابقة → استعملها بدل ترك الردّ فارغًا.
      if (data.stop_reason !== 'tool_use' || toolResults.length === 0) {
        allText = roundText.trim() ? roundText : lastNonEmptyText;
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
      preview: capturedPreview,
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
