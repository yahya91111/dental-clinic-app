/* (ج) إشعار الأثر البعيد: غيابٌ يوم الأحد يُسدَّد يوم الإثنين (سداد الاحتياط) — فالطبيب
 *  المتأثّر يوم الإثنين (يومٌ غيرُ يوم الغياب) يجب أن يصله كرت «طرأ تغييرٌ على جدولك»
 *  لذلك اليوم البعيد، عبر المسار الحيّ (set_schedule_status ملفوفٌ بطبقة الفرق).
 *   - A (الفاعل) مكتومٌ يوم الأحد فقط؛ يصله كرتُ الإثنين (يعمل مقعد R — أثرٌ بعيد).
 *   - R (المُغطّي) يصله كرتٌ يشمل الإثنين (استردّ راحته). */
import { supabase } from '../lib/supabase';
import { loadScheduleData } from '../lib/algorithms/schedule';
import { dispatchRequestToolV2 } from '../lib/ai_v2/tools_requests_v2';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-05-03';
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };
type Ctx = Parameters<typeof dispatchRequestToolV2>[2];
const clean = () => supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK);
const wipeCards = () => supabase.from('notifications').delete().eq('clinic_id', CID).eq('type', 'seat_change');
async function ins(day: string, row: Record<string, unknown>) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: day, source: 'request', ...row }); }
const daysOf = (card: { data: any } | undefined) => new Set<string>((card?.data?.changes || []).map((c: any) => c.day));

(async () => {
  try {
    const { data } = await loadScheduleData(CID, WEEK);
    const roster0 = (data?.doctors ?? []).filter((d: any) => d.groupTemplate?.key !== 'board' && d.workStatus === 'active');
    if (roster0.length < 3) { console.log('بِركةٌ صغيرة — تخطّي.'); console.log('\n0 PASS / 0 FAIL'); process.exit(0); }
    const [A, B, R] = roster0;
    const roster = (data?.doctors ?? []).map((d: any) => ({ id: d.id, name: d.name, groupKey: d.groupTemplate.key }));
    const idx = (id: string) => roster.findIndex((x) => x.id === id) + 1;

    await clean();
    // الأحد: عيادة١ = A(ف١)+B(ف٢)، وR احتياطيّ صباحيّ.
    await ins('sunday', { period: 1, clinic_number: 1, doctor_id: A.id, doctor_name: A.name, role: 'clinic', status: 'active' });
    await ins('sunday', { period: 2, clinic_number: 1, doctor_id: B.id, doctor_name: B.name, role: 'clinic', status: 'active' });
    await ins('sunday', { period: 0, clinic_number: 1, doctor_id: R.id, doctor_name: R.name, role: 'clinic', status: 'extra' });
    // الإثنين: عيادة١ = R(ف١)+B(ف٢)، وA احتياطيّ صباحيّ (هنا يُسدَّد لـR).
    await ins('monday', { period: 1, clinic_number: 1, doctor_id: R.id, doctor_name: R.name, role: 'clinic', status: 'active' });
    await ins('monday', { period: 2, clinic_number: 1, doctor_id: B.id, doctor_name: B.name, role: 'clinic', status: 'active' });
    await ins('monday', { period: 0, clinic_number: 1, doctor_id: A.id, doctor_name: A.name, role: 'clinic', status: 'extra' });
    console.log(`A=${A.name.split(' ')[0]} (غائب الأحد) · R=${R.name.split(' ')[0]} (يُغطّي الأحد، يُسدَّد له الإثنين)`);

    await wipeCards();
    // غياب A الأحد بنفسه عبر المسار الحيّ (set_schedule_status ⇒ تغطية+سداد+موازنة ملفوفةٌ
    // بطبقة الفرق). A هو الفاعل ⇒ يومُ غيابه (الأحد) مكتومٌ عنه؛ يبقى الأثرُ البعيد (الإثنين).
    const actorCtx: Ctx = { clinicId: CID, user: { id: A.id, name: A.name, role: 'doctor' }, roster };
    const out = await dispatchRequestToolV2('set_schedule_status', { weekStart: WEEK, day: 'sunday', doctorIndex: idx(A.id), status: 'sick_leave' }, actorCtx);
    check('① set_schedule_status نجح', !out.startsWith('Tool error'), out);

    const cards = (await supabase.from('notifications').select('recipient_id, body, data').eq('clinic_id', CID).eq('type', 'seat_change')).data as { recipient_id: string; body: string; data: any }[] || [];
    const aCard = cards.find((c) => c.recipient_id === A.id);
    const rCard = cards.find((c) => c.recipient_id === R.id);
    console.log('  كروت:', cards.map((c) => `${c.recipient_id === A.id ? 'A' : c.recipient_id === R.id ? 'R' : '?'}:[${[...daysOf(c)].join(',')}]`).join(' '));

    // الأثر البعيد: الإثنين (≠ يوم الغياب) يصل المتأثّرين.
    check('② A وصله كرتٌ للأثر البعيد (الإثنين)', !!aCard && daysOf(aCard).has('monday'), JSON.stringify([...daysOf(aCard)]));
    check('③ A لا يصله كرتٌ ليوم غيابه (الأحد مكتوم)', !!aCard && !daysOf(aCard).has('sunday'), JSON.stringify([...daysOf(aCard)]));
    check('④ R وصله كرتٌ يشمل الإثنين (استردّ راحته)', !!rCard && daysOf(rCard).has('monday'), JSON.stringify([...daysOf(rCard)]));
  } finally {
    await wipeCards();
    await clean();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
