/* كرت «يوجد فترة فارغة»: غيابٌ يخلّف نقصًا لا يستطيع المحرّك ملأه (طبيبٌ منفردٌ في عيادة،
 *  بلا احتياطٍ ولا شريك) → كلُّ قائدٍ يصله كرت shortage_alert بمكان النقص (لكلٍّ نسخته).
 *  (أ) كرتٌ لكلّ قائد. (ب) يحمل موقع النقص (عيادة ١ الفترتين). (ج) القراءة تُخفيه (count). */
import { supabase } from '../lib/supabase';
import { loadScheduleData } from '../lib/algorithms/schedule';
import { dispatchRequestToolV2 } from '../lib/ai_v2/tools_requests_v2';

// عدّاد كروت «يوجد فترة فارغة» غير المقروءة لقائدٍ (نفس منطق العرض: shortage_alert + !is_read).
async function unreadShortage(recipientId: string): Promise<number> {
  const { data } = await supabase.from('notifications').select('id').eq('recipient_id', recipientId).eq('type', 'shortage_alert').eq('is_read', false);
  return (data || []).length;
}

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
const DAY = 'sunday';
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };
type Ctx = Parameters<typeof dispatchRequestToolV2>[2];
const cleanDay = () => supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).eq('day_of_week', DAY);
const wipeCards = () => supabase.from('notifications').delete().eq('clinic_id', CID).eq('type', 'shortage_alert');
async function ins(row: Record<string, unknown>) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: W, day_of_week: DAY, source: 'request', ...row }); }

(async () => {
  try {
    const { data } = await loadScheduleData(CID, W);
    const X = (data?.doctors ?? []).find((d: any) => d.workStatus === 'active' && d.groupTemplate?.key !== 'board');
    if (!X) { console.log('ℹ لا طبيب مناسب — تخطّي.'); console.log('\n0 PASS / 0 FAIL'); process.exit(0); }
    const { data: leaders } = await supabase.from('doctors').select('id').eq('clinic_id', CID).eq('role', 'team_leader');
    const leaderIds = ((leaders || []) as { id: string }[]).map((r) => r.id);
    if (!leaderIds.length) { console.log('ℹ لا قادة — تخطّي.'); console.log('\n0 PASS / 0 FAIL'); process.exit(0); }
    console.log(`المنفرد=${X.name.split(' ')[0]} (عيادة ١ الفترتين، بلا احتياط) · قادة=${leaderIds.length}`);

    await cleanDay();
    await wipeCards();
    // عيادة ١: X منفردٌ الفترتين، لا احتياط، لا شريك، لا أحد آخر هذا اليوم ⇒ غيابُه نقصٌ لا يُملأ.
    await ins({ period: 1, clinic_number: 1, doctor_id: X.id, doctor_name: X.name, role: 'clinic', status: 'active' });
    await ins({ period: 2, clinic_number: 1, doctor_id: X.id, doctor_name: X.name, role: 'clinic', status: 'active' });

    const roster = (data?.doctors ?? []).map((d: any) => ({ id: d.id, name: d.name, groupKey: d.groupTemplate.key }));
    const idx = roster.findIndex((r) => r.id === X.id) + 1;
    const actorCtx: Ctx = { clinicId: CID, user: { id: X.id, name: X.name, role: 'doctor' }, roster };
    const out = await dispatchRequestToolV2('set_schedule_status', { weekStart: W, day: DAY, doctorIndex: idx, status: 'sick_leave' }, actorCtx);
    check('① set_schedule_status نجح', !out.startsWith('Tool error'), out);

    const cards = (await supabase.from('notifications').select('recipient_id, title, body, data, is_read').eq('clinic_id', CID).eq('type', 'shortage_alert')).data as any[] || [];
    check('(أ) كرتٌ لكلّ قائد (لكلٍّ نسخته)', cards.length === leaderIds.length && leaderIds.every((id) => cards.some((c) => c.recipient_id === id)), `cards=${cards.length} leaders=${leaderIds.length}`);
    const any = cards[0];
    check('(ب) العنوان «يوجد فترة فارغة»', any?.title === 'يوجد فترة فارغة', any?.title);
    const seats = (any?.data?.seats || []) as { day: string; clinic_number: number; period: number }[];
    check('(ب) الموقع = عيادة ١ الفترتان', seats.length === 2 && seats.every((s) => s.clinic_number === 1 && s.day === DAY) && seats.some((s) => s.period === 1) && seats.some((s) => s.period === 2), JSON.stringify(seats));
    check('(ب) النصّ يذكر عيادة ١', /عيادة 1/.test(any?.body || ''), any?.body);

    // (ج) القراءة تُخفيه من العدّاد (لكلّ قائدٍ على حدة)
    const L0 = leaderIds[0]!;
    const before = await unreadShortage(L0);
    await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', L0).eq('type', 'shortage_alert');
    const after = await unreadShortage(L0);
    check('(ج) قراءةُ القائد تُنقِص عدّادَه', after < before, `before=${before} after=${after}`);
    const other = leaderIds[1];
    if (other) check('(ج) يبقى عند قائدٍ آخر لم يطّلع', (await unreadShortage(other)) > 0, 'اختفى عند الجميع');
  } finally {
    await wipeCards();
    await cleanDay();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
