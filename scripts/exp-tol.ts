// نموذج «طبقة التسامح»: ٥ أطبّاء/٣ عيادات. منفردُ الإثنين (ط٢) يغيب الإثنين.
// نقارن استراتيجيّتين، ونقيس: (أ) كم شفتاً للأمام يتغيّر، (ب) توزيع الانفراد
// (العدل)، (ج) كيف يُسدَّد الدَّين الأسبوع التالي من ذاكرة العجلة.
import { createWheels, distributeShiftWheel } from '../lib/algorithms/wheel';
import { GROUP_TEMPLATES } from '../lib/algorithms/groupTemplates';
import type { LoadedDoctor, LoadedSlot, ShiftPool, AssignedSlot, WeekDay } from '../lib/algorithms/schedule';
const GA = GROUP_TEMPLATES.find((t) => t.key === 'group_a')!;
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const AR: Record<WeekDay, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };
const docs: LoadedDoctor[] = [1, 2, 3, 4, 5].map((n) => ({ id: `d${n}`, name: `ط${n}`, groupTemplate: GA, groupId: 'g', workStatus: 'active', supervisorDoctorId: null }));
const nm = (id: string) => docs.find((d) => d.id === id)?.name || id;
const pool = (av: LoadedDoctor[]): ShiftPool => ({ shift: 'morning', available: av, lightDuty: [], beginnersByBuddy: new Map(), beginnersOrphan: [], absent: [], partialAvailable: [], boardRule: { kind: 'no_board' } } as ShiftPool);
const toL = (slots: AssignedSlot[], wk: string, day: WeekDay): LoadedSlot[] => slots.map((s, i) => ({ id: `${wk}-${day}-${i}`, weekStart: wk, dayOfWeek: day, period: s.role === 'ex' ? 0 : s.period, clinicNumber: s.clinicNumber, doctorId: s.doctor.id, doctorName: s.doctor.name, role: (s.role === 'ex' ? 'clinic' : s.role) as LoadedSlot['role'], status: (s.role === 'ex' ? 'extra' : 'active') as LoadedSlot['status'] }));
const solosOf = (slots: AssignedSlot[]): string[] => { const bc = new Map<number, Set<string>>(); for (const s of slots) if (s.role === 'clinic') (bc.get(s.clinicNumber) ?? bc.set(s.clinicNumber, new Set()).get(s.clinicNumber)!).add(s.doctor.id); const out: string[] = []; for (const [, ids] of bc) if (ids.size === 1) out.push([...ids][0]!); return out; };
const sig = (slots: AssignedSlot[]): string => slots.filter((s) => s.role !== 'ex').map((s) => `${s.clinicNumber}/${s.period}/${s.role}/${s.doctor.id}`).sort().join(';');
const counts = (week: Record<string, AssignedSlot[]>) => { const c = new Map<string, number>(); for (const d of DAYS) for (const id of solosOf(week[d]!)) c.set(id, (c.get(id) ?? 0) + 1); return docs.map((d) => `${d.name}:${c.get(d.id) ?? 0}`).join('  '); };

const WK1 = '2026-06-14'; const WK2 = '2026-06-21';
// ── أسبوع ١ قانونيّ ──
const w1 = createWheels(docs, []);
const canon: Record<string, AssignedSlot[]> = {};
for (const day of DAYS) canon[day] = distributeShiftWheel(day, 3, pool(docs), w1, true).slots;
const monSolo = solosOf(canon['monday']!)[0]!; // ط٢
console.log('الجدول القانونيّ — المنفرد كلّ يوم:');
for (const d of DAYS) console.log(`  ${AR[d]}: ${solosOf(canon[d]!).map(nm).join('،')}`);
console.log(`\n«${nm(monSolo)}» يغيب الإثنين (كان منفردَه).\n`);

// تغطية الإثنين (مشتركة): اقرأ تاريخ الأحد، وزّع الإثنين بلا الغائب
const histMon = toL(canon['sunday']!, WK1, 'sunday');
const monCov = distributeShiftWheel('monday', 3, pool(docs.filter((d) => d.id !== monSolo)), createWheels(docs, histMon), true).slots;

// ════ (أ) صارم k=0: عوّض الإثنين ثمّ أعد حساب كلّ يومٍ للأمام ════
const strict: Record<string, AssignedSlot[]> = { sunday: canon['sunday']!, monday: monCov };
let hist = [...histMon, ...toL(monCov, WK1, 'monday')];
for (const day of ['tuesday', 'wednesday', 'thursday'] as WeekDay[]) { const r = distributeShiftWheel(day, 3, pool(docs), createWheels(docs, hist), true).slots; strict[day] = r; hist = [...hist, ...toL(r, WK1, day)]; }

// ════ (ب) متسامح k≥1: عوّض الإثنين فقط، أبقِ الأمام كما نُشر ════
const lazy: Record<string, AssignedSlot[]> = { sunday: canon['sunday']!, monday: monCov, tuesday: canon['tuesday']!, wednesday: canon['wednesday']!, thursday: canon['thursday']! };

const fwdChanged = (wk: Record<string, AssignedSlot[]>) => (['tuesday', 'wednesday', 'thursday'] as WeekDay[]).filter((d) => sig(wk[d]!) !== sig(canon[d]!)).length;
console.log('══════════ أسبوع ١: المقارنة ══════════');
console.log(`صارم (k=0):   شفتات للأمام تغيّرت = ${fwdChanged(strict)}/٣   |  انفرادات: ${counts(strict)}`);
console.log(`متسامح (k≥1): شفتات للأمام تغيّرت = ${fwdChanged(lazy)}/٣   |  انفرادات: ${counts(lazy)}`);

// ════ (ج) أسبوع ٢: ابنِ من تاريخ كلٍّ، وانظر متى ينفرد «الغائب» ومَن أُجِّل ════
const histOf = (wk: Record<string, AssignedSlot[]>) => DAYS.flatMap((d) => toL(wk[d]!, WK1, d));
const buildW2 = (past: LoadedSlot[]) => { const w = createWheels(docs, past); const out: Record<string, AssignedSlot[]> = {}; for (const day of DAYS) { const r = distributeShiftWheel(day, 3, pool(docs), w, true).slots; out[day] = r; } return out; };
const w2strict = buildW2(histOf(strict));
const w2lazy = buildW2(histOf(lazy));
const firstSolo = (wk: Record<string, AssignedSlot[]>, id: string) => DAYS.find((d) => solosOf(wk[d]!).includes(id));
console.log('\n══════════ أسبوع ٢ (تُسدّد الذاكرة الدَّين تلقائيّاً) ══════════');
console.log(`بعد المسار الصارم:   ${nm(monSolo)} ينفرد ${firstSolo(w2strict, monSolo) ? AR[firstSolo(w2strict, monSolo)!] : '—'}  |  انفرادات أسبوع٢: ${counts(w2strict)}`);
console.log(`بعد المسار المتسامح: ${nm(monSolo)} ينفرد ${firstSolo(w2lazy, monSolo) ? AR[firstSolo(w2lazy, monSolo)!] : '—'}  |  انفرادات أسبوع٢: ${counts(w2lazy)}`);
console.log(`\n(لاحظ: المتسامح حمّل ط٣/ط٤ زيادةً أسبوع١ → الذاكرة تُريّحهما وتُقدّم ${nm(monSolo)} أسبوع٢)`);
