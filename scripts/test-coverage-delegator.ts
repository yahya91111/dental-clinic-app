/* سدّ الثغرة: الدليقيتر المنفرد مصدرُ تغطيةٍ ثانويّ (٧ على ٣ → ٦ على ٣). نبني بدليقيتر
 * مُفعَّل، نمسح عن شفتٍ فيه (دليقيتر منفرد + طبيب عيادة + بلا احتياطِ بِركة)، نُغيّب طبيب
 * العيادة، ثمّ applyCoverage ونتحقّق:
 *  (أ) المقعد الشاغر مُغطًّى بالدليقيتر المنفرد (نزل للعيادة).
 *  (ب) أُزيلت خانة دوره دليقيترًا (لم يَعُد دليقيترًا — صار عيادة).
 *  (ج) لا حجزٌ مزدوجٌ بنفس (عيادة/فترة). */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode, LoadedSlot } from '../lib/algorithms/schedule';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { applyCoverage } from '../lib/algorithms/solver_shadow';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };

const getCC = async (): Promise<number> => ((await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID).maybeSingle()).data as any)?.clinic_count ?? 3;
const setCC = async (n: number) => { await supabase.from('schedule_settings').update({ clinic_count: n }).eq('clinic_id', CID); };
async function cleanWeek() {
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).in('status', ['sick_leave', 'vacation']);
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).eq('role', 'prev_placement');
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).eq('source', 'request');
}
async function build(cc: number, deleg: boolean) {
  await setCC(cc); await cleanWeek();
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm, delegatorEnabled: deleg };
  await schedule.build({ ...recipe, dryRun: false });
  await schedule.saveBuildConfig({ ...recipe, dryRun: true } as any);
}
const poolOf = (doctors: any[]) => new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));

(async () => {
  const original = await getCC();
  try {
    // جرّب أعدادَ عياداتٍ مختلفةً حتى يظهر دليقيترٌ منفردٌ بلا احتياطِ بِركة.
    let found: { cc: number; day: WeekDay; half: 0 | 1; victim: LoadedSlot; deleg: string } | null = null;
    for (const cc of [3, 2, 4]) {
      await build(cc, true);
      const data = (await loadScheduleData(CID, W)).data!;
      const pool = poolOf(data.doctors);
      for (const day of DAYS) for (const half of [0, 1] as const) {
        const periods = half === 0 ? [1, 2] : [3, 4]; const exCol = half === 0 ? 1 : 2;
        const inClinic = new Set(data.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period) && s.status === 'active' && s.role === 'clinic').map((s) => s.doctorId));
        const soloDeleg = [...new Set(data.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period) && s.status === 'active' && s.role === 'delegator').map((s) => s.doctorId))].filter((id) => pool.has(id) && !inClinic.has(id));
        const reserves = [...new Set(data.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day] && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol).map((s) => s.doctorId))].filter((id) => pool.has(id));
        const cds = data.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period) && s.status === 'active' && s.role === 'clinic' && pool.has(s.doctorId));
        if (soloDeleg.length >= 1 && reserves.length === 0 && cds[0]) { found = { cc, day, half, victim: cds[0], deleg: soloDeleg[0]! }; break; }
        if (found) break;
      }
      if (found) break;
    }

    if (!found) {
      console.log('ℹ لم يظهر (دليقيتر منفرد + بلا احتياط) في الفكسجر — منطقُ النزول مُثبَتٌ تركيبيًّا (solveCoverage). تخطّي.');
      return;
    }

    await build(found.cc, true);
    let data = (await loadScheduleData(CID, W)).data!;
    const { day, half, victim } = found;
    const delegName = data.doctors.find((d) => d.id === found!.deleg)?.name ?? found.deleg;
    const shift: Shift = half === 0 ? 'morning' : 'evening';
    const periods = half === 0 ? [1, 2] : [3, 4];
    console.log(`عيادات=${found.cc} | ${day}/${half === 0 ? 'ص' : 'م'} | الغائب ${victim.doctorName} (عيادة ${victim.clinicNumber} ف${victim.period}) | دليقيتر منفرد=${delegName}`);

    await requestsV2.setScheduleStatus({ id: data.doctors[0]!.id, role: 'super_admin' }, { clinicId: CID, weekStart: W, day, doctorId: victim.doctorId, doctorName: victim.doctorName, status: 'sick_leave', shift });
    const r = await applyCoverage({ clinicId: CID, weekStart: W, label: 'deleg-test' });
    console.log(`     طُبّق: filled=${r.filled} shortages=${r.shortages}`);

    data = (await loadScheduleData(CID, W)).data!;
    // نعدّ شاغلي المقعد **غيرَ المتدرّبين** (ظلُّ المدرّب قد يتبعه إلى العيادة — مشاركةٌ مقصودة).
    const traineeIds = new Set(data.doctors.filter((d) => d.workStatus === 'trainee').map((d) => d.id));
    const seatNow = data.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day] && s.clinicNumber === victim.clinicNumber && s.period === victim.period && s.status === 'active' && s.role === 'clinic' && !traineeIds.has(s.doctorId));
    check('(أ) المقعد الشاغر مُغطًّى', seatNow.length === 1, `${seatNow.length}`);
    check('(أ) غطّاه الدليقيتر المنفرد (نزل للعيادة)', seatNow.length === 1 && seatNow[0]!.doctorId === found.deleg, seatNow[0]?.doctorName);
    const stillDeleg = data.existingSlots.some((s) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period) && s.status === 'active' && s.role === 'delegator' && s.doctorId === found!.deleg);
    check('(ب) لم يَعُد دليقيترًا (أُزيلت خانة دوره)', !stillDeleg);
    // لا حجزٌ مزدوجٌ لغير المتدرّبين (المدرّب+الظلّ في عيادةٍ واحدةٍ مسموح — مشاركةٌ مقصودة).
    const seen = new Set<string>(); let dbl = false;
    for (const s of data.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period) && s.status === 'active' && s.role === 'clinic' && !traineeIds.has(s.doctorId))) { const k = `${s.clinicNumber}#${s.period}`; if (seen.has(k)) dbl = true; seen.add(k); }
    check('(ج) لا حجزٌ مزدوجٌ لغير المتدرّبين', !dbl);
  } finally {
    await setCC(original); await cleanWeek();
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
