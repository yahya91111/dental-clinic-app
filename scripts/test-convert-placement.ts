/* ب٢: تحويلُ غيابٍ مُغطًّى (مرضية) إلى استئذان → المحرّك يُعيد إجلاس العائد تلقائيًّا
 * (تغطيةٌ عكسيّة، خيار أ) بلا كرت «تحديد المكان». نتحقّق:
 *  (أ) بعد التحويل: للطبيب مقعدٌ نشطٌ في فترته الحاضرة (استئذان بداية يحجب ف١ → حاضرٌ ف٢).
 *  (ب) ليس نشطًا في الفترة المحجوبة (الاستئذان محترَم).
 *  (ج) لا كرت «تحديد المكان» (gap_alert فيه data.placement) لأيّ قائد. */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import { dispatchRequestToolV2 } from '../lib/ai_v2/tools_requests_v2';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };
type Ctx = Parameters<typeof dispatchRequestToolV2>[2];

async function buildWeek() {
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, 'beginner'> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning'])) as Record<string, 'morning'>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' }, includeInExRotation: false }, traineeModes: tm } as Parameters<typeof schedule.build>[0];
  await schedule.build({ ...recipe, dryRun: false });
  await schedule.saveBuildConfig({ ...recipe, dryRun: true } as Parameters<typeof schedule.saveBuildConfig>[0]);
}

(async () => {
  try {
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildWeek();
    const d = (await loadScheduleData(CID, W)).data!;
    const roster = d.doctors.map((x) => ({ id: x.id, name: x.name, groupKey: x.groupTemplate.key }));
    const idx = (id: string) => roster.findIndex((r) => r.id === id) + 1;

    // طبيبٌ عاديّ (لا بورد/متدرّب/تخفيف) له مقعدُ عيادةٍ نشطٌ في الفترة ٢ الخميس —
    // فاستئذانُ البداية (يحجب ف١) يُبقيه حاضرًا ف٢، فنرى استردادَ مقعده بوضوح.
    const thu = d.existingSlots.filter((s) => s.dayOfWeek === 'thursday' && s.status === 'active' && s.role === 'clinic' && s.period === 2);
    const regular = new Set(d.doctors.filter((x) => x.groupTemplate.key !== 'board' && x.workStatus !== 'trainee' && x.workStatus !== 'light_duty').map((x) => x.id));
    const target = thu.find((s) => regular.has(s.doctorId));
    if (!target) { console.log('ℹ لا طبيب عاديّ في ف٢ الخميس — تخطّي.'); return; }
    const Aid = target.doctorId;
    const selfCtx: Ctx = { clinicId: CID, user: { id: Aid, name: d.doctors.find((x) => x.id === Aid)!.name, role: 'doctor' }, roster };

    // ① مرضيّة الخميس (يُغطّى مقعده، يُحفظ prev_placement)
    const sick = await dispatchRequestToolV2('set_schedule_status', { doctorIndex: idx(Aid), day: 'thursday', status: 'sick_leave', weekStart: W }, selfCtx);
    check('① مرضيّة سُجّلت', !sick.startsWith('Tool error'), sick);
    const afterSick = (await loadScheduleData(CID, W)).data!.existingSlots
      .filter((s) => s.dayOfWeek === 'thursday' && s.doctorId === Aid && s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator'));
    check('① بعد المرضيّة: بلا مقعدٍ نشط (مُغطّى)', afterSick.length === 0, JSON.stringify(afterSick.map((s) => s.period)));

    // امسح كروت القادة قبل التحويل لعزل ما يُنشئه
    await supabase.from('notifications').delete().eq('clinic_id', CID).eq('type', 'gap_alert');

    // ② تحويلٌ إلى استئذان بداية (يحجب ف١، حاضرٌ ف٢)
    const conv = await dispatchRequestToolV2('set_schedule_status', { doctorIndex: idx(Aid), day: 'thursday', status: 'permission_start', weekStart: W }, selfCtx);
    check('② التحويل إلى استئذان نجح', !conv.startsWith('Tool error'), conv);

    const after = (await loadScheduleData(CID, W)).data!.existingSlots.filter((s) => s.dayOfWeek === 'thursday');
    const mineActive = after.filter((s) => s.doctorId === Aid && s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator'));
    check('(أ) العائد له مقعدٌ نشطٌ في فترته الحاضرة (ف٢)', mineActive.some((s) => s.period === 2), JSON.stringify(mineActive.map((s) => s.period)));
    check('(ب) ليس نشطًا في الفترة المحجوبة (ف١)', !mineActive.some((s) => s.period === 1), JSON.stringify(mineActive.map((s) => s.period)));

    const placementCards = ((await supabase.from('notifications').select('data').eq('clinic_id', CID).eq('type', 'gap_alert')).data as { data: any }[] || [])
      .filter((n) => !!n.data?.placement);
    check('(ج) لا كرت «تحديد المكان» (placement)', placementCards.length === 0, `cards=${placementCards.length}`);
  } finally {
    await supabase.from('notifications').delete().eq('clinic_id', CID).eq('type', 'gap_alert');
    await supabase.from('notifications').delete().eq('clinic_id', CID).eq('type', 'seat_change');
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildWeek();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
