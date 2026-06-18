/* فحصٌ حيّ: استئذانٌ يُبدّل مقعداً ثمّ يُلغى → يُعاد حساب الشفت فيعود لمقعده (قاعدة العودة الموحّدة). */
import { supabase } from '../lib/supabase';
import { dispatchRequestToolV2, FINAL_MARK } from '../lib/ai_v2/tools_requests_v2';
import { requestsV2 } from '../lib/algorithms/requests_v2';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;

let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };
async function dayRows(day: string) {
  const { data } = await supabase.from('schedule_slots').select('doctor_id,doctor_name,period,clinic_number,role,status').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', day);
  return (data || []) as any[];
}
const seatOf = (rows: any[], id: string) => rows.find((r) => r.doctor_id === id && r.status === 'active' && r.role === 'clinic' && r.period > 0);
const prevOf = (rows: any[], id: string) => rows.filter((r) => r.doctor_id === id && r.role === 'prev_placement');

async function main() {
  const { data: docs } = await supabase.from('doctors').select('id,name').eq('clinic_id', CID);
  const roster = (docs || []).map((d: any) => ({ id: d.id, name: d.name }));

  // ابحث عن إعدادٍ للتبديل: عيادةٌ فيها طبيبٌ بالفترة 1 وآخر بالفترة 2 (صباح)
  let day = ''; let docA: any = null; let docB: any = null; let clinicC = 0;
  for (const d of DAYS) {
    const rows = await dayRows(d);
    const byClinic: Record<number, any[]> = {};
    for (const r of rows) if (r.status === 'active' && r.role === 'clinic' && (r.period === 1 || r.period === 2)) (byClinic[r.clinic_number] ||= []).push(r);
    for (const cnum of Object.keys(byClinic)) {
      const seats = byClinic[+cnum];
      const p1 = seats.find((s) => s.period === 1); const p2 = seats.find((s) => s.period === 2);
      if (p1 && p2 && p1.doctor_id !== p2.doctor_id) { day = d; clinicC = +cnum; docA = { id: p1.doctor_id, name: p1.doctor_name }; docB = { id: p2.doctor_id, name: p2.doctor_name }; break; }
    }
    if (day) break;
  }
  check('وُجد إعداد تبديل (عيادة بفترتين لطبيبين)', !!day, 'لا إعداد');
  if (!day) { console.log(`\n${pass}/${fail}`); process.exit(1); }
  console.log(`الإعداد: يوم ${day}، عيادة ${clinicC} — A=${docA.name} (ف1) ، B=${docB.name} (ف2)`);

  // تنظيف
  await requestsV2.cancelStatus({ id: docA.id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: docA.id, restoreToPrevPlace: true }).catch(() => {});

  console.log('\n====== ① تقديم استئذان بداية (يحجب ف1) → تبديل تلقائيّ ======');
  await requestsV2.setScheduleStatus({ id: docA.id, role: 'doctor' }, { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: docA.id, doctorName: docA.name, status: 'permission_start', shift: 'morning' } as any);
  let rows = await dayRows(day);
  const aAfter = seatOf(rows, docA.id); const bAfter = seatOf(rows, docB.id);
  check('A انتقل للفترة 2 (بُدِّل)', !!aAfter && aAfter.period === 2 && aAfter.clinic_number === clinicC, JSON.stringify(aAfter && { p: aAfter.period, c: aAfter.clinic_number }));
  check('B انتقل للفترة 1', !!bAfter && bAfter.period === 1 && bAfter.clinic_number === clinicC, JSON.stringify(bAfter && { p: bAfter.period, c: bAfter.clinic_number }));
  check('حُفظت لقطة (prev_placement) لـA', prevOf(rows, docA.id).length > 0, 'لا لقطة');

  console.log('\n====== ② إلغاء الاستئذان (العالم ثابت) → عودةٌ لمقعده ======');
  const aIdx = roster.findIndex((d) => d.id === docA.id) + 1;
  const ctx: any = { clinicId: CID, user: { id: docA.id, name: docA.name, role: 'doctor' }, roster };
  const raw = await dispatchRequestToolV2('cancel_schedule_status', { weekStart: WEEK, day, doctorIndex: aIdx }, ctx);
  console.log('  → ', raw.replace(FINAL_MARK, '').slice(0, 120));
  rows = await dayRows(day);
  const aBack = seatOf(rows, docA.id); const bBack = seatOf(rows, docB.id);
  check('A عاد للفترة 1 (مقعده الأصليّ)', !!aBack && aBack.period === 1 && aBack.clinic_number === clinicC, JSON.stringify(aBack && { p: aBack.period, c: aBack.clinic_number }));
  check('B عاد للفترة 2', !!bBack && bBack.period === 2 && bBack.clinic_number === clinicC, JSON.stringify(bBack && { p: bBack.period, c: bBack.clinic_number }));
  check('اللقطة أُزيلت', prevOf(rows, docA.id).length === 0, 'بقيت لقطة');
  check('لا علامة استئذان باقية', !rows.some((r) => r.doctor_id === docA.id && r.period === 0 && (r.status === 'permission_start' || r.status === 'permission_end')), 'علامة باقية');
  check('الردّ يذكر العودة للمقعد', /عاد إلى مقعده/.test(raw), raw.slice(0, 80));

  console.log('\n====== ③ العالم تغيّر (الشريك غاب) → عودةٌ بإعادة حساب، بلا كسر ======');
  // أعِد التبديل ثمّ غيّب الشريك B (صار بالفترة 1)
  await requestsV2.setScheduleStatus({ id: docA.id, role: 'doctor' }, { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: docA.id, doctorName: docA.name, status: 'permission_start', shift: 'morning' } as any);
  await requestsV2.setScheduleStatus({ id: docB.id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: docB.id, doctorName: docB.name, status: 'sick_leave', shift: 'morning' } as any);
  const raw3 = await dispatchRequestToolV2('cancel_schedule_status', { weekStart: WEEK, day, doctorIndex: aIdx }, ctx);
  console.log('  → ', raw3.replace(FINAL_MARK, '').slice(0, 120));
  rows = await dayRows(day);
  check('A عاد إلى العيادة رغم تغيّر العالم', !!seatOf(rows, docA.id), 'A غير منسَّب');
  check('لقطة A أُزيلت', prevOf(rows, docA.id).length === 0, 'بقيت لقطة');
  // تنظيف
  await requestsV2.cancelStatus({ id: docB.id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: docB.id, restoreToPrevPlace: true }).catch(() => {});
  await requestsV2.cancelStatus({ id: docA.id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: docA.id, restoreToPrevPlace: true }).catch(() => {});

  console.log(`\n====== النتيجة: ${pass} PASS / ${fail} FAIL ======`);
  if (fails.length) { console.log('الإخفاقات:'); fails.forEach((f) => console.log('  • ' + f)); }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
