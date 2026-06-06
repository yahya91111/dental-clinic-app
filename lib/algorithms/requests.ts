// ═══════════════════════════════════════════════════════════════
// خوارزميّة الطلبات — Requests engine
// ═══════════════════════════════════════════════════════════════
// وحدة مستقلّة تمامًا عن محرّك بناء الجدول (schedule.ts). تعدّل أسبوعًا
// محفوظًا بعمليّات منفصلة وواضحة، كلٌّ محروسة بطبقة صلاحيّات.
//
// العمليّات الجوهريّة:
//   أ — تبديل أطباء            swapInSchedule
//   ب — تغيير حالة في الجدول    setScheduleStatus / cancelStatus / placeInClinic / findPlacementOptions
//   ج — تغييرات الإعدادات       setClinicCount / moveDoctorGroup / setDoctorGroupStatus
//   د — مسح الجدول كاملًا       clearWeek
//
// مبدأ المايسترو: هذه الوحدة تحسب وتُطبّق فقط. الاقتراح/العرض في مساعد
// الطلبات، والإبلاغ وكشف النقص في خوارزميّة الإشعارات (لاحقًا).
// ═══════════════════════════════════════════════════════════════

import { supabase } from '../supabase';
import {
  moveDoctorBetweenGroups,
  updateDoctorWorkStatus,
  updateScheduleSettings,
  getScheduleSettings,
  getAllGroupMembers,
} from '../database';

// ─── أنواع ─────────────────────────────────────────────────────
export type WeekDay = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday';
export type Shift = 'morning' | 'evening';

/** حالات الجدول التي تُكتب في صفّ EX (period=0) */
export type ScheduleStatus =
  | 'sick_leave'        // مرضية / طبية
  | 'vacation'          // تفرّغ
  | 'permission_start'  // استئذان بداية الدوام
  | 'permission_end'    // استئذان نهاية الدوام
  | 'extra';            // احتياط

/** الفاعل الذي يطلب العمليّة — دوره يحدّد صلاحيّته */
export type Actor = { id: string; role: string };

export type RequestResult = { success: boolean; error?: string };

const ok = (): RequestResult => ({ success: true });
const fail = (error: string): RequestResult => ({ success: false, error });

// الحالات التي تُخرج الطبيب من العيادة (غياب يوم كامل / احتياط). الاستئذان
// (PS/PE) لا يُخرجه — يبقى في عيادته وتُضاف علامته فقط.
const REMOVES_FROM_CLINIC = new Set<ScheduleStatus>(['sick_leave', 'vacation', 'extra']);

// صفّ خفيّ يحفظ مكان الطبيب قبل الغياب (غير مرئيّ: لا role='clinic' ولا EX
// لأنّ status='active'). يُستعاد عند «العودة لنفس المكان».
const PREV_ROLE = 'prev_placement';

// ─── طبقة الصلاحيّات ───────────────────────────────────────────
const LEADER_PLUS = new Set(['team_leader', 'coordinator', 'super_admin', 'manager']);
const isLeaderPlus = (role: string): boolean => LEADER_PLUS.has(role);

/** الليدر فأعلى: لأيّ طبيب. الطبيب: لنفسه فقط. */
function canActOnDoctor(actor: Actor, targetDoctorId: string): boolean {
  return isLeaderPlus(actor.role) || actor.id === targetDoctorId;
}

const shiftPeriods = (shift: Shift): number[] => (shift === 'morning' ? [1, 2] : [3, 4]);
const exCellOf = (shift: Shift): number => (shift === 'morning' ? 1 : 2);

// ─── قراءة خانات يومٍ ──────────────────────────────────────────
type Row = {
  id: string;
  period: number;
  clinic_number: number;
  doctor_id: string;
  doctor_name: string;
  role: string;
  status: string;
};

async function loadDay(
  clinicId: string,
  weekStart: string,
  day: WeekDay,
): Promise<Row[]> {
  const { data, error } = await supabase
    .from('schedule_slots')
    .select('id, period, clinic_number, doctor_id, doctor_name, role, status')
    .eq('clinic_id', clinicId)
    .eq('week_start', weekStart)
    .eq('day_of_week', day);
  if (error) throw new Error(error.message);
  return (data || []) as Row[];
}

async function deleteRows(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('schedule_slots').delete().in('id', ids);
  if (error) throw new Error(error.message);
}

async function insertRows(rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from('schedule_slots').insert(rows);
  if (error) throw new Error(error.message);
}

