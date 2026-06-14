// ═══════════════════════════════════════════════════════════════
// AI V2 Tools — تعريفات الأدوات التي ينادي بها الذكاء الخوارزميات
// ═══════════════════════════════════════════════════════════════
// نمط: كل أداة هنا = wrapper بسيط حول خوارزمية من lib/algorithms/
//
// كيف نضيف أداة جديدة:
//   1. أضف تعريف JSON Schema في V2_TOOLS
//   2. أضف case في dispatchV2Tool ينادي الخوارزمية
//   3. حدّث lib/ai_v2/catalog.md ليعرفها الذكاء
//   4. شغّل: node scripts/build-ai-v2.js
// ═══════════════════════════════════════════════════════════════

// schedule محمّل بشكل lazy حتى لا يستورد supabase وقت الـ bundle
// (مهم لاختبارات Node — راجع scripts/test-ai-v2.ts)
import type {
  ScheduleBuildInput, WeekDay,
  AssignedSlot, PreviewAbsence, PermissionMarker, AbsenceMarker,
} from '../algorithms/schedule';
import { KNOWLEDGE_INDEX, KNOWLEDGE_DOCS } from './_compiled';

/**
 * حزمة معاينة جدول تُمرَّر من أداة build_schedule (في وضع dryRun) إلى الواجهة
 * كي تعرض صفحة المعاينة وتحفظ ما يراه المستخدم بالضبط (saveSlots). تحمل:
 *  - slots/absences: للرسم (نفس ما يعرضه المعالج Wizard).
 *  - permissions/absenceMarkers: علامات منظَّمة (مع خانة EX) للحفظ.
 */
export type SchedulePreview = {
  weekStart: string;
  clinicId: string;
  slots: AssignedSlot[];
  absences: PreviewAbsence[];
  clinicCount: number;
  summary: string;
  warnings: string[];
  permissions: PermissionMarker[];
  absenceMarkers: AbsenceMarker[];
};

const WEEK_DAYS_LIST: WeekDay[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday',
];

/**
 * عرض إبلاغ بعد تسجيل الطبيب غيابه لنفسه: الواجهة تعرض أزرار
 * [الشفت] [المركز] [لا داعي] وتنفّذ الضغط **بالكود مباشرةً** (announceAbsence) —
 * النموذج لا يسأل ولا يشارك في هذه الخطوة إطلاقًا (مبدأ المايسترو).
 */
export type AnnounceOffer = {
  weekStart: string;
  day: string;
  /** نصّ الإبلاغ الجاهز (يُرسَل كما هو عند اختيار الشفت/المركز) */
  message: string;
  /** صاحب الغياب (يُستثنى من المستلمين ويحدّد قروب الشفت) */
  subjectId: string;
  subjectName: string;
};

/**
 * عرض أزرارٍ بعد أداة التبديل (تُنفَّذ بالكود مباشرةً — النموذج لا يسأل):
 *  • ask_mode: القائد طرفٌ في التبديل → [أرسل طلبًا] أو [بدّل مباشرة].
 *  • offer_notify: القائد بدّل اثنين → [أبلغهما] أو [لا داعي].
 *  • permission_fix: استأذن وهو يستلم وقت استئذانه → اقتراحات تبديل فترته:
 *    [زميل عيادته] / [كلّ الفترة المكمّلة] / [الشفت الآخر] (الأخير قبل اليوم بيومٍ فأكثر).
 */
export type SwapOffer =
  | { kind: 'ask_mode'; weekStart: string; day: string; target: { id: string; name: string } }
  | {
    kind: 'offer_notify'; weekStart: string; day: string;
    a: { id: string; name: string }; b: { id: string; name: string };
  }
  | {
    kind: 'permission_fix'; weekStart: string; day: string;
    blocked: number[];                        // الفترات التي يحجبها الاستئذان
    colleague?: { id: string; name: string }; // زميل نفس العيادة بالفترة المكمّلة
    period?: number;                          // الفترة المكمّلة — هدف «كلّ الفترة»
    otherShift: boolean;                      // يُعرض «الشفت الآخر» (يومٌ فأكثر قبل الموعد)
    statusAr?: string;                        // «استئذان نهاية الدوام» — لكرت القائد عند التصعيد
    leaderIds?: string[];                     // قادة العيادة — للتصعيد إن رفض الشفتان
  };

