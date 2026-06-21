/* محكُّ المقارنة الشامل: على كلّ سيناريو غياب، يُشغّل العجلة القديمة (redistributeShift +
 * apply) والقلب الجديد (applyCoverage + امتصاص) على نفس الغياب، ويقارن الشفت خانةً بخانة.
 * يصنّف الفروق:
 *  • نقصُ تغطيةٍ حقيقيّ (العجلة تملأ مقعدًا، الجديد يتركه فارغًا) ← الخطير، يُسرَد كاملًا.
 *  • شاغلٌ مختلف (نفس المقعد، طبيبٌ آخر) ← عادلٌ-لكن-مختلف، يُعدّ فقط.
 *  • فرقُ الاحتياط/الدليقيتر ← يُعدّ.
 * يجرّب عياداتٍ مختلفةً ودليقيترًا مُفعَّلًا ليكشف بنى التوزيع كلَّها. */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule, redistributeShift, applyShiftRedistribution } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode, LoadedSlot } from '../lib/algorithms/schedule';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { applyCoverage, applyNewHeartRebalance } from '../lib/algorithms/solver_shadow';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };

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
const traineesOf = (doctors: any[]) => new Set(doctors.filter((d) => d.workStatus === 'trainee').map((d) => d.id));

type Snap = { staffed: Map<string, string>; reserves: Set<string>; delegators: Set<string> };
function snap(slots: LoadedSlot[], day: WeekDay, half: 0 | 1, trainees: Set<string>): Snap {
  const periods = half === 0 ? [1, 2] : [3, 4]; const exCol = half === 0 ? 1 : 2;
  const staffed = new Map<string, string>();
  // المقعد = (عيادة#فترة)؛ نأخذ الشاغل **غير المتدرّب** (المتدرّب ظلٌّ يلازم مشرفه).
  for (const s of slots.filter((s) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period) && s.status === 'active' && s.role === 'clinic' && s.clinicNumber > 0 && !trainees.has(s.doctorId))) {
    staffed.set(`c${s.clinicNumber}#p${s.period}`, s.doctorId);
  }
  const reserves = new Set(slots.filter((s) => DI[s.dayOfWeek] === DI[day] && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol).map((s) => s.doctorId));
  const delegators = new Set(slots.filter((s) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period) && s.status === 'active' && s.role === 'delegator').map((s) => s.doctorId));
  return { staffed, reserves, delegators };
}

(async () => {
  const original = await getCC();
  const { newHeartConfig } = await import('../lib/algorithms/new_heart_config');
  let scenarios = 0; const gaps: string[] = []; let occDiff = 0; let resDiff = 0; let delDiff = 0; let bothShort = 0;
  try {
    for (const [cc, deleg] of [[3, false], [2, false], [3, true], [2, true]] as const) {
      // اجمع ضحايا لهذا الإعداد: أوّل طبيب عيادةٍ من البِركة في كلّ شفت (سقفٌ معقول).
      newHeartConfig.mode = 'off'; await build(cc, deleg);
      const base = (await loadScheduleData(CID, W)).data!;
      const pool = poolOf(base.doctors); const trainees = traineesOf(base.doctors);
      const victims: { day: WeekDay; half: 0 | 1; id: string; name: string }[] = [];
      for (const day of DAYS) for (const half of [0, 1] as const) {
        const periods = half === 0 ? [1, 2] : [3, 4];
        const cds = base.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period) && s.status === 'active' && s.role === 'clinic' && pool.has(s.doctorId));
        if (cds[0]) victims.push({ day, half, id: cds[0].doctorId, name: cds[0].doctorName });
      }

      for (const v of victims) {
        const shift: Shift = v.half === 0 ? 'morning' : 'evening';
        // ① العجلة القديمة.
        newHeartConfig.mode = 'off'; await build(cc, deleg);
        await requestsV2.setScheduleStatus({ id: base.doctors[0]!.id, role: 'super_admin' }, { clinicId: CID, weekStart: W, day: v.day, doctorId: v.id, doctorName: v.name, status: 'sick_leave', shift });
        const oldR = await redistributeShift({ clinicId: CID, weekStart: W, day: v.day, shift });
        if (oldR.success) await applyShiftRedistribution({ clinicId: CID, weekStart: W, day: v.day, shift, slots: oldR.slots });
        const sOld = snap((await loadScheduleData(CID, W)).data!.existingSlots, v.day, v.half, trainees);

        // ② القلب الجديد.
        newHeartConfig.mode = 'apply'; newHeartConfig.clinics = null; await build(cc, deleg);
        await requestsV2.setScheduleStatus({ id: base.doctors[0]!.id, role: 'super_admin' }, { clinicId: CID, weekStart: W, day: v.day, doctorId: v.id, doctorName: v.name, status: 'sick_leave', shift });
        await applyCoverage({ clinicId: CID, weekStart: W, label: 'diff' }, { specialReserves: 'use' });
        await applyNewHeartRebalance({ clinicId: CID, weekStart: W, label: 'diff' });
        const sNew = snap((await loadScheduleData(CID, W)).data!.existingSlots, v.day, v.half, trainees);

        scenarios++;
        // نقصُ تغطية: مقعدٌ يملؤه القديم ويتركه الجديد فارغًا.
        const miss = [...sOld.staffed.keys()].filter((k) => !sNew.staffed.has(k));
        if (miss.length) gaps.push(`[عيادات${cc}${deleg ? '+دليقيتر' : ''}] ${v.name} ${v.day}/${v.half === 0 ? 'ص' : 'م'}: ${miss.join(',')}`);
        // شاغلٌ مختلف.
        for (const [k, who] of sNew.staffed) if (sOld.staffed.has(k) && sOld.staffed.get(k) !== who) occDiff++;
        // فروق الاحتياط/الدليقيتر.
        if ([...sOld.reserves].sort().join() !== [...sNew.reserves].sort().join()) resDiff++;
        if ([...sOld.delegators].sort().join() !== [...sNew.delegators].sort().join()) delDiff++;
        if (sOld.staffed.size < (cc - 1) * 2 && sNew.staffed.size < (cc - 1) * 2) bothShort++;
      }
    }
    newHeartConfig.mode = 'off';
  } finally {
    await setCC(original); await cleanWeek();
    const pre = await loadScheduleData(CID, W);
    const tm: Record<string, TraineeMode> = {}; for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
    const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
    const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
    await schedule.build({ ...recipe, dryRun: false }); await schedule.saveBuildConfig({ ...recipe, dryRun: true } as any);
  }

  console.log(`\n═══ نتيجة المحكّ الشامل (${scenarios} سيناريو) ═══`);
  console.log(`🔴 نقصُ تغطيةٍ حقيقيّ (الجديد يترك مقعدًا يملؤه القديم): ${gaps.length}`);
  gaps.forEach((g) => console.log('   • ' + g));
  console.log(`🟡 شاغلٌ مختلفٌ لنفس المقعد (عادلٌ-لكن-مختلف): ${occDiff} مقعد`);
  console.log(`🟡 شفتاتٌ اختلف فيها الاحتياط: ${resDiff} | الدليقيتر: ${delDiff}`);
  console.log(`ℹ️  شفتاتٌ كلاهما فيها نقصٌ بنيويّ (لا فرق): ${bothShort}`);
  console.log(gaps.length === 0 ? '\n✅ لا نقصَ تغطية: الجديد يغطّي كلّ ما يغطّيه القديم في كلّ السيناريوهات.' : '\n⚠️ يوجد نقصُ تغطية — انظر القائمة أعلاه.');
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
