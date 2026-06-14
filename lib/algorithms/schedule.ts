// ═══════════════════════════════════════════════════════════════
// Schedule Algorithm — بناء الجدول الأسبوعي
// ═══════════════════════════════════════════════════════════════
// المايسترو (الذكاء) يجمع المدخلات من التيم ليدر، يستدعي هذه الدالة،
// وترجّع له ملخص الجدول. الخوارزمية حتمية وقابلة للاختبار.
//
// راجع PLAN_AI_MAESTRO.md للسياق الكامل.
// ═══════════════════════════════════════════════════════════════

import { supabase } from '../supabase';
import { getTemplateByName, type GroupTemplate } from './groupTemplates';
import { createWheels, distributeShiftWheel, applyExAbsence } from './wheel';

// ─── الأنواع الأساسية ─────────────────────────────────────────

export type WeekDay = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday';

export const WEEK_DAYS: WeekDay[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday',
];

export type Period = 1 | 2 | 3 | 4;

export type Shift = 'morning' | 'evening';

/** الفترات الصباحية والمسائية */
export const SHIFT_PERIODS: Record<Shift, Period[]> = {
  morning: [1, 2],
  evening: [3, 4],
};

/** أيّ شفت تخص الفترة */
export function shiftOfPeriod(p: Period): Shift {
  return p <= 2 ? 'morning' : 'evening';
}

// ─── إعدادات اللاعبين الرئيسيين ──────────────────────────────

/**
 * توزيع شفت قروب A لكل يوم. قروب B يأخذ العكس تلقائياً.
 * مثال: { sunday: 'morning', monday: 'morning', tuesday: 'evening', ... }
 */
export type AShiftPlan = Record<WeekDay, Shift>;

/**
 * سيناريوهات قروب البورد (يختار التيم ليدر متى يعمل البورد).
 *
 * - separate_schedule    : دوام منفصل تماماً (لا يدخل التوزيع العادي)
 * - all_morning          : كل الأسبوع صباحاً
 * - all_evening          : كل الأسبوع مساءً
 * - hybrid_evening_days  : أيام محددة مساءً والباقي صباحاً
 *
 * توزيع البورد داخل الشفت تلقائي:
 * - 2+ بورد → يتشاركون عيادة معاً (آخر عيادة، فترة لكل واحد)
 * - 1 بورد فقط → يُعامَل كطبيب عادي ويدخل التوزيع العادي
 *
 * إعداد إضافي:
 * - includeInExRotation : هل يدخل البورد في تدوير الاحتياطي؟
 *   (الدليقيتر مستثنى دائماً — التيم ليدر يضيفهم يدوياً بعد التوزيع)
 */
export type BoardConfig = {
  scenario:
    | { kind: 'separate_schedule' }
    | { kind: 'all_morning' }
    | { kind: 'all_evening' }
    | { kind: 'hybrid_evening_days'; eveningDays: WeekDay[] };
  includeInExRotation: boolean;
};

/**
 * وضع التريني لكل تريني (يحدّده التيم ليدر كل بناء).
 * - independent : يوزّع كطبيب عادي
 * - beginner    : ظل المدرّب (نفس عيادته نفس فتراته)
 */
export type TraineeMode = 'independent' | 'beginner';

/**
 * تفضيل طبيب يخرج من تدوير قروبه الطبيعي.
 *
 * - always_morning / always_evening : طبيب ثابت شفت معيّن طول الأسبوع.
 *   يُضاف للقروب الذي يعمل ذلك الشفت في كل يوم (شفت كروسر).
 * - always_first_period             : دائماً P1 (لو صباحي) أو P3 (لو مسائي)
 * - always_second_period            : دائماً P2 (لو صباحي) أو P4 (لو مسائي)
 */
export type DoctorPreference =
  | { kind: 'always_morning' }
  | { kind: 'always_evening' }
  | { kind: 'always_first_period' }
  | { kind: 'always_second_period' };

// ─── المدخلات للدالة الرئيسية ────────────────────────────────

/** غياب إضافيّ مُدخَل يدويًّا (استثناء) — يُطبَّق على يوم/شفت محدد دون كتابته في DB */
export type ExtraAbsence = {
  doctorId: string;
  day: WeekDay;
  /** 'full' = اليوم كاملاً (شفتان)، أو شفت محدد */
  scope: 'full' | Shift;
  /** نوع الغياب (للإحصاء فقط) — الافتراضي 'vacation' */
  status?: SlotStatus;
};

/** استئذان جزئيّ مُدخَل كاستثناء — حضور فترة واحدة من الشفت (ليس غياباً) */
export type ExtraPermission = {
  doctorId: string;
  day: WeekDay;
  /** start=استئذان بداية (غائب أول فترة) | end=استئذان نهاية (غائب آخر فترة) */
  kind: 'start' | 'end';
};

/**
 * نقل شفت ليوم واحد — الطبيب يعمل اليوم كاملاً لكن في شفت غير شفت قروبه
 * الطبيعي (مثال: "د يحيى الاثنين دوامه عصر"). ليس غياباً ولا استئذاناً.
 */
export type ExtraShift = {
  doctorId: string;
  day: WeekDay;
  shift: Shift;
};

export type ScheduleBuildInput = {
  /** بداية الأسبوع (يجب أن تكون يوم أحد) — صيغة YYYY-MM-DD */
  weekStart: string;

  /** معرّف العيادة */
  clinicId: string;

  /** توزيع شفتات قروب A لكل يوم (يقرّره التيم ليدر) */
  aShiftPlan: AShiftPlan;

  /** أيام العطل الرسمية (لا تُوزّع) */
  holidayDays?: WeekDay[];

  /** إعدادات البورد لهذا الأسبوع */
  boardConfig: BoardConfig;

  /** وضع كل تريني (key = doctor_id) */
  traineeModes?: Record<string, TraineeMode>;

  /**
   * خيارات التريني المستقلّ (key = doctor_id): هل يدخل دورة الدليقيتر/الاحتياطي.
   * الافتراضي (غياب المفتاح) = يدخل كأيّ طبيب عاديّ.
   */
  traineeOptions?: Record<string, { inDelegator?: boolean; inReserve?: boolean }>;

  /** تعطيل الدليقيتر لهذا الأسبوع (استثناء "بدون دليقيتر"). الافتراضي: مُفعّل */
  delegatorEnabled?: boolean;

  /**
   * غيابات إضافية يدخلها التيم ليدر كاستثناءات (تفرّغ/مرضية/إجازة ليوم محدد)
   * تُعامَل كالغياب المُسجَّل في DB لكنها لا تُكتب — تؤثّر على التوزيع فقط.
   */
  extraAbsences?: ExtraAbsence[];

  /**
   * استئذانات جزئيّة يدخلها التيم ليدر كاستثناءات — حضور فترة واحدة من الشفت.
   * تُعامَل كاستئذان PS/PE المُسجَّل في DB لكنها تأتي من نصّ الاستثناءات.
   */
  extraPermissions?: ExtraPermission[];

  /**
   * نقل شفت ليوم واحد (استثناء "دوامه عصر/صباح يوم كذا"): الطبيب يُسحَب من شفت
   * قروبه الطبيعي ويُوضَع في الشفت المذكور لذلك اليوم فقط.
   */
  extraShifts?: ExtraShift[];

  /** تفضيلات أطباء محددين (key = doctor_id) */
  doctorPreferences?: Record<string, DoctorPreference>;

  /** dryRun=true يحسب فقط، لا يكتب في DB */
  dryRun?: boolean;
};

