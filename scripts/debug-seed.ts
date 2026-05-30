import { loadScheduleData } from '../lib/algorithms/schedule';

const C = '10000000-0000-0000-0000-000000000001';
const W = process.argv[2] || '2026-05-31';

async function main() {
  const { data } = await loadScheduleData(C, W);
  if (!data) { console.log('no data'); return; }
  const weeks = new Map<string, Set<string>>();
  const load = new Map<string, number>();
  for (const s of data.pastSlots) {
    if (s.status !== 'active') continue;
    let set = weeks.get(s.doctorId); if (!set) { set = new Set(); weeks.set(s.doctorId, set); }
    set.add(s.weekStart);
    let p = 0; if (s.role === 'clinic') p = 1; else if (s.role === 'delegator') p = 2;
    load.set(s.doctorId, (load.get(s.doctorId) ?? 0) + p);
  }
  console.log(`نافذة ${W} — أسابيع:`, [...new Set(data.pastSlots.map((s) => s.weekStart))]);
  console.log('قروب A — حِمل خام (نقاط) + أسابيع الحضور:');
  for (const d of data.doctors.filter((x) => x.groupTemplate.key === 'group_a')) {
    console.log('  ' + d.name.padEnd(22) + 'حِمل=' + String(load.get(d.id) ?? 0).padEnd(5) + 'أسابيع=' + (weeks.get(d.id)?.size ?? 0) + (d.workStatus !== 'active' ? '  [' + d.workStatus + ']' : ''));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
