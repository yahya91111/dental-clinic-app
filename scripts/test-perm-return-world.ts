/* طيُّ الاتّجاه العكسيّ — الحالة #2 (العالم تغيّر فتعذّر العكسُ الحرفيّ للاستئذان): في وضع
 * apply يتولّى القلبُ الجديد (applyReturn) **تغطيةً عكسيّةً جراحيّة** بدل العجلة القديمة:
 * العائدُ يستردّ مقاعده بأقلّ لمسٍ، والعجلةُ القديمةُ لا تشتعل، والطاقمُ محصورٌ بالمشهد،
 * وظلُّ المتدرّب يلاصق العائد. مشهدٌ منضبطٌ مُدرَجٌ (لا اعتماد على بناءٍ متغيّر).
 *   set -a; . ./.env; set +a; npx tsx scripts/test-perm-return-world.ts */
import { supabase } from '../lib/supabase';
import { requestsV2, withXdayJournal } from '../lib/algorithms/requests_v2';
import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { WeekDay, Shift } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
const DAY: WeekDay = 'sunday';
const sx = (id: string) => (id || '').slice(-4);
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };

async function clean() { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK); }
async function ins(row: any) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: DAY, status: 'active', source: 'ai', ...row }); }
async function dayRows() {
  const { data } = await supabase.from('schedule_slots').select('id,doctor_id,doctor_name,period,clinic_number,role,status').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', DAY);
  return (data || []) as any[];
}
const actOf = (rows: any[]) => rows.filter((r) => r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'));
const locOf = (rows: any[], id: string) => actOf(rows).filter((r) => r.doctor_id === id).map((r) => `${r.role === 'delegator' ? 'دل' : 'ع' + r.clinic_number}ف${r.period}`).sort().join(',') || '—';

// يحاكي مسارَ المُستدعي الحيّ (tools_requests_v2 cancel) بدوالّ المحرّك مباشرةً.
async function cancelWired(eid: string) {
  let rs: Shift | null = null;
  try { rs = await schedule.placementShift({ clinicId: CID, weekStart: WEEK, day: DAY, doctorId: eid }); } catch { /* */ }
  const res: any = await requestsV2.cancelStatus({ id: eid, role: 'team_leader' } as any, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: eid, restoreToPrevPlace: true } as any);
  let wheelFired = false;
  if ((res.covered || res.permSwapRecompute) && rs) { wheelFired = true; await schedule.redistributeOnReturn({ clinicId: CID, weekStart: WEEK, day: DAY, shift: rs }).catch(() => {}); }
  if (rs && (res.restored || res.covered)) await schedule.rebalanceForward({ clinicId: CID, weekStart: WEEK, fromDay: DAY as any, fromShift: rs, today: WEEK } as any).catch(() => {});
  return { res, wheelFired };
}

// يبني الحالة #2: مضيفٌ كامل E يستأذن ف١ (full-swap) ثمّ يمرض البديلُ R (العالم تغيّر).
async function buildCase2(E: any, A: any, B: any, C: any, D: any, F: any) {
  await clean();
  await ins({ period: 1, clinic_number: 1, doctor_id: A.id, doctor_name: A.name, role: 'clinic' });
  await ins({ period: 2, clinic_number: 1, doctor_id: B.id, doctor_name: B.name, role: 'clinic' });
  await ins({ period: 1, clinic_number: 2, doctor_id: C.id, doctor_name: C.name, role: 'clinic' });
  await ins({ period: 2, clinic_number: 2, doctor_id: C.id, doctor_name: C.name, role: 'clinic' });
  await ins({ period: 1, clinic_number: 3, doctor_id: D.id, doctor_name: D.name, role: 'clinic' });
  await ins({ period: 2, clinic_number: 3, doctor_id: D.id, doctor_name: D.name, role: 'clinic' });
  await ins({ period: 1, clinic_number: 0, doctor_id: E.id, doctor_name: E.name, role: 'delegator' });
  await ins({ period: 2, clinic_number: 0, doctor_id: E.id, doctor_name: E.name, role: 'delegator' });
  await ins({ period: 0, clinic_number: 1, doctor_id: F.id, doctor_name: F.name, role: 'clinic', status: 'extra' });
}
async function triggerWorldChange(E: any, shadowId?: string) {
  await requestsV2.setScheduleStatus({ id: E.id, role: 'team_leader' } as any, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: E.id, doctorName: E.name, status: 'permission_start', shift: 'morning' } as any);
  const rows = await dayRows();
  const R = [...new Set(rows.filter((r) => r.status === 'active' && r.role === 'delegator' && [1, 2].includes(r.period) && r.doctor_id !== shadowId).map((r) => r.doctor_id))][0];
  const sh = await import('../lib/algorithms/solver_shadow');
  await requestsV2.setScheduleStatus({ id: R, role: 'team_leader' } as any, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: R, doctorName: rows.find((r) => r.doctor_id === R)?.doctor_name, status: 'sick_leave', shift: 'morning' } as any);
  await withXdayJournal(CID, WEEK, { day: DAY, doctorId: R }, async () => {
    const c = await sh.applyCoverage({ clinicId: CID, weekStart: WEEK, label: 'w2' });
    await sh.applyReserveRepay({ clinicId: CID, weekStart: WEEK, label: 'w2' }, sh.reservePairsFromMoves(c.moves));
    await sh.applyNewHeartRebalance({ clinicId: CID, weekStart: WEEK, label: 'w2' });
  });
  return R;
}

