/* فحصٌ آليّ — السيناريوهات المتقدّمة على النموذج المعزول (2099-01-04). */
import { supabase } from '../lib/supabase';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { notifications } from '../lib/algorithms/notifications';
import { sendSwapRequestModeByCode } from '../lib/ai_v2/tools_requests_v2';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
const PFX: Record<string, string> = { mohammed: '65dfbacc', yahya: '95262a82', shahad: '3aebd552', fatmaAsad: 'c173f26e' };
const full: Record<string, string> = {}; const names: Record<string, string> = {};
let pass = 0; let fail = 0; const fails: string[] = [];
function check(n: string, c: boolean, d = '') { if (c) { pass++; console.log(`  PASS ${n}`); } else { fail++; fails.push(`${n} — ${d}`); console.log(`  FAIL ${n} — ${d}`); } }
const doc = (k: string) => ({ id: full[k], name: names[full[k]] });
const TL = () => ({ id: full.yahya, role: 'team_leader' });
async function placed(id: string, day: string) {
  const { data } = await supabase.from('schedule_slots').select('period,clinic_number,role,status').eq('week_start', WEEK).eq('clinic_id', CID).eq('day_of_week', day).eq('doctor_id', id);
  return ((data || []) as any[]).filter((r) => r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'));
}
async function isReserve(id: string, day: string) {
  const { data } = await supabase.from('schedule_slots').select('status').eq('week_start', WEEK).eq('clinic_id', CID).eq('day_of_week', day).eq('doctor_id', id).eq('status', 'extra');
  return (data || []).length > 0;
}
async function status0(id: string, day: string) {
  const { data } = await supabase.from('schedule_slots').select('status').eq('week_start', WEEK).eq('clinic_id', CID).eq('day_of_week', day).eq('doctor_id', id).eq('period', 0).neq('status', 'active');
  return ((data || []) as any[]).map((r) => r.status);
}
async function swapCards(reqId: string) { const { data } = await supabase.from('notifications').select('id,action_status,data').eq('type', 'swap_request'); return ((data || []) as any[]).filter((r) => r.data?.requester_id === reqId); }
async function clearSwaps(reqId: string) { for (const c of await swapCards(reqId)) await supabase.from('notifications').delete().eq('id', c.id); }
async function clearGapAlerts(recipId: string) { const { data } = await supabase.from('notifications').select('id').eq('type', 'gap_alert').eq('recipient_id', recipId); for (const r of (data || []) as any[]) await supabase.from('notifications').delete().eq('id', r.id); }
async function clearDay(id: string, day: string) { await requestsV2.cancelStatus({ id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: id, restoreToPrevPlace: true }).catch(() => {}); }
async function ids() { const { data } = await supabase.from('doctors').select('id,name').eq('clinic_id', CID); for (const d of (data || []) as any[]) { names[d.id] = d.name; for (const k in PFX) if (d.id.startsWith(PFX[k])) full[k] = d.id; } }
async function lastPeriodDay(id: string) { for (const day of ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday']) { const p = await placed(id, day); if (p.length === 1 && (p[0].period === 2 || p[0].period === 4)) return { day, period: p[0].period }; } return null; }

async function main() {
  await ids();

  console.log('\n====== ١) إلغاء ثمّ إعادة تسجيل (لا «مكرّر» عالق) ======');
  {
    const c = await lastPeriodDay(full.mohammed); const day = c!.day;
    const r1: any = await requestsV2.setScheduleStatus({ id: full.mohammed, role: 'doctor' }, { clinicId: CID, weekStart: WEEK, day, doctorId: full.mohammed, doctorName: names[full.mohammed], status: 'permission_end' } as any);
    check('تسجيلٌ أوّل', r1.success && !r1.duplicate, JSON.stringify(r1.duplicate));
    const cc: any = await requestsV2.cancelStatus(TL(), { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: full.mohammed, restoreToPrevPlace: true });
    check('الإلغاء يحذف الاستئذان', cc.permissionCanceled === true, JSON.stringify(cc));
    check('لا صفّ استئذانٍ بعد الإلغاء', (await status0(full.mohammed, day)).length === 0, (await status0(full.mohammed, day)).join(','));
    const r2: any = await requestsV2.setScheduleStatus({ id: full.mohammed, role: 'doctor' }, { clinicId: CID, weekStart: WEEK, day, doctorId: full.mohammed, doctorName: names[full.mohammed], status: 'permission_end' } as any);
    check('إعادة التسجيل تنجح (لا مكرّر)', r2.success && !r2.duplicate, `dup=${r2.duplicate}`);
    await clearDay(full.mohammed, day);
  }

  console.log('\n====== ٢) إلغاءٌ صادق: كرتٌ قديمٌ «مقبول» لا يمنع ======');
  {
    const day = 'thursday';
    // كرت «مقبول» قديم في مجموعة مختلفة (غير منتهٍ)
    const stale = { v: 2, clinic_id: CID, week_start: WEEK, day, requester_id: full.mohammed, requester_name: names[full.mohammed], target_id: full.yahya, target_name: names[full.yahya], swap_group: `${full.mohammed}|${WEEK}|${day}|999999`, expires_at: '2099-12-31T00:00:00.000Z' };
    await supabase.from('notifications').insert({ recipient_id: full.yahya, sender_id: full.mohammed, type: 'swap_request', title: 'طلب تبديل', body: 'قديم', data: stale, action_status: 'accepted', clinic_id: CID });
    // كرت حيّ معلّق
    await notifications.openSwapGroup({ clinicId: CID, weekStart: WEEK, day: day as any, requesterId: full.mohammed, requesterName: names[full.mohammed], targets: [{ id: full.shahad, name: names[full.shahad] }] } as any);
    const res: any = await notifications.cancelSwapGroup({ requesterId: full.mohammed, weekStart: WEEK, day: day as any });
    check('الإلغاء ينجح رغم الكرت القديم', res.success, JSON.stringify(res));
    const remain = await swapCards(full.mohammed);
    check('المعلّق حُذف، القديم المقبول بقي', remain.length === 1 && remain[0].action_status === 'accepted', `بقي ${remain.length}`);
    await clearSwaps(full.mohammed);
  }

  console.log('\n====== ٣) رفض الجميع → تصعيد (كرت إعادة عرض/قائد) ======');
  {
    const c = await lastPeriodDay(full.mohammed); const day = c!.day;
    await requestsV2.setScheduleStatus({ id: full.mohammed, role: 'doctor' }, { clinicId: CID, weekStart: WEEK, day, doctorId: full.mohammed, doctorName: names[full.mohammed], status: 'permission_end' } as any);
    const tp = c!.period === 2 ? 1 : 3;
    const sent: any = await sendSwapRequestModeByCode({ clinicId: CID, requester: doc('mohammed'), weekStart: WEEK, day, mode: { kind: 'period', period: tp }, excludePeriods: [c!.period], perm: { blocked: [c!.period], targetPeriod: tp, statusAr: 'استئذان نهاية الدوام', leaderIds: [full.yahya] } });
    check('إرسالٌ لمجموعة الفترة', sent.success, sent.error);
    const cards = (await swapCards(full.mohammed)).filter((x) => x.data?.day === day && (x.action_status == null || x.action_status === 'pending'));
    for (const card of cards) await notifications.rejectSwap({ notificationId: card.id });
    // بعد رفض الجميع: كرت gap_alert (perm_retry للطالب) أو كرت قائد
    const { data: ga } = await supabase.from('notifications').select('id,recipient_id,data').eq('type', 'gap_alert');
    const retry = ((ga || []) as any[]).find((n) => n.data?.perm_retry && n.recipient_id === full.mohammed);
    const leaderCard = ((ga || []) as any[]).find((n) => n.data?.perm_conflict && n.recipient_id === full.yahya);
    check('رفض الجميع يُنتج تصعيدًا (إعادة عرض أو قائد)', !!retry || !!leaderCard, `retry=${!!retry} leader=${!!leaderCard}`);
    await clearSwaps(full.mohammed); await clearGapAlerts(full.mohammed); await clearGapAlerts(full.yahya); await clearDay(full.mohammed, day);
  }

  console.log('\n====== ٤) تغطية النقص باحتياطيّ (cover_gap) ======');
  {
    const day = 'monday';
    const p = await placed(full.shahad, day); const cn = p[0]?.clinic_number;
    // جِد محتاطًا حرًّا فعليًّا في هذا اليوم (extra وغير منسَّب في عيادة)
    const { data: extras } = await supabase.from('schedule_slots').select('doctor_id,doctor_name').eq('week_start', WEEK).eq('clinic_id', CID).eq('day_of_week', day).eq('status', 'extra');
    let coverId = ''; let coverName = '';
    for (const e of (extras || []) as any[]) { if ((await placed(e.doctor_id, day)).length === 0) { coverId = e.doctor_id; coverName = e.doctor_name; break; } }
    check('وُجد محتاطٌ حرٌّ لليوم', !!coverId, 'لا محتاط حرّ');
    await requestsV2.setScheduleStatus(TL(), { clinicId: CID, weekStart: WEEK, day, doctorId: full.shahad, doctorName: names[full.shahad], status: 'sick_leave' } as any);
    if (coverId) {
      const cov: any = await requestsV2.coverGap(TL(), { clinicId: CID, weekStart: WEEK, day: day as any, absentDoctorId: full.shahad, target: { kind: 'clinic', clinicNumber: cn }, coverDoctorId: coverId, coverDoctorName: coverName });
      check(`تغطية النقص بـ${coverName} تنجح`, cov.success, JSON.stringify(cov).slice(0, 120));
      check('المحتاط صار في عيادة الغائب', (await placed(coverId, day)).some((r) => r.clinic_number === cn), 'لم يُنسَّب');
    }
    await requestsV2.cancelStatus(TL(), { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: full.shahad, restoreToPrevPlace: true }).catch(() => {});
  }

  console.log('\n====== ٥) حرّاس الصلاحيّة ======');
  {
    const r1: any = await requestsV2.setScheduleStatus({ id: full.mohammed, role: 'doctor' }, { clinicId: CID, weekStart: WEEK, day: 'sunday', doctorId: full.mohammed, doctorName: names[full.mohammed], status: 'extra' } as any);
    check('طبيبٌ لا يجعل نفسه احتياطًا', !r1.success, 'سُمح');
    const r2: any = await requestsV2.setScheduleStatus({ id: full.mohammed, role: 'doctor' }, { clinicId: CID, weekStart: WEEK, day: 'sunday', doctorId: full.shahad, doctorName: names[full.shahad], status: 'sick_leave' } as any);
    check('طبيبٌ لا يغيّب غيره', !r2.success, 'سُمح');
  }

  console.log(`\n====== النتيجة: ${pass} PASS / ${fail} FAIL ======`);
  if (fails.length) { console.log('\nالإخفاقات:'); for (const f of fails) console.log('  • ' + f); }
}
main().catch((e) => { console.error('HARNESS ERR', e.message, e.stack); process.exit(1); });
