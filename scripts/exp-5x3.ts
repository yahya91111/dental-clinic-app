// محاكاة مستقلّة (بلا قاعدة بيانات): ٥ أطبّاء، ٣ عيادات، صباح كلّ يوم أحد→خميس.
// نبني الأسبوع بمحرّك العجلة، نرصد دوران «المنفرد»، ثمّ نُغيّب منفردَ الخميس
// (طبية) ونعيد توزيع الخميس — لنرى كيف توزّع العجلة الحملَ بالعدل.
import { createWheels, distributeShiftWheel } from '../lib/algorithms/wheel';
import { GROUP_TEMPLATES } from '../lib/algorithms/groupTemplates';
import type { LoadedDoctor, LoadedSlot, ShiftPool, AssignedSlot, WeekDay } from '../lib/algorithms/schedule';

const GA = GROUP_TEMPLATES.find((t) => t.key === 'group_a')!;
const WS = '2026-06-14';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const AR: Record<WeekDay, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };

const docs: LoadedDoctor[] = [1, 2, 3, 4, 5].map((n) => ({
  id: `d${n}`, name: `طبيب ${n}`, groupTemplate: GA, groupId: 'g', workStatus: 'active', supervisorDoctorId: null,
}));
const nm = (id: string) => docs.find((d) => d.id === id)?.name || id;

function poolOf(available: LoadedDoctor[]): ShiftPool {
  return {
    shift: 'morning', available, lightDuty: [], beginnersByBuddy: new Map(), beginnersOrphan: [],
    absent: [], partialAvailable: [], boardRule: { kind: 'no_board' },
  } as ShiftPool;
}
function toLoaded(slots: AssignedSlot[], day: WeekDay): LoadedSlot[] {
  return slots.map((s, i) => ({
    id: `${day}-${i}`, weekStart: WS, dayOfWeek: day, period: s.role === 'ex' ? 0 : s.period,
    clinicNumber: s.clinicNumber, doctorId: s.doctor.id, doctorName: s.doctor.name,
    role: (s.role === 'ex' ? 'clinic' : s.role) as LoadedSlot['role'],
    status: (s.role === 'ex' ? 'extra' : 'active') as LoadedSlot['status'],
  }));
}
// يصف شفتاً: لكلّ عيادة مَن فيها (منفرد/زوج/مضيف) + الدليقيتر
function describe(slots: AssignedSlot[]): string {
  const byClinic = new Map<number, AssignedSlot[]>();
  const del: AssignedSlot[] = [];
  for (const s of slots) {
    if (s.role === 'delegator') { del.push(s); continue; }
    if (s.role === 'ex') { (byClinic.get(-1) ?? byClinic.set(-1, []).get(-1)!).push(s); continue; }
    (byClinic.get(s.clinicNumber) ?? byClinic.set(s.clinicNumber, []).get(s.clinicNumber!)!).push(s);
  }
  const parts: string[] = [];
  for (const c of [...byClinic.keys()].filter((k) => k > 0).sort()) {
    const ss = byClinic.get(c)!;
    const names = [...new Set(ss.map((x) => nm(x.doctor.id)))];
    const solo = names.length === 1;
    parts.push(`ع${c}:[${names.join('+')}]${solo ? '(منفرد)' : ''}`);
  }
  const delNames = [...new Set(del.map((x) => nm(x.doctor.id)))];
  if (delNames.length) parts.push(`دليقيتر:[${delNames.join('+')}]`);
  const ex = byClinic.get(-1);
  if (ex) parts.push(`احتياط:[${[...new Set(ex.map((x) => nm(x.doctor.id)))].join('+')}]`);
  return parts.join('  ');
}
function soloOf(slots: AssignedSlot[]): string | null {
  const cnt = new Map<string, Set<number>>();
  for (const s of slots) if (s.role === 'clinic') (cnt.get(s.doctor.id) ?? cnt.set(s.doctor.id, new Set()).get(s.doctor.id)!).add(s.clinicNumber);
  // منفرد = طبيب وحده في عيادته بكلتا الفترتين، ولا أحد آخر بنفس العيادة
  const byClinic = new Map<number, Set<string>>();
  for (const s of slots) if (s.role === 'clinic') (byClinic.get(s.clinicNumber) ?? byClinic.set(s.clinicNumber, new Set()).get(s.clinicNumber)!).add(s.doctor.id);
  for (const [, ids] of byClinic) if (ids.size === 1) return [...ids][0]!;
  return null;
}

console.log('═══ بناء الأسبوع (٥ أطبّاء، ٣ عيادات، صباحاً) ═══\n');
const wheels = createWheels(docs, []);
const past: LoadedSlot[] = [];
const weekSlots: Record<string, AssignedSlot[]> = {};
for (const day of DAYS) {
  const r = distributeShiftWheel(day, 3, poolOf(docs), wheels, true);
  weekSlots[day] = r.slots;
  past.push(...toLoaded(r.slots, day));
  console.log(`${AR[day]}: ${describe(r.slots)}`);
  console.log(`   → المنفرد: ${soloOf(r.slots) ? nm(soloOf(r.slots)!) : '—'}\n`);
}

const thuSolo = soloOf(weekSlots['thursday']!);
console.log(`\n═══ الخميس: «${nm(thuSolo!)}» منفردٌ ويأخذ طبيّة ═══`);
console.log(`قبل: ${describe(weekSlots['thursday']!)}\n`);

// تعويض: أعِد بناء العجلة من الواقع (أحد→أربعاء) ثمّ وزّع الخميس بلا الغائب
const pastBeforeThu = past.filter((s) => s.dayOfWeek !== 'thursday');
const wCov = createWheels(docs, pastBeforeThu);
const remaining = docs.filter((d) => d.id !== thuSolo);
const rCov = distributeShiftWheel('thursday', 3, poolOf(remaining), wCov, true);
console.log(`بعد التعويض (٤ أطبّاء على ٣ عيادات): ${describe(rCov.slots)}`);

// مَن «دخل» العيادة بدل المنفرد الغائب؟ قارن المقاعد
const before = new Map<string, string>();
for (const s of weekSlots['thursday']!) if (s.role !== 'ex') before.set(`ع${s.clinicNumber}/ف${s.period}/${s.role}`, s.doctor.id);
const after = new Map<string, string>();
for (const s of rCov.slots) if (s.role !== 'ex') after.set(`ع${s.clinicNumber}/ف${s.period}/${s.role}`, s.doctor.id);
console.log('\nالتبدّلات في مقاعد الخميس:');
const seats = [...new Set([...before.keys(), ...after.keys()])].sort();
for (const k of seats) {
  const b = before.get(k), a = after.get(k);
  if (b !== a) console.log(`  ${k}: ${b ? nm(b) : '—'} → ${a ? nm(a) : '—'}`);
}
