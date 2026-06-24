/* قاعدة: الظلّ لا يغطّي. مشرفٌ مضيفٌ (دليقيتر ف1+ف2) + ظلُّه يحاكيه، يستأذن نهايةَ الشفت
 * (تُحجب ف2) ولا بديلَ حرّ → مقعدُ المشرف يُخلى، و**ظلُّه يُزال من ف2** فتبقى فارغة. */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import { setScheduleStatus } from '../lib/algorithms/requests_v2';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
const DAY: WeekDay = 'thursday';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' — ' + d); } };

const ins = (row: Record<string, unknown>) =>
  supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: W, day_of_week: DAY, status: 'active', source: 'request', ...row });

async function rebuild() {
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {}; for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
  await schedule.build({ ...recipe, dryRun: false });
}

(async () => {
  await supabase.from('schedule_settings').update({ clinic_count: 3 }).eq('clinic_id', CID);
  const data = (await loadScheduleData(CID, W)).data!;
  const trainee = data.doctors.find((d) => d.workStatus === 'trainee' && d.supervisorDoctorId);
  if (!trainee) { console.log('لا متدرّبَ ذو مشرفٍ في الفكسجر — تخطّي'); process.exit(0); }
  const sup = data.doctors.find((d) => d.id === trainee.supervisorDoctorId)!;
  const pool = data.doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus === 'active' && d.id !== sup.id);
  const [A, B, C] = pool;
  console.log(`المشرف(المضيف)=${sup.name} | الظلّ=${trainee.name} | عيادات: ${A?.name}, ${B?.name}, ${C?.name}`);

  try {
    // مشهدٌ يدويّ: 3 أطبّاء عيادةٍ يعملون الفترتين (لا حرّ في ف2)، + المشرف دليقيتر ف1+ف2، + ظلُّه يحاكيه.
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).eq('day_of_week', DAY);
    for (const [i, d] of [A, B, C].entries()) {
      await ins({ doctor_id: d!.id, doctor_name: d!.name, period: 1, clinic_number: i + 1, role: 'clinic' });
      await ins({ doctor_id: d!.id, doctor_name: d!.name, period: 2, clinic_number: i + 1, role: 'clinic' });
    }
    await ins({ doctor_id: sup.id, doctor_name: sup.name, period: 1, clinic_number: 0, role: 'delegator' });
    await ins({ doctor_id: sup.id, doctor_name: sup.name, period: 2, clinic_number: 0, role: 'delegator' });
    await ins({ doctor_id: trainee.id, doctor_name: trainee.name, period: 1, clinic_number: 0, role: 'delegator' });
    await ins({ doctor_id: trainee.id, doctor_name: trainee.name, period: 2, clinic_number: 0, role: 'delegator' });

    // المشرف يستأذن نهايةَ الشفت (يحجب ف2).
    const actor = { id: data.doctors[0]!.id, role: 'super_admin' };
    const r = await setScheduleStatus(actor, { clinicId: CID, weekStart: W, day: DAY, doctorId: sup.id, doctorName: sup.name, status: 'permission_end', shift: 'morning' });
    check('سُجّل الاستئذان', r.success, (r as any).error || '');

    const after = (await loadScheduleData(CID, W)).data!.existingSlots.filter((s) => s.dayOfWeek === DAY);
    const delegP2 = after.filter((s) => s.period === 2 && s.role === 'delegator' && s.status === 'active');
    const supP2 = after.some((s) => s.period === 2 && s.doctorId === sup.id && s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator'));
    const shadowP2 = after.some((s) => s.period === 2 && s.doctorId === trainee.id && s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator'));
    const shadowP1 = after.some((s) => s.period === 1 && s.doctorId === trainee.id && s.status === 'active' && s.role === 'delegator');
    const supP1 = after.some((s) => s.period === 1 && s.doctorId === sup.id && s.status === 'active' && s.role === 'delegator');

    check('المشرف أُخلي من ف2 (مستأذن)', !supP2);
    check('★ الظلّ أُزيل من ف2 (لا يغطّي)', !shadowP2, 'الظلّ ما زال في ف2');
    check('★ الدليقيتر ف2 فارغٌ تمامًا (لا متدرّب ولا غيره)', delegP2.length === 0, JSON.stringify(delegP2.map((s) => s.doctorName)));
    check('الظلّ باقٍ مع مشرفه في ف1 (دليقيتر)', shadowP1 && supP1);
  } finally {
    await rebuild();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