// ─── المخرجات ─────────────────────────────────────────────────

/** متغيّب/متفرّغ لعرضه في صفّ "إضافي" بالمعاينة (لا يدخل التوزيع) */
export type PreviewAbsence = {
  day: WeekDay;
  doctorName: string;
  label: string;   // كود الحالة (VC/SL/PS/PE) أو "متفرّغ" للاستثناء اليدويّ
};

export type ScheduleBuildResult = {
  success: boolean;
  slotsCreated: number;
  doctorsAssigned: number;
  absencesRespected: number;
  warnings: string[];
  errors: string[];
  summary: string;
  previewSlots?: AssignedSlot[];   // الخانات المحسوبة (للمعاينة قبل الحفظ)
  previewAbsences?: PreviewAbsence[]; // المتغيّبون/المتفرّغون (صفّ إضافي بالمعاينة)
  clinicCount?: number;            // عدد العيادات (لرسم شبكة المعاينة)
};

// ─── تحميل البيانات (C2) ─────────────────────────────────────

export type DoctorWorkStatus = 'active' | 'vacation' | 'light_duty' | 'trainee';
// حالات الخانة كما تُخزَّن في DB (مطابقة لـ DoctorStatus في screens/Schedule/types.ts):
//   permission_start (PS) = متأخّر → غائب الفترة الأولى | permission_end (PE) = خروج مبكّر → غائب الثانية
//   PS/PE/extra تُخزَّن بـ period=0 (لا تُعدّ غيابَ يومٍ كامل)
export type SlotStatus =
  | 'active'
  | 'sick_leave'
  | 'permission_start'
  | 'permission_end'
  | 'vacation'
  | 'extra';
export type SlotRole = 'clinic' | 'delegator';

/** طبيب محمّل من قاعدة البيانات، مفلتر للقروبات الـ4 (templates) فقط */
export type LoadedDoctor = {
  id: string;
  name: string;
  groupTemplate: GroupTemplate;     // القالب الذي ينتمي له (AGD/A/B/Board)
  groupId: string;                  // معرّف القروب في DB
  workStatus: DoctorWorkStatus;
  supervisorDoctorId: string | null;
};

/** خانة جدول محمّلة من DB (للأسبوع الحالي أو السابقين) */
export type LoadedSlot = {
  id: string;
  weekStart: string;
  dayOfWeek: string;
  period: number;
  clinicNumber: number;
  doctorId: string;
  doctorName: string;
  role: SlotRole;
  status: SlotStatus;
};

/** كل ما تحتاجه الخوارزمية من DB */
export type LoadedData = {
  clinicCount: number;
  doctors: LoadedDoctor[];
  existingSlots: LoadedSlot[];      // الأسبوع الحالي (لاحترام الغيابات)
  pastSlots: LoadedSlot[];          // الأسبوع السابق (للعدالة — نافذة أسبوع)
};

/**
 * يحسب بداية أسبوع سابق (للقراءة من السجل).
 * @param weekStart 'YYYY-MM-DD' لأحد ما
 * @param weeksBack عدد الأسابيع للخلف
 */
function shiftWeekStart(weekStart: string, weeksBack: number): string {
  const parts = weekStart.split('-').map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 7 * weeksBack);
  return date.toISOString().slice(0, 10);
}

/**
 * يحمّل كل البيانات اللازمة من DB.
 * يفلتر الأطباء ليُبقي فقط الذين في القروبات الـ4 (templates).
 */
