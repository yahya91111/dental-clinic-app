import { loadScheduleData } from '../lib/algorithms/schedule';

const CLINIC_ID = '10000000-0000-0000-0000-000000000001';
const WEEK = process.argv[2] || '2026-05-31';

async function main() {
  const { data } = await loadScheduleData(CLINIC_ID, WEEK);
  if (!data) {
    console.log('no data');
    return;
  }
  console.log('pastSlots count:', data.pastSlots.length);
  const weeks = new Set(data.pastSlots.map((s) => s.weekStart));
  console.log('past weeks in window:', [...weeks]);
  const load = new Map<string, number>();
  for (const s of data.pastSlots) {
    if (s.status !== 'active') continue;
    let p = 0;
    if (s.role === 'clinic') p = 1;
    else if (s.role === 'delegator') p = 2;
    load.set(s.doctorId, (load.get(s.doctorId) ?? 0) + p);
  }
  const ga = data.doctors.filter((d) => d.groupTemplate.key === 'group_a');
  for (const d of ga) console.log(`  ${d.name}: load=${load.get(d.id) ?? 0}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
