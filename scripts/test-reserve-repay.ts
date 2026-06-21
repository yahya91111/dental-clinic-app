/* محور سداد الاحتياط داخل الأسبوع: غيابٌ يوم الأحد يُغطّيه احتياطيٌّ R (يخسر راحته)،
 * فيُسدَّد له يوم الإثنين (أماميّ): R يرتاح، والغائب A يعمل مقعد R. ثمّ كنسلٌ يعكس الكلّ.
 *   set -a; . ./.env; set +a; npx tsx scripts/test-reserve-repay.ts */
import { supabase } from '../lib/supabase';
import { requestsV2, withXdayJournal } from '../lib/algorithms/requests_v2';
import { loadScheduleData } from '../lib/algorithms/schedule';
import { applyCoverage, applyReserveRepay, applyNewHeartRebalance, reservePairsFromMoves } from '../lib/algorithms/solver_shadow';
import { dispatchRequestToolV2, FINAL_MARK } from '../lib/ai_v2/tools_requests_v2';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-05-03';
let pass = 0; let fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' — ' + d); } };
async function rowsOf(day: string) { const { data } = await supabase.from('schedule_slots').select('id,doctor_id,doctor_name,period,clinic_number,role,status').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', day); return (data || []) as any[]; }
async function ins(day: string, row: any) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: day, source: 'request', ...row }); }
async function clean() { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK); }
const fn = (s: string) => s.split(' ')[0];
const show = (rows: any[]) => rows.filter((r) => r.status === 'active' && r.period > 0).map((r) => `${fn(r.doctor_name)}:${r.role[0]}p${r.period}c${r.clinic_number}`).concat(rows.filter((r) => r.status === 'extra').map((r) => `${fn(r.doctor_name)}:EX`)).join('  ');

