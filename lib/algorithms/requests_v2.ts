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

/**
 * حقائق الاستئذان المحسوبة لحظة تسجيله (المحرّك يحسب وينفّذ التبديل، والذكاء يُخبر):
 *  • conflict: الطبيب يستلم خانةً في فترةٍ يحجبها استئذانه (بداية→١/٣، نهاية→٢/٤)
 *  • swap: نتيجة التبديل التلقائيّ الصامت عند التعارض — مع مَن تمّ، أو تعذّره وسببه
 *  • covered: كان غائبًا (مرضية/تفرّغ) ومكانه مُغطًّى — صار مستأذنًا بلا مركز
 *  • wasReserve: كان احتياطيًّا — بقي احتياطًا والعلامة أُضيفت (تعايش)
 *  • shadowToReserve: ظلٌّ استأذن — نُقل إلى الاحتياط وحده، وإلغاؤه يعيده لمدرّبه
 */
export type PermissionInfo = {
  conflict: boolean;
  blocked: number[];
  swap?: { withId: string; withName: string; withClinic: number; withPeriod: number; delegatorGap?: boolean } | { none: true; reason: 'no_candidate' | 'delegator_left' };
  covered?: boolean;
  convertedFromAr?: string;
  wasReserve?: boolean;
  wasReserveNoteAr?: string;
  shadowToReserve?: boolean;
};

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

// ── يوميّات الأثر البعيد (cross-day journal) ──
// الامتصاص عبر الأيّام (rebalanceForward/القلب الجديد) يبدّل خاناتٍ في أيّامٍ غيرِ يوم
// الحدث (امتصاصٌ قَبليّ أو أماميّ). كي يعكسها الكنسل **بدقّة** نحفظ لقطةً مخفيّةً لتلك
// الأيّام (نفس آليّة prev_placement): صفّ XDAY_PRE لكلّ خانةٍ بشاغلها **قبل** الامتصاص،
// وصفّ XDAY_GUARD واحدٌ لليوم يحمل بصمةَ الحالة **بعده** لكشف التشابك (هل لمس حدثٌ لاحقٌ
// ذلك اليوم؟). الصفوف status='active' لكنّ role مميّز، والقُرّاء جميعًا يُرشّحون
// role∈{clinic,delegator}، فتُتجاهَل هذه الصفوف تمامًا كما prev_placement.
// ملاحظة: السلسلتان أدناه يجب أن تطابقا نظيرتيهما في حال نسخهما لملفٍّ آخر.
const XDAY_PRE = 'xday_pre';
const XDAY_GUARD = 'xday_guard';
const XDAY_GUARD_CLINIC = 9; // رقم عيادةٍ سنتينل لصفّ الحارس (لا يصطدم بـEX ١/٢)

const DAY_AR: Record<string, string> = {
  sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء', thursday: 'الخميس',
};

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
  source?: string | null; // 'shadow' = صفّ حالةٍ لظلٍّ — إلغاؤه يعيده إلى جانب مدرّبه
};

async function loadDay(clinicId: string, weekStart: string, day: WeekDay): Promise<Row[]> {
  const { data, error } = await supabase
    .from('schedule_slots')
    .select('id, period, clinic_number, doctor_id, doctor_name, role, status, source')
    .eq('clinic_id', clinicId)
    .eq('week_start', weekStart)
    .eq('day_of_week', day);
  if (error) throw new Error(error.message);
  return (data || []) as Row[];
}

/** حالات الطبيب المسجّلة في أسبوعٍ (صفوف EX: period=0) — يوم + نوع، بلا تكرار.
 *  للإلغاء المبهم: **النظام يقرأ الحقيقة من القاعدة** فيعرض الأيّام الصحيحة بدل أن
 *  يخمّنها الذكاء (لا يرى حالات الطبيب في سياقه). الأنواع: مرضية/تفرّغ/استئذان(بداية/نهاية). */
