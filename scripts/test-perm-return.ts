/* قاعدةُ العودة الموحّدة: استئذانٌ يبدّل مقعداً ثمّ يُلغى → يعود الطبيب لمقعده.
   مشهدٌ **متحكَّمٌ ثابت** (لا يعتمد حالةَ بناءٍ متغيّرة): عيادةٌ مشطورةٌ نظيفةٌ بطبيبَين
   عاديَّين (A ف١ فقط، B ف٢ فقط) + عيادتان منفردتان + مضيف. ينظّف أسبوعَه قبلُ وبعدُ.
     set -a; . ./.env; set +a; npx tsx scripts/test-perm-return.ts */
import { supabase } from '../lib/supabase';
import { dispatchRequestToolV2, FINAL_MARK } from '../lib/ai_v2/tools_requests_v2';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { loadScheduleData } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
const DAY = 'sunday';
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };

async function clean() { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK); }
async function ins(row: any) { await supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: WEEK, day_of_week: DAY, status: 'active', source: 'ai', ...row }); }
async function dayRows() {
  const { data } = await supabase.from('schedule_slots').select('doctor_id,doctor_name,period,clinic_number,role,status').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', DAY);
  return (data || []) as any[];
}
const seatOf = (rows: any[], id: string) => rows.find((r) => r.doctor_id === id && r.status === 'active' && r.role === 'clinic' && r.period > 0);
const prevOf = (rows: any[], id: string) => rows.filter((r) => r.doctor_id === id && r.role === 'prev_placement');

