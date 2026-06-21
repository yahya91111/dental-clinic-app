// مسبار: ما الشكل الذي ينتجه القلب الحقيقيّ لـ ٨ أطبّاء / ٣ عيادات (أحدهم تخفيف)؟
import { createWheels, distributeShiftWheel } from '../lib/algorithms/wheel';
import { GROUP_TEMPLATES } from '../lib/algorithms/groupTemplates';
import type { LoadedDoctor, ShiftPool, WeekDay, AssignedSlot } from '../lib/algorithms/schedule';

const GA = GROUP_TEMPLATES.find((t) => t.key === 'group_a')!;
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const AR: Record<WeekDay, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };
const NAMES = ['محمد', 'أحمد', 'خالد', 'سعد', 'فهد', 'علي', 'عمر', 'زيد'];
const docs: LoadedDoctor[] = NAMES.map((name, i) => ({
  id: `d${i + 1}`, name, groupTemplate: GA, groupId: 'g',
  workStatus: i === 7 ? 'light_duty' : 'active', supervisorDoctorId: null,
}));
const nm = (id: string) => docs.find((d) => d.id === id)?.name || id;
const lightDuty = docs.filter((d) => d.workStatus === 'light_duty');
const active = docs.filter((d) => d.workStatus !== 'light_duty');
const pool = (): ShiftPool => ({
  shift: 'morning', available: active, lightDuty, beginnersByBuddy: new Map(),
  beginnersOrphan: [], absent: [], partialAvailable: [], boardRule: { kind: 'no_board' },
} as ShiftPool);

function renderDay(slots: AssignedSlot[], label: string): string {
  const clinic = new Map<number, Record<number, string>>(); const del: Record<number, string> = {}; const ex: string[] = [];
  for (const s of slots) {
    if (s.role === 'delegator') { del[s.period] = nm(s.doctor.id); continue; }
    if (s.role === 'ex') { ex.push(nm(s.doctor.id)); continue; }
    const c = clinic.get(s.clinicNumber) || {}; c[s.period] = nm(s.doctor.id); clinic.set(s.clinicNumber, c);
  }
  const parts: string[] = [];
  for (const c of [...clinic.keys()].sort((a, b) => a - b)) {
    const p = clinic.get(c)!; const occ = [...new Set(Object.values(p))]; const solo = occ.length === 1;
    parts.push(`ع${c}{${Object.keys(p).sort().map((pr) => `ف${pr}:${p[+pr]}`).join(' ')}}${solo ? '★منفرد' : ''}`);
  }
  if (Object.keys(del).length) parts.push(`دليقيتر{${Object.keys(del).sort().map((pr) => `ف${pr}:${del[+pr]}`).join(' ')}}`);
  if (ex.length) parts.push(`احتياط[${[...new Set(ex)].join('+')}]`);
  return `${label.padStart(8)} │ ${parts.join('   ')}`;
}

const wheels = createWheels(docs, []);
console.log('٨ أطبّاء / ٣ عيادات — أحدهم تخفيف (زيد). أسبوعان:\n');
for (let week = 0; week < 2; week++) {
  console.log(`── أسبوع ${week + 1} ──`);
  for (const day of DAYS) {
    const r = distributeShiftWheel(day, 3, pool(), wheels, true);
    console.log(renderDay(r.slots, AR[day]));
    for (const w of r.warnings) console.log(`        ⚠️ ${w}`);
  }
  console.log('');
}
