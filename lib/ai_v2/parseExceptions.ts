// ═══════════════════════════════════════════════════════════════
// مُفسِّر الاستثناءات — parseExceptions
// ═══════════════════════════════════════════════════════════════
// يأخذ نصّ الاستثناءات الحرّ الذي يكتبه التيم ليدر (تفرّغ/مرضية/إجازة،
// أيام عطلة، "بدون دليقيتر") + قائمة الأطباء (id/name)، ويُرجِع بنية
// منظَّمة يفهمها مُحرّك البناء. الذكاء هنا "مُترجِم" فقط: يحوّل اللغة
// الطبيعية إلى حقول؛ كل القرارات والتوزيع تبقى للخوارزمية الحتميّة.
//
// (المايسترو: الخوارزمية تعمل، الذكاء يفسّر المُدخَل البشري فقط)
// ═══════════════════════════════════════════════════════════════

import type { ExtraAbsence, ExtraPermission, WeekDay } from '../algorithms/schedule';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const getApiKey = () => process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '';
const MODEL = 'claude-haiku-4-5-20251001';

export type RosterEntry = { id: string; name: string };

/**
 * اسم غامض/مكرّر يطابق أكثر من طبيب — يحتاج تأكيد المستخدم. يحمل كلّ معلومات
 * الاستثناء كي يتحوّل (عند اختيار المرشّح) إلى غياب/استئذان كامل.
 */
export type Clarification = {
  mention: string;                          // الاسم كما كتبه المستخدم
  kind: 'absence' | 'permission';
  day: WeekDay;
  scope?: 'full' | 'morning' | 'evening';   // للغياب
  permKind?: 'start' | 'end';               // للاستئذان
  candidates: RosterEntry[];                // المرشّحون المحتملون (طبيبان فأكثر)
};

/** غموض بعد اختيار المستخدم للطبيب الصحيح → يتحوّل إلى غياب/استئذان في البناء */
export type ResolvedClarification = { clar: Clarification; doctorId: string };

export type ParsedExceptions = {
  /** الدليقيتر: false إذا طلب التيم ليدر التوزيع بدونه */
  delegatorEnabled: boolean;
  /** أيام العطل الرسمية (لا تُوزّع) */
  holidayDays: WeekDay[];
  /** غيابات الأطباء المُدخَلة كاستثناءات */
  extraAbsences: ExtraAbsence[];
  /** استئذانات جزئيّة (بداية/نهاية) — حضور فترة واحدة من الشفت */
  extraPermissions: ExtraPermission[];
  /** أسماء غامضة/مكرّرة تحتاج تأكيد المستخدم (يسأل الذكاء: من تقصد؟) */
  clarifications: Clarification[];
  /** ملاحظات لم يستطع المُفسِّر تحويلها لحقل (تُعرَض للتيم ليدر للمراجعة) */
  unresolved: string[];
};

const EMPTY: ParsedExceptions = {
  delegatorEnabled: true,
  holidayDays: [],
  extraAbsences: [],
  extraPermissions: [],
  clarifications: [],
  unresolved: [],
};

const VALID_DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];

