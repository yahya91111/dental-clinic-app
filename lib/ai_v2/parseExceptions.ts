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

import type { ExtraAbsence, ExtraPermission, ExtraShift, WeekDay } from '../algorithms/schedule';

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

/** طلب مفهوم لكنّه خارج قدرات بناء الجدول — يُبلَّغ به المستخدم في الجات */
export type UnsupportedRequest = {
  request: string;  // الطلب كما ورد
  reason: string;   // سبب مختصر (عربيّ) يُعرَض للمستخدم
};

export type ParsedExceptions = {
  /** الدليقيتر: false إذا طلب التيم ليدر التوزيع بدونه */
  delegatorEnabled: boolean;
  /** أيام العطل الرسمية (لا تُوزّع) */
  holidayDays: WeekDay[];
  /** غيابات الأطباء المُدخَلة كاستثناءات */
  extraAbsences: ExtraAbsence[];
  /** استئذانات جزئيّة (بداية/نهاية) — حضور فترة واحدة من الشفت */
  extraPermissions: ExtraPermission[];
  /** نقل شفت ليوم واحد — الطبيب يعمل في شفت غير شفت قروبه ذلك اليوم */
  extraShifts: ExtraShift[];
  /** أسماء غامضة/مكرّرة تحتاج تأكيد المستخدم (يسأل الذكاء: من تقصد؟) */
  clarifications: Clarification[];
  /** طلبات مفهومة لكنها خارج قدرات بناء الجدول (يُبلَّغ بها في الجات) */
  unsupported: UnsupportedRequest[];
  /** ملاحظات لم يستطع المُفسِّر تحويلها لحقل (تُعرَض للتيم ليدر للمراجعة) */
  unresolved: string[];
};

const EMPTY: ParsedExceptions = {
  delegatorEnabled: true,
  holidayDays: [],
  extraAbsences: [],
  extraPermissions: [],
  extraShifts: [],
  clarifications: [],
  unsupported: [],
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
            doctorIndex: { type: 'integer', description: 'رقم الطبيب من القائمة المرقّمة (مثال: 3).' },
            day: { type: 'string', enum: VALID_DAYS },
            scope: {
              type: 'string',
              enum: ['full', 'morning', 'evening'],
              description: 'full=اليوم كامل، أو شفت محدد إن ذُكر صباحاً/مساءً.',
            },
            status: {
              type: 'string',
              enum: ['vacation', 'sick_leave'],
              description: 'sick_leave=مرضية/طبية/إجازة مرضية. vacation=تفرّغ/إجازة. الافتراضي vacation.',
            },
          },
          required: ['doctorIndex', 'day', 'scope', 'status'],
        },
        description: 'غياب طبيب (تفرّغ/مرضية/إجازة) ليوم محدد.',
      },
      extraPermissions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            doctorIndex: { type: 'integer', description: 'رقم الطبيب من القائمة المرقّمة (مثال: 3).' },
            day: { type: 'string', enum: VALID_DAYS },
            kind: {
              type: 'string',
              enum: ['start', 'end'],
              description: 'start=استئذان بداية (يأتي متأخّراً، غائب أول فترة). end=استئذان نهاية (يخرج مبكّراً، غائب آخر فترة). "استئذان" بلا تحديد → end.',
            },
          },
          required: ['doctorIndex', 'day', 'kind'],
        },
        description: 'استئذان جزئيّ: حضور فترة واحدة فقط من الشفت (ليس غياباً كاملاً).',
      },
      extraShifts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            doctorIndex: { type: 'integer', description: 'رقم الطبيب من القائمة المرقّمة (مثال: 3).' },
            days: {
              type: 'array',
              items: { type: 'string', enum: VALID_DAYS },
              description: 'كل الأيام التي ينتقل فيها (يوم أو أكثر؛ الأسبوع كله = الأيام الخمسة).',
            },
            shift: {
              type: 'string',
              enum: ['morning', 'evening'],
              description: 'الشفت الذي يعمله الطبيب تلك الأيام: صباح=morning، عصر/مساء=evening.',
            },
          },
          required: ['doctorIndex', 'days', 'shift'],
        },
        description: 'نقل شفت ليوم أو أكثر أو الأسبوع كله: الطبيب يعمل أيامه المذكورة كاملةً في الشفت المحدّد (نقل شفت، ليس غياباً ولا استئذاناً مطلقاً).',
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
            candidateIndexes: { type: 'array', items: { type: 'integer' }, description: 'أرقام الأطباء المحتملين من القائمة (اثنان فأكثر).' },
          },
          required: ['mention', 'kind', 'day', 'candidateIndexes'],
        },
        description: 'اسم غامض أو يطابق أكثر من طبيب (أسماء مكرّرة) — لا تخمّن، ضَعه هنا مع المرشّحين.',
      },
      unsupported: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            request: { type: 'string', description: 'الطلب كما ورد في النصّ.' },
            reason: { type: 'string', description: 'سبب مختصر بالعربيّة يُعرَض للمستخدم (مثلاً: غير مدعوم في بناء الجدول).' },
          },
          required: ['request', 'reason'],
        },
        description: 'طلب واضح ومفهوم لكنّه ليس ضمن العمليات المدعومة (انظر القائمة) — لا تحشره في حقل آخر.',
      },
      unresolved: {
        type: 'array',
        items: { type: 'string' },
        description: 'جملة غير مفهومة أو لم يُطابَق اسمها أيّ طبيب — تُنقَل كما هي (تختلف عن unsupported المفهوم).',
      },
    },
    required: ['delegatorEnabled', 'holidayDays', 'extraAbsences', 'extraPermissions', 'extraShifts', 'clarifications', 'unsupported', 'unresolved'],
  },
} as const;

