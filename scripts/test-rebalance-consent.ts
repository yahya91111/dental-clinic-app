/* كرت «موازنةُ يومٍ عدّلتَه» (البند ٦): استئذانُ القائد قبل موازنة العدل ليومٍ عدّله يدويًّا.
 *  (أ) الوسمُ: mark/load/clear يدور دورةً كاملة، والصفُّ الموسوم خاملٌ (لا يغيّر التنسيب).
 *  (ب) البوّابة: يومٌ محميٌّ لا تكتب عليه الموازنة (protected-all ⇒ صفر كتابة)، وما كانت
 *      الموازنةُ ستفعله يعود في deferred (تشغيلٌ غير محميٍّ لاحقًا يُطبّق ما أُجِّل).
 *  (ج) دورةُ الكرت: كرتٌ لكلّ قائد، عنوانٌ ونصٌّ صحيحان، لا تكرار، الحسم يُغلِق.
 *  (د) نعم/لا: «لا» تُبقي الحماية وتمنع إعادة السؤال؛ «نعم» ترفع الحماية وتُغلِق الكرت. */
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode, LoadedSlot } from '../lib/algorithms/schedule';
import { applyNewHeartRebalance, applyCoverage, applyReserveRepay, reservePairsFromMoves } from '../lib/algorithms/solver_shadow';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { markLeaderEditedDay, loadLeaderEditedDays, clearLeaderEditedDay } from '../lib/algorithms/leader_marks';
import { notifications } from '../lib/algorithms/notifications';
import { approveRebalance, declineRebalance } from '../lib/ai_v2/tools_requests_v2';
import { supabase } from '../lib/supabase';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-03-08';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };

async function buildWeek() {
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
  await schedule.build({ ...recipe, dryRun: false });
  await schedule.saveBuildConfig({ ...recipe, dryRun: true } as any);
}

// بصمةُ التنسيب النشط (عيادة/دليقيتر) لكلّ يوم — لكشف أيّ كتابةٍ على الجدول.
function placementPrint(slots: LoadedSlot[]): string {
  const rows = slots
    .filter((s) => s.status === 'active' && s.period > 0 && (s.role === 'clinic' || s.role === 'delegator'))
    .map((s) => `${DI[s.dayOfWeek]}|${s.period}|${s.clinicNumber}|${s.role}|${s.doctorId}`)
    .sort();
  return rows.join('\n');
}
const changedDays = (a: LoadedSlot[], b: LoadedSlot[]): Set<WeekDay> => {
  const key = (s: LoadedSlot) => `${s.period}|${s.clinicNumber}|${s.role}|${s.doctorId}`;
  const out = new Set<WeekDay>();
  for (const day of DAYS) {
    const sa = a.filter((s) => DI[s.dayOfWeek] === DI[day] && s.status === 'active' && s.period > 0 && (s.role === 'clinic' || s.role === 'delegator')).map(key).sort().join(',');
    const sb = b.filter((s) => DI[s.dayOfWeek] === DI[day] && s.status === 'active' && s.period > 0 && (s.role === 'clinic' || s.role === 'delegator')).map(key).sort().join(',');
    if (sa !== sb) out.add(day);
  }
  return out;
};
const wipeCards = () => supabase.from('notifications').delete().eq('clinic_id', CID).eq('type', 'rebalance_consent');
const wipeLocks = () => supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).eq('role', 'leader_lock');