// أداة مُجبَرة لإخراج JSON منظَّم
const TOOL = {
  name: 'report_exceptions',
  description: 'يُسجّل الاستثناءات المُستخرَجة من نصّ التيم ليدر بصيغة منظَّمة.',
  input_schema: {
    type: 'object',
    properties: {
      delegatorEnabled: {
        type: 'boolean',
        description: 'false فقط إذا طلب صراحةً التوزيع بدون دليقيتر/Delegators. الافتراضي true.',
      },
      holidayDays: {
        type: 'array',
        items: { type: 'string', enum: VALID_DAYS },
        description: 'أيام العطل الرسمية لهذا الأسبوع (الأحد..الخميس).',
      },
      extraAbsences: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            doctorId: { type: 'string', description: 'معرّف الطبيب من قائمة الأطباء المُعطاة.' },
            day: { type: 'string', enum: VALID_DAYS },
            scope: {
              type: 'string',
              enum: ['full', 'morning', 'evening'],
              description: 'full=اليوم كامل، أو شفت محدد إن ذُكر صباحاً/مساءً.',
            },
          },
          required: ['doctorId', 'day', 'scope'],
        },
        description: 'غياب طبيب (تفرّغ/مرضية/إجازة) ليوم محدد.',
      },
      extraPermissions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            doctorId: { type: 'string', description: 'معرّف الطبيب من قائمة الأطباء المُعطاة.' },
            day: { type: 'string', enum: VALID_DAYS },
            kind: {
              type: 'string',
              enum: ['start', 'end'],
              description: 'start=استئذان بداية (يأتي متأخّراً، غائب أول فترة). end=استئذان نهاية (يخرج مبكّراً، غائب آخر فترة). "استئذان" بلا تحديد → end.',
            },
          },
          required: ['doctorId', 'day', 'kind'],
        },
        description: 'استئذان جزئيّ: حضور فترة واحدة فقط من الشفت (ليس غياباً كاملاً).',
      },
      clarifications: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            mention: { type: 'string', description: 'الاسم كما ورد في النصّ (الغامض/المكرّر).' },
            kind: { type: 'string', enum: ['absence', 'permission'] },
            day: { type: 'string', enum: VALID_DAYS },
            scope: { type: 'string', enum: ['full', 'morning', 'evening'], description: 'للغياب فقط.' },
            permKind: { type: 'string', enum: ['start', 'end'], description: 'للاستئذان فقط.' },
            candidateIds: { type: 'array', items: { type: 'string' }, description: 'معرّفات الأطباء المحتملين (اثنان فأكثر).' },
          },
          required: ['mention', 'kind', 'day', 'candidateIds'],
        },
        description: 'اسم غامض أو يطابق أكثر من طبيب (أسماء مكرّرة) — لا تخمّن، ضَعه هنا مع المرشّحين.',
      },
      unresolved: {
        type: 'array',
        items: { type: 'string' },
        description: 'أيّ جملة لم تُفهَم أو لم يُطابَق اسمها أيّ طبيب — تُنقَل كما هي.',
      },
    },
    required: ['delegatorEnabled', 'holidayDays', 'extraAbsences', 'extraPermissions', 'clarifications', 'unresolved'],
  },
} as const;

function buildPrompt(text: string, roster: RosterEntry[]): string {
  const rosterLines = roster.map((r) => `- ${r.name} (id: ${r.id})`).join('\n');
  return [
    'أنت تُحوّل ملاحظات استثناءات أسبوع العمل إلى حقول منظَّمة.',
    '',
    'قائمة الأطباء (طابِق الأسماء معها، واستخدم الـ id):',
    rosterLines || '(لا يوجد)',
    '',
    'قواعد:',
    '- يوم الأسبوع: الأحد=sunday, الاثنين=monday, الثلاثاء=tuesday, الأربعاء=wednesday, الخميس=thursday.',
    '- "تفرّغ" أو "مرضية" أو "إجازة" أو "غائب" ليوم → extraAbsences (scope=full ما لم يُذكر صباحاً/مساءً).',
    '- "استئذان" → extraPermissions (حضور فترة واحدة، ليس غياباً). "بداية"/"متأخّر"/"يأتي متأخّراً" → kind=start؛ "نهاية"/"يخرج مبكّراً"/"خروج بدري" → kind=end؛ "استئذان" بلا تحديد → kind=end.',
    '- "عطلة" أو "يوم عطلة" → holidayDays.',
    '- "بدون دليقيتر" أو "بلا delegators" → delegatorEnabled=false.',
    '- إذا طابق اسمٌ مذكور أكثر من طبيب (أسماء مكرّرة) أو كان غامضاً يحتمل عدّة أطباء: لا تخمّن، ولا تضعه في extraAbsences/extraPermissions؛ بل ضَعه في clarifications مع candidateIds (معرّفات المرشّحين) ونوعه (kind) ويومه (وscope للغياب أو permKind للاستئذان).',
    '- إن لم تجد أيّ طبيب مطابق لاسمٍ مذكور إطلاقاً، ضَع الجملة في unresolved ولا تخترع id.',
    '- إن كان النصّ فارغاً أو لا يحوي استثناءات، أرجِع القيم الافتراضية (delegatorEnabled=true، والباقي فارغ).',
    '- استدعِ report_exceptions دائماً.',
    '',
    'نصّ الاستثناءات:',
    text.trim() || '(فارغ)',
  ].join('\n');
}

/**
 * يُفسِّر نصّ الاستثناءات إلى بنية منظَّمة. عند غياب المفتاح أو فراغ النصّ
 * أو أيّ خطأ، يُرجِع القيم الافتراضية الآمنة (لا يُفشِل البناء).
 */
