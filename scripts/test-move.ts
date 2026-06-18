/* فحصٌ حيّ لأداة النقل move_schedule_status على عيادة الاختبار (أسبوع 2099). */
import { supabase } from '../lib/supabase';
import { dispatchRequestToolV2, FINAL_MARK } from '../lib/ai_v2/tools_requests_v2';
import { requestsV2 } from '../lib/algorithms/requests_v2';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;
const YAHYA = '95262a82'; // قائد
const MO = '65dfbacc';     // طبيبٌ عاديّ (محمد)

let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => {
  if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); }
};

async function loadDocs() { const { data } = await supabase.from('doctors').select('id,name,role').eq('clinic_id', CID); return (data || []) as any[]; }
async function exRows(id: string, day: string) {
  const { data } = await supabase.from('schedule_slots').select('status').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', day).eq('doctor_id', id).eq('period', 0);
  return (data || []) as any[];
}
async function placed(id: string, day: string) {
  const { data } = await supabase.from('schedule_slots').select('period,role,status').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', day).eq('doctor_id', id);
  return ((data || []) as any[]).filter((r) => r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'));
}
async function leaderNotifs(leaderId: string) {
  const { data } = await supabase.from('notifications').select('*').eq('recipient_id', leaderId).order('created_at', { ascending: false }).limit(30);
  return (data || []) as any[];
}
const hasStatus = async (id: string, day: string, s: string) => (await exRows(id, day)).some((r) => r.status === s);

async function main() {
  const docs = await loadDocs();
  const find = (pfx: string) => docs.find((d) => d.id.startsWith(pfx));
  const yahya = find(YAHYA); const mo = find(MO);
  if (!yahya || !mo) { console.error('لم يُعثر على yahya/mohammed'); process.exit(1); }
  const roster = docs.map((d) => ({ id: d.id, name: d.name }));
  const moIdx = roster.findIndex((d) => d.id === mo.id) + 1;
  const ctx: any = { clinicId: CID, user: { id: mo.id, name: mo.name, role: 'doctor' }, roster };
  const TL = { id: yahya.id, role: 'team_leader' as const };

  const pdays: string[] = [];
  for (const d of DAYS) if ((await placed(mo.id, d)).length > 0) pdays.push(d);
  check('محمد منسَّبٌ في يومين على الأقلّ', pdays.length >= 2, `placed=${pdays.join(',')}`);
  if (pdays.length < 2) { console.log(`\n${pass} PASS / ${fail} FAIL`); process.exit(1); }
  const [D1, D2] = pdays;
  for (const d of [D1, D2]) await requestsV2.cancelStatus(TL, { clinicId: CID, weekStart: WEEK, day: d as any, doctorId: mo.id, restoreToPrevPlace: true }).catch(() => {});

  console.log(`\n====== T1: نقل استئذان نفس النوع (${D1} → ${D2}) ======`);
  await requestsV2.setScheduleStatus({ id: mo.id, role: 'doctor' }, { clinicId: CID, weekStart: WEEK, day: D1 as any, doctorId: mo.id, doctorName: mo.name, status: 'permission_end', shift: 'morning' } as any);
  check('بُذِر استئذان نهاية على D1', await hasStatus(mo.id, D1, 'permission_end'));
  const before1 = new Set((await leaderNotifs(yahya.id)).map((n) => n.id));
  const raw1 = await dispatchRequestToolV2('move_schedule_status', { weekStart: WEEK, doctorIndex: moIdx, fromDay: D1, toDay: D2 }, ctx);
  console.log('  → ', raw1.replace(FINAL_MARK, '').slice(0, 120));
  check('النقل أرجع نتيجةً نهائيّة', raw1.startsWith(FINAL_MARK), raw1.slice(0, 80));
  check('D1 لم يعد فيه استئذان (أُلغي)', !(await hasStatus(mo.id, D1, 'permission_end')));
  check('D2 صار فيه استئذان نهاية', await hasStatus(mo.id, D2, 'permission_end'));
  check('محمد عاد للعيادة في D1', (await placed(mo.id, D1)).length > 0);
  const new1 = (await leaderNotifs(yahya.id)).filter((n) => !before1.has(n.id));
  check('وصل إشعارٌ واحدٌ فقط للّيدر', new1.length === 1, `count=${new1.length}`);
  check('الإشعار يذكر «نقل»', new1.length === 1 && /نقل/.test(JSON.stringify(new1[0])), JSON.stringify(new1.map((n) => n.body ?? n.summary)));
  await requestsV2.cancelStatus(TL, { clinicId: CID, weekStart: WEEK, day: D2 as any, doctorId: mo.id, restoreToPrevPlace: true }).catch(() => {});

  console.log(`\n====== T2: نقل بتغيير النوع (مرضية ${D1} → استئذان نهاية ${D2}) ======`);
  await requestsV2.setScheduleStatus({ id: mo.id, role: 'doctor' }, { clinicId: CID, weekStart: WEEK, day: D1 as any, doctorId: mo.id, doctorName: mo.name, status: 'sick_leave', shift: 'morning' } as any);
  check('بُذِرت مرضية على D1', await hasStatus(mo.id, D1, 'sick_leave'));
  const before2 = new Set((await leaderNotifs(yahya.id)).map((n) => n.id));
  const raw2 = await dispatchRequestToolV2('move_schedule_status', { weekStart: WEEK, doctorIndex: moIdx, fromDay: D1, toDay: D2, toStatus: 'permission_end' }, ctx);
  console.log('  → ', raw2.replace(FINAL_MARK, '').slice(0, 120));
  check('D1 لم يعد مرضية', !(await hasStatus(mo.id, D1, 'sick_leave')));
  check('D2 صار استئذان نهاية', await hasStatus(mo.id, D2, 'permission_end'));
  const new2 = (await leaderNotifs(yahya.id)).filter((n) => !before2.has(n.id));
  check('إشعارٌ واحدٌ للنقل', new2.length === 1, `count=${new2.length}`);
  await requestsV2.cancelStatus(TL, { clinicId: CID, weekStart: WEEK, day: D2 as any, doctorId: mo.id, restoreToPrevPlace: true }).catch(() => {});

  console.log('\n====== T3: وجهة استئذانٍ مبهمة → سؤالٌ بأقواس (لا تنفيذ) ======');
  await requestsV2.setScheduleStatus({ id: mo.id, role: 'doctor' }, { clinicId: CID, weekStart: WEEK, day: D1 as any, doctorId: mo.id, doctorName: mo.name, status: 'sick_leave', shift: 'morning' } as any);
  const raw3 = await dispatchRequestToolV2('move_schedule_status', { weekStart: WEEK, doctorIndex: moIdx, fromDay: D1, toDay: D2, toStatus: 'permission' }, ctx);
  console.log('  → ', raw3.replace(FINAL_MARK, '').slice(0, 140));
  check('سأل بداية/نهاية بأقواس', /\[بداية الدوام\]/.test(raw3) && /\[نهاية الدوام\]/.test(raw3), raw3.slice(0, 100));
  check('لم يُنفّذ (D1 مرضية باقية)', await hasStatus(mo.id, D1, 'sick_leave'));
  await requestsV2.cancelStatus(TL, { clinicId: CID, weekStart: WEEK, day: D1 as any, doctorId: mo.id, restoreToPrevPlace: true }).catch(() => {});

  console.log('\n====== T4: لا حالة في يوم المصدر ======');
  const freeDay = DAYS.find((d) => d !== D1 && d !== D2) || D1;
  const raw4 = await dispatchRequestToolV2('move_schedule_status', { weekStart: WEEK, doctorIndex: moIdx, fromDay: freeDay, toDay: D2, toStatus: 'permission_end' }, ctx);
  console.log('  → ', raw4.replace(FINAL_MARK, '').slice(0, 120));
  check('ردّ «لا حالة لنقلها»', /لا حالة/.test(raw4), raw4.slice(0, 100));

  console.log(`\n====== النتيجة: ${pass} PASS / ${fail} FAIL ======`);
  if (fails.length) { console.log('الإخفاقات:'); fails.forEach((f) => console.log('  • ' + f)); }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