// ═══════════════════════════════════════════════════════════════
// د — مسح الجدول كاملًا (ليدر فأعلى)
// ═══════════════════════════════════════════════════════════════
export async function clearWeek(
  actor: Actor,
  clinicId: string,
  weekStart: string,
): Promise<RequestResult> {
  if (!isLeaderPlus(actor.role)) return fail('مسح الجدول من صلاحيّة التيم ليدر فأعلى.');
  try {
    const { error } = await supabase
      .from('schedule_slots')
      .delete()
      .eq('clinic_id', clinicId)
      .eq('week_start', weekStart);
    if (error) return fail(error.message);
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

// ═══════════════════════════════════════════════════════════════
// ج — تغييرات الإعدادات (ليدر فأعلى) — تُحدِّث الحاليّ+القادم بلا إعادة توزيع
// ═══════════════════════════════════════════════════════════════
export async function setClinicCount(
  actor: Actor,
  clinicId: string,
  count: number,
): Promise<RequestResult> {
  if (!isLeaderPlus(actor.role)) return fail('تغيير عدد العيادات من صلاحيّة التيم ليدر فأعلى.');
  if (!Number.isInteger(count) || count < 1) return fail('عدد العيادات غير صالح.');
  const { error } = await updateScheduleSettings(clinicId, count);
  return error ? fail(error.message) : ok();
}

export async function moveDoctorGroup(
  actor: Actor,
  doctorId: string,
  doctorName: string,
  fromGroupId: string | null,
  toGroupId: string | null,
): Promise<RequestResult> {
  if (!isLeaderPlus(actor.role)) return fail('نقل القروب من صلاحيّة التيم ليدر فأعلى.');
  const { error } = await moveDoctorBetweenGroups(doctorId, fromGroupId, toGroupId, doctorName);
  return error ? fail(error.message) : ok();
}

export async function setDoctorGroupStatus(
  actor: Actor,
  groupId: string,
  doctorId: string,
  workStatus: string,            // active | vacation | light_duty | trainee
  supervisorDoctorId?: string | null,
): Promise<RequestResult> {
  if (!isLeaderPlus(actor.role)) return fail('تغيير حالة الطبيب في القروب من صلاحيّة التيم ليدر فأعلى.');
  const { error } = await updateDoctorWorkStatus(groupId, doctorId, workStatus, supervisorDoctorId);
  return error ? fail(error.message) : ok();
}

// ═══════════════════════════════════════════════════════════════
// ب — تغيير حالة طبيب في الجدول
// ═══════════════════════════════════════════════════════════════

/**
 * يجعل طبيبًا في يومٍ: مرضية/تفرّغ/استئذان/احتياط. للحالات التي تُخرجه من
 * العيادة نحفظ مكانه أولًا (صفوف خفيّة) ثمّ نحذف خاناته، ونكتب صفّ EX.
 * الليدر لأيّ طبيب؛ الطبيب لنفسه فقط.
 */
export async function setScheduleStatus(
  actor: Actor,
  args: {
    clinicId: string;
    weekStart: string;
    day: WeekDay;
    doctorId: string;
    doctorName: string;
    status: ScheduleStatus;
    shift: Shift;   // لتحديد جهة EX (صباح=1 / مساء=2)
  },
): Promise<RequestResult & { gaps?: Gap[] }> {
  const { clinicId, weekStart, day, doctorId, doctorName, status, shift } = args;
  if (!canActOnDoctor(actor, doctorId)) return fail('لا تملك صلاحيّة تغيير حالة هذا الطبيب.');
  try {
    const rows = await loadDay(clinicId, weekStart, day);
    const mine = rows.filter((r) => r.doctor_id === doctorId);

    // أزل أيّ حالة EX سابقة لنفس الطبيب/اليوم (تفادي التكرار)
    const oldStatusRows = mine.filter((r) => r.status !== 'active' && r.period === 0);
    await deleteRows(oldStatusRows.map((r) => r.id));

    if (REMOVES_FROM_CLINIC.has(status)) {
      // احفظ المكان قبل الغياب (خانات العيادة/الدليقيتر الفعليّة)، ثمّ احذفها
      const placed = mine.filter(
        (r) => r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'),
      );
      // امسح صفوف الحفظ القديمة ثمّ اكتب الجديدة
      const oldPrev = mine.filter((r) => r.role === PREV_ROLE);
      await deleteRows(oldPrev.map((r) => r.id));
      await insertRows(
        placed.map((r) => ({
          clinic_id: clinicId, week_start: weekStart, day_of_week: day,
          period: r.period, clinic_number: r.clinic_number,
          doctor_id: doctorId, doctor_name: doctorName,
          role: PREV_ROLE, status: 'active', source: 'request',
        })),
      );
      await deleteRows(placed.map((r) => r.id));
    }

    // اكتب صفّ الحالة (period=0، جهة EX حسب الشفت)
    await insertRows([{
      clinic_id: clinicId, week_start: weekStart, day_of_week: day,
      period: 0, clinic_number: exCellOf(shift),
      doctor_id: doctorId, doctor_name: doctorName,
      role: 'clinic', status, source: 'request',
    }]);

    // اكتشف النقص الناتج وسلّمه للمستدعي (الإشعارات تأخذه وتسأل عن التغطية)
    const { data: settings } = await getScheduleSettings(clinicId);
    const clinicCount = settings?.clinic_count ?? 2;
    const gaps = await detectGaps(clinicId, weekStart, day, clinicCount);
    return { success: true, gaps };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

/**
 * يلغي حالة طبيب ليومٍ (يُزيل صفّ EX). الطبيب لنفسه فقط؛ الليدر لأيّ أحد.
 * restoreToPrevPlace=true: يعيده إلى مكانه قبل الغياب إن وُجد محفوظًا.
 */
export async function cancelStatus(
  actor: Actor,
  args: {
    clinicId: string;
    weekStart: string;
    day: WeekDay;
    doctorId: string;
    restoreToPrevPlace?: boolean;
  },
): Promise<RequestResult> {
  const { clinicId, weekStart, day, doctorId, restoreToPrevPlace } = args;
  if (!canActOnDoctor(actor, doctorId)) return fail('لا تملك صلاحيّة إلغاء حالة هذا الطبيب.');
  try {
    const rows = await loadDay(clinicId, weekStart, day);
    const mine = rows.filter((r) => r.doctor_id === doctorId);

    // أزل صفّ الحالة (period=0 وحالته ليست active)
    await deleteRows(mine.filter((r) => r.period === 0 && r.status !== 'active').map((r) => r.id));

    const prev = mine.filter((r) => r.role === PREV_ROLE);
    if (restoreToPrevPlace && prev.length > 0) {
      // أعِده لمكانه الأصليّ (خانات عيادة/دليقيتر فعليّة)
      await insertRows(
        prev.map((r) => ({
          clinic_id: clinicId, week_start: weekStart, day_of_week: day,
          period: r.period, clinic_number: r.clinic_number,
          doctor_id: r.doctor_id, doctor_name: r.doctor_name,
          role: r.clinic_number === 0 ? 'delegator' : 'clinic', status: 'active', source: 'request',
        })),
      );
    }
    // امسح صفوف الحفظ في الحالتين
    await deleteRows(prev.map((r) => r.id));
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

/**
 * يضع طبيبًا في عيادة/فترات محدّدة (العكس: من غياب إلى داخل العيادة).
 * الليدر لأيّ مكان؛ الطبيب لنفسه في مكان متاح (يُتحقَّق عبر findPlacementOptions
 * في المساعد قبل النداء). يُزيل أيضًا صفّ الحالة إن وُجد.
 */
export async function placeInClinic(
  actor: Actor,
  args: {
    clinicId: string;
    weekStart: string;
    day: WeekDay;
    doctorId: string;
    doctorName: string;
    clinicNumber: number;
    periods: number[];   // الفترات التي يُوضع فيها (مثلًا [1,2] صباح كامل)
  },
): Promise<RequestResult> {
  const { clinicId, weekStart, day, doctorId, doctorName, clinicNumber, periods } = args;
  if (!canActOnDoctor(actor, doctorId)) return fail('لا تملك صلاحيّة تنسيب هذا الطبيب.');
  if (!Number.isInteger(clinicNumber) || clinicNumber < 1) return fail('رقم العيادة غير صالح.');
  if (!periods.length) return fail('يجب تحديد فترة واحدة على الأقلّ.');
  try {
    const rows = await loadDay(clinicId, weekStart, day);
    const mine = rows.filter((r) => r.doctor_id === doctorId);

    // أزل حالته الغائبة وصفوف الحفظ (سيدخل العيادة فعليًّا)
    await deleteRows(
      mine.filter((r) => r.role === PREV_ROLE || (r.period === 0 && r.status !== 'active')).map((r) => r.id),
    );
    // لا تكرّر إن كان موجودًا في نفس الخانة
    const existing = new Set(
      mine.filter((r) => r.role === 'clinic' && r.status === 'active').map((r) => `${r.period}|${r.clinic_number}`),
    );
    const toAdd = periods
      .filter((p) => !existing.has(`${p}|${clinicNumber}`))
      .map((p) => ({
        clinic_id: clinicId, week_start: weekStart, day_of_week: day,
        period: p, clinic_number: clinicNumber,
        doctor_id: doctorId, doctor_name: doctorName,
        role: 'clinic', status: 'active', source: 'request',
      }));
    await insertRows(toAdd);
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

/** خانة متاحة للتنسيب: فارغة، أو قابلة للمشاركة (طبيب يغطّي فترتي الشفت وحده) */
export type PlacementOption =
  | { kind: 'empty'; clinicNumber: number; period: number; shift: Shift }
  | { kind: 'shareable'; clinicNumber: number; period: number; shift: Shift; withDoctorId: string; withDoctorName: string };

/**
 * يقرأ جدول يومٍ ويُرجِع الأماكن المتاحة لإرجاع طبيب للعيادة:
 *  - فترة لا يشغلها أحد (empty).
 *  - عيادة فيها طبيب واحد يغطّي فترتي الشفت → يمكن مشاركته فترة (shareable).
 * مصدر اقتراح مساعد الطلبات، وأيضًا ما يختار منه الطبيب يدويًّا.
 */
export async function findPlacementOptions(
  clinicId: string,
  weekStart: string,
  day: WeekDay,
  clinicCount: number,
): Promise<PlacementOption[]> {
  const rows = await loadDay(clinicId, weekStart, day);
  const clinic = rows.filter((r) => r.role === 'clinic' && r.status === 'active' && r.period > 0);
  const at = (cn: number, p: number) => clinic.filter((r) => r.clinic_number === cn && r.period === p);
  const out: PlacementOption[] = [];

  for (const shift of ['morning', 'evening'] as Shift[]) {
    const [p1, p2] = shiftPeriods(shift);
    for (let cn = 1; cn <= clinicCount; cn++) {
      const a = at(cn, p1);
      const b = at(cn, p2);
      // فترات فارغة
      if (a.length === 0) out.push({ kind: 'empty', clinicNumber: cn, period: p1, shift });
      if (b.length === 0) out.push({ kind: 'empty', clinicNumber: cn, period: p2, shift });
      // قابل للمشاركة: نفس الطبيب الواحد يغطّي الفترتين
      if (a.length === 1 && b.length === 1 && a[0]!.doctor_id === b[0]!.doctor_id) {
        out.push({
          kind: 'shareable', clinicNumber: cn, period: p2, shift,
          withDoctorId: a[0]!.doctor_id, withDoctorName: a[0]!.doctor_name,
        });
      }
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// كشف النقص + مرشّحو التغطية (حساب حتميّ — تُسلَّم نتيجته للإشعارات)
// ═══════════════════════════════════════════════════════════════
// الطلبات تكتشف أين بقيت خانة بلا تغطية وتُرجِع مرشّحين مؤهَّلين للسؤال.
// السؤال الفعليّ للأطباء + اختيار الحلّ = خوارزميّة الإشعارات.

/** خانة بلا تغطية فعليّة (عيادة/فترة) بعد غياب أو استئذان */
export type Gap = { clinicNumber: number; period: number; shift: Shift };

/** طبيب مؤهَّل لسؤاله عن التبديل لتغطية النقص (من الفترة الأخرى) */
export type CoverageCandidate = {
  doctorId: string;
  doctorName: string;
  clinicNumber: number;   // عيادته الحاليّة
  period: number;         // الفترة الأخرى التي يعمل فيها
};

/**
 * من علامات الاستئذان (period=0) نستنتج الفترات التي يغيب فيها الطبيب فعليًّا:
 *  - بداية الدوام → غائب الفترة الأولى من شفته (P1 صباح / P3 مساء).
 *  - نهاية الدوام → غائب الفترة الثانية (P2 / P4).
 * جهة الشفت من clinic_number للعلامة: 1=صباح، 2=مساء.
 */
function permissionAbsences(rows: Row[]): Map<string, Set<number>> {
  const m = new Map<string, Set<number>>();
  for (const r of rows) {
    if (r.period !== 0) continue;
    if (r.status !== 'permission_start' && r.status !== 'permission_end') continue;
    const shift: Shift = r.clinic_number === 2 ? 'evening' : 'morning';
    const [p1, p2] = shiftPeriods(shift);
    const absentP = r.status === 'permission_start' ? p1 : p2;
    if (!m.has(r.doctor_id)) m.set(r.doctor_id, new Set());
    m.get(r.doctor_id)!.add(absentP);
  }
  return m;
}

/**
 * يكتشف الخانات المكشوفة في يومٍ: لكلّ عيادة تعمل في شفت، أيّ فترة لا يحضرها
 * أحد فعليًّا (بعد طرح المُستأذِنين في تلك الفترة) → نقص. يعمّ كلّ الفترات
 * والشفتين، ويراعي استئذان البداية والنهاية معًا.
 */
export async function detectGaps(
  clinicId: string,
  weekStart: string,
  day: WeekDay,
  clinicCount: number,
): Promise<Gap[]> {
  const rows = await loadDay(clinicId, weekStart, day);
  const permAbs = permissionAbsences(rows);
  const clinic = rows.filter((r) => r.role === 'clinic' && r.status === 'active' && r.period > 0);
  const present = (cn: number, p: number) =>
    clinic.filter((r) => r.clinic_number === cn && r.period === p && !permAbs.get(r.doctor_id)?.has(p));
  const gaps: Gap[] = [];

  for (const shift of ['morning', 'evening'] as Shift[]) {
    const [p1, p2] = shiftPeriods(shift);
    for (let cn = 1; cn <= clinicCount; cn++) {
      // العيادة «تعمل» هذا الشفت إن كان لها أيّ تكليف فيه (حتى لو صاحبه مستأذِن)
      const operates = clinic.some((r) => r.clinic_number === cn && (r.period === p1 || r.period === p2));
      if (!operates) continue;
      for (const p of [p1, p2]) {
        if (present(cn, p).length === 0) gaps.push({ clinicNumber: cn, period: p, shift });
      }
    }
  }
  return gaps;
}

/**
 * مرشّحو تغطية نقصٍ ما: أطباء يعملون في **الفترة الأخرى** من نفس الشفت،
 * يمكن سؤالهم عن التبديل. يُستثنى:
 *  - طبيب التخفيف (light_duty).
 *  - المُستأذِن في فترة النقص نفسها (لا يستطيع تغطيتها — يشمل الزميل المغادر).
 * (الاختيار النهائيّ والسؤال = الإشعارات.)
 */
export async function findCoverageCandidates(
  clinicId: string,
  weekStart: string,
  day: WeekDay,
  gap: Gap,
): Promise<CoverageCandidate[]> {
  const rows = await loadDay(clinicId, weekStart, day);
  const permAbs = permissionAbsences(rows);
  const { data: members } = await getAllGroupMembers(clinicId);
  const lightDuty = new Set(
    (members || []).filter((m: { work_status?: string }) => m.work_status === 'light_duty')
      .map((m: { doctor_id: string }) => m.doctor_id),
  );

  const [p1, p2] = shiftPeriods(gap.shift);
  const other = gap.period === p1 ? p2 : p1;
  const inOther = rows.filter((r) => r.role === 'clinic' && r.status === 'active' && r.period === other);

  const seen = new Set<string>();
  const out: CoverageCandidate[] = [];
  for (const r of inOther) {
    if (seen.has(r.doctor_id)) continue;
    if (lightDuty.has(r.doctor_id)) continue;                  // طبيب تخفيف
    if (permAbs.get(r.doctor_id)?.has(gap.period)) continue;   // مستأذِن في فترة النقص
    seen.add(r.doctor_id);
    out.push({ doctorId: r.doctor_id, doctorName: r.doctor_name, clinicNumber: r.clinic_number, period: other });
  }
  return out;
}

/**
 * مرشّحو تغطيةٍ من شفتٍ كامل (للتصعيد إلى الشفت الآخر حين يفشل نفس الشفت).
 * أطباء لهم خانات في الشفت المستهدف، يُستثنى طبيب التخفيف والمُستأذِن في فترة
 * النقص والطبيب الغائب نفسه. القبول يُطبّق تبديلًا لليوم كامل (خانة بخانة).
 */
export async function findShiftCandidates(
  clinicId: string,
  weekStart: string,
  day: WeekDay,
  targetShift: Shift,
  opts: { excludeDoctorId?: string; gapPeriod?: number } = {},
): Promise<CoverageCandidate[]> {
  const rows = await loadDay(clinicId, weekStart, day);
  const permAbs = permissionAbsences(rows);
  const { data: members } = await getAllGroupMembers(clinicId);
  const lightDuty = new Set(
    (members || []).filter((m: { work_status?: string }) => m.work_status === 'light_duty')
      .map((m: { doctor_id: string }) => m.doctor_id),
  );
  const periods = shiftPeriods(targetShift);
  const inShift = rows.filter(
    (r) => r.role === 'clinic' && r.status === 'active' && periods.includes(r.period),
  );

  const seen = new Set<string>();
  const out: CoverageCandidate[] = [];
  for (const r of inShift) {
    if (seen.has(r.doctor_id)) continue;
    if (r.doctor_id === opts.excludeDoctorId) continue;        // الغائب نفسه
    if (lightDuty.has(r.doctor_id)) continue;                  // طبيب تخفيف
    if (opts.gapPeriod != null && permAbs.get(r.doctor_id)?.has(opts.gapPeriod)) continue;
    seen.add(r.doctor_id);
    out.push({ doctorId: r.doctor_id, doctorName: r.doctor_name, clinicNumber: r.clinic_number, period: r.period });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// أ — تبديل أطباء في الجدول
// ═══════════════════════════════════════════════════════════════

export type SwapScope =
  | { kind: 'day' }
  | { kind: 'shift'; shift: Shift }
  | { kind: 'period'; period: number };

/**
 * يبدّل خانات مجموعة أطباء (اثنين أو أكثر = تبديل متسلسل دائريّ) ضمن نطاق
 * (فترة/شفت/يوم). كلّ طبيب يأخذ مكان التالي. لا يلمس صفوف الغياب (period=0).
 * الليدر فوري؛ الطبيب يجب أن يكون أحد المعنيّين (الموافقة تُدار في الإشعارات).
 */
export async function swapInSchedule(
  actor: Actor,
  args: {
    clinicId: string;
    weekStart: string;
    day: WeekDay;
    doctorIds: string[];   // مرتّبون؛ كلٌّ يأخذ مكان التالي دائريًّا
    scope: SwapScope;
  },
): Promise<RequestResult> {
  const { clinicId, weekStart, day, doctorIds, scope } = args;
  if (doctorIds.length < 2) return fail('التبديل يحتاج طبيبين على الأقلّ.');
  if (!isLeaderPlus(actor.role) && !doctorIds.includes(actor.id)) {
    return fail('لا تملك صلاحيّة هذا التبديل.');
  }
  // نطاق الفترات
  const periodsInScope: number[] | null =
    scope.kind === 'day' ? [1, 2, 3, 4]
      : scope.kind === 'shift' ? shiftPeriods(scope.shift)
        : [scope.period];

  try {
    const rows = await loadDay(clinicId, weekStart, day);
    // خريطة: صاحب الخانة الحاليّ → مَن سيشغلها (التالي دائريًّا)
    const next = new Map<string, { id: string; name: string }>();
    const nameOf = (id: string) => rows.find((r) => r.doctor_id === id)?.doctor_name || '';
    for (let i = 0; i < doctorIds.length; i++) {
      const cur = doctorIds[i]!;
      const nxt = doctorIds[(i + 1) % doctorIds.length]!;
      next.set(cur, { id: nxt, name: nameOf(nxt) });
    }

    const affected = rows.filter(
      (r) => r.period > 0 && r.status === 'active' && (r.role === 'clinic' || r.role === 'delegator')
        && periodsInScope.includes(r.period) && next.has(r.doctor_id),
    );
    if (affected.length === 0) return fail('لا توجد خانات للأطباء المحدّدين في هذا النطاق.');

    // طبّق التبديل خانةً بخانة (تحديث doctor_id/name مع ثبات الموضع)
    for (const r of affected) {
      const to = next.get(r.doctor_id)!;
      const { error } = await supabase
        .from('schedule_slots')
        .update({ doctor_id: to.id, doctor_name: to.name, updated_at: new Date().toISOString() })
        .eq('id', r.id);
      if (error) return fail(error.message);
    }
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

// ─── تجميع التصدير ─────────────────────────────────────────────
export const requests = {
  // أ
  swapInSchedule,
  // ب
  setScheduleStatus, cancelStatus, placeInClinic, findPlacementOptions,
  // كشف النقص + مرشّحو التغطية (تُسلَّم للإشعارات)
  detectGaps, findCoverageCandidates, findShiftCandidates,
  // ج
  setClinicCount, moveDoctorGroup, setDoctorGroupStatus,
  // د
  clearWeek,
};
