// بناء أسبوع بأوضاع تريني صريحة لكل اسم — لاختبار مستقل/مبتدئ
//   npx tsx --env-file=.env scripts/build-trainee.ts <week> <scenario> "اسم=independent;اسم=beginner"
import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { TraineeMode, WeekDay, Shift, BoardConfig } from '../lib/algorithms/schedule';

const CLINIC_ID = '10000000-0000-0000-0000-000000000001';
const WEEK = process.argv[2] || '2026-05-31';
const SC = process.argv[3] || 'separate';
const MODES = process.argv[4] || ''; // "عبدالله=independent;زينب=beginner" (مطابقة جزئية بالاسم)

const A_SHIFT: Record<WeekDay, Shift> = {
  sunday: 'morning', monday: 'morning', tuesday: 'evening',
  wednesday: 'evening', thursday: 'evening',
};

function scenario(): BoardConfig['scenario'] {
  if (SC === 'all_morning') return { kind: 'all_morning' };
  if (SC === 'all_evening') return { kind: 'all_evening' };
  return { kind: 'separate_schedule' };
}

async function main() {
  const { data, error } = await loadScheduleData(CLINIC_ID, WEEK);
  if (error || !data) { console.log('فشل التحميل:', error); return; }

  const trainees = data.doctors.filter((d) => d.workStatus === 'trainee');
  const overrides = MODES.split(';').filter(Boolean).map((p) => {
    const [nm, mode] = p.split('=');
    return { nm: (nm || '').trim(), mode: (mode || '').trim() as TraineeMode };
  });
  const traineeModes: Record<string, TraineeMode> = {};
  for (const t of trainees) {
    const ov = overrides.find((o) => t.name.includes(o.nm));
    traineeModes[t.id] = ov ? ov.mode : 'beginner';
  }
  console.log('أوضاع التريني:', trainees.map((t) => `${t.name}=${traineeModes[t.id]}`).join(' · '));

  const result = await schedule.build({
    weekStart: WEEK, clinicId: CLINIC_ID, aShiftPlan: A_SHIFT,
    boardConfig: { scenario: scenario(), includeInExRotation: false },
    traineeModes, dryRun: false,
  });
  console.log(`[${WEEK} · بورد=${SC}] success=${result.success} slots=${result.slotsCreated} doctors=${result.doctorsAssigned} warnings=${result.warnings.length}`);
  if (result.warnings.length) console.log('  تنبيهات:', result.warnings);
  if (!result.success) console.log('  أخطاء:', result.errors);
}
main().catch((e) => { console.error(e); process.exit(1); });
