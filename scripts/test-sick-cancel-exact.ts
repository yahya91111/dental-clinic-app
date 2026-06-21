/* تطابقُ كنسل المرضيّة في يومها عبر أعدادِ عياداتٍ مختلفة — خاصّةً ٥ (استنفادُ الاحتياط
 * → انفرادُ شريك، حيث كانت الثغرة ستعود). نبني، نُغيّب طبيبَ عيادةٍ مرضيًّا، نُغطّي (بيوميّات)،
 * نكنسل، ونقارن الأسبوعَ كلَّه حرفيًّا.  set -a; . ./.env; set +a; npx tsx scripts/test-sick-cancel-exact.ts */
import { supabase } from '../lib/supabase';
import { requestsV2, withXdayJournal } from '../lib/algorithms/requests_v2';
import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-11-01';
const DAY = 'wednesday';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
let pass = 0; let fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' — ' + d); } };

async function allRows() { const { data } = await supabase.from('schedule_slots').select('doctor_id,period,clinic_number,role,status,day_of_week').eq('clinic_id', CID).eq('week_start', W); return (data || []) as any[]; }
const sig = (rs: any[]) => rs.filter((r) => (r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator')) || (r.status === 'extra' && r.period === 0)).map((r) => `${r.day_of_week}|${r.status}|${r.role}|p${r.period}|c${r.clinic_number}|${r.doctor_id}`).sort().join('\n');
const sigDay = (rs: any[], d: string) => sig(rs.filter((r) => r.day_of_week === d));
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
async function coverJournaled(cause: { day: string; doctorId: string }) {
  const sh = await import('../lib/algorithms/solver_shadow');
  await withXdayJournal(CID, W, cause, async () => {
    const c = await sh.applyCoverage({ clinicId: CID, weekStart: W, label: 'exact' });
    await sh.applyReserveRepay({ clinicId: CID, weekStart: W, label: 'exact' }, sh.reservePairsFromMoves(c.moves));
    await sh.applyNewHeartRebalance({ clinicId: CID, weekStart: W, label: 'exact' });
  });
}
async function cancelDirect(doc: any) {
  let rs: Shift | null = null;
  try { rs = await schedule.placementShift({ clinicId: CID, weekStart: W, day: DAY as any, doctorId: doc.id }); } catch { /* */ }
  const res: any = await requestsV2.cancelStatus({ id: doc.id, role: 'team_leader' }, { clinicId: CID, weekStart: W, day: DAY as any, doctorId: doc.id, restoreToPrevPlace: true });
  if ((res.covered || res.permSwapRecompute) && rs) await schedule.redistributeOnReturn({ clinicId: CID, weekStart: W, day: DAY as any, shift: rs }).catch(() => {});
  if (rs && (res.restored || res.covered)) await schedule.rebalanceForward({ clinicId: CID, weekStart: W, fromDay: DAY as any, fromShift: rs, today: W } as any).catch(() => {});
  return res;
}

async function main() {
  const { data: orig } = await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID);
  const origCC = (orig && orig[0]?.clinic_count) ?? 2;
  const fn = (s: string) => s?.split(' ')[0];
  try {
    for (const cc of [3, 4, 5]) {
      await setCC(cc); await build();
      const before = await allRows();
      const { data } = await loadScheduleData(CID, W);
      const doctors = data?.doctors ?? [];
      const trainee = new Set(doctors.filter((d: any) => d.workStatus === 'trainee').map((d: any) => d.id));
      // طبيبُ عيادةٍ يوم الأربعاء (لا متدرّب، لا بورد).
      const clinicRow = before.find((r) => r.day_of_week === DAY && r.status === 'active' && r.role === 'clinic' && r.period > 0 && r.clinic_number > 0 && !trainee.has(r.doctor_id));
      if (!clinicRow) { console.log(`▸ ${cc} عيادات: لا طبيبَ عيادةٍ يوم الأربعاء — تخطّي`); continue; }
      const doc = (doctors as any[]).find((d) => d.id === clinicRow.doctor_id)!;
      const reserves = before.filter((r) => r.day_of_week === DAY && r.status === 'extra').length;
      await setStatusSick(doc);
      await coverJournaled({ day: DAY, doctorId: doc.id });
      const covType = describeCover(await allRows(), doc, clinicRow, doctors);
      await cancelDirect(doc);
      const after = await allRows();
      const drift = DAYS.filter((d) => sigDay(before, d) !== sigDay(after, d));
      check(`${cc} عيادات (احتياط=${reserves}, تغطية=${covType}): كنسلُ مرضيّةِ ${fn(doc.name)} يعود حرفيًّا`, drift.length === 0, drift.length ? `أيّام منحرفة: ${drift.join('،')}` : '');
    }
  } finally {
    await setCC(origCC); await cleanWeek();
    console.log(`أُعيد clinic_count = ${origCC}.`);
  }
  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  process.exit(fail ? 1 : 0);
}

async function setStatusSick(doc: any) {
  await requestsV2.setScheduleStatus({ id: doc.id, role: 'team_leader' }, { clinicId: CID, weekStart: W, day: DAY as any, doctorId: doc.id, doctorName: doc.name, status: 'sick_leave', shift: 'morning' } as any);
}
function describeCover(rows: any[], doc: any, seat: any, doctors: any[]) {
  const occ = rows.find((r) => r.day_of_week === DAY && r.status === 'active' && r.role === 'clinic' && r.period === seat.period && r.clinic_number === seat.clinic_number && r.doctor_id !== doc.id);
  if (!occ) return 'لا أحد';
  const shiftPs = seat.period <= 2 ? [1, 2] : [3, 4];
  const other = rows.some((r) => r.doctor_id === occ.doctor_id && r.status === 'active' && shiftPs.includes(r.period) && (r.role === 'clinic' || r.role === 'delegator') && !(r.period === seat.period && r.clinic_number === seat.clinic_number));
  return other ? 'انفراد-شريك' : 'احتياطيّ-خالص';
}

main().catch((e) => { console.error('ERR', e.message, e.stack); supabase.from('schedule_settings').update({ clinic_count: 2 }).eq('clinic_id', CID).then(() => process.exit(1)); });