export async function loadScheduleData(
  clinicId: string,
  weekStart: string,
): Promise<{ data: LoadedData | null; error: string | null }> {
  // 1. عدد العيادات من schedule_settings
  const { data: settings, error: settingsErr } = await supabase
    .from('schedule_settings')
    .select('clinic_count')
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (settingsErr) {
    return { data: null, error: `فشل تحميل إعدادات العيادة: ${settingsErr.message}` };
  }
  const clinicCount = settings?.clinic_count;
  if (!clinicCount || clinicCount < 1) {
    return { data: null, error: 'عدد العيادات غير محدّد. اضبطه في الإعدادات.' };
  }

  // 2. القروبات + أعضاؤها (نفلتر للقوالب الأربعة فقط)
  const { data: groupsData, error: groupsErr } = await supabase
    .from('doctor_groups')
    .select('id, name, doctor_group_members(doctor_id, doctor_name, work_status, supervisor_doctor_id)')
    .eq('clinic_id', clinicId);
  if (groupsErr) {
    return { data: null, error: `فشل تحميل القروبات: ${groupsErr.message}` };
  }

  const doctors: LoadedDoctor[] = [];
  for (const g of (groupsData || []) as Array<{
    id: string;
    name: string;
    doctor_group_members?: Array<{
      doctor_id: string;
      doctor_name: string;
      work_status: string;
      supervisor_doctor_id: string | null;
    }>;
  }>) {
    const template = getTemplateByName(g.name);
    if (!template) continue;  // نتجاهل القروبات غير القوالب
    // AGD مستثنى نهائياً من توزيع الجداول (له طبيعة عمل مستقلة) — لا يُحمّل
    // أصلاً فلا يدخل البِرَك ولا عدّادات العدالة ولا تمهيد السجل.
    if (template.key === 'agd') continue;
    const members = g.doctor_group_members || [];
    for (const m of members) {
      doctors.push({
        id: m.doctor_id,
        name: m.doctor_name,
        groupTemplate: template,
        groupId: g.id,
        workStatus: (m.work_status as DoctorWorkStatus) || 'active',
        supervisorDoctorId: m.supervisor_doctor_id ?? null,
      });
    }
  }

  // 3. الخانات الموجودة في الأسبوع الحالي
  const { data: existing, error: existingErr } = await supabase
    .from('schedule_slots')
    .select('id, week_start, day_of_week, period, clinic_number, doctor_id, doctor_name, role, status')
    .eq('clinic_id', clinicId)
    .eq('week_start', weekStart);
  if (existingErr) {
    return { data: null, error: `فشل تحميل خانات الأسبوع: ${existingErr.message}` };
  }

  // 4. خانات الأسابيع السابقة (للعدالة) — نافذة أسبوعين متحرّكة.
  // أسبوعان ينعّمان التذبذب التراكمي، ويلتقطهما تمهيد «أقلّ من الأقران»
  // الذي يحمي العائد من الغياب الجزئي داخل النافذة.
  const windowStart = shiftWeekStart(weekStart, 2);
  const { data: past, error: pastErr } = await supabase
    .from('schedule_slots')
    .select('id, week_start, day_of_week, period, clinic_number, doctor_id, doctor_name, role, status')
    .eq('clinic_id', clinicId)
    .gte('week_start', windowStart)
    .lt('week_start', weekStart);
  if (pastErr) {
    return { data: null, error: `فشل تحميل سجل الأسبوع السابق: ${pastErr.message}` };
  }

  const mapSlot = (s: any): LoadedSlot => ({
    id: s.id,
    weekStart: s.week_start,
    dayOfWeek: s.day_of_week,
    period: s.period,
    clinicNumber: s.clinic_number,
    doctorId: s.doctor_id,
    doctorName: s.doctor_name,
    role: s.role,
    status: s.status,
  });

  return {
    data: {
      clinicCount,
      doctors,
      existingSlots: (existing || []).map(mapSlot),
      pastSlots: (past || []).map(mapSlot),
    },
    error: null,
  };
}

/**
 * محمّل خفيف للأطباء فقط (بلا خانات، بلا تاريخ أسبوع).
 * يُستخدم لحقن "دفتر الأطباء" في سياق الذكاء حتى يربط الاسم بالـ id
 * ويعرف مَن هو تريني قبل البناء. يعيد استخدام نفس فلترة loadScheduleData
 * (القوالب الأربعة فقط، وAGD مستثنى).
 */
export async function loadDoctorRoster(
  clinicId: string,
): Promise<{ doctors: LoadedDoctor[] | null; error: string | null }> {
  const { data: groupsData, error: groupsErr } = await supabase
    .from('doctor_groups')
    .select('id, name, doctor_group_members(doctor_id, doctor_name, work_status, supervisor_doctor_id)')
    .eq('clinic_id', clinicId);
  if (groupsErr) {
    return { doctors: null, error: `فشل تحميل الأطباء: ${groupsErr.message}` };
  }

  const doctors: LoadedDoctor[] = [];
  for (const g of (groupsData || []) as Array<{
    id: string;
    name: string;
    doctor_group_members?: Array<{
      doctor_id: string;
      doctor_name: string;
      work_status: string;
      supervisor_doctor_id: string | null;
    }>;
  }>) {
    const template = getTemplateByName(g.name);
    if (!template) continue;
    if (template.key === 'agd') continue;
    for (const m of g.doctor_group_members || []) {
      doctors.push({
        id: m.doctor_id,
        name: m.doctor_name,
        groupTemplate: template,
        groupId: g.id,
        workStatus: (m.work_status as DoctorWorkStatus) || 'active',
        supervisorDoctorId: m.supervisor_doctor_id ?? null,
      });
    }
  }

  return { doctors, error: null };
}

// ─── خطة الأسبوع (C3) ────────────────────────────────────────
// لكل (يوم/شفت): من سيعمل، البورد، الغياب، التريني beginner

/** سيناريو البورد كما يُطبَّق على شفت معين */
export type BoardRuleResolved =
  | { kind: 'no_board' }
  | { kind: 'in_pool' }                              // 1 بورد: داخل المجموعة كطبيب عاديّ
  | { kind: 'shared_clinic'; doctors: LoadedDoctor[] }; // 2+ بورد: اثنان بالعيادة، والباقي احتياطيّ يتناوب

/** بركة شفت: من يعمل + البورد + التريني beginner + الغياب */
export type ShiftPool = {
  shift: Shift;
  /**
   * أطباء جاهزون للتوزيع (يدخلون عد D).
   * هذا لا يشمل: التريني beginner (ظل المدرّب) ولا light_duty (P2/P4 فقط).
   */
  available: LoadedDoctor[];
  /**
   * أطباء light_duty — يعملون P2 فقط (صباح) أو P4 فقط (مساء).
   * يُوضعون خارج التوزيع الرئيسي ثم يُلصقون بدورة الـ delegator/ex.
   */
  lightDuty: LoadedDoctor[];
  /** التريني beginner مرتبط بـ supervisor (key = supervisor doctor id) */
  beginnersByBuddy: Map<string, LoadedDoctor[]>;
  /** التريني beginner الذي مدربه غائب → احتياط تلقائي */
  beginnersOrphan: LoadedDoctor[];
  /** أطباء غائبون هذا الشفت (للعرض كـ EX) */
  absent: { doctor: LoadedDoctor; status: SlotStatus }[];
  /**
   * استئذان جزئيّ (PS/PE): متاح فترة واحدة فقط من الشفت.
   * PE (نهاية الدوام) = متاح الفترة الأولى؛ PS (بداية الدوام) = متاح الثانية.
   * يحجز عيادة في فترته المتاحة، وشريك كامل يغطّي الأخرى.
   */
  partialAvailable: { doctor: LoadedDoctor; openPeriod: Period }[];
  /** سيناريو البورد المُطبَّق */
  boardRule: BoardRuleResolved;
};

export type DayPlan = {
  day: WeekDay;
  isHoliday: boolean;
  morning?: ShiftPool;
  evening?: ShiftPool;
};

export type WeekPlan = DayPlan[];

