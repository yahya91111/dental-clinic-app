/* إصلاحان: (أ) تغطية الدليقيتر الغائب (مقعده رقم 0) من احتياطٍ متاح.
 *          (ب) الظلّ يتبع مدرّبه إلى موضعه النهائيّ بعد امتصاص القلب (المبادلات). */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode, LoadedSlot } from '../lib/algorithms/schedule';
import { applyCoverage } from '../lib/algorithms/solver_shadow';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };
const setCC = async (n: number) => { await supabase.from('schedule_settings').update({ clinic_count: n }).eq('clinic_id', CID); };
const wipe = () => supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
const ins = (row: Record<string, unknown>) => supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: W, day_of_week: 'thursday', ...row });

async function buildApply() {
  await wipe();
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {}; for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm } as any;
  await schedule.build({ ...recipe, dryRun: false }); await schedule.saveBuildConfig({ ...recipe, dryRun: true });
}
const keyset = (slots: LoadedSlot[], id: string, day: WeekDay) => new Set(slots.filter((s) => s.doctorId === id && s.dayOfWeek === day && s.period > 0 && s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator')).map((s) => `${s.period}|${s.clinicNumber}|${s.role}`));

(async () => {
  const origCC = ((await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID).maybeSingle()).data as any)?.clinic_count ?? 3;
  try {
    await setCC(3);
    const d0 = (await loadScheduleData(CID, W)).data!;
    const pool = d0.doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty');
    const [P1, P2] = pool;

    // ── (أ) تغطية الدليقيتر: غائبٌ كان دليقيتر ف1 (prev_placement رقم 0) + احتياطيّ بِركة.
    await wipe();
    await ins({ doctor_id: P1!.id, doctor_name: P1!.name, period: 1, clinic_number: 0, role: 'prev_placement', status: 'active' });
    await ins({ doctor_id: P2!.id, doctor_name: P2!.name, period: 0, clinic_number: 1, role: 'clinic', status: 'extra' });
    const r = await applyCoverage({ clinicId: CID, weekStart: W, label: 'deleg' });
    const s = (await loadScheduleData(CID, W)).data!.existingSlots;
    const delegNow = s.find((x) => x.dayOfWeek === 'thursday' && x.role === 'delegator' && x.period === 1 && x.status === 'active');
    check('(أ) الدليقيتر الغائب غُطّي', !!delegNow && delegNow.doctorId === P2!.id, delegNow?.doctorName);
    check('(أ) clinic_number=0 للدليقيتر', !!delegNow && delegNow.clinicNumber === 0, `${delegNow?.clinicNumber}`);
    check('(أ) أُزيل صفّ احتياط المغطّي', !s.some((x) => x.dayOfWeek === 'thursday' && x.doctorId === P2!.id && x.status === 'extra'));
    check('(أ) move بنوع delegator (رقم 0)', r.moves.some((m) => m.doctorId === P2!.id && m.kind === 'delegator' && m.clinicNumber === 0), JSON.stringify(r.moves));

    // ── (ب) الظلّ يتبع مدرّبه بعد الامتصاص: ابنِ بوضع apply (الامتصاص بعد البناء يُبادل)،
    //        ثمّ تحقّق أنّ كلّ متدرّبٍ مبتدئٍ يطابق موضع مدرّبه تمامًا في كلّ يوم.
    await buildApply();
    const sb = (await loadScheduleData(CID, W)).data!;
    const trainees = sb.doctors.filter((d) => d.workStatus === 'trainee' && d.supervisorDoctorId);
    let mism = 0; const ex: string[] = [];
    for (const t of trainees) {
      for (const day of DAYS) {
        const tk = keyset(sb.existingSlots, t.id, day);
        if (tk.size === 0) continue; // المتدرّب غير حاضرٍ ذلك اليوم
        const sk = keyset(sb.existingSlots, t.supervisorDoctorId!, day);
        const same = tk.size === sk.size && [...tk].every((k) => sk.has(k));
        if (!same) { mism++; if (ex.length < 4) ex.push(`${t.name}/${day}: ظلّ[${[...tk].join(',')}] مدرّب[${[...sk].join(',')}]`); }
      }
    }
    check('(ب) كلّ ظلٍّ مبتدئٍ يطابق موضع مدرّبه بعد الامتصاص', mism === 0, `${mism} عدم تطابق — ${ex.join(' | ')}`);
  } finally {
    await setCC(origCC); await wipe();
    const pre = await loadScheduleData(CID, W);
    const tm: Record<string, TraineeMode> = {}; for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
    const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
    const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm } as any;
    await schedule.build({ ...recipe, dryRun: false }); await schedule.saveBuildConfig({ ...recipe, dryRun: true });
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
