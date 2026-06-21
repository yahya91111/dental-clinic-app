/* #٤: مضيفٌ متفرّغ (دليقيتر ف١+ف٢) يغيب مرضيًّا → تُقسَّم استضافتُه على مُغطّيَيْن R1/R2،
 * ثمّ يكنسل → يجب أن يعود مُستضيفًا للفترتين، ويعود R1/R2 احتياطًا. (قبل الإصلاح: تعذّر.)
 *   set -a; . ./.env; set +a; npx tsx scripts/test-split-delegator-return.ts */
import { supabase } from '../lib/supabase';
import { requestsV2, withXdayJournal } from '../lib/algorithms/requests_v2';
import { loadScheduleData } from '../lib/algorithms/schedule';
import { applyCoverage, applyReserveRepay, applyNewHeartRebalance, reservePairsFromMoves } from '../lib/algorithms/solver_shadow';
import { dispatchRequestToolV2, FINAL_MARK } from '../lib/ai_v2/tools_requests_v2';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-08-02';
const DAY = 'thursday';
let pass = 0; let fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' — ' + d); } };
async function rowsOf(day: string) { const { data } = await supabase.from('schedule_slots').select('id,doctor_id,doctor_name,period,clinic_number,role,status').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', day); return (data || []) as any[]; }
async function ins(day: string, row: any) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: day, source: 'request', status: 'active', ...row }); }
async function clean() { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK); }
const fn = (s: string) => s.split(' ')[0];
const show = (rows: any[]) => rows.filter((r) => r.status === 'active' && r.period > 0).map((r) => `${fn(r.doctor_name)}:${r.role[0]}p${r.period}`).concat(rows.filter((r) => r.status === 'extra').map((r) => `${fn(r.doctor_name)}:EX`)).join('  ');

async function main() {
  const { data } = await loadScheduleData(CID, WEEK);
  const roster = (data?.doctors ?? []).filter((d: any) => d.groupTemplate?.key !== 'board' && d.workStatus === 'active').map((d: any) => ({ id: d.id, name: d.name }));
  if (roster.length < 7) { console.log(`بِركةٌ صغيرة (${roster.length})`); process.exit(1); }
  const [H, A, B, C, D, R1, R2] = roster;

  await clean();
  // مضيفٌ متفرّغ H (دليقيتر الفترتين) + عيادتان (زوجان) + احتياطيّان صباحيّان.
  await ins(DAY, { period: 1, clinic_number: 0, doctor_id: H.id, doctor_name: H.name, role: 'delegator' });
  await ins(DAY, { period: 2, clinic_number: 0, doctor_id: H.id, doctor_name: H.name, role: 'delegator' });
  await ins(DAY, { period: 1, clinic_number: 1, doctor_id: A.id, doctor_name: A.name, role: 'clinic' });
  await ins(DAY, { period: 2, clinic_number: 1, doctor_id: B.id, doctor_name: B.name, role: 'clinic' });
  await ins(DAY, { period: 1, clinic_number: 2, doctor_id: C.id, doctor_name: C.name, role: 'clinic' });
  await ins(DAY, { period: 2, clinic_number: 2, doctor_id: D.id, doctor_name: D.name, role: 'clinic' });
  await ins(DAY, { period: 0, clinic_number: 1, doctor_id: R1.id, doctor_name: R1.name, role: 'clinic', status: 'extra' });
  await ins(DAY, { period: 0, clinic_number: 1, doctor_id: R2.id, doctor_name: R2.name, role: 'clinic', status: 'extra' });

  console.log(`H=${fn(H.name)} مضيفٌ متفرّغ | احتياط: ${fn(R1.name)},${fn(R2.name)}`);
  console.log('  قبل:', show(await rowsOf(DAY)));

  // غياب H مرضيًّا عبر مسار الأداة (تغطية → تُقسَّم الاستضافة).
  await requestsV2.setScheduleStatus({ id: H.id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: DAY as any, doctorId: H.id, doctorName: H.name, status: 'sick_leave', shift: 'morning' } as any);
  await withXdayJournal(CID, WEEK, { day: DAY, doctorId: H.id }, async () => {
    const c = await applyCoverage({ clinicId: CID, weekStart: WEEK, label: 'مرضية' });
    await applyReserveRepay({ clinicId: CID, weekStart: WEEK, label: 'مرضية' }, reservePairsFromMoves(c.moves));
    await applyNewHeartRebalance({ clinicId: CID, weekStart: WEEK, label: 'مرضية' });
  });
  const mid = await rowsOf(DAY);
  console.log('  بعد الغياب:', show(mid));
  const hosts = [...new Set(mid.filter((r) => r.status === 'active' && r.role === 'delegator').map((r) => r.doctor_id))];
  const split = hosts.length >= 2 && !hosts.includes(H.id);
  check('الاستضافةُ قُسِّمت على مُغطّيَيْن (تهيئةُ الحالة)', split, `المستضيفون: ${hosts.map((id) => fn((roster.find((x) => x.id === id) || { name: id }).name)).join(',')}`);

  // كنسل عبر مسار الأداة الحيّ.
  const idx = roster.findIndex((x) => x.id === H.id) + 1;
  const ctx: any = { clinicId: CID, user: { id: H.id, name: H.name, role: 'team_leader' }, roster };
  const raw = await dispatchRequestToolV2('cancel_schedule_status', { weekStart: WEEK, day: DAY, doctorIndex: idx }, ctx);
  console.log('  كنسل → ' + raw.replace(FINAL_MARK, '').slice(0, 80));
  const after = await rowsOf(DAY);
  console.log('  بعد الكنسل:', show(after));

  const hP1 = after.find((r) => r.status === 'active' && r.role === 'delegator' && r.period === 1);
  const hP2 = after.find((r) => r.status === 'active' && r.role === 'delegator' && r.period === 2);
  check('H عاد مُستضيفًا للفترتين', !!hP1 && hP1.doctor_id === H.id && !!hP2 && hP2.doctor_id === H.id,
    `ف١=${hP1 ? fn(hP1.doctor_name) : '—'} ف٢=${hP2 ? fn(hP2.doctor_name) : '—'}`);
  check('R1 و R2 عادا احتياطًا', after.filter((r) => r.status === 'extra' && (r.doctor_id === R1.id || r.doctor_id === R2.id)).length === 2,
    `احتياط: ${after.filter((r) => r.status === 'extra').map((r) => fn(r.doctor_name)).join(',')}`);
  check('لا ازدواجَ استضافةٍ (مستضيفٌ واحدٌ لكلّ فترة)', after.filter((r) => r.status === 'active' && r.role === 'delegator' && r.period === 1).length === 1 && after.filter((r) => r.status === 'active' && r.role === 'delegator' && r.period === 2).length === 1, '');

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  await clean();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
