/* عزلُ الشفت في سداد الاحتياط: نقصُ الصباح يُسدَّد من احتياط **الصباح** فقط — لا يأخذ
 * احتياط المساء. حالةٌ سالبة: غيابٌ صباحيٌّ يُغطّيه احتياطيٌّ صباحيّ R، والغائب A له
 * احتياطٌ **مسائيٌّ** فقط في الأيّام التالية → يجب ألّا يُستهلَك (لا سداد عبر الشفتين = خيار ج).
 *   set -a; . ./.env; set +a; npx tsx scripts/test-reserve-shift-isolation.ts */
import { supabase } from '../lib/supabase';
import { requestsV2, withXdayJournal } from '../lib/algorithms/requests_v2';
import { loadScheduleData } from '../lib/algorithms/schedule';
import { applyCoverage, applyReserveRepay, applyNewHeartRebalance, reservePairsFromMoves } from '../lib/algorithms/solver_shadow';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-06-07';
let pass = 0; let fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' — ' + d); } };
async function rowsOf(day: string) { const { data } = await supabase.from('schedule_slots').select('id,doctor_id,doctor_name,period,clinic_number,role,status').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', day); return (data || []) as any[]; }
async function ins(day: string, row: any) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: day, source: 'request', ...row }); }
async function clean() { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK); }

async function main() {
  const { data } = await loadScheduleData(CID, WEEK);
  const roster = (data?.doctors ?? []).filter((d: any) => d.groupTemplate?.key !== 'board' && d.workStatus === 'active').map((d: any) => ({ id: d.id, name: d.name }));
  if (roster.length < 3) { console.log('بِركةٌ صغيرة'); process.exit(1); }
  const [A, B, R] = roster;

  await clean();
  // الأحد صباحًا: عيادة١ = A(ف١)+B(ف٢)، و R احتياطيٌّ **صباحيّ** (ع١).
  await ins('sunday', { period: 1, clinic_number: 1, doctor_id: A.id, doctor_name: A.name, role: 'clinic', status: 'active' });
  await ins('sunday', { period: 2, clinic_number: 1, doctor_id: B.id, doctor_name: B.name, role: 'clinic', status: 'active' });
  await ins('sunday', { period: 0, clinic_number: 1, doctor_id: R.id, doctor_name: R.name, role: 'clinic', status: 'extra' });
  // الإثنين: R يعمل عيادةً **صباحيّة** (ف١)، و A احتياطيٌّ **مسائيّ** فقط (ع٢) — شفتٌ آخر.
  await ins('monday', { period: 1, clinic_number: 1, doctor_id: R.id, doctor_name: R.name, role: 'clinic', status: 'active' });
  await ins('monday', { period: 2, clinic_number: 1, doctor_id: B.id, doctor_name: B.name, role: 'clinic', status: 'active' });
  await ins('monday', { period: 0, clinic_number: 2, doctor_id: A.id, doctor_name: A.name, role: 'clinic', status: 'extra' }); // احتياط مساء (ع٢)

  // غياب A صباح الأحد → R (صباحيّ) يُغطّي. السداد يجب أن يبحث عن احتياط A **الصباحيّ** (ع١).
  await requestsV2.setScheduleStatus({ id: A.id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: 'sunday' as any, doctorId: A.id, doctorName: A.name, status: 'sick_leave', shift: 'morning' } as any);
  await withXdayJournal(CID, WEEK, { day: 'sunday', doctorId: A.id }, async () => {
    const c = await applyCoverage({ clinicId: CID, weekStart: WEEK, label: 'مرضية' });
    await applyReserveRepay({ clinicId: CID, weekStart: WEEK, label: 'مرضية' }, reservePairsFromMoves(c.moves));
    await applyNewHeartRebalance({ clinicId: CID, weekStart: WEEK, label: 'مرضية' });
  });

  const mon = await rowsOf('monday');
  const aEveReserve = mon.find((r) => r.doctor_id === A.id && r.status === 'extra' && r.period === 0 && r.clinic_number === 2);
  const rStillClinic = mon.find((r) => r.doctor_id === R.id && r.status === 'active' && r.role === 'clinic' && r.period === 1);
  const aTookMorning = mon.some((r) => r.doctor_id === A.id && r.status === 'active' && r.period === 1);
  console.log('  الإثنين:', mon.filter((r) => r.period > 0 || r.status === 'extra').map((r) => `${r.doctor_name.split(' ')[0]}:${r.role[0]}${r.status[0]}p${r.period}c${r.clinic_number}`).join('  '));

  check('احتياطُ A المسائيّ (ع٢) لم يُستهلَك — لا سداد عبر الشفتين', !!aEveReserve, 'استُهلِك احتياط المساء في سداد الصباح!');
  check('R ما زال يعمل عيادة الإثنين الصباحيّة (لم يُسدَّد له من شفتٍ آخر)', !!rStillClinic, 'R تغيّر عبر شفت');
  check('A لم يأخذ عيادةً صباحيّةً على الإثنين (لا نافذةَ سدادٍ صباحيّة)', !aTookMorning, 'A أخذ عيادةً عبر شفت');

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  await clean();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
