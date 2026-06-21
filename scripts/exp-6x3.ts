// ٦ أطبّاء/٣ عيادات. الأسبوع مبنيّ. السبت: (١) غياب الأربعاء يُغطّى، ثمّ
// (٢) غياب الإثنين. نحاكي المحرّك تماماً: غطِّ يوم الغياب + وازِن للأمام (اقرأ
// الواقع، اكتب الفرق فقط). نطبع: أيّ الأيّام تغيّرت، وكم طبيباً تحرّك.
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
// خريطة طبيب→مقاعده (للمقارنة: مَن تحرّك)
const seatMap = (slots: AssignedSlot[]): Map<string, string> => { const m = new Map<string, string[]>(); for (const s of slots) { if (s.role === 'ex') continue; (m.get(s.doctor.id) ?? m.set(s.doctor.id, []).get(s.doctor.id)!).push(`${s.role === 'delegator' ? 'دل' : 'ع' + s.clinicNumber}/ف${s.period}`); } const out = new Map<string, string>(); for (const [id, arr] of m) out.set(id, arr.sort().join(',')); return out; };

// حالة قاعدة البيانات الحاليّة + الغيابات لكلّ يوم
const db: Record<string, AssignedSlot[]> = {};
const absentByDay: Record<string, Set<string>> = {}; for (const d of DAYS) absentByDay[d] = new Set();

const historyBefore = (day: WeekDay): LoadedSlot[] => { const out: LoadedSlot[] = []; for (const d of DAYS) { if (IDX[d] >= IDX[day]) break; out.push(...toL(db[d]!, d)); } return out; };
const recompute = (day: WeekDay): AssignedSlot[] => { const w = createWheels(docs, historyBefore(day)); const av = docs.filter((d) => !absentByDay[day].has(d.id)); return distributeShiftWheel(day, 3, pool(av), w, true).slots; };
const sig = (slots: AssignedSlot[]): string => slots.filter((s) => s.role !== 'ex').map((s) => `${s.clinicNumber}/${s.period}/${s.role}/${s.doctor.id}`).sort().join(';');

// ── بناء قانونيّ (٦ أطبّاء كلّ يوم) — هذا «المنشور» ──
const w0 = createWheels(docs, []);
for (const day of DAYS) { db[day] = distributeShiftWheel(day, 3, pool(docs), w0, true).slots; }
const canon: Record<string, AssignedSlot[]> = JSON.parse(JSON.stringify(db));
console.log('═══ الجدول المنشور (٦ أطبّاء/٣ عيادات) ═══');
for (const day of DAYS) console.log(`${AR[day]}: ${desc(db[day]!)}`);

// ── معالجة غيابٍ كما يفعل المحرّك: غطِّ يوم الغياب + وازِن للأمام (اكتب الفرق) ──
function process(absDay: WeekDay, absDoc: string, label: string) {
  console.log(`\n──────── ${label}: ${nm(absDoc)} يغيب ${AR[absDay]} ────────`);
  absentByDay[absDay].add(absDoc);
  db[absDay] = recompute(absDay); // تغطية يوم الغياب
  for (let o = IDX[absDay] + 1; o < 5; o++) { // موازنة للأمام
    const day = DAYS[o]!; const rec = recompute(day);
    if (sig(rec) !== sig(db[day]!)) db[day] = rec; // اكتب الفرق فقط
  }
}
process('wednesday', 'd3', 'الطلب الأوّل');
process('monday', 'd5', 'الطلب الثاني');

// ── النتيجة: قارن النهائيّ بالمنشور ──
console.log('\n═══════════ النتيجة النهائيّة مقابل المنشور ═══════════');
const allMovers = new Set<string>();
for (const day of DAYS) {
  const before = seatMap(canon[day]!); const after = seatMap(db[day]!);
  const ids = new Set([...before.keys(), ...after.keys()]);
  const moved: string[] = [];
  for (const id of ids) { if (before.get(id) !== after.get(id)) { moved.push(id); if (!absentByDay[day].has(id)) allMovers.add(id); } }
  const changed = sig(canon[day]!) !== sig(db[day]!);
  console.log(`\n${AR[day]}: ${changed ? '⚠️ تغيّر' : '✓ ثابت'}`);
  if (changed) {
    console.log(`   قبل: ${desc(canon[day]!)}`);
    console.log(`   بعد: ${desc(db[day]!)}`);
    const realMovers = moved.filter((id) => !absentByDay[day].has(id));
    const absentees = moved.filter((id) => absentByDay[day].has(id));
    console.log(`   تحرّك: ${realMovers.map(nm).join('، ') || '—'}${absentees.length ? `  (وخرج للغياب: ${absentees.map(nm).join('، ')})` : ''}`);
  }
}
const changedDays = DAYS.filter((d) => sig(canon[d]!) !== sig(db[d]!));
console.log(`\n📊 الخلاصة: تغيّرت ${changedDays.length} أيّام (${changedDays.map((d) => AR[d]).join('، ')}).`);
console.log(`👥 عدد الأطبّاء المتحرّكين (غير الغائبَين): ${allMovers.size} → ${[...allMovers].map(nm).join('، ')}`);
console.log(`🔔 إشعار «راجِع الجدول» يصل هؤلاء الـ${allMovers.size} فقط (مرّةً واحدة للأسبوع).`);
