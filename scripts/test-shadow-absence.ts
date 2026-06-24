/* غيابُ الظلّ نفسه (مرضية/تفرّغ/استئذان): يظهر **صفًّا واحدًا بسببه في خانة EX** (فترة 0)،
 * بلا صفّ احتياطٍ زائد، بلا تغطية، ومدرّبه يبقى في مكانه. */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import { setScheduleStatus, cancelStatus } from '../lib/algorithms/requests_v2';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' — ' + d); } };

async function rebuild() {
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {}; for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
  await schedule.build({ ...recipe, dryRun: false });
}
const sig = (rows: any[], who: string, day: WeekDay) =>
  rows.filter((s) => s.dayOfWeek === day && s.doctorId === who && s.status === 'active' && s.period > 0)
    .map((s) => `${s.period}|${s.clinicNumber}|${s.role}`).sort().join(',');
const dayRows = (rows: any[], who: string, day: WeekDay) => rows.filter((s) => s.dayOfWeek === day && s.doctorId === who);

(async () => {
  await supabase.from('schedule_settings').update({ clinic_count: 3 }).eq('clinic_id', CID);
  await rebuild();
  const data = (await loadScheduleData(CID, W)).data!;
  const byId = new Map(data.doctors.map((d) => [d.id, d]));
  // ظلٌّ يعمل يومًا ما (يطابق مشرفه تمامًا).
  let T = '', S = '', D: WeekDay = 'sunday';
  outer: for (const t of data.doctors.filter((d) => d.workStatus === 'trainee' && d.supervisorDoctorId)) {
    for (const day of DAYS) {
      const tk = data.existingSlots.filter((s) => s.dayOfWeek === day && s.doctorId === t.id && s.status === 'active' && s.period > 0 && (s.role === 'clinic' || s.role === 'delegator')).map((s) => `${s.period}|${s.clinicNumber}|${s.role}`);
      if (!tk.length) continue;
      const sk = new Set(data.existingSlots.filter((s) => s.dayOfWeek === day && s.doctorId === t.supervisorDoctorId && s.status === 'active' && s.period > 0 && (s.role === 'clinic' || s.role === 'delegator')).map((s) => `${s.period}|${s.clinicNumber}|${s.role}`));
      if (tk.length === sk.size && tk.every((k) => sk.has(k))) { T = t.id; S = t.supervisorDoctorId!; D = day; break outer; }
    }
  }
  if (!T) { console.log('لا ظلَّ يعمل في الفكسجر — تخطّي'); process.exit(0); }
  console.log(`الظلّ=${byId.get(T)!.name} | المشرف=${byId.get(S)!.name} | اليوم=${D}`);
  const actor = { id: data.doctors[0]!.id, role: 'super_admin' };
  const supSig = sig(data.existingSlots, S, D);
  const clinicBefore = data.existingSlots.filter((s) => s.dayOfWeek === D && s.status === 'active' && s.role === 'clinic' && s.period > 0).length;
  const shadowSeats = data.existingSlots.filter((s) => s.dayOfWeek === D && s.doctorId === T && s.status === 'active' && s.role === 'clinic' && s.period > 0).length;

  const assertAbsence = async (status: 'sick_leave' | 'permission_end', label: string) => {
    await setScheduleStatus(actor, { clinicId: CID, weekStart: W, day: D, doctorId: T, doctorName: byId.get(T)!.name, status, shift: 'morning' });
    const a = (await loadScheduleData(CID, W)).data!.existingSlots;
    const mine = dayRows(a, T, D);
    const statusRows = mine.filter((s) => s.period === 0 && s.status === status);
    const extraRows = mine.filter((s) => s.period === 0 && s.status === 'extra');
    const activeSeats = mine.filter((s) => s.status === 'active' && s.period > 0 && (s.role === 'clinic' || s.role === 'delegator'));
    check(`[${label}] صفٌّ واحدٌ بالسبب في خانة EX (فترة 0)`, statusRows.length === 1 && statusRows[0]!.clinicNumber >= 1, JSON.stringify(mine.map((s: any) => `${s.period}/${s.role}/${s.status}`)));
    check(`[${label}] لا صفَّ احتياطٍ (extra) زائد`, extraRows.length === 0, `${extraRows.length}`);
    check(`[${label}] الظلّ خرج من مقاعد العيادة`, activeSeats.length === 0);
    check(`[${label}] المشرف لم يتغيّر (يبقى في مكانه)`, sig(a, S, D) === supSig, `${sig(a, S, D)} ≠ ${supSig}`);
    const clinicNow = a.filter((s) => s.dayOfWeek === D && s.status === 'active' && s.role === 'clinic' && s.period > 0).length;
    check(`[${label}] لا تغطية (نقص فقط بمقاعد الظلّ، لا أحد جديد)`, clinicNow === clinicBefore - shadowSeats, `now=${clinicNow} before=${clinicBefore} shadowSeats=${shadowSeats}`);
    await cancelStatus(actor, { clinicId: CID, weekStart: W, day: D, doctorId: T, restoreToPrevPlace: true });
  };

  try {
    await assertAbsence('sick_leave', 'مرضيّة');
    await assertAbsence('permission_end', 'استئذان');
  } finally {
    await rebuild();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
