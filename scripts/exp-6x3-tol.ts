// نفس سيناريو exp-6x3، لكن نقارن: المحرّك الصارم (يوازن للأمام) مقابل التسامح
// (k=1: يغطّي يوم الغياب فقط، ويؤجّل الموازنة للأمام). نطبع الفرق.
import { createWheels, distributeShiftWheel } from '../lib/algorithms/wheel';
import { GROUP_TEMPLATES } from '../lib/algorithms/groupTemplates';
import type { LoadedDoctor, LoadedSlot, ShiftPool, AssignedSlot, WeekDay } from '../lib/algorithms/schedule';
const GA = GROUP_TEMPLATES.find((t) => t.key === 'group_a')!;
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const IDX: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
const AR: Record<WeekDay, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };
const docs: LoadedDoctor[] = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `d${n}`, name: `ط${n}`, groupTemplate: GA, groupId: 'g', workStatus: 'active', supervisorDoctorId: null }));
const nm = (id: string) => docs.find((d) => d.id === id)?.name || id;
const pool = (av: LoadedDoctor[]): ShiftPool => ({ shift: 'morning', available: av, lightDuty: [], beginnersByBuddy: new Map(), beginnersOrphan: [], absent: [], partialAvailable: [], boardRule: { kind: 'no_board' } } as ShiftPool);
const toL = (slots: AssignedSlot[], day: WeekDay): LoadedSlot[] => slots.map((s, i) => ({ id: `${day}-${i}`, weekStart: 'w', dayOfWeek: day, period: s.role === 'ex' ? 0 : s.period, clinicNumber: s.clinicNumber, doctorId: s.doctor.id, doctorName: s.doctor.name, role: (s.role === 'ex' ? 'clinic' : s.role) as LoadedSlot['role'], status: (s.role === 'ex' ? 'extra' : 'active') as LoadedSlot['status'] }));
const desc = (slots: AssignedSlot[]): string => { const bc = new Map<number, string[]>(); const del: string[] = []; for (const s of slots) { if (s.role === 'delegator') { del.push(nm(s.doctor.id)); continue; } if (s.role === 'ex') continue; (bc.get(s.clinicNumber) ?? bc.set(s.clinicNumber, []).get(s.clinicNumber)!).push(nm(s.doctor.id)); } const parts: string[] = []; for (const c of [...bc.keys()].sort()) { const u = [...new Set(bc.get(c)!)]; parts.push(`ع${c}:[${u.join('+')}]${u.length === 1 ? '★' : ''}`); } if (del.length) parts.push(`دل:[${[...new Set(del)].join('+')}]`); return parts.join('  '); };
const seatMap = (slots: AssignedSlot[]): Map<string, string> => { const m = new Map<string, string[]>(); for (const s of slots) { if (s.role === 'ex') continue; (m.get(s.doctor.id) ?? m.set(s.doctor.id, []).get(s.doctor.id)!).push(`${s.role === 'delegator' ? 'دل' : 'ع' + s.clinicNumber}/ف${s.period}`); } const out = new Map<string, string>(); for (const [id, arr] of m) out.set(id, arr.sort().join(',')); return out; };
const sig = (slots: AssignedSlot[]): string => slots.filter((s) => s.role !== 'ex').map((s) => `${s.clinicNumber}/${s.period}/${s.role}/${s.doctor.id}`).sort().join(';');

const w0 = createWheels(docs, []);
const canon: Record<string, AssignedSlot[]> = {};
for (const day of DAYS) canon[day] = distributeShiftWheel(day, 3, pool(docs), w0, true).slots;

const ABS: [WeekDay, string][] = [['wednesday', 'd3'], ['monday', 'd5']];

function run(forward: boolean) {
  const db: Record<string, AssignedSlot[]> = JSON.parse(JSON.stringify(canon));
  const absentByDay: Record<string, Set<string>> = {}; for (const d of DAYS) absentByDay[d] = new Set();
  const histBefore = (day: WeekDay): LoadedSlot[] => { const out: LoadedSlot[] = []; for (const d of DAYS) { if (IDX[d] >= IDX[day]) break; out.push(...toL(db[d]!, d)); } return out; };
  const recompute = (day: WeekDay): AssignedSlot[] => distributeShiftWheel(day, 3, pool(docs.filter((d) => !absentByDay[day].has(d.id))), createWheels(docs, histBefore(day)), true).slots;
  for (const [absDay, absDoc] of ABS) {
    absentByDay[absDay].add(absDoc);
    db[absDay] = recompute(absDay); // تغطية يوم الغياب (حتميّة)
    if (forward) for (let o = IDX[absDay] + 1; o < 5; o++) { const day = DAYS[o]!; const rec = recompute(day); if (sig(rec) !== sig(db[day]!)) db[day] = rec; }
    // التسامح: لا موازنة للأمام (تأجيل ضمن k=1)
  }
  return { db, absentByDay };
}

function report(title: string, res: ReturnType<typeof run>) {
  const { db, absentByDay } = res;
  const movers = new Set<string>(); const changedDays: string[] = [];
  for (const day of DAYS) {
    if (sig(canon[day]!) === sig(db[day]!)) continue;
    changedDays.push(AR[day]);
    const before = seatMap(canon[day]!); const after = seatMap(db[day]!);
    for (const id of new Set([...before.keys(), ...after.keys()])) if (before.get(id) !== after.get(id) && !absentByDay[day].has(id)) movers.add(id);
  }
  console.log(`\n${title}`);
  console.log(`   الأيّام المتغيّرة: ${changedDays.length} (${changedDays.join('، ') || 'لا شيء'})`);
  console.log(`   الأطبّاء المتحرّكون: ${movers.size} (${[...movers].map(nm).join('، ') || 'لا أحد'})`);
  console.log(`   إشعارات «راجِع الجدول»: ${movers.size}`);
  return { days: changedDays.length, movers: movers.size, db };
}

console.log('═══ السيناريو: غياب ط3 الأربعاء + ط5 الإثنين (٦ أطبّاء/٣ عيادات) ═══');
const strict = report('▣ المحرّك الحاليّ (صارم — يوازن للأمام):', run(true));
const tol = report('◇ مع التسامح (k=1 — يغطّي يوم الغياب فقط، يؤجّل الباقي):', run(false));

console.log('\n═══ تفصيل أيّام التسامح ═══');
for (const day of DAYS) {
  const ch = sig(canon[day]!) !== sig(tol.db[day]!);
  console.log(`${AR[day]}: ${ch ? '⚠️ غُطّي' : '✓ بقي كما نُشر'}`);
  if (ch) { console.log(`   قبل: ${desc(canon[day]!)}`); console.log(`   بعد: ${desc(tol.db[day]!)}`); }
}
console.log(`\n📊 الفرق: الصارم غيّر ${strict.days} أيّام و${strict.movers} أطبّاء — التسامح غيّر ${tol.days} يومين و${tol.movers} أطبّاء.`);
console.log('💡 ما أجّله التسامح يُسدّده ميزان العجلة في الأسبوع/الأيّام القادمة تلقائيّاً.');
