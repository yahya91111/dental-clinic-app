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
import { AI_PROXY_URL, aiProxyHeaders } from './proxy';

// نداء الذكاء يمرّ عبر وسيط Supabase (proxy.ts) — المفتاح على الخادم، لا في التطبيق.
const MODEL = 'claude-sonnet-5';

export type RosterEntry = { id: string; name: string };

/**
 * اسم غامض/مكرّر يطابق أكثر من طبيب — يحتاج تأكيد المستخدم. يحمل كلّ معلومات
 * الاستثناء كي يتحوّل (عند اختيار المرشّح) إلى غياب/استئذان كامل.
 */
export type Clarification = {
  mention: string;                          // الاسم كما كتبه المستخدم
  kind: 'absence' | 'permission';
  day?: WeekDay;                            // معلومٌ إن حدّده المستخدم؛ وإلّا يُسأل عنه (needsDay)
  needsDay?: boolean;                       // true إن لم يُذكر يومٌ صريح → نسأل «أيّ يوم؟»
  scope?: 'full' | 'morning' | 'evening';   // للغياب
  permKind?: 'start' | 'end';               // للاستئذان
  status?: 'vacation' | 'sick_leave';       // للغياب: نوعه (طبيّة/تفرّغ) — يُحفَظ ليُطبَّق بعد الحلّ
  candidates: RosterEntry[];                // المرشّحون: طبيبٌ واحدٌ (يومٌ ناقصٌ فقط) أو أكثر (اسمٌ مبهم)
};

/** بعد اختيار المستخدم (الطبيب الصحيح + اليوم) → يتحوّل إلى غياب/استئذان في البناء */
export type ResolvedClarification = { clar: Clarification; doctorId: string; day: WeekDay };

/** طلب مفهوم لكنّه خارج قدرات بناء الجدول — يُبلَّغ به المستخدم في الجات */
export type UnsupportedRequest = {
  request: string;  // الطلب كما ورد
  reason: string;   // سبب مختصر (عربيّ) يُعرَض للمستخدم
};

export type ParsedExceptions = {
  /** الدليقيتر: false إذا طلب التيم ليدر التوزيع بدونه (عامٌّ لكلّ القروبات) */
  delegatorEnabled: boolean;
  /** الدليقيتر لقروبٍ محدّد دون الآخر (مثال: «قروب A مع دليقيتر وقروب B بدونه») */
  delegatorGroups?: { group_a?: boolean; group_b?: boolean };
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

/** تطبيعُ اسمٍ عربيّ للمطابقةِ الحتميّة: إزالةُ التشكيل، توحيدُ الألف/التاء/الياء، وإسقاطُ بادئةِ «د.». */
function normName(s: string): string {
  return (s || '')
    .replace(/[ً-ْٰ]/g, '')                       // تشكيل
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/^\s*(د[\.\s]?|دكتور[ةه]?|الدكتور[ةه]?)\s*/, '')    // بادئة "د."/"دكتور"
    .replace(/\s+/g, ' ')
    .trim();
}

/** الأطباءُ الذين يطابقُ اسمُهم ما كتبه المستخدم (mention) — لكشفِ الاسمِ المكرّرِ حتميّاً. */
function matchRoster(mention: string, roster: RosterEntry[]): RosterEntry[] {
  const m = normName(mention);
  if (!m) return [];
  return roster.filter((r) => {
    const n = normName(r.name);
    return n === m || n.includes(m);
  });
}

