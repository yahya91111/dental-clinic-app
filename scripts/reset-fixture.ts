/* إعادة ضبط الفكسجر نظيفًا: عيادات=3، حذف صفوف المرضيّة/الإجازة/الإحلال/الطلبات،
 * وإعادة بناء الأسابيع الثلاثة بالوصفة القياسيّة. */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEKS = ['2099-01-04', '2099-01-11', '2099-01-18'];
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];

(async () => {
  await supabase.from('schedule_settings').update({ clinic_count: 3 }).eq('clinic_id', CID);
  for (const W of WEEKS) {
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).in('status', ['sick_leave', 'vacation']);
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).eq('role', 'prev_placement');
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).eq('source', 'request');
  }
  const { newHeartConfig } = await import('../lib/algorithms/new_heart_config');
  newHeartConfig.mode = 'off';
  for (const W of WEEKS) {
    const pre = await loadScheduleData(CID, W);
    const tm: Record<string, TraineeMode> = {};
    for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
    const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
    const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
    await schedule.build({ ...recipe, dryRun: false });
    await schedule.saveBuildConfig({ ...recipe, dryRun: true } as any);
    console.log(`✓ أُعيد بناء ${W}`);
  }
  const check = (await loadScheduleData(CID, WEEKS[0]!)).data!;
  const sick = check.existingSlots.filter((s) => s.status === 'sick_leave' || s.status === 'vacation').length;
  const prev = check.existingSlots.filter((s) => s.role === 'prev_placement').length;
  console.log(`\nعيادات=3 | مرضيّة/إجازة متبقّية=${sick} | إحلال متبقّي=${prev} ${sick === 0 && prev === 0 ? '✅ نظيف' : '⚠️'}`);
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
