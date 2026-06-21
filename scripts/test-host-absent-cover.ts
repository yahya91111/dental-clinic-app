/* هل تُرقّي تغطيةُ الغياب احتياطيًّا ليحلّ محلّ مضيفٍ غائب؟ (٨/٣ = ٢ن+٢ → غياب المضيف
 * يُبقي ٢ن+١، فما زال يلزم مضيف). نبني الحالة الواقعيّة باحتياطيٍّ **واحد** ونغيّب المضيف. */
import { supabase } from '../lib/supabase';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { loadScheduleData } from '../lib/algorithms/schedule';
import { applyCoverage, applyNewHeartRebalance } from '../lib/algorithms/solver_shadow';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
const DAY = 'thursday';
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };
async function dayRows() { const { data } = await supabase.from('schedule_slots').select('id,doctor_id,doctor_name,period,clinic_number,role,status').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', DAY); return (data || []) as any[]; }
async function ins(row: any) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: DAY, status: 'active', source: 'request', ...row }); }
async function cleanDay() { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', DAY); }

async function main() {
  // بِركةُ العمل كما يراها القلبُ الجديد بالضبط: غير بورد، نشط (هكذا يُحسب poolIds).
  const { data } = await loadScheduleData(CID, WEEK);
  const roster = (data?.doctors ?? [])
    .filter((d: any) => d.groupTemplate?.key !== 'board' && d.workStatus === 'active')
    .map((d: any) => ({ id: d.id, name: d.name }));
  if (roster.length < 8) { console.log(`بِركةٌ نشطةٌ صغيرة (${roster.length}) — يلزم ٨`); process.exit(1); }
  const [H, R, A, B, C, D, E, F] = roster; // H=مضيف، R=احتياطيّ واحد، الباقي ٣ أزواج

  // ٨/٣ واقعيّ: ٣ عيادات (زوجٌ يعمل الفترتين لكلٍّ) + مضيفٌ H (دليقيتر الفترتين) + احتياطيّ R.
  await cleanDay();
  await ins({ period: 1, clinic_number: 0, doctor_id: H.id, doctor_name: H.name, role: 'delegator' });
  await ins({ period: 2, clinic_number: 0, doctor_id: H.id, doctor_name: H.name, role: 'delegator' });
  await ins({ period: 0, clinic_number: 1, doctor_id: R.id, doctor_name: R.name, role: 'clinic', status: 'extra' });
  const pairs = [[A, B, 1], [C, D, 2], [E, F, 3]] as const;
  for (const [x, y, c] of pairs) { await ins({ period: 1, clinic_number: c, doctor_id: x.id, doctor_name: x.name, role: 'clinic' }); await ins({ period: 2, clinic_number: c, doctor_id: y.id, doctor_name: y.name, role: 'clinic' }); }

  console.log('====== غياب المضيف H (٨/٣ → يبقى ٢ن+١، يلزم مضيف، واحتياطيّ R موجود) ======');
  await requestsV2.setScheduleStatus({ id: H.id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: DAY as any, doctorId: H.id, doctorName: H.name, status: 'sick_leave', shift: 'morning' } as any);
  await applyCoverage({ clinicId: CID, weekStart: WEEK, label: 'host-absent' });
  await applyNewHeartRebalance({ clinicId: CID, weekStart: WEEK, label: 'host-absent' });
  const rows = await dayRows();
  console.log('  النتيجة:', rows.filter((r) => r.status === 'active' && (r.role === 'clinic' || r.role === 'delegator')).map((r) => `${r.doctor_name.split(' ')[0]}:${r.role[0]}p${r.period}`).join('  '));
  console.log('  احتياط باقٍ:', rows.filter((r) => r.status === 'extra').map((r) => r.doctor_name.split(' ')[0]).join(',') || '(لا شيء)');

  const hosted = new Set(rows.filter((r) => r.role === 'delegator' && r.status === 'active').map((r) => r.period));
  const rStillReserve = rows.some((r) => r.status === 'extra' && r.doctor_id === R.id);
  const rIsHost = rows.some((r) => r.doctor_id === R.id && r.role === 'delegator' && r.status === 'active');
  check('الغائب H ليس في أيّ خانةٍ نشطة (عيادة/استضافة)', !rows.some((r) => r.doctor_id === H.id && r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator')), '');
  check('احتياطيٌّ صعد مضيفًا (لم تسقط الاستضافة مع توفّر احتياط)', rIsHost, 'الاستضافة سقطت رغم وجود احتياطيّ');
  console.log(`\n  ⇒ الاستضافةُ مُغطّاة في الفترات: [${[...hosted].sort().join(',') || 'لا شيء'}] | R صعد مضيفًا؟ ${rIsHost} | R بقي يرتاح؟ ${rStillReserve}`);
  if (hosted.size === 0 && rStillReserve) console.log('  🟠 الاستنتاج: التغطية أسقطت الاستضافة وتركت R يرتاح — نقصُ مضيفٍ مع توفّر احتياطيّ (يحتاج تعديلًا).');
  else if (rIsHost) console.log('  ✅ الاستنتاج: R صعد مضيفًا — لا نقص (سليم).');
  else console.log('  ℹ️ حالةٌ أخرى — انظر النتيجة أعلاه.');

  await cleanDay();
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
