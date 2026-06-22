/* محكُّ طلبات التبديل على البناء الحقيقيّ (schedule.build) — يبحث عن أخطاءٍ وثغرات.
 * يختبر المحرّكَ الصرفَ فقط (swapFullPositions / swapInSchedule / listSwapTargets) —
 * صفرُ إشعارات (طبقةُ التنسيق open/accept/reject مؤجّلةٌ للخطوة ٢: مراجعة الإشعارات).
 * يمسح ٢/٣/٤ عيادات. حدودٌ صارمة: حفظ + تبادلٌ تامّ + انعكاس + عزلُ أيّام + بوّابات.
 *   set -a; . ./.env; set +a; npx tsx scripts/test-swap-scenarios.ts */
import { supabase } from '../lib/supabase';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const AR: Record<string, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };
const LEADER = { id: 'leader-test', role: 'team_leader' as const };
let totalPass = 0; let totalFail = 0; const failures: string[] = [];
function inv(scn: string, name: string, cond: boolean, detail = '') {
  if (cond) { totalPass++; } else { totalFail++; const m = `[${scn}] ${name}${detail ? ' — ' + detail : ''}`; failures.push(m); console.log(`    ❌ ${m}`); }
}

type R = { id: string; doctor_id: string; doctor_name: string; period: number; clinic_number: number; role: string; status: string; day_of_week: string };