async function main() {
  const { data: origS } = await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID);
  const origCC = (origS && origS[0]?.clinic_count) ?? 3;
  try {
    await supabase.from('schedule_settings').update({ clinic_count: 3 }).eq('clinic_id', CID);
    const { data: ld } = await loadScheduleData(CID, WEEK);
    const docs = (ld?.doctors ?? []) as any[];
    const pool = docs.filter((d) => d.workStatus === 'active' && d.groupTemplate?.key !== 'board');
    if (pool.length < 6) { console.log('عاديّون < ٦ — لا مشهد.'); process.exit(1); }

    // ══════ السيناريو أ: مضيفٌ كامل، بلا ظلّ ══════
    console.log('\n══════ أ) الحالة #2 بلا ظلّ: applyReturn يستردّ، العجلةُ القديمة تتقاعد ══════');
    {
      const [A, B, C, D, E, F] = pool;
      await buildCase2(E, A, B, C, D, F);
      const R = await triggerWorldChange(E);
      const { res, wheelFired } = await cancelWired(E.id);
      const rows = await dayRows(); const act = actOf(rows);
      check('أ: الحالةُ #2 فعلًا (permSwapRecompute لم يُمرَّر للعجلة)', !res.permSwapRecompute && !!res.permSwapReverted, JSON.stringify({ rec: res.permSwapRecompute, rev: res.permSwapReverted }));
      check('أ: العجلةُ القديمة لم تشتعل', !wheelFired);
      const eDel = act.filter((r) => r.doctor_id === E.id && r.role === 'delegator').map((r) => r.period).sort();
      check('أ: E استردّ الاستضافة (دل ف١+ف٢)', eDel.length === 2 && eDel[0] === 1 && eDel[1] === 2, locOf(rows, E.id));
      let staffed = true; const empt: string[] = [];
      for (const c of [1, 2, 3]) for (const p of [1, 2]) if (!act.some((r) => r.role === 'clinic' && r.clinic_number === c && r.period === p)) { staffed = false; empt.push(`ع${c}ف${p}`); }
      check('أ: كلُّ العيادات مأهولة ف١+ف٢', staffed, empt.join('،'));
      let noDbl = true; for (const p of [1, 2]) { const ids = act.filter((r) => r.period === p).map((r) => r.doctor_id); if (ids.length !== new Set(ids).size) noDbl = false; }
      check('أ: لا ازدواجَ دورٍ في الفترة', noDbl);
      const scene = new Set([A.id, B.id, C.id, D.id, E.id, F.id]);
      check('أ: لا إقحامَ أطبّاءَ من خارج المشهد (لا إعادةُ بناءٍ بالعجلة)', [...new Set(act.map((r) => r.doctor_id))].every((id) => scene.has(id)), [...new Set(act.map((r) => r.doctor_id))].filter((id) => !scene.has(id)).map(sx).join('،'));
      check('أ: R ما زال مريضًا', rows.some((r) => r.doctor_id === R && r.period === 0 && r.status === 'sick_leave'));
    }

    // ══════ السيناريو ب: مضيفٌ كامل له ظلُّ متدرّب ══════
    console.log('\n══════ ب) الحالة #2 + ظلٌّ: الظلُّ يلاصق العائدَ للاستضافة ══════');
    const trainee = docs.find((d) => d.workStatus === 'trainee' && d.supervisorDoctorId && pool.some((p) => p.id === d.supervisorDoctorId));
    if (!trainee) { console.log('  (لا متدرّبَ بمشرفٍ نشط — تخطّي السيناريو ب)'); }
    else {
      const E = docs.find((d) => d.id === trainee.supervisorDoctorId)!;
      const rest = pool.filter((d) => d.id !== E.id);
      const [A, B, C, D, F] = rest;
      await buildCase2(E, A, B, C, D, F);
      // الظلّ يطابق مشرفه (مضيفًا) — full-mirror
      await ins({ period: 1, clinic_number: 0, doctor_id: trainee.id, doctor_name: trainee.name, role: 'delegator' });
      await ins({ period: 2, clinic_number: 0, doctor_id: trainee.id, doctor_name: trainee.name, role: 'delegator' });
      await triggerWorldChange(E, trainee.id);
      const { res, wheelFired } = await cancelWired(E.id);
      const rows = await dayRows();
      check('ب: العجلةُ القديمة لم تشتعل', !wheelFired, JSON.stringify({ rec: res.permSwapRecompute }));
      const eLoc = locOf(rows, E.id); const shLoc = locOf(rows, trainee.id);
      check('ب: E استردّ الاستضافة', eLoc === 'دلف1,دلف2', eLoc);
      check('ب: الظلُّ يلاصق العائدَ في الاستضافة', shLoc === eLoc, `E=${eLoc} ظلّ=${shLoc}`);
    }

    console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
    if (fails.length) { console.log('الإخفاقات:'); fails.forEach((f) => console.log('  • ' + f)); }
  } finally {
    await clean();
    await supabase.from('schedule_settings').update({ clinic_count: origCC }).eq('clinic_id', CID);
  }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); supabase.from('schedule_settings').update({ clinic_count: 3 }).eq('clinic_id', CID).then(() => process.exit(1)); });