export async function parseExceptions(
  text: string,
  roster: RosterEntry[],
): Promise<ParsedExceptions> {
  const trimmed = (text || '').trim();
  if (!trimmed) return { ...EMPTY };

  const apiKey = getApiKey();
  if (!apiKey) return { ...EMPTY, unresolved: [trimmed] };

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: TOOL.name },
        messages: [{ role: 'user', content: buildPrompt(trimmed, roster) }],
      }),
    });

    if (!res.ok) return { ...EMPTY, unresolved: [trimmed] };
    const data = await res.json();
    const block = (data.content || []).find(
      (b: any) => b.type === 'tool_use' && b.name === TOOL.name,
    );
    if (!block?.input) return { ...EMPTY, unresolved: [trimmed] };

    return sanitize(block.input, roster);
  } catch {
    return { ...EMPTY, unresolved: [trimmed] };
  }
}

/** يُنقّي مخرجات النموذج: يتحقّق من الأيام والـ ids ويُسقِط غير الصالح */
function sanitize(raw: any, roster: RosterEntry[]): ParsedExceptions {
  const validIds = new Set(roster.map((r) => r.id));
  const dayOk = (d: any): d is WeekDay => VALID_DAYS.includes(d);

  const holidayDays = Array.isArray(raw.holidayDays)
    ? (raw.holidayDays.filter(dayOk) as WeekDay[])
    : [];

  const unresolved: string[] = Array.isArray(raw.unresolved)
    ? raw.unresolved.filter((s: any) => typeof s === 'string' && s.trim())
    : [];

  const extraAbsences: ExtraAbsence[] = [];
  if (Array.isArray(raw.extraAbsences)) {
    for (const e of raw.extraAbsences) {
      if (!e || !dayOk(e.day)) continue;
      const scope = e.scope === 'morning' || e.scope === 'evening' ? e.scope : 'full';
      if (!validIds.has(e.doctorId)) {
        // اسم لم يُطابَق بطبيب — انقله للمراجعة بدل اختراع توزيع
        unresolved.push(`غياب غير مُطابَق: ${e.doctorId ?? ''} (${e.day})`);
        continue;
      }
      extraAbsences.push({ doctorId: e.doctorId, day: e.day, scope });
    }
  }

  const extraPermissions: ExtraPermission[] = [];
  if (Array.isArray(raw.extraPermissions)) {
    for (const p of raw.extraPermissions) {
      if (!p || !dayOk(p.day)) continue;
      const kind = p.kind === 'start' ? 'start' : 'end'; // الافتراض: نهاية
      if (!validIds.has(p.doctorId)) {
        unresolved.push(`استئذان غير مُطابَق: ${p.doctorId ?? ''} (${p.day})`);
        continue;
      }
      extraPermissions.push({ doctorId: p.doctorId, day: p.day, kind });
    }
  }

  const byId = new Map(roster.map((r) => [r.id, r]));
  const clarifications: Clarification[] = [];
  if (Array.isArray(raw.clarifications)) {
    for (const c of raw.clarifications) {
      if (!c || !dayOk(c.day) || typeof c.mention !== 'string') continue;
      const candidates = (Array.isArray(c.candidateIds) ? c.candidateIds : [])
        .map((id: any) => byId.get(id))
        .filter((r: any): r is RosterEntry => !!r);
      if (candidates.length < 2) {
        // مرشّح واحد أو لا مرشّح → ليس غموضاً قابلاً للتأكيد، انقله للمراجعة
        unresolved.push(`اسم غير واضح: ${c.mention} (${c.day})`);
        continue;
      }
      const kind = c.kind === 'permission' ? 'permission' : 'absence';
      clarifications.push({
        mention: c.mention,
        kind,
        day: c.day,
        scope: kind === 'absence' ? (c.scope === 'morning' || c.scope === 'evening' ? c.scope : 'full') : undefined,
        permKind: kind === 'permission' ? (c.permKind === 'start' ? 'start' : 'end') : undefined,
        candidates,
      });
    }
  }

  return {
    delegatorEnabled: raw.delegatorEnabled !== false,
    holidayDays: Array.from(new Set(holidayDays)),
    extraAbsences,
    extraPermissions,
    clarifications,
    unresolved,
  };
}