(async () => {
  try {
    await buildWeek();
    const { data: leaders } = await supabase.from('doctors').select('id').eq('clinic_id', CID).eq('role', 'team_leader');
    const leaderIds = ((leaders || []) as { id: string }[]).map((r) => r.id);
    if (!leaderIds.length) { console.log('ℹ لا قادة — تخطّي.'); console.log('\n0 PASS / 0 FAIL'); process.exit(0); }
    const L0 = leaderIds[0]!;
    await wipeCards(); await wipeLocks();

    // ── (أ) الوسمُ: دورةٌ كاملة + خمول الصفّ الموسوم ──
    const before = (await loadScheduleData(CID, W)).data!;
    const printBefore = placementPrint(before.existingSlots);
    await markLeaderEditedDay({ clinicId: CID, weekStart: W, day: 'sunday', byId: L0, byName: 'قائد' });
    const marks = await loadLeaderEditedDays({ clinicId: CID, weekStart: W });
    check('(أ) الوسمُ يُحفظ ويُقرأ', marks.has('sunday'), [...marks].join(','));
    await markLeaderEditedDay({ clinicId: CID, weekStart: W, day: 'sunday', byId: L0 }); // تكرار
    const marks2 = await loadLeaderEditedDays({ clinicId: CID, weekStart: W });
    const lockRows = (await supabase.from('schedule_slots').select('id').eq('clinic_id', CID).eq('week_start', W).eq('role', 'leader_lock').eq('day_of_week', 'sunday')).data || [];
    check('(أ) لا يُكرَّر الوسمُ لليوم نفسه', marks2.size === 1 && lockRows.length === 1, `rows=${lockRows.length}`);
    const after = (await loadScheduleData(CID, W)).data!;
    check('(أ) الصفُّ الموسوم خاملٌ (التنسيبُ كما هو)', placementPrint(after.existingSlots) === printBefore, 'تغيّر التنسيب!');
    await clearLeaderEditedDay({ clinicId: CID, weekStart: W, day: 'sunday' });
    check('(أ) رفعُ الوسم يحذفه', !(await loadLeaderEditedDays({ clinicId: CID, weekStart: W })).has('sunday'));

    // ── (ب) البوّابة: محميٌّ ⇒ صفر كتابة + ما أُجِّل يُطبَّق لاحقًا ──
    // اضطرابٌ يخلق فرصةَ موازنة (غيرَ خاملة): اجعل دليقيتر الإثنين (A) دليقيترَ الأحد أيضًا
    // (استضافةٌ مضاعفةٌ في الأسبوع) عبر تبديلٍ يدويٍّ على الأحد — فالموازنةُ تريد تخفيفَ A.
    {
      const d0 = (await loadScheduleData(CID, W)).data!;
      const deleg = (day: WeekDay) => d0.existingSlots.find((s) => DI[s.dayOfWeek] === DI[day] && s.role === 'delegator' && s.status === 'active' && s.period > 0);
      const monDel = deleg('monday'); const sunDel = deleg('sunday');
      if (monDel && sunDel && monDel.doctorId !== sunDel.doctorId) {
        const A = monDel.doctorId;
        const aSunClinic = d0.existingSlots.some((s) => DI[s.dayOfWeek] === 0 && s.doctorId === A && s.role === 'clinic' && s.status === 'active' && s.period > 0);
        if (aSunClinic) {
          const actor = { id: d0.doctors[0]!.id, role: 'super_admin' };
          await requestsV2.swapFullPositions(actor, { clinicId: CID, weekStart: W, day: 'sunday', aId: A, bId: sunDel.doctorId });
        }
      }
    }
    const S0 = (await loadScheduleData(CID, W)).data!.existingSlots;
    const print0 = placementPrint(S0);
    // محميٌّ-للكلّ أولًا: لا يجوز أن يكتب شيئًا.
    const rP = await applyNewHeartRebalance({ clinicId: CID, weekStart: W, label: 'اختبار-محميّ', protectedDays: new Set(DAYS) });
    const S1 = (await loadScheduleData(CID, W)).data!.existingSlots;
    check('(ب) محميٌّ-للكلّ ⇒ صفر تطبيق', rP.applied === 0, `applied=${rP.applied}`);
    check('(ب) محميٌّ-للكلّ ⇒ صفر كتابة (التنسيبُ كما هو)', placementPrint(S1) === print0, 'كُتِب على يومٍ محميّ!');
    // غيرُ محميّ: يُطبّق ما كان سيُطبّق (الحالةُ لم تتغيّر، فالتوصيةُ نفسها).
    const rU = await applyNewHeartRebalance({ clinicId: CID, weekStart: W, label: 'اختبار-حرّ' });
    const S2 = (await loadScheduleData(CID, W)).data!.existingSlots;
    const cu = changedDays(S0, S2);
    if (rU.applied > 0) {
      check('(ب) المحميُّ أجَّل ما طبّقه الحرُّ (cu ⊆ deferred)', [...cu].every((d) => rP.deferred.includes(d)), `cu=${[...cu]} deferred=${rP.deferred}`);
    } else {
      console.log(`  ℹ الفكسجر لا موازنةَ فيه (applied=0) — البوّابةُ تُحقَّق خاملًا فقط. deferred=${rP.deferred.length}`);
      check('(ب) لا تأجيلٌ حين لا موازنة', rP.deferred.length === 0, `deferred=${rP.deferred}`);
    }

    // ── (ج) دورةُ الكرت: لكلّ قائد، عنوان/نصّ، لا تكرار، الحسم يُغلق ──
    await wipeCards();
    for (const id of leaderIds) await notifications.notifyRebalanceConsent({ clinicId: CID, leaderId: id, weekStart: W, day: 'sunday', senderId: L0, senderName: 'قائد' });
    let cards = (await supabase.from('notifications').select('recipient_id, title, body, data, action_status').eq('clinic_id', CID).eq('type', 'rebalance_consent')).data as any[] || [];
    check('(ج) كرتٌ لكلّ قائد', cards.length === leaderIds.length && leaderIds.every((id) => cards.some((c) => c.recipient_id === id)), `cards=${cards.length} leaders=${leaderIds.length}`);
    check('(ج) العنوان «موازنةُ يومٍ عدّلتَه»', cards[0]?.title === 'موازنةُ يومٍ عدّلتَه', cards[0]?.title);
    check('(ج) النصّ يذكر اليوم + للموازنة', /للموازنة/.test(cards[0]?.body || '') && cards[0]?.data?.day === 'sunday', cards[0]?.body);
    // تكرار: لا كرت جديد.
    await notifications.notifyRebalanceConsent({ clinicId: CID, leaderId: L0, weekStart: W, day: 'sunday' });
    cards = (await supabase.from('notifications').select('id').eq('clinic_id', CID).eq('type', 'rebalance_consent')).data as any[] || [];
    check('(ج) لا تكرار لنفس (قائد، أسبوع، يوم)', cards.length === leaderIds.length, `cards=${cards.length}`);
    await notifications.resolveRebalanceConsent({ clinicId: CID, weekStart: W, day: 'sunday', decision: 'accepted' });
    const open = (await supabase.from('notifications').select('id').eq('clinic_id', CID).eq('type', 'rebalance_consent').or('action_status.is.null,action_status.eq.pending')).data as any[] || [];
    check('(ج) الحسمُ يُغلق عند كلّ القادة', open.length === 0, `open=${open.length}`);

    // ── (د) نعم/لا ──
    await wipeCards(); await wipeLocks();
    await markLeaderEditedDay({ clinicId: CID, weekStart: W, day: 'monday', byId: L0 });
    for (const id of leaderIds) await notifications.notifyRebalanceConsent({ clinicId: CID, leaderId: id, weekStart: W, day: 'monday', senderId: L0 });
    // «لا»: تُبقي الحماية + تمنع إعادة السؤال.
    const dr = await declineRebalance({ clinicId: CID, weekStart: W, day: 'monday' });
    check('(د) declineRebalance نجح', dr.success, dr.error || '');
    check('(د) «لا» تُبقي الحماية', (await loadLeaderEditedDays({ clinicId: CID, weekStart: W })).has('monday'));
    const rej = (await supabase.from('notifications').select('action_status').eq('clinic_id', CID).eq('type', 'rebalance_consent').eq('recipient_id', L0)).data as any[] || [];
    check('(د) «لا» تُسجَّل رفضًا', rej[0]?.action_status === 'rejected', rej[0]?.action_status);
    const cntBefore = (await supabase.from('notifications').select('id').eq('clinic_id', CID).eq('type', 'rebalance_consent')).data?.length || 0;
    await notifications.notifyRebalanceConsent({ clinicId: CID, leaderId: L0, weekStart: W, day: 'monday' }); // يجب ألّا يُنشئ كرتًا
    const cntAfter = (await supabase.from('notifications').select('id').eq('clinic_id', CID).eq('type', 'rebalance_consent')).data?.length || 0;
    check('(د) «لا» تمنع إعادة السؤال (رفضٌ قائم)', cntAfter === cntBefore, `before=${cntBefore} after=${cntAfter}`);
    // «نعم»: ترفع الحماية وتُغلق الكرت.
    await wipeCards();
    for (const id of leaderIds) await notifications.notifyRebalanceConsent({ clinicId: CID, leaderId: id, weekStart: W, day: 'monday', senderId: L0 });
    const ap = await approveRebalance({ clinicId: CID, weekStart: W, day: 'monday' });
    check('(د) approveRebalance نجح', ap.success, ap.error || '');
    check('(د) «نعم» ترفع الحماية', !(await loadLeaderEditedDays({ clinicId: CID, weekStart: W })).has('monday'));
    const openAfterYes = (await supabase.from('notifications').select('id').eq('clinic_id', CID).eq('type', 'rebalance_consent').or('action_status.is.null,action_status.eq.pending')).data as any[] || [];
    check('(د) «نعم» تُغلق الكرت عند الجميع', openAfterYes.length === 0, `open=${openAfterYes.length}`);
  } finally {
    await wipeCards(); await wipeLocks();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
