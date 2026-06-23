/* فحصٌ حيّ للحالة المُضيفة: طبيبٌ بالفترتين (عيادة ف١ + دليقيتر ف٢) يستأذن ثمّ يُلغي →
   مسار إعادة الحساب (prev.length===2) — يعود للعيادة بلا كسر، واللقطة تُزال.
   مشهدٌ **متحكَّمٌ ثابت** بأسبوعٍ خاصّ (لا يعتمد جدولًا مبنيًّا مشتركًا). ينظّف نفسه.
     set -a; . ./.env; set +a; npx tsx scripts/test-perm-host.ts */
import { supabase } from '../lib/supabase';
import { dispatchRequestToolV2, FINAL_MARK } from '../lib/ai_v2/tools_requests_v2';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { loadScheduleData } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001'; const WEEK = '2099-12-13'; const DAY = 'sunday';
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };
async function clean() { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK); }
async function ins(row: any) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: DAY, status: 'active', source: 'ai', ...row }); }
async function dayRows() { const { data } = await supabase.from('schedule_slots').select('id,doctor_id,doctor_name,period,clinic_number,role,status').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', DAY); return (data || []) as any[]; }
const activeClinic = (rows: any[], id: string) => rows.find((r) => r.doctor_id === id && r.status === 'active' && r.role === 'clinic' && r.period > 0);
const prevRows = (rows: any[], id: string) => rows.filter((r) => r.doctor_id === id && r.role === 'prev_placement');

async function main() {
  const { data: origS } = await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID);
  const origCC = (origS && origS[0]?.clinic_count) ?? 3;
  try {
    await supabase.from('schedule_settings').update({ clinic_count: 3 }).eq('clinic_id', CID);
    const { data: ld } = await loadScheduleData(CID, WEEK);
    const pool = (ld?.doctors ?? []).filter((d: any) => d.workStatus === 'active' && d.groupTemplate?.key !== 'board').map((d: any) => ({ id: d.id, name: d.name }));
    const roster = (ld?.doctors ?? []).map((d: any) => ({ id: d.id, name: d.name }));
    if (pool.length < 5) { console.log(`أطباءُ عاديّون أقلّ من ٥ (${pool.length}).`); process.exit(1); }
    const [H, P, M, S, D] = pool;

    // ع١ زوج-استضافة: H(ع١ف١ + دلف٢) + P(دلف١ + ع١ف٢) · ع٢ مشطورة: M ف١، S ف٢ (حرٌّ ف١)
    // · ع٣ منفرد (D). H مُضيفٌ يعمل الفترتين، وS شريكُ تبديلٍ مؤهّل.
    await clean();
    await ins({ period: 1, clinic_number: 1, doctor_id: H.id, doctor_name: H.name, role: 'clinic' });
    await ins({ period: 2, clinic_number: 0, doctor_id: H.id, doctor_name: H.name, role: 'delegator' });
    await ins({ period: 1, clinic_number: 0, doctor_id: P.id, doctor_name: P.name, role: 'delegator' });
    await ins({ period: 2, clinic_number: 1, doctor_id: P.id, doctor_name: P.name, role: 'clinic' });
    await ins({ period: 1, clinic_number: 2, doctor_id: M.id, doctor_name: M.name, role: 'clinic' });
    await ins({ period: 2, clinic_number: 2, doctor_id: S.id, doctor_name: S.name, role: 'clinic' });
    await ins({ period: 1, clinic_number: 3, doctor_id: D.id, doctor_name: D.name, role: 'clinic' });
    await ins({ period: 2, clinic_number: 3, doctor_id: D.id, doctor_name: D.name, role: 'clinic' });
    let rows = await dayRows();
    const isHost = !!activeClinic(rows, H.id) && rows.some((r) => r.doctor_id === H.id && r.role === 'delegator' && r.status === 'active' && r.period === 2);
    check('مُضيفٌ مبذور (عيادة ف١ + دليقيتر ف٢)', isHost, '');
    console.log(`المُضيف: ${H.name} — عيادة١ ف١ + دليقيتر ف٢ · شريكُ التبديل المتوقّع: ${S.name} (ع٢ ف٢)`);

    console.log('\n====== ① استئذان بداية → تبديل مُضيف + لقطةٌ من صفّين ======');
    await requestsV2.setScheduleStatus({ id: H.id, role: 'doctor' } as any, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: H.id, doctorName: H.name, status: 'permission_start', shift: 'morning' } as any);
    rows = await dayRows();
    check('حُفظت لقطةٌ من صفّين (مُضيف)', prevRows(rows, H.id).length === 2, `prev=${prevRows(rows, H.id).length}`);
    check('المُضيف انتقل (لم يعد بالفترة ١)', activeClinic(rows, H.id)?.period !== 1, JSON.stringify(activeClinic(rows, H.id) && { p: activeClinic(rows, H.id).period }));

    console.log('\n====== ② إلغاء → مسار إعادة الحساب (مُضيف) ======');
    const hIdx = roster.findIndex((d) => d.id === H.id) + 1;
    const ctx: any = { clinicId: CID, user: { id: H.id, name: H.name, role: 'doctor' }, roster };
    const raw = await dispatchRequestToolV2('cancel_schedule_status', { weekStart: WEEK, day: DAY, doctorIndex: hIdx }, ctx);
    console.log('  → ', raw.replace(FINAL_MARK, '').slice(0, 130));
    check('الردّ نهائيّ (بلا كسر)', raw.startsWith(FINAL_MARK), raw.slice(0, 90));
    rows = await dayRows();
    check('المُضيف عاد إلى العيادة', !!activeClinic(rows, H.id), 'غير منسَّب');
    check('اللقطة أُزيلت', prevRows(rows, H.id).length === 0, `prev=${prevRows(rows, H.id).length}`);
    check('لا علامة استئذان باقية', !rows.some((r) => r.doctor_id === H.id && r.period === 0 && (r.status === 'permission_start' || r.status === 'permission_end')), '');
    check('الردّ يذكر العودة للمقعد (عكسٌ حرفيّ)', /عاد إلى مقعده/.test(raw), raw.slice(0, 90));
    const hostSeats = rows.filter((r) => r.doctor_id === H.id && r.status === 'active' && r.period > 0);
    const backClinic = hostSeats.some((r) => r.role === 'clinic');
    const backDelegator = hostSeats.some((r) => r.role === 'delegator');
    console.log('  مقاعد المُضيف بعد العودة:', hostSeats.map((r) => `${r.role} p${r.period} c${r.clinic_number}`).join(' + ') || '(لا شيء)');
    console.log(`  → رجع عيادة؟ ${backClinic} | رجع دليقيتر؟ ${backDelegator} ⇒ ${backClinic && backDelegator ? 'مُضيف' : backClinic ? 'عيادة فقط' : 'غير ذلك'}`);

    console.log(`\n====== النتيجة: ${pass} PASS / ${fail} FAIL ======`);
    if (fails.length) { console.log('الإخفاقات:'); fails.forEach((f) => console.log('  • ' + f)); }
  } finally {
    await clean();
    await supabase.from('schedule_settings').update({ clinic_count: origCC }).eq('clinic_id', CID);
  }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
