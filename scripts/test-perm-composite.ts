/* مركّبٌ نفس-اليوم (سيناريو «مزيج ج» العدائيّ الذي كسر في المختبر):
 *   ① استئذانُ مضيفٍ متفرّغ يُرقّي المرشّحَ P مضيفًا (تبديلٌ كامل).
 *   ② ثمّ P **نفسه** يغيب (مرضيّة) → تغطيةٌ تلقائيّة.
 * الثابتُ الحرج: الغائبُ P لا يبقى في أيّ خانةٍ نشطة (لا مضيفًا ولا عيادة)، ولا حجزَ
 * مزدوج، والمستأذِنُ خارج فترته المحجوبة. نمرّ بالمسار الحيّ كاملًا (تغطية القلب الجديد).
 *   set -a; . ./.env; set +a; npx tsx scripts/test-perm-composite.ts */
import { supabase } from '../lib/supabase';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { getAllGroupMembers } from '../lib/database';
import { applyCoverage, applyNewHeartRebalance } from '../lib/algorithms/solver_shadow';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
const DAY = 'monday';
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };
async function dayRows() { const { data } = await supabase.from('schedule_slots').select('id,doctor_id,doctor_name,period,clinic_number,role,status,source').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', DAY); return (data || []) as any[]; }
const actAny = (rows: any[], id: string) => rows.filter((r) => r.doctor_id === id && r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'));
async function ins(row: any) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: DAY, status: 'active', source: 'request', ...row }); }
async function cleanDay() { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', DAY); }

async function main() {
  const { data: members } = await getAllGroupMembers(CID);
  const roster = ((members || []) as any[])
    .filter((m) => (m.work_status ?? 'active') === 'active' && m.group_template_key !== 'board')
    .map((m) => ({ id: m.doctor_id, name: m.doctor_name }));
  if (roster.length < 6) { console.log(`روستر نشطٌ صغير (${roster.length}) — يلزم ٦`); process.exit(1); }
  const [H, P, A, B, R1, R2] = roster;

  // H مضيفٌ متفرّغ، P مرشّحٌ ف٢ حرٌّ في ف١، عيادتان، واحتياطيّان لتغطية استضافة P حين يغيب.
  await cleanDay();
  await ins({ period: 1, clinic_number: 0, doctor_id: H.id, doctor_name: H.name, role: 'delegator' });
  await ins({ period: 2, clinic_number: 0, doctor_id: H.id, doctor_name: H.name, role: 'delegator' });
  await ins({ period: 2, clinic_number: 1, doctor_id: P.id, doctor_name: P.name, role: 'clinic' });
  await ins({ period: 1, clinic_number: 1, doctor_id: A.id, doctor_name: A.name, role: 'clinic' });
  await ins({ period: 1, clinic_number: 2, doctor_id: B.id, doctor_name: B.name, role: 'clinic' });
  await ins({ period: 2, clinic_number: 2, doctor_id: B.id, doctor_name: B.name, role: 'clinic' });
  await ins({ period: 0, clinic_number: 1, doctor_id: R1.id, doctor_name: R1.name, role: 'clinic', status: 'extra' });
  await ins({ period: 0, clinic_number: 1, doctor_id: R2.id, doctor_name: R2.name, role: 'clinic', status: 'extra' });

  console.log('====== ① استئذان المضيف المتفرّغ H (يُرقّي P مضيفًا) ======');
  await requestsV2.setScheduleStatus({ id: H.id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: DAY as any, doctorId: H.id, doctorName: H.name, status: 'permission_start', shift: 'morning' } as any);
  let rows = await dayRows();
  const pBecameHost = rows.some((r) => r.doctor_id === P.id && r.role === 'delegator' && r.status === 'active');
  check('P صار مضيفًا بعد الاستئذان', pBecameHost, rows.filter((r) => r.doctor_id === P.id && r.status === 'active').map((r) => `${r.role}p${r.period}`).join(','));

  console.log('\n====== ② P (المضيف الجديد) يغيب مرضيًّا + تغطية القلب الجديد ======');
  await requestsV2.setScheduleStatus({ id: P.id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: DAY as any, doctorId: P.id, doctorName: P.name, status: 'sick_leave', shift: 'morning' } as any);
  await applyCoverage({ clinicId: CID, weekStart: WEEK, label: 'composite' });
  await applyNewHeartRebalance({ clinicId: CID, weekStart: WEEK, label: 'composite' });
  rows = await dayRows();
  console.log('  الحالة النهائيّة:', rows.filter((r) => r.status === 'active' && (r.role === 'clinic' || r.role === 'delegator')).map((r) => `${r.doctor_name.split(' ')[0]}:${r.role[0]}p${r.period}c${r.clinic_number}`).join('  '));

  // ── الثوابت الحرجة ──
  check('الغائب P ليس في أيّ خانةٍ نشطة (لا مضيفًا ولا عيادة)', actAny(rows, P.id).length === 0, JSON.stringify(actAny(rows, P.id)));
  check('المستأذِن H خارج فترته المحجوبة ف١', !actAny(rows, H.id).some((r) => r.period === 1), JSON.stringify(actAny(rows, H.id)));
  for (const p of [1, 2]) {
    const seen = new Map<string, number>();
    for (const r of rows.filter((x) => x.status === 'active' && x.period === p && (x.role === 'clinic' || x.role === 'delegator'))) seen.set(r.doctor_id, (seen.get(r.doctor_id) || 0) + 1);
    check(`لا حجز مزدوج ف${p}`, ![...seen.values()].some((v) => v > 1), [...seen.entries()].filter((e) => e[1] > 1).map((e) => e[0]).join(','));
    // لا عيادة مزدحمة (أكثر من طبيبٍ في نفس العيادة/الفترة)
    const cl = new Map<number, number>();
    for (const r of rows.filter((x) => x.status === 'active' && x.role === 'clinic' && x.period === p && x.clinic_number > 0)) cl.set(r.clinic_number, (cl.get(r.clinic_number) || 0) + 1);
    check(`لا عيادة مزدحمة ف${p}`, ![...cl.values()].some((v) => v > 1), '');
  }
  // معلومة: هل بقيت الاستضافة مُغطّاة؟ (طريّ — قد تسقط فترةٌ عند ضيق الاحتياط)
  const hostedP = new Set(rows.filter((r) => r.role === 'delegator' && r.status === 'active').map((r) => r.period));
  console.log(`  استضافةٌ مُغطّاة في الفترات: ${[...hostedP].sort().join(',') || '(لا شيء)'}`);

  console.log(`\n====== النتيجة: ${pass} PASS / ${fail} FAIL ======`);
  if (fails.length) { console.log('الإخفاقات:'); fails.forEach((f) => console.log('  • ' + f)); }
  await cleanDay();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
