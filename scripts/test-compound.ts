/* فحصٌ حيّ لطلبٍ مركّبٍ (٤ أفعال: نقل + مرضية + تبديل) عبر الذكاء الحقيقيّ. */
import { sendMessageV2, type V2User } from '../lib/ai_v2';
import { supabase } from '../lib/supabase';
import { requestsV2 } from '../lib/algorithms/requests_v2';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
const MO = '65dfbacc';
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;

let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };
const ex = async (id: string, day: string) => { const { data } = await supabase.from('schedule_slots').select('status').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', day).eq('doctor_id', id).eq('period', 0); return (data || []) as any[]; };
const has = async (id: string, day: string, s: string) => (await ex(id, day)).some((r) => r.status === s);
const placedClinic = async (id: string, day: string) => { const { data } = await supabase.from('schedule_slots').select('period,role,status,clinic_number').eq('clinic_id', CID).eq('week_start', WEEK).eq('day_of_week', day).eq('doctor_id', id); return ((data || []) as any[]).filter((r) => r.status === 'active' && r.period > 0 && r.role === 'clinic'); };

async function main() {
  const { data: docs } = await supabase.from('doctors').select('id,name,role').eq('clinic_id', CID);
  const mo = (docs || []).find((d: any) => d.id.startsWith(MO));
  if (!mo) { console.error('mohammed غير موجود'); process.exit(1); }
  const AR: Record<string, string> = { sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };

  const { notifications } = await import('../lib/algorithms/notifications');
  for (const d of DAYS) {
    await requestsV2.cancelStatus({ id: mo.id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: d as any, doctorId: mo.id, restoreToPrevPlace: true }).catch(() => {});
    await notifications.cancelSwapGroup({ requesterId: mo.id, weekStart: WEEK, day: d as any }).catch(() => {});
  }

  // أيّام محمد المنسَّبة (عيادة) — نبني الطلب على أيّامٍ يعمل فيها فعلًا
  const placedDays: string[] = [];
  for (const d of DAYS) if ((await placedClinic(mo.id, d)).length > 0) placedDays.push(d);
  console.log('أيّام محمد المنسَّبة:', placedDays.map((d) => AR[d]).join('، '));
  const moveSrc = placedDays[0];
  const swapDay = placedDays.find((d) => d !== moveSrc) || placedDays[1];
  const rest = DAYS.filter((d) => d !== moveSrc && d !== swapDay);
  const moveDest = rest[0]; const sickDay = rest[1];

  // تهيئة: استئذان نهاية يوم المصدر (كي يُنقَل)
  await requestsV2.setScheduleStatus({ id: mo.id, role: 'doctor' }, { clinicId: CID, weekStart: WEEK, day: moveSrc as any, doctorId: mo.id, doctorName: mo.name, status: 'permission_end', shift: 'morning' } as any);
  console.log(`تهيئة: استئذان نهاية ${AR[moveSrc]} (${await has(mo.id, moveSrc, 'permission_end')})`);

  const user: V2User = { id: mo.id, name: mo.name, role: 'doctor', clinicId: CID, clinicName: 'عيادة الاختبار' };
  const contextData = `Selected week start (Sunday): ${WEEK}\nClinic count: 2\nCurrently viewing: Daily Duty`;
  const msg = `${AR[moveSrc]} كنسل استئذاني وخله ${AR[moveDest]}، و${AR[sickDay]} طبية، و${AR[swapDay]} بدّلني مع أيّ أحد بالشفت الثاني`;

  console.log('\n===== رسالة مركّبة للذكاء =====\n  «' + msg + '»\n');
  const res = await sendMessageV2({ messages: [{ role: 'user', content: msg }], user, clinicId: CID, contextData, task: 'requests' } as any);
  console.log('\n===== ردّ الذكاء =====\n' + (res.message || `(فشل: ${res.error})`) + '\n');

  console.log('===== التحقّق من القاعدة =====');
  check(`${AR[moveSrc]}: لم يعد فيه استئذان (نُقل)`, !(await has(mo.id, moveSrc, 'permission_end')), JSON.stringify((await ex(mo.id, moveSrc)).map((r) => r.status)));
  check(`${AR[moveDest]}: استئذان نهاية`, await has(mo.id, moveDest, 'permission_end'), JSON.stringify((await ex(mo.id, moveDest)).map((r) => r.status)));
  check(`${AR[sickDay]}: مرضية`, await has(mo.id, sickDay, 'sick_leave'), JSON.stringify((await ex(mo.id, sickDay)).map((r) => r.status)));

  // التبديل: طلب تبديلٍ معلّق (الطبيب لنفسه → request) — إشعارٌ جديد أو ذكرُه في الردّ
  const { data: swReq } = await supabase.from('notifications').select('type,body,created_at').eq('clinic_id', CID).order('created_at', { ascending: false }).limit(8);
  const swapHit = ((swReq || []) as any[]).some((n) => /تبديل/.test(JSON.stringify(n))) || /تبديل/.test(res.message || '');
  check(`${AR[swapDay]}: نُفّذ/طُلب تبديل`, swapHit, 'لا أثر تبديل — راجع ردّ الذكاء');

  console.log(`\n===== النتيجة: ${pass} PASS / ${fail} FAIL =====`);
  if (fails.length) { console.log('الإخفاقات:'); fails.forEach((f) => console.log('  • ' + f)); }
  // تنظيف
  for (const d of DAYS) await requestsV2.cancelStatus({ id: mo.id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: d as any, doctorId: mo.id, restoreToPrevPlace: true }).catch(() => {});
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
