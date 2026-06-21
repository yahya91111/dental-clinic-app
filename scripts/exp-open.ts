// السؤال: لو لم نُجمّد الأحد→الأربعاء، وأعدنا بناء الأسبوع كاملاً مع علمِنا أنّ
// ط٥ سيغيب الخميس — هل تتغيّر الأحد→الأربعاء؟
import { createWheels, distributeShiftWheel } from '../lib/algorithms/wheel';
import { GROUP_TEMPLATES } from '../lib/algorithms/groupTemplates';
import type { LoadedDoctor, ShiftPool, AssignedSlot, WeekDay } from '../lib/algorithms/schedule';
const GA = GROUP_TEMPLATES.find((t) => t.key === 'group_a')!;
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const AR: Record<WeekDay, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };
const docs: LoadedDoctor[] = [1, 2, 3, 4, 5].map((n) => ({ id: `d${n}`, name: `ط${n}`, groupTemplate: GA, groupId: 'g', workStatus: 'active', supervisorDoctorId: null }));
const nm = (id: string) => docs.find((d) => d.id === id)?.name || id;
const pool = (av: LoadedDoctor[]): ShiftPool => ({ shift: 'morning', available: av, lightDuty: [], beginnersByBuddy: new Map(), beginnersOrphan: [], absent: [], partialAvailable: [], boardRule: { kind: 'no_board' } } as ShiftPool);
const desc = (slots: AssignedSlot[]): string => { const bc = new Map<number, string[]>(); const del: string[] = []; for (const s of slots) { if (s.role === 'delegator') { del.push(nm(s.doctor.id)); continue; } if (s.role === 'ex') continue; (bc.get(s.clinicNumber) ?? bc.set(s.clinicNumber, []).get(s.clinicNumber)!).push(nm(s.doctor.id)); } const parts: string[] = []; for (const c of [...bc.keys()].sort()) { const u = [...new Set(bc.get(c)!)]; parts.push(`ع${c}:[${u.join('+')}]${u.length === 1 ? '★' : ''}`); } if (del.length) parts.push(`دل:[${[...new Set(del)].join('+')}]`); return parts.join('  '); };
const sig = (slots: AssignedSlot[]): string => slots.filter((s) => s.role !== 'ex').map((s) => `${s.clinicNumber}/${s.period}/${s.role}/${s.doctor.id}`).sort().join(';');

// (أ) بناء قانونيّ: ٥ أطبّاء كلّ الأيّام
const wA = createWheels(docs, []);
const canon: Record<string, AssignedSlot[]> = {};
for (const day of DAYS) canon[day] = distributeShiftWheel(day, 3, pool(docs), wA, true).slots;

// (ب) «إعادة بناءٍ كاملة بلا تجميد»: نبدأ من الصفر، ط٥ غائبٌ يوم الخميس فقط،
//     ونسمح للأحد→الأربعاء أن تُحسب من جديد (لا نعاملها كماضٍ).
const wB = createWheels(docs, []);
const open: Record<string, AssignedSlot[]> = {};
for (const day of DAYS) {
  const av = day === 'thursday' ? docs.filter((d) => d.id !== 'd5') : docs; // ط٥ غائب الخميس فقط
  open[day] = distributeShiftWheel(day, 3, pool(av), wB, true).slots;
}

console.log('═══ مقارنة: قانونيّ  مقابل  إعادة بناءٍ كاملة (ط٥ غائب الخميس، بلا تجميد) ═══\n');
for (const day of DAYS) {
  const same = sig(canon[day]!) === sig(open[day]!);
  console.log(`${AR[day]}: ${same ? '✓ مطابق تماماً' : '⚠️ مختلف'}`);
  console.log(`   قانونيّ: ${desc(canon[day]!)}`);
  console.log(`   مفتوح  : ${desc(open[day]!)}`);
}