export type V2Tool = {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type V2ToolContext = {
  clinicId: string;
  user: {
    id: string;
    name: string;
    role: string;
    clinicId?: string;
    clinicName?: string;
  } | null;
  /** دفتر الأطباء مرتّباً (نفس ترتيب العرض المرقّم للذكاء) — لترجمة doctorIndex → id.
   *  groupKey (group_a/group_b/board/…) يُستعمل لحساب خانة EX الصحيحة للغياب/الاستئذان. */
  roster?: { id: string; name: string; groupKey?: string }[];
  /** تُستدعى عند بناء معاينة (dryRun) — تُمرّر الحزمة للواجهة لتعرضها وتحفظها */
  onPreview?: (preview: SchedulePreview) => void;
  /** تُستدعى بعد تسجيل غيابٍ ذاتيّ — الواجهة تعرض أزرار الإبلاغ وتنفّذها بالكود */
  onAnnounceOffer?: (offer: AnnounceOffer) => void;
  /** تُستدعى بعد أداة التبديل حين يلزم قرارٌ من القائد — أزرارٌ تُنفَّذ بالكود */
  onSwapOffer?: (offer: SwapOffer) => void;
};

/**
 * قائمة الأدوات التي يراها الذكاء.
 * كل أداة wrapper حول خوارزمية في lib/algorithms/.
 */
export const V2_TOOLS: V2Tool[] = [
  {
    name: 'build_schedule',
    description:
      'يبني جدول دوام أسبوع كامل لعيادة التيم ليدر. لا تستدعِها بدون ' +
      'تأكيد المستخدم على بداية الأسبوع وتوزيع الشفتات وإعدادات البورد. ' +
      'الإخراج: ملخّص يحوي عدد الخانات، الأطباء المُعيّنين، الغيابات المُحترمة، التحذيرات.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: {
          type: 'string',
          description:
            'بداية الأسبوع — يجب أن تكون يوم أحد بصيغة YYYY-MM-DD',
        },
        aShiftPlan: {
          type: 'object',
          description:
            'شفت قروب A لكل يوم (قروب B يأخذ العكس). القيم: "morning" أو "evening".',
          properties: {
            sunday:    { type: 'string', enum: ['morning', 'evening'] },
            monday:    { type: 'string', enum: ['morning', 'evening'] },
            tuesday:   { type: 'string', enum: ['morning', 'evening'] },
            wednesday: { type: 'string', enum: ['morning', 'evening'] },
            thursday:  { type: 'string', enum: ['morning', 'evening'] },
          },
          required: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
        },
        boardConfig: {
          type: 'object',
          description: 'إعدادات قروب البورد لهذا الأسبوع.',
          properties: {
            scenarioKind: {
              type: 'string',
              enum: [
                'separate_schedule',
                'all_morning',
                'all_evening',
                'hybrid_evening_days',
              ],
              description:
                'separate_schedule=دوام منفصل | all_morning=كل الأسبوع صباحاً | ' +
                'all_evening=كل الأسبوع مساءً | hybrid_evening_days=أيام محددة مساءً. ' +
                'توزيع البورد داخل الشفت تلقائي: 2+ بورد يشاركون عيادة، 1 بورد يصير عادي.',
            },
            eveningDays: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
              },
              description: 'فقط لو scenarioKind=hybrid_evening_days',
            },
            includeInExRotation: {
              type: 'boolean',
              description:
                'هل يدخل البورد في تدوير الاحتياطي؟ ' +
                '(الدليقيتر مستثنى دائماً — الليدر يضيفهم يدوياً)',
            },
          },
          required: ['scenarioKind', 'includeInExRotation'],
        },
        holidayDays: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
          },
          description: 'أيام عطل رسمية لا تُوزّع (اختياري).',
        },
        traineeModes: {
          type: 'object',
          description:
            'وضع كل تريني (key = رقم الطبيب من القائمة doctorIndex كنصّ): "independent" يوزّع كطبيب عادي، ' +
            '"beginner" يلتصق بالمدرّب نفس العيادة. اختياري.',
          additionalProperties: {
            type: 'string',
            enum: ['independent', 'beginner'],
          },
        },
        doctorPreferences: {
          type: 'object',
          description:
            'تفضيلات أطباء محددين (key = رقم الطبيب من القائمة doctorIndex كنصّ). القيم: ' +
            'always_morning، always_evening، always_first_period، always_second_period. اختياري.',
          additionalProperties: {
            type: 'string',
            enum: [
              'always_morning',
              'always_evening',
              'always_first_period',
              'always_second_period',
            ],
          },
        },
        delegatorEnabled: {
          type: 'boolean',
          description: 'false = ابنِ بدون دليقيتر هذا الأسبوع. افتراضي true.',
        },
        traineeOptions: {
          type: 'object',
          description:
            'خيارات التريني المستقلّ (key = رقم الطبيب من القائمة doctorIndex كنصّ): هل يدخل دورة الدليقيتر/الاحتياطي. ' +
            'للمستقلّ فقط. اختياري.',
          additionalProperties: {
            type: 'object',
            properties: {
              inDelegator: { type: 'boolean' },
              inReserve: { type: 'boolean' },
            },
          },
        },
        extraAbsences: {
          type: 'array',
          description: 'غيابات استثنائية (تفرّغ/مرضية) ليوم محدد. اختياري.',
          items: {
            type: 'object',
            properties: {
              doctorIndex: { type: 'integer', description: 'رقم الطبيب من القائمة المرقّمة.' },
              day: { type: 'string', enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] },
              scope: {
                type: 'string',
                enum: ['full', 'morning', 'evening'],
                description: 'full=اليوم كامل، أو شفت محدد إن ذُكر.',
              },
              status: {
                type: 'string',
                enum: ['vacation', 'sick_leave'],
                description: 'vacation=تفرّغ، sick_leave=مرضية/طبية. افتراضي vacation.',
              },
            },
            required: ['doctorIndex', 'day', 'scope', 'status'],
          },
        },
        extraPermissions: {
          type: 'array',
          description: 'استئذانات جزئية (حضور فترة واحدة، ليس غياباً). اختياري.',
          items: {
            type: 'object',
            properties: {
              doctorIndex: { type: 'integer', description: 'رقم الطبيب من القائمة المرقّمة.' },
              day: { type: 'string', enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] },
              kind: {
                type: 'string',
                enum: ['start', 'end'],
                description: 'start=بداية (يأتي متأخّراً)، end=نهاية (يخرج مبكّراً).',
              },
            },
            required: ['doctorIndex', 'day', 'kind'],
          },
        },
        extraShifts: {
          type: 'array',
          description:
            'نقل شفت ليوم/أيّام/الأسبوع كله: الطبيب يعمل أيّامه المذكورة في الشفت المحدد ' +
            '(ليس غياباً ولا استئذاناً). اختياري.',
          items: {
            type: 'object',
            properties: {
              doctorIndex: { type: 'integer', description: 'رقم الطبيب من القائمة المرقّمة.' },
              days: {
                type: 'array',
                items: { type: 'string', enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] },
                description: 'الأيّام التي ينتقل فيها (يوم أو أكثر؛ الأسبوع كله = الخمسة).',
              },
              shift: { type: 'string', enum: ['morning', 'evening'] },
            },
            required: ['doctorIndex', 'days', 'shift'],
          },
        },
        dryRun: {
          type: 'boolean',
          description:
            'true = يحسب ويرجّع الملخّص بدون كتابة في DB (للمعاينة). ' +
            'افتراضي false (يحفظ).',
        },
      },
      required: ['weekStart', 'aShiftPlan', 'boardConfig'],
    },
  },
  {
    name: 'read_schedule',
    description:
      'يقرأ جدول أسبوع محفوظ لعيادة المستخدم ويُرجِعه نصّاً مقروءاً ' +
      '(مَن في كل عيادة وفترة، الدليقيتر، الاحتياط، الغياب). ' +
      'استعمله للأسئلة التفصيليّة عن جدول قائم، لا للبناء.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: {
          type: 'string',
          description: 'بداية الأسبوع (يوم أحد) بصيغة YYYY-MM-DD.',
        },
      },
      required: ['weekStart'],
    },
  },
  {
    name: 'fetch_knowledge',
    description:
      'يجلب وثيقة مرجعيّة بالتفصيل (مفاهيم/تعريفات) عند الحاجة لشرح ' +
      'مفهوم أو الإجابة عن سؤال «لماذا/كيف». مرّر اسم الوثيقة (name) من ' +
      'الفهرس المعروض. لا تستعمله للنتائج الفعليّة — تلك من build/read.' +
      (KNOWLEDGE_INDEX.length
        ? ' الوثائق المتاحة: ' + KNOWLEDGE_INDEX.map((d) => d.name).join('، ') + '.'
        : ''),
    input_schema: {
      type: 'object',
      properties: {
        doc: {
          type: 'string',
          description: 'اسم الوثيقة من الفهرس (مثل glossary أو weekly_schedule).',
        },
      },
      required: ['doc'],
    },
  },
];