// أداة مُجبَرة لإخراج JSON منظَّم
const TOOL = {
  name: 'report_exceptions',
  description: 'يُسجّل الاستثناءات المُستخرَجة من نصّ التيم ليدر بصيغة منظَّمة.',
  input_schema: {
    type: 'object',
    properties: {
      delegatorEnabled: {
        type: 'boolean',
        description: 'false فقط إذا طلب صراحةً التوزيع بدون دليقيتر/Delegators لكلّ القروبات. الافتراضي true. لقروبٍ محدّدٍ دون الآخر استعمل delegatorPerGroup بدلًا منه.',
      },
      delegatorPerGroup: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            group: { type: 'string', enum: ['group_a', 'group_b'], description: 'group_a=القروب الأول/A/أ، group_b=القروب الثاني/B/ب/الآخر.' },
            enabled: { type: 'boolean', description: 'true=مع دليقيتر لهذا القروب، false=بدونه.' },
          },
          required: ['group', 'enabled'],
        },
        description: 'الدليقيتر لقروبٍ محدّدٍ دون الآخر (مثال: «وزّع قروب A مع دليقيتر وقروب B بدونه»). استعمله فقط عند تحديد قروبٍ باسمه؛ للطلب العامّ استعمل delegatorEnabled.',
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
            mention: { type: 'string', description: 'اسم الطبيب **كما كتبه المستخدم بالضبط** (بلا زيادة). مطلوبٌ دائماً.' },
            doctorIndex: { type: 'integer', description: 'أفضل تخمينٍ لرقم الطبيب من القائمة (إن أمكن). النظام يتحقّق من التكرار بنفسه.' },
            daySpecified: { type: 'boolean', description: 'true فقط إذا ذكر المستخدم يوماً صريحاً. لا تخترع يوماً أبداً؛ إن لم يُذكر يومٌ ضَع false.' },
            day: { type: 'string', enum: VALID_DAYS, description: 'اليوم المذكور (فقط إن daySpecified=true).' },
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
          required: ['mention', 'daySpecified', 'scope', 'status'],
        },
        description: 'غياب طبيب (تفرّغ/مرضية/إجازة). ضَع mention والاسمَ كما كُتب، وdaySpecified، ولا تخترع يوماً.',
      },
      extraPermissions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            mention: { type: 'string', description: 'اسم الطبيب **كما كتبه المستخدم بالضبط**. مطلوبٌ دائماً.' },
            doctorIndex: { type: 'integer', description: 'أفضل تخمينٍ لرقم الطبيب من القائمة (إن أمكن).' },
            daySpecified: { type: 'boolean', description: 'true فقط إذا ذكر المستخدم يوماً صريحاً. لا تخترع يوماً؛ إن لم يُذكر ضَع false.' },
            day: { type: 'string', enum: VALID_DAYS, description: 'اليوم المذكور (فقط إن daySpecified=true).' },
            kind: {
              type: 'string',
              enum: ['start', 'end'],
              description: 'start=استئذان بداية (يأتي متأخّراً، غائب أول فترة). end=استئذان نهاية (يخرج مبكّراً، غائب آخر فترة). "استئذان" بلا تحديد → end.',
            },
          },
          required: ['mention', 'daySpecified', 'kind'],
        },
        description: 'استئذان جزئيّ: حضور فترة واحدة فقط من الشفت (ليس غياباً كاملاً). ضَع mention وdaySpecified ولا تخترع يوماً.',
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
    required: ['delegatorEnabled', 'holidayDays', 'extraAbsences', 'extraPermissions', 'extraShifts', 'unsupported', 'unresolved'],
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
    '(3) نقل شفت ليوم أو أكثر أو الأسبوع كله، (4) يوم عطلة، (5) إلغاء الدليقيتر (عامٌّ أو لقروبٍ محدّد). لا شيء غيرها.',
    'أيّ طلبٍ واضح خارج هذه القائمة (مثل: تحديد عدد فترات، منع طبيب من العمل مع آخر، تثبيت عيادة',
    'معيّنة، تغيير عدد العيادات، أيّ قيد آخر) ضَعه في unsupported مع سبب مختصر، ولا تحشره في حقلٍ آخر إطلاقاً.',
    '',
    'قواعد:',
    '- يوم الأسبوع: الأحد=sunday, الاثنين=monday, الثلاثاء=tuesday, الأربعاء=wednesday, الخميس=thursday.',
    '- "تفرّغ" أو "مرضية" أو "إجازة" أو "غائب" → extraAbsences (scope=full ما لم يُذكر صباحاً/مساءً).',
    '  • نوع الغياب (status): "مرضية/مرضيه/طبية/طبيه/إجازة مرضية" → status=sick_leave؛ "تفرّغ/متفرّغ/إجازة/غائب" → status=vacation. الافتراضي vacation.',
    '  • mention = الاسمُ كما كُتب بالضبط (مثلاً «فاطمة» أو «د. فاطمة»). ضَعه دائماً كما هو، حتى لو تكرّر.',
    '  • daySpecified: true فقط إن ذكر المستخدم يوماً صريحاً، وحينها ضَع day. **لا تخترع يوماً أبداً**؛ إن لم يُذكر يومٌ ضَع daySpecified=false واترك day. (النظامُ سيسأل المستخدمَ عن اليوم.)',
    '- "استئذان" → extraPermissions (حضور فترة واحدة، ليس غياباً). "بداية"/"متأخّر"/"يأتي متأخّراً" → kind=start؛ "نهاية"/"يخرج مبكّراً"/"خروج بدري" → kind=end؛ "استئذان" بلا تحديد → kind=end. (نفسُ قاعدةِ mention وdaySpecified: لا تخترع يوماً.)',
    '- نقل الشفت ("دوامه عصر/مساءً"، "دوامه صباح"، "حوّله للشفت الثاني"، "ثابت عصر/صبح هذا الأسبوع") → extraShifts: حدّد doctorIndex وshift وقائمة days بكل الأيام المقصودة.',
    '  • يوم واحد → days فيها يوم واحد. عدّة أيام ("الاثنين والثلاثاء") → كل الأيام في days. الأسبوع كله ("هذا الأسبوع"/"ثابت") → days=[sunday,monday,tuesday,wednesday,thursday].',
    '  • نقل الشفت ليس غياباً ولا تفرّغاً ولا استئذاناً أبداً — لا تضعه في extraAbsences مهما كان عدد الأيام.',
    '- "عطلة" أو "يوم عطلة" → holidayDays.',
    '- "بدون دليقيتر" أو "بلا delegators" (لكلّ القروبات) → delegatorEnabled=false.',
    '- تحديدُ الدليقيتر لقروبٍ باسمه دون الآخر → delegatorPerGroup. القروب الأول/A/أ=group_a، الثاني/B/ب/الآخر=group_b.',
    '  • مثال: «وزّع قروب A مع دليقيتر وقروب B بدونه» → delegatorPerGroup=[{group:"group_a",enabled:true},{group:"group_b",enabled:false}]. «قروب B بدون دليقيتر» فقط → [{group:"group_b",enabled:false}].',
    '  • لا تستعمل delegatorEnabled مع delegatorPerGroup إلّا إن ذُكر طلبٌ عامٌّ أيضًا.',
    '- doctorIndex: أفضلُ تخمينٍ لرقم الطبيب من القائمة (إن أمكن). لا يُهمّ إن تكرّر الاسم — **النظامُ يكتشف التكرار بنفسه من mention ويسأل المستخدمَ**، فلا تخمّن ولا تقلق بشأن التمييز؛ فقط ضَع mention الصحيح وأفضلَ تخمينٍ للرقم.',
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

  if (!AI_PROXY_URL) return { ...EMPTY, unresolved: [trimmed] };

  try {
    const res = await fetch(AI_PROXY_URL, {
      method: 'POST',
      headers: aiProxyHeaders(),
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

  // التوضيحات (مبهمُ الاسمِ أو ناقصُ اليوم) تُبنى حتميّاً من الغياب/الاستئذان أدناه.
  const clarifications: Clarification[] = [];

  const extraAbsences: ExtraAbsence[] = [];
  if (Array.isArray(raw.extraAbsences)) {
    for (const e of raw.extraAbsences) {
      if (!e) continue;
      const mention = typeof e.mention === 'string' ? e.mention.trim() : '';
      const scope = e.scope === 'morning' || e.scope === 'evening' ? e.scope : 'full';
      const status: 'sick_leave' | 'vacation' = e.status === 'sick_leave' ? 'sick_leave' : 'vacation';
      const daySpecified = e.daySpecified === true && dayOk(e.day);
      const day: WeekDay | undefined = daySpecified ? e.day : undefined;

      // المرشّحون: مطابقةُ الاسمِ حتميّاً (تكشفُ التكرار)؛ وإن لم يُطابِق شيءٌ نعودُ لتخمينِ النموذج.
      let candidates = mention ? matchRoster(mention, roster) : [];
      if (candidates.length === 0) { const g = entryAt(e.doctorIndex); if (g) candidates = [g]; }
      if (candidates.length === 0) {
        unresolved.push(`غياب غير مُطابَق: ${mention || `رقم ${e.doctorIndex ?? '?'}`}`);
        continue;
      }

      const ambiguous = candidates.length >= 2;   // اسمٌ مكرّر → «أيّ فلان؟»
      const needsDay = !daySpecified;              // لا يومَ صريح → «أيّ يوم؟»
      if (ambiguous || needsDay) {
        clarifications.push({ mention: mention || candidates[0]!.name, kind: 'absence', day, needsDay, scope, status, candidates });
        continue;
      }
      extraAbsences.push({ doctorId: candidates[0]!.id, day: day!, scope, status });
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
      if (!p) continue;
      const mention = typeof p.mention === 'string' ? p.mention.trim() : '';
      const permKind: 'start' | 'end' = p.kind === 'start' ? 'start' : 'end';
      const daySpecified = p.daySpecified === true && dayOk(p.day);
      const day: WeekDay | undefined = daySpecified ? p.day : undefined;

      let candidates = mention ? matchRoster(mention, roster) : [];
      if (candidates.length === 0) { const g = entryAt(p.doctorIndex); if (g) candidates = [g]; }
      if (candidates.length === 0) {
        unresolved.push(`استئذان غير مُطابَق: ${mention || `رقم ${p.doctorIndex ?? '?'}`}`);
        continue;
      }

      const ambiguous = candidates.length >= 2;
      const needsDay = !daySpecified;
      if (ambiguous || needsDay) {
        clarifications.push({ mention: mention || candidates[0]!.name, kind: 'permission', day, needsDay, permKind, candidates });
        continue;
      }
      extraPermissions.push({ doctorId: candidates[0]!.id, day: day!, kind: permKind });
    }
  }

  // الدليقيتر لكلّ قروب: نأخذ آخر قيمةٍ لكلّ قروبٍ مذكور (group_a/group_b)، ونتجاهل غير الصالح.
  let delegatorGroups: { group_a?: boolean; group_b?: boolean } | undefined;
  if (Array.isArray(raw.delegatorPerGroup)) {
    for (const g of raw.delegatorPerGroup) {
      if (!g || (g.group !== 'group_a' && g.group !== 'group_b') || typeof g.enabled !== 'boolean') continue;
      (delegatorGroups ||= {})[g.group as 'group_a' | 'group_b'] = g.enabled;
    }
  }

  return {
    delegatorEnabled: raw.delegatorEnabled !== false,
    delegatorGroups,
    holidayDays: Array.from(new Set(holidayDays)),
    extraAbsences,
    extraPermissions,
    extraShifts,
    clarifications,
    unsupported,
    unresolved,
  };
}
