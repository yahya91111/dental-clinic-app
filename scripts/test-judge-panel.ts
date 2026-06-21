/* لجنةُ التحكيم: حين يوجد أكثرُ من مرشّحٍ لحلٍّ واحد، تختار الأعدلَ لا الأدنى رقمًا.
 * مضيفٌ متفرّغ H يستأذن الخميس → مرشّحان للاستضافة: X (عيادة١، استضاف ٣ أيّام = مُثقَل)
 * و Y (عيادة٣، لم يستضِف). الترتيبُ القديم يختار X (الأدنى رقمًا)؛ اللجنةُ تختار Y.
 *   set -a; . ./.env; set +a; npx tsx scripts/test-judge-panel.ts */
import { supabase } from '../lib/supabase';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { loadScheduleData } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-07-05';
const DAY = 'thursday';
let pass = 0; let fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' — ' + d); } };
async function rowsOf(day: string) { const { data } = await supabase.from('schedule_slots').select('id,doctor_id,doctor_name,period,clinic_number,role,status').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', day); return (data || []) as any[]; }
async function ins(day: string, row: any) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: day, source: 'request', status: 'active', ...row }); }
async function clean() { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK); }

async function main() {
  const { data } = await loadScheduleData(CID, WEEK);
  const roster = (data?.doctors ?? []).filter((d: any) => d.groupTemplate?.key !== 'board' && d.workStatus === 'active').map((d: any) => ({ id: d.id, name: d.name }));
  if (roster.length < 5) { console.log(`بِركةٌ صغيرة (${roster.length})`); process.exit(1); }
  const [H, X, Y, M1, M2] = roster;
  const fn = (s: string) => s.split(' ')[0];

  await clean();
  // امسح تاريخَ استضافةِ X و Y في كلّ أسابيع الاختبار (٢٠٩٩) كي يكون الحِمل محكومًا.
  for (const id of [X.id, Y.id]) await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('doctor_id', id).eq('role', 'delegator').gte('week_start', '2099-01-01');
  // أيّامٌ سابقة: X يستضيف (delegator) الأحد/الإثنين/الثلاثاء = حِملٌ ٣. Y لا يستضيف أبدًا.
  for (const d of ['sunday', 'monday', 'tuesday']) await ins(d, { period: 1, clinic_number: 0, doctor_id: X.id, doctor_name: X.name, role: 'delegator' });

  // الخميس: عيادتان فقط (مرشّحان فقط: X في عيادة١/ف٢، Y في عيادة٢/ف٢) — حتميٌّ.
  await ins(DAY, { period: 1, clinic_number: 0, doctor_id: H.id, doctor_name: H.name, role: 'delegator' });
  await ins(DAY, { period: 2, clinic_number: 0, doctor_id: H.id, doctor_name: H.name, role: 'delegator' });
  await ins(DAY, { period: 1, clinic_number: 1, doctor_id: M1.id, doctor_name: M1.name, role: 'clinic' });
  await ins(DAY, { period: 2, clinic_number: 1, doctor_id: X.id, doctor_name: X.name, role: 'clinic' });  // X: عيادة١ ف٢ (مرشّح، حرٌّ ف١)
  await ins(DAY, { period: 1, clinic_number: 2, doctor_id: M2.id, doctor_name: M2.name, role: 'clinic' });
  await ins(DAY, { period: 2, clinic_number: 2, doctor_id: Y.id, doctor_name: Y.name, role: 'clinic' });  // Y: عيادة٢ ف٢ (مرشّح، حرٌّ ف١)

  console.log(`H=${fn(H.name)} (مضيفٌ متفرّغ يستأذن) | X=${fn(X.name)} (عيادة١، استضاف ٣) | Y=${fn(Y.name)} (عيادة٢، لم يستضِف)`);
  console.log('  الترتيبُ القديم (الأدنى رقمًا) كان سيختار:', fn(X.name), '(عيادة ١)');

  // استئذان H بداية الدوام (يحجب ف١) → حلُّ المضيف المتفرّغ → اللجنة تختار المرشّح.
  await requestsV2.setScheduleStatus({ id: H.id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: DAY as any, doctorId: H.id, doctorName: H.name, status: 'permission_start', shift: 'morning' } as any);

  const th = await rowsOf(DAY);
  const hostP1 = th.find((r) => r.status === 'active' && r.role === 'delegator' && r.period === 1);
  const hostP2 = th.find((r) => r.status === 'active' && r.role === 'delegator' && r.period === 2);
  console.log(`  المضيفُ الجديد: ف١=${hostP1 ? fn(hostP1.doctor_name) : '—'} ف٢=${hostP2 ? fn(hostP2.doctor_name) : '—'}`);

  check('اللجنة اختارت Y (الأقلّ حِملًا) مضيفًا — لا X (الأدنى رقمًا)', !!hostP1 && hostP1.doctor_id === Y.id && !!hostP2 && hostP2.doctor_id === Y.id,
    `المضيف=${hostP1 ? fn(hostP1.doctor_name) : '—'} (المتوقّع Y=${fn(Y.name)})`);
  check('X لم يُختَر رغم رقمه الأدنى (لأنّه مُثقَلٌ بالاستضافة)', !(hostP1 && hostP1.doctor_id === X.id), 'X اختير رغم حِمله');
  check('H نزل إلى مقعد Y العياديّ (ف٢ عيادة٢)', th.some((r) => r.doctor_id === H.id && r.status === 'active' && r.role === 'clinic' && r.period === 2 && r.clinic_number === 2), 'H لم ينزل لمقعد Y');

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  await clean();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
