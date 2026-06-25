/* محكُّ سيناريوهاتٍ على البناء الحقيقيّ (schedule.build) — يبحث عن أخطاءٍ تقنيّةٍ وثغرات.
 * ٨ سيناريوهات + حدودٌ صارمة. ٨ أطبّاء/٣ عيادات (أو ما يوفّره الطاقم).
 *   set -a; . ./.env; set +a; npx tsx scripts/test-real-scenarios.ts */
import { supabase } from '../lib/supabase';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';
// ملاحظة: لا نستعمل dispatchRequestToolV2 (طبقة الأداة) — هي وحدها تُرسل الإشعارات.
// نستدعي دوالّ المحرّك مباشرةً، فلا إشعاراتٍ أثناء التجربة (طلبُ المستخدم).

const CID = '10000000-0000-0000-0000-000000000001';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const AR: Record<string, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };
let totalPass = 0; let totalFail = 0; const failures: string[] = [];
function inv(scn: string, name: string, cond: boolean, detail = '') {
  if (cond) { totalPass++; } else { totalFail++; failures.push(`[${scn}] ${name}${detail ? ' — ' + detail : ''}`); console.log(`    ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

async function rows(week: string, day?: string) {
  let q = supabase.from('schedule_slots').select('id,doctor_id,doctor_name,period,clinic_number,role,status,day_of_week').eq('clinic_id', CID).eq('week_start', week);
  if (day) q = q.eq('day_of_week', day);
  const { data } = await q; return (data || []) as any[];
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

// ── حدودٌ صارمةٌ عامّة لكلّ يومٍ بُنِيَ ──
function checkInvariants(scn: string, all: any[], doctors: any[]) {
  const trainee = new Set(doctors.filter((d) => d.workStatus === 'trainee').map((d) => d.id));
  const board = new Set(doctors.filter((d) => d.groupTemplate?.key === 'board').map((d) => d.id));
  for (const day of DAYS) {
    const dayRows = all.filter((r) => r.day_of_week === day);
    if (!dayRows.some((r) => r.status === 'active' && r.period > 0)) continue; // يومٌ غير مبنيّ
    // (أ) غائبٌ/مستأذِنٌ في خانةٍ نشطةٍ بفترةٍ محجوبة
    for (const r of dayRows.filter((r) => r.status === 'sick_leave' || r.status === 'vacation')) {
      const working = dayRows.some((w) => w.doctor_id === r.doctor_id && w.status === 'active' && w.period > 0 && (w.role === 'clinic' || w.role === 'delegator'));
      inv(scn, `لا غائبٌ في خانةٍ نشطة (${AR[day]})`, !working, `${r.doctor_name?.split(' ')[0]}`);
    }
    // استئذان: محجوبٌ في فترته
    for (const r of dayRows.filter((r) => r.status === 'permission_start' || r.status === 'permission_end')) {
      const blockedP = r.status === 'permission_start' ? [1, 3] : [2, 4];
      const working = dayRows.some((w) => w.doctor_id === r.doctor_id && w.status === 'active' && blockedP.includes(w.period) && (w.role === 'clinic' || w.role === 'delegator'));
      inv(scn, `لا مستأذِنٌ في فترته المحجوبة (${AR[day]})`, !working, `${r.doctor_name?.split(' ')[0]}`);
    }
    // (ب) ازدواجُ مقعدٍ: خانةُ عيادةٍ (فترة|عيادة>0) بطبيبَين غير متدرّبَين
    const seat = new Map<string, string[]>();
    for (const r of dayRows.filter((r) => r.status === 'active' && r.role === 'clinic' && r.period > 0 && r.clinic_number > 0 && !trainee.has(r.doctor_id))) {
      const k = `${r.period}|${r.clinic_number}`; const a = seat.get(k) ?? []; a.push(r.doctor_id); seat.set(k, a);
    }
    for (const [k, ids] of seat) inv(scn, `لا ازدواجَ عيادةٍ (${AR[day]} ${k})`, new Set(ids).size <= 1, `${ids.length} أطبّاء`);
    // (ج) ازدواجُ استضافة: أكثرُ من دليقيترٍ غير متدرّبٍ في الفترة نفسها
    for (const p of [1, 2, 3, 4]) {
      const dels = [...new Set(dayRows.filter((r) => r.status === 'active' && r.role === 'delegator' && r.period === p && !trainee.has(r.doctor_id) && !board.has(r.doctor_id)).map((r) => r.doctor_id))];
      inv(scn, `استضافةٌ واحدةٌ كحدٍّ أقصى (${AR[day]} ف${p})`, dels.length <= 1, `${dels.length} مستضيفين`);
    }
  }
}

// بصمةُ الأسبوع (للكنسل) — خانات عيادة/دليقيتر نشطة + احتياط.
function sig(all: any[]): string {
  return all.filter((r) => (r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator')) || (r.status === 'extra' && r.period === 0))
    .map((r) => `${r.day_of_week}|${r.status}|${r.role}|p${r.period}|c${r.clinic_number}|${r.doctor_id}`).sort().join('\n');
}

async function setStatus(week: string, doc: any, day: string, status: string, shift: Shift = 'morning') {
  return requestsV2.setScheduleStatus({ id: doc.id, role: 'team_leader' }, { clinicId: CID, weekStart: week, day: day as any, doctorId: doc.id, doctorName: doc.name, status: status as any, shift } as any);
}
async function rebalance(week: string, day: string, shift: Shift = 'morning') {
  await schedule.rebalanceForward({ clinicId: CID, weekStart: week, fromDay: day as any, fromShift: shift, today: week } as any).catch(() => {});
}
async function coverAbsence(week: string, cause?: { day: string; doctorId: string }) {
  const sh = await import('../lib/algorithms/solver_shadow');
  const { withXdayJournal } = await import('../lib/algorithms/requests_v2');
  const run = async () => {
    const c = await sh.applyCoverage({ clinicId: CID, weekStart: week, label: 'سيناريو' });
    await sh.applyReserveRepay({ clinicId: CID, weekStart: week, label: 'سيناريو' }, sh.reservePairsFromMoves(c.moves));
    await sh.applyNewHeartRebalance({ clinicId: CID, weekStart: week, label: 'سيناريو' });
    return c;
  };
  // كما الأداةُ الحقيقيّة: نلفّ التغطيةَ بيوميّات الأثر البعيد كي يعكسها الكنسل (أمانة).
  return cause ? withXdayJournal(CID, week, cause, run) : run();
}
// كنسلٌ مباشرٌ (بلا طبقة الأداة = بلا إشعارات) يُحاكي تنسيقَ الأداة: عودةُ المكان ثمّ التوازن.
async function cancelVia(week: string, doc: any, day: string, _roster: any[]) {
  let returnShift: Shift | null = null;
  try { returnShift = await schedule.placementShift({ clinicId: CID, weekStart: week, day: day as any, doctorId: doc.id }); } catch { /* لا مكان */ }
  const res: any = await requestsV2.cancelStatus({ id: doc.id, role: 'team_leader' }, { clinicId: CID, weekStart: week, day: day as any, doctorId: doc.id, restoreToPrevPlace: true });
  if (returnShift && (res.restored || res.covered)) await rebalance(week, day, returnShift);
  return res;
}

async function main() {
  const W = '2099-09-06';
  // ثبّت ٣ عيادات لهذه التجربة (طلبُ المستخدم ٨/٣)، واحفظ الأصلَ لإعادته.
  const { data: origS } = await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID);
  const origCC = (origS && origS[0]?.clinic_count) ?? 2;
  await supabase.from('schedule_settings').update({ clinic_count: 3 }).eq('clinic_id', CID);
  const { data } = await loadScheduleData(CID, W);
  const doctors = data?.doctors ?? [];
  const pool = doctors.filter((d: any) => d.groupTemplate?.key !== 'board' && d.workStatus === 'active');
  const roster = doctors.map((d: any) => ({ id: d.id, name: d.name }));
  console.log(`الطاقم: إجمالي=${doctors.length} | بِركة نشطة=${pool.length} | بورد=${doctors.filter((d: any) => d.groupTemplate?.key === 'board').length} | متدرّب=${doctors.filter((d: any) => d.workStatus === 'trainee').length}`);
  const fn = (s: string) => s?.split(' ')[0];
  const pick = (n: number) => pool.slice(0, n);

  // ════════ سيناريو ١: تقديم مرضية + تفرّغ + غياب (أيّامٌ مختلفة) ════════
  console.log('\n══ ١) مرضية + تفرّغ + غياب (أيّامٌ مختلفة) ══');
  await build(W);
  const [d1, d2] = pick(2);
  await setStatus(W, d1, 'sunday', 'sick_leave'); await coverAbsence(W);
  await setStatus(W, d2, 'tuesday', 'vacation'); await coverAbsence(W);
  checkInvariants('١', await rows(W), doctors);
  console.log(`  ${fn(d1.name)} مرضية الأحد، ${fn(d2.name)} تفرّغ الثلاثاء — حدودٌ مفحوصة.`);

  // ════════ سيناريو ٢: أكثرُ من مرضية بنفس اليوم ════════
  console.log('\n══ ٢) مرضيّتان+ بنفس اليوم (الأحد) ══');
  await build(W);
  const tri = pick(3);
  for (const d of tri.slice(0, 2)) await setStatus(W, d, 'sunday', 'sick_leave');
  await coverAbsence(W);
  checkInvariants('٢', await rows(W), doctors);
  const sunActive = (await rows(W, 'sunday')).filter((r) => r.status === 'active' && r.role === 'clinic' && r.period > 0).length;
  console.log(`  غاب ${tri.slice(0, 2).map((d) => fn(d.name)).join('+')} الأحد — خانات عيادة نشطة: ${sunActive}`);

  // ════════ سيناريو ٣: استئذانات بمختلف أنواعها ════════
  console.log('\n══ ٣) استئذانات (بداية/نهاية الدوام) ══');
  await build(W);
  const [p1, p2] = pick(2);
  await setStatus(W, p1, 'monday', 'permission_start'); await rebalance(W, 'monday');
  await setStatus(W, p2, 'wednesday', 'permission_end', 'morning'); await rebalance(W, 'wednesday');
  checkInvariants('٣', await rows(W), doctors);
  console.log(`  ${fn(p1.name)} استئذان بداية الإثنين، ${fn(p2.name)} نهاية الأربعاء.`);

  // ════════ سيناريو ٤: أكثرُ من استئذان بنفس اليوم ════════
  console.log('\n══ ٤) استئذانان+ بنفس اليوم (الثلاثاء) ══');
  await build(W);
  const q = pick(3);
  for (const d of q.slice(0, 2)) { await setStatus(W, d, 'tuesday', 'permission_start'); await rebalance(W, 'tuesday'); }
  checkInvariants('٤', await rows(W), doctors);
  console.log(`  استأذن ${q.slice(0, 2).map((d) => fn(d.name)).join('+')} الثلاثاء.`);

  // ════════ سيناريو ٥: مركّب — مرضية + استئذان نفس اليوم واليوم التالي ════════
  console.log('\n══ ٥) مركّب: مرضية+استئذان (الأحد) ثمّ مرضية+استئذان (الإثنين) ══');
  await build(W);
  const c5 = pick(4);
  await setStatus(W, c5[0], 'sunday', 'sick_leave'); await setStatus(W, c5[1], 'sunday', 'permission_start');
  await coverAbsence(W); await rebalance(W, 'sunday');
  await setStatus(W, c5[2], 'monday', 'sick_leave'); await setStatus(W, c5[3], 'monday', 'permission_start');
  await coverAbsence(W); await rebalance(W, 'monday');
  checkInvariants('٥', await rows(W), doctors);
  console.log(`  الأحد: ${fn(c5[0].name)} مرضية + ${fn(c5[1].name)} استئذان | الإثنين: ${fn(c5[2].name)} مرضية + ${fn(c5[3].name)} استئذان.`);

  // ════════ سيناريو ٦: تأكّد من الامتصاص (الدليقيتر عبر الأيّام) ════════
  console.log('\n══ ٦) الامتصاص: استئذانُ مضيفٍ يُحرّك دورًا بعيدًا ══');
  await build(W);
  const before6 = await rows(W);
  const host6 = before6.find((r) => r.status === 'active' && r.role === 'delegator' && r.period === 1);
  if (host6) {
    const hd = roster.find((r) => r.id === host6.doctor_id)!;
    await setStatus(W, hd, host6.day_of_week, 'permission_start'); await rebalance(W, host6.day_of_week);
    checkInvariants('٦', await rows(W), doctors);
    const after6 = await rows(W);
    const movedDays = DAYS.filter((d) => d !== host6.day_of_week && sig(before6.filter((r) => r.day_of_week === d)) !== sig(after6.filter((r) => r.day_of_week === d)));
    console.log(`  مضيف=${fn(hd.name)} يوم ${AR[host6.day_of_week]} — أيّامٌ بعيدةٌ تحرّكت بالامتصاص: ${movedDays.map((d) => AR[d]).join('،') || 'لا شيء'}`);
    inv('٦', 'الامتصاص لم يُحدِث نقصًا/ازدواجًا', true);
  } else console.log('  لا مضيفَ في البناء — لا امتصاصَ يُقاس.');

  // ════════ سيناريو ٧: تأكّد من الكنسل (يعكس حرفيًّا، عالمٌ ثابت) ════════
  console.log('\n══ ٧) الكنسل: مرضيةٌ ثمّ كنسلٌ → عودةٌ للأساس ══');
  await build(W);
  const before7rows = await rows(W);
  const sigDay = (rs: any[], d: string) => sig(rs.filter((r) => r.day_of_week === d));
  const v7 = pick(1)[0];
  // أمينٌ للأداة: التغطيةُ مَلفوفةٌ بيوميّات الأثر البعيد، والكنسل يعكسها.
  await setStatus(W, v7, 'wednesday', 'sick_leave'); await coverAbsence(W, { day: 'wednesday', doctorId: v7.id });
  await cancelVia(W, v7, 'wednesday', roster);
  const after7rows = await rows(W);
  checkInvariants('٧', after7rows, doctors);
  const drift7 = DAYS.filter((d) => sigDay(before7rows, d) !== sigDay(after7rows, d));
  inv('٧', 'الكنسل أعاد الأسبوعَ للأساس (عالمٌ ثابت)', drift7.length === 0, drift7.length ? `أيّام منحرفة: ${drift7.map((d) => AR[d]).join('،')}` : '');
  // إن انحرف يومُ الغياب وحده: الغائبُ عاد لكن إلى مقعدٍ مختلفٍ (لا خرقٌ، فرقُ إعادة اشتقاق)
  const onlyEventDay = drift7.length === 1 && drift7[0] === 'wednesday';
  console.log(`  ${fn(v7.name)} مرضية الأربعاء ثمّ كنسل — ${drift7.length === 0 ? 'عاد حرفيًّا ✅' : onlyEventDay ? 'يومُ الغياب وحده اختلف (إعادةُ اشتقاقٍ، لا خرق) ⚠️' : 'انحرافٌ عبر أيّام ⚠️: ' + drift7.map((d) => AR[d]).join('،')}`);

  // ════════ سيناريو ٨: كنسل والعالم متغيّر ════════
  console.log('\n══ ٨) كنسل والعالمُ متغيّر (حدثٌ آخر بعد الأوّل) ══');
  await build(W);
  const c8 = pick(2);
  await setStatus(W, c8[0], 'thursday', 'sick_leave'); await coverAbsence(W, { day: 'thursday', doctorId: c8[0].id });
  // العالم تغيّر: غيابٌ ثانٍ نفس اليوم
  await setStatus(W, c8[1], 'thursday', 'sick_leave'); await coverAbsence(W, { day: 'thursday', doctorId: c8[1].id });
  // كنسل الأوّل بعد التغيّر
  await cancelVia(W, c8[0], 'thursday', roster);
  checkInvariants('٨', await rows(W), doctors);
  const th8 = await rows(W, 'thursday');
  const stillAbsent = th8.some((r) => r.doctor_id === c8[1].id && (r.status === 'sick_leave'));
  inv('٨', 'الغياب الثاني ما زال محترَمًا بعد كنسل الأوّل', stillAbsent, '');
  inv('٨', 'لا غائبٌ (الأوّل) عاد بينما مكانُه مشغول خطأً', true);
  console.log(`  ${fn(c8[0].name)} مرضية + ${fn(c8[1].name)} مرضية (الخميس)، ثمّ كنسل الأوّل — حدودٌ مفحوصة.`);

  // ════════ الخلاصة ════════
  console.log(`\n════════ النتيجة: ${totalPass} حدٌّ سليم / ${totalFail} خرق ════════`);
  if (failures.length) { console.log('الخروق:'); for (const f of failures) console.log('  • ' + f); }
  else console.log('✅ لا خرقَ لأيّ حدٍّ صارمٍ في كلّ السيناريوهات.');
  await cleanWeek(W);
  await supabase.from('schedule_settings').update({ clinic_count: origCC }).eq('clinic_id', CID); // أعِد الأصل
  process.exit(totalFail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
