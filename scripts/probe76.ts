// مسبار: شكل القلب الحقيقيّ لـ ٧/٣ و ٦/٣ (للتحقّق من تتالي النزول)
import { createWheels, distributeShiftWheel } from '../lib/algorithms/wheel';
import { GROUP_TEMPLATES } from '../lib/algorithms/groupTemplates';
import type { LoadedDoctor, ShiftPool, WeekDay, AssignedSlot } from '../lib/algorithms/schedule';

const GA = GROUP_TEMPLATES.find((t) => t.key === 'group_a')!;
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const AR: Record<WeekDay, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };
const ALL = ['محمد', 'أحمد', 'خالد', 'سعد', 'فهد', 'علي', 'عمر'];

function renderDay(slots: AssignedSlot[], label: string, nm: (id: string) => string): string {
  const clinic = new Map<number, Record<number, string>>(); const del: Record<number, string> = {}; const ex: string[] = [];
  for (const s of slots) {
    if (s.role === 'delegator') { del[s.period] = nm(s.doctor.id); continue; }
    if (s.role === 'ex') { ex.push(nm(s.doctor.id)); continue; }
    const c = clinic.get(s.clinicNumber) || {}; c[s.period] = nm(s.doctor.id); clinic.set(s.clinicNumber, c);
  }
  const parts: string[] = [];
  for (const c of [...clinic.keys()].sort((a, b) => a - b)) {
    const p = clinic.get(c)!; const occ = [...new Set(Object.values(p))]; const solo = occ.length === 1;
    parts.push(`ع${c}{${Object.keys(p).sort().map((pr) => `ف${pr}:${p[+pr]}`).join(' ')}}${solo ? '★' : ''}`);
  }
  if (Object.keys(del).length) parts.push(`دل{${Object.keys(del).sort().map((pr) => `ف${pr}:${del[+pr]}`).join(' ')}}`);
  if (ex.length) parts.push(`احتياط[${[...new Set(ex)].join('+')}]`);
  return `${label.padStart(8)} │ ${parts.join('   ')}`;
}

for (const N of [7, 6]) {
  const names = ALL.slice(0, N);
  const docs: LoadedDoctor[] = names.map((name, i) => ({ id: `d${i + 1}`, name, groupTemplate: GA, groupId: 'g', workStatus: 'active', supervisorDoctorId: null }));
  const nm = (id: string) => docs.find((d) => d.id === id)?.name || id;
  const pool = (): ShiftPool => ({ shift: 'morning', available: docs, lightDuty: [], beginnersByBuddy: new Map(), beginnersOrphan: [], absent: [], partialAvailable: [], boardRule: { kind: 'no_board' } } as ShiftPool);
  const wheels = createWheels(docs, []);
  console.log(`\n══════ ${N} أطبّاء / ٣ عيادات (أسبوع واحد) ══════`);
  for (const day of DAYS) console.log(renderDay(distributeShiftWheel(day, 3, pool(), wheels, true).slots, AR[day], nm));
}
