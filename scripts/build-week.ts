// بناء أسبوع بسيناريو بورد مُمرَّر — لاختبار سيناريوهات البورد على التطبيق
//   npx tsx --env-file=.env scripts/build-week.ts <week> <scenario> [eveningDays csv]
//   scenario: separate | all_morning | all_evening | hybrid
import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { TraineeMode, WeekDay, Shift, BoardConfig } from '../lib/algorithms/schedule';

const CLINIC_ID = '10000000-0000-0000-0000-000000000001';
const WEEK = process.argv[2] || '2026-05-31';
const SC = process.argv[3] || 'all_morning';
const EV = (process.argv[4] || 'wednesday').split(',') as WeekDay[];

const A_SHIFT: Record<WeekDay, Shift> = {
  sunday: 'morning', monday: 'morning', tuesday: 'evening',
  wednesday: 'evening', thursday: 'evening',
};

function buildScenario(): BoardConfig['scenario'] {
  switch (SC) {
    case 'separate': return { kind: 'separate_schedule' };
    case 'all_morning': return { kind: 'all_morning' };
    case 'all_evening': return { kind: 'all_evening' };
    case 'hybrid': return { kind: 'hybrid_evening_days', eveningDays: EV };
    default: throw new Error('سيناريو غير معروف: ' + SC);
  }
}

async function main() {
  const { data, error } = await loadScheduleData(CLINIC_ID, WEEK);
  if (error || !data) { console.log('فشل التحميل:', error); return; }

  const trainees = data.doctors.filter((d) => d.workStatus === 'trainee');
  const traineeModes: Record<string, TraineeMode> = {};
  for (const t of trainees) traineeModes[t.id] = 'beginner';
  const board = data.doctors.filter((d) => d.groupTemplate.key === 'board');

  const result = await schedule.build({
    weekStart: WEEK,
    clinicId: CLINIC_ID,
    aShiftPlan: A_SHIFT,
    boardConfig: { scenario: buildScenario(), includeInExRotation: false },
    traineeModes,
    dryRun: false,
  });

  console.log(`[${WEEK} · بورد=${SC}] success=${result.success} slots=${result.slotsCreated} doctors=${result.doctorsAssigned} warnings=${result.warnings.length}`);
  console.log(`  البورد (${board.length}): ${board.map((b) => b.name).join('، ') || 'لا يوجد'}`);
  if (result.warnings.length) console.log('  تنبيهات:', result.warnings);
  if (!result.success) console.log('  أخطاء:', result.errors);
}
main().catch((e) => { console.error(e); process.exit(1); });
