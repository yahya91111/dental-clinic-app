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
 * - addition_to_group    : يُضاف للقروب الذي يعمل معه
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
    | { kind: 'hybrid_evening_days'; eveningDays: WeekDay[] }
    | { kind: 'addition_to_group' };
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

  /** تفضيلات أطباء محددين (key = doctor_id) */
  doctorPreferences?: Record<string, DoctorPreference>;

  /** dryRun=true يحسب فقط، لا يكتب في DB */
  dryRun?: boolean;
};

// ─── المخرجات ─────────────────────────────────────────────────

export type ScheduleBuildResult = {
  success: boolean;
  slotsCreated: number;
  doctorsAssigned: number;
  absencesRespected: number;
  warnings: string[];
  errors: string[];
  summary: string;
};

// ─── تحميل البيانات (C2) ─────────────────────────────────────

export type DoctorWorkStatus = 'active' | 'vacation' | 'light_duty' | 'trainee';
export type SlotStatus = 'active' | 'sick_leave' | 'permission' | 'vacation';
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
  pastSlots: LoadedSlot[];          // آخر أسبوعين (للعدالة)
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

  // 4. خانات الأسبوعين السابقين (للعدالة)
  const twoWeeksAgo = shiftWeekStart(weekStart, 2);
  const { data: past, error: pastErr } = await supabase
    .from('schedule_slots')
    .select('id, week_start, day_of_week, period, clinic_number, doctor_id, doctor_name, role, status')
    .eq('clinic_id', clinicId)
    .gte('week_start', twoWeeksAgo)
    .lt('week_start', weekStart);
  if (pastErr) {
    return { data: null, error: `فشل تحميل سجل الأسبوعين السابقين: ${pastErr.message}` };
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

// ─── خطة الأسبوع (C3) ────────────────────────────────────────
// لكل (يوم/شفت): من سيعمل، البورد، الغياب، التريني beginner

/** سيناريو البورد كما يُطبَّق على شفت معين */
export type BoardRuleResolved =
  | { kind: 'no_board' }
  | { kind: 'in_pool' }                                            // داخل المجموعة كأطباء عاديين (1 بورد)
  | { kind: 'pair_shares_clinic'; doctors: [LoadedDoctor, LoadedDoctor] }; // 2+ بورد

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

  // 3. البورد حسب السيناريو
  const allBoard = data.doctors.filter((d) => d.groupTemplate.key === 'board');
  const { boardInShift, boardRule } = resolveBoardForShift(
    day,
    shift,
    allBoard,
    input.boardConfig,
  );

  // 4. تجميع المرشحين
  const candidates = [...groupDoctors, ...crossers, ...boardInShift];

  // 5. استخراج الغياب من الخانات الموجودة في DB لهذا اليوم/الشفت
  const absent = findAbsencesForShift(
    data.existingSlots,
    day,
    shift,
    doctorById,
  );
  const absentIds = new Set(absent.map((a) => a.doctor.id));

  // 6. فصل التريني beginner و light_duty عن البركة الرئيسية
  const traineeModes = input.traineeModes || {};
  const beginnersByBuddy = new Map<string, LoadedDoctor[]>();
  const beginnersOrphan: LoadedDoctor[] = [];
  const mainPool: LoadedDoctor[] = [];
  const lightDuty: LoadedDoctor[] = [];

  for (const d of candidates) {
    if (absentIds.has(d.id)) continue; // متغيّب
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
    case 'addition_to_group':
      // افتراضي: يتبع شفت قروب A (يضاف للقروب الذي يعمل ذلك الشفت)
      inShift = true;
      break;
  }

  if (!inShift) {
    return { boardInShift: [], boardRule: { kind: 'no_board' } };
  }

  // قاعدة تلقائية: 2+ بورد → عيادة مشتركة. 1 بورد → طبيب عادي.
  if (allBoard.length >= 2) {
    return {
      boardInShift: allBoard,
      boardRule: {
        kind: 'pair_shares_clinic',
        doctors: [allBoard[0]!, allBoard[1]!],
      },
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
    if (!periods.includes(slot.period as Period)) continue;
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
};

export type ShiftDistribution = {
  shift: Shift;
  slots: AssignedSlot[];
  warnings: string[];
};

/**
 * يقرّر أيّ طبيب من الزوج يأخذ الفترة الأولى من الشفت وأيّهما الثانية.
 *
 * النمط مرن (ليس إجبارياً يومياً): الأساس هو التوازن التراكمي عبر الأسبوع،
 * لا التبديل القسري كل يوم. هذا يسمح بـ "يومين فترة أولى ثم يومين ثانية"
 * ويترك مجالاً لتدوير الدليقيتر/العيادات دون تعارض.
 *
 * القاعدة الأولى — التوازن التراكمي (P1MinusP2 = عدد الأولى ناقص الثانية):
 * - من عنده فترات أولى أكثر تاريخياً → يأخذ الفترة الثانية الآن
 * - من عنده فترات ثانية أكثر → يأخذ الفترة الأولى الآن
 *   (يبقي الجميع قريبين من التوازن 50/50 على المدى الطويل)
 *
 * القاعدة الثانية (عند تعادل التوازن) — آخر فترة فردية:
 * - من أخذ أولى آخر مرة → يأخذ الثانية الآن (تناوب لطيف)
 *
 * بلا أي سجل → نُبقي الترتيب كما هو (محافظة على تدوير EX/del).
 */
function pickP1P2(
  docA: LoadedDoctor,
  docB: LoadedDoctor,
  lastClinicPeriod: Map<string, Period> | undefined,
  p1MinusP2: Map<string, number> | undefined,
): [LoadedDoctor, LoadedDoctor] {
  // أولاً: التوازن التراكمي — من عنده P1 أكثر يأخذ P2 الآن
  if (p1MinusP2) {
    const da = p1MinusP2.get(docA.id) ?? 0;
    const db = p1MinusP2.get(docB.id) ?? 0;
    if (da > db) return [docB, docA]; // a عنده P1 أكثر → a يأخذ P2
    if (db > da) return [docA, docB]; // b عنده P1 أكثر → b يأخذ P2
  }

  // ثانياً (تعادل التوازن): تناوب لطيف من آخر فترة فردية
  if (lastClinicPeriod) {
    const lastA = lastClinicPeriod.get(docA.id);
    const lastB = lastClinicPeriod.get(docB.id);
    const aWasFirst = lastA === 1 || lastA === 3;
    const bWasFirst = lastB === 1 || lastB === 3;
    const aWasSecond = lastA === 2 || lastA === 4;
    const bWasSecond = lastB === 2 || lastB === 4;
    if (aWasFirst && !bWasFirst) return [docB, docA];
    if (bWasFirst && !aWasFirst) return [docA, docB];
    if (aWasSecond && !bWasSecond) return [docA, docB];
    if (bWasSecond && !aWasSecond) return [docB, docA];
  }

  return [docA, docB];
}

/**
 * يوزّع أطباء شفت واحد على العيادات/delegator/EX.
 * يطبّق جدول (D vs N) المتفق عليه.
 *
 * ترتيب الأطباء في pool.available مهم — هو الترتيب الذي يحدّد
 * من يأخذ أي دور. تتبع العدالة في C5 يُسبق هذه الدالة لترتيب pool.
 */
export function distributeShift(
  day: WeekDay,
  N: number,
  pool: ShiftPool,
  pastExCount?: Map<string, number>,
  weeklyExCount?: Map<string, number>,
  pastDelCount?: Map<string, number>,
  weeklyDelCount?: Map<string, number>,
  boardConfig?: BoardConfig,
  lastClinicPeriod?: Map<string, Period>,
  p1MinusP2?: Map<string, number>,
  delegatorRotationIndex?: number,
): ShiftDistribution {
  const slots: AssignedSlot[] = [];
  const warnings: string[] = [];
  const periods = SHIFT_PERIODS[pool.shift];
  const p1 = periods[0]!;
  const p2 = periods[1]!;

  let available = [...pool.available];
  let boardClinic: number | null = null;

  // ─── معالجة سيناريو البورد المشترك: 2+ بورد → عيادة مشتركة ───
  const br = pool.boardRule;
  if (br.kind === 'pair_shares_clinic') {
    const [b1, b2] = br.doctors;
    boardClinic = N; // آخر عيادة
    // زوج البورد يتناوبان P1/P2 أيضاً (توازن عبر الأسبوع)
    const [bf, bs] = pickP1P2(b1, b2, lastClinicPeriod, p1MinusP2);
    slots.push({ day, period: p1, clinicNumber: N, doctor: bf, role: 'clinic' });
    slots.push({ day, period: p2, clinicNumber: N, doctor: bs, role: 'clinic' });
    available = available.filter((d) => d.id !== b1.id && d.id !== b2.id);
  }

  // أرقام العيادات المتاحة (1..N) ما عدا عيادة البورد
  let clinicNums: number[] = [];
  for (let i = 1; i <= N; i++) {
    if (i !== boardClinic) clinicNums.push(i);
  }

  // اختصارات للقراءة
  const addClinic = (c: number, p: Period, doc: LoadedDoctor) =>
    slots.push({ day, period: p, clinicNumber: c, doctor: doc, role: 'clinic' });
  const addDelegator = (p: Period, doc: LoadedDoctor) =>
    slots.push({ day, period: p, clinicNumber: 0, doctor: doc, role: 'delegator' });
  const addEx = (p: Period, doc: LoadedDoctor) =>
    slots.push({ day, period: p, clinicNumber: 0, doctor: doc, role: 'ex' });

  // خانة EX = شفت كامل. نستخدم clinic_number لتمييز الصباح (1) عن المساء (2)
  // ليُعرَض في الواجهة في الجهة الصحيحة.
  const exShiftSlot = pool.shift === 'morning' ? 1 : 2;
  const addExShift = (doc: LoadedDoctor) =>
    slots.push({
      day,
      period: 0 as unknown as Period,
      clinicNumber: exShiftSlot,
      doctor: doc,
      role: 'ex',
    });

  // ─── light_duty: قواعد التوزيع ───
  // - يدخل دوران EX مثل باقي الأطباء (يأخذ EX حين دوره يأتي)
  // - الافتراضي (لم يأخذ EX اليوم): عيادة الفترة الأولى (P1 صباح / P3 مساء)
  // - الاستثناء: لو 1 تخفيف فقط (لم يأخذ EX) + إجمالي الشفت ≥ 2*M+1 →
  //   يصير دليقيتر منفرد يأخذ الفترتين معاً
  // - لو 2 تخفيف فأكثر، كل واحد بعياده مستقلة
  // - ممنوع P2/P4 في clinic أو delegator
  const totalShiftDoctors = available.length + pool.lightDuty.length;

  // Step A: قرّر أيّ تخفيف يأخذ EX اليوم (دوران EX يشمل التخفيف)
  const totalExNeeded = totalShiftDoctors > 2 * clinicNums.length + 1
    ? totalShiftDoctors - 2 * clinicNums.length - 1
    : 0;
  const ldTakingEx: LoadedDoctor[] = [];
  if (totalExNeeded > 0 && pool.lightDuty.length > 0 && pastExCount) {
    // رتّب كل أطباء الشفت بعدد EX السابق ASC
    const allShiftDocs = [...available, ...pool.lightDuty];
    const sortedByEx = [...allShiftDocs].sort((a, b) => {
      const ea = (pastExCount.get(a.id) ?? 0) + (weeklyExCount?.get(a.id) ?? 0);
      const eb = (pastExCount.get(b.id) ?? 0) + (weeklyExCount?.get(b.id) ?? 0);
      if (ea !== eb) return ea - eb;
      return a.name.localeCompare(b.name);
    });
    // أول totalExNeeded في الترتيب يأخذون EX. تحقق من أي تخفيف ضمنهم
    const exCandidates = new Set(sortedByEx.slice(0, totalExNeeded).map((d) => d.id));
    for (const ld of pool.lightDuty) {
      if (exCandidates.has(ld.id)) ldTakingEx.push(ld);
    }
  }
  // أضف خانات EX للتخفيف الذي اختاره الدوران
  for (const ld of ldTakingEx) {
    addExShift(ld);
  }

  // Step B: التخفيف غير المُختار لـ EX → التوزيع الافتراضي
  const remainingLDs = pool.lightDuty.filter((d) => !ldTakingEx.includes(d));
  const L = remainingLDs.length;
  const baseLdAsSoloDel = L === 1 && totalShiftDoctors >= 2 * clinicNums.length + 1;

  // دوران del: التخفيف يأخذ solo del فقط إذا كان عدد del لديه ≤ أقل عدد del بين الأطباء العاديين
  // (البورد مستثنى دائماً من delegator، لذا يُحذف من المقارنة)
  let ldAsSoloDelegator = baseLdAsSoloDel;
  if (baseLdAsSoloDel && pastDelCount && weeklyDelCount) {
    const ld = remainingLDs[0]!;
    const ldDel = (pastDelCount.get(ld.id) ?? 0) + (weeklyDelCount.get(ld.id) ?? 0);
    const eligible = available.filter((d) => d.groupTemplate.key !== 'board');
    let minRegDel = Infinity;
    for (const r of eligible) {
      const rdel = (pastDelCount.get(r.id) ?? 0) + (weeklyDelCount.get(r.id) ?? 0);
      if (rdel < minRegDel) minRegDel = rdel;
    }
    // التخفيف يأخذ solo del فقط إذا كان عدده يساوي أو أقل من الأقل بين العاديين
    ldAsSoloDelegator = ldDel <= minRegDel;
  }

  if (ldAsSoloDelegator) {
    // الاستثناء: التخفيف دليقيتر منفرد فترتين
    const ld = remainingLDs[0]!;
    addDelegator(p1, ld);
    addDelegator(p2, ld);
  } else if (L > 0) {
    // الافتراضي: التخفيف بالعياده الفترة الأولى
    if (L > clinicNums.length) {
      warnings.push(
        `light_duty (${L}) أكثر من العيادات المتاحة (${clinicNums.length}) — تجاهل الزائد`,
      );
    }
    const Lc = Math.min(L, clinicNums.length);
    const reservedClinics = clinicNums.slice(clinicNums.length - Lc);
    clinicNums = clinicNums.slice(0, clinicNums.length - Lc);

    for (let i = 0; i < Lc; i++) {
      addClinic(reservedClinics[i]!, p1, remainingLDs[i]!);
      if (available.length > 0) {
        const partner = available.shift()!;
        addClinic(reservedClinics[i]!, p2, partner);
      } else {
        warnings.push(`عيادة ${reservedClinics[i]} P2 فارغة (لا يوجد طبيب لمساعدة light_duty)`);
      }
    }
  }

  // ─── دوران solo delegator (اختيار صريح بأقل عدد del) ───
  // البورد مستثنى دائماً. نختار من غير البورد الذي عنده أقل del.
  let regAsSoloDel = false;
  {
    const Mlocal = clinicNums.length;
    const Dlocal = available.length;
    const isSoloDelCase = (Dlocal === 2 * Mlocal + 1) || (Dlocal > 2 * Mlocal + 1);
    if (
      isSoloDelCase && !ldAsSoloDelegator && pastDelCount && weeklyDelCount
    ) {
      const eligible = available.filter((d) => d.groupTemplate.key !== 'board');
      if (eligible.length > 0) {
        const sorted = [...eligible].sort((a, b) => {
          const da = (pastDelCount.get(a.id) ?? 0) + (weeklyDelCount.get(a.id) ?? 0);
          const db = (pastDelCount.get(b.id) ?? 0) + (weeklyDelCount.get(b.id) ?? 0);
          if (da !== db) return da - db; // ASC: lowest del first
          return a.name.localeCompare(b.name);
        });
        const soloDelDoc = sorted[0]!;
        addDelegator(p1, soloDelDoc);
        addDelegator(p2, soloDelDoc);
        available = available.filter((d) => d.id !== soloDelDoc.id);
        regAsSoloDel = true;
      }
    }
  }

  const D = available.length;
  const M = clinicNums.length;

  // ─── جدول التوزيع (D vs M) ───
  let idx = 0;

  if (ldAsSoloDelegator || regAsSoloDel) {
    // الدليقيتر مأخوذ مسبقاً (LD أو عادي بدوران). فقط نملأ العيادات ثم الباقي احتياط.
    for (let i = 0; i < M; i++) {
      const c = clinicNums[i]!;
      if (idx + 1 < D) {
        const [f, s] = pickP1P2(available[idx]!, available[idx + 1]!, lastClinicPeriod, p1MinusP2);
        addClinic(c, p1, f);
        addClinic(c, p2, s);
        idx += 2;
      } else if (idx < D) {
        addClinic(c, p1, available[idx++]!);
      }
    }
    while (idx < D) {
      addExShift(available[idx++]!);
    }
  } else if (D === 0) {
    if (M > 0) warnings.push(`الشفت بلا أطباء (${M} عيادة فارغة)`);
  } else if (D < M) {
    // شح: كل طبيب عيادة كاملة، الباقي فارغة
    for (let i = 0; i < D; i++) {
      const doc = available[i]!;
      const c = clinicNums[i]!;
      addClinic(c, p1, doc);
      addClinic(c, p2, doc);
    }
    warnings.push(`نقص: ${M - D} عيادة فارغة`);
  } else if (D === M) {
    // طبيب لكل عيادة شفت كامل
    for (let i = 0; i < M; i++) {
      const doc = available[i]!;
      addClinic(clinicNums[i]!, p1, doc);
      addClinic(clinicNums[i]!, p2, doc);
    }
  } else if (D === M + 1) {
    // عيادة واحدة بطبيبين (كل واحد فترة) + باقي العيادات لوحدهم. لا delegator.
    const [f0, s0] = pickP1P2(available[0]!, available[1]!, lastClinicPeriod, p1MinusP2);
    addClinic(clinicNums[0]!, p1, f0);
    addClinic(clinicNums[0]!, p2, s0);
    idx = 2;
    for (let i = 1; i < M; i++) {
      const doc = available[idx++]!;
      addClinic(clinicNums[i]!, p1, doc);
      addClinic(clinicNums[i]!, p2, doc);
    }
  } else if (D >= M + 2 && D <= 2 * M) {
    // k عيادات بطبيبين + (M-k) لوحدهم + delegator rotation في إحدى المزدوجات.
    // عيادة الدليقيتر (الطبيبان يتبادلان clinic/delegator) تتنقّل يومياً بين
    // العيادات المزدوجة لعدالة الحمل الأثقل (الكل يتناوب على الفترتين).
    const k = D - M;
    // البورد مستثنى من delegator دائماً → نختار زوج الدليقيتر من غير البورد.
    // نختاره بأقل عدد دليقيتر تراكمي (سجل + أسبوع جارٍ)، لا بترتيب البركة،
    // وإلا تكرّر نفس الطبيب صاحب الحمل الأعلى في الدور الدوّار (يُرتَّب للمقدمة
    // فيُسحب للزوج ثانيةً → حلقة مفرغة). يطابق منطق الدليقيتر المنفرد.
    const nonBoardFirst: LoadedDoctor[] = [];
    let otherDocs: LoadedDoctor[] = [];
    const nonBoardAvail = available.filter((d) => d.groupTemplate.key !== 'board');
    if (nonBoardAvail.length >= 2 && pastDelCount && weeklyDelCount) {
      const byDel = [...nonBoardAvail].sort((a, b) => {
        const da = (pastDelCount.get(a.id) ?? 0) + (weeklyDelCount.get(a.id) ?? 0);
        const db = (pastDelCount.get(b.id) ?? 0) + (weeklyDelCount.get(b.id) ?? 0);
        if (da !== db) return da - db; // ASC: أقل دليقيتر أولاً
        return a.name.localeCompare(b.name);
      });
      nonBoardFirst.push(byDel[0]!, byDel[1]!);
      const pairIds = new Set([byDel[0]!.id, byDel[1]!.id]);
      // الباقي يحافظ على ترتيب البركة الأصلي (لعدالة العيادات/الاحتياطي)
      otherDocs = available.filter((d) => !pairIds.has(d.id));
    } else {
      // fallback (بلا عدّادات أو نقص أطباء غير بورد): أول طبيبين غير بورد
      for (const d of available) {
        if (d.groupTemplate.key !== 'board' && nonBoardFirst.length < 2) {
          nonBoardFirst.push(d);
        } else {
          otherDocs.push(d);
        }
      }
    }
    if (nonBoardFirst.length < 2) {
      // حالة نادرة: لا يوجد طبيبان من غير البورد للدليقيتر الدوّار
      warnings.push('غير كافٍ من الأطباء غير البورد لتعيين دليقيتر دوّار');
      // fallback: السلوك الأصلي (قد يضع بورد في delegator)
      const c0 = clinicNums[0]!;
      const [f0, s0] = pickP1P2(available[0]!, available[1]!, lastClinicPeriod, p1MinusP2);
      addClinic(c0, p1, f0);
      addClinic(c0, p2, s0);
      addDelegator(p1, s0);
      addDelegator(p2, f0);
      idx = 2;
      for (let i = 1; i < k; i++) {
        const c = clinicNums[i]!;
        const [f, s] = pickP1P2(available[idx]!, available[idx + 1]!, lastClinicPeriod, p1MinusP2);
        addClinic(c, p1, f);
        addClinic(c, p2, s);
        idx += 2;
      }
      for (let i = k; i < M; i++) {
        const doc = available[idx++]!;
        const c = clinicNums[i]!;
        addClinic(c, p1, doc);
        addClinic(c, p2, doc);
      }
    } else {
      // موقع عيادة الدليقيتر بين العيادات المزدوجة (تدوير يومي)
      const hostPos = (((delegatorRotationIndex ?? 0) % k) + k) % k;
      let ri = 0; // مؤشر otherDocs (البورد + باقي العاديين)
      // العيادات المزدوجة
      for (let i = 0; i < k; i++) {
        const c = clinicNums[i]!;
        if (i === hostPos) {
          // عيادة الدليقيتر: الزوج غير البورد يتبادل clinic/delegator
          const [f0, s0] = pickP1P2(nonBoardFirst[0]!, nonBoardFirst[1]!, lastClinicPeriod, p1MinusP2);
          addClinic(c, p1, f0);
          addClinic(c, p2, s0);
          addDelegator(p1, s0);
          addDelegator(p2, f0);
        } else {
          // عيادة عادية مزدوجة: تقسيم (كل طبيب فترة)
          const [f, s] = pickP1P2(otherDocs[ri]!, otherDocs[ri + 1]!, lastClinicPeriod, p1MinusP2);
          addClinic(c, p1, f);
          addClinic(c, p2, s);
          ri += 2;
        }
      }
      // العيادات الفردية (طبيب واحد الفترتين)
      for (let i = k; i < M; i++) {
        const doc = otherDocs[ri++]!;
        const c = clinicNums[i]!;
        addClinic(c, p1, doc);
        addClinic(c, p2, doc);
      }
    }
  } else if (D === 2 * M + 1) {
    // 2 لكل عيادة + 1 solo delegator
    for (let i = 0; i < M; i++) {
      const c = clinicNums[i]!;
      const [f, s] = pickP1P2(available[idx]!, available[idx + 1]!, lastClinicPeriod, p1MinusP2);
      addClinic(c, p1, f);
      addClinic(c, p2, s);
      idx += 2;
    }
    const solo = available[idx++]!;
    addDelegator(p1, solo);
    addDelegator(p2, solo);
  } else {
    // D > 2M+1: 2 لكل عيادة + 1 solo delegator + الباقي EX (خانة واحدة لكل شفت)
    for (let i = 0; i < M; i++) {
      const c = clinicNums[i]!;
      const [f, s] = pickP1P2(available[idx]!, available[idx + 1]!, lastClinicPeriod, p1MinusP2);
      addClinic(c, p1, f);
      addClinic(c, p2, s);
      idx += 2;
    }
    const solo = available[idx++]!;
    addDelegator(p1, solo);
    addDelegator(p2, solo);
    while (idx < D) {
      // EX = خانة واحدة بـ period=0 لتُعرَض في صف EX المخصّص بالـ UI
      addExShift(available[idx++]!);
    }
  }

  // ─── التريني beginner: ظل المدرّب في كل أدواره ───
  // ينسخ كل خانات المدرّب (clinic + delegator + ex) بنفس الفترة والعياده
  for (const [supId, beginners] of pool.beginnersByBuddy.entries()) {
    const supSlots = slots.filter((s) => s.doctor.id === supId);
    for (const beg of beginners) {
      for (const ss of supSlots) {
        slots.push({
          day,
          period: ss.period,
          clinicNumber: ss.clinicNumber,
          doctor: beg,
          role: ss.role,
        });
      }
    }
  }

  // ─── التريني beginner الذي مدربه غائب → احتياط تلقائي ───
  for (const orphan of pool.beginnersOrphan) {
    addExShift(orphan);
  }

  return { shift: pool.shift, slots, warnings };
}

// ─── العدالة (C5) ────────────────────────────────────────────
// نرتّب pool كل شفت قبل التوزيع: قليل الحمل أولاً = يأخذ الأدوار
// الثقيلة (rotating delegator). كثير الحمل في النهاية = يأخذ EX
// إن وُجد.
//
// محدودية v1: في حالة D=2N+1 (solo delegator في آخر idx)، يصير
// الترتيب معكوساً (الأثقل يأخذ solo delegator). نتعامل معها لاحقاً.

/**
 * يحسب نقاط حمل لكل طبيب من سجل آخر أسبوعين.
 *
 * النقاط (لكل خانة active):
 *   - clinic    : 1
 *   - delegator : 2 (أثقل، يعتبر دوراً مميّزاً)
 *   - ex        : 0 (ليس عملاً فعلياً)
 */
function computeLoadScores(
  doctors: LoadedDoctor[],
  pastSlots: LoadedSlot[],
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const d of doctors) scores.set(d.id, 0);

  for (const s of pastSlots) {
    if (s.status !== 'active') continue;
    let pts = 0;
    if (s.role === 'clinic') pts = 1;
    else if (s.role === 'delegator') pts = 2;
    // ex = 0
    const curr = scores.get(s.doctorId) ?? 0;
    scores.set(s.doctorId, curr + pts);
  }
  return scores;
}

/**
 * يعدّ مرّات أخذ دور معيّن لكل طبيب من سجل سابق — بدقة "شفت واحد = مرة واحدة".
 * - solo delegator (P1+P2 نفس الشفت) يُحسب مرة واحدة
 * - del-P1 فقط (مع تخفيف) يُحسب مرة واحدة
 * - EX (شفت كامل) يُحسب مرة واحدة
 *
 * يستخدم لدوران كل دور بشكل مستقل (round-robin):
 * الطبيب الذي أخذ الدور أكثر سابقاً ينزل لآخر الطابور،
 * الذي لم يأخذ يصعد للمقدمة.
 */
function computePastRoleCount(
  doctors: LoadedDoctor[],
  pastSlots: LoadedSlot[],
  role: SlotRole | SlotRoleAssigned,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of doctors) counts.set(d.id, 0);

  const seen = new Set<string>();
  for (const s of pastSlots) {
    if (s.status !== 'active') continue;
    if (s.role !== role) continue;
    // مفتاح dedup: (طبيب، أسبوع، يوم، شفت). period 0 = EX shift-wide
    let shiftKey = 'all';
    if (s.period === 1 || s.period === 2) shiftKey = 'morning';
    else if (s.period === 3 || s.period === 4) shiftKey = 'evening';
    const key = `${s.doctorId}|${s.weekStart}|${s.dayOfWeek}|${shiftKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts.set(s.doctorId, (counts.get(s.doctorId) ?? 0) + 1);
  }
  return counts;
}

/**
 * يرتّب أطباء البركة بقواعد بالترتيب:
 *   1. **دوران EX (round-robin)**: من أخذ EX أكثر سابقاً → للمقدمة (يأخذ clinic)
 *      من أخذ EX أقل → للنهاية (دوره يأخذ EX). يحقق دوران عادل لـ EX
 *      حتى عبر الأسابيع (يستخدم سجل الأسبوعين الماضيين).
 *   2. **الدور أمس**: من لم يأخذ clinic أمس → في المقدمة (للتدوير اليومي)
 *   3. **سلسلة clinic**: من أخذ clinic أيام متتالية أكثر → يُدفع للنهاية
 *   4. **نقاط الحمل**: مجموع clinic/del/ex مرجّحة — الأقل أولاً
 *   5. **حماية البورد من EX**: لو includeInExRotation=false، يُجبر البورد
 *      في مقدمة pool (يستلم clinic فقط، لا EX)
 *      ملاحظة: حماية البورد من الدليقيتر تتم بفلتر صريح في distributeShift
 *      (دائمة، لا تعتمد على ترتيب pool)
 *   6. **تكافؤ**: ترتيب الاسم
 */
function sortPoolForDistribution(
  pool: ShiftPool,
  pastScores: Map<string, number>,
  weeklyScore: Map<string, number>,
  pastExCount: Map<string, number>,
  weeklyExCount: Map<string, number>,
  pastDelCount: Map<string, number>,
  weeklyDelCount: Map<string, number>,
  lastRole: Map<string, SlotRoleAssigned>,
  consecutiveClinic: Map<string, number>,
  boardConfig: BoardConfig,
): ShiftPool {
  const isBoardExRestricted = !boardConfig.includeInExRotation;

  const totalExCount = (id: string) =>
    (pastExCount.get(id) ?? 0) + (weeklyExCount.get(id) ?? 0);
  const totalDelCount = (id: string) =>
    (pastDelCount.get(id) ?? 0) + (weeklyDelCount.get(id) ?? 0);
  const totalScore = (id: string) =>
    (pastScores.get(id) ?? 0) + (weeklyScore.get(id) ?? 0);
  const wasClinicYesterday = (id: string) =>
    lastRole.get(id) === 'clinic' ? 1 : 0;

  const cmp = (a: LoadedDoctor, b: LoadedDoctor) => {
    // أولاً: عدد EX السابق DESC — الأكثر EX سابقاً للمقدمة (لا يأخذ EX مرة أخرى الآن)
    const ea = totalExCount(a.id);
    const eb = totalExCount(b.id);
    if (ea !== eb) return eb - ea;  // DESC: أعلى EX → مقدمة pool → clinic
    // ثانياً: عدد del السابق DESC — الأكثر del سابقاً للمقدمة (لا يأخذ del مرة أخرى)
    const da = totalDelCount(a.id);
    const db = totalDelCount(b.id);
    if (da !== db) return db - da;  // DESC: أعلى del → مقدمة → clinic؛ أقل del → idx del
    // ثالثاً: من لم يأخذ clinic أمس → أولوية للـ clinic
    const ra = wasClinicYesterday(a.id);
    const rb = wasClinicYesterday(b.id);
    if (ra !== rb) return ra - rb;
    // رابعاً: سلسلة clinic أقصر → أولوية
    const ca = consecutiveClinic.get(a.id) ?? 0;
    const cb = consecutiveClinic.get(b.id) ?? 0;
    if (ca !== cb) return ca - cb;
    // خامساً: نقاط الحمل الكلية الأقل أولاً
    const sa = totalScore(a.id);
    const sb = totalScore(b.id);
    if (sa !== sb) return sa - sb;
    // سادساً: اسم
    return a.name.localeCompare(b.name);
  };

  if (isBoardExRestricted) {
    // البورد محمي من EX (الليدر اختار عدم الإشراك) → في مقدمة pool
    const board = pool.available
      .filter((d) => d.groupTemplate.key === 'board')
      .sort(cmp);
    const others = pool.available
      .filter((d) => d.groupTemplate.key !== 'board')
      .sort(cmp);
    return { ...pool, available: [...board, ...others] };
  }
  return { ...pool, available: [...pool.available].sort(cmp) };
}

/** يضيف نقاط هذا الشفت إلى السجل الجاري (للأسبوع الحالي) */
function accumulateWeeklyScores(
  slots: AssignedSlot[],
  weeklyScore: Map<string, number>,
): void {
  for (const s of slots) {
    let pts = 0;
    if (s.role === 'clinic') pts = 1;
    else if (s.role === 'delegator') pts = 2;
    // ex = 0
    if (pts === 0) continue;
    const curr = weeklyScore.get(s.doctor.id) ?? 0;
    weeklyScore.set(s.doctor.id, curr + pts);
  }
}

/**
 * يعدّ مرّات أخذ دور لكل طبيب في الأسبوع الحالي — مرة واحدة لكل شفت.
 * (لا يحسب solo del كمرتين رغم أنه خانتين فعلياً)
 */
function accumulateRoleCount(
  slots: AssignedSlot[],
  counter: Map<string, number>,
  role: SlotRoleAssigned,
): void {
  const seen = new Set<string>();
  for (const s of slots) {
    if (s.role !== role) continue;
    if (seen.has(s.doctor.id)) continue;
    seen.add(s.doctor.id);
    const curr = counter.get(s.doctor.id) ?? 0;
    counter.set(s.doctor.id, curr + 1);
  }
}

/**
 * يحسب آخر فترة فردية أخذها كل طبيب بالعياده من سجل الأسابيع السابقة.
 *
 * - "فردي" = الطبيب أخذ فترة واحدة فقط من الشفت (عياده مشتركة)
 * - يتجاهل العيادات الكاملة (الفترتين) لأنها لا تعطي تفضيلاً لـ P1 vs P2
 * - يستخدم أحدث سجل: أعلى أسبوع → أعلى يوم → مساء قبل صباح (نفس اليوم)
 *
 * يستخدم لبداية تدوير P1/P2 من حيث انتهى الأسبوع السابق (استمرار النمط).
 */
function computeLastClinicPeriod(
  pastSlots: LoadedSlot[],
): Map<string, Period> {
  const dayOrder: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
  };
  type ShiftRecord = {
    weekStart: string;
    day: string;
    shift: Shift;
    periods: Period[];
  };
  const byDoctor = new Map<string, ShiftRecord[]>();
  for (const s of pastSlots) {
    if (s.role !== 'clinic') continue;
    if (s.status !== 'active') continue;
    const shift: Shift = s.period <= 2 ? 'morning' : 'evening';
    const arr = byDoctor.get(s.doctorId) || [];
    let rec = arr.find(
      (r) => r.weekStart === s.weekStart && r.day === s.dayOfWeek && r.shift === shift,
    );
    if (!rec) {
      rec = { weekStart: s.weekStart, day: s.dayOfWeek, shift, periods: [] };
      arr.push(rec);
    }
    rec.periods.push(s.period as Period);
    byDoctor.set(s.doctorId, arr);
  }
  const result = new Map<string, Period>();
  for (const [docId, records] of byDoctor) {
    records.sort((a, b) => {
      if (a.weekStart !== b.weekStart) return b.weekStart.localeCompare(a.weekStart);
      const da = dayOrder[a.day] ?? 0;
      const db = dayOrder[b.day] ?? 0;
      if (da !== db) return db - da;
      if (a.shift !== b.shift) return a.shift === 'evening' ? -1 : 1;
      return 0;
    });
    for (const rec of records) {
      if (rec.periods.length === 1) {
        result.set(docId, rec.periods[0]!);
        break;
      }
    }
  }
  return result;
}

/**
 * يحسب فرق (عدد P1 + P3) - (عدد P2 + P4) لكل طبيب من سجل سابق.
 *
 * يستخدم كمعيار ثانوي عند تعادل lastClinicPeriod:
 * - delta موجب = أخذ فترات أولى أكثر من فترات ثانية → حان دور P2
 * - delta سالب = العكس
 * - عيادات كاملة (P1+P2 معاً) → delta = 0 لذلك اليوم (لا أثر)
 */
function computeP1MinusP2(pastSlots: LoadedSlot[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const s of pastSlots) {
    if (s.role !== 'clinic') continue;
    if (s.status !== 'active') continue;
    const isFirst = s.period === 1 || s.period === 3;
    const delta = isFirst ? 1 : -1;
    result.set(s.doctorId, (result.get(s.doctorId) ?? 0) + delta);
  }
  return result;
}

/** يحدّث p1MinusP2 بعد كل شفت — يحسب فقط خانات clinic */
function accumulateP1MinusP2(
  slots: AssignedSlot[],
  counter: Map<string, number>,
): void {
  for (const s of slots) {
    if (s.role !== 'clinic') continue;
    const isFirst = s.period === 1 || s.period === 3;
    const delta = isFirst ? 1 : -1;
    counter.set(s.doctor.id, (counter.get(s.doctor.id) ?? 0) + delta);
  }
}

/**
 * يحدّث lastClinicPeriod بعد كل شفت — يسجّل الفترة الفردية فقط.
 *
 * - فترة واحدة (عياده مشتركة): يحدّث (يُعتبر "آخر فترة")
 * - فترتان (عياده كامله): لا يحدّث (الطبيب أخذ الشفت كاملاً، لا تفضيل)
 * - بدون عياده (EX أو دليقيتر فقط): لا يحدّث
 *
 * بهذا يستمر النمط من آخر مرة شارك فيها الطبيب عياده، حتى بعد أيام
 * EX/del/full-clinic.
 */
function recordClinicPeriods(
  slots: AssignedSlot[],
  lastClinicPeriod: Map<string, Period>,
): void {
  const byDoctorShift = new Map<string, Period[]>();
  for (const s of slots) {
    if (s.role !== 'clinic') continue;
    const shift = s.period <= 2 ? 'morning' : 'evening';
    const key = `${s.doctor.id}|${shift}`;
    const arr = byDoctorShift.get(key) || [];
    arr.push(s.period);
    byDoctorShift.set(key, arr);
  }
  for (const [key, periods] of byDoctorShift) {
    if (periods.length !== 1) continue;
    const docId = key.split('|')[0]!;
    lastClinicPeriod.set(docId, periods[0]!);
  }
}

/**
 * يحدّث lastRole + consecutiveClinic لكل طبيب لهذا اليوم.
 * - الدور المُعتمد: الأثقل (delegator > clinic > ex) للطبيب الواحد في اليوم.
 * - consecutiveClinic: +1 لو clinic، يُصفّر لو del/ex.
 */
function recordDailyRoles(
  slots: AssignedSlot[],
  lastRole: Map<string, SlotRoleAssigned>,
  consecutiveClinic: Map<string, number>,
): void {
  const rank: Record<SlotRoleAssigned, number> = {
    delegator: 3, clinic: 2, ex: 1,
  };
  // اجمع أعلى رتبة لكل طبيب اليوم
  const todayRole = new Map<string, SlotRoleAssigned>();
  for (const s of slots) {
    const prev = todayRole.get(s.doctor.id);
    if (!prev || rank[s.role] > rank[prev]) {
      todayRole.set(s.doctor.id, s.role);
    }
  }
  // طبّق
  for (const [id, role] of todayRole) {
    lastRole.set(id, role);
    if (role === 'clinic') {
      consecutiveClinic.set(id, (consecutiveClinic.get(id) ?? 0) + 1);
    } else {
      consecutiveClinic.set(id, 0);
    }
  }
}

// ─── الكتابة في DB (C6) ──────────────────────────────────────

/**
 * يحذف الخانات النشطة (status='active') للأسبوع، ثم يُدخل الجديدة
 * بـ source='ai'. الغيابات (status != 'active') تبقى لم تُمسّ.
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
    role: s.role,
    status: 'active',
    source: 'ai',
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
      errors: ['لا يوجد أطباء في القروبات الـ4 (AGD/A/B/Board)'],
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
  const pastScores = computeLoadScores(data.doctors, data.pastSlots);
  const pastExCount = computePastRoleCount(data.doctors, data.pastSlots, 'ex');
  const pastDelCount = computePastRoleCount(data.doctors, data.pastSlots, 'delegator');
  const weeklyScore = new Map<string, number>();
  const weeklyExCount = new Map<string, number>();
  const weeklyDelCount = new Map<string, number>();
  const lastRole = new Map<string, SlotRoleAssigned>();
  const consecutiveClinic = new Map<string, number>();
  // تدوير P1/P2: يبدأ من آخر فترة فردية أخذها كل طبيب بالأسابيع السابقة
  const lastClinicPeriod = computeLastClinicPeriod(data.pastSlots);
  const p1MinusP2 = computeP1MinusP2(data.pastSlots);
  // تدوير عيادة الدليقيتر: عدّاد منفصل لكل شفت (يتقدّم كل يوم عمل)
  // ليتنقّل الدليقيتر بين العيادات: ع1 ثم ع2 ثم ع3 ثم يعود
  let morningDelIdx = 0;
  let eveningDelIdx = 0;

  for (const day of plan) {
    if (day.isHoliday) continue;
    const todaysSlots: AssignedSlot[] = [];

    if (day.morning) {
      const sorted = sortPoolForDistribution(
        day.morning, pastScores, weeklyScore,
        pastExCount, weeklyExCount,
        pastDelCount, weeklyDelCount,
        lastRole, consecutiveClinic, input.boardConfig,
      );
      const res = distributeShift(
        day.day, data.clinicCount, sorted,
        pastExCount, weeklyExCount,
        pastDelCount, weeklyDelCount,
        input.boardConfig, lastClinicPeriod, p1MinusP2,
        morningDelIdx,
      );
      morningDelIdx++;
      allSlots.push(...res.slots);
      todaysSlots.push(...res.slots);
      warnings.push(...res.warnings.map((w) => `${day.day} صباح: ${w}`));
      accumulateWeeklyScores(res.slots, weeklyScore);
      accumulateRoleCount(res.slots, weeklyExCount, 'ex');
      accumulateRoleCount(res.slots, weeklyDelCount, 'delegator');
      recordClinicPeriods(res.slots, lastClinicPeriod);
      accumulateP1MinusP2(res.slots, p1MinusP2);
    }
    if (day.evening) {
      const sorted = sortPoolForDistribution(
        day.evening, pastScores, weeklyScore,
        pastExCount, weeklyExCount,
        pastDelCount, weeklyDelCount,
        lastRole, consecutiveClinic, input.boardConfig,
      );
      const res = distributeShift(
        day.day, data.clinicCount, sorted,
        pastExCount, weeklyExCount,
        pastDelCount, weeklyDelCount,
        input.boardConfig, lastClinicPeriod, p1MinusP2,
        eveningDelIdx,
      );
      eveningDelIdx++;
      allSlots.push(...res.slots);
      todaysSlots.push(...res.slots);
      warnings.push(...res.warnings.map((w) => `${day.day} مساء: ${w}`));
      accumulateWeeklyScores(res.slots, weeklyScore);
      accumulateRoleCount(res.slots, weeklyExCount, 'ex');
      accumulateRoleCount(res.slots, weeklyDelCount, 'delegator');
      recordClinicPeriods(res.slots, lastClinicPeriod);
      accumulateP1MinusP2(res.slots, p1MinusP2);
    }

    // بعد اكتمال اليوم بشفتيه، حدّث lastRole و consecutiveClinic للغد
    recordDailyRoles(todaysSlots, lastRole, consecutiveClinic);
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
  };
}

export const schedule = {
  build,
};