/**
 * يحسب خطة الأسبوع: لكل (يوم/شفت) من سيعمل وكيف.
 * لا يوزّع بعد على عيادات — هذا في C4.
 */
export function computeWeekPlan(
  input: ScheduleBuildInput,
  data: LoadedData,
): WeekPlan {
  const holidays = new Set(input.holidayDays || []);
  const doctorById = new Map(data.doctors.map((d) => [d.id, d]));
  const plan: WeekPlan = [];

  for (const day of WEEK_DAYS) {
    if (holidays.has(day)) {
      plan.push({ day, isHoliday: true });
      continue;
    }
    plan.push({
      day,
      isHoliday: false,
      morning: buildShiftPool(day, 'morning', input, data, doctorById),
      evening: buildShiftPool(day, 'evening', input, data, doctorById),
    });
  }
  return plan;
}

/** يبني بركة شفت لـ (يوم، شفت) محدد */
function buildShiftPool(
  day: WeekDay,
  shift: Shift,
  input: ScheduleBuildInput,
  data: LoadedData,
  doctorById: Map<string, LoadedDoctor>,
): ShiftPool {
  const aShift = input.aShiftPlan[day];
  const activeGroup: 'group_a' | 'group_b' =
    shift === aShift ? 'group_a' : 'group_b';

  // 1. أطباء القروب الذي يعمل في هذا الشفت
  const groupDoctors = data.doctors.filter(
    (d) => d.groupTemplate.key === activeGroup,
  );

  // 2. شفت كروسرز (تفضيلات تجبر الطبيب على شفت معين بغضّ النظر عن قروبه)
  const prefs = input.doctorPreferences || {};
  const crossers = data.doctors.filter((d) => {
    const pref = prefs[d.id];
    if (!pref) return false;
    if (d.groupTemplate.key !== 'group_a' && d.groupTemplate.key !== 'group_b') {
      return false; // البورد و AGD لا يدخلون كـ كروسرز
    }
    // يكون كروسر فقط إذا كان قروبه في الشفت العكسي
    const inGroup = d.groupTemplate.key === activeGroup;
    if (inGroup) return false; // ينتمي للشفت أصلاً، ليس كروسر
    if (pref.kind === 'always_morning' && shift === 'morning') return true;
    if (pref.kind === 'always_evening' && shift === 'evening') return true;
    return false;
  });

  // 3. استخراج الغياب من الخانات الموجودة في DB لهذا اليوم/الشفت
  //    (يسبق قرار البورد: عضو بورد متغيّب/متفرّغ لا يُحتسب في تقاسم العيادة)
  const absent = findAbsencesForShift(
    data.existingSlots,
    day,
    shift,
    doctorById,
  );
  const absentIds = new Set(absent.map((a) => a.doctor.id));

  // 3.5 غيابات الاستثناءات اليدويّة (تفرّغ/مرضية/إجازة ليوم محدد) — تُدمَج
  //     كالغياب المُسجَّل، لكنها لا تُكتب في DB (تؤثّر على هذا البناء فقط)
  for (const e of input.extraAbsences || []) {
    if (e.day !== day) continue;
    if (e.scope !== 'full' && e.scope !== shift) continue;
    if (absentIds.has(e.doctorId)) continue;
    const d = doctorById.get(e.doctorId);
    if (!d) continue;
    absent.push({ doctor: d, status: e.status || 'vacation' });
    absentIds.add(e.doctorId);
  }

  // 4. البورد حسب السيناريو — نصفّي المتغيّبين/الإجازة أولاً، فيتقرّر
  //    تقاسم العيادة (2 متاحين) أو بورد واحد داخل البِركة (1) أو لا بورد (0).
  const availableBoard = data.doctors.filter(
    (d) =>
      d.groupTemplate.key === 'board' &&
      !absentIds.has(d.id) &&
      d.workStatus !== 'vacation',
  );
  const { boardInShift, boardRule } = resolveBoardForShift(
    day,
    shift,
    availableBoard,
    input.boardConfig,
  );

  // 5. تجميع المرشحين
  let candidates = [...groupDoctors, ...crossers, ...boardInShift];

  // 5.0 نقل شفت ليوم محدد (استثناء التيم ليدر): الطبيب يعمل اليوم في شفت غير
  //     شفت قروبه الطبيعي. نُزيله من الشفت الخطأ هنا، ونُضيفه في الشفت الصحيح.
  //     يُطبَّق على أطباء القروب فقط (group_a/group_b)؛ البورد له منطقه الخاص.
  //     والتريني beginner (الظلّ) ينتقل مع مدرّبه إلى الشفت الجديد.
  const overrideShift = new Map<string, Shift>();
  for (const o of input.extraShifts || []) {
    if (o.day !== day) continue;
    const d = doctorById.get(o.doctorId);
    // النقل لأطباء القروب فقط (group_a/group_b)؛ البورد/الـ AGD لهم منطقهم الخاص
    if (!d || (d.groupTemplate.key !== 'group_a' && d.groupTemplate.key !== 'group_b')) continue;
    overrideShift.set(o.doctorId, o.shift);
  }
  if (overrideShift.size) {
    const tModes = input.traineeModes || {};
    for (const d of data.doctors) {
      if (tModes[d.id] !== 'beginner') continue;
      const sup = d.supervisorDoctorId;
      if (sup && overrideShift.has(sup)) overrideShift.set(d.id, overrideShift.get(sup)!);
    }
    // أزِل مَن وجهته الشفت الآخر، وأضِف مَن وجهته هذا الشفت وليس فيه أصلاً
    candidates = candidates.filter((c) => {
      const s = overrideShift.get(c.id);
      return s === undefined || s === shift;
    });
    const present = new Set(candidates.map((c) => c.id));
    for (const [id, s] of overrideShift) {
      if (s !== shift || present.has(id)) continue;
      const d = doctorById.get(id);
      if (!d) continue;
      if (d.groupTemplate.key !== 'group_a' && d.groupTemplate.key !== 'group_b') continue;
      candidates.push(d);
    }
  }

  // 5.5 استئذان جزئيّ (PS/PE): متاح فترة واحدة من هذا الشفت فقط.
  //     PE (نهاية الدوام) = غائب الفترة الثانية → متاح الأولى؛ PS = العكس.
  //     الشفت يُستنبط ضمنياً: الطبيب مرشّح في الشفت الذي يعمله فقط.
  const shiftPeriods = SHIFT_PERIODS[shift];
  const candidateIds = new Set(candidates.map((c) => c.id));
  const partialAvailable: { doctor: LoadedDoctor; openPeriod: Period }[] = [];
  const partialIds = new Set<string>();
  for (const slot of data.existingSlots) {
    if (slot.dayOfWeek !== day) continue;
    if (slot.status !== 'permission_start' && slot.status !== 'permission_end') continue;
    if (!candidateIds.has(slot.doctorId) || partialIds.has(slot.doctorId)) continue;
    const d = doctorById.get(slot.doctorId);
    if (!d) continue;
    const openPeriod = slot.status === 'permission_end' ? shiftPeriods[0]! : shiftPeriods[1]!;
    partialAvailable.push({ doctor: d, openPeriod });
    partialIds.add(slot.doctorId);
  }

  // 5.6 استئذانات الاستثناءات اليدويّة (من نصّ التيم ليدر) — تُدمَج كالـ PS/PE
  //     end (نهاية) = متاح أول فترة | start (بداية) = متاح آخر فترة
  for (const p of input.extraPermissions || []) {
    if (p.day !== day) continue;
    if (!candidateIds.has(p.doctorId) || partialIds.has(p.doctorId)) continue;
    const d = doctorById.get(p.doctorId);
    if (!d) continue;
    const openPeriod = p.kind === 'end' ? shiftPeriods[0]! : shiftPeriods[1]!;
    partialAvailable.push({ doctor: d, openPeriod });
    partialIds.add(p.doctorId);
  }

  // 6. فصل التريني beginner و light_duty عن البركة الرئيسية
  const traineeModes = input.traineeModes || {};
  const beginnersByBuddy = new Map<string, LoadedDoctor[]>();
  const beginnersOrphan: LoadedDoctor[] = [];
  const mainPool: LoadedDoctor[] = [];
  const lightDuty: LoadedDoctor[] = [];

  for (const d of candidates) {
    if (absentIds.has(d.id)) continue; // متغيّب
    if (partialIds.has(d.id)) continue; // استئذان جزئيّ — يُعالَج منفصلاً
    if (d.workStatus === 'vacation') continue; // إجازة دائمة — خارج الجدول

    // light_duty يخرج من البركة الرئيسية، يُوضع لاحقاً في P2/P4 فقط
    if (d.workStatus === 'light_duty') {
      lightDuty.push(d);
      continue;
    }

    if (
      d.workStatus === 'trainee' &&
      traineeModes[d.id] === 'beginner'
    ) {
      const supId = d.supervisorDoctorId;
      const supPresent = supId && candidates.some(
        (c) => c.id === supId && !absentIds.has(supId),
      );
      if (supId && supPresent) {
        const arr = beginnersByBuddy.get(supId) || [];
        arr.push(d);
        beginnersByBuddy.set(supId, arr);
      } else {
        // المدرّب غائب أو لا يوجد → التريني احتياط تلقائي
        beginnersOrphan.push(d);
      }
    } else {
      mainPool.push(d);
    }
  }

  return {
    shift,
    available: mainPool,
    lightDuty,
    beginnersByBuddy,
    beginnersOrphan,
    absent,
    partialAvailable,
    boardRule,
  };
}

