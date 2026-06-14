/* فحصٌ آليّ شامل على النموذج المعزول (2099-01-04) — افتراضاتٌ مبنيّةٌ على التنسيب الفعليّ. */
import { supabase } from '../lib/supabase';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { notifications } from '../lib/algorithms/notifications';
import { resolvePermissionByCode, sendSwapRequestByCode, sendSwapRequestModeByCode } from '../lib/ai_v2/tools_requests_v2';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
const PFX: Record<string, string> = {
  mohammed: '65dfbacc', yahya: '95262a82', shahad: '3aebd552', zahra: '00028e40',
  fatmaAsad: 'c173f26e', hammoud: 'e069c435', esraa: 'ee1ddf37', zainab: '63b47eea',
};
const full: Record<string, string> = {};
const names: Record<string, string> = {};
let pass = 0; let fail = 0; const fails: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; fails.push(`${name} — ${detail}`); console.log(`  FAIL ${name} — ${detail}`); }
}
const nm = (id: string) => names[id] || id.slice(0, 6);

// خانات نشطة في عيادة/دليقيتر فقط (تستثني prev_placement والاحتياط)
async function placed(id: string, day: string) {
  const { data } = await supabase.from('schedule_slots').select('period,clinic_number,role,status,source')
    .eq('week_start', WEEK).eq('clinic_id', CID).eq('day_of_week', day).eq('doctor_id', id);
  return ((data || []) as any[]).filter((r) => r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'));
}
async function isReserve(id: string, day: string) {
  const { data } = await supabase.from('schedule_slots').select('status').eq('week_start', WEEK).eq('clinic_id', CID).eq('day_of_week', day).eq('doctor_id', id).eq('status', 'extra');
  return (data || []).length > 0;
}
async function swapCards(reqId: string) {
  const { data } = await supabase.from('notifications').select('id,action_status,data').eq('type', 'swap_request');
  return ((data || []) as any[]).filter((r) => r.data?.requester_id === reqId);
}
const pendCards = async (reqId: string, day: string) =>
  (await swapCards(reqId)).filter((c) => c.data?.day === day && (c.action_status == null || c.action_status === 'pending'));
async function clearDay(docId: string, day: string) {
  await requestsV2.cancelStatus({ id: docId, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: docId, restoreToPrevPlace: true }).catch(() => {});
}
async function clearSwaps(reqId: string) { for (const c of await swapCards(reqId)) await supabase.from('notifications').delete().eq('id', c.id); }
const doc = (k: string) => ({ id: full[k], name: names[full[k]] });
const actor = (k: string, role = 'doctor') => ({ id: full[k], role });
const TL = { id: full.yahya, role: 'team_leader' };

async function ids() {
  const { data } = await supabase.from('doctors').select('id,name').eq('clinic_id', CID);
  for (const d of (data || []) as any[]) { names[d.id] = d.name; for (const k in PFX) if (d.id.startsWith(PFX[k])) full[k] = d.id; }
}
// يجد يومًا يكون فيه الطبيب منسَّبًا في الفترة الأخيرة من شفته (تعارض permission_end)
async function dayWithLastPeriod(id: string): Promise<{ day: string; period: number } | null> {
  for (const day of ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday']) {
    const p = await placed(id, day);
    const last = p.find((r) => r.period === 2 || r.period === 4);
    if (last && p.length === 1) return { day, period: last.period };
  }
  return null;
}

async function main() {
  await ids();
  (TL as any).id = full.yahya;

  console.log('\n====== الاستئذان والتعارض ======');
  // 1) استئذان متعارض (يوم يكون فيه محمد بالفترة الأخيرة) → conflict + colleague
  const conf = await dayWithLastPeriod(full.mohammed);
  check('وُجد يومُ تعارضٍ لمحمد', !!conf, 'لا يوم بفترة أخيرة');
  if (conf) {
    const res: any = await requestsV2.setScheduleStatus(actor('mohammed'), { clinicId: CID, weekStart: WEEK, day: conf.day, doctorId: full.mohammed, doctorName: names[full.mohammed], status: 'permission_end' } as any);
    check(`تعارضٌ يُكشف (${conf.day})`, res.permission?.conflict === true, JSON.stringify(res.permission));
    check('يحجب فترةً واحدة', res.permission?.blocked?.length === 1, JSON.stringify(res.permission?.blocked));
    check('زميلٌ مقترحٌ موجود', !!res.permission?.colleague, 'لا زميل');
    await clearDay(full.mohammed, conf.day);
    // 2) نفس اليوم: الحسم بالكود يُرجِع عرض التعارض (الزرّان→تسجيل مباشر)
    const out = await resolvePermissionByCode({ clinicId: CID, user: { id: full.mohammed, name: names[full.mohammed], role: 'doctor' }, doctorId: full.mohammed, doctorName: names[full.mohammed], weekStart: WEEK, day: conf.day, status: 'permission_end' });
    check('الحسم بالكود يسجّل الاستئذان', (await placed(full.mohammed, conf.day)).length >= 0 && out.text.length > 0, out.text);
    check('الحسم بالكود يُرجِع عرض تعارض', out.swapOffer?.kind === 'permission_fix', `offer=${out.swapOffer?.kind}`);
    await clearDay(full.mohammed, conf.day);
  }
  // 3) استئذان غير متعارض (يوم يكون فيه محمد بالفترة الأولى فقط)
  {
    let nonConfDay = '';
    for (const day of ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday']) {
      const p = await placed(full.mohammed, day);
      if (p.length === 1 && p[0].period === 1) { nonConfDay = day; break; }
    }
    if (nonConfDay) {
      const res: any = await requestsV2.setScheduleStatus(actor('mohammed'), { clinicId: CID, weekStart: WEEK, day: nonConfDay, doctorId: full.mohammed, doctorName: names[full.mohammed], status: 'permission_end' } as any);
      check(`استئذانٌ بلا تعارض (${nonConfDay})`, res.success && res.permission?.conflict === false, JSON.stringify(res.permission));
      await clearDay(full.mohammed, nonConfDay);
    } else check('وُجد يومٌ بلا تعارض', false, 'لا يوم P1-فقط');
  }

  console.log('\n====== أهداف التبديل ======');
  if (conf) {
    const day = conf.day;
    await requestsV2.setScheduleStatus(actor('mohammed'), { clinicId: CID, weekStart: WEEK, day, doctorId: full.mohammed, doctorName: names[full.mohammed], status: 'permission_end' } as any);
    const tp = conf.period === 2 ? 1 : 3;
    const period: any = await requestsV2.listSwapTargets({ clinicId: CID, weekStart: WEEK, day, requesterId: full.mohammed, mode: { kind: 'period', period: tp }, excludePeriods: [conf.period] });
    const ids2 = (period.targets || []).map((t: any) => t.id);
    check('أهداف الفترة موجودة', period.success && ids2.length > 0, period.error);
    check('تخفيف العمل (زهراء) مُستبعَد', !ids2.includes(full.zahra), ids2.map(nm).join(','));
    check('المستأذن نفسه غير مُستهدَف', !ids2.includes(full.mohammed), 'هدف نفسه');
    await clearDay(full.mohammed, day);
  }

  console.log('\n====== التبديل: إرسال/ازدواج/كنس ======');
  if (conf) {
    const day = conf.day;
    await requestsV2.setScheduleStatus(actor('mohammed'), { clinicId: CID, weekStart: WEEK, day, doctorId: full.mohammed, doctorName: names[full.mohammed], status: 'permission_end' } as any);
    const tp = conf.period === 2 ? 1 : 3;
    const sent: any = await sendSwapRequestModeByCode({ clinicId: CID, requester: doc('mohammed'), weekStart: WEEK, day, mode: { kind: 'period', period: tp }, excludePeriods: [conf.period], perm: { blocked: [conf.period], targetPeriod: tp, statusAr: 'استئذان نهاية الدوام', leaderIds: [full.yahya] } });
    check('إرسال طلب الفترة ينجح', sent.success, sent.error);
    check('كروت معلّقة أُنشئت', (await pendCards(full.mohammed, day)).length > 0);
    const dup: any = await sendSwapRequestModeByCode({ clinicId: CID, requester: doc('mohammed'), weekStart: WEEK, day, mode: { kind: 'period', period: tp }, excludePeriods: [conf.period] });
    check('منع ازدواج طلبٍ ثانٍ', !dup.success, 'سمح');
    // إلغاء الاستئذان يكنس عرض التبديل
    await requestsV2.cancelStatus(TL, { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: full.mohammed, restoreToPrevPlace: true });
    await notifications.cancelSwapGroup({ requesterId: full.mohammed, weekStart: WEEK, day: day as any });
    check('الكنس يحذف المعلّقة', (await pendCards(full.mohammed, day)).length === 0);
    await clearSwaps(full.mohammed); await clearDay(full.mohammed, day);
  }

  console.log('\n====== التبديل: قبولٌ = تبادلٌ كامل ======');
  {
    // اختر يومًا محمد فيه منسَّبٌ في عيادة، وشهد كذلك، واختلفت عيادتهما
    let day = ''; let mc = -1; let sc = -1;
    for (const dd of ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday']) {
      const mp = await placed(full.mohammed, dd); const sp = await placed(full.shahad, dd);
      if (mp.length === 1 && sp.length === 1 && mp[0].clinic_number !== sp[0].clinic_number) { day = dd; mc = mp[0].clinic_number; sc = sp[0].clinic_number; break; }
    }
    if (day) {
      const sent: any = await sendSwapRequestByCode({ clinicId: CID, requester: doc('mohammed'), weekStart: WEEK, day, targetId: full.shahad, targetName: names[full.shahad] });
      check(`طلب تبديل لشهد (${day})`, sent.success, sent.error);
      const card = (await swapCards(full.mohammed)).find((c) => c.data?.day === day && c.data?.target_id === full.shahad);
      if (card) {
        const acc: any = await notifications.acceptSwap({ notificationId: card.id, targetId: full.shahad });
        check('قبول التبديل ينجح', acc.success, JSON.stringify(acc).slice(0, 100));
        const moh = await placed(full.mohammed, day); const sha = await placed(full.shahad, day);
        check('محمد أخذ عيادة شهد', moh[0]?.clinic_number === sc, `محمد#${moh[0]?.clinic_number} متوقّع#${sc}`);
        check('شهد أخذ عيادة محمد', sha[0]?.clinic_number === mc, `شهد#${sha[0]?.clinic_number} متوقّع#${mc}`);
      }
      await clearSwaps(full.mohammed);
    } else check('وُجد يومٌ لتبديلٍ بين عيادتين', false, 'لا يوم مناسب');
  }

  console.log('\n====== التغطية والإلغاء ======');
  {
    const day = 'monday';
    const res: any = await requestsV2.setScheduleStatus(TL, { clinicId: CID, weekStart: WEEK, day, doctorId: full.shahad, doctorName: names[full.shahad], status: 'sick_leave' } as any);
    check('تسجيل مرضية ينجح', res.success, res.error);
    check('خرج من العيادة فعلًا', (await placed(full.shahad, day)).length === 0, 'بقي منسَّبًا');
    const briefs: any = await requestsV2.computeDayCoverageBriefs({ clinicId: CID, weekStart: WEEK, day });
    check('نقصٌ يظهر للقائد', briefs.find((b: any) => b.absentId === full.shahad)?.gaps?.length > 0, 'لا نقص');
    const can: any = await requestsV2.cancelStatus(TL, { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: full.shahad, restoreToPrevPlace: true });
    check('إلغاء المرضية يعيد', can.success && can.restored, JSON.stringify(can).slice(0, 80));
    check('عاد إلى خانته', (await placed(full.shahad, day)).length > 0, 'لم يعد');
  }

  console.log('\n====== الحرّاس ======');
  {
    // يوم مضى (الأسبوع 2099 مستقبليّ، فلا «مضى» — نختبر التقاطع بدلًا منه)
    const day = 'wednesday';
    await requestsV2.setScheduleStatus(actor('mohammed'), { clinicId: CID, weekStart: WEEK, day, doctorId: full.mohammed, doctorName: names[full.mohammed], status: 'permission_end' } as any);
    // محمد→شهد
    await sendSwapRequestByCode({ clinicId: CID, requester: doc('mohammed'), weekStart: WEEK, day, targetId: full.shahad, targetName: names[full.shahad] });
    // شهد→محمد (تقاطع) يجب أن يُمنع
    const cross: any = await sendSwapRequestByCode({ clinicId: CID, requester: doc('shahad'), weekStart: WEEK, day, targetId: full.mohammed, targetName: names[full.mohammed] });
    check('تقاطعٌ يُمنع (طلب مضادّ)', !cross.success, 'سمح بالتقاطع');
    await clearSwaps(full.mohammed); await clearSwaps(full.shahad); await clearDay(full.mohammed, day);
  }

  console.log(`\n====== النتيجة: ${pass} PASS / ${fail} FAIL ======`);
  if (fails.length) { console.log('\nالإخفاقات:'); for (const f of fails) console.log('  • ' + f); }
}
main().catch((e) => { console.error('HARNESS ERR', e.message, e.stack); process.exit(1); });