// ─── Helpers ─────────────────────────────────────────────────

/** يحوّل scenarioKind المسطّح إلى البنية المتداخلة للخوارزمية */
function buildBoardScenario(
  kind: string,
  eveningDays: string[] | undefined,
): ScheduleBuildInput['boardConfig']['scenario'] | null {
  switch (kind) {
    case 'separate_schedule':
      return { kind: 'separate_schedule' };
    case 'all_morning':
      return { kind: 'all_morning' };
    case 'all_evening':
      return { kind: 'all_evening' };
    case 'hybrid_evening_days': {
      const validDays = new Set<string>(WEEK_DAYS_LIST);
      const filtered = (eveningDays || []).filter((d) => validDays.has(d));
      return {
        kind: 'hybrid_evening_days',
        eveningDays: filtered as WeekDay[],
      };
    }
    default:
      return null;
  }
}

/** شفت البورد ليومٍ ما حسب سيناريو البورد — لحساب خانة EX الصحيحة لغياب طبيب بورد */
function boardShiftForDay(
  scenario: ScheduleBuildInput['boardConfig']['scenario'],
  day: WeekDay,
): 'morning' | 'evening' {
  switch (scenario.kind) {
    case 'all_evening':
      return 'evening';
    case 'hybrid_evening_days':
      return scenario.eveningDays.includes(day) ? 'evening' : 'morning';
    case 'all_morning':
    case 'separate_schedule':
    default:
      return 'morning';
  }
}