async function main() {
  const { data } = await loadScheduleData(CID, WEEK);
  const roster = (data?.doctors ?? []).filter((d: any) => d.groupTemplate?.key !== 'board' && d.workStatus === 'active').map((d: any) => ({ id: d.id, name: d.name }));
  if (roster.length < 3) { console.log('بِركةٌ صغيرة'); process.exit(1); }
  const [A, B, R] = roster;

  await clean();
  // الأحد: عيادة١ = A(ف١)+B(ف٢)، و R احتياطيّ صباحيّ.
  await ins('sunday', { period: 1, clinic_number: 1, doctor_id: A.id, doctor_name: A.name, role: 'clinic', status: 'active' });
  await ins('sunday', { period: 2, clinic_number: 1, doctor_id: B.id, doctor_name: B.name, role: 'clinic', status: 'active' });
  await ins('sunday', { period: 0, clinic_number: 1, doctor_id: R.id, doctor_name: R.name, role: 'clinic', status: 'extra' });
  // الإثنين: عيادة١ = R(ف١)+B(ف٢)، و A احتياطيّ صباحيّ (هنا يُسدَّد لـR).
  await ins('monday', { period: 1, clinic_number: 1, doctor_id: R.id, doctor_name: R.name, role: 'clinic', status: 'active' });
  await ins('monday', { period: 2, clinic_number: 1, doctor_id: B.id, doctor_name: B.name, role: 'clinic', status: 'active' });
  await ins('monday', { period: 0, clinic_number: 1, doctor_id: A.id, doctor_name: A.name, role: 'clinic', status: 'extra' });

  console.log(`A=${fn(A.name)} (غائب الأحد) · B=${fn(B.name)} · R=${fn(R.name)} (يُغطّي الأحد)`);
  console.log('  الأحد قبل:', show(await rowsOf('sunday')));
  console.log('  الإثنين قبل:', show(await rowsOf('monday')));

  // ① غياب A يوم الأحد عبر مسار الأداة (تغطية+سداد+امتصاص، ملفوفٌ بيوميّات الأثر البعيد).
  await requestsV2.setScheduleStatus({ id: A.id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: 'sunday' as any, doctorId: A.id, doctorName: A.name, status: 'sick_leave', shift: 'morning' } as any);
  await withXdayJournal(CID, WEEK, { day: 'sunday', doctorId: A.id }, async () => {
    const c = await applyCoverage({ clinicId: CID, weekStart: WEEK, label: 'مرضية' });
    await applyReserveRepay({ clinicId: CID, weekStart: WEEK, label: 'مرضية' }, reservePairsFromMoves(c.moves));
    await applyNewHeartRebalance({ clinicId: CID, weekStart: WEEK, label: 'مرضية' });
  });
  const sun1 = await rowsOf('sunday'); const mon1 = await rowsOf('monday');
  console.log('  الأحد بعد:', show(sun1));
  console.log('  الإثنين بعد:', show(mon1));

  // الأحد: R غطّى مقعد A (ف١ ع١) وA غائب.
  const isReal = (r: any) => r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator');
  check('الأحد: R غطّى مقعد A (ف١ ع١)', sun1.some((r) => r.doctor_id === R.id && isReal(r) && r.period === 1 && r.clinic_number === 1), 'R لم يُغطِّ');
  check('الأحد: A ليس في خانةٍ نشطة (غائب)', !sun1.some((r) => r.doctor_id === A.id && isReal(r)), 'A ما زال نشطًا');
  // الإثنين (السداد الأماميّ): A يعمل مقعد R (ف١ ع١)، وR صار يرتاح (EX).
  check('الإثنين: A يعمل مقعد R (ف١ ع١) — سدادٌ أماميّ', mon1.some((r) => r.doctor_id === A.id && r.status === 'active' && r.period === 1 && r.clinic_number === 1), 'A لم يأخذ مقعد R');
  check('الإثنين: R صار يرتاح (احتياط)', mon1.some((r) => r.doctor_id === R.id && r.status === 'extra'), 'R لم يسترِدّ راحته');

  // خيار (أ) — لا عقوبة مزدوجة: بعد السداد A تخلّى عن احتياطه (0 صفوف extra)، وR ناله
  // (1 صفّ extra). فعجلةُ الاحتياط (replayExWheel) تدفع كلًّا للمؤخّرة مرّةً واحدة: A
  // للغياب، R للاحتياط — تمامًا كأسبوعٍ عاديّ. فلا يُعاقَب A مرّتين.
  const weekRows = [...(await rowsOf('sunday')), ...(await rowsOf('monday'))];
  const exCount = (id: string) => weekRows.filter((r) => r.doctor_id === id && r.status === 'extra' && r.period === 0).length;
  check('خيار أ: A تخلّى عن احتياطه (0 extra) — يُدفَع للمؤخّرة للغياب فقط', exCount(A.id) === 0, `A لديه ${exCount(A.id)} احتياط`);
  check('خيار أ: R ناله الاحتياط (1 extra) — استردّ راحته', exCount(R.id) === 1, `R لديه ${exCount(R.id)} احتياط`);

  // ② كنسل غياب A → يعود الكلّ للأساس (R احتياط الأحد، R يعمل/A يرتاح الإثنين).
  const idx = roster.findIndex((x) => x.id === A.id) + 1;
  const ctx: any = { clinicId: CID, user: { id: A.id, name: A.name, role: 'team_leader' }, roster };
  const raw = await dispatchRequestToolV2('cancel_schedule_status', { weekStart: WEEK, day: 'sunday', doctorIndex: idx }, ctx);
  console.log('  كنسل → ' + raw.replace(FINAL_MARK, '').slice(0, 70));
  const sun2 = await rowsOf('sunday'); const mon2 = await rowsOf('monday');
  console.log('  الأحد بعد الكنسل:', show(sun2));
  console.log('  الإثنين بعد الكنسل:', show(mon2));
  const id4 = (s: string) => s.slice(-4);
  console.log(`  [تشخيص] A=${id4(A.id)} R=${id4(R.id)} | الإثنين خام:`, mon2.map((r) => `${id4(r.doctor_id)}:${r.role[0]}${r.status[0]}p${r.period}`).join(' '));
  check('كنسل: الإثنين عاد (R يعمل ف١ع١، A يرتاح)', mon2.some((r) => r.doctor_id === R.id && r.status === 'active' && r.period === 1 && r.clinic_number === 1) && mon2.some((r) => r.doctor_id === A.id && r.status === 'extra'), 'الإثنين لم يعُد للأساس');

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  await clean();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
