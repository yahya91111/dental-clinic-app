/* اختبار صارم للحلّال النقيّ للتغطية على الغياب (تركيبيّ، بلا قاعدة بيانات).
 * يغطّي: مقعدٌ مفردٌ شاغر، انفرادٌ شاغر (فترتان)، نقصُ بدلاء، عدلُ الحداثة،
 * قيدُ «بديلٌ واحدٌ لكلّ فترة»، الحتميّة، تعدّد الشفتات، وكشفُ المقاعد من prev_placement. */
import { extractCoverageSeats, solveCoverage } from '../lib/algorithms/solver';
import type { CoverageSeat } from '../lib/algorithms/solver';
import type { LoadedDoctor, LoadedSlot } from '../lib/algorithms/schedule';

let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };

const doc = (id: string, name: string): LoadedDoctor => ({
  id, name, groupTemplate: { key: 'a' } as any, groupId: 'g', workStatus: 'active' as any, supervisorDoctorId: null,
});
const DOCS = ['r1', 'r2', 'r3', 'r4', 'host', 'absent'].map((x) => doc(x, x.toUpperCase()));
const STAMP = '2099-01-04#0#0'; // الأحد صباح

const seat = (clinic: number, period: number, absentId = 'absent', stamp = STAMP): CoverageSeat =>
  ({ id: `cov|${stamp}|c${clinic}|p${period}`, stamp, clinicNumber: clinic, period, absentId });

// ① مقعدٌ مفردٌ شاغر (شريكُ زوجٍ غاب): بديلٌ واحدٌ يملؤه.
{
  const r = solveCoverage(DOCS, [seat(1, 1)], ['r1'], new Map());
  check('① مقعد مفرد: مُلئ ببديلٍ واحد', r.fills.length === 1 && r.fills[0]!.doctorId === 'r1');
  check('① مقعد مفرد: محفوظ', r.conserved);
}

// ② انفرادٌ شاغر (فترتان) + بديلان: كلٌّ يأخذ فترةً (لا إجبار انفراد).
{
  const r = solveCoverage(DOCS, [seat(1, 1), seat(1, 2)], ['r1', 'r2'], new Map());
  const byP = new Map(r.fills.map((f) => [f.period, f.doctorId]));
  check('② فترتان/بديلان: كلٌّ يأخذ فترة', r.fills.length === 2 && byP.get(1) !== byP.get(2), JSON.stringify([...byP]));
  check('② محفوظ', r.conserved);
}

// ③ انفرادٌ شاغر + بديلٌ واحد: يغطّي الفترتين (انفرادٌ اضطراريّ).
{
  const r = solveCoverage(DOCS, [seat(1, 1), seat(1, 2)], ['r1'], new Map());
  check('③ بديلٌ واحدٌ لفترتين: يغطّي كليهما', r.fills.length === 2 && r.fills.every((f) => f.doctorId === 'r1'));
  check('③ محفوظ', r.conserved);
}

// ④ لا بدلاء: نقصٌ صريحٌ بلا انهيارٍ ولا اختلاق.
{
  const r = solveCoverage(DOCS, [seat(1, 1)], [], new Map());
  check('④ لا بديل: لا تغطية', r.fills.length === 0);
  check('④ لا بديل: نقصٌ صريح (conserved=false)', r.conserved === false);
}

// ⑤ عيادتان شاغرتان + بديلٌ واحد: يغطّي الأبكر/الأصغر، والأخرى نقص.
{
  const r = solveCoverage(DOCS, [seat(2, 1), seat(1, 1)], ['r1'], new Map());
  check('⑤ بديلٌ واحدٌ لعيادتين: تغطيةٌ واحدةٌ للأصغر', r.fills.length === 1 && r.fills[0]!.clinicNumber === 1);
  check('⑤ الأخرى نقص', r.conserved === false);
}

// ⑥ عدلُ الحداثة: الأطولُ راحةً (الأقدمُ عملًا) يُسحَب أوّلًا.
{
  const prior = new Map([['r1', '2099-01-03#0#0'], ['r2', '2099-01-01#0#0']]); // r2 أقدمُ عملًا
  const r = solveCoverage(DOCS, [seat(1, 1)], ['r1', 'r2'], prior);
  check('⑥ الأقدمُ عملًا (r2) يُسحَب أوّلًا', r.fills[0]!.doctorId === 'r2', r.fills[0]!.doctorId);
}

// ⑦ قيدُ الفترة: بديلٌ لا يغطّي الفترة نفسها في عيادتين.
{
  const r = solveCoverage(DOCS, [seat(1, 1), seat(2, 1)], ['r1'], new Map());
  check('⑦ بديلٌ واحدٌ لا يكرّر الفترة نفسها', r.fills.length === 1);
  check('⑦ والثانية نقص', r.conserved === false);
}

// ⑧ تعدّد الشفتات: مقاعدُ شفتين تُحلّ مستقلّةً.
{
  const r = solveCoverage(DOCS, [seat(1, 1, 'absent', '2099-01-04#0#0'), seat(1, 1, 'absent', '2099-01-04#0#1')], ['r1'], new Map());
  check('⑧ شفتان مختلفان: بديلٌ واحدٌ يغطّي كليهما (فترةٌ مختلفةُ الختم)', r.fills.length === 2 && r.fills.every((f) => f.doctorId === 'r1'));
}

// ⑨ الحتميّة: نفس الدخل → نفس الخرج.
{
  const a = solveCoverage(DOCS, [seat(1, 1), seat(1, 2)], ['r1', 'r2', 'r3'], new Map());
  const b = solveCoverage(DOCS, [seat(1, 1), seat(1, 2)], ['r1', 'r2', 'r3'], new Map());
  check('⑨ حتميّ', JSON.stringify(a.fills) === JSON.stringify(b.fills));
}

// ⑩ كشفُ المقاعد من prev_placement: عيادة، واستبعادُ المغطَّى والدليقيتر.
{
  const slot = (over: Partial<LoadedSlot>): LoadedSlot => ({
    id: Math.random().toString(36).slice(2), weekStart: '2099-01-04', dayOfWeek: 'sunday',
    period: 1, clinicNumber: 1, doctorId: 'absent', doctorName: 'ABSENT', role: 'clinic' as any, status: 'active' as any, ...over,
  });
  const slots: LoadedSlot[] = [
    slot({ role: 'prev_placement' as any, clinicNumber: 3, period: 1, doctorId: 'absent' }),  // عيادةٌ شاغرة
    slot({ role: 'prev_placement' as any, clinicNumber: 0, period: 1, doctorId: 'absent' }),  // دليقيتر → ليس عيادة
    slot({ role: 'prev_placement' as any, clinicNumber: 5, period: 2, doctorId: 'x' }),        // عيادةٌ مغطّاة أدناه
    slot({ role: 'clinic' as any, clinicNumber: 5, period: 2, doctorId: 'cover', status: 'active' as any }), // الشاغل
  ];
  const cs = extractCoverageSeats(slots);
  check('⑩ كشف: مقعدٌ عيادةٍ شاغرٌ واحدٌ فقط', cs.length === 1 && cs[0]!.clinicNumber === 3, JSON.stringify(cs.map((c) => c.clinicNumber)));
  check('⑩ كشف: الدليقيتر (c0) لا يُحسب عيادة', !cs.some((c) => c.clinicNumber === 0));
  check('⑩ كشف: المغطّى (c5) ليس شاغرًا', !cs.some((c) => c.clinicNumber === 5));
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fails.length) fails.forEach((f) => console.log('  • ' + f));
process.exit(fail ? 1 : 0);
