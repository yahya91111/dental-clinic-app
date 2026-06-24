/* فحصٌ حيّ: مُضيفٌ متفرّغ (دليقيتر الفترتين، بلا عيادة — شكل ٧/٣ فما فوق) يستأذن بداية
 * الدوام → القلبُ القديم كان يتركها شاغرة؛ الآن تبديلٌ كامل: مرشّحٌ يعمل ف٢ وحرٌّ في ف١
 * يصير المضيفَ المتفرّغ، والمستأذِن ينزل لمقعد المرشّح ف٢. يتحقّق من الثوابت بلا كسر.
 *   set -a; . ./.env; set +a; npx tsx scripts/test-perm-dedicated.ts */
import { supabase } from '../lib/supabase';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { getAllGroupMembers } from '../lib/database';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
const DAY = 'tuesday';
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };
async function dayRows() { const { data } = await supabase.from('schedule_slots').select('id,doctor_id,doctor_name,period,clinic_number,role,status,source').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', DAY); return (data || []) as any[]; }
const act = (rows: any[], id: string, p: number) => rows.find((r) => r.doctor_id === id && r.status === 'active' && r.period === p && (r.role === 'clinic' || r.role === 'delegator'));
async function ins(row: any) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: DAY, status: 'active', source: 'request', ...row }); }
async function cleanDay() { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', DAY); }

async function main() {
  // أطبّاء نشطون فقط (لا تخفيف/متدرّب/بورد) — حالةُ العمل في group_members لا في doctors.
  // الروستر من loadScheduleData (الحالةُ الواحدةُ الصحيحة لكلّ طبيب) — نستبعد البورد/التخفيف/
  // المتدرّب/الإجازة؛ المضيفُ المكرّس لا يكون إلا طبيبًا عاديًّا نشطًا.
  const { loadScheduleData } = await import('../lib/algorithms/schedule');
  const sd = (await loadScheduleData(CID, WEEK)).data;
  const roster = ((sd?.doctors) ?? [])
    .filter((d) => d.workStatus === 'active' && d.groupTemplate.key !== 'board')
    .map((d) => ({ id: d.id, name: d.name }));
  if (roster.length < 4) { console.log(`روستر نشطٌ صغير (${roster.length}) — يلزم ٤ أطبّاء نشطين`); process.exit(1); }
  const [H, P, A, B] = roster;

  // مشهدٌ مُتحكَّمٌ به على يومٍ نظيف: H مضيفٌ متفرّغ، P مرشّح ف٢ حرٌّ في ف١، عيادة ٢ زوجٌ سياق.
  await cleanDay();
  await ins({ period: 1, clinic_number: 0, doctor_id: H.id, doctor_name: H.name, role: 'delegator' });
  await ins({ period: 2, clinic_number: 0, doctor_id: H.id, doctor_name: H.name, role: 'delegator' });
  await ins({ period: 2, clinic_number: 1, doctor_id: P.id, doctor_name: P.name, role: 'clinic' });
  await ins({ period: 1, clinic_number: 1, doctor_id: A.id, doctor_name: A.name, role: 'clinic' });
  await ins({ period: 1, clinic_number: 2, doctor_id: B.id, doctor_name: B.name, role: 'clinic' });
  await ins({ period: 2, clinic_number: 2, doctor_id: B.id, doctor_name: B.name, role: 'clinic' });

  let rows = await dayRows();
  check('H مضيفٌ متفرّغ (دليقيتر ف١+ف٢، بلا عيادة)',
    !!rows.find((r) => r.doctor_id === H.id && r.role === 'delegator' && r.period === 1)
    && !!rows.find((r) => r.doctor_id === H.id && r.role === 'delegator' && r.period === 2)
    && !rows.some((r) => r.doctor_id === H.id && r.role === 'clinic' && r.status === 'active'), '');
  check('P عيادة ف٢ حرٌّ في ف١', !!act(rows, P.id, 2) && !act(rows, P.id, 1), '');

  console.log('\n====== استئذان بداية الدوام للمضيف المتفرّغ (يحجب ف١) ======');
  const res: any = await requestsV2.setScheduleStatus(
    { id: H.id, role: 'team_leader' },
    { clinicId: CID, weekStart: WEEK, day: DAY as any, doctorId: H.id, doctorName: H.name, status: 'permission_start', shift: 'morning' } as any,
  );
  check('نجح التسجيل', !!res.success, JSON.stringify(res.error || ''));
  console.log('  swap:', JSON.stringify(res.permission?.swap));
  rows = await dayRows();
  console.log('  بعد التبديل:', rows.filter((r) => r.status === 'active' && (r.role === 'clinic' || r.role === 'delegator')).map((r) => `${r.doctor_name.split(' ')[0]}:${r.role[0]}p${r.period}c${r.clinic_number}`).join('  '));

  // ── الثوابت ──
  check('المستأذِن خرج من ف١ (لا عيادة ولا استضافة)', !act(rows, H.id, 1), JSON.stringify(act(rows, H.id, 1) || null));
  const d1 = rows.find((r) => r.role === 'delegator' && r.period === 1 && r.status === 'active');
  const d2 = rows.find((r) => r.role === 'delegator' && r.period === 2 && r.status === 'active');
  check('استضافة ف١ محفوظةٌ بطبيبٍ حاضرٍ غير المستأذِن', !!d1 && d1.doctor_id !== H.id, JSON.stringify(d1 || null));
  check('استضافة ف٢ محفوظة', !!d2, '');
  // التبديل الكامل: P صار المضيفَ المتفرّغ (دليقيتر الفترتين)، H نزل لعيادة ف٢
  const pFull = rows.some((r) => r.doctor_id === P.id && r.role === 'delegator' && r.period === 1)
    && rows.some((r) => r.doctor_id === P.id && r.role === 'delegator' && r.period === 2);
  check('P صار المضيفَ المتفرّغ (دليقيتر ف١+ف٢)', pFull, rows.filter((r) => r.doctor_id === P.id && r.status === 'active').map((r) => `${r.role}p${r.period}`).join(','));
  check('H نزل لعيادة ف٢', act(rows, H.id, 2)?.role === 'clinic', JSON.stringify(act(rows, H.id, 2) || null));
  // لا حجز مزدوج في فترة
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
