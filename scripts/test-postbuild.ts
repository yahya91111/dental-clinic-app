/* محكّ الامتصاص بعد البناء: في وضع apply، نبني أسبوعًا فيه طبيّة معروفة يوم الخميس،
 * ونتحقّق:
 *  (أ) الجدول مكتمل (لا مقعد عيادة شاغر في أيّ شفت — الطبيّة لا تترك فراغًا).
 *  (ب) تمريرة الامتصاص بعد البناء تعمل (لا تكسر شيئًا؛ لا حجز مزدوج لغير المتدرّبين).
 *  (ج) المقارنة: نفس البناء بوضع off مقابل apply — apply لا يقلّ تغطيةً (وقد يحسّن التوازن). */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode, LoadedSlot, ExtraAbsence } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };

const setCC = async (n: number) => { await supabase.from('schedule_settings').update({ clinic_count: n }).eq('clinic_id', CID); };
async function cleanWeek() {
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).in('status', ['sick_leave', 'vacation']);
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).eq('role', 'prev_placement');
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).eq('source', 'request');
}
async function build(extraAbsences: ExtraAbsence[]) {
  await cleanWeek();
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm, delegatorEnabled: true, extraAbsences };
  await schedule.build({ ...recipe, dryRun: false });
  await schedule.saveBuildConfig({ ...recipe, extraAbsences: [], dryRun: true } as any);
}
const traineesOf = (doctors: any[]) => new Set(doctors.filter((d) => d.workStatus === 'trainee').map((d) => d.id));
function staffed(slots: LoadedSlot[], day: WeekDay, half: 0 | 1, trainees: Set<string>): number {
  const periods = half === 0 ? [1, 2] : [3, 4];
  return new Set(slots.filter((s) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period) && s.status === 'active' && s.role === 'clinic' && s.clinicNumber > 0 && !trainees.has(s.doctorId)).map((s) => `c${s.clinicNumber}#p${s.period}`)).size;
}
function dblBook(slots: LoadedSlot[], day: WeekDay, half: 0 | 1, trainees: Set<string>): boolean {
  const periods = half === 0 ? [1, 2] : [3, 4]; const seen = new Set<string>();
  for (const s of slots.filter((s) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period) && s.status === 'active' && s.role === 'clinic' && !trainees.has(s.doctorId))) { const k = `${s.clinicNumber}#${s.period}`; if (seen.has(k)) return true; seen.add(k); }
  return false;
}

(async () => {
  const origCC = ((await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID).maybeSingle()).data as any)?.clinic_count ?? 3;
  const { newHeartConfig } = await import('../lib/algorithms/new_heart_config');
  try {
    await setCC(3);
    const base = (await loadScheduleData(CID, W)).data!;
    const trainees = traineesOf(base.doctors);
    const pool = base.doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty');
    // اختر طبيب بِركة يعمل الخميس صباحًا ليكون غائبًا معروفًا.
    newHeartConfig.mode = 'off'; await build([]);
    const built = (await loadScheduleData(CID, W)).data!;
    const thuDoc = built.existingSlots.find((s) => DI[s.dayOfWeek] === 4 && [1, 2].includes(s.period) && s.status === 'active' && s.role === 'clinic' && pool.some((p) => p.id === s.doctorId));
    const victimId = thuDoc!.doctorId; const victimName = thuDoc!.doctorName;
    const abs: ExtraAbsence[] = [{ doctorId: victimId, day: 'thursday', scope: 'full' }];
    console.log(`الغائب المعروف يوم الخميس: ${victimName}\n`);

    // ① بناء بوضع off (المرجع).
    newHeartConfig.mode = 'off'; await build(abs);
    const off = (await loadScheduleData(CID, W)).data!;
    // ② بناء بوضع apply (مع الامتصاص بعد البناء).
    newHeartConfig.mode = 'apply'; newHeartConfig.clinics = null; await build(abs);
    const ap = (await loadScheduleData(CID, W)).data!;

    let okComplete = true, okNoDbl = true, okNoLess = true;
    for (const day of DAYS) for (const half of [0, 1] as const) {
      const sOff = staffed(off.existingSlots, day, half, trainees);
      const sAp = staffed(ap.existingSlots, day, half, trainees);
      if (dblBook(ap.existingSlots, day, half, trainees)) { okNoDbl = false; console.log(`   حجز مزدوج: ${day}/${half}`); }
      if (sAp < sOff) { okNoLess = false; console.log(`   نقص: ${day}/${half} off=${sOff} apply=${sAp}`); }
    }
    // اكتمال الخميس: الغائب لا يترك فراغًا (المقاعد = نفس بقيّة الأيّام).
    const thuStaffed = staffed(ap.existingSlots, 'thursday', 0, trainees);
    const sunStaffed = staffed(ap.existingSlots, 'sunday', 0, trainees);
    okComplete = thuStaffed === sunStaffed;
    check('(أ) الخميس مكتمل رغم الطبيّة (= بقيّة الأيّام)', okComplete, `خميس=${thuStaffed} أحد=${sunStaffed}`);
    check('(ب) لا حجز مزدوج لغير المتدرّبين بعد الامتصاص', okNoDbl);
    check('(ج) apply لا يقلّ تغطيةً عن off في أيّ شفت', okNoLess);
    // الغائب فعلًا غائب الخميس (لم يُوضع).
    const victimThu = ap.existingSlots.some((s) => DI[s.dayOfWeek] === 4 && s.doctorId === victimId && s.status === 'active' && s.role === 'clinic');
    check('(د) الغائب المعروف ليس في عيادة الخميس', !victimThu);

    newHeartConfig.mode = 'off';
  } finally {
    await setCC(origCC); await cleanWeek();
    const pre = await loadScheduleData(CID, W);
    const tm: Record<string, TraineeMode> = {}; for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
    const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
    const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
    await schedule.build({ ...recipe, dryRun: false }); await schedule.saveBuildConfig({ ...recipe, dryRun: true } as any);
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