export async function listDoctorStatuses(args: {
  clinicId: string; weekStart: string; doctorId: string;
}): Promise<{ day: WeekDay; status: ScheduleStatus }[]> {
  const { clinicId, weekStart, doctorId } = args;
  const { data, error } = await supabase
    .from('schedule_slots')
    .select('day_of_week, status')
    .eq('clinic_id', clinicId)
    .eq('week_start', weekStart)
    .eq('doctor_id', doctorId)
    .eq('period', 0);
  if (error) throw new Error(error.message);
  const wanted = new Set<ScheduleStatus>(['sick_leave', 'vacation', 'permission_start', 'permission_end']);
  const seen = new Set<string>();
  const out: { day: WeekDay; status: ScheduleStatus }[] = [];
  for (const row of (data || []) as { day_of_week: WeekDay; status: ScheduleStatus }[]) {
    if (!wanted.has(row.status) || seen.has(`${row.day_of_week}|${row.status}`)) continue;
    seen.add(`${row.day_of_week}|${row.status}`);
    out.push({ day: row.day_of_week, status: row.status });
  }
  return out;
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

/** حزمة تغييرات على الجدول تُطبَّق دفعةً واحدة. */
type SlotChanges = {
  updates?: { id: string; doctor_id: string; doctor_name: string; source?: string }[];
  deleteIds?: string[];
  inserts?: Record<string, unknown>[];
};

/** تطبيق الحزمة معاملةً واحدةً في قاعدة البيانات (sql/apply_slot_changes.sql):
 *  إمّا أن تقع كلّها أو لا يقع منها شيء — فلا يبقى الجدول ناقصًا إن انقطع الاتصال. */
async function applySlotChanges(changes: SlotChanges): Promise<void> {
  const updates = changes.updates || [];
  const deleteIds = changes.deleteIds || [];
  const inserts = changes.inserts || [];
  if (updates.length + deleteIds.length + inserts.length === 0) return;
  const { error } = await supabase.rpc('apply_slot_changes', {
    p_updates: updates,
    p_delete_ids: deleteIds,
    p_inserts: inserts,
  });
  if (error) throw new Error(error.message);
}

// ─── يوميّات الأثر البعيد: التقاط/يَوْمَنة/استرجاع ──────────────────
/** خانةٌ منسَّبةٌ مبسّطة (للقطة الأسبوع ولبصمة اليوم). تشمل العيادة/الدليقيتر النشطة
 *  **والاحتياط** (extra, p0) — لأنّ سداد الاحتياط داخل الأسبوع يبدّل صفوف الاحتياط أيضًا. */
type PlaceRow = { day: string; period: number; clinic: number; doctorId: string; doctorName: string; role: string; status: string };

/** بصمةٌ حتميّةٌ لتنسيب يومٍ — لكشف «هل تغيّر اليوم؟». تشمل الحالة (active/extra) كي
 *  تُميّز بين عملٍ وراحةٍ على نفس المحور. */
function dayHash(rows: PlaceRow[]): string {
  return rows.map((r) => `${r.status}.${r.period}.${r.clinic}.${r.role}.${r.doctorId}`).sort().join(';');
}

/** تنسيبُ الأسبوع الذي قد يمسّه الامتصاص عبر الأيّام: العيادة/الدليقيتر النشطة (p>0)
 *  **والاحتياط** (extra, p0) — لا الوسوم ولا صفوف الغياب. */
async function loadWeekPlacement(clinicId: string, weekStart: string): Promise<PlaceRow[]> {
  const { data } = await supabase
    .from('schedule_slots')
    .select('day_of_week, period, clinic_number, doctor_id, doctor_name, role, status')
    .eq('clinic_id', clinicId)
    .eq('week_start', weekStart);
  return ((data || []) as Record<string, unknown>[])
    .filter((r) => (r.status === 'active' && Number(r.period) > 0 && (r.role === 'clinic' || r.role === 'delegator'))
      || (r.status === 'extra' && Number(r.period) === 0))
    .map((r) => ({
      day: String(r.day_of_week), period: Number(r.period), clinic: Number(r.clinic_number),
      doctorId: String(r.doctor_id), doctorName: String(r.doctor_name), role: String(r.role), status: String(r.status),
    }));
}

/** يلفّ امتصاصًا عبر الأيّام (rebalanceForward) بلقطةٍ قبليّةٍ ويَوْمَنةٍ بعديّة: يكتب
 *  لقطةَ الأيّام البعيدة التي بدّلها الامتصاص كي يعكسها الكنسل لاحقًا بدقّة. آمن: لا
 *  يُفشل العمليّة أبدًا (اليَوْمَنة تحسينٌ للكنسل، لا شرطٌ لصحّة الجدول). */
export async function withXdayJournal<T>(
  clinicId: string, weekStart: string,
  cause: { day: string; doctorId: string },
  run: () => Promise<T>,
): Promise<T> {
  let before: PlaceRow[] = [];
  try { before = await loadWeekPlacement(clinicId, weekStart); } catch { /* تجاهل */ }
  const out = await run();
  try {
    const after = await loadWeekPlacement(clinicId, weekStart);
    const byDayBefore = new Map<string, PlaceRow[]>();
    const byDayAfter = new Map<string, PlaceRow[]>();
    for (const r of before) { const a = byDayBefore.get(r.day) ?? []; a.push(r); byDayBefore.set(r.day, a); }
    for (const r of after) { const a = byDayAfter.get(r.day) ?? []; a.push(r); byDayAfter.set(r.day, a); }
    const days = new Set([...byDayBefore.keys(), ...byDayAfter.keys()]);
    // المتدرّبون (ظلال) — يُستثنَون من يَوْمَنة يوم الحدث؛ تعيدهم آليّةُ الظلّ
    // (returnShadowsWithSupervisor) فلا نُكرّرهم.
    let traineeIds = new Set<string>();
    try {
      const { data: mem } = await getAllGroupMembers(clinicId);
      traineeIds = new Set(((mem || []) as { doctor_id: string; work_status?: string }[])
        .filter((m) => m.work_status === 'trainee').map((m) => m.doctor_id));
    } catch { /* تجاهل */ }
    const inserts: Record<string, unknown>[] = [];
    for (const d of days) {
      // يومُ الحدث: نُيَوْمِن بُعدَي **العيادة والاستضافة** (غير متدرّب) — لأنّ التغطية قد تُسقِط
      // استضافةَ شريكٍ وتُرقّي جيرانًا، أو (في الحالة الرفيعة) تُعيد تشكيلَ الشفت كلَّه (منفردون
      // + مضيف) فتتغيّر مقاعدُ العيادة لغير الغائب أيضًا — وهذا ما لا يعكسه إرجاعُ المكان (prev)
      // وحده. الاحتياطُ/الظلّ على يوم الحدث يعالجهما الاستردادُ الحرفيّ. الأيّامُ البعيدة كاملةً.
      const isCause = d === cause.day;
      const slice = (arr: PlaceRow[]) => isCause ? arr.filter((r) => (r.role === 'clinic' || r.role === 'delegator') && !traineeIds.has(r.doctorId)) : arr;
      const bD = slice(byDayBefore.get(d) ?? []);
      const aD = slice(byDayAfter.get(d) ?? []);
      if (dayHash(bD) === dayHash(aD)) continue;            // لم يتغيّر → لا يَوْمَنة
      // تمريراتُ تغطيةٍ متعدّدةٌ لنفس الحدث (ask ثمّ exclude): نُبقي **أوّلَ** لقطةٍ قبليّة
      // (الأساسَ قبل أيّ تغطية) ونُحدّث الحارسَ فقط ليطابق آخرَ حالة بعد كلّ تمرير.
      const existing = await loadXdayMarkers(clinicId, weekStart, d, cause);
      const hasPre = existing.some((m) => m.role === XDAY_PRE);
      const oldGuards = existing.filter((m) => m.role === XDAY_GUARD).map((m) => m.id);
      if (oldGuards.length) await deleteRows(oldGuards);
      inserts.push({
        clinic_id: clinicId, week_start: weekStart, day_of_week: d,
        period: 0, clinic_number: XDAY_GUARD_CLINIC,
        doctor_id: cause.doctorId, doctor_name: '·xday·',
        role: XDAY_GUARD, status: 'active', source: `xg|${cause.day}|${cause.doctorId}|${dayHash(aD)}`,
      });
      if (!hasPre) for (const r of bD) inserts.push({
        clinic_id: clinicId, week_start: weekStart, day_of_week: d,
        period: r.period, clinic_number: r.clinic,
        doctor_id: r.doctorId, doctor_name: r.doctorName,
        role: XDAY_PRE, status: 'active', source: `xd|${cause.day}|${cause.doctorId}|${r.role}|${r.status}`,
      });
    }
    if (inserts.length) await insertRows(inserts);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[xday-journal] skipped', e instanceof Error ? e.message : e);
  }
  return out;
}

/** يحذف وسوم يومٍ بعيدٍ لسببٍ معيّن (للإمحاء قبل الكتابة أو بعد الاسترجاع). */
async function deleteXdayMarkers(
  clinicId: string, weekStart: string, day: string,
  cause: { day: string; doctorId: string },
): Promise<void> {
  const ids = (await loadXdayMarkers(clinicId, weekStart, day, cause)).map((r) => r.id);
  await deleteRows(ids);
}

/** يقرأ وسوم يومٍ لسببٍ معيّن (PRE/GUARD) — لمعرفة أيّها موجودٌ قبل إعادة الكتابة. */
async function loadXdayMarkers(
  clinicId: string, weekStart: string, day: string,
  cause: { day: string; doctorId: string },
): Promise<{ id: string; role: string; source: string }[]> {
  const { data } = await supabase
    .from('schedule_slots')
    .select('id, role, source')
    .eq('clinic_id', clinicId).eq('week_start', weekStart).eq('day_of_week', day)
    .in('role', [XDAY_PRE, XDAY_GUARD]);
  const tag = `|${cause.day}|${cause.doctorId}|`;
  return ((data || []) as { id: string; role: string; source?: string }[])
    .filter((r) => (r.source || '').includes(tag))
    .map((r) => ({ id: r.id, role: r.role, source: r.source || '' }));
}

/** يعكس الأثر البعيد لحدثٍ مُلغًى: لكلّ يومٍ بعيدٍ موسومٍ بهذا السبب، إن كان ما يزال
 *  سليمًا (لم يلمسه حدثٌ لاحق — بصمته تطابق حارسه) نُرجِعه حرفيًّا إلى لقطته القبليّة؛
 *  وإلّا (تشابك) نتركه ونُسجّل (يُصحّحه البناءُ التالي). يُرجع الأيّام المُعادة والمتشابكة. */
export async function restoreXdayFootprint(
  clinicId: string, weekStart: string, causeDay: string, causeDoctorId: string,
): Promise<{ restored: string[]; entangled: string[] }> {
  const restored: string[] = []; const entangled: string[] = [];
  const { data } = await supabase
    .from('schedule_slots')
    .select('id, day_of_week, period, clinic_number, doctor_id, doctor_name, role, source')
    .eq('clinic_id', clinicId).eq('week_start', weekStart)
    .in('role', [XDAY_PRE, XDAY_GUARD]);
  const tag = `|${causeDay}|${causeDoctorId}|`;
  const mine = ((data || []) as Record<string, unknown>[])
    .filter((r) => String(r.source || '').includes(tag));
  if (mine.length === 0) return { restored, entangled };
  // المتدرّبون — يوم الحدث يُستردّ على بُعد الاستضافة لغير المتدرّبين فقط (مطابق اليَوْمَنة).
  let traineeIds = new Set<string>();
  try {
    const { data: mem } = await getAllGroupMembers(clinicId);
    traineeIds = new Set(((mem || []) as { doctor_id: string; work_status?: string }[])
      .filter((m) => m.work_status === 'trainee').map((m) => m.doctor_id));
  } catch { /* تجاهل */ }
  const byDay = new Map<string, Record<string, unknown>[]>();
  for (const m of mine) { const d = String(m.day_of_week); const a = byDay.get(d) ?? []; a.push(m); byDay.set(d, a); }

  for (const [d, markers] of byDay) {
    const cause = { day: causeDay, doctorId: causeDoctorId };
    const isCause = d === causeDay;
    const guard = markers.find((m) => m.role === XDAY_GUARD);
    const pre = markers.filter((m) => m.role === XDAY_PRE);
    if (!guard || pre.length === 0) { await deleteXdayMarkers(clinicId, weekStart, d, cause); continue; }
    const wantHash = String(guard.source || '').split('|').slice(3).join('|'); // كلّ ما بعد الوسم = البصمة
    // الحالة الحاليّة على نفس النطاق المُيَوْمَن: يومُ الحدث = عيادة/دليقيتر نشطة غير-متدرّب؛
    // الأيّامُ البعيدة = عيادة/دليقيتر نشطة + احتياط (كاملًا).
    const dayRows = await loadDay(clinicId, weekStart, d as WeekDay);
    const curReal = isCause
      ? dayRows.filter((r) => r.status === 'active' && (r.role === 'clinic' || r.role === 'delegator') && r.period > 0 && !traineeIds.has(r.doctor_id))
      : dayRows.filter((r) => (r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'))
        || (r.status === 'extra' && r.period === 0));
    const curHash = dayHash(curReal.map((r) => ({
      day: d, period: r.period, clinic: r.clinic_number, doctorId: r.doctor_id, doctorName: r.doctor_name, role: r.role, status: r.status,
    })));
    if (curHash === wantHash) {
      // سليم → استبدل خانات اليوم الحاليّة بلقطته القبليّة (معاملةً واحدة، بالحالة الأصليّة).
      const inserts = pre.map((m) => {
        const parts = String(m.source || '').split('|');
        return {
          clinic_id: clinicId, week_start: weekStart, day_of_week: d,
          period: Number(m.period), clinic_number: Number(m.clinic_number),
          doctor_id: String(m.doctor_id), doctor_name: String(m.doctor_name),
          role: parts[3] || 'clinic', status: parts[4] || 'active', source: 'request',
        };
      });
      await applySlotChanges({ deleteIds: curReal.map((r) => r.id), inserts });
      restored.push(d);
    } else {
      entangled.push(d);
    }
    await deleteRows(markers.map((m) => String(m.id)));
  }
  return { restored, entangled };
}

/** هل خانة الحفظ (فترة/عيادة أو دليقيتر) يشغلها الآن طبيبٌ آخر؟
 *  حارس «لا إرجاع فوق ساكن»: المكان المحفوظ قد يكون مُلئ يدويًّا بعد الغياب
 *  (التنسيب لا يمزّق الحفظ كما تفعل التغطية) — فلا يُعاد الغائب فوق مَن فيه. */
function slotOccupied(rows: Row[], p: { period: number; clinic_number: number }, doctorId: string): boolean {
  return rows.some(
    (r) => r.doctor_id !== doctorId && r.status === 'active' && r.period === p.period
      && (p.clinic_number === 0
        ? r.role === 'delegator'
        : r.role === 'clinic' && r.clinic_number === p.clinic_number),
  );
}

/** بعد إرجاع مدرّبٍ إلى الجدول: ظلُّه (الذي نُقل احتياطًا بوسم source='shadow')
 *  يعود معه تلقائيًّا مرآةً لخاناته الحاليّة. لا يُمسّ مَن أُلحق بطبيبٍ آخر (له
 *  خانات فعليّة)، ولا الغائب بنفسه، ولا احتياطيٌّ وُضع بقرارٍ مستقلّ (وسمه ليس
 *  'shadow'). يُرجع أسماء مَن عاد. */
async function returnShadowsWithSupervisor(args: {
  clinicId: string;
  weekStart: string;
  day: WeekDay;
  supervisorId: string;
}): Promise<string[]> {
  const { clinicId, weekStart, day, supervisorId } = args;
  const { data: members } = await getAllGroupMembers(clinicId);
  const kids = ((members || []) as {
    doctor_id: string; doctor_name: string; work_status?: string; supervisor_doctor_id?: string | null;
  }[]).filter((m) => m.work_status === 'trainee' && m.supervisor_doctor_id === supervisorId);
  if (kids.length === 0) return [];
  const cur = await loadDay(clinicId, weekStart, day); // بعد الإرجاع
  const supSlots = cur.filter(
    (r) => r.doctor_id === supervisorId && r.status === 'active' && r.period > 0
      && (r.role === 'clinic' || r.role === 'delegator'),
  );
  if (supSlots.length === 0) return [];
  const names: string[] = [];
  for (const t of kids) {
    const tRows = cur.filter((r) => r.doctor_id === t.doctor_id);
    if (tRows.some((r) => r.status === 'active' && r.period > 0
      && (r.role === 'clinic' || r.role === 'delegator'))) continue; // منسَّب/مُلحَق بغيره — يبقى
    if (tRows.some((r) => r.period === 0
      && (r.status === 'sick_leave' || r.status === 'vacation'
        || r.status === 'permission_start' || r.status === 'permission_end'))) continue; // غائب/مستأذن بنفسه
    const tEx = tRows.filter((r) => r.period === 0 && r.status === 'extra');
    if (tEx.length === 0 || !tEx.some((r) => r.source === 'shadow')) continue;
    await applySlotChanges({
      deleteIds: tEx.map((r) => r.id),
      inserts: supSlots.map((r) => ({
        clinic_id: clinicId, week_start: weekStart, day_of_week: day,
        period: r.period, clinic_number: r.clinic_number,
        doctor_id: t.doctor_id, doctor_name: t.doctor_name,
        role: r.role, status: 'active', source: 'request',
      })),
    });
    names.push(t.doctor_name);
  }
  return names;
}

// ─── لجنةُ التحكيم: تختار أعدلَ مرشَّحٍ حين يوجد أكثرُ من حلٍّ صحيح ───
const DAY_ORDER: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };

/** سياقُ العدل لِلجنة التحكيم: حِملُ الاستضافة هذا الأسبوع + آخرُ دورِ استضافةٍ لكلّ
 *  طبيب (حاضرٌ وماضٍ). نقيس على محور الاستضافة (delegator) لأنّه العبءُ غيرُ المتساوي. */
async function loadFairnessContext(clinicId: string, weekStart: string): Promise<{ hostLoad: Map<string, number>; lastHost: Map<string, string> }> {
  const hostLoad = new Map<string, number>(); const lastHost = new Map<string, string>();
  const { data } = await supabase
    .from('schedule_slots')
    .select('doctor_id, week_start, day_of_week, role, status')
    .eq('clinic_id', clinicId).eq('role', 'delegator').eq('status', 'active').lte('week_start', weekStart);
  for (const r of (data || []) as { doctor_id: string; week_start: string; day_of_week: string }[]) {
    const stamp = `${r.week_start}#${DAY_ORDER[r.day_of_week] ?? 0}`;
    const prev = lastHost.get(r.doctor_id);
    if (!prev || stamp > prev) lastHost.set(r.doctor_id, stamp);
    if (r.week_start === weekStart) hostLoad.set(r.doctor_id, (hostLoad.get(r.doctor_id) ?? 0) + 1);
  }
  return { hostLoad, lastHost };
}

/** لجنةُ تحكيمٍ تُشرف على كلّ اختيارٍ فيه أكثرُ من مرشَّح. ثلاثةُ حكّام (مُسجَّلون):
 *  • الحِملُ (٠٫٤٥): الأقلُّ استضافةً هذا الأسبوع أَولى — لا نُثقِل مُثقَلًا.
 *  • عدالةُ الدور (٠٫٣٥): الأقدمُ عهدًا بالاستضافة (أو لم يستضِف قطُّ) أَولى — يدور العبء.
 *  • أقلُّ إخلال (٠٫٢٠): المرشّحُ في العيادة المفضّلة (أقلُّ تغييرًا) أَولى.
 *  تُطبَّع درجاتُ كلّ حكَمٍ في [٠،١] ثمّ تُوزَن. تعادُلٌ → ترتيبٌ ثابت (رقم العيادة، المعرّف). */
function judgePanel(
  cands: Row[],
  ctx: { hostLoad: Map<string, number>; lastHost: Map<string, string> },
  preferClinic: number | null,
): { winner: Row; log: string } {
  const sorted = [...cands].sort((a, b) => a.clinic_number - b.clinic_number || a.doctor_id.localeCompare(b.doctor_id));
  if (sorted.length <= 1) return { winner: sorted[0]!, log: '' };
  const loads = sorted.map((r) => ctx.hostLoad.get(r.doctor_id) ?? 0);
  const minL = Math.min(...loads); const maxL = Math.max(...loads);
  const recSorted = [...new Set(sorted.map((r) => ctx.lastHost.get(r.doctor_id) ?? ''))].sort(); // تصاعديًّا: الأقدم أوّلًا
  const loadNorm = (v: number) => (maxL === minL ? 1 : (maxL - v) / (maxL - minL));
  const recNorm = (v: string) => (recSorted.length <= 1 ? 1 : 1 - recSorted.indexOf(v) / (recSorted.length - 1));
  let winner = sorted[0]!; let bestScore = -Infinity; const parts: string[] = [];
  for (const r of sorted) {
    const L = ctx.hostLoad.get(r.doctor_id) ?? 0;
    const sL = loadNorm(L); const sR = recNorm(ctx.lastHost.get(r.doctor_id) ?? '');
    const sD = preferClinic != null && r.clinic_number === preferClinic ? 1 : 0;
    const score = 0.45 * sL + 0.35 * sR + 0.20 * sD;
    parts.push(`${r.doctor_name.split(' ')[0]}=${score.toFixed(2)}[ح${L}]`);
    if (score > bestScore + 1e-9) { bestScore = score; winner = r; }
  }
  return { winner, log: parts.join(' ') };
}

/**
 * تبديلٌ تلقائيٌّ صامت عند تعارض الاستئذان: المُستأذِن يستلم خانةً في فترةٍ يحجبها
 * استئذانه → يُبادَل مقعده مع طبيبٍ في الفترة الحاضرة كي يعمل وقت حضوره ويُغطَّى المحجوب.
 *  ① زميل نفس العيادة بالفترة الأخرى (إن كان نظيفًا: ليس تخفيفًا/مستأذنًا نفس الفترة/ظلًّا).
 *  ② وإلّا طبيب عيادة أخرى بالفترة الحاضرة — الأقلّ إخلالًا بميزان الفترات
 *     (#1: مبدئيًّا الأدنى رقم عيادة — يُحسَّن لاحقًا).
 *  ③ تعارضٌ على دليقيتر (لا زميل عيادة) → تُترك شاغرة بلا تبديل.
 *  ④ مُضيف (عيادة في المحجوبة + دليقيتر في الحاضرة): يُبادَل مقعد العيادة المحجوب
 *     مع طبيبٍ من عيادةٍ أخرى أوّلًا ثمّ زميل نفس العيادة، و**ينتقل الدليقيتر للمرشّح**
 *     (يُرفع عن المُستأذِن) فيعمل المرشّح الفترتين.
 *     • فإن كان المرشّح نفسه مُضيفًا (له دليقيترٌ في الفترة المحجوبة): تنقلب فترتاه
 *       (عيادة في المحجوبة + دليقيتر في الحاضرة)، ويُحذَف دليقيتره القديم فتبقى **فجوة
 *       دليقيتر** في الفترة المحجوبة (delegatorGap) تُبلَّغ للقائد.
 *  ⑤ المُستأذِن يعمل عيادةً في الفترتين أو لا مرشّح → لا تبديل.
 * يُطبّق التبديل (مبادلة ملكيّة خانتين) ويتبعه الظلّ، ويُرجِع نتيجةً للعرض/الإشعار.
 */
type TraineeMember = { doctor_id: string; work_status?: string; supervisor_doctor_id?: string | null };
/**
 * ظلال المتدرّبين لهذا اليوم: متدرّبٌ خاناتُه (عيادة/دليقيتر) **تطابق مدرّبه تمامًا** في كلّ
 * نصفِ شفتٍ يعمله = ظلٌّ مبتدئ (المستقلّ يخالف مدرّبه فلا يُحتسب). نكشفه بنيويًّا لا بالـsource
 * — صفُّ الظلّ قد يُكتب source=ai فيفلت من فحص source. نستثني الظلَّ من بِرَك تبديل الاستئذان:
 * الظلّ يتبع مدرّبه ولا يُبادَل استقلالًا ولا يصير دليقيترًا.
 */
function dayShadowTraineeIds(rows: Row[], members: TraineeMember[]): Set<string> {
  const ids = new Set<string>();
  const inScope = (r: Row) => r.period > 0 && r.status === 'active' && (r.role === 'clinic' || r.role === 'delegator');
  const keys = (id: string, ps: number[]) => rows.filter((r) => r.doctor_id === id && ps.includes(r.period) && inScope(r)).map((r) => `${r.period}|${r.clinic_number}|${r.role}`);
  for (const t of members.filter((m) => m.work_status === 'trainee' && m.supervisor_doctor_id)) {
    const supId = t.supervisor_doctor_id!;
    let mirrors = false; let mismatched = false;
    for (const ps of [[1, 2], [3, 4]]) {
      const tk = keys(t.doctor_id, ps);
      if (!tk.length) continue;
      const sk = new Set(keys(supId, ps));
      if (tk.length === sk.size && tk.every((k) => sk.has(k))) mirrors = true; else mismatched = true;
    }
    if (mirrors && !mismatched) ids.add(t.doctor_id);
  }
  return ids;
}

async function autoResolvePermissionConflict(args: {
  clinicId: string; weekStart: string; day: WeekDay;
  doctorId: string; doctorName: string;
  conflictSlots: { period: number; clinic_number: number }[];
}): Promise<{ withId: string; withName: string; withClinic: number; withPeriod: number; delegatorGap?: boolean } | { none: true; reason: 'no_candidate' | 'delegator_left' }> {
  const { clinicId, weekStart, day, doctorId, doctorName, conflictSlots } = args;
  const comp = (p: number) => (p === 1 ? 2 : p === 2 ? 1 : p === 3 ? 4 : 3);

  // الفترة المحجوبة قد تكون دورَ عيادةٍ (clinicConflict، رقم عيادة>0) أو دورَ استضافة
  // (دليقيتر، رقم عيادة=0): المُضيف المتفرّغ يستضيف الفترتين بلا عيادة، والمُضيف الزوجيّ
  // محجوبٌ على فترة استضافته. كلاهما كان القلبُ القديم يتركه شاغرًا (delegator_left).
  const clinicConflict = conflictSlots.find((c) => c.clinic_number > 0);
  const delegConflict = conflictSlots.find((c) => c.clinic_number === 0);
  const Pblocked = (clinicConflict ?? delegConflict)?.period;
  if (Pblocked == null) return { none: true, reason: 'delegator_left' };
  const Pother = comp(Pblocked);
  const C = clinicConflict?.clinic_number ?? 0;

  const rows = await loadDay(clinicId, weekStart, day);
  const { data: members } = await getAllGroupMembers(clinicId);
  const lightDuty = new Set(((members || []) as { doctor_id: string; work_status?: string }[])
    .filter((m) => m.work_status === 'light_duty').map((m) => m.doctor_id));
  const shadowIds = dayShadowTraineeIds(rows, (members || []) as TraineeMember[]);
  const worksPeriod = (id: string, p: number) => rows.some(
    (r) => r.doctor_id === id && r.status === 'active' && r.period === p && (r.role === 'clinic' || r.role === 'delegator'),
  );
  // مرشّحٌ يعمل العيادة في الفترة الحاضرة (Pother) ويصلح لاستلام دورٍ في المحجوبة: ليس
  // المُستأذِن ولا ظلًّا ولا تخفيفًا، وليس غائبًا/محجوبًا عن المحجوبة (فهو سيعمل فيها).
  const canTakeBlocked = (r: Row): boolean => {
    if (r.doctor_id === doctorId || r.role !== 'clinic' || r.status !== 'active' || r.period !== Pother || r.clinic_number <= 0) return false;
    if (r.source === 'shadow' || shadowIds.has(r.doctor_id) || lightDuty.has(r.doctor_id)) return false;
    const abs = covererAbsence(rows, r.doctor_id);
    return !abs.hardAr && !abs.blocked.has(Pblocked);
  };

  // ═══ الفترة المحجوبة دورُها استضافة (دليقيتر، لا عيادة) ═══
  // نحلّها بنيويًّا ثمّ يمتصّ القلبُ الجديد (rebalanceForward) دَينَ الدليقيتر عبر الأيّام.
  if (!clinicConflict) {
    const myDelegBlocked = rows.find((r) => r.doctor_id === doctorId && r.status === 'active' && r.period === Pblocked && r.role === 'delegator');
    if (!myDelegBlocked) return { none: true, reason: 'delegator_left' }; // حُلّ أصلًا
    const myDelegOpen = rows.find((r) => r.doctor_id === doctorId && r.status === 'active' && r.period === Pother && r.role === 'delegator');
    const hasClinic = rows.some((r) => r.doctor_id === doctorId && r.status === 'active' && r.role === 'clinic' && r.period > 0);
    const dedicatedFull = !hasClinic && !!myDelegOpen; // يستضيف الفترتين بلا عيادة (شكل ٧/٣ فما فوق)
    // مرشّحٌ يعمل Pother وحرٌّ تمامًا في المحجوبة (لا عيادة ولا استضافة) — يصلح أن يستضيفها.
    // لجنةُ التحكيم تختار الأعدلَ بينهم (لا الأدنى رقمًا): المرشّح يصير مُضيفًا، فالعبءُ
    // يذهب لِمن هو أقلُّ استضافةً/أقدمُ عهدًا بها.
    const promoCands = rows.filter((r) => canTakeBlocked(r) && !worksPeriod(r.doctor_id, Pblocked));
    if (promoCands.length === 0) return { none: true, reason: 'delegator_left' };
    const fair = await loadFairnessContext(clinicId, weekStart);
    const judged = judgePanel(promoCands, fair, null);
    const promo = judged.winner;
    if (judged.log) console.log(`[لجنة-التحكيم · استضافة ${DAY_AR[day]}] ${judged.log} → ${promo.doctor_name.split(' ')[0]}`);

    // (أ) مُضيفٌ متفرّغ → تبديلٌ كامل يحفظ شكلَ المضيف الواحد: promo يصير المضيفَ المتفرّغ
    //     (يستلم استضافة الفترتين)، والمستأذِن ينزل إلى مقعد promo العياديّ في Pother.
    if (dedicatedFull) {
      const snap = [myDelegBlocked, myDelegOpen!].map((s) => ({
        clinic_id: clinicId, week_start: weekStart, day_of_week: day,
        period: s.period, clinic_number: s.clinic_number,
        doctor_id: doctorId, doctor_name: doctorName, role: PREV_ROLE, status: 'active', source: 'request',
      }));
      await applySlotChanges({
        updates: [
          { id: myDelegBlocked.id, doctor_id: promo.doctor_id, doctor_name: promo.doctor_name },
          { id: myDelegOpen!.id, doctor_id: promo.doctor_id, doctor_name: promo.doctor_name },
          { id: promo.id, doctor_id: doctorId, doctor_name: doctorName },
        ],
        inserts: snap,
      });
      await mirrorShadows({ clinicId, weekStart, day, supervisorIds: [doctorId, promo.doctor_id], preRows: rows });
      return { withId: promo.doctor_id, withName: promo.doctor_name, withClinic: 0, withPeriod: Pblocked };
    }

    // (ب) استدعاء (مُضيفٌ زوجيّ محجوبٌ على فترة استضافته): انقل استضافة المحجوبة إلى promo،
    //     ويبقى المستأذِن في عيادته بالفترة الحاضرة. خانةٌ واحدةٌ تنتقل، والباقي يمتصّه القلب.
    const snap = [{
      clinic_id: clinicId, week_start: weekStart, day_of_week: day,
      period: myDelegBlocked.period, clinic_number: myDelegBlocked.clinic_number,
      doctor_id: doctorId, doctor_name: doctorName, role: PREV_ROLE, status: 'active', source: 'request',
    }];
    await applySlotChanges({
      updates: [{ id: myDelegBlocked.id, doctor_id: promo.doctor_id, doctor_name: promo.doctor_name }],
      inserts: snap,
    });
    await mirrorShadows({ clinicId, weekStart, day, supervisorIds: [doctorId, promo.doctor_id], preRows: rows });
    return { withId: promo.doctor_id, withName: promo.doctor_name, withClinic: 0, withPeriod: Pblocked };
  }

  // ═══ الفترة المحجوبة دورُها عيادة (المسار الأصليّ) ═══
  // حضور المُستأذِن في الفترة الحاضرة:
  //  • عيادة فيها → يعمل العيادة في الفترتين، لا مقعد يُبادَل إليه → لا بديل.
  //  • دليقيتر فيها (مُضيف) → نبادل مقعد العيادة المحجوب ونُذيب الدليقيتر (يبقى فارغًا).
  const holderPother = rows.filter(
    (r) => r.doctor_id === doctorId && r.status === 'active' && r.period === Pother
      && (r.role === 'clinic' || r.role === 'delegator'),
  );
  if (holderPother.some((r) => r.role === 'clinic')) return { none: true, reason: 'no_candidate' };
  const hostDelegator = holderPother.find((r) => r.role === 'delegator');
  const holderSeat = rows.find(
    (r) => r.doctor_id === doctorId && r.status === 'active' && r.period === Pblocked
      && r.clinic_number === C && r.role === 'clinic',
  );
  if (!holderSeat) return { none: true, reason: 'no_candidate' };

  // مرشّحٌ صالح: خانة عيادة نشطة في الفترة الحاضرة، ليس المُستأذِن ولا ظلًّا ولا تخفيفًا،
  // وليس غائبًا/مستأذنًا عن الفترة المحجوبة (فهو سيستلمها).
  const eligible = (r: Row): boolean => {
    if (r.doctor_id === doctorId || r.role !== 'clinic' || r.status !== 'active' || r.period !== Pother) return false;
    if (r.source === 'shadow' || shadowIds.has(r.doctor_id) || lightDuty.has(r.doctor_id)) return false;
    // يعمل عيادةً في المحجوبة أصلًا (منفردٌ يعمل الفترتين) → استلامُ عيادةٍ ثانيةٍ فيها حجزٌ
    // مزدوج. (دليقيترُه في المحجوبة مقبول: يُحذَف فتبقى فجوةُ دليقيتر — يعالجها أدناه.)
    if (rows.some((x) => x.doctor_id === r.doctor_id && x.status === 'active' && x.period === Pblocked && x.role === 'clinic' && x.clinic_number > 0)) return false;
    const abs = covererAbsence(rows, r.doctor_id);
    return !abs.hardAr && !abs.blocked.has(Pblocked);
  };

  // المُضيف: عيادةٌ أخرى أوّلًا ثمّ زميل نفس العيادة (الحالة قد تقع على أربع عيادات).
  // غيره: زميل نفس العيادة أوّلًا، ثمّ عيادة أخرى — الأقلّ إخلالًا بالميزان.
  // نُبقي التفضيلَ البنيويّ (نفس/أخرى) صلبًا، وداخلَ المجموعة المفضّلة تختار لجنةُ
  // التحكيم الأعدلَ (الأقلّ حِملًا/الأقدم دورًا) بدل أوّل مرشّحٍ رقمًا.
  const sameC = rows.filter((r) => r.clinic_number === C && eligible(r));
  const otherC = rows.filter((r) => r.clinic_number !== C && eligible(r));
  const pool = hostDelegator ? (otherC.length ? otherC : sameC) : (sameC.length ? sameC : otherC);
  if (pool.length === 0) return { none: true, reason: 'no_candidate' };
  const fairP = await loadFairnessContext(clinicId, weekStart);
  const judgedP = judgePanel(pool, fairP, hostDelegator ? null : C);
  const partner = judgedP.winner;
  if (judgedP.log) console.log(`[لجنة-التحكيم · تبديل ${DAY_AR[day]}] ${judgedP.log} → ${partner.doctor_name.split(' ')[0]}`);

  // مرشّحٌ مُضيفٌ هو الآخر: له دليقيترٌ في الفترة المحجوبة (عكس دليقيتر المُستأذِن).
  // عندها يشغل الآن عيادةً في المحجوبة فلا يسعه دليقيترها → يُحذَف وتبقى فجوة دليقيتر.
  const partnerDelegatorPblocked = hostDelegator
    ? rows.find((r) => r.doctor_id === partner.doctor_id && r.status === 'active'
        && r.period === Pblocked && r.role === 'delegator')
    : undefined;

  // لقطةُ مقعد المُستأذِن **الأصليّ** قبل التبديل (صفّ PREV_ROLE — نفس آليّة الغياب):
  // تُعلِم العودةَ أنّ تبديلاً حدث، وتمنح placementShift شفتَه، فيُعاد حساب الشفت عند
  // الإلغاء (يعود لمقعده إن ثبت العالم، أو يُشتقّ الصواب إن تغيّر).
  const snapshotRows = [
    { period: holderSeat.period, clinic_number: holderSeat.clinic_number },
    ...(hostDelegator ? [{ period: hostDelegator.period, clinic_number: hostDelegator.clinic_number }] : []),
  ].map((s) => ({
    clinic_id: clinicId, week_start: weekStart, day_of_week: day,
    period: s.period, clinic_number: s.clinic_number,
    doctor_id: doctorId, doctor_name: doctorName,
    role: PREV_ROLE, status: 'active', source: 'request',
  }));

  // مبادلة ملكيّة الخانتين: المُستأذِن يأخذ الفترة الحاضرة، والمرشّح يأخذ المحجوبة.
  // وفي المُضيف: ينتقل دليقيتر المُستأذِن (الحاضر) للمرشّح فيعمل المرشّح الفترتين.
  await applySlotChanges({
    updates: [
      { id: holderSeat.id, doctor_id: partner.doctor_id, doctor_name: partner.doctor_name },
      { id: partner.id, doctor_id: doctorId, doctor_name: doctorName },
      ...(hostDelegator
        ? [{ id: hostDelegator.id, doctor_id: partner.doctor_id, doctor_name: partner.doctor_name }]
        : []),
    ],
    inserts: snapshotRows,
    ...(partnerDelegatorPblocked ? { deleteIds: [partnerDelegatorPblocked.id] } : {}),
  });
  await mirrorShadows({ clinicId, weekStart, day, supervisorIds: [doctorId, partner.doctor_id], preRows: rows });
  return partnerDelegatorPblocked
    ? { withId: partner.doctor_id, withName: partner.doctor_name, withClinic: C, withPeriod: Pblocked, delegatorGap: true }
    : { withId: partner.doctor_id, withName: partner.doctor_name, withClinic: C, withPeriod: Pblocked };
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
): Promise<StatusResult & {
  permission?: PermissionInfo;
  effShift?: Shift;             // الشفت الفعليّ المصحَّح من مكان الطبيب — تستعمله إعادة التوازن
  duplicate?: boolean;          // نفس الحالة مسجّلة أصلًا — لا عمل، ذكِّر بالتكرار
  keptPermissionAr?: string;    // احتياطٌ فوق استئذانٍ قائم — نصّ «لن يُستدعى في …»
  returnedShadows?: string[];   // ظلالٌ عادت مع المدرّب عند إرجاعه (تحويل غياب→استئذان)
}> {
  const { clinicId, weekStart, day, doctorId, doctorName, status, shift } = args;
  if (!canActOnDoctor(actor, doctorId)) return fail('لا تملك صلاحيّة تغيير حالة هذا الطبيب.');
  // الاحتياط صلاحيّة القائد فأعلى حصرًا — الطبيب لا يجعل نفسه (ولا غيره) احتياطًا.
  if (status === 'extra' && !isLeaderPlus(actor.role)) {
    return fail('جعل طبيبٍ احتياطًا صلاحيّة للقائد فأعلى فقط.');
  }
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

    // ── قاعدة ثابتة (idempotency): إعادة تطبيق **نفس** الغياب على طبيبٍ غائبٍ
    // أصلًا (غير منسَّب في عيادة) = لا عمل. لا نلمس الجدول ولا المكان المحفوظ
    // (prev_placement) — هكذا لا يضيع المكان مهما تكرّر الطلب. نُعيد فقط أماكن
    // النقص محسوبةً من المكان المحفوظ كي لا تفقد تغطية القائد. ──
    const stillPlaced = mine.some(
      (r) => r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'),
    );
    const alreadySameStatus = mine.some((r) => r.period === 0 && r.status === status);
    // «احتياط» لطبيبٍ احتياطٍ أصلًا = غالبًا خطأ توجيه. لا نجاح صامتًا — رسالة تصحيح.
    // (تعويض النقص لم يعد بأدوات الطلبات — يُرتَّب تلقائيًّا عند الغياب.)
    if (status === 'extra' && alreadySameStatus && !stillPlaced) {
      return fail(
        `${doctorName} احتياطٌ أصلًا هذا اليوم — لا حاجة لتسجيله. ` +
        `تعويض النقص عند الغياب يُرتَّب تلقائيًّا، فلا تسجّل احتياطًا لهذا الغرض.`,
      );
    }
    if (REMOVES_FROM_CLINIC.has(status) && alreadySameStatus && !stillPlaced) {
      const prev = mine.filter((r) => r.role === PREV_ROLE);
      return { success: true, gaps: gapsFrom(prev), duplicate: true };
    }
    // استئذانٌ بنفس النوع مسجّلٌ أصلًا → تذكيرٌ بالتكرار، لا إعادة كتابةٍ ولا إشعارات
    const toPermission = status === 'permission_start' || status === 'permission_end';
    if (toPermission && alreadySameStatus) {
      return { success: true, gaps: [], duplicate: true };
    }

    // ── الطبيب نفسه ظلٌّ (متدرّب خاناته تطابق خانات مدرّبه تمامًا)؟ ──
    // غيابه لا يُحدث نقصًا — مدرّبه باقٍ في الخانة — فلا حفظَ ولا كروت تغطية:
    // تُمسح خاناته ويُكتب صفّ حالته بوسم source='shadow'، فيعيده الإلغاء إلى جانب
    // مدرّبه **أينما كان حينها** لا إلى خانةٍ قديمة. والاستئذان ينقله إلى الاحتياط
    // وحده (لا تعارض يُحسب له — الظلّ لا يملك خانةً مستقلّة يستلمها).
    if (myActive.length > 0) {
      const { data: members0 } = await getAllGroupMembers(clinicId);
      const me = ((members0 || []) as {
        doctor_id: string; work_status?: string; supervisor_doctor_id?: string | null;
      }[]).find((m) => m.doctor_id === doctorId);
      if (me?.work_status === 'trainee' && me.supervisor_doctor_id) {
        const supKeys = new Set(rows
          .filter((r) => r.doctor_id === me.supervisor_doctor_id && r.status === 'active'
            && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'))
          .map((r) => `${r.period}|${r.clinic_number}|${r.role}`));
        const myKeys = myActive.map((r) => `${r.period}|${r.clinic_number}|${r.role}`);
        if (myKeys.length > 0 && myKeys.length === supKeys.size && myKeys.every((k) => supKeys.has(k))) {
          const oldSt = mine.filter((r) => r.period === 0 && r.status !== 'active');
          const oldPrev = mine.filter((r) => r.role === PREV_ROLE);
          const cell = exCellOf(effShift!);
          const statusRow = {
            clinic_id: clinicId, week_start: weekStart, day_of_week: day,
            period: 0, clinic_number: cell,
            doctor_id: doctorId, doctor_name: doctorName,
            role: 'clinic', status, source: 'shadow',
          };
          // استئذان الظلّ: علامة الاستئذان + صفّ احتياطٍ معًا (يظهر في قائمة EX)
          await applySlotChanges({
            deleteIds: [...myActive, ...oldSt, ...oldPrev].map((r) => r.id),
            inserts: toPermission ? [statusRow, { ...statusRow, status: 'extra' }] : [statusRow],
          });
          return {
            success: true, gaps: [],
            permission: toPermission
              ? { conflict: false, blocked: status === 'permission_start' ? [effShift === 'evening' ? 3 : 1] : [effShift === 'evening' ? 4 : 2], shadowToReserve: true }
              : undefined,
          };
        }
      }
    }

    // ── تحويل حالةٍ تُخرج من العيادة (مرضية/تفرّغ/احتياط) إلى استئذان ──
    // الاستئذان حالةُ مَن هو **داخل** العيادة (يتأخّر أو يخرج مبكّرًا). كان خارجها
    // بحالةٍ سابقة؟ أعِده أوّلًا إلى مكانه المحفوظ ثمّ ضَع علامة الاستئذان — كما لو
    // سُجّل الاستئذان من البداية، فلا حالة هجينة (لافتة استئذان وهو غائبٌ كلّيًّا).
    // الاستثناءات:
    //  • ظلٌّ غائب (وسم source='shadow') → يبقى ظلًّا: استئذانٌ + احتياطٌ بوسمه،
    //    وإلغاؤه يعيده إلى جانب مدرّبه. لا إرجاع لخانةٍ ولا كرت «تحديد مكان».
    //  • كان احتياطيًّا → لا إرجاع: العلامة تُضاف والاحتياط باقٍ (تعايش).
    //  • كان غائبًا ومكانه مُغطًّى (لا حفظ باقيًا، أو شغل خاناتِه غيرُه) → يسري
    //    التحويل بلا مركز، ويُعلَم بـcovered=true ليرسل الطرف الأعلى كرت
    //    «تحديد المكان» للقائد.
    const outRow = mine.find(
      (r) => r.period === 0 && REMOVES_FROM_CLINIC.has(r.status as ScheduleStatus),
    );
    const wasOut = !!outRow;
    let permPlacedRows: { period: number; clinic_number: number }[] | null = null;
    let permCovered = false;
    let permWasReserve = false;
    let permConvertedFromAr: string | undefined;
    let returnedShadows: string[] = [];
    if (toPermission && wasOut && !stillPlaced && outRow!.source === 'shadow') {
      const oldSt = mine.filter((r) => r.period === 0 && r.status !== 'active');
      const statusRow = {
        clinic_id: clinicId, week_start: weekStart, day_of_week: day,
        period: 0, clinic_number: outRow!.clinic_number,
        doctor_id: doctorId, doctor_name: doctorName,
        role: 'clinic', status, source: 'shadow',
      };
      await applySlotChanges({
        deleteIds: oldSt.map((r) => r.id),
        inserts: [statusRow, { ...statusRow, status: 'extra' }],
      });
      return {
        success: true, gaps: [],
        permission: { conflict: false, blocked: status === 'permission_start' ? [effShift === 'evening' ? 3 : 1] : [effShift === 'evening' ? 4 : 2], shadowToReserve: true },
      };
    }
    if (toPermission && wasOut && !stillPlaced) {
      const prevRows = mine.filter((r) => r.role === PREV_ROLE);
      if (outRow!.status === 'extra') {
        permWasReserve = true; // احتياطيّ يستأذن — العلامة تُضاف والاحتياط باقٍ، حفظه القديم لا يُمسّ
      } else if (prevRows.length === 0) {
        permCovered = true;
        permConvertedFromAr = outRow!.status === 'vacation' ? 'التفرّغ' : 'المرضية';
      } else {
        // لا إرجاع فوق ساكن: يُعاد إلى الخانات الفارغة فقط؛ ما شغله غيرُه يدويًّا
        // يبقى له، ويُعلَم القائد بكرت «تحديد المكان» للباقي.
        const free = prevRows.filter((r) => !slotOccupied(rows, r, doctorId));
        const taken = prevRows.length - free.length;
        await applySlotChanges({
          deleteIds: prevRows.map((r) => r.id),
          inserts: free.map((r) => ({
            clinic_id: clinicId, week_start: weekStart, day_of_week: day,
            period: r.period, clinic_number: r.clinic_number,
            doctor_id: doctorId, doctor_name: doctorName,
            role: r.clinic_number === 0 ? 'delegator' : 'clinic', status: 'active', source: 'request',
          })),
        });
        permPlacedRows = free.map((r) => ({ period: r.period, clinic_number: r.clinic_number }));
        if (taken > 0) {
          permCovered = true;
          permConvertedFromAr = outRow!.status === 'vacation' ? 'التفرّغ' : 'المرضية';
        }
        if (free.length > 0) {
          // شفته الفعليّ الآن من مكانه المستعاد، لا من استنتاجٍ قديمٍ وهو غائب
          effShift = free.some((r) => r.period >= 3) ? 'evening' : 'morning';
          // عاد المدرّب إلى الجدول → ظلُّه (المنقول احتياطًا) يعود معه تلقائيًّا
          returnedShadows = await returnShadowsWithSupervisor({ clinicId, weekStart, day, supervisorId: doctorId });
        }
      }
    }
    if (toPermission && permPlacedRows === null && stillPlaced) {
      permPlacedRows = myActive.map((r) => ({ period: r.period, clinic_number: r.clinic_number }));
    }

    // أزِل أيّ حالة EX سابقة لنفس الطبيب/اليوم (تفادي التكرار) — مع قاعدة التعايش:
    // الاحتياط والاستئذان يتعايشان (حقيقتان معًا: في صفّ الاحتياط ولا يُستدعى وقت
    // استئذانه) — فاستئذانٌ جديد لا يمحو صفّ الاحتياط، واحتياطٌ جديد لا يمحو
    // علامة الاستئذان. المرضية/التفرّغ غيابٌ كامل يمحو كلّ شيء.
    const isPermRow = (r: Row) => r.status === 'permission_start' || r.status === 'permission_end';
    const oldStatusRows = mine.filter((r) => r.status !== 'active' && r.period === 0);
    const keepRow = (r: Row) =>
      (toPermission && r.status === 'extra') || (status === 'extra' && isPermRow(r));
    // تُجمَع كلّ تغييرات تسجيل الحالة (حذف القديم + حفظ المكان + ظلال + صفّ الحالة)
    // وتُطبَّق معاملةً واحدةً في النهاية — فلا يبقى الطبيب بلا خانةٍ ولا حالةٍ إن
    // انقطع الاتصال في المنتصف. (الإرجاع المبكّر للاستئذان أعلاه له نداؤه الخاصّ
    // لأنّ returnShadowsWithSupervisor يقرأ DB بعده.)
    const pendDel: string[] = [];
    const pendIns: Record<string, unknown>[] = [];
    pendDel.push(...oldStatusRows.filter((r) => !keepRow(r)).map((r) => r.id));
    // احتياطٌ فوق استئذانٍ باقٍ → نصّ «لن يُستدعى في فترته» (بفترته الفعليّة حسب شفته)
    let keptPermissionAr: string | undefined;
    const keptPerm = status === 'extra' ? oldStatusRows.find(isPermRow) : undefined;
    if (keptPerm) {
      const firstP = effShift === 'evening' ? 3 : 1;
      const ps = keptPerm.status === 'permission_start';
      keptPermissionAr = `مستأذن ${ps ? 'بداية' : 'نهاية'} الدوام — لن يُستدعى في الفترة ${ps ? firstP : firstP + 1}`;
    }
    // كان موسومًا ظلًّا (غائبًا بوسم source='shadow')؟ الحالة الجديدة ترث الوسم
    // كي يبقى إلغاؤها يعيده إلى جانب مدرّبه لا إلى حفظٍ لا يملكه.
    const wasShadowMarked = oldStatusRows.some((r) => r.source === 'shadow');

    if (REMOVES_FROM_CLINIC.has(status)) {
      // احفظ المكان قبل الغياب (خانات العيادة/الدليقيتر الفعليّة)، ثمّ احذفها
      const placed = mine.filter(
        (r) => r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'),
      );
      gaps = gapsFrom(placed); // أماكن النقص قبل حذف الخانات (عيادة + دليقيتر، بلا فترات)
      // احفظ المكان **فقط** إن كان الطبيب منسَّبًا فعلًا الآن. إن كان غائبًا أصلًا
      // (placed فارغ — كإعادة تطبيق الطبيّة) فلا تلمس الحفظ القديم وإلّا ضاع مكانه
      // فلا يجد الإلغاء ما يُرجِعه.
      if (placed.length > 0) {
        const oldPrev = mine.filter((r) => r.role === PREV_ROLE);
        pendDel.push(...oldPrev.map((r) => r.id), ...placed.map((r) => r.id));
        pendIns.push(
          ...placed.map((r) => ({
            clinic_id: clinicId, week_start: weekStart, day_of_week: day,
            period: r.period, clinic_number: r.clinic_number,
            doctor_id: doctorId, doctor_name: doctorName,
            role: PREV_ROLE, status: 'active', source: 'request',
          })),
        );
      }

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
        const tOldEx = rows.filter((r) => r.doctor_id === t.doctor_id && r.period === 0);
        pendDel.push(...tSlots.map((r) => r.id), ...tOldEx.map((r) => r.id));
        // وسم 'shadow' يميّزه عن احتياطيٍّ بقرارٍ مستقلّ — به يعود تلقائيًّا مع
        // مدرّبه عند إرجاعه، ولا يُمسّ مَن جُعل احتياطًا عمدًا.
        pendIns.push({
          clinic_id: clinicId, week_start: weekStart, day_of_week: day,
          period: 0, clinic_number: exCellOf(effShift),
          doctor_id: t.doctor_id, doctor_name: t.doctor_name,
          role: 'clinic', status: 'extra', source: 'shadow',
        });
      }
    }

    // اكتب صفّ الحالة (period=0، جهة EX حسب الشفت الفعليّ)
    pendIns.push({
      clinic_id: clinicId, week_start: weekStart, day_of_week: day,
      period: 0, clinic_number: exCellOf(effShift),
      doctor_id: doctorId, doctor_name: doctorName,
      role: 'clinic', status, source: wasShadowMarked ? 'shadow' : 'request',
    });
    // طبّق كلّ تغييرات الحالة دفعةً واحدة (ذرّيًّا): الحذف ثمّ الإضافة في معاملة واحدة
    await applySlotChanges({ deleteIds: pendDel, inserts: pendIns });

    // ── تعارض الاستئذان: يستلم خانةً في فترةٍ يحجبها استئذانه؟ ──
    // بداية الدوام تحجب أولى فترتي الشفت (١/٣)، نهايته تحجب الأخيرة (٢/٤). عند التعارض:
    // **تبديلٌ تلقائيٌّ صامت** يحسبه المحرّك وينفّذه فورًا (زميل العيادة، وإلّا عيادة أخرى)،
    // والذكاء يُخبر فقط — لا أزرار. الاحتياطيّ المستأذِن لا يُبدَّل (لا خانة عيادة يستلمها).
    let permission: PermissionInfo | undefined;
    if (toPermission) {
      const blocked = status === 'permission_start'
        ? [effShift === 'evening' ? 3 : 1]
        : [effShift === 'evening' ? 4 : 2];
      const placed = permPlacedRows ?? [];
      const conflictSlots = placed.filter((p) => blocked.includes(p.period));
      let swap: PermissionInfo['swap'];
      if (conflictSlots.length > 0 && !permWasReserve) {
        swap = await autoResolvePermissionConflict({
          clinicId, weekStart, day, doctorId, doctorName, conflictSlots,
        });
      }
      // قاعدةُ الحالة الرفيعة (D=M+1): إن لم يجد التبديلُ بديلًا (كلُّ الزملاء منفردون
      // مشغولون في الفترتين)، يبقى المستأذِنُ شاغلًا فترتَه المحجوبة — وهذا تناقضٌ (مستأذنٌ
      // وعاملٌ معًا). أَخْلِ مقعدَه المحجوب: يبقى فارغًا في الجدول (لا أحدَ فائضٌ يغطّيه)،
      // واحفظه prev_placement كي يعيده الإلغاءُ حرفيًّا كالتبديل. (لا يُطبَّق على المُحتاط:
      // لا خانةَ عيادةٍ له يحجبها الاستئذان.) آمنٌ بعد تبديلٍ ناجح: لا خانةَ محجوبةً تبقى.
      if (!permWasReserve) {
        const dayNow = await loadDay(clinicId, weekStart, day);
        const stuck = dayNow.filter((r) => r.doctor_id === doctorId && r.status === 'active'
          && blocked.includes(r.period) && (r.role === 'clinic' || r.role === 'delegator'));
        if (stuck.length) {
          await applySlotChanges({
            deleteIds: stuck.map((r) => r.id),
            inserts: stuck.map((r) => ({
              clinic_id: clinicId, week_start: weekStart, day_of_week: day,
              period: r.period, clinic_number: r.clinic_number,
              doctor_id: doctorId, doctor_name: doctorName,
              role: PREV_ROLE, status: 'active', source: 'request',
            })),
          });
          if (!swap) swap = { none: true, reason: 'no_candidate' };
          // eslint-disable-next-line no-console
          console.log(`[استئذان رفيع · ${DAY_AR[day]}] أُخليت خانةُ ${doctorName.split(' ')[0]} (ف${[...new Set(stuck.map((r) => r.period))].join('،')}) — لا بديل، تبقى فارغة`);
        }
      }
      // احتياطيٌّ استأذن — العلامة أُضيفت والاحتياط باقٍ: نصّ «لن يُستدعى» بفترته
      let wasReserveNoteAr: string | undefined;
      if (permWasReserve) {
        const firstP = effShift === 'evening' ? 3 : 1;
        const ps = status === 'permission_start';
        wasReserveNoteAr = `لا يزال احتياطًا — لن يُستدعى في الفترة ${ps ? firstP : firstP + 1}`;
      }
      permission = {
        conflict: conflictSlots.length > 0, blocked, swap,
        covered: permCovered || undefined, convertedFromAr: permConvertedFromAr,
        wasReserve: permWasReserve || undefined, wasReserveNoteAr,
      };
    }

    return {
      success: true, gaps, permission, keptPermissionAr,
      effShift: effShift ?? undefined,
      returnedShadows: returnedShadows.length ? returnedShadows : undefined,
    };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

/**
 * يلغي حالة طبيب ليومٍ (يُزيل صفّ EX). الطبيب لنفسه؛ الليدر لأيّ أحد.
 * restoreToPrevPlace=true: يعيده إلى مكانه قبل الغياب إن وُجد محفوظًا — إلى
 * الخانات **الفارغة** فقط (لا إرجاع فوق ساكن).
 * ترتيب الإلغاء عند اجتماع حالتين (تعايش الاحتياط والاستئذان): الاستئذان يُلغى
 * أوّلًا (يبقى احتياطًا)؛ إلغاءٌ ثانٍ يلغي الاحتياط نفسه.
 * الظلّ الموسوم (source='shadow') يعود إلى جانب مدرّبه أينما كان حينها.
 * covered=true: مكانه (كلّه أو بعضه) مُغطًّى/مشغول — القائد يقرّر أين يوضَع.
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
): Promise<RequestResult & {
  restored?: boolean;
  covered?: boolean;
  canceledStatus?: string;
  permissionCanceled?: boolean;       // أُزيلت علامة استئذانٍ وهو في عيادته — لا إرجاع
  permSwapReverted?: boolean;         // عُكِس تبديل الاستئذان حرفيًّا (عالمٌ ثابت)
  permSwapRecompute?: boolean;        // مُضيفٌ/عالمٌ متغيّر → تُعيد الطبقة الأعلى حساب الشفت
  returnedToReserve?: boolean;        // أُزيلت العلامة وبقي احتياطًا كما كان
  shadowReturned?: boolean;           // ظلٌّ عاد إلى جانب مدرّبه
  shadowSupervisorAbsent?: boolean;   // ظلٌّ أُلغيت حالته ومدرّبه غائب — بقي احتياطًا
  returnedShadows?: string[];         // ظلالُ المدرّب التي عادت معه عند إرجاعه
}> {
  const { clinicId, weekStart, day, doctorId, restoreToPrevPlace } = args;
  if (!canActOnDoctor(actor, doctorId)) return fail('لا تملك صلاحيّة إلغاء حالة هذا الطبيب.');
  try {
    let rows = await loadDay(clinicId, weekStart, day);
    const mine = rows.filter((r) => r.doctor_id === doctorId);

    // أزِل صفّ الحالة (period=0 وحالته ليست active)
    const statusRow = mine.find((r) => r.period === 0 && r.status !== 'active');
    // حارس اليوم: لا حالة مسجّلة في اليوم المسمّى → ارفض واذكر أيّامه الفعليّة هذا
    // الأسبوع — يصحّح نداءً مرّر يومًا خاطئًا بدل «إلغاء» لا شيء بنجاحٍ كاذب.
    if (!statusRow) {
      const { data: wk } = await supabase
        .from('schedule_slots')
        .select('day_of_week')
        .eq('clinic_id', clinicId)
        .eq('week_start', weekStart)
        .eq('doctor_id', doctorId)
        .eq('period', 0)
        .neq('status', 'active');
      const days = [...new Set(
        ((wk || []) as { day_of_week: string }[]).map((r) => DAY_AR[r.day_of_week] || r.day_of_week),
      )];
      return fail(
        days.length
          ? `لا حالة مسجّلة يوم ${DAY_AR[day]} لهذا الطبيب. حالاته المسجّلة هذا الأسبوع: ` +
            `${days.join('، ')} — مرّر اليوم الذي سمّاه المستخدم حرفيًّا.`
          : `لا حالة مسجّلة لهذا الطبيب في هذا الأسبوع (${weekStart}).`,
      );
    }
    const statusRows = mine.filter((r) => r.period === 0 && r.status !== 'active');
    const isPermRow = (r: Row) => r.status === 'permission_start' || r.status === 'permission_end';
    const prev = mine.filter((r) => r.role === PREV_ROLE);

    // عكسُ الأثر البعيد (لكلّ الأنواع: استئذان/مرضية/تفرّغ): إن حرّك هذا الحدث امتصاصًا
    // في أيّامٍ أخرى عند تسجيله (يوميّاتٌ مخفيّة)، نُعيدها الآن إن بقيت سليمة. يومُ الحدث
    // نفسه يعالجه الإرجاع الحرفيّ/إرجاع المكان أدناه. بلا يوميّاتٍ → لا عمل (استعلامٌ واحد).
    try {
      const xr = await restoreXdayFootprint(clinicId, weekStart, day, doctorId);
      if (xr.restored.length || xr.entangled.length) {
        // eslint-disable-next-line no-console
        console.log(`[xday-cancel] أُعيد: ${xr.restored.map((d) => DAY_AR[d] || d).join('،') || '—'}`
          + ` | متشابك (تُرك): ${xr.entangled.map((d) => DAY_AR[d] || d).join('،') || '—'}`);
      }
      // أُعيد يومُ الحدث نفسه إلى لقطته القبليّة (التغطيةُ عُكِست: عاد المُسقِطُ لاستضافته
      // وزالت ترقياتُ الجيران، ومقعدُ الغائب صار فارغًا) → نعيد تحميل rows كي تَملأَ كتلةُ
      // الاستردادِ أدناه الغائبَ في مكانه الفارغ بدل أن تعمل على حالةٍ قديمةٍ مشغولة.
      if (xr.restored.includes(day)) rows = await loadDay(clinicId, weekStart, day);
    } catch (e) { /* الاسترجاع البعيد تحسينٌ — لا يُفشل الكنسل */ void e; }

    // ── ظلٌّ موسوم (source='shadow')؟ عودته مرآةُ خانات مدرّبه **الحاليّة** ──
    // (لا حفظَ له — الظلّ يلاصق مدرّبه أينما كان). مدرّبه غائب؟ يبقى احتياطًا.
    const shadowMark = statusRows.find((r) => r.source === 'shadow');
    if (shadowMark) {
      const shadowDel = [...statusRows, ...prev].map((r) => r.id);
      const { data: members } = await getAllGroupMembers(clinicId);
      const me = ((members || []) as {
        doctor_id: string; work_status?: string; supervisor_doctor_id?: string | null;
      }[]).find((m) => m.doctor_id === doctorId);
      const supId = me?.supervisor_doctor_id || null;
      const supSlots = supId
        ? rows.filter((r) => r.doctor_id === supId && r.status === 'active' && r.period > 0
            && (r.role === 'clinic' || r.role === 'delegator'))
        : [];
      if (supSlots.length > 0) {
        const myName = shadowMark.doctor_name;
        await applySlotChanges({
          deleteIds: shadowDel,
          inserts: supSlots.map((r) => ({
            clinic_id: clinicId, week_start: weekStart, day_of_week: day,
            period: r.period, clinic_number: r.clinic_number,
            doctor_id: doctorId, doctor_name: myName,
            role: r.role, status: 'active', source: 'request',
          })),
        });
        return { success: true, restored: true, shadowReturned: true, canceledStatus: shadowMark.status };
      }
      // مدرّبه ليس في الجدول الآن → يبقى في صفّ الاحتياط (بوسمه، ليتبعه عند عودته)
      await applySlotChanges({
        deleteIds: shadowDel,
        inserts: [{
          clinic_id: clinicId, week_start: weekStart, day_of_week: day,
          period: 0, clinic_number: shadowMark.clinic_number,
          doctor_id: doctorId, doctor_name: shadowMark.doctor_name,
          role: 'clinic', status: 'extra', source: 'shadow',
        }],
      });
      return { success: true, restored: false, shadowSupervisorAbsent: true, canceledStatus: shadowMark.status };
    }

    // ── استئذانٌ يُلغى أوّلًا (هو في عيادته — تُزال العلامة فقط، لا إرجاع) ──
    const permRows = statusRows.filter(isPermRow);
    if (permRows.length > 0) {
      await deleteRows(permRows.map((r) => r.id));
      const extraStays = statusRows.some((r) => r.status === 'extra');
      if (extraStays) {
        // كان احتياطًا واستأذن — تُزال العلامة ويبقى احتياطًا، وحفظُه القديم
        // (لما قبل الاحتياط) يبقى لإلغاء الاحتياط لاحقًا.
        return { success: true, returnedToReserve: true, canceledStatus: permRows[0]!.status };
      }
      // لقطةُ تبديلٍ محفوظة (الاستئذان بدّل مقعداً)؟ قاعدة العودة الموحّدة:
      //  • تبديلٌ بسيط (لقطةُ مقعدٍ واحد) والعالم ثابت → نعكسه **حرفيًّا** (رخيصٌ ودقيق:
      //    المُستأذِن يعود لمقعده، والشريك يعود لمقعد المُستأذِن الحاليّ).
      //  • مُضيفٌ (لقطتان) أو العالم تغيّر → يُعيد المحرّك حساب الشفت (الطبقة الأعلى).
      let permSwapReverted = false;
      let permSwapRecompute = false;
      let surgicalReturn = false;
      // طيُّ الاتّجاه العكسيّ: حين يتعذّر العكسُ الحرفيّ (العالم تغيّر) والقلبُ الجديد كاتبٌ
      // وحيد (apply)، نُجري **تغطيةً عكسيّةً جراحيّة** (applyReturn) بدل العجلة القديمة:
      // العائدُ يستردّ مقاعده (prevSeats، قبل حذفها) ويُمتَصُّ المُزاحون بأقلّ لمس، وتتبعه
      // ظلالُه. غير apply → نُبقي permSwapRecompute (العجلة القديمة سقوطًا).
      const tryApplyReturn = async (): Promise<boolean> => {
        let apply = false;
        try { apply = (await import('./solver_shadow')).isApplyMode(clinicId); } catch { /* */ }
        if (!apply) return false;
        try {
          const sh = await import('./solver_shadow');
          const r = await sh.applyReturn({
            clinicId, weekStart, day, label: 'إلغاء-عودة', returnerId: doctorId,
            prevSeats: prev.map((p) => ({ period: p.period, clinicNumber: p.clinic_number })),
          });
          await mirrorShadows({ clinicId, weekStart, day, supervisorIds: [doctorId, ...r.touched], preRows: rows });
          return true;
        } catch (e) { void e; return false; }
      };
      if (prev.length > 0) {
        const myName = prev[0]!.doctor_name;
        if (prev.length === 1 && prev[0]!.clinic_number > 0) {
          const t = prev[0]!;
          const occ = rows.find((r) => r.status === 'active' && r.role === 'clinic'
            && r.period === t.period && r.clinic_number === t.clinic_number && r.doctor_id !== doctorId);
          const acur = rows.find((r) => r.status === 'active' && r.role === 'clinic'
            && r.doctor_id === doctorId && r.period > 0);
          const alreadyHome = rows.some((r) => r.status === 'active' && r.role === 'clinic'
            && r.period === t.period && r.clinic_number === t.clinic_number && r.doctor_id === doctorId);
          if (alreadyHome) {
            permSwapReverted = true; // عاد أصلًا
          } else if (occ && acur) {
            await applySlotChanges({
              updates: [
                { id: occ.id, doctor_id: doctorId, doctor_name: myName },
                { id: acur.id, doctor_id: occ.doctor_id, doctor_name: occ.doctor_name },
              ],
            });
            await mirrorShadows({ clinicId, weekStart, day, supervisorIds: [doctorId, occ.doctor_id], preRows: rows });
            permSwapReverted = true;
          } else if (!occ) {
            // مقعدٌ مُخلًى (استئذانٌ رفيع، أُفرِغ بلا تبديل) → أعِد الطبيبَ إليه مباشرةً (عكسُ الإخلاء)
            await applySlotChanges({ inserts: [{
              clinic_id: clinicId, week_start: weekStart, day_of_week: day,
              period: t.period, clinic_number: t.clinic_number,
              doctor_id: doctorId, doctor_name: myName, role: 'clinic', status: 'active', source: 'request',
            }] });
            await mirrorShadows({ clinicId, weekStart, day, supervisorIds: [doctorId], preRows: rows });
            permSwapReverted = true;
          } else if (await tryApplyReturn()) {
            permSwapReverted = true; surgicalReturn = true; // عكسٌ جراحيٌّ بالقلب الجديد (apply)
          } else {
            permSwapRecompute = true; // العالم تغيّر — لا عكسٌ آمن (غير apply → عجلة)
          }
        } else {
          // مُضيفٌ (لقطةٌ من خانة أو خانتين، استضافة و/أو عيادة): التبديلُ عمليّةٌ معروفةٌ
          // وقابلةٌ للعكس حرفيًّا — لا داعي لإعادة الحساب (التي قد تشتقّ جدولًا مختلفًا).
          //  • خاناتُ المُستأذِن الأصليّة (اللقطة) يشغلها الآن البديلُ الواحد → نعيدها له.
          //  • إن نزل المُستأذِن لمقعد البديل (تبديلٌ كامل / مُضيفٌ زوجيّ) نعيد البديلَ إليه؛
          //    أمّا الاستدعاء (لقطةُ استضافةٍ واحدة، والمُستأذِن باقٍ في عيادته) فلا مقعدَ يُعاد.
          const origNow = prev.map((p) => rows.find((r) => r.status === 'active' && r.period === p.period
            && r.doctor_id !== doctorId
            && (p.clinic_number === 0 ? r.role === 'delegator' : (r.role === 'clinic' && r.clinic_number === p.clinic_number))));
          const replId = origNow[0]?.doctor_id;
          const okOrig = !!replId && origNow.every((o) => o && o.doctor_id === replId);
          // نزل المُستأذِن لمقعد البديل في التبديل الكامل/الزوجيّ (لقطتان أو فيها عيادة)، لا في الاستدعاء.
          const descended = prev.length >= 2 || prev.some((p) => p.clinic_number > 0);
          const myExtra = descended
            ? rows.find((r) => r.status === 'active' && (r.role === 'clinic' || r.role === 'delegator')
                && r.doctor_id === doctorId && r.period > 0
                && !prev.some((p) => p.period === r.period && p.clinic_number === r.clinic_number))
            : undefined;
          const allEmpty = origNow.every((o) => !o);
          if (allEmpty) {
            // مقاعدُ المُستأذِن (استضافة/عيادة) أُخليت بلا تبديل (استئذانٌ رفيع) → أعِدها له مباشرةً
            await applySlotChanges({ inserts: prev.map((p) => ({
              clinic_id: clinicId, week_start: weekStart, day_of_week: day,
              period: p.period, clinic_number: p.clinic_number,
              doctor_id: doctorId, doctor_name: myName,
              role: p.clinic_number === 0 ? 'delegator' : 'clinic', status: 'active', source: 'request',
            })) });
            await mirrorShadows({ clinicId, weekStart, day, supervisorIds: [doctorId], preRows: rows });
            permSwapReverted = true;
          } else if (okOrig) {
            const replName = origNow[0]!.doctor_name;
            await applySlotChanges({
              updates: [
                ...origNow.map((o) => ({ id: o!.id, doctor_id: doctorId, doctor_name: myName })),
                ...(myExtra ? [{ id: myExtra.id, doctor_id: replId!, doctor_name: replName }] : []),
              ],
            });
            await mirrorShadows({ clinicId, weekStart, day, supervisorIds: [doctorId, replId!], preRows: rows });
            permSwapReverted = true;
          } else if (await tryApplyReturn()) {
            permSwapReverted = true; surgicalReturn = true; // عكسٌ جراحيٌّ بالقلب الجديد (apply)
          } else {
            permSwapRecompute = true; // العالم تغيّر فعلًا — لا عكسٌ آمن (غير apply → عجلة)
          }
        }
      }
      await deleteRows(prev.map((r) => r.id));
      return {
        success: true, permissionCanceled: true,
        permSwapReverted: permSwapReverted || undefined,
        permSwapRecompute: permSwapRecompute || undefined,
        restored: surgicalReturn || undefined, // عكسٌ جراحيٌّ تمّ → تعمل الموازنةُ الأماميّة، لا العجلة
        canceledStatus: permRows[0]!.status,
      };
    }

    // ── غيابٌ كامل (مرضية/تفرّغ) أو احتياط ──
    let restoredCount = 0;
    let blockedCount = 0;
    const restoreIns: Record<string, unknown>[] = [];
    const reclaimUpdates: { id: string; doctor_id: string; doctor_name: string }[] = [];
    const reserveInserts: Record<string, unknown>[] = [];
    if (restoreToPrevPlace && prev.length > 0) {
      // في وضع apply التغطيةُ تلقائيّة، فعودةُ الطبيب تعكسها: مقعدُه الفارغ يُستعاد، ومقعدُه
      // (عيادةً كان أو استضافة) الذي شغله **مُغطٍّ خالص** — أي لا خانةَ أخرى له في هذا الشفت
      // سوى المقعد المُسترَدّ، فهو مسحوبٌ من الاحتياط للتغطية — يسترّده الطبيبُ ويعود المُغطّي
      // احتياطًا (يطابق ما قبل الغياب حرفيًّا، فلا إعادةَ اشتقاق). أمّا المشغولُ بطبيبٍ له خانتُه
      // الخاصّة هذا الشفت (انفرادُ شريك/تنسيبٌ يدويّ) فيقرّر القائد (covered) — لا ندوس عليه.
      let applyMode = false;
      try { applyMode = (await import('./solver_shadow')).isApplyMode(clinicId); } catch { /* تجاهل */ }
      const reservedBack = new Set<string>();
      for (const p of prev) {
        const occ = rows.find((r) => r.doctor_id !== doctorId && r.status === 'active' && r.period === p.period
          && (p.clinic_number === 0 ? r.role === 'delegator' : (r.role === 'clinic' && r.clinic_number === p.clinic_number)));
        if (!occ) {
          restoreIns.push({
            clinic_id: clinicId, week_start: weekStart, day_of_week: day,
            period: p.period, clinic_number: p.clinic_number,
            doctor_id: p.doctor_id, doctor_name: p.doctor_name,
            role: p.clinic_number === 0 ? 'delegator' : 'clinic', status: 'active', source: 'request',
          });
          restoredCount++;
          continue;
        }
        const shiftPs = p.period <= 2 ? [1, 2] : [3, 4];
        // هل للمُغطّي خانةٌ أخرى (عيادة/استضافة) في هذا الشفت غيرَ المقعد المُسترَدّ؟
        //  • لا (مُغطٍّ خالص = مسحوبٌ من الاحتياط) → يعود احتياطًا.
        //  • نعم (انفرادُ شريك: له مقعدُه ويُغطّي فترةً زائدة) → يبقى بمقعده، نزيل التغطية فقط.
        const occOther = rows.some((r) => r.doctor_id === occ.doctor_id && r.id !== occ.id && r.status === 'active'
          && shiftPs.includes(r.period) && (r.role === 'clinic' || r.role === 'delegator'));
        if (applyMode && (occ.role === 'delegator' || occ.role === 'clinic')) {
          reclaimUpdates.push({ id: occ.id, doctor_id: p.doctor_id, doctor_name: p.doctor_name });
          if (!occOther) {
            const exCol = p.period <= 2 ? 1 : 2;
            const key = `${occ.doctor_id}|${exCol}`;
            if (!reservedBack.has(key)) {
              reservedBack.add(key);
              reserveInserts.push({
                clinic_id: clinicId, week_start: weekStart, day_of_week: day,
                period: 0, clinic_number: exCol,
                doctor_id: occ.doctor_id, doctor_name: occ.doctor_name,
                role: 'clinic', status: 'extra', source: 'request',
              });
            }
          }
          restoredCount++;
        } else {
          blockedCount++;
        }
      }
    }
    // أزِل صفّ الحالة + صفوف الحفظ، أعِد المكان الفارغ، واسترّد مقاعد الاستضافة المُقسَّمة —
    // معاملةً واحدةً قبل returnShadowsWithSupervisor (الذي يقرأ DB فيرى الإرجاع).
    await applySlotChanges({
      updates: reclaimUpdates,
      deleteIds: [...statusRows, ...prev].map((r) => r.id),
      inserts: [...restoreIns, ...reserveInserts],
    });
    // مكانه (كلّه أو بعضه) لم يُستعَد: غُطّي وقت الغياب (الحفظ مُزِّق) أو شغله غيرُه
    const covered = REMOVES_FROM_CLINIC.has(statusRow.status as ScheduleStatus)
      && (prev.length === 0 || blockedCount > 0);
    // عاد المدرّب → ظلُّه (المنقول احتياطًا بوسم 'shadow') يعود معه تلقائيًّا
    let returnedShadows: string[] = [];
    if (restoredCount > 0) {
      returnedShadows = await returnShadowsWithSupervisor({ clinicId, weekStart, day, supervisorId: doctorId });
    }
    return {
      success: true, restored: restoredCount > 0, covered, canceledStatus: statusRow.status,
      returnedShadows: returnedShadows.length ? returnedShadows : undefined,
    };
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

/** نقصٌ مع حلوله — **المعادلة الواحدة** (تعمل مع أيّ عدد عيادات/أطبّاء بلا تعداد
 *  سيناريوهات): مرشّحو أيّ خانة شاغرة في فترة P = المتفرّغون في P من نفس الشفت
 *  + زميل الموقع نفسه + الاحتياطيّون − المحجوبون (الغائب/تخفيف/ظلّ). الحلّ
 *  الكامل = طبيبٌ واحد في تقاطع مرشّحي كلّ الفترات الشاغرة؛ لا تقاطع؟ حلول
 *  جزئيّة لكلّ فترةٍ على حدة.
 *  - clinic: زميله يستلم الفترتين، أو متفرّغ في كلّ الفترات (fullCandidates)،
 *    أو جزئيًّا متفرّغ كلّ فترة (partials — فقط حين لا حلّ كامل).
 *  - delegator_combo: غياب طبيبٍ يجمع عيادة (ب_a) + دليقيتر (ب_b) → خياران (أ/ب)؛
 *    خيار أ يشمل المتفرّغين في الفترتين (coverClinic=0 — لا عيادة يتركها).
 *  - delegator: المتفرّغون في فترته (المعادلة نفسها). */
/** «إعادة توزيع اليوم» بأقلّ حركة: العيادة قبل الدليقيتر — عند قلّة العدد يذوب
 *  الدليقيتر وتُشغَل العيادة (مَن في عيادةٍ يبقى فيها؛ لا يُنقَل إلّا الضروريّ).
 *  لكلّ فترةٍ شاغرة مانح بالأولويّة: دليقيتر تلك الفترة ← متفرّغ فيها ← احتياطي.
 *  تُحسب فقط حين لا حلّ كاملًا، وتُعرض فقط إن سدّت كلّ الفترات. */
export type ReshapeMove = {
  doctor: Doc;
  period: number;
  clinic: number;                                    // العيادة الوجهة (0 = دليقيتر)
  role?: 'clinic' | 'delegator';                     // الدور الوجهة (الافتراضيّ عيادة)
  from: 'delegator' | 'free' | 'ex' | 'clinic';      // ما يتركه تلك الفترة
  fromClinic?: number;                               // عيادة المصدر (from='clinic')
};

export type CoverageGap =
  | {
      kind: 'clinic'; clinicNumber: number; twoPeriodColleague: Doc | null;
      fullCandidates?: Doc[];                              // متفرّغون في كلّ الفترات الشاغرة
      partials?: { period: number; candidates: Doc[] }[];  // لا حلّ كامل → مرشّحو كلّ فترة
      // إعادة توزيع اليوم — كلّ الخيارات الممكنة (كلّ خيار: منفردٌ بالعيادة + بقيّة نقلاته)
      reshapeOptions?: { moves: ReshapeMove[] }[];
    }
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
  absentId: string;                          // هويّة الغائب — الكرت قد يجمع أكثر من غائب
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
  // المريض/المتفرّغ غائبٌ عن العمل — لا يُذكَر مُغطّيًا في أيّ اقتراحٍ أبدًا
  // (دفاعٌ مزدوج: التنفيذ يرفضه أيضًا).
  const absentIds = new Set(
    rows
      .filter((r) => r.period === 0 && (r.status === 'sick_leave' || r.status === 'vacation'))
      .map((r) => r.doctor_id),
  );
  const blocked = (id: string) => id === doctorId || lightDuty.has(id) || shadowIds.has(id) || absentIds.has(id);

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
  // الدليقيتر النشط في فترةٍ معيّنة — مانح «إعادة التوزيع» (العيادة أهمّ منه عند الشحّ)
  const delegAt = (P: number): Doc | null => {
    const d = activeAssign.find((r) => r.role === 'delegator' && r.period === P && !blocked(r.doctor_id));
    return d ? { id: d.doctor_id, name: d.doctor_name } : null;
  };

  const gaps: CoverageGap[] = [];
  const absentShiftCols = new Set<number>(); // أعمدة EX لجهات شفت النقص (1 صباح / 2 مساء)
  for (const r of prev) absentShiftCols.add(r.period >= 3 ? 2 : 1);

  // الاحتياطيّون في جهة (جهات) شفت النقص — بأسمائهم (تُحسب قبل الحلول لأنّها مانح فيها)
  const reserves = uniqDoc(
    rows
      .filter((r) => r.period === 0 && r.status === 'extra' && absentShiftCols.has(r.clinic_number) && !blocked(r.doctor_id))
      .map((r) => ({ id: r.doctor_id, name: r.doctor_name })),
  );

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
    // المعادلة نفسها: متفرّغ في فترتَي النقص (ب_a وب_b) يحلّ محلّ الغائب كاملًا
    // بلا عيادةٍ يتركها ولا زميلٍ يستلمها (coverClinic=0 = لا عيادة أصليّة)
    const freeB = freeAt(bP);
    for (const f of freeAt(aP)) {
      if (!freeB.some((y) => y.id === f.id)) continue;
      if (!optionA.some((o) => o.cover.id === f.id)) optionA.push({ cover: f, coverClinic: 0, backfill: null });
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
        // المعادلة: مرشّحو كلّ فترةٍ شاغرة = المتفرّغون فيها من نفس الشفت.
        // متفرّغٌ في **كلّ** الفترات الشاغرة → يستلم النقص كاملًا؛ لا زميل ولا
        // حلّ كامل → حلول جزئيّة (مرشّحو كلّ فترةٍ على حدة).
        const Ps = [...new Set(prev.filter((x) => x.clinic_number === r.clinic_number).map((x) => x.period))];
        const perP = Ps.map((P) => freeAt(P));
        const fullCandidates = (perP[0] || []).filter(
          (x) => perP.every((l) => l.some((y) => y.id === x.id)) && x.id !== mate?.doctor_id,
        );
        const partials = !mate && fullCandidates.length === 0
          ? Ps.map((P, i) => ({ period: P, candidates: perP[i] || [] })).filter((x) => x.candidates.length > 0)
          : [];
        // «إعادة توزيع اليوم» (لا حلّ كاملًا فقط) — **كلّ الخيارات الممكنة**:
        // المرشّح للانفراد من أطبّاء العيادات **غير حاملي الدليقيتر** (لديهم
        // مهامهم): ينفرد بالعيادة الشاغرة اليوم كاملًا، وما تركه من مقعده يستلمه
        // زميله في عيادته نفسها (كان متفرّغًا تلك الفترة) فتبقى عيادتهما كاملة.
        // لا زوج يصلح (مثلًا مخفّفٌ لا يستطيع الفترة الأخرى)؟ يُلجأ لحامل
        // الدليقيتر: ينفرد، ومقعده يسدّه دليقيتر الفترة الأخرى، وفترات الدليقيتر
        // التي خلت يتناوب عليها زوجٌ متقاسم **من عيادةٍ واحدة** إن أمكن وإلّا
        // ذاب الدليقيتر — العيادة أهمّ.
        let reshapeOptions: { moves: ReshapeMove[] }[] | undefined;
        if (!mate && fullCandidates.length === 0) {
          const options: { moves: ReshapeMove[] }[] = [];
          const delegIds = new Set(
            activeAssign.filter((x) => x.role === 'delegator').map((x) => x.doctor_id),
          );
          // ── المستوى الأوّل: أطبّاء الأزواج المتقاسمة (غير حاملي الدليقيتر) ──
          const pairDocs = uniqDoc(
            activeAssign
              .filter((x) => x.role === 'clinic' && !delegIds.has(x.doctor_id) && !blocked(x.doctor_id))
              .map((x) => ({ id: x.doctor_id, name: x.doctor_name })),
          );
          tier1: for (const X of pairDocs) {
            const moves: ReshapeMove[] = [];
            for (let i = 0; i < Ps.length; i++) {
              const P = Ps[i]!;
              const seat = activeAssign.find(
                (x) => x.doctor_id === X.id && x.role === 'clinic' && x.period === P,
              );
              if (seat) {
                // يترك مقعده — زميل عيادته نفسها المتفرّغ هذه الفترة يستلمه
                const partner = freeAt(P).find((y) =>
                  y.id !== X.id && activeAssign.some(
                    (x) => x.doctor_id === y.id && x.role === 'clinic' && x.clinic_number === seat.clinic_number,
                  ));
                if (!partner) continue tier1;
                moves.push({ doctor: X, period: P, clinic: r.clinic_number, from: 'clinic', fromClinic: seat.clinic_number });
                moves.push({ doctor: partner, period: P, clinic: seat.clinic_number, from: 'free' });
              } else if ((perP[i] || []).some((y) => y.id === X.id)) {
                moves.push({ doctor: X, period: P, clinic: r.clinic_number, from: 'free' });
              } else continue tier1;
            }
            options.push({ moves });
          }
          // ── المستوى الثاني (لا زوج يصلح): حامل الدليقيتر ينفرد ──
          if (options.length === 0) {
            const delegHolders = uniqDoc(
              activeAssign
                .filter((x) => x.role === 'delegator' && Ps.includes(x.period) && !blocked(x.doctor_id))
                .map((x) => ({ id: x.doctor_id, name: x.doctor_name })),
            );
            tier2: for (const X of delegHolders) {
              const moves: ReshapeMove[] = [];
              for (let i = 0; i < Ps.length; i++) {
                const P = Ps[i]!;
                const isDeleg = activeAssign.some(
                  (x) => x.doctor_id === X.id && x.role === 'delegator' && x.period === P,
                );
                const seat = activeAssign.find(
                  (x) => x.doctor_id === X.id && x.role === 'clinic' && x.period === P,
                );
                if (isDeleg) {
                  moves.push({ doctor: X, period: P, clinic: r.clinic_number, from: 'delegator' });
                } else if (seat) {
                  const dg = delegAt(P);
                  if (!dg || dg.id === X.id) continue tier2;
                  moves.push({ doctor: X, period: P, clinic: r.clinic_number, from: 'clinic', fromClinic: seat.clinic_number });
                  moves.push({ doctor: dg, period: P, clinic: seat.clinic_number, from: 'delegator' });
                } else if ((perP[i] || []).some((y) => y.id === X.id)) {
                  moves.push({ doctor: X, period: P, clinic: r.clinic_number, from: 'free' });
                } else continue tier2;
              }
              // فترات الدليقيتر التي خلت: يتناوب عليها زوجٌ من **عيادةٍ واحدة**
              const vacatedPs = [...new Set(moves.filter((m) => m.from === 'delegator').map((m) => m.period))];
              const usedIds = new Set(moves.map((m) => m.doctor.id));
              const pairClinics = [...new Set(
                activeAssign.filter((x) => x.role === 'clinic' && x.clinic_number !== r.clinic_number).map((x) => x.clinic_number),
              )];
              let delegMoves: ReshapeMove[] = [];
              for (const E of pairClinics) {
                const tryMoves: ReshapeMove[] = [];
                for (const P of vacatedPs) {
                  const f = freeAt(P).find((y) =>
                    !usedIds.has(y.id) && activeAssign.some(
                      (x) => x.doctor_id === y.id && x.role === 'clinic' && x.clinic_number === E,
                    ));
                  if (!f) { tryMoves.length = 0; break; }
                  tryMoves.push({ doctor: f, period: P, clinic: 0, role: 'delegator', from: 'free' });
                }
                if (tryMoves.length === vacatedPs.length) { delegMoves = tryMoves; break; }
              }
              options.push({ moves: [...moves, ...delegMoves] });
              break;
            }
          }
          if (options.length) reshapeOptions = options;
        }
        gaps.push({
          kind: 'clinic', clinicNumber: r.clinic_number,
          twoPeriodColleague: mate ? { id: mate.doctor_id, name: mate.doctor_name } : null,
          fullCandidates, partials, reshapeOptions,
        });
      }
    }
  }

  return { day, absentId: doctorId, absentName: doctorName, gaps, reserves };
}

