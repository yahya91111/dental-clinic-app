// السيناريو الأوّل: ٥ أطبّاء/٣ عيادات، صباح أحد→خميس. منفردُ الإثنين يأخذ طبيّةً
// يوم الإثنين فقط (حاضرٌ بقيّة الأسبوع). نعوّض الإثنين ثمّ نوازن للأمام، ونرصد:
// هل يأخذ «المرتاح» (الذي غاب الإثنين) حملاً أبكر لاحقاً؟ وأيّ الأيّام تغيّرت؟
import { createWheels, distributeShiftWheel } from '../lib/algorithms/wheel';
import { GROUP_TEMPLATES } from '../lib/algorithms/groupTemplates';
import type { LoadedDoctor, LoadedSlot, ShiftPool, AssignedSlot, WeekDay } from '../lib/algorithms/schedule';

const GA = GROUP_TEMPLATES.find((t) => t.key === 'group_a')!;
const WS = '2026-06-14';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const AR: Record<WeekDay, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };
const docs: LoadedDoctor[] = [1, 2, 3, 4, 5].map((n) => ({ id: `d${n}`, name: `طبيب ${n}`, groupTemplate: GA, groupId: 'g', workStatus: 'active', supervisorDoctorId: null }));
const nm = (id: string) => docs.find((d) => d.id === id)?.name || id;
const pool = (av: LoadedDoctor[]): ShiftPool => ({ shift: 'morning', available: av, lightDuty: [], beginnersByBuddy: new Map(), beginnersOrphan: [], absent: [], partialAvailable: [], boardRule: { kind: 'no_board' } } as ShiftPool);
const toL = (slots: AssignedSlot[], day: WeekDay): LoadedSlot[] => slots.map((s, i) => ({ id: `${day}-${i}`, weekStart: WS, dayOfWeek: day, period: s.role === 'ex' ? 0 : s.period, clinicNumber: s.clinicNumber, doctorId: s.doctor.id, doctorName: s.doctor.name, role: (s.role === 'ex' ? 'clinic' : s.role) as LoadedSlot['role'], status: (s.role === 'ex' ? 'extra' : 'active') as LoadedSlot['status'] }));
const soloOf = (slots: AssignedSlot[]): string[] => { const bc = new Map<number, Set<string>>(); for (const s of slots) if (s.role === 'clinic') (bc.get(s.clinicNumber) ?? bc.set(s.clinicNumber, new Set()).get(s.clinicNumber)!).add(s.doctor.id); const out: string[] = []; for (const [, ids] of bc) if (ids.size === 1) out.push([...ids][0]!); return out; };
const sig = (slots: AssignedSlot[]): string => slots.filter((s) => s.role !== 'ex').map((s) => `${s.clinicNumber}/${s.period}/${s.role}/${s.doctor.id}`).sort().join(';');

// ── بناء قانونيّ ──
const wB = createWheels(docs, []);
const canon: Record<string, AssignedSlot[]> = {};
const canonPast: LoadedSlot[] = [];
for (const day of DAYS) { const r = distributeShiftWheel(day, 3, pool(docs), wB, true); canon[day] = r.slots; canonPast.push(...toL(r.slots, day)); }
console.log('═══ المنفرد القانونيّ كلّ يوم ═══');
for (const day of DAYS) console.log(`${AR[day]}: منفرد = ${soloOf(canon[day]!).map(nm).join('، ')}`);

const monSolo = soloOf(canon['monday']!)[0]!;
console.log(`\n═══ «${nm(monSolo)}» (منفرد الإثنين) يأخذ طبيّةً يوم الإثنين فقط ═══\n`);

// ── الإثنين: عوّض بلا الغائب (يقرأ تاريخ الأحد) ──
const built: Record<string, AssignedSlot[]> = { sunday: canon['sunday']! };
const histAfterSun = toL(canon['sunday']!, 'sunday');
const wMon = createWheels(docs, histAfterSun);
const monCov = distributeShiftWheel('monday', 3, pool(docs.filter((d) => d.id !== monSolo)), wMon, true);
built['monday'] = monCov.slots;
console.log(`الإثنين (تعويض، ${nm(monSolo)} غائب): منفرد = ${soloOf(monCov.slots).map(nm).join('، ') || '—'}`);

// ── الموازنة للأمام: الثلاثاء→الخميس، كلٌّ يقرأ الواقع المُحدَّث، نكتب ونقارن ──
let hist = [...histAfterSun, ...toL(monCov.slots, 'monday')];
console.log('\n═══ الموازنة للأمام (مقارنة بالقانونيّ) ═══');
for (const day of ['tuesday', 'wednesday', 'thursday'] as WeekDay[]) {
  const w = createWheels(docs, hist); // الغائب حاضرٌ الآن (طبيّته الإثنين فقط)
  const r = distributeShiftWheel(day, 3, pool(docs), w, true);
  built[day] = r.slots;
  const changed = sig(r.slots) !== sig(canon[day]!);
  console.log(`${AR[day]}: منفرد = ${soloOf(r.slots).map(nm).join('، ')}  ${changed ? '⚠️ تغيّر عن القانونيّ (كان: ' + soloOf(canon[day]!).map(nm).join('، ') + ')' : '✓ ثابت'}`);
  hist = [...hist, ...toL(r.slots, day)];
}

// متى يعود «المرتاح» للانفراد؟
console.log(`\nمتى ينفرد «${nm(monSolo)}» بعد طبيّته؟`);
for (const day of ['tuesday', 'wednesday', 'thursday'] as WeekDay[]) {
  if (soloOf(built[day]!).includes(monSolo)) { console.log(`  → ${AR[day]} (قانونيّاً كان ينفرد: ${DAYS.filter((d) => soloOf(canon[d]!).includes(monSolo)).map((d) => AR[d]).join('،') || 'لا'})`); break; }
}
