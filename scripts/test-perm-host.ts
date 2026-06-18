/* فحصٌ حيّ للحالة المُضيفة: طبيبٌ بالفترتين (عيادة + دليقيتر) يستأذن ثمّ يُلغي →
 * مسار إعادة الحساب (prev.length===2) — يعود للعيادة بلا كسر، واللقطة تُزال. */
import { supabase } from '../lib/supabase';
import { dispatchRequestToolV2, FINAL_MARK } from '../lib/ai_v2/tools_requests_v2';
import { requestsV2 } from '../lib/algorithms/requests_v2';

const CID = '10000000-0000-0000-0000-000000000001'; const WEEK = '2099-01-04'; const DAY = 'sunday';
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };
async function dayRows() { const { data } = await supabase.from('schedule_slots').select('id,doctor_id,doctor_name,period,clinic_number,role,status').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', DAY); return (data || []) as any[]; }
const activeClinic = (rows: any[], id: string) => rows.find((r) => r.doctor_id === id && r.status === 'active' && r.role === 'clinic' && r.period > 0);
const prevRows = (rows: any[], id: string) => rows.filter((r) => r.doctor_id === id && r.role === 'prev_placement');

async function main() {
  const { data: docs } = await supabase.from('doctors').select('id,name').eq('clinic_id', CID);
  const roster = (docs || []).map((d: any) => ({ id: d.id, name: d.name }));
  let rows = await dayRows();

  // اختر طبيب عيادة بالفترة 1 وله شريكٌ بالفترة 2 بنفس العيادة
  const p1 = rows.find((r) => r.status === 'active' && r.role === 'clinic' && r.period === 1);
  const partner = p1 && rows.find((r) => r.status === 'active' && r.role === 'clinic' && r.period === 2 && r.clinic_number === p1.clinic_number);
  check('وُجد طبيب ف1 وشريك ف2', !!p1 && !!partner, '');
  if (!p1 || !partner) { process.exit(1); }
  const host = { id: p1.doctor_id, name: p1.doctor_name };
  console.log(`المُضيف (مُصطنَع): ${host.name} — عيادة ف1 c${p1.clinic_number} + سنُضيف دليقيتر ف2`);

  // تنظيف سابق + بناء المُضيف: أضِف صفّ دليقيتر للفترة 2 (يصبح يعمل الفترتين)
  await requestsV2.cancelStatus({ id: host.id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: DAY as any, doctorId: host.id, restoreToPrevPlace: true }).catch(() => {});
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', DAY).eq('doctor_id', host.id).eq('role', 'delegator');
  await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: DAY, period: 2, clinic_number: 0, doctor_id: host.id, doctor_name: host.name, role: 'delegator', status: 'active', source: 'request' });
  rows = await dayRows();
  const isHost = !!activeClinic(rows, host.id) && rows.some((r) => r.doctor_id === host.id && r.role === 'delegator' && r.status === 'active' && r.period === 2);
  check('صار مُضيفاً (عيادة ف1 + دليقيتر ف2)', isHost, '');

  console.log('\n====== ① استئذان بداية → تبديل مُضيف + لقطةٌ من صفّين ======');
  await requestsV2.setScheduleStatus({ id: host.id, role: 'doctor' }, { clinicId: CID, weekStart: WEEK, day: DAY as any, doctorId: host.id, doctorName: host.name, status: 'permission_start', shift: 'morning' } as any);
  rows = await dayRows();
  check('حُفظت لقطةٌ من صفّين (مُضيف)', prevRows(rows, host.id).length === 2, `prev=${prevRows(rows, host.id).length}`);
  check('المُضيف انتقل (لم يعد بالفترة 1)', activeClinic(rows, host.id)?.period !== 1, JSON.stringify(activeClinic(rows, host.id) && { p: activeClinic(rows, host.id).period }));

  console.log('\n====== ② إلغاء → مسار إعادة الحساب (مُضيف) ======');
  const hIdx = roster.findIndex((d) => d.id === host.id) + 1;
  const ctx: any = { clinicId: CID, user: { id: host.id, name: host.name, role: 'doctor' }, roster };
  const raw = await dispatchRequestToolV2('cancel_schedule_status', { weekStart: WEEK, day: DAY, doctorIndex: hIdx }, ctx);
  console.log('  → ', raw.replace(FINAL_MARK, '').slice(0, 130));
  check('الردّ نهائيّ (بلا كسر)', raw.startsWith(FINAL_MARK), raw.slice(0, 90));
  rows = await dayRows();
  check('المُضيف عاد إلى العيادة', !!activeClinic(rows, host.id), 'غير منسَّب');
  check('اللقطة أُزيلت', prevRows(rows, host.id).length === 0, `prev=${prevRows(rows, host.id).length}`);
  check('لا علامة استئذان باقية', !rows.some((r) => r.doctor_id === host.id && r.period === 0 && (r.status === 'permission_start' || r.status === 'permission_end')), '');
  check('الردّ يذكر إعادة ترتيب الشفت', /أُعيد ترتيب الشفت/.test(raw), raw.slice(0, 90));

  console.log(`\n====== النتيجة: ${pass} PASS / ${fail} FAIL ======`);
  if (fails.length) { console.log('الإخفاقات:'); fails.forEach((f) => console.log('  • ' + f)); }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
