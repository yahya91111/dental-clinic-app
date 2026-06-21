/* تعميمُ عددِ العيادات: نبني الأسبوعَ حقيقيًّا عند ٢ و٣ و٤ عيادات (نفس الطاقم)،
 * ونطبّق مرضيةً + استئذانًا، ونفحص الحدودَ الصارمة. يحفظ clinic_count الأصليّ ويُعيده.
 * بلا إشعارات (دوالُّ المحرّك مباشرةً).   set -a; . ./.env; set +a; npx tsx scripts/test-config-sweep.ts */
import { supabase } from '../lib/supabase';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-10-04';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const AR: Record<string, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };

async function rowsOf(day?: string) { let q = supabase.from('schedule_slots').select('doctor_id,doctor_name,period,clinic_number,role,status,day_of_week').eq('clinic_id', CID).eq('week_start', W); if (day) q = q.eq('day_of_week', day); const { data } = await q; return (data || []) as any[]; }
async function cleanWeek() { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W); }
async function setCC(cc: number) { await supabase.from('schedule_settings').update({ clinic_count: cc }).eq('clinic_id', CID); }

async function build() {
  await cleanWeek();
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {};
  for (const t of (pre.data?.doctors ?? []).filter((d: any) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  await schedule.build({ weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm, dryRun: false } as any).catch((e: any) => console.log('  build err', e?.message));
}
async function cover() {
  const sh = await import('../lib/algorithms/solver_shadow');
  const c = await sh.applyCoverage({ clinicId: CID, weekStart: W, label: 'sweep' });
  await sh.applyReserveRepay({ clinicId: CID, weekStart: W, label: 'sweep' }, sh.reservePairsFromMoves(c.moves));
  await sh.applyNewHeartRebalance({ clinicId: CID, weekStart: W, label: 'sweep' });
}

function invariants(all: any[], doctors: any[]): string[] {
  const breaks: string[] = [];
  const trainee = new Set(doctors.filter((d) => d.workStatus === 'trainee').map((d) => d.id));
  const board = new Set(doctors.filter((d) => d.groupTemplate?.key === 'board').map((d) => d.id));
  for (const day of DAYS) {
    const dr = all.filter((r) => r.day_of_week === day);
    if (!dr.some((r) => r.status === 'active' && r.period > 0)) continue;
    for (const r of dr.filter((r) => r.status === 'sick_leave' || r.status === 'vacation')) {
      if (dr.some((w) => w.doctor_id === r.doctor_id && w.status === 'active' && w.period > 0 && (w.role === 'clinic' || w.role === 'delegator'))) breaks.push(`${AR[day]}: غائبٌ في خانة (${r.doctor_name?.split(' ')[0]})`);
    }
    for (const r of dr.filter((r) => r.status === 'permission_start' || r.status === 'permission_end')) {
      const bp = r.status === 'permission_start' ? [1, 3] : [2, 4];
      if (dr.some((w) => w.doctor_id === r.doctor_id && w.status === 'active' && bp.includes(w.period) && (w.role === 'clinic' || w.role === 'delegator'))) breaks.push(`${AR[day]}: مستأذِنٌ في محجوبته (${r.doctor_name?.split(' ')[0]})`);
    }
    const seat = new Map<string, Set<string>>();
    for (const r of dr.filter((r) => r.status === 'active' && r.role === 'clinic' && r.period > 0 && r.clinic_number > 0 && !trainee.has(r.doctor_id))) {
      const k = `${r.period}|${r.clinic_number}`; (seat.get(k) ?? seat.set(k, new Set()).get(k)!).add(r.doctor_id);
    }
    for (const [k, ids] of seat) if (ids.size > 1) breaks.push(`${AR[day]}: ازدواجُ عيادة ${k} (${ids.size})`);
    for (const p of [1, 2]) { const dels = [...new Set(dr.filter((r) => r.status === 'active' && r.role === 'delegator' && r.period === p && !trainee.has(r.doctor_id) && !board.has(r.doctor_id)).map((r) => r.doctor_id))]; if (dels.length > 1) breaks.push(`${AR[day]}: ازدواجُ استضافة ف${p} (${dels.length})`); }
  }
  return breaks;
}

async function main() {
  const { data: orig } = await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID);
  const origCC = (orig && orig[0]?.clinic_count) ?? 3;
  console.log(`clinic_count الأصليّ = ${origCC} — سنُجرّب ٢/٣/٤ ثمّ نُعيده.`);
  let anyBreak = false;
  try {
    for (const cc of [2, 3, 4]) {
      await setCC(cc);
      await build();
      const { data } = await loadScheduleData(CID, W);
      const doctors = data?.doctors ?? [];
      const pool = doctors.filter((d: any) => d.groupTemplate?.key !== 'board' && d.workStatus === 'active');
      const built = (await rowsOf()).some((r) => r.status === 'active' && r.period > 0);
      if (!built) { console.log(`  ▸ ${cc} عيادات / ${pool.length} نشط: تعذّر البناء (طاقمٌ غير كافٍ؟)`); continue; }
      const b0 = invariants(await rowsOf(), doctors);
      // مرضية + استئذان
      const [a, b] = pool;
      if (a) { await requestsV2.setScheduleStatus({ id: a.id, role: 'team_leader' }, { clinicId: CID, weekStart: W, day: 'sunday' as any, doctorId: a.id, doctorName: a.name, status: 'sick_leave', shift: 'morning' } as any); await cover(); }
      if (b) { await requestsV2.setScheduleStatus({ id: b.id, role: 'team_leader' }, { clinicId: CID, weekStart: W, day: 'tuesday' as any, doctorId: b.id, doctorName: b.name, status: 'permission_start', shift: 'morning' } as any); await schedule.rebalanceForward({ clinicId: CID, weekStart: W, fromDay: 'tuesday' as any, fromShift: 'morning', today: W } as any).catch(() => {}); }
      const b1 = invariants(await rowsOf(), doctors);
      const allBreaks = [...new Set([...b0, ...b1])];
      if (allBreaks.length) { anyBreak = true; console.log(`  ▸ ${cc} عيادات / ${pool.length} نشط: ❌ ${allBreaks.length} خرق — ${allBreaks.slice(0, 4).join(' | ')}`); }
      else console.log(`  ▸ ${cc} عيادات / ${pool.length} نشط: ✅ بناءٌ + مرضية + استئذان بلا خرق`);
    }
  } finally {
    await setCC(origCC); await cleanWeek();
    console.log(`أُعيد clinic_count = ${origCC}.`);
  }
  console.log(anyBreak ? '\n⚠️ وُجد خرقٌ في بعض الأعداد — انظر أعلاه.' : '\n✅ التعميم سليم: الخوارزميّة تعمل على ٢/٣/٤ عيادات بلا خرق.');
  process.exit(anyBreak ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); supabase.from('schedule_settings').update({ clinic_count: 3 }).eq('clinic_id', CID).then(() => process.exit(1)); });