/** يحدد ما إذا كان البورد يعمل في هذا الشفت، وكيف يُعامَل */
function resolveBoardForShift(
  day: WeekDay,
  shift: Shift,
  allBoard: LoadedDoctor[],
  config: BoardConfig,
): { boardInShift: LoadedDoctor[]; boardRule: BoardRuleResolved } {
  if (allBoard.length === 0) {
    return { boardInShift: [], boardRule: { kind: 'no_board' } };
  }

  const scenario = config.scenario;
  let inShift = false;

  switch (scenario.kind) {
    case 'separate_schedule':
      return { boardInShift: [], boardRule: { kind: 'no_board' } };
    case 'all_morning':
      inShift = shift === 'morning';
      break;
    case 'all_evening':
      inShift = shift === 'evening';
      break;
    case 'hybrid_evening_days': {
      const isEveningDay = scenario.eveningDays.includes(day);
      inShift = isEveningDay ? shift === 'evening' : shift === 'morning';
      break;
    }
  }

  if (!inShift) {
    return { boardInShift: [], boardRule: { kind: 'no_board' } };
  }

  // قاعدة تلقائية: 2+ بورد → عيادة مشتركة (اثنان بالعيادة، الباقي احتياطيّ
  // يتناوب عبر عجلة البورد). 1 بورد → طبيب عاديّ داخل البِركة.
  if (allBoard.length >= 2) {
    return {
      boardInShift: allBoard,
      boardRule: { kind: 'shared_clinic', doctors: allBoard },
    };
  }
  return { boardInShift: allBoard, boardRule: { kind: 'in_pool' } };
}

/** يستخرج أطباء غائبين هذا الشفت من سجل الخانات الموجود */
function findAbsencesForShift(
  existingSlots: LoadedSlot[],
  day: WeekDay,
  shift: Shift,
  doctorById: Map<string, LoadedDoctor>,
): { doctor: LoadedDoctor; status: SlotStatus }[] {
  const periods = SHIFT_PERIODS[shift];
  const result: { doctor: LoadedDoctor; status: SlotStatus }[] = [];
  const seen = new Set<string>();

  for (const slot of existingSlots) {
    if (slot.dayOfWeek !== day) continue;
    if (slot.status === 'active') continue;
    // الاستئذان الجزئيّ (PS/PE) ليس غيابًا — حضور فترة واحدة فقط، يُعالَج منفصلاً
    // في buildShiftPool (partialAvailable). و'extra' دور احتياط لا غياب.
    if (slot.status === 'permission_start' || slot.status === 'permission_end' || slot.status === 'extra') continue;
    // غياب اليوم الكامل (SL/VC) يُسجَّل أحياناً بـ period=0 (خانة العرض في صفّ
    // الـ EX) → غياب في الشفتين. وإلا نطابق فترة الشفت (للغياب المُسجَّل بفتراته).
    const fullDay = slot.status === 'vacation' || slot.status === 'sick_leave';
    const matchesShift =
      periods.includes(slot.period as Period) || (slot.period === 0 && fullDay);
    if (!matchesShift) continue;
    if (seen.has(slot.doctorId)) continue;
    const d = doctorById.get(slot.doctorId);
    if (!d) continue;
    seen.add(slot.doctorId);
    result.push({ doctor: d, status: slot.status });
  }
  return result;
}