async function main() {
  const { data: origS } = await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID);
  const origCC = (origS && origS[0]?.clinic_count) ?? 3;
  try {
    await supabase.from('schedule_settings').update({ clinic_count: 3 }).eq('clinic_id', CID);
    const { data: ld } = await loadScheduleData(CID, WEEK);
    const pool = (ld?.doctors ?? []).filter((d: any) => d.workStatus === 'active' && d.groupTemplate?.key !== 'board')
      .map((d: any) => ({ id: d.id, name: d.name }));
    const roster = (ld?.doctors ?? []).map((d: any) => ({ id: d.id, name: d.name }));
    if (pool.length < 5) { console.log(`أطباءُ عاديّون أقلّ من ٥ (${pool.length}) — لا مشهد.`); process.exit(1); }
    const [A, B, C, D, E] = pool;
    const clinicC = 1;

    // مشهدٌ نظيف: ع١ مشطورة (A ف١، B ف٢) · ع٢ منفرد (C) · ع٣ منفرد (D) · دليقيتر مضيف (E)
    await clean();
    await ins({ period: 1, clinic_number: 1, doctor_id: A.id, doctor_name: A.name, role: 'clinic' });
    await ins({ period: 2, clinic_number: 1, doctor_id: B.id, doctor_name: B.name, role: 'clinic' });
    await ins({ period: 1, clinic_number: 2, doctor_id: C.id, doctor_name: C.name, role: 'clinic' });
    await ins({ period: 2, clinic_number: 2, doctor_id: C.id, doctor_name: C.name, role: 'clinic' });
    await ins({ period: 1, clinic_number: 3, doctor_id: D.id, doctor_name: D.name, role: 'clinic' });
    await ins({ period: 2, clinic_number: 3, doctor_id: D.id, doctor_name: D.name, role: 'clinic' });
    await ins({ period: 1, clinic_number: 0, doctor_id: E.id, doctor_name: E.name, role: 'delegator' });
    await ins({ period: 2, clinic_number: 0, doctor_id: E.id, doctor_name: E.name, role: 'delegator' });
    console.log(`المشهد: ع١ مشطورة — A=${A.name}(ف١) ، B=${B.name}(ف٢) · ع٢=${C.name} · ع٣=${D.name} · دليقيتر=${E.name}`);

    console.log('\n====== ① تقديم استئذان بداية لـA (يحجب ف١) → تبديل تلقائيّ مع B ======');
    await requestsV2.setScheduleStatus({ id: A.id, role: 'doctor' } as any, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: A.id, doctorName: A.name, status: 'permission_start', shift: 'morning' } as any);
    let rows = await dayRows();
    const aAfter = seatOf(rows, A.id); const bAfter = seatOf(rows, B.id);
    check('A انتقل للفترة ٢ (بُدِّل)', !!aAfter && aAfter.period === 2 && aAfter.clinic_number === clinicC, JSON.stringify(aAfter && { p: aAfter.period, c: aAfter.clinic_number }));
    check('B انتقل للفترة ١', !!bAfter && bAfter.period === 1 && bAfter.clinic_number === clinicC, JSON.stringify(bAfter && { p: bAfter.period, c: bAfter.clinic_number }));
    check('حُفظت لقطة (prev_placement) لـA', prevOf(rows, A.id).length > 0, 'لا لقطة');

    console.log('\n====== ② إلغاء الاستئذان (العالم ثابت) → عودةٌ لمقعده ======');
    const aIdx = roster.findIndex((d) => d.id === A.id) + 1;
    const ctx: any = { clinicId: CID, user: { id: A.id, name: A.name, role: 'doctor' }, roster };
    const raw = await dispatchRequestToolV2('cancel_schedule_status', { weekStart: WEEK, day: DAY, doctorIndex: aIdx }, ctx);
    console.log('  → ', raw.replace(FINAL_MARK, '').slice(0, 120));
    rows = await dayRows();
    const aBack = seatOf(rows, A.id); const bBack = seatOf(rows, B.id);
    check('A عاد للفترة ١ (مقعده الأصليّ)', !!aBack && aBack.period === 1 && aBack.clinic_number === clinicC, JSON.stringify(aBack && { p: aBack.period, c: aBack.clinic_number }));
    check('B عاد للفترة ٢', !!bBack && bBack.period === 2 && bBack.clinic_number === clinicC, JSON.stringify(bBack && { p: bBack.period, c: bBack.clinic_number }));
    check('اللقطة أُزيلت', prevOf(rows, A.id).length === 0, 'بقيت لقطة');
    check('لا علامة استئذان باقية', !rows.some((r) => r.doctor_id === A.id && r.period === 0 && (r.status === 'permission_start' || r.status === 'permission_end')), 'علامة باقية');
    check('الردّ يذكر العودة للمقعد', /عاد إلى مقعده/.test(raw), raw.slice(0, 80));

    console.log('\n====== ③ العالم تغيّر (الشريك B غاب) → عودةٌ بإعادة حساب، بلا كسر ======');
    await requestsV2.setScheduleStatus({ id: A.id, role: 'doctor' } as any, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: A.id, doctorName: A.name, status: 'permission_start', shift: 'morning' } as any);
    await requestsV2.setScheduleStatus({ id: B.id, role: 'team_leader' } as any, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: B.id, doctorName: B.name, status: 'sick_leave', shift: 'morning' } as any);
    const raw3 = await dispatchRequestToolV2('cancel_schedule_status', { weekStart: WEEK, day: DAY, doctorIndex: aIdx }, ctx);
    console.log('  → ', raw3.replace(FINAL_MARK, '').slice(0, 120));
    rows = await dayRows();
    check('A عاد إلى العيادة رغم تغيّر العالم', !!seatOf(rows, A.id), 'A غير منسَّب');
    check('لقطة A أُزيلت', prevOf(rows, A.id).length === 0, 'بقيت لقطة');
    await requestsV2.cancelStatus({ id: B.id, role: 'team_leader' } as any, { clinicId: CID, weekStart: WEEK, day: DAY, doctorId: B.id, restoreToPrevPlace: true } as any).catch(() => {});

    console.log(`\n====== النتيجة: ${pass} PASS / ${fail} FAIL ======`);
    if (fails.length) { console.log('الإخفاقات:'); fails.forEach((f) => console.log('  • ' + f)); }
  } finally {
    await clean();
    await supabase.from('schedule_settings').update({ clinic_count: origCC }).eq('clinic_id', CID);
  }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
