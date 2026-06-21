/* قياسُ «دقّة الكنسل»: هل يعود الجدول حرفيًّا كما كان بعد استئذانٍ ثمّ إلغائه؟
 * نلتقط بصمةَ اليوم (كلّ خانةٍ نشطة) قبل الاستئذان وبعد الإلغاء ونقارن — لحالتين:
 *   ① فترة واحدة (تبديلُ زميلٍ — عكسٌ حرفيّ متوقَّع).   ② مُضيفٌ متفرّغ (إعادةُ حساب).
 *   set -a; . ./.env; set +a; npx tsx scripts/test-perm-cancel-exact.ts */
import { supabase } from '../lib/supabase';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { dispatchRequestToolV2, FINAL_MARK } from '../lib/ai_v2/tools_requests_v2';
import { getAllGroupMembers } from '../lib/database';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };
async function dayRows(day: string) { const { data } = await supabase.from('schedule_slots').select('doctor_id,doctor_name,period,clinic_number,role,status').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', day); return (data || []) as any[]; }
async function ins(day: string, row: any) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: day, status: 'active', source: 'request', ...row }); }
async function cleanDay(day: string) { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', day); }
// بصمةٌ حتميّة لكلّ الخانات النشطة (عيادة/دليقيتر) — مرتّبةٌ كي تكون المقارنة مستقلّةً عن ترتيب الصفوف.
const sig = (rows: any[]) => rows.filter((r) => r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'))
  .map((r) => `${r.doctor_id}|${r.role}|p${r.period}|c${r.clinic_number}`).sort().join('  ');

async function scenario(label: string, day: string, build: (R: any[]) => Promise<void>, subjectIdx: number, roster: any[]) {
  console.log(`\n══════ ${label} (${day}) ══════`);
  await cleanDay(day);
  await build(roster);
  const before = sig(await dayRows(day));
  console.log('  قبل: ' + before.replace(/[0-9a-f-]{36}/g, (m) => roster.find((r) => r.id === m)?.name?.split(' ')[0] ?? m.slice(0, 4)));

  const subj = roster[subjectIdx];
  await requestsV2.setScheduleStatus({ id: subj.id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: subj.id, doctorName: subj.name, status: 'permission_start', shift: 'morning' } as any);
  const mid = sig(await dayRows(day));
  check('الاستئذان غيّر الجدول (وقع تبديل)', mid !== before, '');

  // الإلغاء عبر مسار الأداة الحيّ (يشمل العكس الحرفيّ أو إعادة الحساب).
  const ctx: any = { clinicId: CID, user: { id: subj.id, name: subj.name, role: 'team_leader' }, roster };
  const raw = await dispatchRequestToolV2('cancel_schedule_status', { weekStart: WEEK, day, doctorIndex: subjectIdx + 1 }, ctx);
  console.log('  → ' + raw.replace(FINAL_MARK, '').slice(0, 110));
  const after = sig(await dayRows(day));
  console.log('  بعد: ' + after.replace(/[0-9a-f-]{36}/g, (m) => roster.find((r) => r.id === m)?.name?.split(' ')[0] ?? m.slice(0, 4)));

  const exact = after === before;
  check('عاد الجدول حرفيًّا كما كان (بصمةٌ مطابقة)', exact, exact ? '' : 'اختلفت البصمة — إعادةُ حسابٍ لا عكسٌ حرفيّ');
  if (!exact) {
    const b = new Set(before.split('  ')); const a = new Set(after.split('  '));
    const lost = [...b].filter((x) => !a.has(x)); const added = [...a].filter((x) => !b.has(x));
    const nm = (s: string) => s.replace(/[0-9a-f-]{36}/g, (m) => roster.find((r) => r.id === m)?.name?.split(' ')[0] ?? m.slice(0, 4));
    console.log('     فُقد: ' + lost.map(nm).join(' , '));
    console.log('     ظهر: ' + added.map(nm).join(' , '));
  }
  await cleanDay(day);
}

async function main() {
  const { data: members } = await getAllGroupMembers(CID);
  const roster = ((members || []) as any[])
    .filter((m) => (m.work_status ?? 'active') === 'active' && m.group_template_key !== 'board')
    .map((m) => ({ id: m.doctor_id, name: m.doctor_name }));
  if (roster.length < 4) { console.log('روستر صغير'); process.exit(1); }
  const [X, Y, A, B] = roster;

  // ① فترة واحدة: X ف١ + Y ف٢ في نفس العيادة. استئذان X يحجب ف١ → تبديلٌ مع Y.
  await scenario('① فترة واحدة (تبديل زميل)', 'tuesday', async () => {
    await ins('tuesday', { period: 1, clinic_number: 1, doctor_id: X.id, doctor_name: X.name, role: 'clinic' });
    await ins('tuesday', { period: 2, clinic_number: 1, doctor_id: Y.id, doctor_name: Y.name, role: 'clinic' });
    await ins('tuesday', { period: 1, clinic_number: 2, doctor_id: A.id, doctor_name: A.name, role: 'clinic' });
    await ins('tuesday', { period: 2, clinic_number: 2, doctor_id: B.id, doctor_name: B.name, role: 'clinic' });
  }, 0, roster);

  // ② مُضيفٌ متفرّغ: X دليقيتر الفترتين، Y عيادة ف٢ حرٌّ في ف١ (مرشّح). استئذان X يحجب ف١.
  await scenario('② مُضيفٌ متفرّغ (إعادة حساب)', 'wednesday', async () => {
    await ins('wednesday', { period: 1, clinic_number: 0, doctor_id: X.id, doctor_name: X.name, role: 'delegator' });
    await ins('wednesday', { period: 2, clinic_number: 0, doctor_id: X.id, doctor_name: X.name, role: 'delegator' });
    await ins('wednesday', { period: 2, clinic_number: 1, doctor_id: Y.id, doctor_name: Y.name, role: 'clinic' });
    await ins('wednesday', { period: 1, clinic_number: 1, doctor_id: A.id, doctor_name: A.name, role: 'clinic' });
    await ins('wednesday', { period: 1, clinic_number: 2, doctor_id: B.id, doctor_name: B.name, role: 'clinic' });
    await ins('wednesday', { period: 2, clinic_number: 2, doctor_id: B.id, doctor_name: B.name, role: 'clinic' });
  }, 0, roster);

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  if (fails.length) { console.log('الإخفاقات:'); fails.forEach((f) => console.log('  • ' + f)); }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