/**
 * موجزات التغطية لِيومٍ كامل — **كلّ** غائبي اليوم (مرضية/تفرّغ/احتياط) موجزٌ لكلٍّ
 * منهم، محسوبٌ **بعد آخِر غياب** لا قبله (الغائبون يستبعد بعضهم بعضًا من المرشّحين
 * تلقائيًّا). غائبٌ لم يبقَ له حفظٌ (غُطّي مكانه) → موجزه بلا نقص. نقيّ حسابيّ.
 */
export async function computeDayCoverageBriefs(args: {
  clinicId: string;
  weekStart: string;
  day: WeekDay;
}): Promise<CoverageBrief[]> {
  const rows = await loadDay(args.clinicId, args.weekStart, args.day);
  const seen = new Set<string>();
  const out: CoverageBrief[] = [];
  for (const r of rows) {
    if (r.period !== 0 || !REMOVES_FROM_CLINIC.has(r.status as ScheduleStatus)) continue;
    if (seen.has(r.doctor_id)) continue;
    seen.add(r.doctor_id);
    const brief = await computeCoverageBrief({
      clinicId: args.clinicId, weekStart: args.weekStart, day: args.day,
      doctorId: r.doctor_id, doctorName: r.doctor_name,
    });
    out.push(brief ?? { day: args.day, absentId: r.doctor_id, absentName: r.doctor_name, gaps: [], reserves: [] });
  }
  return out;
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
  // غير القائد: طرفٌ في تبديلٍ ثنائيٍّ فقط (مسار التغطية/الموافقات) — الجماعيّ
  // أو بين أطبّاء آخرين للقائد وحده، فلا طريق خلفيًّا لتبديلٍ بلا موافقة.
  if (!isLeaderPlus(actor.role) && !(doctorIds.length === 2 && doctorIds.includes(actor.id))) {
    return fail('التبديل الجماعيّ أو بين أطبّاء آخرين للقائد فقط.');
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

    // التبديل خانةً بخانة (نقل الملكيّة مع ثبات الموضع)، والظلّ — المتدرّب
    // المبتدئ الملتصق بمدرّبه — ينتقل معه. تُحسب الحزمة كاملةً ثمّ تُطبَّق
    // معاملةً واحدة: إمّا كلّها أو لا شيء.
    const updates = affected.map((r) => {
      const to = next.get(r.doctor_id)!;
      return { id: r.id, doctor_id: to.id, doctor_name: to.name };
    });
    const shadow = await shadowTraineeChanges({ clinicId, weekStart, day, doctorIds, periodsInScope, preRows: rows });
    await applySlotChanges({ updates, deleteIds: shadow.deleteIds, inserts: shadow.inserts });
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

/**
 * بعد تبديل أطباء، يحسب نقل المتدرّب المبتدئ (الظلّ) ليتبع مدرّبه. الظلّ نسخة من خانات
 * مدرّبه (نفس الفترة/العيادة/الدور). نتعرّف عليه بمطابقة خاناته تمامًا لخانات مدرّبه
 * قبل التبديل (المستقلّ لا يُطابق فلا يُنقل). موضع المدرّب الجديد = موضع سَلَفه القديم.
 * يحسب فقط ولا يكتب — يُرجع الحذوف/الإدراجات ليضمّها المستدعي إلى معاملته الواحدة.
 */
async function shadowTraineeChanges(args: {
  clinicId: string;
  weekStart: string;
  day: WeekDay;
  doctorIds: string[];
  periodsInScope: number[];
  preRows: Row[];
}): Promise<{ deleteIds: string[]; inserts: Record<string, unknown>[] }> {
  const { clinicId, weekStart, day, doctorIds, periodsInScope, preRows } = args;
  const changes = { deleteIds: [] as string[], inserts: [] as Record<string, unknown>[] };
  const { data: members } = await getAllGroupMembers(clinicId);
  const swapped = new Set(doctorIds);
  const shadows = (members || []).filter(
    (m: { work_status?: string; supervisor_doctor_id?: string | null }) =>
      m.work_status === 'trainee' && m.supervisor_doctor_id && swapped.has(m.supervisor_doctor_id),
  ) as { doctor_id: string; doctor_name: string; supervisor_doctor_id: string }[];
  if (shadows.length === 0) return changes;

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

    const pred = predecessorOf(t.supervisor_doctor_id);
    const newPos = posOf(pred);
    const tOldIds = preRows
      .filter((r) => r.doctor_id === t.doctor_id && (inScope(r) || (r.period === 0 && r.status === 'extra')))
      .map((r) => r.id);

    // مدرّبه انتقل إلى صفّ الاحتياط (لا خانات جديدة) → الظلّ يصبح احتياطيًّا معه
    // بدل أن يختفي. جهة الاحتياط من صفّ EX القديم لِمن أخذ المدرّب مكانه.
    if (newPos.length === 0) {
      const predEx = preRows.find((r) => r.doctor_id === pred && r.period === 0 && r.status === 'extra');
      if (!predEx) continue; // لا نعرف الجهة — اتركه كما هو بدل حذفه بلا بديل
      changes.deleteIds.push(...tOldIds);
      changes.inserts.push({
        clinic_id: clinicId, week_start: weekStart, day_of_week: day,
        period: 0, clinic_number: predEx.clinic_number,
        doctor_id: t.doctor_id, doctor_name: t.doctor_name,
        role: 'clinic', status: 'extra', source: 'request',
      });
      continue;
    }

    changes.deleteIds.push(...tOldIds);
    changes.inserts.push(
      ...newPos.map((p) => ({
        clinic_id: clinicId, week_start: weekStart, day_of_week: day,
        period: p.period, clinic_number: p.clinic_number,
        doctor_id: t.doctor_id, doctor_name: t.doctor_name,
        role: p.role, status: 'active', source: 'request',
      })),
    );
  }
  return changes;
}

/**
 * يُلحِق القائد متدرّبًا احتياطيًّا بمدرّبٍ (آخر) **لهذا اليوم فقط**: يُحذف صفّ
 * احتياطه ويُكتب اسمه في خانات المدرّب نفسها (عيادة/دليقيتر). لا يغيّر مدرّبه
 * الرسميّ ولا أيّ يومٍ آخر. القائد فأعلى حصرًا.
 */
export async function attachTraineeForDay(
  actor: Actor,
  args: {
    clinicId: string;
    weekStart: string;
    day: WeekDay;
    traineeId: string;
    traineeName: string;
    supervisorId: string;
    supervisorName: string;
  },
): Promise<RequestResult & { mirrored?: { period: number; clinic_number: number; role: string }[] }> {
  const { clinicId, weekStart, day, traineeId, traineeName, supervisorId, supervisorName } = args;
  if (!isLeaderPlus(actor.role)) return fail('إلحاق المتدرّب بمدرّبٍ صلاحيّة للقائد فأعلى فقط.');
  if (traineeId === supervisorId) return fail('لا يُلحَق المتدرّب بنفسه.');
  try {
    const { data: members } = await getAllGroupMembers(clinicId);
    const tm = ((members || []) as { doctor_id: string; work_status?: string }[])
      .find((m) => m.doctor_id === traineeId);
    if (!tm || tm.work_status !== 'trainee') return fail(`${traineeName} ليس متدرّبًا.`);

    const rows = await loadDay(clinicId, weekStart, day);
    const t = dayPositionOf(rows, traineeId);
    if (t.absent) return fail(`${traineeName} غائبٌ هذا اليوم — أُلغِ غيابه أوّلًا.`);
    if (t.extra.length === 0) {
      return fail(`${traineeName} ليس احتياطيًّا هذا اليوم — الإلحاق يكون من صفّ الاحتياط فقط.`);
    }
    const sup = dayPositionOf(rows, supervisorId);
    if (sup.absent) return fail(`${supervisorName} غائبٌ هذا اليوم — لا يُلحَق به متدرّب.`);
    if (sup.slots.length === 0) {
      return fail(`${supervisorName} بلا خاناتٍ في الجدول هذا اليوم — لا مكان يُلحَق المتدرّب به.`);
    }

    // أزِل صفّ الاحتياط (وأيّ خانات قديمة احتياطًا للسلامة) واكتبه ظلًّا للمدرّب
    // — حذفٌ وإدراجٌ في معاملةٍ واحدة، فلا يختفي المتدرّب إن انقطع الاتصال بينهما.
    const mirrored = sup.slots.map((r) => ({
      period: r.period, clinic_number: r.clinic_number, role: r.role,
    }));
    await applySlotChanges({
      deleteIds: [...t.extra, ...t.slots].map((r) => r.id),
      inserts: mirrored.map((p) => ({
        clinic_id: clinicId, week_start: weekStart, day_of_week: day,
        period: p.period, clinic_number: p.clinic_number,
        doctor_id: traineeId, doctor_name: traineeName,
        role: p.role, status: 'active', source: 'request',
      })),
    });
    return { ...ok(), mirrored };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

// ═══════════════════════════════════════════════════════════════
// تبديل المراكز الكامل — طلبات التبديل (كلٌّ يأخذ مكان الآخر بكلّ ما فيه)
// ═══════════════════════════════════════════════════════════════

/** شفت الطبيب في يومٍ من صفوفه: خاناته النشطة أوّلًا، وإلّا جهة صفّ الاحتياط. */
function dayShiftOf(rows: Row[], doctorId: string): Shift | null {
  const slots = rows.filter(
    (r) => r.doctor_id === doctorId && r.status === 'active' && r.period > 0
      && (r.role === 'clinic' || r.role === 'delegator'),
  );
  if (slots.some((r) => r.period >= 3)) return 'evening';
  if (slots.some((r) => r.period <= 2)) return 'morning';
  const ex = rows.find((r) => r.doctor_id === doctorId && r.period === 0 && r.status === 'extra');
  if (ex) return ex.clinic_number === 2 ? 'evening' : 'morning';
  return null;
}

/** مركز الطبيب الكامل في اليوم: خانات نشطة + صفّ احتياط، وهل هو غائب (مرضية/تفرّغ). */
function dayPositionOf(rows: Row[], doctorId: string) {
  return {
    slots: rows.filter(
      (r) => r.doctor_id === doctorId && r.status === 'active' && r.period > 0
        && (r.role === 'clinic' || r.role === 'delegator'),
    ),
    extra: rows.filter((r) => r.doctor_id === doctorId && r.period === 0 && r.status === 'extra'),
    absent: rows.some(
      (r) => r.doctor_id === doctorId && r.period === 0
        && (r.status === 'sick_leave' || r.status === 'vacation'),
    ),
  };
}

/**
 * تبديل مركزين كاملين بين طبيبين في يوم: كلٌّ يأخذ مكان الآخر **بكلّ ما فيه** —
 * فترتان مقابل فترة، واحتياطٌ مقابل عيادة (صفّ الاحتياط يتبادل ملكيّته أيضًا).
 * يُعاد فحص الصلاحيّة لحظة التنفيذ: طرفٌ غائب أو بلا مركز → رفض (الطلب لم يعد
 * صالحًا). الظلّ (المتدرّب الملتصق) يتبع مدرّبه. يُرجع crossShift للإعلام.
 */
export async function swapFullPositions(
  actor: Actor,
  args: { clinicId: string; weekStart: string; day: WeekDay; aId: string; bId: string },
): Promise<RequestResult & { crossShift?: boolean; aName?: string; bName?: string }> {
  const { clinicId, weekStart, day, aId, bId } = args;
  if (aId === bId) return fail('لا تبديل بين الطبيب ونفسه.');
  if (!isLeaderPlus(actor.role) && actor.id !== aId && actor.id !== bId) {
    return fail('لا تملك صلاحيّة هذا التبديل.');
  }
  try {
    const rows = await loadDay(clinicId, weekStart, day);
    const a = dayPositionOf(rows, aId);
    const b = dayPositionOf(rows, bId);
    if (a.absent || b.absent) return fail('أحد الطرفين غائبٌ هذا اليوم — التبديل لم يعد ممكنًا.');
    if (a.slots.length + a.extra.length === 0 || b.slots.length + b.extra.length === 0) {
      return fail('أحد الطرفين بلا مركزٍ في الجدول هذا اليوم — التبديل لم يعد ممكنًا.');
    }
    // استئذان × تبديل: لا يُوضَع طرفٌ في فترةٍ استئذانُه يحجبها (فحص لحظة التنفيذ)
    const aBlocked = covererAbsence(rows, aId).blocked;
    const bBlocked = covererAbsence(rows, bId).blocked;
    if (a.slots.some((r) => bBlocked.has(r.period)) || b.slots.some((r) => aBlocked.has(r.period))) {
      return fail('أحد الطرفين مستأذنٌ عن فترةٍ سيستلمها بهذا التبديل — التبديل لم يعد ممكنًا.');
    }
    const crossShift = (() => {
      const sa = dayShiftOf(rows, aId);
      const sb = dayShiftOf(rows, bId);
      return !!sa && !!sb && sa !== sb;
    })();
    const nameOf = (id: string) => rows.find((r) => r.doctor_id === id)?.doctor_name || '';
    const aName = nameOf(aId);
    const bName = nameOf(bId);
    // كلّ التغييرات — نقل المركزين والظلّ التابع لمدرّبه — تُحسب أوّلًا ثمّ
    // تُطبَّق معاملةً واحدة: إمّا كلّها أو لا شيء (لا جدول ناقصًا في المنتصف).
    // الخانات تنتقل كما هي؛ أمّا صفوف الاحتياط فيُصفَّر وسمها إلى 'request': صارت
    // ملكيّةً منقولةً بقرارٍ متعمَّد، لا ظلًّا يتبع مدرّبًا — كي لا يرث المستلِم سلوك
    // «العودة التلقائيّة مع المدرّب» الذي لا يخصّه (وسم 'shadow' يخصّ صاحبه الأصليّ).
    const updates = [
      ...a.slots.map((r) => ({ id: r.id, doctor_id: bId, doctor_name: bName })),
      ...a.extra.map((r) => ({ id: r.id, doctor_id: bId, doctor_name: bName, source: 'request' })),
      ...b.slots.map((r) => ({ id: r.id, doctor_id: aId, doctor_name: aName })),
      ...b.extra.map((r) => ({ id: r.id, doctor_id: aId, doctor_name: aName, source: 'request' })),
    ];
    const shadow = await shadowTraineeChanges({
      clinicId, weekStart, day, doctorIds: [aId, bId], periodsInScope: [1, 2, 3, 4], preRows: rows,
    });
    await applySlotChanges({ updates, deleteIds: shadow.deleteIds, inserts: shadow.inserts });
    return { ...ok(), crossShift, aName, bName };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

/** أنماط استهداف طلب التبديل: طبيبٌ بعينه / كلّ أطبّاء فترة / كلّ الشفت الآخر. */
export type SwapTargetMode =
  | { kind: 'doctor'; doctorId: string }
  | { kind: 'period'; period: number }
  | { kind: 'other_shift' };

/**
 * مستلمو طلب التبديل بعد التصفية: حاضرون ذلك اليوم (خانة أو احتياط)، غير غائبين،
 * ليسوا الطالب نفسه ولا الظلّ (المتدرّب الملتصق بمدرّبه). نقيّ حسابيّ.
 */
export async function listSwapTargets(args: {
  clinicId: string;
  weekStart: string;
  day: WeekDay;
  requesterId: string;
  mode: SwapTargetMode;
  /** استبعاد من يستلم خانةً في هذه الفترات — لاقتراحات الاستئذان: التبديل مع
   *  مستلِم فترةٍ محجوبة لا يحلّ التعارض فلا يُعرَض عليه أصلًا. */
  excludePeriods?: number[];
}): Promise<{ success: boolean; error?: string; targets?: { id: string; name: string }[] }> {
  const { clinicId, weekStart, day, requesterId, mode, excludePeriods } = args;
  try {
    const rows = await loadDay(clinicId, weekStart, day);
    // أسبوعٌ بلا جدولٍ أصلًا ≠ يومٌ بلا مركز — رسالةٌ أوضح تمنع سوء الفهم
    if (rows.length === 0) {
      return { success: false, error: `لا جدول للأسبوع ${weekStart} بعد — لا يمكن فتح تبديلٍ فيه. تأكّد من الأسبوع المقصود.` };
    }
    const me = dayPositionOf(rows, requesterId);
    if (me.absent) return { success: false, error: 'أنت غائبٌ هذا اليوم — لا مركز لتبديله.' };
    if (me.slots.length + me.extra.length === 0) {
      return { success: false, error: 'لا مركز لك في الجدول هذا اليوم لتبديله.' };
    }

    // الظلّ: متدرّبٌ خاناته تطابق خانات مدرّبه تمامًا — لا يستلم طلبات تبديل.
    const { data: members } = await getAllGroupMembers(clinicId);
    const shadowIds = new Set<string>();
    const keysOf = (id: string) =>
      rows.filter(
        (r) => r.doctor_id === id && r.status === 'active' && r.period > 0
          && (r.role === 'clinic' || r.role === 'delegator'),
      ).map((r) => `${r.period}|${r.clinic_number}|${r.role}`);
    for (const m of (members || []) as {
      doctor_id: string; work_status?: string; supervisor_doctor_id?: string | null;
    }[]) {
      if (m.work_status !== 'trainee' || !m.supervisor_doctor_id) continue;
      const tKeys = keysOf(m.doctor_id);
      const sKeys = new Set(keysOf(m.supervisor_doctor_id));
      if (tKeys.length > 0 && tKeys.length === sKeys.size && tKeys.every((k) => sKeys.has(k))) {
        shadowIds.add(m.doctor_id);
      }
    }

    // الظلّ لا يكون طالبَ تبديلٍ أيضًا: مكانه تابعٌ لمدرّبه، وقبول طلبه يفصله عنه.
    if (shadowIds.has(requesterId)) {
      return {
        success: false,
        error: 'مكانك هذا اليوم مرتبطٌ بمدرّبك ويتحرّك معه — لا يُفتح تبديلٌ باسمك. إن أردت تغييرًا فمدرّبك أو القائد يرتّبه.',
      };
    }

    // غير المتفرّغين لتحمّل تبديل: صاحب تخفيف العمل لا يُكلَّف بمركزٍ إضافيّ.
    const lightDutyIds = new Set(
      ((members || []) as { doctor_id: string; work_status?: string }[])
        .filter((m) => m.work_status === 'light_duty').map((m) => m.doctor_id),
    );
    // استئذان × تبديل
    const myBlocked = covererAbsence(rows, requesterId).blocked;
    const eligible = (id: string): boolean => {
      if (id === requesterId || shadowIds.has(id)) return false;
      if (lightDutyIds.has(id)) return false;                              // تخفيف عمل — لا يُرسَل له طلب
      const p = dayPositionOf(rows, id);
      if (p.absent || p.slots.length + p.extra.length === 0) return false;
      if (excludePeriods?.length && p.slots.some((r) => excludePeriods.includes(r.period))) {
        return false;
      }
      // مستأذنٌ نفسه (له صفّ استئذان) → غير متفرّغٍ كلّيًّا، فلا يُرسَل له طلب تبديل أصلًا
      if (covererAbsence(rows, id).blocked.size > 0) return false;
      if (myBlocked.size > 0 && p.slots.some((r) => myBlocked.has(r.period))) return false; // أنا سأستلم فترةً أنا مستأذنٌ عنها
      return true;
    };
    const nameOf = (id: string) => rows.find((r) => r.doctor_id === id)?.doctor_name || '';

    let ids: string[] = [];
    if (mode.kind === 'doctor') {
      if (!eligible(mode.doctorId)) {
        return { success: false, error: 'الطبيب المطلوب غائبٌ أو بلا مركزٍ هذا اليوم، أو يصطدم التبديل باستئذانٍ لدى أحدكما — لا يُرسَل له طلب.' };
      }
      ids = [mode.doctorId];
    } else if (mode.kind === 'period') {
      ids = [...new Set(
        rows.filter(
          (r) => r.status === 'active' && r.period === mode.period
            && (r.role === 'clinic' || r.role === 'delegator'),
        ).map((r) => r.doctor_id),
      )].filter(eligible);
    } else {
      const myShift = dayShiftOf(rows, requesterId);
      if (!myShift) return { success: false, error: 'تعذّر تحديد شفتك هذا اليوم.' };
      const other: Shift = myShift === 'morning' ? 'evening' : 'morning';
      ids = [...new Set(rows.map((r) => r.doctor_id))]
        .filter(eligible)
        .filter((id) => dayShiftOf(rows, id) === other);
    }
    if (ids.length === 0) return { success: false, error: 'لا يوجد من يستلم الطلب بعد التصفية.' };
    return { success: true, targets: ids.map((id) => ({ id, name: nameOf(id) })) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'خطأ غير متوقّع.' };
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
  // القاعدةُ الموحّدة: الظلّ يحاكي مقاعدَ مدرّبه **العياديّة** إن كان للمدرّب عيادةٌ في الشفت
  // (فلا يصير دليقيترًا حين يكون مدرّبه مُضيفًا زوجيًّا: عيادة + دليقيتر — يتبع العيادة فقط)؛
  // فإن كان المدرّبُ مُضيفًا مكرّسًا (دليقيتر بحت، لا عيادة) حاكاه دليقيترًا (يتعلّم الاستضافة
  // معه). دالّةُ «مقاعدِ الظلّ المتوقّعة» تُوحّد الكشفَ (preRows) والمحاكاة (cur).
  const expectedSeats = (rows: Row[], supId: string): Row[] => {
    const mine = rows.filter((r) => r.doctor_id === supId && inScope(r));
    const clinic = mine.filter((r) => r.role === 'clinic');
    return clinic.length > 0 ? clinic : mine; // عيادةٌ إن وُجدت، وإلّا الدليقيتر (مضيفٌ مكرّس)
  };
  const seatKeys = (rows: Row[], id: string, role: 'clinic' | 'delegator') =>
    rows.filter((r) => r.doctor_id === id && inScope(r) && r.role === role).map((r) => `${r.period}|${r.clinic_number}`);

  const shadows = ((members || []) as {
    doctor_id: string; doctor_name: string; work_status?: string; supervisor_doctor_id?: string | null;
  }[]).filter((m) => {
    if (m.work_status !== 'trainee' || !m.supervisor_doctor_id || !sups.includes(m.supervisor_doctor_id)) return false;
    if (!preRows.some((r) => r.doctor_id === m.doctor_id && inScope(r))) return false;
    // كشفُ الظلّ المبتدئ بمطابقة **العيادة**: عياداتُه (قبل العمليّة) = عياداتُ مدرّبه تمامًا.
    // يلتقط الظلَّ سواءٌ طابق مدرّبه عيادةً فقط أو طابقه **كاملًا** (مضيفٌ زوجيّ: عيادة + دليقيتر
    // — يكفي تطابقُ العيادة). المستقلّ عياداتُه تخالف فلا يُلتقط.
    const sc = seatKeys(preRows, m.supervisor_doctor_id, 'clinic');
    const tc = seatKeys(preRows, m.doctor_id, 'clinic');
    if (sc.length > 0) {
      const scSet = new Set(sc);
      return tc.length === sc.length && tc.every((k) => scSet.has(k));
    }
    // مدرّبٌ مضيفٌ مكرّس (دليقيتر بحت، لا عيادة) → الظلّ يطابق دليقيترَه ولا عيادةَ له.
    const sd = seatKeys(preRows, m.supervisor_doctor_id, 'delegator');
    const td = seatKeys(preRows, m.doctor_id, 'delegator');
    const sdSet = new Set(sd);
    return tc.length === 0 && sd.length > 0 && td.length === sd.length && td.every((k) => sdSet.has(k));
  });
  if (shadows.length === 0) return;

  const cur = await loadDay(clinicId, weekStart, day); // الحالة بعد العمليّة
  for (const t of shadows) {
    const want = expectedSeats(cur, t.supervisor_doctor_id!);
    const tOld = cur.filter((r) => r.doctor_id === t.doctor_id && inScope(r));
    await applySlotChanges({
      deleteIds: tOld.map((r) => r.id),
      inserts: want.map((r) => ({
        clinic_id: clinicId, week_start: weekStart, day_of_week: day,
        period: r.period, clinic_number: r.clinic_number,
        doctor_id: t.doctor_id, doctor_name: t.doctor_name,
        role: r.role, status: 'active', source: 'request',
      })),
    });
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
): Promise<RequestResult & {
  displaced?: { name: string; periods: number[] }[];
  permissionNoteAr?: string; // نُسِّب وهو مستأذن (في فتراتٍ مسموحة) — للتذكير في الرسالة
}> {
  const { clinicId, weekStart, day, doctorId, doctorName, clinicNumber, periods } = args;
  if (!canActOnDoctor(actor, doctorId)) return fail('لا تملك صلاحيّة تنسيب هذا الطبيب.');
  if (!Number.isInteger(clinicNumber) || clinicNumber < 1) return fail('رقم العيادة غير صالح.');
  if (!periods.length) return fail('يجب تحديد فترة واحدة على الأقلّ.');
  try {
    const rows = await loadDay(clinicId, weekStart, day);
    const mine = rows.filter((r) => r.doctor_id === doctorId);

    // حارس الوجود: لا «إنشاء» عيادة من العدم — العيادة المطلوبة يجب أن تكون قائمة في
    // جدول ذلك اليوم (صفوف فعليّة أو صفوف حفظ)، وفي الفترات المطلوبة تحديدًا.
    const opPeriods = new Set(
      rows.filter((r) => r.clinic_number === clinicNumber && r.period > 0).map((r) => r.period),
    );
    if (!opPeriods.size) {
      const known = [...new Set(
        rows.filter((r) => r.clinic_number > 0 && r.period > 0).map((r) => r.clinic_number),
      )].sort((a, b) => a - b);
      return fail(
        `لا توجد عيادة ${clinicNumber} في جدول هذا اليوم. العيادات الموجودة: ${known.join('، ') || 'لا شيء'}.`,
      );
    }
    const badPeriods = periods.filter((p) => !opPeriods.has(p));
    if (badPeriods.length) {
      return fail(
        `عيادة ${clinicNumber} لا تعمل في الفترات ${badPeriods.join('، ')} هذا اليوم — ` +
        `فتراتها: ${[...opPeriods].sort((a, b) => a - b).join('، ')}.`,
      );
    }

    // حارس الاستئذان: المستأذن لا يُنسَّب في فترةٍ يحجبها استئذانه — والعلامة نفسها
    // لا يمحوها التنسيب (حقيقةُ حضورٍ جزئيّ تبقى ظاهرةً للجميع).
    const myPermRow = mine.find(
      (r) => r.period === 0 && (r.status === 'permission_start' || r.status === 'permission_end'),
    );
    let permissionNoteAr: string | undefined;
    if (myPermRow) {
      const ps = myPermRow.status === 'permission_start';
      const pEvening = myPermRow.clinic_number === 2 ? true
        : myPermRow.clinic_number === 1 ? false
          : mine.some((r) => r.status === 'active' && r.period >= 3 && (r.role === 'clinic' || r.role === 'delegator'));
      const pBlocked = ps ? [pEvening ? 3 : 1] : [pEvening ? 4 : 2];
      const hit = periods.filter((p) => pBlocked.includes(p));
      if (hit.length) {
        return fail(
          `${doctorName} مستأذن ${ps ? 'بداية' : 'نهاية'} الدوام — لا يُنسَّب في ` +
          `الفترة ${hit.join('، ')} المحجوبة باستئذانه. اختر فترةً أخرى أو ألغِ الاستئذان أوّلًا.`,
        );
      }
      permissionNoteAr = `علمًا أنّه مستأذن ${ps ? 'بداية' : 'نهاية'} الدوام`;
    }

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

    // حارس الإشغال: الخانة المطلوبة يشغلها طبيب آخر؟ الليدر يُزيحه (حالة العائد بعد
    // تغطية: المُغطّي استلم فترتين فيعود لفترته الأصليّة)؛ الطبيب لنفسه لا يُزيح أحدًا.
    const occupants = rows.filter(
      (r) => r.role === 'clinic' && r.status === 'active' && r.clinic_number === clinicNumber
        && periods.includes(r.period) && r.doctor_id !== doctorId,
    );
    let displaced: { name: string; periods: number[] }[] = [];
    if (occupants.length) {
      if (!isLeaderPlus(actor.role)) {
        const who = [...new Set(occupants.map((r) => r.doctor_name))].join('، ');
        return fail(`المكان مشغول (${who}) — اختر مكانًا متاحًا.`);
      }
      const byDoc = new Map<string, { name: string; periods: number[] }>();
      for (const r of occupants) {
        const e = byDoc.get(r.doctor_id) || { name: r.doctor_name, periods: [] };
        e.periods.push(r.period);
        byDoc.set(r.doctor_id, e);
      }
      displaced = [...byDoc.values()];
    }

    // أزِل حالته الغائبة (مرضية/تفرّغ/احتياط) وصفوف الحفظ (سيدخل العيادة فعليًّا)
    // — علامة الاستئذان تبقى: التنسيب لا يمحوها (حقيقةُ حضورٍ جزئيّ مستقلّة).
    const statusDel = mine.filter(
      (r) => r.role === PREV_ROLE
        || (r.period === 0 && r.status !== 'active'
          && r.status !== 'permission_start' && r.status !== 'permission_end'),
    ).map((r) => r.id);
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
    // إزاحة المُغطّي + إزالة حالة العائد + تنسيبه — معاملةً واحدة قبل mirrorShadows.
    await applySlotChanges({
      deleteIds: [...occupants.map((r) => r.id), ...statusDel],
      inserts: toAdd,
    });
    // التريني الظلّ يلاصق مدرّبه في النقل (للموضوع وللمُزاحين كي تتبعهم ظلالهم)
    await mirrorShadows({
      clinicId, weekStart, day,
      supervisorIds: [doctorId, ...occupants.map((r) => r.doctor_id)],
      preRows: rows,
    });
    return { success: true, displaced, permissionNoteAr };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'خطأ غير متوقّع.');
  }
}

/**
 * يجعل طبيبًا دليقيترًا في يومٍ ما — في الفترة المسمّاة، أو تلقائيًّا في فترة
 * الدليقيتر التي يكون فيها فارغًا. الدليقيتر الحاليّ في تلك الفترة يُزاح (تبقى له
 * خاناته الأخرى). الليدر فأعلى (فيه إزاحة).
 */
export async function placeAsDelegator(
  actor: Actor,
  args: {
    clinicId: string;
    weekStart: string;
    day: WeekDay;
    doctorId: string;
    doctorName: string;
    period?: number;
  },
): Promise<RequestResult & { period?: number; replaced?: string }> {
  const { clinicId, weekStart, day, doctorId, doctorName } = args;
  if (!isLeaderPlus(actor.role)) return fail('تعيين الدليقيتر من صلاحيّة التيم ليدر فأعلى.');
  try {
    const rows = await loadDay(clinicId, weekStart, day);
    const delegRows = rows.filter((r) => r.role === 'delegator' && r.status === 'active' && r.period > 0);
    const delegPeriods = [...new Set(delegRows.map((r) => r.period))].sort((a, b) => a - b);
    if (!delegPeriods.length) return fail('لا دليقيتر في جدول هذا اليوم.');

    // حارس الغياب: الغائب كلّيًّا (مرضية/تفرّغ) لا يُعيَّن دليقيترًا — وإلّا صار
    // غائبًا ودليقيترًا معًا. والمستأذن لا يُعيَّن في الفترات التي يحجبها استئذانه.
    const dAbs = covererAbsence(rows, doctorId);
    if (dAbs.hardAr) {
      return fail(`${doctorName} عنده ${dAbs.hardAr} هذا اليوم — غائبٌ عن العمل ولا يُعيَّن دليقيترًا. ألغِ حالته أوّلًا.`);
    }

    const busy = new Set(
      rows
        .filter((r) => r.doctor_id === doctorId && r.status === 'active' && r.period > 0
          && (r.role === 'clinic' || r.role === 'delegator'))
        .map((r) => r.period),
    );
    // الفترة: المسمّاة إن صحّت، وإلّا فترة الدليقيتر التي يكون الطبيب فارغًا فيها
    let P = args.period;
    if (P != null) {
      if (!delegPeriods.includes(P)) {
        return fail(`لا دليقيتر في الفترة ${P} هذا اليوم — فتراته: ${delegPeriods.join('، ')}.`);
      }
      if (busy.has(P)) {
        return fail(`${doctorName} مشغول في الفترة ${P} — لا يكون في مكانين بنفس الفترة.`);
      }
      if (dAbs.blocked.has(P)) {
        return fail(`${doctorName} مستأذنٌ في الفترة ${P} — لا يُعيَّن دليقيترًا وقتَ استئذانه.`);
      }
    } else {
      P = delegPeriods.find((p) => !busy.has(p) && !dAbs.blocked.has(p));
      if (P == null) {
        const permHit = delegPeriods.some((p) => dAbs.blocked.has(p));
        return fail(
          `${doctorName} ${permHit ? 'مستأذنٌ أو مشغول' : 'مشغول'} في كلّ فترات الدليقيتر (${delegPeriods.join('، ')}).`,
        );
      }
    }

    // أزِح الدليقيتر الحاليّ في هذه الفترة وضع الطبيب مكانه
    const current = delegRows.filter((r) => r.period === P && r.doctor_id !== doctorId);
    const delegIns = delegRows.some((r) => r.period === P && r.doctor_id === doctorId)
      ? []
      : [{
        clinic_id: clinicId, week_start: weekStart, day_of_week: day,
        period: P, clinic_number: 0,
        doctor_id: doctorId, doctor_name: doctorName,
        role: 'delegator', status: 'active', source: 'request',
      }];
    // أزِح الدليقيتر الحاليّ + أزِل صفّ احتياط المُغطّي (استُدعي للعمل فلا يظهر
    // دليقيترًا واحتياطيًّا معًا) + اكتب صفّه — معاملةً واحدة قبل mirrorShadows.
    const exDel = rows
      .filter((r) => r.doctor_id === doctorId && r.period === 0 && r.status === 'extra')
      .map((r) => r.id);
    await applySlotChanges({
      deleteIds: [...current.map((r) => r.id), ...exDel],
      inserts: delegIns,
    });
    await mirrorShadows({
      clinicId, weekStart, day,
      supervisorIds: [doctorId, ...current.map((r) => r.doctor_id)],
      preRows: rows,
    });
    return { success: true, period: P, replaced: current[0]?.doctor_name };
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
// ── حارس غياب المُغطّي ─────────────────────────────────────────
// المريض/المتفرّغ غائبٌ عن العمل كلّه فلا يغطّي شيئًا. صاحب الاستئذان حاضرٌ
// جزئيًّا: استئذان البداية → غائب عن الفترة الأولى من الشفت (1/3)، واستئذان
// النهاية → غائب عن الثانية (2/4) — يغطّي فقط الفترات التي هو حاضرٌ فيها.
// «احتياط» ليس غيابًا هنا: الاحتياطيّ مُغطٍّ مرغوب.
function covererAbsence(rows: Row[], coverDoctorId: string): { hardAr: string | null; blocked: Set<number> } {
  const st = rows.filter(
    (r) => r.doctor_id === coverDoctorId && r.period === 0 && r.status !== 'active' && r.status !== 'extra',
  );
  const hard = st.find((r) => r.status === 'sick_leave' || r.status === 'vacation');
  const blocked = new Set<number>();
  // الاستئذان يحجب فترةً واحدةً من **شفت الطبيب نفسه** فقط (لا الفترة المسمّاة في
  // الشفتين معًا): بداية الدوام صباحًا = ١ ومساءً = ٣؛ نهايته صباحًا = ٢ ومساءً = ٤.
  // الشفت من خانة صفّ الاستئذان (1=صباح/2=مساء، كُتبت من مكانه وقت التسجيل)، وإلّا
  // من خاناته الفعليّة — فيبقى المستأذن صباحًا قادرًا على العمل/التبديل في الشفت الآخر.
  const myPeriods = rows
    .filter((r) => r.doctor_id === coverDoctorId && r.status === 'active' && r.period > 0
      && (r.role === 'clinic' || r.role === 'delegator'))
    .map((r) => r.period);
  for (const r of st) {
    if (r.status !== 'permission_start' && r.status !== 'permission_end') continue;
    const evening = r.clinic_number === 2 ? true
      : r.clinic_number === 1 ? false
        : myPeriods.some((p) => p >= 3);
    if (r.status === 'permission_start') blocked.add(evening ? 3 : 1);
    else blocked.add(evening ? 4 : 2);
  }
  return { hardAr: hard ? (hard.status === 'sick_leave' ? 'مرضيّة' : 'تفرّغ') : null, blocked };
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
  setScheduleStatus, cancelStatus, listDoctorStatuses, computeCoverageBrief, computeDayCoverageBriefs,
  swapInSchedule, swapFullPositions, listSwapTargets,
  placeInClinic, placeAsDelegator,
  attachTraineeForDay,
  clearWeek,
  setClinicCount, moveDoctorGroup, setDoctorGroupStatus,
};
