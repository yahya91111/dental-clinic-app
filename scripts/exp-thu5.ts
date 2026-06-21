// ط١ منفردُ الأحد، ويقدّم مرضيّةً ليوم الخميس (قبل بدء الأسبوع). ٥ أطبّاء/٣ عيادات.
// نرصد: هل يتغيّر الأحد (انفراد ط١)؟ وأيّ الأيّام تتأثّر؟ ومَن يغطّي الخميس؟
import { createWheels, distributeShiftWheel } from '../lib/algorithms/wheel';
import { GROUP_TEMPLATES } from '../lib/algorithms/groupTemplates';
import type { LoadedDoctor, LoadedSlot, ShiftPool, AssignedSlot, WeekDay } from '../lib/algorithms/schedule';
const GA = GROUP_TEMPLATES.find((t) => t.key === 'group_a')!;
const WS = '2026-06-14';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const AR: Record<WeekDay, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };
const docs: LoadedDoctor[] = [1, 2, 3, 4, 5].map((n) => ({ id: `d${n}`, name: `ط${n}`, groupTemplate: GA, groupId: 'g', workStatus: 'active', supervisorDoctorId: null }));
const nm = (id: string) => docs.find((d) => d.id === id)?.name || id;
const pool = (av: LoadedDoctor[]): ShiftPool => ({ shift: 'morning', available: av, lightDuty: [], beginnersByBuddy: new Map(), beginnersOrphan: [], absent: [], partialAvailable: [], boardRule: { kind: 'no_board' } } as ShiftPool);
const toL = (slots: AssignedSlot[], day: WeekDay): LoadedSlot[] => slots.map((s, i) => ({ id: `${day}-${i}`, weekStart: WS, dayOfWeek: day, period: s.role === 'ex' ? 0 : s.period, clinicNumber: s.clinicNumber, doctorId: s.doctor.id, doctorName: s.doctor.name, role: (s.role === 'ex' ? 'clinic' : s.role) as LoadedSlot['role'], status: (s.role === 'ex' ? 'extra' : 'active') as LoadedSlot['status'] }));
const desc = (slots: AssignedSlot[]): string => { const bc = new Map<number, string[]>(); const del: string[] = []; for (const s of slots) { if (s.role === 'delegator') { del.push(nm(s.doctor.id)); continue; } if (s.role === 'ex') continue; (bc.get(s.clinicNumber) ?? bc.set(s.clinicNumber, []).get(s.clinicNumber)!).push(nm(s.doctor.id)); } const parts: string[] = []; for (const c of [...bc.keys()].sort()) { const u = [...new Set(bc.get(c)!)]; parts.push(`ع${c}:[${u.join('+')}]${u.length === 1 ? '★منفرد' : ''}`); } if (del.length) parts.push(`دل:[${[...new Set(del)].join('+')}]`); return parts.join('  '); };

// بناء قانونيّ (أُنشئ الأربعاء) — العجلة تتطوّر حيّاً
const w = createWheels(docs, []);
const canon: Record<string, AssignedSlot[]> = {};
const past: LoadedSlot[] = [];
console.log('═══ الجدول كما أُنشئ (قبل المرضيّة) ═══');
for (const day of DAYS) { const r = distributeShiftWheel(day, 3, pool(docs), w, true); canon[day] = r.slots; past.push(...toL(r.slots, day)); console.log(`${AR[day]}: ${desc(r.slots)}`); }

console.log('\n═══ ط5 قدّم مرضيّةً للخميس فقط ═══');
console.log('الأحد→الأربعاء: لا يُمَسّ (الغياب يوم الخميس، والموازنة للأمام لا شيء بعده).\n');

// أعِد توزيع الخميس فقط: اقرأ تاريخ الأحد→الأربعاء، وزّع الخميس بلا ط1
const pastBeforeThu = past.filter((s) => s.dayOfWeek !== 'thursday');
const wThu = createWheels(docs, pastBeforeThu);
const rThu = distributeShiftWheel('thursday', 3, pool(docs.filter((d) => d.id !== 'd5')), wThu, true);
console.log(`الخميس — قبل: ${desc(canon['thursday']!)}`);
console.log(`الخميس — بعد: ${desc(rThu.slots)}  (ط5 غائب)`);

// عدّ انفرادات كلٍّ بعد التغيّر (الأحد→الأربعاء كما هي + الخميس الجديد)
const finalWeek = { ...canon, thursday: rThu.slots };
const soloCount = new Map<string, number>();
for (const day of DAYS) { const bc = new Map<number, Set<string>>(); for (const s of finalWeek[day]!) if (s.role === 'clinic') (bc.get(s.clinicNumber) ?? bc.set(s.clinicNumber, new Set()).get(s.clinicNumber)!).add(s.doctor.id); for (const [, ids] of bc) if (ids.size === 1) soloCount.set([...ids][0]!, (soloCount.get([...ids][0]!) ?? 0) + 1); }
console.log('\nعدد الانفرادات في الأسبوع لكلّ طبيب:');
for (const d of docs) console.log(`  ${d.name}: ${soloCount.get(d.id) ?? 0}${d.id === 'd5' ? '  (منفرد الخميس أصلاً، غاب)' : ''}`);
