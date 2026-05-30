import { loadScheduleData } from '../lib/algorithms/schedule';

const CLINIC_ID = '10000000-0000-0000-0000-000000000001';
const WEEK = process.argv[2] || '2026-05-24';

async function main() {
  const { data, error } = await loadScheduleData(CLINIC_ID, WEEK);
  if (error || !data) {
    console.log('ERR', error);
    return;
  }
  console.log('clinicCount:', data.clinicCount);
  console.log('doctors total:', data.doctors.length);
  for (const d of data.doctors) {
    console.log(
      `  ${d.name} | status=${d.workStatus} | group=${d.groupTemplate?.key} | sup=${d.supervisorDoctorId ?? ''}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
