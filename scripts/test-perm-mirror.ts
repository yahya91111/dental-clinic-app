/* فحصٌ حيّ للحالة المرآة: مُضيفٌ زوجيٌّ محجوبٌ على فترة استضافته (عيادة ف٢ + دليقيتر ف١)
 * يستأذن بداية الدوام (يحجب ف١ = استضافته) → استدعاء: تنتقل استضافة ف١ لطبيبٍ يعمل ف٢
 * وحرٌّ في ف١، ويبقى المستأذِن في عيادته ف٢. يتحقّق من الثوابت بلا كسر.
 *   set -a; . ./.env; set +a; npx tsx scripts/test-perm-mirror.ts */
import { supabase } from '../lib/supabase';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { getAllGroupMembers } from '../lib/database';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
const DAY = 'wednesday';
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };
async function dayRows() { const { data } = await supabase.from('schedule_slots').select('id,doctor_id,doctor_name,period,clinic_number,role,status,source').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', DAY); return (data || []) as any[]; }
const act = (rows: any[], id: string, p: number) => rows.find((r) => r.doctor_id === id && r.status === 'active' && r.period === p && (r.role === 'clinic' || r.role === 'delegator'));
async function ins(row: any) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: DAY, status: 'active', source: 'request', ...row }); }
async function cleanDay() { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', DAY); }

async function main() {
  const { data: members } = await getAllGroupMembers(CID);
  const roster = ((members || []) as any[])
    .filter((m) => (m.work_status ?? 'active') === 'active' && m.group_template_key !== 'board')
    .map((m) => ({ id: m.doctor_id, name: m.doctor_name }));
  if (roster.length < 4) { console.log(`روستر نشطٌ صغير (${roster.length})`); process.exit(1); }
  const [H, P, A, B] = roster;

  // H مُضيفٌ زوجيّ محجوبٌ على استضافته: عيادة ف٢ (c1) + دليقيتر ف١. P عيادة ف٢ (c2) حرٌّ في ف١.
  await cleanDay();
  await ins({ period: 2, clinic_number: 1, doctor_id: H.id, doctor_name: H.name, role: 'clinic' });
  await ins({ period: 1, clinic_number: 0, doctor_id: H.id, doctor_name: H.name, role: 'delegator' });
  await ins({ period: 2, clinic_number: 2, doctor_id: P.id, doctor_name: P.name, role: 'clinic' });
  await ins({ period: 1, clinic_number: 1, doctor_id: A.id, doctor_name: A.name, role: 'clinic' });
  await ins({ period: 1, clinic_number: 2, doctor_id: B.id, doctor_name: B.name, role: 'clinic' });

  let rows = await dayRows();
  check('H مُضيفٌ زوجيّ (عيادة ف٢ + دليقيتر ف١)', act(rows, H.id, 2)?.role === 'clinic' && !!rows.find((r) => r.doctor_id === H.id && r.role === 'delegator' && r.period === 1), '');
  check('P عيادة ف٢ حرٌّ في ف١', !!act(rows, P.id, 2) && !act(rows, P.id, 1), '');

  console.log('\n====== استئذان بداية الدوام (يحجب ف١ = فترة استضافة H) ======');
  const res: any = await requestsV2.setScheduleStatus(
    { id: H.id, role: 'team_leader' },
    { clinicId: CID, weekStart: WEEK, day: DAY as any, doctorId: H.id, doctorName: H.name, status: 'permission_start', shift: 'morning' } as any,
  );
  check('نجح التسجيل', !!res.success, JSON.stringify(res.error || ''));
  console.log('  swap:', JSON.stringify(res.permission?.swap));
  rows = await dayRows();
  console.log('  بعد الاستدعاء:', rows.filter((r) => r.status === 'active' && (r.role === 'clinic' || r.role === 'delegator')).map((r) => `${r.doctor_name.split(' ')[0]}:${r.role[0]}p${r.period}c${r.clinic_number}`).join('  '));

  // ── الثوابت ──
  check('المستأذِن خرج من ف١ (لا عيادة ولا استضافة)', !act(rows, H.id, 1), JSON.stringify(act(rows, H.id, 1) || null));
  check('المستأذِن باقٍ في عيادته ف٢', act(rows, H.id, 2)?.role === 'clinic', JSON.stringify(act(rows, H.id, 2) || null));
  const d1 = rows.find((r) => r.role === 'delegator' && r.period === 1 && r.status === 'active');
  check('استضافة ف١ انتقلت لطبيبٍ حاضرٍ غير المستأذِن', !!d1 && d1.doctor_id !== H.id, JSON.stringify(d1 || null));
  for (const p of [1, 2]) {
    const seen = new Map<string, number>();
    for (const r of rows.filter((x) => x.status === 'active' && x.period === p && (x.role === 'clinic' || x.role === 'delegator'))) seen.set(r.doctor_id, (seen.get(r.doctor_id) || 0) + 1);
    check(`لا حجز مزدوج ف${p}`, ![...seen.values()].some((v) => v > 1), '');
  }

  console.log(`\n====== النتيجة: ${pass} PASS / ${fail} FAIL ======`);
  if (fails.length) { console.log('الإخفاقات:'); fails.forEach((f) => console.log('  • ' + f)); }
  await cleanDay();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