function buildPrompt(text: string, roster: RosterEntry[]): string {
  const rosterLines = roster.map((r, i) => `${i + 1}. ${r.name}`).join('\n');
  return [
    'أنت تُحوّل ملاحظات استثناءات أسبوع العمل إلى حقول منظَّمة.',
    '',
    'قائمة الأطباء المرقّمة (طابِق الاسم المذكور معها، واستخدم الرقم في doctorIndex):',
    rosterLines || '(لا يوجد)',
    '',
    'العمليات المدعومة الوحيدة في بناء الجدول هي: (1) غياب تفرّغ/مرضية، (2) استئذان بداية/نهاية،',
    '(3) نقل شفت ليوم أو أكثر أو الأسبوع كله، (4) يوم عطلة، (5) إلغاء الدليقيتر. لا شيء غيرها.',
    'أيّ طلبٍ واضح خارج هذه القائمة (مثل: تحديد عدد فترات، منع طبيب من العمل مع آخر، تثبيت عيادة',
    'معيّنة، تغيير عدد العيادات، أيّ قيد آخر) ضَعه في unsupported مع سبب مختصر، ولا تحشره في حقلٍ آخر إطلاقاً.',
    '',
    'قواعد:',
    '- يوم الأسبوع: الأحد=sunday, الاثنين=monday, الثلاثاء=tuesday, الأربعاء=wednesday, الخميس=thursday.',
    '- "تفرّغ" أو "مرضية" أو "إجازة" أو "غائب" ليوم → extraAbsences (scope=full ما لم يُذكر صباحاً/مساءً).',
    '  • نوع الغياب (status): "مرضية/مرضيه/طبية/طبيه/إجازة مرضية" → status=sick_leave؛ "تفرّغ/متفرّغ/إجازة/غائب" → status=vacation. الافتراضي vacation.',
    '- "استئذان" → extraPermissions (حضور فترة واحدة، ليس غياباً). "بداية"/"متأخّر"/"يأتي متأخّراً" → kind=start؛ "نهاية"/"يخرج مبكّراً"/"خروج بدري" → kind=end؛ "استئذان" بلا تحديد → kind=end.',
    '- نقل الشفت ("دوامه عصر/مساءً"، "دوامه صباح"، "حوّله للشفت الثاني"، "ثابت عصر/صبح هذا الأسبوع") → extraShifts: حدّد doctorIndex وshift وقائمة days بكل الأيام المقصودة.',
    '  • يوم واحد → days فيها يوم واحد. عدّة أيام ("الاثنين والثلاثاء") → كل الأيام في days. الأسبوع كله ("هذا الأسبوع"/"ثابت") → days=[sunday,monday,tuesday,wednesday,thursday].',
    '  • نقل الشفت ليس غياباً ولا تفرّغاً ولا استئذاناً أبداً — لا تضعه في extraAbsences مهما كان عدد الأيام.',
    '- "عطلة" أو "يوم عطلة" → holidayDays.',
    '- "بدون دليقيتر" أو "بلا delegators" → delegatorEnabled=false.',
    '- استخدم دائماً رقم الطبيب من القائمة (doctorIndex)، وتأكّد أنّ الرقم يقابل الاسم المذكور تماماً. لا تستعمل أرقاماً ليست في القائمة.',
    '- إذا طابق اسمٌ مذكور أكثر من طبيب (أسماء مكرّرة) أو كان غامضاً يحتمل عدّة أطباء: لا تخمّن، ولا تضعه في extraAbsences/extraPermissions؛ بل ضَعه في clarifications مع candidateIndexes (أرقام المرشّحين) ونوعه (kind) ويومه (وscope للغياب أو permKind للاستئذان).',
    '- طلب مفهوم لكنّه خارج العمليات المدعومة → unsupported {request, reason}. سبب عربيّ مختصر (مثلاً: «غير مدعوم في بناء الجدول حاليّاً»).',
    '- إن لم تجد أيّ طبيب مطابق لاسمٍ مذكور إطلاقاً، ضَع الجملة في unresolved ولا تخترع رقماً.',
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

/** يُنقّي مخرجات النموذج: يترجم أرقام الأطباء إلى ids ويتحقّق من الأيام ويُسقِط غير الصالح */
function sanitize(raw: any, roster: RosterEntry[]): ParsedExceptions {
  const dayOk = (d: any): d is WeekDay => VALID_DAYS.includes(d);
  // النموذج يُرجِع رقم الطبيب (1-based) من القائمة — نترجمه هنا حتميّاً إلى id.
  // (لا نُحمّل النموذج نسخ UUID — نسخ الأرقام أدقّ بكثير.)
  const idxOk = (n: any): boolean => Number.isInteger(n) && n >= 1 && n <= roster.length;
  const entryAt = (n: any): RosterEntry | null => (idxOk(n) ? roster[n - 1]! : null);

  const holidayDays = Array.isArray(raw.holidayDays)
    ? (raw.holidayDays.filter(dayOk) as WeekDay[])
    : [];

  const unresolved: string[] = Array.isArray(raw.unresolved)
    ? raw.unresolved.filter((s: any) => typeof s === 'string' && s.trim())
    : [];

  const unsupported: UnsupportedRequest[] = Array.isArray(raw.unsupported)
    ? raw.unsupported
        .filter((u: any) => u && typeof u.request === 'string' && u.request.trim())
        .map((u: any) => ({
          request: u.request.trim(),
          reason: (typeof u.reason === 'string' && u.reason.trim()) || 'غير مدعوم في بناء الجدول حاليّاً.',
        }))
    : [];

  const extraAbsences: ExtraAbsence[] = [];
  if (Array.isArray(raw.extraAbsences)) {
    for (const e of raw.extraAbsences) {
      if (!e || !dayOk(e.day)) continue;
      const scope = e.scope === 'morning' || e.scope === 'evening' ? e.scope : 'full';
      const entry = entryAt(e.doctorIndex);
      if (!entry) {
        // رقم لم يُطابَق طبيباً — انقله للمراجعة بدل اختراع توزيع
        unresolved.push(`غياب غير مُطابَق: رقم ${e.doctorIndex ?? '?'} (${e.day})`);
        continue;
      }
      const status = e.status === 'sick_leave' ? 'sick_leave' : 'vacation';
      extraAbsences.push({ doctorId: entry.id, day: e.day, scope, status });
    }
  }

  const extraShifts: ExtraShift[] = [];
  const seenShift = new Set<string>();
  if (Array.isArray(raw.extraShifts)) {
    for (const s of raw.extraShifts) {
      if (!s || (s.shift !== 'morning' && s.shift !== 'evening')) continue;
      const entry = entryAt(s.doctorIndex);
      if (!entry) {
        unresolved.push(`نقل شفت غير مُطابَق: رقم ${s.doctorIndex ?? '?'}`);
        continue;
      }
      const days: WeekDay[] = (Array.isArray(s.days) ? s.days : []).filter(dayOk);
      if (days.length === 0) {
        unresolved.push(`نقل شفت بلا أيّام: ${entry.name}`);
        continue;
      }
      for (const day of days) {
        const k = `${entry.id}|${day}`;
        if (seenShift.has(k)) continue; // تفادي التكرار
        seenShift.add(k);
        extraShifts.push({ doctorId: entry.id, day, shift: s.shift });
      }
    }
  }

  const extraPermissions: ExtraPermission[] = [];
  if (Array.isArray(raw.extraPermissions)) {
    for (const p of raw.extraPermissions) {
      if (!p || !dayOk(p.day)) continue;
      const kind = p.kind === 'start' ? 'start' : 'end'; // الافتراض: نهاية
      const entry = entryAt(p.doctorIndex);
      if (!entry) {
        unresolved.push(`استئذان غير مُطابَق: رقم ${p.doctorIndex ?? '?'} (${p.day})`);
        continue;
      }
      extraPermissions.push({ doctorId: entry.id, day: p.day, kind });
    }
  }

  const clarifications: Clarification[] = [];
  if (Array.isArray(raw.clarifications)) {
    for (const c of raw.clarifications) {
      if (!c || !dayOk(c.day) || typeof c.mention !== 'string') continue;
      const candidates = (Array.isArray(c.candidateIndexes) ? c.candidateIndexes : [])
        .map((n: any) => entryAt(n))
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
    extraShifts,
    clarifications,
    unsupported,
    unresolved,
  };
}
