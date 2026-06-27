/* تعديلٌ يدويٌّ من الجدول = طلبٌ من الذكاء + قيدُ «لا طلب لماضٍ».
 *  (أ) قيد الزمن: غياب ليومٍ مضى يُرفض (يدويًّا = setScheduleStatus، وذكاءً = dispatch)؛ المستقبل يُقبل.
 *  (ب) الخطّ اليدويّ: نداءُ نفس أداة الذكاء (set_schedule_status) بـroster من عنصرٍ واحد (نمط الواجهة)
 *      → يسجّل الحالة، يُخرج الطبيب من عيادته، يُجري التغطية، ويُبلِغ القادة — كطلبٍ من الذكاء تمامًا.
 *  (ج) سؤال الإبلاغ: حين يكون الفاعلُ هو الطبيبَ نفسه → onAnnounceOffer يُطلَق (الواجهة تعرض الأزرار). */
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { dispatchRequestToolV2, FINAL_MARK } from '../lib/ai_v2/tools_requests_v2';
import type { AnnounceOffer, V2ToolContext } from '../lib/ai_v2/tools';
import { supabase } from '../lib/supabase';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-03-08';     // أحدٌ مستقبليّ (مُتحقَّق في اختبار آخر)
const PAST = '2020-01-05';  // أحدٌ ماضٍ
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

const activeClinic = (slots: any[], day: WeekDay, docId: string) =>
  slots.filter((s) => DI[s.dayOfWeek] === DI[day] && s.doctorId === docId && s.status === 'active' && s.period > 0 && (s.role === 'clinic' || s.role === 'delegator'));
const reqInfoCount = async () =>
  ((await supabase.from('notifications').select('id').eq('clinic_id', CID).eq('type', 'request_info')).data || []).length;

(async () => {
  try {
    await buildWeek();
    const data = (await loadScheduleData(CID, W)).data!;
    const pool = data.doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus === 'active');
    const X = data.existingSlots.find((s) => DI[s.dayOfWeek] === 0 && [1, 2].includes(s.period) && s.status === 'active' && s.role === 'clinic' && pool.some((p) => p.id === s.doctorId));
    if (!X) { console.log('ℹ لا طبيب عيادةٍ مناسب — تخطّي.'); console.log('\n0 PASS / 0 FAIL'); process.exit(0); }
    const Xid = X.doctorId, Xname = X.doctorName;
    // فاعلٌ غير قائدٍ بصلاحيّة super_admin (فيُبلَّغ كلُّ القادة) — وليس الطبيبَ المعنيّ.
    const adminId = (data.doctors.find((d) => d.id !== Xid) || data.doctors[0]!).id;
    const mkCtx = (userId: string, role: string, onAnn?: (o: AnnounceOffer) => void): V2ToolContext => ({
      clinicId: CID, user: { id: userId, name: 'فاعل', role }, roster: [{ id: Xid, name: Xname }], onAnnounceOffer: onAnn,
    });

    // ── (أ) قيد الزمن ──
    const pastReq = await requestsV2.setScheduleStatus({ id: adminId, role: 'super_admin' } as any, {
      clinicId: CID, weekStart: PAST, day: 'sunday', doctorId: Xid, doctorName: Xname, status: 'sick_leave', shift: 'morning',
    });
    check('(أ) يدويًّا: غياب ماضٍ يُرفض', !pastReq.success && /مضى/.test(pastReq.error || ''), pastReq.error || 'نجح!');
    const pastDisp = await dispatchRequestToolV2('set_schedule_status', { weekStart: PAST, day: 'sunday', doctorIndex: 1, status: 'sick_leave', shift: 'morning' }, mkCtx(adminId, 'super_admin'));
    check('(أ) ذكاءً: غياب ماضٍ يُرفض', pastDisp.startsWith('Tool error') && /مضى/.test(pastDisp), pastDisp);

    // ── (ب) الخطّ اليدويّ = الذكاء: dispatch بـroster مفرد ──
    const before = await reqInfoCount();
    let annB: AnnounceOffer | undefined;
    const out = await dispatchRequestToolV2('set_schedule_status', { weekStart: W, day: 'sunday', doctorIndex: 1, status: 'sick_leave', shift: 'morning' }, mkCtx(adminId, 'super_admin', (o) => { annB = o; }));
    check('(ب) نجح (مستقبل، roster مفرد)', !out.startsWith('Tool error'), out);
    const after = (await loadScheduleData(CID, W)).data!;
    check('(ب) الطبيب خرج من عيادته الأحد', activeClinic(after.existingSlots, 'sunday', Xid).length === 0, `بقي ${activeClinic(after.existingSlots, 'sunday', Xid).length}`);
    const sickRow = after.existingSlots.some((s) => DI[s.dayOfWeek] === 0 && s.doctorId === Xid && s.status === 'sick_leave');
    check('(ب) سجِّلت حالة المرضية', sickRow, 'لا صفّ مرضية');
    check('(ب) أُبلِغ القادة (إشعار علم)', (await reqInfoCount()) > before, `before=${before}`);
    // المحرّك يقرّر الإبلاغ لأيّ فاعل (القائدُ عن غيره أيضًا) — لا إعادةَ بناءٍ نصيّ في الواجهة.
    check('(ب) سؤال الإبلاغ يُطلَق للقائد عن غيره', !!annB && annB.subjectId === Xid, JSON.stringify(annB));
    // تكرارٌ لنفس الحالة → يكتمه المحرّك (رجوعٌ مبكّر قبل عرض الإبلاغ) — لا إبلاغ.
    let annDup: AnnounceOffer | undefined;
    const dup = await dispatchRequestToolV2('set_schedule_status', { weekStart: W, day: 'sunday', doctorIndex: 1, status: 'sick_leave', shift: 'morning' }, mkCtx(adminId, 'super_admin', (o) => { annDup = o; }));
    check('(ب) تكرار: لا إبلاغ (المحرّك يكتمه)', !annDup && /مكرّر|مسجّل/.test(dup), `ann=${JSON.stringify(annDup)} out=${dup}`);

    // ── (ج) الفاعلُ نفسُه الطبيب → سؤال الإبلاغ يُطلَق ──
    let announce: AnnounceOffer | undefined;
    const outSelf = await dispatchRequestToolV2('set_schedule_status', { weekStart: W, day: 'monday', doctorIndex: 1, status: 'sick_leave', shift: 'morning' }, mkCtx(Xid, 'doctor', (o) => { announce = o; }));
    check('(ج) نجح غيابُ الطبيب لنفسه', !outSelf.startsWith('Tool error'), outSelf);
    check('(ج) سؤال الإبلاغ يُطلَق (onAnnounceOffer)', !!announce && announce.subjectId === Xid, JSON.stringify(announce));
    check('(ج) النتيجة نهائيّة (FINAL)', outSelf.includes(FINAL_MARK), 'بلا FINAL');
  } finally {
    // تنظيف: حالاتٌ سُجِّلت + إشعارات الأسبوع
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await supabase.from('notifications').delete().eq('clinic_id', CID).in('type', ['request_info', 'gap_alert', 'shortage_alert', 'seat_change', 'rebalance_consent']);
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
