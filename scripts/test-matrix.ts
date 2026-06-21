/* محكُّ المصفوفة الشامل (طلب المستخدم): عبر أعداد عياداتٍ وأطبّاء، مع/بدون بورد،
 * مع/بدون تخفيف عمل — يقارن تغطية العجلة القديمة بالقلب الجديد ويكشف أيّ نقصِ تغطية.
 *   عيادات ٢: أطبّاء ٢..٦   |   عيادات ٣: ٣..٨   |   عيادات ٤: ٤..١٠
 * التحكّم بعدد الأطبّاء: نستثني الفائض بالغياب (extraAbsences كلَّ الأيّام). البورد/التخفيف
 * يُدرَجان أو يُستثنَيان. لكلّ إعداد: نُغيّب طبيب عيادةٍ (صباحًا ومساءً) ونقارن عددَ المقاعد
 * المأهولة (الجديد يجب ألّا يقلّ عن القديم). */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule, redistributeShift, applyShiftRedistribution } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode, LoadedSlot, ExtraAbsence } from '../lib/algorithms/schedule';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { applyCoverage } from '../lib/algorithms/solver_shadow';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };

const setCC = async (n: number) => { await supabase.from('schedule_settings').update({ clinic_count: n }).eq('clinic_id', CID); };
async function cleanWeek() {
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).in('status', ['sick_leave', 'vacation']);
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).eq('role', 'prev_placement');
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).eq('source', 'request');
}
async function buildWith(cc: number, exclude: string[], board: boolean) {
  await setCC(cc); await cleanWeek();
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const extraAbsences: ExtraAbsence[] = [];
  for (const id of exclude) for (const day of DAYS) extraAbsences.push({ doctorId: id, day, scope: 'full' });
  const recipe = {
    weekStart: W, clinicId: CID, aShiftPlan,
    boardConfig: { scenario: { kind: (board ? 'all_morning' : 'separate_schedule') as const }, includeInExRotation: false },
    traineeModes: tm, delegatorEnabled: true, extraAbsences,
  };
  await schedule.build({ ...recipe, dryRun: false });
  // نحفظ الوصفة **بلا** استثناءات كي تبقى redistributeShift نظيفةً، ونمرّر الاستثناءات لها كـsimulate.
  await schedule.saveBuildConfig({ ...recipe, extraAbsences: [], dryRun: true } as any);
}
const cats = (doctors: any[]) => ({
  pool: doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id),
  board: doctors.filter((d) => d.groupTemplate.key === 'board').map((d) => d.id),
  ld: doctors.filter((d) => d.workStatus === 'light_duty').map((d) => d.id),
  trainee: doctors.filter((d) => d.workStatus === 'trainee').map((d) => d.id),
  all: doctors.map((d) => d.id),
});
const traineesOf = (doctors: any[]) => new Set(doctors.filter((d) => d.workStatus === 'trainee').map((d) => d.id));
function staffedCount(slots: LoadedSlot[], day: WeekDay, half: 0 | 1, trainees: Set<string>): number {
  const periods = half === 0 ? [1, 2] : [3, 4];
  return new Set(slots.filter((s) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period) && s.status === 'active' && s.role === 'clinic' && s.clinicNumber > 0 && !trainees.has(s.doctorId)).map((s) => `c${s.clinicNumber}#p${s.period}`)).size;
}