async function rows(week: string, day?: string): Promise<R[]> {
  let q = supabase.from('schedule_slots').select('id,doctor_id,doctor_name,period,clinic_number,role,status,day_of_week').eq('clinic_id', CID).eq('week_start', week);
  if (day) q = q.eq('day_of_week', day);
  const { data } = await q; return (data || []) as R[];
}
async function cleanWeek(week: string) { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', week); }

async function build(week: string) {
  await cleanWeek(week);
  const pre = await loadScheduleData(CID, week);
  const tm: Record<string, TraineeMode> = {};
  for (const t of (pre.data?.doctors ?? []).filter((d: any) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  await schedule.build({ weekStart: week, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm, dryRun: false } as any).catch((e: any) => console.log('  build err', e?.message));
}

// ── حدودٌ عامّة (مطابقة test-real-scenarios) ──
function checkInvariants(scn: string, all: R[], doctors: any[]) {
  const trainee = new Set(doctors.filter((d) => d.workStatus === 'trainee').map((d) => d.id));
  const board = new Set(doctors.filter((d) => d.groupTemplate?.key === 'board').map((d) => d.id));
  for (const day of DAYS) {
    const dayRows = all.filter((r) => r.day_of_week === day);
    if (!dayRows.some((r) => r.status === 'active' && r.period > 0)) continue;
    for (const r of dayRows.filter((r) => r.status === 'sick_leave' || r.status === 'vacation')) {
      const working = dayRows.some((w) => w.doctor_id === r.doctor_id && w.status === 'active' && w.period > 0 && (w.role === 'clinic' || w.role === 'delegator'));
      inv(scn, `لا غائبٌ في خانةٍ نشطة (${AR[day]})`, !working, fn(r.doctor_name));
    }
    for (const r of dayRows.filter((r) => r.status === 'permission_start' || r.status === 'permission_end')) {
      const blockedP = r.status === 'permission_start' ? [1, 3] : [2, 4];
      const working = dayRows.some((w) => w.doctor_id === r.doctor_id && w.status === 'active' && blockedP.includes(w.period) && (w.role === 'clinic' || w.role === 'delegator'));
      inv(scn, `لا مستأذِنٌ في فترته المحجوبة (${AR[day]})`, !working, fn(r.doctor_name));
    }
    const seat = new Map<string, string[]>();
    for (const r of dayRows.filter((r) => r.status === 'active' && r.role === 'clinic' && r.period > 0 && r.clinic_number > 0 && !trainee.has(r.doctor_id))) {
      const k = `${r.period}|${r.clinic_number}`; const a = seat.get(k) ?? []; a.push(r.doctor_id); seat.set(k, a);
    }
    for (const [k, ids] of seat) inv(scn, `لا ازدواجَ عيادةٍ (${AR[day]} ${k})`, new Set(ids).size <= 1, `${ids.length} أطبّاء`);
    for (const p of [1, 2, 3, 4]) {
      const dels = [...new Set(dayRows.filter((r) => r.status === 'active' && r.role === 'delegator' && r.period === p && !trainee.has(r.doctor_id) && !board.has(r.doctor_id)).map((r) => r.doctor_id))];
      inv(scn, `استضافةٌ واحدةٌ كحدٍّ أقصى (${AR[day]} ف${p})`, dels.length <= 1, `${dels.length} مستضيفين`);
    }
  }
}

const fn = (s?: string) => (s || '').split(' ')[0];
// خانات الطبيب الكاملة في يوم (نشطة + احتياط) — مفتاحٌ بلا هويّة الطبيب.
const SEAT_PRED = (r: R) => (r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator')) || (r.status === 'extra' && r.period === 0);
const seatKey = (r: R) => `${r.status}|${r.role}|p${r.period}|c${r.clinic_number}`;
// متدرّبو الطاقم — أُستثنَوا من الحفظ: الظلّ نسخةٌ مكرّرةٌ تتبع مدرّبها فتتحرّك معه (سليم).
let TRAINEES = new Set<string>();
function posKeys(dayRows: R[], id: string): string { return dayRows.filter((r) => r.doctor_id === id && SEAT_PRED(r)).map(seatKey).sort().join(','); }
function seatsMultiset(dayRows: R[]): string { return dayRows.filter((r) => SEAT_PRED(r) && !TRAINEES.has(r.doctor_id)).map(seatKey).sort().join(','); }
// بصمةُ يومٍ كاملة (مع الهويّة) — للانعكاس وعزل الأيّام.
function daySig(dayRows: R[]): string { return dayRows.filter(SEAT_PRED).map((r) => `${seatKey(r)}|${r.doctor_id}`).sort().join('\n'); }
function shiftOf(dayRows: R[], id: string): Shift | null {
  const slots = dayRows.filter((r) => r.doctor_id === id && r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'));
  if (slots.some((r) => r.period >= 3)) return 'evening';
  if (slots.some((r) => r.period <= 2)) return 'morning';
  const ex = dayRows.find((r) => r.doctor_id === id && r.period === 0 && r.status === 'extra');
  if (ex) return ex.clinic_number === 2 ? 'evening' : 'morning';
  return null;
}
const hasActive = (dayRows: R[], id: string) => dayRows.some((r) => r.doctor_id === id && r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'));
const isHost = (dayRows: R[], id: string) => dayRows.some((r) => r.doctor_id === id && r.status === 'active' && r.role === 'delegator' && r.period > 0);
const isReserve = (dayRows: R[], id: string) => !hasActive(dayRows, id) && dayRows.some((r) => r.doctor_id === id && r.period === 0 && r.status === 'extra');

async function setStatus(week: string, id: string, name: string, day: string, status: string, shift: Shift = 'morning') {
  return requestsV2.setScheduleStatus(LEADER, { clinicId: CID, weekStart: week, day: day as any, doctorId: id, doctorName: name, status: status as any, shift } as any);
}
async function rebalance(week: string, day: string, shift: Shift = 'morning') {
  await schedule.rebalanceForward({ clinicId: CID, weekStart: week, fromDay: day as any, fromShift: shift, today: week } as any).catch(() => {});
}
async function coverAbsence(week: string) {
  const sh = await import('../lib/algorithms/solver_shadow');
  const c = await sh.applyCoverage({ clinicId: CID, weekStart: week, label: 'تبديل' });
  await sh.applyReserveRepay({ clinicId: CID, weekStart: week, label: 'تبديل' }, sh.reservePairsFromMoves(c.moves));
  await sh.applyNewHeartRebalance({ clinicId: CID, weekStart: week, label: 'تبديل' });
  return c;
}

// تبديلٌ كامل + فحصُ الحدود (التبادل/الحفظ/الانعكاس/عزل الأيّام/crossShift)، ثمّ يُعيد الحالة.
async function checkFullSwap(scn: string, week: string, day: WeekDay, aId: string, bId: string, doctors: any[], expectCross?: boolean) {
  const before = await rows(week);
  const bDay = before.filter((r) => r.day_of_week === day);
  const bA = posKeys(bDay, aId); const bB = posKeys(bDay, bId);
  const res: any = await requestsV2.swapFullPositions(LEADER, { clinicId: CID, weekStart: week, day, aId, bId });
  inv(scn, 'التبديل نجح', res.success, res.error || '');
  if (!res.success) return;
  const after = await rows(week);
  const aDay = after.filter((r) => r.day_of_week === day);
  // الحفظ: مجموعة الخانات (بلا هويّة) متطابقة
  inv(scn, 'الحفظ: لا خانة وُلِدت/ضاعت', seatsMultiset(bDay) === seatsMultiset(aDay));
  // التبادل التامّ: كلٌّ أخذ مكان الآخر
  inv(scn, 'التبادل التامّ A↔B', posKeys(aDay, aId) === bB && posKeys(aDay, bId) === bA, `A:${posKeys(aDay, aId)} B:${posKeys(aDay, bId)}`);
  // crossShift
  if (expectCross !== undefined) inv(scn, `crossShift=${expectCross}`, !!res.crossShift === expectCross, `actual=${!!res.crossShift}`);
  // عزل الأيّام: بقيّة الأيّام لم تتغيّر
  for (const d of DAYS) { if (d === day) continue; inv(scn, `عزلُ يومِ ${AR[d]}`, daySig(before.filter((r) => r.day_of_week === d)) === daySig(after.filter((r) => r.day_of_week === d))); }
  // الحدود العامّة
  checkInvariants(scn, after, doctors);
  // الانعكاس: تبديلٌ ثانٍ يعيد البصمة حرفيًّا
  const res2: any = await requestsV2.swapFullPositions(LEADER, { clinicId: CID, weekStart: week, day, aId, bId });
  inv(scn, 'الانعكاس نجح', res2.success, res2.error || '');
  if (res2.success) inv(scn, 'الانعكاس أعاد اليومَ حرفيًّا', daySig((await rows(week, day))) === daySig(bDay));
}

async function runConfig(cc: number, doctors: any[]) {
  const W = '2099-09-13';
  console.log(`\n════════ تهيئة: ${cc} عيادات ════════`);
  await supabase.from('schedule_settings').update({ clinic_count: cc }).eq('clinic_id', CID);
  const board = new Set(doctors.filter((d) => d.groupTemplate?.key === 'board').map((d) => d.id));
  const traineeIds = new Set(doctors.filter((d) => d.workStatus === 'trainee').map((d) => d.id));
  const nameOf = (id: string) => doctors.find((d: any) => d.id === id)?.name || '';
  const C = (n: string) => `${n}/${cc}ع`;

  // ===== مجموعةُ التبديلات السعيدة + البوّابات (بناءٌ واحد — كلٌّ يُعيد الحالة) =====
  await build(W);
  let day: WeekDay = 'sunday';
  let dRows = await rows(W, day);
  if (!dRows.some((r) => r.status === 'active' && r.period > 0)) { console.log(`  ${day} غير مبنيّ — أتخطّى التهيئة`); return; }
  const plain = (dRows: R[], id: string) => !board.has(id) && !traineeIds.has(id);
  const morningDocs = [...new Set(dRows.filter((r) => r.status === 'active' && (r.period === 1 || r.period === 2) && r.role === 'clinic' && plain(dRows, r.doctor_id)).map((r) => r.doctor_id))];
  const eveningDocs = [...new Set(dRows.filter((r) => r.status === 'active' && (r.period === 3 || r.period === 4) && r.role === 'clinic' && plain(dRows, r.doctor_id)).map((r) => r.doctor_id))];
  const hostDocs = [...new Set(dRows.filter((r) => r.status === 'active' && r.role === 'delegator' && plain(dRows, r.doctor_id)).map((r) => r.doctor_id))];
  const reserveDocs = [...new Set(dRows.filter((r) => isReserve(dRows, r.doctor_id) && plain(dRows, r.doctor_id)).map((r) => r.doctor_id))];

  // ١) تبديل بسيط بنفس الشفت
  if (morningDocs.length >= 2) {
    console.log(`\n══ ١) ${C('بسيط نفس الشفت')}: ${fn(nameOf(morningDocs[0]!))} ↔ ${fn(nameOf(morningDocs[1]!))} ══`);
    await checkFullSwap('١', W, day, morningDocs[0]!, morningDocs[1]!, doctors, false);
  } else console.log('  ١) لا عيادتين صباحيّتين — تخطّي');

  // ٢) تبديل بين شفتين
  if (morningDocs.length >= 1 && eveningDocs.length >= 1) {
    console.log(`\n══ ٢) ${C('بين شفتين')}: ${fn(nameOf(morningDocs[0]!))}(ص) ↔ ${fn(nameOf(eveningDocs[0]!))}(م) ══`);
    await checkFullSwap('٢', W, day, morningDocs[0]!, eveningDocs[0]!, doctors, true);
  } else console.log('  ٢) لا شفتان مختلفان — تخطّي');

  // ٣) تبديل يشمل مضيفًا
  if (hostDocs.length >= 1) {
    const h = hostDocs[0]!; const sh = shiftOf(dRows, h);
    const partner = (sh === 'evening' ? eveningDocs : morningDocs).find((id) => id !== h && !isHost(dRows, id));
    if (partner) {
      console.log(`\n══ ٣) ${C('مع مضيف')}: ${fn(nameOf(h))}(مضيف) ↔ ${fn(nameOf(partner))} ══`);
      await checkFullSwap('٣', W, day, h, partner, doctors, undefined);
    } else console.log('  ٣) لا شريكَ مناسبٌ للمضيف — تخطّي');
  } else console.log('  ٣) لا مضيفَ في البناء — تخطّي');

  // ٤) تبديل يشمل احتياطيًّا
  if (reserveDocs.length >= 1 && (morningDocs.length + eveningDocs.length) >= 1) {
    const rv = reserveDocs[0]!;
    const other = [...morningDocs, ...eveningDocs].find((id) => id !== rv);
    if (other) {
      console.log(`\n══ ٤) ${C('مع احتياط')}: ${fn(nameOf(rv))}(احتياط) ↔ ${fn(nameOf(other))} ══`);
      await checkFullSwap('٤', W, day, rv, other, doctors, undefined);
    }
  } else console.log('  ٤) لا احتياطَ في البناء — تخطّي');

  // ٩) الصلاحيّة + تبديل النفس (لا يُغيّر الحالة — رفضٌ صرف)
  console.log(`\n══ ٩) ${C('الصلاحيّة + النفس')} ══`);
  if (morningDocs.length >= 2) {
    const [a, b] = morningDocs as string[];
    // غير قائدٍ وليس طرفًا → رفض
    const outsider = morningDocs.find((id) => id !== a && id !== b) || reserveDocs[0] || eveningDocs[0];
    if (outsider) {
      const r1: any = await requestsV2.swapFullPositions({ id: outsider, role: 'doctor' }, { clinicId: CID, weekStart: W, day, aId: a!, bId: b! });
      inv('٩', 'غير القائد وليس طرفًا يُرفض', !r1.success, r1.error || '');
    }
    // غير قائدٍ لكنّه طرف → يُقبل (ثمّ يُعكَس)
    const r2: any = await requestsV2.swapFullPositions({ id: a, role: 'doctor' }, { clinicId: CID, weekStart: W, day, aId: a!, bId: b! });
    inv('٩', 'غير القائد لكنّه طرفٌ يُقبل', r2.success, r2.error || '');
    if (r2.success) await requestsV2.swapFullPositions({ id: a, role: 'doctor' }, { clinicId: CID, weekStart: W, day, aId: a!, bId: b! }); // عكس
    // النفس → رفض
    const r3: any = await requestsV2.swapFullPositions(LEADER, { clinicId: CID, weekStart: W, day, aId: a!, bId: a! });
    inv('٩', 'تبديلُ الطبيبِ نفسَه يُرفض', !r3.success, r3.error || '');
  }

  // ١٠) دائريّ ٣-حلقة (swapInSchedule، نطاق يوم) — التطبيق ٣× = هويّة
  if (morningDocs.length >= 3) {
    const trio = morningDocs.slice(0, 3) as string[];
    console.log(`\n══ ١٠) ${C('دائريّ ٣-حلقة')}: ${trio.map((id) => fn(nameOf(id))).join('→')} ══`);
    const orig = daySig(await rows(W, day));
    const apply = () => requestsV2.swapInSchedule(LEADER, { clinicId: CID, weekStart: W, day, doctorIds: trio, scope: { kind: 'day' } });
    const origMs = seatsMultiset(await rows(W, day));
    const a1: any = await apply();
    inv('١٠', 'الدائريّ نجح', a1.success, a1.error || '');
    if (a1.success) {
      const after1 = await rows(W, day);
      inv('١٠', 'الحفظ (دائريّ)', seatsMultiset(after1) === origMs);
      inv('١٠', 'دائريّ لم يُساوِ الهويّةَ بعد دورةٍ واحدة', daySig(after1) !== orig);
      checkInvariants('١٠', await rows(W), doctors);
      await apply(); await apply();
      inv('١٠', 'التطبيق ٣× = هويّة', daySig(await rows(W, day)) === orig);
    }
  } else console.log('  ١٠) أقلّ من ٣ عياداتٍ صباحيّة — تخطّي الدائريّ');

  // ١١) نطاقٌ محدّد (فترة) — لا يتغيّر إلّا داخل النطاق
  if (morningDocs.length >= 2) {
    const [a, b] = morningDocs as string[];
    console.log(`\n══ ١١) ${C('نطاق فترة ١')}: ${fn(nameOf(a!))} ↔ ${fn(nameOf(b!))} ══`);
    const before = await rows(W, day);
    const r: any = await requestsV2.swapInSchedule(LEADER, { clinicId: CID, weekStart: W, day, doctorIds: [a!, b!], scope: { kind: 'period', period: 1 } });
    if (r.success) {
      const after = await rows(W, day);
      // فترة ٢ للطرفين لم تتغيّر
      const p2Before = before.filter((x) => (x.doctor_id === a || x.doctor_id === b) && x.period === 2).map((x) => `${x.doctor_id}|c${x.clinic_number}`).sort().join(',');
      const p2After = after.filter((x) => (x.doctor_id === a || x.doctor_id === b) && x.period === 2).map((x) => `${x.doctor_id}|c${x.clinic_number}`).sort().join(',');
      inv('١١', 'فترةٌ خارج النطاق لم تتغيّر', p2Before === p2After);
      inv('١١', 'الحفظ (نطاق)', seatsMultiset(before) === seatsMultiset(after));
      checkInvariants('١١', await rows(W), doctors);
      await requestsV2.swapInSchedule(LEADER, { clinicId: CID, weekStart: W, day, doctorIds: [a!, b!], scope: { kind: 'period', period: 1 } }); // عكس
    } else inv('١١', 'تبديل النطاق نجح', false, r.error);
  }

  // ===== ٥) رفض استئذان×تبديل (بناءٌ مستقلّ) =====
  console.log(`\n══ ٥) ${C('رفض استئذان×تبديل')} ══`);
  await build(W); day = 'monday'; dRows = await rows(W, day);
  const m5 = [...new Set(dRows.filter((r) => r.status === 'active' && r.period === 1 && r.role === 'clinic' && plain(dRows, r.doctor_id)).map((r) => r.doctor_id))];
  if (m5.length >= 2) {
    const [a, b] = m5 as string[];
    await setStatus(W, a!, nameOf(a!), day, 'permission_start', 'morning'); await rebalance(W, day, 'morning');
    const after = await rows(W, day);
    const aStill = after.some((r) => r.doctor_id === a && r.status === 'active' && r.period > 0);
    const bP1 = after.some((r) => r.doctor_id === b && r.status === 'active' && r.period === 1);
    if (aStill && bP1) {
      const r: any = await requestsV2.swapFullPositions(LEADER, { clinicId: CID, weekStart: W, day, aId: a!, bId: b! });
      inv('٥', 'تبديلٌ يُوقِع مستأذنًا في فترته المحجوبة يُرفض', !r.success, r.error || '');
      inv('٥', 'سببُ الرفض استئذان', !r.success && /مستأذن/.test(r.error || ''), r.error || '');
    } else console.log(`  ٥) حالةٌ غير مناسبةٍ بعد الاستئذان (aStill=${aStill} bP1=${bP1}) — تخطّي`);
    checkInvariants('٥', await rows(W), doctors);
  } else console.log('  ٥) أقلّ من عيادتين بفترة ١ — تخطّي');

  // ===== ٦) رفض غياب×تبديل + ٧) رفض بلا-مركز (بناءٌ واحد) =====
  console.log(`\n══ ٦+٧) ${C('رفض غياب / بلا-مركز')} ══`);
  await build(W); day = 'tuesday'; dRows = await rows(W, day);
  const m67 = [...new Set(dRows.filter((r) => r.status === 'active' && r.period > 0 && r.role === 'clinic' && plain(dRows, r.doctor_id)).map((r) => r.doctor_id))];
  if (m67.length >= 3) {
    const [a, b, c] = m67 as string[];
    // ٦) غياب
    await setStatus(W, a!, nameOf(a!), day, 'sick_leave', 'morning');
    const r6: any = await requestsV2.swapFullPositions(LEADER, { clinicId: CID, weekStart: W, day, aId: a!, bId: b! });
    inv('٦', 'تبديلٌ مع غائبٍ يُرفض', !r6.success, r6.error || '');
    inv('٦', 'سببُ الرفض غياب', !r6.success && /غائب/.test(r6.error || ''), r6.error || '');
    // ٧) بلا مركز: احذف صفوفَ c لهذا اليوم (محاكاةُ «العالم تغيّر»)
    const cRowIds = dRows.filter((r) => r.doctor_id === c).map((r) => r.id);
    if (cRowIds.length) await supabase.from('schedule_slots').delete().in('id', cRowIds);
    const r7: any = await requestsV2.swapFullPositions(LEADER, { clinicId: CID, weekStart: W, day, aId: c!, bId: b! });
    inv('٧', 'تبديلٌ مع بلا-مركزٍ يُرفض', !r7.success, r7.error || '');
    inv('٧', 'سببُ الرفض بلا-مركز', !r7.success && /مركز/.test(r7.error || ''), r7.error || '');
  } else console.log('  ٦+٧) أقلّ من ٣ عياداتٍ — تخطّي');

  // ===== ٨) ظلّ المتدرّب يتبع مدرّبه =====
  console.log(`\n══ ٨) ${C('ظلّ المتدرّب')} ══`);
  if (traineeIds.size >= 1) {
    await build(W); day = 'wednesday'; dRows = await rows(W, day);
    // اعثر على متدرّبٍ خاناته تطابق مدرّبًا (الظلّ)
    let found = false;
    for (const tId of traineeIds) {
      const tKeys = posKeys(dRows, tId as string);
      if (!tKeys) continue;
      const sup = [...new Set(dRows.filter((r) => r.status === 'active' && r.period > 0 && !traineeIds.has(r.doctor_id)).map((r) => r.doctor_id))]
        .find((id) => posKeys(dRows, id) === tKeys);
      if (!sup) continue;
      const x = [...new Set(dRows.filter((r) => r.status === 'active' && r.period > 0 && r.role === 'clinic' && plain(dRows, r.doctor_id) && r.doctor_id !== sup).map((r) => r.doctor_id))]
        .find((id) => !traineeIds.has(id));
      if (!x) continue;
      found = true;
      const xKeysBefore = posKeys(dRows, x);
      const supKeysBefore = posKeys(dRows, sup);
      console.log(`  متدرّب=${fn(nameOf(tId as string))} مدرّب=${fn(nameOf(sup))} ↔ ${fn(nameOf(x))}`);
      const r: any = await requestsV2.swapFullPositions(LEADER, { clinicId: CID, weekStart: W, day, aId: sup, bId: x });
      inv('٨', 'تبديل المدرّب نجح', r.success, r.error || '');
      if (r.success) {
        const after = await rows(W, day);
        inv('٨', 'الظلّ انتقل إلى مكان سَلَفِ المدرّب', posKeys(after, tId as string) === xKeysBefore, `ظلّ=${posKeys(after, tId as string)} متوقّع=${xKeysBefore}`);
        checkInvariants('٨', await rows(W), doctors);
        // الانعكاس يعيد الظلّ لمدرّبه
        await requestsV2.swapFullPositions(LEADER, { clinicId: CID, weekStart: W, day, aId: sup, bId: x });
        inv('٨', 'الانعكاس أعاد الظلّ لمدرّبه', posKeys(await rows(W, day), tId as string) === supKeysBefore);
      }
      break;
    }
    if (!found) console.log('  ٨) لا ظلَّ مطابقٌ في البناء — تخطّي');
  } else console.log('  ٨) لا متدرّب في الطاقم — تخطّي');

  // ===== ١٢) مرشّحو listSwapTargets =====
  console.log(`\n══ ١٢) ${C('مرشّحو listSwapTargets')} ══`);
  await build(W); day = 'thursday'; dRows = await rows(W, day);
  const m12 = [...new Set(dRows.filter((r) => r.status === 'active' && r.period > 0 && r.role === 'clinic' && plain(dRows, r.doctor_id)).map((r) => r.doctor_id))];
  if (m12.length >= 4) {
    const [reqr, sickD, permD, okD] = m12 as string[];
    await setStatus(W, sickD!, nameOf(sickD!), day, 'sick_leave', 'morning');
    await setStatus(W, permD!, nameOf(permD!), day, 'permission_start', 'morning'); // محجوبٌ كلّيًّا للتبديل
    const listed: any = await requestsV2.listSwapTargets({ clinicId: CID, weekStart: W, day, requesterId: reqr!, mode: { kind: 'period', period: 1 } });
    const tIds = new Set((listed.targets || []).map((t: any) => t.id));
    inv('١٢', 'الطالبُ نفسُه مُستبعَد', !tIds.has(reqr!));
    inv('١٢', 'الغائبُ مُستبعَد', !tIds.has(sickD!));
    inv('١٢', 'المستأذِنُ مُستبعَد', !tIds.has(permD!));
    // طالبٌ غائب → خطأ
    const ls: any = await requestsV2.listSwapTargets({ clinicId: CID, weekStart: W, day, requesterId: sickD!, mode: { kind: 'period', period: 1 } });
    inv('١٢', 'طالبٌ غائبٌ يُعطي خطأً', !ls.success, ls.error || '');
    // وضع doctor لطبيبٍ سليم
    const ld: any = await requestsV2.listSwapTargets({ clinicId: CID, weekStart: W, day, requesterId: reqr!, mode: { kind: 'doctor', doctorId: okD! } });
    inv('١٢', 'وضع doctor لطبيبٍ سليمٍ ينجح', ld.success && (ld.targets || []).some((t: any) => t.id === okD), ld.error || '');
  } else console.log('  ١٢) أقلّ من ٤ عياداتٍ — تخطّي');

  // ===== ١٣) تكامليّ: تبديل ثمّ غيابٌ على المالك الجديد ← التغطية تحلّ بصحّة =====
  console.log(`\n══ ١٣) ${C('تبديل ثمّ غياب (تكامليّ)')} ══`);
  await build(W); day = 'sunday'; dRows = await rows(W, day);
  const m13 = [...new Set(dRows.filter((r) => r.status === 'active' && (r.period === 1 || r.period === 2) && r.role === 'clinic' && plain(dRows, r.doctor_id) && !isHost(dRows, r.doctor_id)).map((r) => r.doctor_id))];
  if (m13.length >= 2) {
    const [a, b] = m13 as string[];
    const aSeatBefore = posKeys(dRows, a!);
    const sw: any = await requestsV2.swapFullPositions(LEADER, { clinicId: CID, weekStart: W, day, aId: a!, bId: b! });
    inv('١٣', 'التبديل التمهيديّ نجح', sw.success, sw.error || '');
    if (sw.success) {
      // بعد التبديل: b يشغل مقعد a القديم. نُغيّب b ونُغطّي.
      const afterSwap = await rows(W, day);
      inv('١٣', 'بعد التبديل: b يشغل مقعد a القديم', posKeys(afterSwap, b!) === aSeatBefore);
      await setStatus(W, b!, nameOf(b!), day, 'sick_leave', shiftOf(afterSwap, b!) || 'morning');
      await coverAbsence(W);
      const covered = await rows(W);
      checkInvariants('١٣', covered, doctors);
      const bDay = covered.filter((r) => r.day_of_week === day);
      inv('١٣', 'الغائبُ (b) ليس في خانةٍ نشطة', !hasActive(bDay, b!));
      // a ما زال يشغل مقعد b القديم (التبديل نجا من التغطية)
      inv('١٣', 'a ما زال على مقعده المُبادَل', hasActive(bDay, a!));
      // كنسلٌ ثمّ فحص الحدود (لا خرق)
      await requestsV2.cancelStatus(LEADER, { clinicId: CID, weekStart: W, day: day as any, doctorId: b!, restoreToPrevPlace: true } as any).catch(() => {});
      await rebalance(W, day, shiftOf(await rows(W, day), b!) || 'morning');
      checkInvariants('١٣', await rows(W), doctors);
    }
  } else console.log('  ١٣) أقلّ من عيادتين مناسبتين — تخطّي');

  await cleanWeek(W);
}

async function main() {
  const W = '2099-09-13';
  const { data: origS } = await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID);
  const origCC = (origS && origS[0]?.clinic_count) ?? 2;
  try {
    const { data } = await loadScheduleData(CID, W);
    const doctors = data?.doctors ?? [];
    TRAINEES = new Set(doctors.filter((d: any) => d.workStatus === 'trainee').map((d: any) => d.id));
    console.log(`الطاقم: إجمالي=${doctors.length} | بورد=${doctors.filter((d: any) => d.groupTemplate?.key === 'board').length} | متدرّب=${doctors.filter((d: any) => d.workStatus === 'trainee').length}`);
    for (const cc of [2, 3, 4]) await runConfig(cc, doctors);
  } finally {
    await cleanWeek(W);
    await supabase.from('schedule_settings').update({ clinic_count: origCC }).eq('clinic_id', CID);
  }
  console.log(`\n════════ النتيجة: ${totalPass} حدٌّ سليم / ${totalFail} خرق ════════`);
  if (failures.length) { console.log('الخروق:'); for (const f of failures) console.log('  • ' + f); }
  else console.log('✅ لا خرقَ لأيّ حدٍّ صارمٍ في كلّ التهيئات.');
  process.exit(totalFail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
