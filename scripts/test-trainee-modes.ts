/* تأكيد القاعدة:
 *  • الظلّ (trainee beginner): لا يدخل أيّ عجلة — خاناتُه نسخةٌ من مدرّبه تمامًا (ملتصق).
 *  • المستقلّ (trainee independent): يُعامَل كطبيبٍ عاديّ — يدخل العجلات (عيادة/دليقيتر/احتياط)
 *    ولا يلتصق بمدرّبه. */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEKS = ['2099-03-01', '2099-03-08'];
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' — ' + d); } };

const sig = (rows: any[], who: string, day: WeekDay) =>
  rows.filter((s) => s.dayOfWeek === day && s.doctorId === who && s.status === 'active' && s.period > 0 && (s.role === 'clinic' || s.role === 'delegator'))
    .map((s) => `${s.period}|${s.clinicNumber}|${s.role}`).sort().join(',');
const roles = (rows: any[], who: string) => {
  const r = new Set<string>();
  for (const s of rows.filter((x) => x.doctorId === who && x.status === 'active' && x.role === 'delegator')) r.add('delegator');
  for (const s of rows.filter((x) => x.doctorId === who && x.status === 'extra' && x.period === 0)) r.add('reserve');
  for (const s of rows.filter((x) => x.doctorId === who && x.status === 'active' && x.role === 'clinic' && x.period > 0)) r.add('clinic');
  return r;
};

async function build(W: string, modes: Record<string, TraineeMode>) {
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: modes };
  await schedule.build({ ...recipe, dryRun: false });
}

(async () => {
  await supabase.from('schedule_settings').update({ clinic_count: 3 }).eq('clinic_id', CID);
  const base = (await loadScheduleData(CID, WEEKS[0]!)).data!;
  const trainees = base.doctors.filter((d) => d.workStatus === 'trainee' && d.supervisorDoctorId);
  if (trainees.length < 2) { console.log('يلزم متدرّبان ذَوا مشرفٍ — تخطّي'); process.exit(0); }
  const BEG = trainees[0]!; const IND = trainees[1]!; // الأوّل ظلّ، الثاني مستقلّ
  const begSup = BEG.supervisorDoctorId!; const indSup = IND.supervisorDoctorId!;
  const byId = new Map(base.doctors.map((d) => [d.id, d]));
  console.log(`ظلّ=${BEG.name}(مشرف ${byId.get(begSup)!.name}) | مستقلّ=${IND.name}(مشرف ${byId.get(indSup)!.name})`);

  const modes: Record<string, TraineeMode> = {};
  for (const t of trainees) modes[t.id] = 'beginner';
  modes[IND.id] = 'independent';

  try {
    let begMirrorDays = 0, begPresentDays = 0, begStray = 0;
    let indPresentDays = 0, indDiffFromSup = 0;
    const indRoles = new Set<string>();
    for (const W of WEEKS) {
      await build(W, modes);
      const rows = (await loadScheduleData(CID, W)).data!.existingSlots;
      for (const day of DAYS) {
        // الظلّ: حين يعمل، يطابق مشرفه تمامًا؛ ولا خانةَ له والمشرف غائبٌ عنها.
        const bs = sig(rows, BEG.id, day);
        if (bs) {
          begPresentDays++;
          if (bs === sig(rows, begSup, day)) begMirrorDays++; else begStray++;
        }
        // المستقلّ: يُوزَّع بنفسه، لا يلتصق بمشرفه.
        const is = sig(rows, IND.id, day);
        if (is) {
          indPresentDays++;
          if (is !== sig(rows, indSup, day)) indDiffFromSup++;
        }
      }
      for (const r of roles(rows, IND.id)) indRoles.add(r);
    }

    check('الظلّ يطابق مشرفه في كلّ يومٍ يعمله (ملتصق، لا عجلة)', begPresentDays > 0 && begMirrorDays === begPresentDays, `طابق ${begMirrorDays}/${begPresentDays}, شذّ ${begStray}`);
    check('المستقلّ مُنسَّبٌ فعلًا (يدخل التوزيع)', indPresentDays > 0, `أيّام حضور=${indPresentDays}`);
    check('المستقلّ لا يلتصق بمشرفه (يُوزَّع مستقلًّا)', indDiffFromSup > 0, `أيّام يخالف فيها مشرفه=${indDiffFromSup}/${indPresentDays}`);
    check('المستقلّ يدخل العجلات كطبيبٍ عاديّ (نال دورًا: عيادة/دليقيتر/احتياط)', indRoles.size > 0, [...indRoles].join(','));
    console.log(`     أدوار المستقلّ عبر الأسبوعين: ${[...indRoles].join('، ') || 'لا شيء'}`);
  } finally {
    for (const W of WEEKS) await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