/** مترجم رقم الطبيب (doctorIndex، 1-based) → معرّفه، من دفتر السياق المرتّب */
type IdResolver = (n: unknown) => string | undefined;
function makeIdResolver(roster: { id: string; name: string }[] | undefined): IdResolver {
  const list = roster ?? [];
  return (n) => {
    const i = typeof n === 'number' ? n : parseInt(String(n), 10);
    return Number.isInteger(i) && i >= 1 && i <= list.length ? list[i - 1]!.id : undefined;
  };
}

/** يحوّل أوضاع التريني (key = doctorIndex كنصّ) إلى صيغة مفاتيحها doctor_id */
function normalizeTraineeModes(
  raw: unknown,
  idAt: IdResolver,
): ScheduleBuildInput['traineeModes'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, 'independent' | 'beginner'> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v !== 'independent' && v !== 'beginner') continue;
    const id = idAt(k);
    if (id) out[id] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** يحوّل تفضيلات الأطباء (key = doctorIndex كنصّ) إلى كائنات مفاتيحها doctor_id */
function normalizeDoctorPreferences(
  raw: unknown,
  idAt: IdResolver,
): ScheduleBuildInput['doctorPreferences'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: NonNullable<ScheduleBuildInput['doctorPreferences']> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (
      v === 'always_morning' ||
      v === 'always_evening' ||
      v === 'always_first_period' ||
      v === 'always_second_period'
    ) {
      const id = idAt(k);
      if (id) out[id] = { kind: v };
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const VALID_DAYS_SET = new Set<string>(WEEK_DAYS_LIST);
const isDay = (d: unknown): d is WeekDay => typeof d === 'string' && VALID_DAYS_SET.has(d);

/** يطبّع الغيابات الاستثنائية (doctorIndex → id) */
function normalizeExtraAbsences(raw: unknown, idAt: IdResolver): ScheduleBuildInput['extraAbsences'] {
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<ScheduleBuildInput['extraAbsences']> = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    if (!isDay(r.day)) continue;
    const id = idAt(r.doctorIndex);
    if (!id) continue;
    const scope = r.scope === 'morning' || r.scope === 'evening' ? r.scope : 'full';
    const status = r.status === 'sick_leave' ? 'sick_leave' : 'vacation';
    out.push({ doctorId: id, day: r.day, scope, status });
  }
  return out.length > 0 ? out : undefined;
}

/** يطبّع الاستئذانات الجزئية (doctorIndex → id) */
function normalizeExtraPermissions(raw: unknown, idAt: IdResolver): ScheduleBuildInput['extraPermissions'] {
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<ScheduleBuildInput['extraPermissions']> = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const r = p as Record<string, unknown>;
    if (!isDay(r.day)) continue;
    const id = idAt(r.doctorIndex);
    if (!id) continue;
    const kind = r.kind === 'start' ? 'start' : 'end';
    out.push({ doctorId: id, day: r.day, kind });
  }
  return out.length > 0 ? out : undefined;
}