(async () => {
  const origCC = ((await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID).maybeSingle()).data as any)?.clinic_count ?? 3;
  const { newHeartConfig } = await import('../lib/algorithms/new_heart_config');
  const base0 = (await loadScheduleData(CID, W)).data!;
  const c0 = cats(base0.doctors);
  const trainees = traineesOf(base0.doctors);
  console.log(`متاح: بِركة=${c0.pool.length} بورد=${c0.board.length} تخفيف=${c0.ld.length}\n`);

  const matrix: { M: number; Ns: number[] }[] = [
    { M: 2, Ns: [2, 3, 4, 5, 6] },
    { M: 3, Ns: [3, 4, 5, 6, 7, 8] },
    { M: 4, Ns: [4, 5, 6, 7, 8, 9, 10] },
  ];
  let total = 0; const gaps: string[] = []; let skipped = 0;

  try {
    for (const { M, Ns } of matrix) {
      for (const N of Ns) {
        if (N > c0.pool.length) { skipped++; continue; }
        for (const board of [true, false]) {
          for (const ld of [true, false]) {
            if (board && c0.board.length < 1) continue;
            if (ld && c0.ld.length < 1) continue;
            console.log(`[تقدّم] عيادات${M} أطبّاء${N} بورد:${board ? 'نعم' : 'لا'} تخفيف:${ld ? 'نعم' : 'لا'} (سيناريوهات حتى الآن: ${total})`);
            // المجموعة الفاعلة = N من البِركة + (بورد؟) + (تخفيف؟). الباقي يُستثنى.
            const active = new Set<string>([...c0.pool.slice(0, N), ...(board ? c0.board : []), ...(ld ? c0.ld : [])]);
            const exclude = c0.all.filter((id) => !active.has(id) && !trainees.has(id)); // المتدرّبون ظلال — نتركهم

            // ابنِ مرّةً لاختيار الضحايا (صباح + مساء).
            newHeartConfig.mode = 'off'; await buildWith(M, exclude, board);
            const built = (await loadScheduleData(CID, W)).data!;
            const victims: { day: WeekDay; half: 0 | 1; id: string; name: string }[] = [];
            for (const half of [0, 1] as const) {
              const periods = half === 0 ? [1, 2] : [3, 4];
              const cd = built.existingSlots.find((s) => DI[s.dayOfWeek] === 0 && periods.includes(s.period) && s.status === 'active' && s.role === 'clinic' && active.has(s.doctorId) && !trainees.has(s.doctorId));
              if (cd) victims.push({ day: 'sunday', half, id: cd.doctorId, name: cd.doctorName });
            }
            if (victims.length === 0) { skipped++; continue; }

            for (const v of victims) {
              const shift: Shift = v.half === 0 ? 'morning' : 'evening';
              const exclDay: ExtraAbsence[] = exclude.map((id) => ({ doctorId: id, day: v.day, scope: 'full' as const }));
              // ① القديم.
              newHeartConfig.mode = 'off'; await buildWith(M, exclude, board);
              await requestsV2.setScheduleStatus({ id: base0.doctors[0]!.id, role: 'super_admin' }, { clinicId: CID, weekStart: W, day: v.day, doctorId: v.id, doctorName: v.name, status: 'sick_leave', shift });
              const oldR = await redistributeShift({ clinicId: CID, weekStart: W, day: v.day, shift, simulateAbsences: exclDay });
              if (oldR.success) await applyShiftRedistribution({ clinicId: CID, weekStart: W, day: v.day, shift, slots: oldR.slots });
              const sOld = staffedCount((await loadScheduleData(CID, W)).data!.existingSlots, v.day, v.half, trainees);
              // ② الجديد.
              newHeartConfig.mode = 'apply'; newHeartConfig.clinics = null; await buildWith(M, exclude, board);
              await requestsV2.setScheduleStatus({ id: base0.doctors[0]!.id, role: 'super_admin' }, { clinicId: CID, weekStart: W, day: v.day, doctorId: v.id, doctorName: v.name, status: 'sick_leave', shift });
              await applyCoverage({ clinicId: CID, weekStart: W, label: 'mx' }, { specialReserves: 'use' });
              const sNew = staffedCount((await loadScheduleData(CID, W)).data!.existingSlots, v.day, v.half, trainees);

              total++;
              if (sNew < sOld) gaps.push(`عيادات${M} أطبّاء${N} بورد:${board ? 'نعم' : 'لا'} تخفيف:${ld ? 'نعم' : 'لا'} ${v.half === 0 ? 'ص' : 'م'} → قديم ${sOld} / جديد ${sNew} (نقص ${sOld - sNew})`);
            }
          }
        }
      }
    }
    newHeartConfig.mode = 'off';
  } finally {
    await setCC(origCC); await cleanWeek();
    const pre = await loadScheduleData(CID, W);
    const tm: Record<string, TraineeMode> = {}; for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
    const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
    const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
    await schedule.build({ ...recipe, dryRun: false }); await schedule.saveBuildConfig({ ...recipe, dryRun: true } as any);
  }

  console.log(`\n═══ محكّ المصفوفة (${total} سيناريو، تخطّي ${skipped}) ═══`);
  console.log(`🔴 نقصُ تغطيةٍ حقيقيّ (الجديد أقلّ من القديم): ${gaps.length}`);
  gaps.forEach((g) => console.log('   • ' + g));
  console.log(gaps.length === 0 ? '\n✅ لا نقصَ تغطيةٍ في أيّ خليّةٍ من المصفوفة.' : '\n⚠️ نقصُ تغطية — انظر أعلاه.');
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