// ─── التوزيع (C4) ────────────────────────────────────────────
// جدول D vs N لتوزيع الأطباء على عيادات / delegator / EX

export type SlotRoleAssigned = 'clinic' | 'delegator' | 'ex';

/** خانة بعد التوزيع، جاهزة للكتابة في DB */
export type AssignedSlot = {
  day: WeekDay;
  period: Period;
  clinicNumber: number;         // 0 لـ delegator / EX
  doctor: LoadedDoctor;
  role: SlotRoleAssigned;
  /** 'shadow' = متدرّب يُتِّم وقتَ البناء (مدرّبه غائب) — يعود معه تلقائيًّا */
  source?: 'ai' | 'shadow';
};

export type ShiftDistribution = {
  shift: Shift;
  slots: AssignedSlot[];
  warnings: string[];
};


// ─── الكتابة في DB (C6) ──────────────────────────────────────

/**
 * يحذف الخانات النشطة (status='active') للأسبوع، ثم يُدخل الجديدة
 * بـ source='ai'. الغيابات (status != 'active') تبقى لم تُمسّ.
 *
 * صفّ الاحتياط يُكتب بصيغة محرّك الطلبات نفسها (role='clinic',
 * status='extra', period=0) — صيغة واحدة في القاعدة كي يرى المحرّكُ
 * احتياطيّي البناء ويراهم كرتُ التغطية وعجلةُ العدالة معًا.
 */
async function writeSlots(
  clinicId: string,
  weekStart: string,
  slots: AssignedSlot[],
): Promise<string | null> {
  // 1. حذف الخانات النشطة القديمة
  const { error: delErr } = await supabase
    .from('schedule_slots')
    .delete()
    .eq('clinic_id', clinicId)
    .eq('week_start', weekStart)
    .eq('status', 'active');
  if (delErr) return `فشل حذف الخانات القديمة: ${delErr.message}`;

  // 1.b حذف احتياط البناء السابق (status='extra' بمصدر البناء أو ظلّ) —
  //     ظلّ المتدرّب يُعاد اشتقاقه من صفوف الغياب الباقية عند كلّ بناء،
  //     فيُحذف القديم تفاديًا للتكرار. احتياطُ قرارٍ مستقلّ (source='request')
  //     لا يُمسّ.
  const { error: delExErr } = await supabase
    .from('schedule_slots')
    .delete()
    .eq('clinic_id', clinicId)
    .eq('week_start', weekStart)
    .eq('status', 'extra')
    .in('source', ['ai', 'shadow']);
  if (delExErr) return `فشل حذف احتياط البناء القديم: ${delExErr.message}`;

  // 2. إدخال الخانات الجديدة
  if (slots.length === 0) return null;

  const rows = slots.map((s) => ({
    clinic_id: clinicId,
    week_start: weekStart,
    day_of_week: s.day,
    period: s.period,
    clinic_number: s.clinicNumber,
    doctor_id: s.doctor.id,
    doctor_name: s.doctor.name,
    // الاحتياط بصيغة المحرّك الموحّدة؛ الباقي كما هو
    role: s.role === 'ex' ? 'clinic' : s.role,
    status: s.role === 'ex' ? 'extra' : 'active',
    source: s.source ?? 'ai',
  }));

  const { error: insErr } = await supabase
    .from('schedule_slots')
    .insert(rows);
  if (insErr) return `فشل إدخال الخانات: ${insErr.message}`;

  return null;
}

// ─── الدالة الرئيسية ─────────────────────────────────────────

/** يتحقق أن التاريخ يوم أحد (UTC) */
function isSundayUTC(dateStr: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d));
  return dt.getUTCDay() === 0;
}