/** يطبّع نقل الشفت (doctorIndex → id): يوسّع days[] إلى عناصر يوم-بيوم */
function normalizeExtraShifts(raw: unknown, idAt: IdResolver): ScheduleBuildInput['extraShifts'] {
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<ScheduleBuildInput['extraShifts']> = [];
  const seen = new Set<string>();
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const r = s as Record<string, unknown>;
    if (r.shift !== 'morning' && r.shift !== 'evening') continue;
    const id = idAt(r.doctorIndex);
    if (!id) continue;
    const days = Array.isArray(r.days) ? r.days.filter(isDay) : [];
    for (const day of days) {
      const k = `${id}|${day}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ doctorId: id, day, shift: r.shift });
    }
  }
  return out.length > 0 ? out : undefined;
}

/** يطبّع خيارات التريني المستقلّ (key = doctorIndex كنصّ → id) */
function normalizeTraineeOptions(raw: unknown, idAt: IdResolver): ScheduleBuildInput['traineeOptions'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: NonNullable<ScheduleBuildInput['traineeOptions']> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const id = idAt(k);
    if (!id) continue;
    const o = v as Record<string, unknown>;
    const entry: { inDelegator?: boolean; inReserve?: boolean } = {};
    if (typeof o.inDelegator === 'boolean') entry.inDelegator = o.inDelegator;
    if (typeof o.inReserve === 'boolean') entry.inReserve = o.inReserve;
    out[id] = entry;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * ينادي الخوارزمية المناسبة حسب اسم الأداة.
 * يرجّع نصاً يعود إلى الذكاء كـ tool_result.
 */
export async function dispatchV2Tool(
  name: string,
  input: unknown,
  ctx: V2ToolContext,
): Promise<string> {
  if (name === 'build_schedule') {
    return await handleBuildSchedule(input, ctx);
  }
  if (name === 'read_schedule') {
    return await handleReadSchedule(input, ctx);
  }
  if (name === 'fetch_knowledge') {
    return handleFetchKnowledge(input);
  }
  return `Tool error: unknown tool "${name}".`;
}

/** يُرجِع جسم وثيقة معرفة بالاسم، أو قائمة المتاح عند اسم غير معروف */
function handleFetchKnowledge(rawInput: unknown): string {
  const input = rawInput && typeof rawInput === 'object' ? (rawInput as Record<string, unknown>) : {};
  const doc = typeof input.doc === 'string' ? input.doc.trim() : '';
  const available = KNOWLEDGE_INDEX.map((d) => d.name).join('، ');
  if (!doc) return `Tool error: doc مطلوب. الوثائق المتاحة: ${available}.`;
  const body = KNOWLEDGE_DOCS[doc];
  if (body == null) {
    return `Tool error: لا توجد وثيقة باسم "${doc}". الوثائق المتاحة: ${available}.`;
  }
  return body;
}

const DAY_AR_READ: Record<string, string> = {
  sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس',
};
const STATUS_AR_READ: Record<string, string> = {
  vacation: 'VC', sick_leave: 'SL', permission_start: 'PS', permission_end: 'PE',
};

/** يقرأ جدولاً محفوظاً ويصوغه نصّاً مقروءاً ليجيب الذكاء عن الأسئلة التفصيليّة */
async function handleReadSchedule(rawInput: unknown, ctx: V2ToolContext): Promise<string> {
  if (!ctx.clinicId) return 'Tool error: لا توجد عيادة مرتبطة بالمستخدم الحالي.';
  const input = rawInput && typeof rawInput === 'object' ? (rawInput as Record<string, unknown>) : {};
  const weekStart = typeof input.weekStart === 'string' ? input.weekStart : '';
  if (!weekStart) return 'Tool error: weekStart مطلوب (يوم أحد YYYY-MM-DD).';

  const { schedule } = await import('../algorithms/schedule');
  const { slots, error } = await schedule.readWeekSlots(ctx.clinicId, weekStart);
  if (error) return `Tool error: ${error}`;
  if (!slots || slots.length === 0) return `لا يوجد جدول محفوظ لأسبوع ${weekStart}.`;

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
  const lines: string[] = [`جدول أسبوع ${weekStart}:`];
  for (const day of days) {
    const ds = slots.filter((s) => s.dayOfWeek === day);
    if (ds.length === 0) continue;
    lines.push(`${DAY_AR_READ[day]}:`);
    const clinicNums = [
      ...new Set(
        ds.filter((s) => s.role === 'clinic' && s.status === 'active' && s.clinicNumber > 0 && s.period > 0)
          .map((s) => s.clinicNumber),
      ),
    ].sort((a, b) => a - b);
    for (const c of clinicNums) {
      const cells = ds
        .filter((s) => s.role === 'clinic' && s.status === 'active' && s.clinicNumber === c && s.period > 0)
        .sort((a, b) => a.period - b.period);
      lines.push(`  عيادة ${c}: ${cells.map((s) => `ف${s.period}:${s.doctorName}`).join('، ')}`);
    }
    const dlg = ds.filter((s) => s.role === 'delegator' && s.status === 'active').sort((a, b) => a.period - b.period);
    if (dlg.length) lines.push(`  دليقيتر: ${dlg.map((s) => `ف${s.period}:${s.doctorName}`).join('، ')}`);
    // الاحتياط: الصيغة الموحّدة (status='extra') + الصيغة القديمة (role='ex')
    const ex = ds.filter(
      (s) => ((s.role as string) === 'ex' && s.status === 'active')
        || (s.status === 'extra' && s.period === 0),
    );
    if (ex.length) lines.push(`  احتياط: ${ex.map((s) => s.doctorName).join('، ')}`);
    const seen = new Set<string>();
    const abs = ds
      .filter((s) => s.status !== 'active' && s.status !== 'extra')
      .filter((s) => (seen.has(s.doctorId) ? false : (seen.add(s.doctorId), true)));
    if (abs.length) {
      lines.push(`  غياب/استئذان: ${abs.map((s) => `${s.doctorName}(${STATUS_AR_READ[s.status] ?? s.status})`).join('، ')}`);
    }
  }
  return lines.join('\n');
}

async function handleBuildSchedule(
  rawInput: unknown,
  ctx: V2ToolContext,
): Promise<string> {
  if (!ctx.clinicId) {
    return 'Tool error: لا توجد عيادة مرتبطة بالمستخدم الحالي.';
  }
  if (!rawInput || typeof rawInput !== 'object') {
    return 'Tool error: مدخلات build_schedule غير صالحة.';
  }
  const input = rawInput as Record<string, unknown>;

  const weekStart = typeof input.weekStart === 'string' ? input.weekStart : '';
  const aShiftPlan = input.aShiftPlan as ScheduleBuildInput['aShiftPlan'] | undefined;
  const board = input.boardConfig as
    | {
        scenarioKind?: string;
        eveningDays?: string[];
        includeInExRotation?: boolean;
      }
    | undefined;

  if (!weekStart || !aShiftPlan || !board || !board.scenarioKind) {
    return 'Tool error: weekStart و aShiftPlan و boardConfig.scenarioKind مطلوبة.';
  }

  const scenario = buildBoardScenario(board.scenarioKind, board.eveningDays);
  if (!scenario) {
    return `Tool error: scenarioKind غير معروف: ${board.scenarioKind}`;
  }

  // مترجم الأرقام → معرّفات، من دفتر السياق المرتّب (نفس ترتيب عرض الذكاء)
  const idAt = makeIdResolver(ctx.roster);

  const buildInput: ScheduleBuildInput = {
    weekStart,
    clinicId: ctx.clinicId,
    aShiftPlan,
    boardConfig: {
      scenario,
      includeInExRotation: board.includeInExRotation === true,
    },
    holidayDays: Array.isArray(input.holidayDays)
      ? (input.holidayDays as ScheduleBuildInput['holidayDays'])
      : undefined,
    traineeModes: normalizeTraineeModes(input.traineeModes, idAt),
    traineeOptions: normalizeTraineeOptions(input.traineeOptions, idAt),
    doctorPreferences: normalizeDoctorPreferences(input.doctorPreferences, idAt),
    delegatorEnabled: typeof input.delegatorEnabled === 'boolean' ? input.delegatorEnabled : undefined,
    extraAbsences: normalizeExtraAbsences(input.extraAbsences, idAt),
    extraPermissions: normalizeExtraPermissions(input.extraPermissions, idAt),
    extraShifts: normalizeExtraShifts(input.extraShifts, idAt),
    dryRun: input.dryRun === true,
  };

  try {
    // lazy import: يحمّل supabase فقط عند الاستدعاء الفعلي
    const { schedule } = await import('../algorithms/schedule');
    const result = await schedule.build(buildInput);

    // معاينة (dryRun): مرّر الحزمة للواجهة لتعرض صفحة المعاينة ويحفظ المستخدم منها.
    // نحسب علامات الغياب/الاستئذان بخانة EX الصحيحة (مثل المعالج Wizard).
    if (buildInput.dryRun && result.success && result.previewSlots && ctx.onPreview) {
      const nameAt = (id: string) => ctx.roster?.find((d) => d.id === id)?.name ?? '';
      const exCell = (doctorId: string, day: WeekDay): number => {
        const ov = (buildInput.extraShifts || []).find((s) => s.doctorId === doctorId && s.day === day);
        let shift: 'morning' | 'evening';
        if (ov) shift = ov.shift;
        else {
          const key = ctx.roster?.find((d) => d.id === doctorId)?.groupKey;
          const aShift = buildInput.aShiftPlan[day];
          if (key === 'group_b') shift = aShift === 'morning' ? 'evening' : 'morning';
          else if (key === 'board') shift = boardShiftForDay(buildInput.boardConfig.scenario, day);
          else shift = aShift; // group_a وغيره يتبع خطّة قروب A
        }
        return shift === 'morning' ? 1 : 2;
      };
      const permissions: PermissionMarker[] = (buildInput.extraPermissions || []).map((p) => ({
        doctorId: p.doctorId, doctorName: nameAt(p.doctorId), day: p.day, kind: p.kind,
        clinicNumber: exCell(p.doctorId, p.day),
      }));
      const absenceMarkers: AbsenceMarker[] = (buildInput.extraAbsences || []).map((a) => ({
        doctorId: a.doctorId, doctorName: nameAt(a.doctorId), day: a.day,
        status: a.status === 'sick_leave' ? 'sick_leave' : 'vacation',
        clinicNumber: exCell(a.doctorId, a.day),
      }));
      ctx.onPreview({
        weekStart: buildInput.weekStart,
        clinicId: ctx.clinicId,
        slots: result.previewSlots,
        absences: result.previewAbsences ?? [],
        clinicCount: result.clinicCount ?? 1,
        summary: result.summary,
        warnings: result.warnings,
        permissions,
        absenceMarkers,
      });
    }

    const lines: string[] = [];
    lines.push(`success: ${result.success}`);
    lines.push(`summary: ${result.summary}`);
    lines.push(`slotsCreated: ${result.slotsCreated}`);
    lines.push(`doctorsAssigned: ${result.doctorsAssigned}`);
    lines.push(`absencesRespected: ${result.absencesRespected}`);
    if (result.warnings.length > 0) {
      lines.push(`warnings:`);
      for (const w of result.warnings) lines.push(`  - ${w}`);
    }
    if (result.errors.length > 0) {
      lines.push(`errors:`);
      for (const e of result.errors) lines.push(`  - ${e}`);
    }
    return lines.join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Tool error: ${msg}`;
  }
}
