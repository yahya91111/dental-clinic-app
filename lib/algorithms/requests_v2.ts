// ═══════════════════════════════════════════════════════════════
// خوارزميّة الطلبات — Requests engine (إعادة بناء نظيفة v2)
// ═══════════════════════════════════════════════════════════════
// وحدة مستقلّة عن محرّك بناء الجدول. تعدّل أسبوعًا (محفوظًا أو فارغًا)
// بعمليّات منفصلة واضحة، كلٌّ محروسة بطبقة صلاحيّات. المايسترو: تحسب
// وتُطبّق فقط؛ العرض في مساعد الطلبات.
//
// نُبنى قدرةً قدرة مع تحقّق:
//   ✅ الأساس + الحالة     setScheduleStatus / cancelStatus
//   ⏳ التنسيب              placeInClinic / findPlacementOptions
//   ⏳ التبديل              swapInSchedule
//   ⏳ الإعدادات           setClinicCount / moveDoctorGroup / setDoctorGroupStatus
//   ⏳ المسح               clearWeek
// ═══════════════════════════════════════════════════════════════

import { supabase } from '../supabase';
import {
  getAllGroupMembers,
  moveDoctorBetweenGroups,
  updateDoctorWorkStatus,
  updateScheduleSettings,
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

/** مكان نقصٍ نشأ عن غياب طبيب — عيادة برقمها أو الدليقيتر. بلا فترات (قرار التصميم:
 *  نذكر اليوم والمكان فقط، لا الفترة). */
export type GapLocation =
  | { kind: 'clinic'; clinicNumber: number }
  | { kind: 'delegator' };

/** نتيجة تسجيل حالة — مع أماكن النقص الناتجة (إن أخرجت الطبيب من العيادة). */
export type StatusResult = RequestResult & { gaps?: GapLocation[] };

const ok = (): RequestResult => ({ success: true });
const fail = (error: string): RequestResult => ({ success: false, error });

/** أماكن النقص من خانات الطبيب المُزالة: عيادة (clinic_number>0) أو دليقيتر
 *  (role='delegator' أو clinic_number=0). مُزال التكرار، بلا فترات. */
function gapsFrom(placed: Row[]): GapLocation[] {
  const seen = new Set<string>();
  const out: GapLocation[] = [];
  for (const r of placed) {
    if (r.role === 'delegator' || r.clinic_number === 0) {
      if (!seen.has('deleg')) { seen.add('deleg'); out.push({ kind: 'delegator' }); }
    } else {
      const k = `c${r.clinic_number}`;
      if (!seen.has(k)) { seen.add(k); out.push({ kind: 'clinic', clinicNumber: r.clinic_number }); }
    }
  }
  return out;
}

// الحالات التي تُخرج الطبيب من العيادة (غياب يوم كامل / احتياط). الاستئذان
// (PS/PE) لا يُخرجه — يبقى في عيادته وتُضاف علامته فقط.
const REMOVES_FROM_CLINIC = new Set<ScheduleStatus>(['sick_leave', 'vacation', 'extra']);

// صفّ خفيّ يحفظ مكان الطبيب قبل الغياب (status='active' فلا يظهر كخانة عيادة).
// يُستعاد عند «العودة لنفس المكان».
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

// ─── قراءة/كتابة خانات يومٍ ────────────────────────────────────
type Row = {
  id: string;
  period: number;
  clinic_number: number;
  doctor_id: string;
  doctor_name: string;
  role: string;
  status: string;
};

async function loadDay(clinicId: string, weekStart: string, day: WeekDay): Promise<Row[]> {
  const { data, error } = await supabase
    .from('schedule_slots')
    .select('id, period, clinic_number, doctor_id, doctor_name, role, status')
    .eq('clinic_id', clinicId)
    .eq('week_start', weekStart)
    .eq('day_of_week', day);
  if (error) throw new Error(error.message);
  return (data || []) as Row[];
}

/** فترات تنسيب الطبيب النشطة في الأسبوع (لاستنتاج شفته حين لا يكون منسَّبًا في يومٍ ما).
 *  excludeDay يُستبعَد لأنّ غيابه يُسجَّل فيه. */
async function loadDoctorWeekPeriods(
  clinicId: string,
  weekStart: string,
  doctorId: string,
  excludeDay: WeekDay,
): Promise<number[]> {
  const { data, error } = await supabase
    .from('schedule_slots')
    .select('period, day_of_week, role, status')
    .eq('clinic_id', clinicId)
    .eq('week_start', weekStart)
    .eq('doctor_id', doctorId)
    .eq('status', 'active')
    .gt('period', 0);
  if (error) return [];
  return ((data || []) as { period: number; day_of_week: string; role: string }[])
    .filter((r) => r.day_of_week !== excludeDay && (r.role === 'clinic' || r.role === 'delegator'))
    .map((r) => r.period);
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
// الحالة — مرضية/تفرّغ/استئذان/احتياط
// ═══════════════════════════════════════════════════════════════

/**
 * يجعل طبيبًا في يومٍ في حالةٍ ما. للحالات التي تُخرجه من العيادة نحفظ مكانه
 * أوّلًا (صفّ خفيّ) ثمّ نحذف خاناته، ونكتب صفّ EX. المتدرّب الظلّ (المبتدئ
 * الملتصق بمدرّبه) يصبح احتياطيًّا تلقائيًّا عند غياب مدرّبه. الليدر لأيّ طبيب؛
 * الطبيب لنفسه فقط.
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
    shift: Shift; // لتحديد جهة EX (صباح=1 / مساء=2) — يُصحَّح من مكانه الفعليّ
  },
): Promise<StatusResult> {
  const { clinicId, weekStart, day, doctorId, doctorName, status, shift } = args;
  if (!canActOnDoctor(actor, doctorId)) return fail('لا تملك صلاحيّة تغيير حالة هذا الطبيب.');
  let gaps: GapLocation[] = [];
  try {
    const rows = await loadDay(clinicId, weekStart, day);
    const mine = rows.filter((r) => r.doctor_id === doctorId);

    // الشفت الفعليّ من مكان الطبيب في الجدول (٣/٤ = مساء)، لا من قيمة الذكاء.
    const myActive = mine.filter(
      (r) => r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'),
    );
    let effShift: Shift | null =
      myActive.some((r) => r.period >= 3) ? 'evening'
        : myActive.some((r) => r.period <= 2) ? 'morning'
          : null;
    // غير منسَّب اليوم؟ استنتج شفته من تنسيبه في بقيّة الأسبوع (بيانات حقيقيّة) قبل
    // اللجوء لقيمة الذكاء — فلا تذهب مرضية المساء إلى جهة الصباح.
    if (effShift === null) {
      const wk = await loadDoctorWeekPeriods(clinicId, weekStart, doctorId, day);
      effShift = wk.some((p) => p >= 3) ? 'evening'
        : wk.some((p) => p <= 2) ? 'morning'
          : shift; // آخر ملاذ: ما مرّره الذكاء (وإلّا صباح افتراضيًّا)
    }

    // أزِل أيّ حالة EX سابقة لنفس الطبيب/اليوم (تفادي التكرار)
    const oldStatusRows = mine.filter((r) => r.status !== 'active' && r.period === 0);
    await deleteRows(oldStatusRows.map((r) => r.id));

    if (REMOVES_FROM_CLINIC.has(status)) {
      // احفظ المكان قبل الغياب (خانات العيادة/الدليقيتر الفعليّة)، ثمّ احذفها
      const placed = mine.filter(
        (r) => r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'),
      );
      gaps = gapsFrom(placed); // أماكن النقص قبل حذف الخانات (عيادة + دليقيتر، بلا فترات)
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

      // المتدرّب الظلّ (المبتدئ الملتصق بمدرّبه): عند غياب المدرّب يصبح احتياطيًّا
      // (EX) — مطابقةً لخوارزميّة البناء. نتعرّف عليه بمطابقة خاناته تمامًا لخانات
      // مدرّبه (المتدرّب المستقلّ لا يُطابق فلا يُنقل).
      const { data: members } = await getAllGroupMembers(clinicId);
      const supKeys = new Set(placed.map((r) => `${r.period}|${r.clinic_number}|${r.role}`));
      const shadows = ((members || []) as {
        doctor_id: string; doctor_name: string; work_status?: string; supervisor_doctor_id?: string | null;
      }[]).filter((m) => m.work_status === 'trainee' && m.supervisor_doctor_id === doctorId);
      for (const t of shadows) {
        const tSlots = rows.filter(
          (r) => r.doctor_id === t.doctor_id && r.period > 0 && r.status === 'active'
            && (r.role === 'clinic' || r.role === 'delegator'),
        );
        const tKeys = tSlots.map((r) => `${r.period}|${r.clinic_number}|${r.role}`);
        if (placed.length === 0 || tSlots.length !== placed.length || !tKeys.every((k) => supKeys.has(k))) continue;
        await deleteRows(tSlots.map((r) => r.id));
        const tOldEx = rows.filter((r) => r.doctor_id === t.doctor_id && r.period === 0);
        await deleteRows(tOldEx.map((r) => r.id));
        await insertRows([{
          clinic_id: clinicId, week_start: weekStart, day_of_week: day,
          period: 0, clinic_number: exCellOf(effShift),
          doctor_id: t.doctor_id, doctor_name: t.doctor_name,
          role: 'clinic', status: 'extra', source: 'request',
        }]);
      }
    }

    // اكتب صفّ الحالة (period=0، جهة EX حسب الشفت الفعليّ)
    await insertRows([{
      clinic_id: clinicId, week_start: weekStart, day_of_week: day,
      period: 0, clinic_number: exCellOf(effShift),
      doctor_id: doctorId, doctor_name: doctorName,
      role: 'clinic', status, source: 'request',
    }]);

    return { success: true, gaps };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

/**
 * يلغي حالة طبيب ليومٍ (يُزيل صفّ EX). الطبيب لنفسه؛ الليدر لأيّ أحد.
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

    // أزِل صفّ الحالة (period=0 وحالته ليست active)
    await deleteRows(mine.filter((r) => r.period === 0 && r.status !== 'active').map((r) => r.id));

    const prev = mine.filter((r) => r.role === PREV_ROLE);
    if (restoreToPrevPlace && prev.length > 0) {
      await insertRows(
        prev.map((r) => ({
          clinic_id: clinicId, week_start: weekStart, day_of_week: day,
          period: r.period, clinic_number: r.clinic_number,
          doctor_id: r.doctor_id, doctor_name: r.doctor_name,
          role: r.clinic_number === 0 ? 'delegator' : 'clinic', status: 'active', source: 'request',
        })),
      );
    }
    await deleteRows(prev.map((r) => r.id));
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

// ═══════════════════════════════════════════════════════════════
// التغطية — حقائق النقص لِيصوغها الذكاء (المايسترو: المحرّك يحسب، الذكاء يتكلّم)
// ═══════════════════════════════════════════════════════════════
// بعد غياب طبيبٍ يخرجه من العيادة، نحسب للقائد:
//  - أماكن النقص: عيادة (برقمها) + الدليقيتر إن كان له دوران — **بلا فترات**.
//  - لكلّ عيادة: زميلٌ في نفس العيادة يستلم الفترتين (إن وُجد، وليس تخفيف/ظلّ).
//  - الاحتياطيّون في جهة الشفت بأسمائهم (إن وُجدوا).
// نُرجِع حقائق منظَّمة فقط؛ الذكاء يصوغ الرسالة بأسلوبه كأنّها منه.

/** نقصٌ في مكانٍ واحد مع حلوله الخاصّة (بلا فترات في العرض):
 *  - عيادة: زميلٌ في نفس العيادة يستلم الفترتين.
 *  - دليقيتر: مرشّحون من عيادات بها طبيبان+ (يتفرّغ أحدهم)؛ أو طبيبان يتناوبان إن
 *    كانت كلّ العيادات منفردة (needsPair). */
export type Doc = { id: string; name: string };

/** نقصٌ مع حلوله (بلا فترات في العرض):
 *  - clinic: غياب طبيب عيادة فقط → زميله يستلم الفترتين.
 *  - delegator_combo: غياب طبيبٍ يجمع عيادة (ب_a) + دليقيتر (ب_b) → خياران (أ/ب).
 *  - delegator: نادر (دليقيتر فقط) → المتفرّغون في فترته. */
export type CoverageGap =
  | { kind: 'clinic'; clinicNumber: number; twoPeriodColleague: Doc | null }
  | { kind: 'delegator'; candidates: Doc[] }
  | {
      kind: 'delegator_combo';
      clinicNumber: number;            // عيادة الغائب
      clinicColleague: Doc | null;     // زميله فيها (للخيار ب يستلمها كاملة)
      // أ: طبيب ب_a من عيادة أخرى يحلّ محلّ الغائب كاملًا، وزميله (ب_b) يستلم عيادته
      optionA: { cover: Doc; coverClinic: number; backfill: Doc | null }[];
      // ب: عيادة أخرى (طبياها) تتولّى الدليقيتر بالتناوب
      optionB: { clinicNumber: number; a: Doc; b: Doc }[];
    };

/** كلّ ما يحتاجه الذكاء لِيتكلّم عن نقصٍ نتج عن غياب طبيب. */
export type CoverageBrief = {
  day: WeekDay;
  absentName: string;
  gaps: CoverageGap[];                       // عيادة/دليقيتر — بلا فترات
  reserves: { id: string; name: string }[];  // الاحتياطيّون المتاحون
};

/**
 * يحسب حقائق التغطية لِيوم/طبيبٍ غائب من صفوف الحفظ (PREV_ROLE) التي كُتبت وقت
 * الغياب. يُرجِع null إن لم يكن هناك نقص (لم يُخرَج من عيادة). نقيّ حسابيّ.
 */
export async function computeCoverageBrief(args: {
  clinicId: string;
  weekStart: string;
  day: WeekDay;
  doctorId: string;
  doctorName: string;
}): Promise<CoverageBrief | null> {
  const { clinicId, weekStart, day, doctorId, doctorName } = args;
  const rows = await loadDay(clinicId, weekStart, day);
  const prev = rows.filter((r) => r.role === PREV_ROLE && r.doctor_id === doctorId);
  if (prev.length === 0) return null; // لا نقص (استئذان/لم يكن مُنسَّبًا)

  const { data: members } = await getAllGroupMembers(clinicId);
  const lightDuty = new Set(
    ((members || []) as { doctor_id: string; work_status?: string }[])
      .filter((m) => m.work_status === 'light_duty').map((m) => m.doctor_id),
  );
  const clinic = rows.filter((r) => r.role === 'clinic' && r.status === 'active' && r.period > 0);
  // الظلّ (متدرّب يطابق خانات مدرّبه) يُستبعَد من المرشّحين — لا يُغطّي وحده.
  const keysOf = (id: string) =>
    new Set(clinic.filter((r) => r.doctor_id === id).map((r) => `${r.period}|${r.clinic_number}|${r.role}`));
  const shadowIds = new Set<string>();
  for (const m of (members || []) as { doctor_id: string; work_status?: string; supervisor_doctor_id?: string | null }[]) {
    if (m.work_status !== 'trainee' || !m.supervisor_doctor_id) continue;
    const tk = [...keysOf(m.doctor_id)];
    const sk = keysOf(m.supervisor_doctor_id);
    if (tk.length > 0 && tk.length === sk.size && tk.every((k) => sk.has(k))) shadowIds.add(m.doctor_id);
  }
  const blocked = (id: string) => id === doctorId || lightDuty.has(id) || shadowIds.has(id);

  const uniqDoc = (list: { id: string; name: string }[]) => {
    const seen = new Set<string>();
    return list.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  };

  // كلّ التكليفات النشطة في اليوم (عيادة/دليقيتر) — لحساب «المتفرّغ في فترة»
  const activeAssign = rows.filter(
    (r) => r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'),
  );
  const assignedAt = (P: number) => new Set(activeAssign.filter((r) => r.period === P).map((r) => r.doctor_id));
  const periodsOfShift = (P: number): number[] => (P >= 3 ? [3, 4] : [1, 2]);
  // المتفرّغون في الفترة P **من نفس الشفت فقط**: طبيبٌ له تكليف في إحدى فترات هذا الشفت
  // لكنه غير مكلَّف في P تحديدًا (عيادته يغطّيها زميله تلك الفترة) — يصلح لاستلام
  // الدليقيتر في P. أطباء الشفت الآخر لا يُحسبون «متفرّغين» لأنّهم ليسوا حاضرين أصلًا.
  const freeAt = (P: number) => {
    const sp = periodsOfShift(P);
    const busy = assignedAt(P);
    return uniqDoc(
      activeAssign
        .filter((r) => sp.includes(r.period) && !busy.has(r.doctor_id) && !blocked(r.doctor_id))
        .map((r) => ({ id: r.doctor_id, name: r.doctor_name })),
    );
  };
  // طبيب عيادةٍ نشطٌ في (عيادة، فترة) معيّنة — غير محجوب
  const docAt = (clinicNum: number, P: number): Doc | null => {
    const c = clinic.find((x) => x.clinic_number === clinicNum && x.period === P && !blocked(x.doctor_id));
    return c ? { id: c.doctor_id, name: c.doctor_name } : null;
  };

  const gaps: CoverageGap[] = [];
  const absentShiftCols = new Set<number>(); // أعمدة EX لجهات شفت النقص (1 صباح / 2 مساء)
  for (const r of prev) absentShiftCols.add(r.period >= 3 ? 2 : 1);

  const prevClinicRows = prev.filter((r) => r.clinic_number > 0); // عيادة الغائب
  const prevDelegRows = prev.filter((r) => r.clinic_number === 0); // دليقيتر الغائب

  if (prevClinicRows.length > 0 && prevDelegRows.length > 0) {
    // ── حالة مركّبة: عيادة (ب_a) + دليقيتر (ب_b) ──
    const C = prevClinicRows[0]!.clinic_number;
    const aP = prevClinicRows[0]!.period; // فترة العيادة
    const bP = prevDelegRows[0]!.period;  // فترة الدليقيتر
    const sp = periodsOfShift(aP);
    const clinicColleague = docAt(C, bP); // زميله في عيادته (الفترة الأخرى)
    const otherClinics = [...new Set(
      clinic.filter((c) => sp.includes(c.period) && c.clinic_number !== C).map((c) => c.clinic_number),
    )];
    const optionA: { cover: Doc; coverClinic: number; backfill: Doc | null }[] = [];
    const optionB: { clinicNumber: number; a: Doc; b: Doc }[] = [];
    for (const D of otherClinics) {
      const X = docAt(D, aP); // طبيب ب_a في عيادة أخرى (يصلح بديلًا كاملًا)
      const Y = docAt(D, bP); // زميله ب_b (يستلم عيادتهما، أو يتناوب على الدليقيتر)
      if (X) optionA.push({ cover: X, coverClinic: D, backfill: Y });
      if (X && Y) optionB.push({ clinicNumber: D, a: X, b: Y });
    }
    gaps.push({ kind: 'delegator_combo', clinicNumber: C, clinicColleague, optionA, optionB });
  } else {
    // ── حالات بسيطة: عيادة فقط أو دليقيتر فقط ──
    const seenLoc = new Set<string>();
    for (const r of prev) {
      if (r.clinic_number === 0) {
        if (seenLoc.has('deleg')) continue;
        seenLoc.add('deleg');
        gaps.push({ kind: 'delegator', candidates: freeAt(r.period) });
      } else {
        const k = `c${r.clinic_number}`;
        if (seenLoc.has(k)) continue;
        seenLoc.add(k);
        // زميل نفس العيادة ونفس الشفت يستلم الفترتين (العيادة قد تُستعمل في الشفتين)
        const sp = periodsOfShift(r.period);
        const mate = clinic.find(
          (c) => c.clinic_number === r.clinic_number && sp.includes(c.period) && !blocked(c.doctor_id),
        );
        gaps.push({
          kind: 'clinic', clinicNumber: r.clinic_number,
          twoPeriodColleague: mate ? { id: mate.doctor_id, name: mate.doctor_name } : null,
        });
      }
    }
  }

  // الاحتياطيّون في جهة (جهات) شفت النقص — بأسمائهم
  const reserves = uniqDoc(
    rows
      .filter((r) => r.period === 0 && r.status === 'extra' && absentShiftCols.has(r.clinic_number) && !blocked(r.doctor_id))
      .map((r) => ({ id: r.doctor_id, name: r.doctor_name })),
  );

  return { day, absentName: doctorName, gaps, reserves };
}

// ═══════════════════════════════════════════════════════════════
// التبديل — تبديل خانات أطباء (تسلسل دائريّ) ضمن نطاق
// ═══════════════════════════════════════════════════════════════

export type SwapScope =
  | { kind: 'day' }
  | { kind: 'shift'; shift: Shift }
  | { kind: 'period'; period: number };

/**
 * يبدّل خانات مجموعة أطباء (اثنين أو أكثر = تسلسل دائريّ) ضمن نطاق (فترة/شفت/يوم).
 * كلٌّ يأخذ مكان التالي. لا يلمس صفوف الغياب (period=0). الليدر فوري؛ غير الليدر
 * يجب أن يكون أحد المعنيّين (الموافقة تُدار خارجه — في وحدة الإشعارات).
 */
export async function swapInSchedule(
  actor: Actor,
  args: {
    clinicId: string;
    weekStart: string;
    day: WeekDay;
    doctorIds: string[]; // مرتّبون؛ كلٌّ يأخذ مكان التالي دائريًّا
    scope: SwapScope;
  },
): Promise<RequestResult> {
  const { clinicId, weekStart, day, doctorIds, scope } = args;
  if (doctorIds.length < 2) return fail('التبديل يحتاج طبيبين على الأقلّ.');
  if (!isLeaderPlus(actor.role) && !doctorIds.includes(actor.id)) {
    return fail('لا تملك صلاحيّة هذا التبديل.');
  }
  const periodsInScope: number[] =
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

    // الظلّ: المتدرّب المبتدئ ملتصق بمدرّبه، فينتقل معه إلى مواضعه الجديدة.
    await moveShadowTrainees({ clinicId, weekStart, day, doctorIds, periodsInScope, preRows: rows });
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

/**
 * بعد تبديل أطباء، ينقل المتدرّب المبتدئ (الظلّ) ليتبع مدرّبه. الظلّ نسخة من خانات
 * مدرّبه (نفس الفترة/العيادة/الدور). نتعرّف عليه بمطابقة خاناته تمامًا لخانات مدرّبه
 * قبل التبديل (المستقلّ لا يُطابق فلا يُنقل). موضع المدرّب الجديد = موضع سَلَفه القديم.
 */
async function moveShadowTrainees(args: {
  clinicId: string;
  weekStart: string;
  day: WeekDay;
  doctorIds: string[];
  periodsInScope: number[];
  preRows: Row[];
}): Promise<void> {
  const { clinicId, weekStart, day, doctorIds, periodsInScope, preRows } = args;
  const { data: members } = await getAllGroupMembers(clinicId);
  const swapped = new Set(doctorIds);
  const shadows = (members || []).filter(
    (m: { work_status?: string; supervisor_doctor_id?: string | null }) =>
      m.work_status === 'trainee' && m.supervisor_doctor_id && swapped.has(m.supervisor_doctor_id),
  ) as { doctor_id: string; doctor_name: string; supervisor_doctor_id: string }[];
  if (shadows.length === 0) return;

  const inScope = (r: Row) =>
    r.period > 0 && r.status === 'active' && (r.role === 'clinic' || r.role === 'delegator')
    && periodsInScope.includes(r.period);
  const posOf = (docId: string) =>
    preRows.filter((r) => r.doctor_id === docId && inScope(r))
      .map((r) => ({ period: r.period, clinic_number: r.clinic_number, role: r.role }));
  const key = (p: { period: number; clinic_number: number; role: string }) =>
    `${p.period}|${p.clinic_number}|${p.role}`;
  const predecessorOf = (supId: string) => {
    const i = doctorIds.indexOf(supId);
    return doctorIds[(i - 1 + doctorIds.length) % doctorIds.length]!;
  };

  for (const t of shadows) {
    const supPos = posOf(t.supervisor_doctor_id);
    const tPos = posOf(t.doctor_id);
    if (supPos.length === 0 || tPos.length !== supPos.length) continue;
    const supSet = new Set(supPos.map(key));
    if (!tPos.every((p) => supSet.has(key(p)))) continue;

    const newPos = posOf(predecessorOf(t.supervisor_doctor_id));
    const tOldIds = preRows.filter((r) => r.doctor_id === t.doctor_id && inScope(r)).map((r) => r.id);
    await deleteRows(tOldIds);
    await insertRows(
      newPos.map((p) => ({
        clinic_id: clinicId, week_start: weekStart, day_of_week: day,
        period: p.period, clinic_number: p.clinic_number,
        doctor_id: t.doctor_id, doctor_name: t.doctor_name,
        role: p.role, status: 'active', source: 'request',
      })),
    );
  }
}

/**
 * يُلاصِق التريني الظلّ بمدرّبه بعد أيّ عمليّة (نقل/تغطية/استلام فترتين): يُعيد كتابة
 * خانات الظلّ لتطابق خانات مدرّبه **الحاليّة**. الظلّ يُعرَّف بمطابقة خاناته لمدرّبه
 * **قبل** العمليّة (preRows) — فالمتدرّب المستقلّ لا يُطابق فلا يُنقل. عامّ وقابل لإعادة
 * الاستخدام (التبديل له مساره الخاصّ moveShadowTrainees).
 */
async function mirrorShadows(args: {
  clinicId: string;
  weekStart: string;
  day: WeekDay;
  supervisorIds: string[]; // الأطباء الذين تغيّر تنسيبهم
  preRows: Row[];          // الحالة قبل العمليّة (لتحديد الظلّ بالمطابقة)
}): Promise<void> {
  const { clinicId, weekStart, day, supervisorIds, preRows } = args;
  const sups = [...new Set(supervisorIds)].filter(Boolean);
  if (sups.length === 0) return;
  const { data: members } = await getAllGroupMembers(clinicId);
  const inScope = (r: Row) =>
    r.period > 0 && r.status === 'active' && (r.role === 'clinic' || r.role === 'delegator');
  const keysIn = (rows: Row[], id: string) =>
    rows.filter((r) => r.doctor_id === id && inScope(r)).map((r) => `${r.period}|${r.clinic_number}|${r.role}`);

  // الظلال: متدرّب خاناته قبل العمليّة تطابق خانات مدرّبه تمامًا
  const shadows = ((members || []) as {
    doctor_id: string; doctor_name: string; work_status?: string; supervisor_doctor_id?: string | null;
  }[]).filter((m) => {
    if (m.work_status !== 'trainee' || !m.supervisor_doctor_id || !sups.includes(m.supervisor_doctor_id)) return false;
    const tk = keysIn(preRows, m.doctor_id);
    const sk = new Set(keysIn(preRows, m.supervisor_doctor_id));
    return tk.length > 0 && tk.length === sk.size && tk.every((k) => sk.has(k));
  });
  if (shadows.length === 0) return;

  const cur = await loadDay(clinicId, weekStart, day); // الحالة بعد العمليّة
  for (const t of shadows) {
    const supSlots = cur.filter((r) => r.doctor_id === t.supervisor_doctor_id && inScope(r));
    const tOld = cur.filter((r) => r.doctor_id === t.doctor_id && inScope(r));
    await deleteRows(tOld.map((r) => r.id));
    await insertRows(
      supSlots.map((r) => ({
        clinic_id: clinicId, week_start: weekStart, day_of_week: day,
        period: r.period, clinic_number: r.clinic_number,
        doctor_id: t.doctor_id, doctor_name: t.doctor_name,
        role: r.role, status: 'active', source: 'request',
      })),
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// التنسيب — وضع طبيب داخل عيادة/فترات (العكس: من غياب إلى داخل العيادة)
// ═══════════════════════════════════════════════════════════════

/**
 * يضع طبيبًا في عيادة وفتراتٍ محدّدة. الليدر لأيّ مكان؛ الطبيب لنفسه. يُزيل صفّ
 * حالته وصفوف الحفظ إن وُجدت. حارس تعارض: لا يكون الطبيب في عيادتين بنفس الفترة.
 * (اقتراح الأماكن المتاحة يأتي لاحقًا — هذه التنفيذ المباشر فقط.)
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
    periods: number[]; // الفترات التي يُوضع فيها (مثلًا [1,2] صباح كامل)
  },
): Promise<RequestResult> {
  const { clinicId, weekStart, day, doctorId, doctorName, clinicNumber, periods } = args;
  if (!canActOnDoctor(actor, doctorId)) return fail('لا تملك صلاحيّة تنسيب هذا الطبيب.');
  if (!Number.isInteger(clinicNumber) || clinicNumber < 1) return fail('رقم العيادة غير صالح.');
  if (!periods.length) return fail('يجب تحديد فترة واحدة على الأقلّ.');
  try {
    const rows = await loadDay(clinicId, weekStart, day);
    const mine = rows.filter((r) => r.doctor_id === doctorId);

    // حارس التعارض: لا يكون الطبيب في عيادتين بنفس الفترة. إن كان له تكليف فعليّ في
    // عيادة أخرى ضمن إحدى الفترات المطلوبة → ارفض بوضوح.
    const myActiveClinic = mine.filter((r) => r.role === 'clinic' && r.status === 'active' && r.period > 0);
    const conflictP = periods.find((p) =>
      myActiveClinic.some((r) => r.period === p && r.clinic_number !== clinicNumber),
    );
    if (conflictP != null) {
      const busy = myActiveClinic.find((r) => r.period === conflictP && r.clinic_number !== clinicNumber)!;
      return fail(
        `${doctorName} مشغول في الفترة ${conflictP} بعيادة ${busy.clinic_number} — ` +
        `لا يمكن أن يكون في عيادتين بنفس الفترة.`,
      );
    }

    // أزِل حالته الغائبة وصفوف الحفظ (سيدخل العيادة فعليًّا)
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
    // التريني الظلّ يلاصق مدرّبه في النقل
    await mirrorShadows({ clinicId, weekStart, day, supervisorIds: [doctorId], preRows: rows });
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

// ═══════════════════════════════════════════════════════════════
// التغطية — وضع مُغطٍّ في مكان النقص بالفترة الصحيحة تلقائيًّا (ليدر فأعلى)
// ═══════════════════════════════════════════════════════════════

/**
 * يغطّي نقصًا نتج عن غياب طبيب: المحرّك يحسب الفترة الصحيحة من صفوف الحفظ
 * (PREV_ROLE) للغائب، فلا يحتاج الذكاء لذكر فترةٍ إطلاقًا.
 *  - دليقيتر: يضع المُغطّي دليقيترًا في فترة الدليقيتر التي **هو فارغ فيها** (للتناوب:
 *    تُستدعى لكلّ مُغطٍّ فيؤخذ في فترته الفارغة).
 *  - عيادة N: يضع المُغطّي في فترات الغائب بتلك العيادة (يستلم فتراته)، مع حارس
 *    «لا عيادتين بنفس الفترة».
 */
export async function coverGap(
  actor: Actor,
  args: {
    clinicId: string;
    weekStart: string;
    day: WeekDay;
    absentDoctorId: string;
    target: { kind: 'delegator' } | { kind: 'clinic'; clinicNumber: number };
    coverDoctorId: string;
    coverDoctorName: string;
  },
): Promise<RequestResult> {
  const { clinicId, weekStart, day, absentDoctorId, target, coverDoctorId, coverDoctorName } = args;
  if (!isLeaderPlus(actor.role)) return fail('التغطية من صلاحيّة التيم ليدر فأعلى.');
  try {
    const rows = await loadDay(clinicId, weekStart, day);
    const prev = rows.filter((r) => r.role === PREV_ROLE && r.doctor_id === absentDoctorId);
    if (prev.length === 0) return fail('لا يوجد نقص محفوظ لهذا الطبيب في هذا اليوم.');

    const activeAssign = rows.filter(
      (r) => r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'),
    );
    const assignedAt = (P: number) => new Set(activeAssign.filter((r) => r.period === P).map((r) => r.doctor_id));

    if (target.kind === 'delegator') {
      const delPeriods = [...new Set(
        prev.filter((r) => r.role === 'delegator' || r.clinic_number === 0).map((r) => r.period),
      )];
      if (delPeriods.length === 0) return fail('لا يوجد نقص دليقيتر لهذا الطبيب.');
      // الفترة التي يكون فيها المُغطّي فارغًا (من فترات الدليقيتر الناقصة)
      const freePeriod = delPeriods.find((P) => !assignedAt(P).has(coverDoctorId));
      if (freePeriod == null) {
        return fail(`${coverDoctorName} مشغول في فترة الدليقيتر — اختر طبيبًا متفرّغًا في تلك الفترة من نفس الشفت.`);
      }
      const exists = rows.some(
        (r) => r.doctor_id === coverDoctorId && r.role === 'delegator' && r.period === freePeriod && r.status === 'active',
      );
      if (!exists) {
        await insertRows([{
          clinic_id: clinicId, week_start: weekStart, day_of_week: day,
          period: freePeriod, clinic_number: 0,
          doctor_id: coverDoctorId, doctor_name: coverDoctorName,
          role: 'delegator', status: 'active', source: 'request',
        }]);
      }
      await mirrorShadows({ clinicId, weekStart, day, supervisorIds: [coverDoctorId], preRows: rows });
      return ok();
    }

    // عيادة N: المُغطّي يأخذ فترات الغائب في تلك العيادة. صفوف الحفظ كلّها role=PREV_ROLE،
    // فنُطابق بـ clinic_number (تحفظ رقم العيادة الأصليّ)، لا بـ role==='clinic'.
    const clinicNumber = target.clinicNumber;
    const periods = [...new Set(
      prev.filter((r) => r.clinic_number === clinicNumber && r.clinic_number !== 0).map((r) => r.period),
    )];
    if (periods.length === 0) return fail(`لا يوجد نقص في عيادة ${clinicNumber} لهذا الطبيب.`);
    const myClinic = activeAssign.filter((r) => r.doctor_id === coverDoctorId && r.role === 'clinic');
    const conflictP = periods.find((p) => myClinic.some((r) => r.period === p && r.clinic_number !== clinicNumber));
    if (conflictP != null) {
      const busy = myClinic.find((r) => r.period === conflictP && r.clinic_number !== clinicNumber)!;
      return fail(
        `${coverDoctorName} مشغول في الفترة ${conflictP} بعيادة ${busy.clinic_number} — ` +
        `لا يمكن أن يكون في عيادتين بنفس الفترة.`,
      );
    }
    const existing = new Set(myClinic.map((r) => `${r.period}|${r.clinic_number}`));
    const toAdd = periods
      .filter((p) => !existing.has(`${p}|${clinicNumber}`))
      .map((p) => ({
        clinic_id: clinicId, week_start: weekStart, day_of_week: day,
        period: p, clinic_number: clinicNumber,
        doctor_id: coverDoctorId, doctor_name: coverDoctorName,
        role: 'clinic', status: 'active', source: 'request',
      }));
    await insertRows(toAdd);
    await mirrorShadows({ clinicId, weekStart, day, supervisorIds: [coverDoctorId], preRows: rows });
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

// ═══════════════════════════════════════════════════════════════
// تنفيذ خيار تغطيةٍ مركّب (عيادة + دليقيتر) — كلّ النقلات دفعةً (ليدر فأعلى)
// ═══════════════════════════════════════════════════════════════

/**
 * ينفّذ خيار تغطيةٍ كاملًا لنقصٍ مركّب (الغائب = عيادة ب_a + دليقيتر ب_b):
 *  - الخيار A: طبيب ب_a من عيادة أخرى (coverDoctorId) يحلّ محلّ الغائب كاملًا (عيادته
 *    ب_a + الدليقيتر ب_b)، ويترك عيادته فيستلمها زميله (ب_b) كاملة.
 *  - الخيار B: زميل الغائب في عيادته يستلمها كاملة، وعيادة أخرى (delegatorClinicNumber)
 *    تتولّى الدليقيتر بالتناوب (طبيب ب_a → دليقيتر ب_b، وطبيب ب_b → دليقيتر ب_a).
 */
export async function applyCoverageOption(
  actor: Actor,
  args: {
    clinicId: string; weekStart: string; day: WeekDay;
    absentDoctorId: string;
    option: 'A' | 'B';
    coverDoctorId?: string; coverDoctorName?: string; // الخيار A
    delegatorClinicNumber?: number;                    // الخيار B
  },
): Promise<RequestResult> {
  if (!isLeaderPlus(actor.role)) return fail('التغطية من صلاحيّة التيم ليدر فأعلى.');
  const { clinicId, weekStart, day, absentDoctorId, option } = args;
  try {
    const rows = await loadDay(clinicId, weekStart, day);
    const prev = rows.filter((r) => r.role === PREV_ROLE && r.doctor_id === absentDoctorId);
    const prevClinic = prev.find((r) => r.clinic_number > 0);
    const prevDeleg = prev.find((r) => r.clinic_number === 0);
    if (!prevClinic || !prevDeleg) return fail('هذا ليس نقصًا مركّبًا (عيادة + دليقيتر).');
    const C = prevClinic.clinic_number, aP = prevClinic.period, bP = prevDeleg.period;

    const activeClinic = rows.filter((r) => r.role === 'clinic' && r.status === 'active' && r.period > 0);
    const activeDeleg = rows.filter((r) => r.role === 'delegator' && r.status === 'active' && r.period > 0);
    const docAtClinic = (cn: number, P: number) => activeClinic.find((r) => r.clinic_number === cn && r.period === P);

    const clinicRow = (cn: number, P: number, id: string, name: string) => ({
      clinic_id: clinicId, week_start: weekStart, day_of_week: day,
      period: P, clinic_number: cn, doctor_id: id, doctor_name: name,
      role: 'clinic', status: 'active', source: 'request',
    });
    const delegatorRow = (P: number, id: string, name: string) => ({
      clinic_id: clinicId, week_start: weekStart, day_of_week: day,
      period: P, clinic_number: 0, doctor_id: id, doctor_name: name,
      role: 'delegator', status: 'active', source: 'request',
    });

    const deleteIds: string[] = [];
    const inserts: Record<string, unknown>[] = [];
    const movedIds: string[] = []; // الأطباء المنقولون (لِيلاصقهم ظلّهم)

    if (option === 'A') {
      if (!args.coverDoctorId) return fail('اختر الطبيب المُغطّي (الخيار الأول).');
      const coverSlot = activeClinic.find((r) => r.doctor_id === args.coverDoctorId && r.period === aP);
      if (!coverSlot) return fail('الطبيب المُغطّي ليس في الفترة المطلوبة من عيادته.');
      const D = coverSlot.clinic_number;
      const backfill = docAtClinic(D, bP);
      const cName = args.coverDoctorName || coverSlot.doctor_name;
      deleteIds.push(coverSlot.id); // يترك عيادته في ب_a
      inserts.push(clinicRow(C, aP, args.coverDoctorId, cName));   // يأخذ عيادة الغائب
      inserts.push(delegatorRow(bP, args.coverDoctorId, cName));   // ويأخذ الدليقيتر
      movedIds.push(args.coverDoctorId);
      if (backfill) {
        inserts.push(clinicRow(D, aP, backfill.doctor_id, backfill.doctor_name)); // زميله يستلم عيادتهما
        movedIds.push(backfill.doctor_id);
      }
    } else {
      const colleague = docAtClinic(C, bP); // زميل الغائب في عيادته (يستلمها كاملة)
      if (!colleague) return fail('لا يوجد زميل في عيادة الغائب لاستلامها.');
      const D = Number(args.delegatorClinicNumber);
      const a = docAtClinic(D, aP), b = docAtClinic(D, bP);
      if (!a || !b) return fail('العيادة المختارة لا تملك طبيبين للتناوب على الدليقيتر.');
      inserts.push(clinicRow(C, aP, colleague.doctor_id, colleague.doctor_name)); // الزميل يكمل عيادة الغائب
      const colDeleg = activeDeleg.find((r) => r.doctor_id === colleague.doctor_id); // يترك دليقيتره
      if (colDeleg) deleteIds.push(colDeleg.id);
      inserts.push(delegatorRow(bP, a.doctor_id, a.doctor_name)); // طبيب ب_a → دليقيتر ب_b
      inserts.push(delegatorRow(aP, b.doctor_id, b.doctor_name)); // طبيب ب_b → دليقيتر ب_a
      movedIds.push(colleague.doctor_id, a.doctor_id, b.doctor_id);
    }

    deleteIds.push(...prev.map((r) => r.id)); // الغائب مُغطّى → أزِل صفوف حفظه
    await deleteRows(deleteIds);
    await insertRows(inserts);
    // التريني الظلّ يلاصق مدرّبه في كلّ النقلات
    await mirrorShadows({ clinicId, weekStart, day, supervisorIds: movedIds, preRows: rows });
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

// ═══════════════════════════════════════════════════════════════
// المسح — حذف جدول أسبوعٍ كاملًا (ليدر فأعلى)
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
    return error ? fail(error.message) : ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

// ═══════════════════════════════════════════════════════════════
// الإعدادات (ليدر فأعلى) — تُحدِّث الحاليّ+القادم بلا إعادة توزيع
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
  workStatus: string, // active | vacation | light_duty | trainee
  supervisorDoctorId?: string | null,
): Promise<RequestResult> {
  if (!isLeaderPlus(actor.role)) return fail('تغيير حالة الطبيب في القروب من صلاحيّة التيم ليدر فأعلى.');
  const { error } = await updateDoctorWorkStatus(groupId, doctorId, workStatus, supervisorDoctorId);
  return error ? fail(error.message) : ok();
}

// ─── تجميع التصدير (ينمو مع كلّ قدرة جديدة) ────────────────────
export const requestsV2 = {
  setScheduleStatus, cancelStatus, computeCoverageBrief,
  swapInSchedule,
  placeInClinic, coverGap, applyCoverageOption,
  clearWeek,
  setClinicCount, moveDoctorGroup, setDoctorGroupStatus,
};