async function build(input: ScheduleBuildInput): Promise<ScheduleBuildResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. تحقق من المدخلات
  if (!input.clinicId) errors.push('معرّف العيادة مفقود');
  if (!input.weekStart || !isSundayUTC(input.weekStart)) {
    errors.push('بداية الأسبوع يجب أن تكون يوم أحد بصيغة YYYY-MM-DD');
  }
  if (!input.aShiftPlan) {
    errors.push('توزيع شفتات قروب A مفقود');
  } else {
    for (const day of WEEK_DAYS) {
      if (!input.aShiftPlan[day]) {
        errors.push(`شفت قروب A ليوم ${day} غير محدد`);
      }
    }
  }
  if (!input.boardConfig) errors.push('إعدادات البورد مفقودة');

  if (errors.length > 0) {
    return {
      success: false,
      slotsCreated: 0,
      doctorsAssigned: 0,
      absencesRespected: 0,
      warnings,
      errors,
      summary: errors[0]!,
    };
  }

  // 2. تحميل البيانات (C2)
  const { data, error: loadErr } = await loadScheduleData(
    input.clinicId,
    input.weekStart,
  );
  if (loadErr || !data) {
    const msg = loadErr || 'فشل تحميل البيانات';
    return {
      success: false,
      slotsCreated: 0,
      doctorsAssigned: 0,
      absencesRespected: 0,
      warnings,
      errors: [msg],
      summary: msg,
    };
  }
  if (data.doctors.length === 0) {
    return {
      success: false,
      slotsCreated: 0,
      doctorsAssigned: 0,
      absencesRespected: 0,
      warnings,
      errors: ['لا يوجد أطباء في قروبات التوزيع (A/B/Board)'],
      summary: 'لا يوجد أطباء',
    };
  }

  // 2.5 — التحقق من قرار التريني (لا نفترض شيئاً)
  // كل تريني نشط يحتاج قرار صريح: مستقل أم مبتدئ.
  const trainees = data.doctors.filter((d) => d.workStatus === 'trainee');
  if (trainees.length > 0) {
    const modes = input.traineeModes || {};
    const missing = trainees.filter((t) => !modes[t.id]);
    if (missing.length > 0) {
      const list = missing.map((t) => `${t.name}|${t.id}`).join('; ');
      return {
        success: false,
        slotsCreated: 0,
        doctorsAssigned: 0,
        absencesRespected: 0,
        warnings,
        errors: [`MISSING_TRAINEE_MODES: ${list}`],
        summary: `يلزم تحديد وضع كل تريني (مستقل/مبتدئ) قبل البناء — ${missing.length} يحتاج قرار`,
      };
    }
  }

  // 2.6 — تعارض «نقل شفت + غياب» لنفس الطبيب نفس اليوم. الغياب يومٌ كامل دائمًا
  //       (لا يعمل في أيّ شفت)، فلا يصحّ نقلُ شفته ذلك اليوم. لا نبتلع التناقض
  //       بصمت (لا يفوز الغياب ويختفي النقل بلا علم القائد) — نكشفه ونعيد للمساعد
  //       كي يسأل القائد أيّهما يريد قبل البناء. غيابات اليوم تأتي من نصّ
  //       الاستثناءات (extraAbsences، أيّ نطاق) ومن خانات DB المحفوظة (طبية/تفرّغ).
  if ((input.extraShifts || []).length > 0) {
    const nameById = new Map(data.doctors.map((d) => [d.id, d.name]));
    const absentDay = new Set<string>();
    for (const a of input.extraAbsences || []) absentDay.add(`${a.doctorId}|${a.day}`);
    for (const s of data.existingSlots) {
      if (s.status === 'sick_leave' || s.status === 'vacation') {
        absentDay.add(`${s.doctorId}|${s.dayOfWeek}`);
      }
    }
    const clashes = (input.extraShifts || []).filter((o) => absentDay.has(`${o.doctorId}|${o.day}`));
    if (clashes.length > 0) {
      const list = clashes
        .map((o) => `${nameById.get(o.doctorId) || o.doctorId}|${o.doctorId}|${o.day}`)
        .join('; ');
      return {
        success: false,
        slotsCreated: 0,
        doctorsAssigned: 0,
        absencesRespected: 0,
        warnings,
        errors: [`CONFLICT_SHIFT_MOVE_ABSENCE: ${list}`],
        summary: `تعارض: نقل شفت وغياب لنفس الطبيب نفس اليوم — يلزم حسم أيّهما قبل البناء (${clashes.length})`,
      };
    }
  }

  // 3. خطة الأسبوع (C3)
  const plan = computeWeekPlan(input, data);

  // 4. التوزيع + التدوير:
  //    - lastRole: يتذكّر دور كل طبيب أمس → يدخل في الترتيب
  //    - consecutiveClinic: عدد أيام clinic متتالية لكل طبيب
  //    - weeklyScore: حمل الأسبوع الجاري المتراكم (نقاط مرجّحة)
  //    - pastScores: حمل الأسبوعين السابقين
  //    - pastExCount + weeklyExCount: عدد مرات EX (لدوران EX العادل)
  //    - pastDelCount + weeklyDelCount: عدد مرات delegator (لدوران Del العادل)
  //    - boardConfig: يقرّر إذا كان البورد يدخل del/ex
  const allSlots: AssignedSlot[] = [];
  // العجلات (القاعدة الرباعية): تُبنى من سجل الأسابيع السابقة فتستمرّ
  // الاستمرارية عبر الأسابيع (موضع لا أرقام — لا تكدّس على العائد/الجديد).
  // تُمرَّر لكل شفت وتدور (مَن يأخذ الدور → آخر الطابور).
  const wheels = createWheels(data.doctors, data.pastSlots);

  // استثناءات التريني المستقلّ من دورتَي الدليقيتر/الاحتياطي (حسب خيارات الويزرد)
  const modesForExcl = input.traineeModes || {};
  const opts = input.traineeOptions || {};
  const excludeDel = new Set<string>();
  const excludeEx = new Set<string>();
  for (const [id, o] of Object.entries(opts)) {
    if (modesForExcl[id] !== 'independent') continue; // الخيارات للمستقلّ فقط
    if (o.inDelegator === false) excludeDel.add(id);
    if (o.inReserve === false) excludeEx.add(id);
  }

  for (const day of plan) {
    if (day.isHoliday) continue;

    // مقدّمة طابور الاحتياط بداية اليوم — تُحمى من عقوبة الغياب ("في دوره")
    const exFrontToday = wheels.ex[0];

    if (day.morning) {
      const res = distributeShiftWheel(day.day, data.clinicCount, day.morning, wheels, input.delegatorEnabled, excludeEx, excludeDel);
      allSlots.push(...res.slots);
      warnings.push(...res.warnings.map((w) => `${day.day} صباح: ${w}`));
    }
    if (day.evening) {
      const res = distributeShiftWheel(day.day, data.clinicCount, day.evening, wheels, input.delegatorEnabled, excludeEx, excludeDel);
      allSlots.push(...res.slots);
      warnings.push(...res.warnings.map((w) => `${day.day} مساء: ${w}`));
    }

    // عقوبة الاحتياط: مَن غاب (طبية/تفرّغ) اليوم وليس مقدّمة الطابور → المؤخّرة
    const absentToday = new Set<string>();
    for (const a of day.morning?.absent ?? []) absentToday.add(a.doctor.id);
    for (const a of day.evening?.absent ?? []) absentToday.add(a.doctor.id);
    applyExAbsence(wheels, absentToday, exFrontToday);
  }

  const absencesRespected = data.existingSlots.filter(
    (s) => s.status !== 'active',
  ).length;

  // 6. كتابة في DB (إلا لو dryRun)
  if (!input.dryRun) {
    const writeErr = await writeSlots(input.clinicId, input.weekStart, allSlots);
    if (writeErr) {
      return {
        success: false,
        slotsCreated: 0,
        doctorsAssigned: 0,
        absencesRespected,
        warnings,
        errors: [writeErr],
        summary: writeErr,
      };
    }
  }

  // 6.5 صفّ "إضافي" للمعاينة: المتغيّبون من DB + المتفرّغون (الاستثناءات اليدويّة)
  const STATUS_LABEL: Record<string, string> = {
    vacation: 'VC', sick_leave: 'SL', permission_start: 'PS', permission_end: 'PE', extra: 'EX',
  };
  const previewAbsences: PreviewAbsence[] = [];
  const seenAbs = new Set<string>();
  for (const s of data.existingSlots) {
    if (s.status === 'active') continue;
    const key = `${s.dayOfWeek}|${s.doctorId}`;
    if (seenAbs.has(key)) continue;
    seenAbs.add(key);
    previewAbsences.push({ day: s.dayOfWeek as WeekDay, doctorName: s.doctorName, label: STATUS_LABEL[s.status] ?? '' });
  }
  for (const e of input.extraAbsences || []) {
    const key = `${e.day}|${e.doctorId}`;
    if (seenAbs.has(key)) continue;
    const d = data.doctors.find((x) => x.id === e.doctorId);
    if (!d) continue;
    seenAbs.add(key);
    previewAbsences.push({ day: e.day, doctorName: d.name, label: e.status === 'sick_leave' ? 'SL' : 'متفرّغ' });
  }
  for (const p of input.extraPermissions || []) {
    const key = `${p.day}|${p.doctorId}`;
    if (seenAbs.has(key)) continue;
    const d = data.doctors.find((x) => x.id === p.doctorId);
    if (!d) continue;
    seenAbs.add(key);
    previewAbsences.push({ day: p.day, doctorName: d.name, label: p.kind === 'start' ? 'PS' : 'PE' });
  }

  // 7. ملخّص
  const uniqueDoctors = new Set(allSlots.map((s) => s.doctor.id));
  const slotsCreated = allSlots.length;
  const doctorsAssigned = uniqueDoctors.size;
  const prefix = input.dryRun ? '[تجربة] ' : '';
  let summary = `${prefix}تم بناء جدول أسبوع ${input.weekStart}. ${slotsCreated} خانة، ${doctorsAssigned} طبيب.`;
  if (absencesRespected > 0) summary += ` (${absencesRespected} غياب مُحترم)`;
  if (warnings.length > 0) summary += ` ${warnings.length} تنبيه.`;

  return {
    success: true,
    slotsCreated,
    doctorsAssigned,
    absencesRespected,
    warnings,
    errors: [],
    summary,
    previewSlots: allSlots,
    previewAbsences,
    clinicCount: data.clinicCount,
  };
}

