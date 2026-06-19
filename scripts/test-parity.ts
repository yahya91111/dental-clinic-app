/* محكّ التطابق — معيار البوّابة: على كلّ سيناريو غياب، هل القلب الجديد (تغطية) يُبقي
 * كلّ عيادةٍ مأهولةً كما القلب القديم (إعادة بناء العجلة)؟ لا يُشترَط نفسُ الطبيب (توزيعٌ
 * عادلٌ مختلفٌ مسموح) — يُشترَط ألّا يترك الجديدُ عيادةً يملؤها القديم (لا تراجعَ تغطية).
 * نستعمل عيادتين (احتياطٌ وفير). لكلّ ضحيّةٍ: بناءٌ نظيف → قياسُ القديم، بناءٌ نظيف →
 * قياسُ الجديد، مقارنة. */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule, redistributeShift, applyShiftRedistribution } from '../lib/algorithms/schedule';
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
async function build() {
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
  await schedule.build({ ...recipe, dryRun: false });
  await schedule.saveBuildConfig({ ...recipe, dryRun: true } as any);
}
const poolOf = (doctors: any[]) => new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));
async function sick(id: string, name: string, day: WeekDay, shift: Shift) {
  const actor = { id, role: 'super_admin' };
  await requestsV2.setScheduleStatus(actor, { clinicId: CID, weekStart: W, day, doctorId: id, doctorName: name, status: 'sick_leave', shift });
}
/** مجموعةُ (عيادة#فترة) المأهولة بعيادةٍ نشطةٍ في شفت. */
function staffed(slots: LoadedSlot[], day: WeekDay, periods: number[]): Set<string> {
  const s = new Set<string>();
  for (const x of slots.filter((x) => DI[x.dayOfWeek] === DI[day] && periods.includes(x.period) && x.status === 'active' && x.role === 'clinic' && x.clinicNumber > 0)) s.add(`c${x.clinicNumber}#p${x.period}`);
  return s;
}

(async () => {
  const original = await getCC();
  try {
    await setCC(2);
    await build();
    const { newHeartConfig } = await import('../lib/algorithms/new_heart_config');
    const data0 = (await loadScheduleData(CID, W)).data!;
    const pool = poolOf(data0.doctors);

    // اجمع ضحايا: أطبّاء عيادةٍ من البِركة على شفتاتٍ غنيّةٍ بالاحتياط (مساءً غالبًا).
    const victims: { id: string; name: string; day: WeekDay; shift: Shift; half: 0 | 1 }[] = [];
    for (const day of DAYS) for (const half of [1, 0] as const) {
      const periods = half === 0 ? [1, 2] : [3, 4]; const exCol = half === 0 ? 1 : 2;
      const res = [...new Set(data0.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day] && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol).map((s) => s.doctorId))].filter((id) => pool.has(id));
      if (res.length === 0) continue;
      const cds = data0.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period) && s.status === 'active' && s.role === 'clinic' && pool.has(s.doctorId));
      if (cds[0]) victims.push({ id: cds[0].doctorId, name: cds[0].doctorName, day, shift: half === 0 ? 'morning' : 'evening', half });
    }
    console.log(`سيناريوهات: ${victims.length}\n`);

    for (const v of victims) {
      const periods = v.half === 0 ? [1, 2] : [3, 4];
      // ① القديم: بناءٌ نظيف → غياب → redistributeShift + apply → قياس.
      newHeartConfig.mode = 'off';
      await build(); await sick(v.id, v.name, v.day, v.shift);
      const oldR = await redistributeShift({ clinicId: CID, weekStart: W, day: v.day, shift: v.shift });
      if (oldR.success) await applyShiftRedistribution({ clinicId: CID, weekStart: W, day: v.day, shift: v.shift, slots: oldR.slots });
      const oldStaffed = staffed((await loadScheduleData(CID, W)).data!.existingSlots, v.day, periods);

      // ② الجديد: بناءٌ نظيف → غياب → applyCoverage → قياس.
      newHeartConfig.mode = 'apply'; newHeartConfig.clinics = null;
      await build(); await sick(v.id, v.name, v.day, v.shift);
      await applyCoverage({ clinicId: CID, weekStart: W, label: 'parity' });
      const newStaffed = staffed((await loadScheduleData(CID, W)).data!.existingSlots, v.day, periods);

      const missing = [...oldStaffed].filter((k) => !newStaffed.has(k));
      check(`${v.name} (${v.day}/${v.half === 0 ? 'ص' : 'م'}): الجديد يغطّي كلّ ما يغطّيه القديم`, missing.length === 0, `ناقص: ${missing.join(',')} | قديم=${oldStaffed.size} جديد=${newStaffed.size}`);
    }
    newHeartConfig.mode = 'off';
  } finally {
    await setCC(original);
    await build();
  }

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
