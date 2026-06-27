/* الطلباتُ المركّبة — لا يُفقَد قرارٌ + التسلسل (نواةُ الحالة).
 *  يحاكي بالضبط ما يفعله مُجمِّعُ index.ts: طابورُ عروضِ الإبلاغ يُراكَم (push + إزالةُ مكرّر)
 *  بدل قيمةٍ واحدةٍ تُكتَب فوقها فتضيع. نثبت على مستوى الموزّع (نفس عقد المحرّك):
 *   (أ) طلبٌ مركّب (طبيّةُ س الأحد + استئذانُ ص الإثنين) → عرضا إبلاغٍ مُراكَمان (لا فقدان).
 *   (ب) كلُّ عرضٍ يخصُّ صاحبَه ويومَه (مرتّبٌ بترتيب التنفيذ).
 *   (ج) تكرارُ نفس الحالة → المحرّك يكتمه فلا يُضاف للطابور (يبقى ٢ لا ٣).
 */
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';
import { dispatchRequestToolV2 } from '../lib/ai_v2/tools_requests_v2';
import type { AnnounceOffer, V2ToolContext } from '../lib/ai_v2/tools';
import { supabase } from '../lib/supabase';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-03-08';   // أحدٌ مستقبليّ
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

const clinicDoc = (slots: any[], day: WeekDay, pool: { id: string }[]) =>
  slots.find((s) => DI[s.dayOfWeek] === DI[day] && [1, 2].includes(s.period) && s.status === 'active' && s.role === 'clinic' && pool.some((p) => p.id === s.doctorId));

(async () => {
  try {
    await buildWeek();
    const data = (await loadScheduleData(CID, W)).data!;
    const pool = data.doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus === 'active');

    const X = clinicDoc(data.existingSlots, 'sunday', pool);
    // طبيبٌ آخر (≠X) يعمل عيادةً يوم الإثنين — صاحبُ العرض الثاني.
    const Y = data.existingSlots.find((s) => DI[s.dayOfWeek] === 1 && [1, 2].includes(s.period)
      && s.status === 'active' && s.role === 'clinic' && pool.some((p) => p.id === s.doctorId) && s.doctorId !== X?.doctorId);
    if (!X || !Y) { console.log('ℹ لا طبيبان مناسبان — تخطّي.'); console.log('\n0 PASS / 0 FAIL'); process.exit(0); }
    const Xid = X.doctorId, Xname = X.doctorName, Yid = Y.doctorId, Yname = Y.doctorName;

    // مُجمِّعُ الطابور — **نفسُ منطق index.ts** (push + إزالةُ مكرّر بمفتاح subject|day|message).
    const announces: AnnounceOffer[] = [];
    const pushAnn = (o: AnnounceOffer) => {
      const k = `${o.subjectId}|${o.day}|${o.message}`;
      if (!announces.some((p) => `${p.subjectId}|${p.day}|${p.message}` === k)) announces.push(o);
    };
    // فاعلٌ بصلاحيّة super_admin (ليس الطبيبَ المعنيّ) فيُطلَق الإبلاغ، وroster يحوي X ثمّ Y.
    const adminId = (data.doctors.find((d) => d.id !== Xid && d.id !== Yid) || data.doctors[0]!).id;
    const ctx: V2ToolContext = {
      clinicId: CID, user: { id: adminId, name: 'فاعل', role: 'super_admin' },
      roster: [{ id: Xid, name: Xname }, { id: Yid, name: Yname }], onAnnounceOffer: pushAnn,
    };

    // ── طلبٌ مركّب: عمليّتان في نفس الجولة، نفسُ المُجمِّع ──
    const o1 = await dispatchRequestToolV2('set_schedule_status', { weekStart: W, day: 'sunday', doctorIndex: 1, status: 'sick_leave', shift: 'morning' }, ctx);
    check('(أ) العمليّة الأولى نجحت (طبيّة س الأحد)', !o1.startsWith('Tool error'), o1);
    check('(أ) بعد الأولى: عرضٌ واحدٌ في الطابور', announces.length === 1, `len=${announces.length}`);
    const o2 = await dispatchRequestToolV2('set_schedule_status', { weekStart: W, day: 'monday', doctorIndex: 2, status: 'permission_start', shift: 'morning' }, ctx);
    check('(أ) العمليّة الثانية نجحت (استئذان ص الإثنين)', !o2.startsWith('Tool error'), o2);

    // الجوهر: العرضُ الأوّل لم يُطمَس — كلاهما في الطابور.
    check('(أ) لا فقدان: عرضا إبلاغٍ مُراكَمان', announces.length === 2, `len=${announces.length} (المتوقّع ٢)`);
    check('(ب) العرض ١ يخصّ X يوم الأحد', announces[0]?.subjectId === Xid && announces[0]?.day === 'sunday', JSON.stringify(announces[0]));
    check('(ب) العرض ٢ يخصّ Y يوم الإثنين', announces[1]?.subjectId === Yid && announces[1]?.day === 'monday', JSON.stringify(announces[1]));

    // ── (ج) تكرارُ نفس حالة X → يكتمه المحرّك (لا onAnnounceOffer) فلا ينمو الطابور ──
    const dup = await dispatchRequestToolV2('set_schedule_status', { weekStart: W, day: 'sunday', doctorIndex: 1, status: 'sick_leave', shift: 'morning' }, ctx);
    check('(ج) تكرار: لا نموّ للطابور (يبقى ٢)', announces.length === 2 && /مكرّر|مسجّل/.test(dup), `len=${announces.length} out=${dup}`);
  } finally {
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await supabase.from('notifications').delete().eq('clinic_id', CID).in('type', ['request_info', 'gap_alert', 'shortage_alert', 'seat_change', 'rebalance_consent']);
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