/** علامة استئذان (PS/PE) تُكتب في DB لتظهر بصفّ EX في الجدول الأساسيّ */
export type PermissionMarker = {
  doctorId: string;
  doctorName: string;
  day: WeekDay;
  kind: 'start' | 'end';
  /** خانة EX حسب شفت الطبيب: 1=صباح، 2=مساء (الافتراضي 1) */
  clinicNumber?: number;
};

/** علامة غياب (تفرّغ/مرضية) من نصّ الاستثناءات — تُكتب كغياب حقيقيّ مثل اليدويّ */
export type AbsenceMarker = {
  doctorId: string;
  doctorName: string;
  day: WeekDay;
  status: 'vacation' | 'sick_leave';
  /** خانة EX حسب شفت الطبيب: 1=صباح، 2=مساء (الافتراضي 1) */
  clinicNumber?: number;
};

/**
 * يكتب خانات جاهزة مباشرةً (بعد تعديل يدويّ في المعاينة) دون إعادة بناء.
 * يستبدل خانات الأسبوع النشطة بالمُمرَّرة. الغيابات اليدويّة (source != 'ai') لا تُمسّ.
 * permissions/absences: علامات استئذان وغياب (من نصّ الاستثناءات) تُكتب كسجلّ
 * حقيقيّ ليظهر في الجدول الأساسيّ — لا فرق بينها وبين ما يُدخله الليدر بنفسه.
 */
async function saveSlots(
  clinicId: string,
  weekStart: string,
  slots: AssignedSlot[],
  permissions?: PermissionMarker[],
  absences?: AbsenceMarker[],
): Promise<{ success: boolean; error?: string }> {
  const err = await writeSlots(clinicId, weekStart, slots);
  if (err) return { success: false, error: err };

  // علامات الاستئذان/الغياب: نحذف أولاً ما كتبه الذكاء سابقاً (تفادي التكرار عند
  // إعادة الحفظ)، مع إبقاء المُدخَل يدويّاً (source != 'ai')، ثم نُدخل الجديدة.
  const { error: delErr } = await supabase
    .from('schedule_slots')
    .delete()
    .eq('clinic_id', clinicId)
    .eq('week_start', weekStart)
    .eq('source', 'ai')
    .in('status', ['permission_start', 'permission_end', 'vacation', 'sick_leave']);
  if (delErr) return { success: false, error: `فشل تنظيف الاستثناءات: ${delErr.message}` };

  // غياب period=0 يُقرأ في الشفتين (مطابق للغياب اليدويّ من نافذة EX)
  const absRows = (absences || []).map((a) => ({
    clinic_id: clinicId,
    week_start: weekStart,
    day_of_week: a.day,
    period: 0,
    clinic_number: a.clinicNumber ?? 1, // 1=صباح، 2=مساء حسب شفت الطبيب
    doctor_id: a.doctorId,
    doctor_name: a.doctorName,
    role: 'clinic',
    status: a.status,
    source: 'ai',
  }));
  const permRows = (permissions || []).map((m) => ({
    clinic_id: clinicId,
    week_start: weekStart,
    day_of_week: m.day,
    period: 0,
    clinic_number: m.clinicNumber ?? 1, // 1=صباح، 2=مساء حسب شفت الطبيب
    doctor_id: m.doctorId,
    doctor_name: m.doctorName,
    role: 'clinic',
    status: m.kind === 'start' ? 'permission_start' : 'permission_end',
    source: 'ai',
  }));
  const rows = [...absRows, ...permRows];
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from('schedule_slots').insert(rows);
    if (insErr) return { success: false, error: `فشل كتابة الاستثناءات: ${insErr.message}` };
  }
  return { success: true };
}

/**
 * قارئ خفيف لخانات أسبوع محفوظ (بلا بناء) — يُستخدم لـ"يد القراءة": يجيب
 * الذكاء عن أسئلة تفصيليّة («من في العيادة ٢ الأحد؟») من جدول مبنيّ.
 */
async function readWeekSlots(
  clinicId: string,
  weekStart: string,
): Promise<{ slots: LoadedSlot[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('schedule_slots')
    .select('id, week_start, day_of_week, period, clinic_number, doctor_id, doctor_name, role, status')
    .eq('clinic_id', clinicId)
    .eq('week_start', weekStart);
  if (error) return { slots: null, error: `فشل تحميل الجدول: ${error.message}` };
  const slots: LoadedSlot[] = (data || []).map((s: any) => ({
    id: s.id,
    weekStart: s.week_start,
    dayOfWeek: s.day_of_week,
    period: s.period,
    clinicNumber: s.clinic_number,
    doctorId: s.doctor_id,
    doctorName: s.doctor_name,
    role: s.role,
    status: s.status,
  }));
  return { slots, error: null };
}

export const schedule = {
  build,
  saveSlots,
  readWeekSlots,
};
