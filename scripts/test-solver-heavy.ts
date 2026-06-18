/* المرحلة ٢ب: حلّال الأدوار الثقيلة بالحداثة (انفراد/دليقيتر) — بالظلّ، لا كتابة.
 * يتحقّق من: (أ) الأكثر استحقاقاً يأخذ أوّل مقعد، (ب) دورةٌ واحدة ثمّ يدور (لا تكدّس)،
 * (ج) الامتصاص قبل الحدث (العائد يأخذ مقعداً أبكر مؤهَّلاً)، (د) احترام الأهليّة. */
import { solveHeavyRecency } from '../lib/algorithms/solver';
import type { HeavySeat } from '../lib/algorithms/solver';

let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };

const doc = (id: string, name: string) => ({ id, name, groupTemplate: { key: 'group_a' } as any, groupId: 'g', workStatus: 'normal' as any, supervisorDoctorId: null });
const docs = [doc('A', 'أحمد'), doc('B', 'بدر'), doc('C', 'جمال')];

// (أ)+(ب) سيناريو الترتيب بالحداثة + الدورة الواحدة:
// أقدم ظهور: A='w1' (الأقدم/الأكثر استحقاقاً)، B='w2'، C='w3'. مقعدان انفراد متتاليان،
// كلاهما متاحٌ للجميع. المتوقّع: s1→A (الأكثر استحقاقاً)، s2→B (A صار أحدث بعد دوره).
{
  const prior = new Map([['A', 'w1'], ['B', 'w2'], ['C', 'w3']]);
  const seats: HeavySeat[] = [
    { id: 's1', stamp: 'w4#0#0', kind: 'solo', eligible: ['A', 'B', 'C'], current: 'C' },
    { id: 's2', stamp: 'w4#1#0', kind: 'solo', eligible: ['A', 'B', 'C'], current: 'C' },
  ];
  const r = solveHeavyRecency(docs, prior, seats);
  console.log('(أ/ب)', JSON.stringify(r.assignments));
  check('(أ) المقعد الأوّل لأحمد (الأكثر استحقاقاً)', r.assignments.find((a) => a.seatId === 's1')?.to === 'أحمد', JSON.stringify(r.assignments));
  check('(ب) المقعد الثاني لبدر لا لأحمد (دورةٌ واحدة ثمّ يدور)', r.assignments.find((a) => a.seatId === 's2')?.to === 'بدر', JSON.stringify(r.assignments));
  check('(أ/ب) أقصى بياتٍ لا يسوء', r.maxStaleAfter <= r.maxStaleBefore, `${r.maxStaleBefore}→${r.maxStaleAfter}`);
  check('(أ/ب) الأهليّة محترمة', r.owedRespected, '');
}

// (ج) الامتصاص قبل الحدث: A عاد من إجازةٍ طويلة (آخر ظهوره '' = الأقدم مطلقاً).
// النافذة فيها مقعدٌ **أبكر** (الاثنين) قبل «حدثٍ» يوم الأربعاء. A مؤهَّلٌ للاثنين.
// المتوقّع: A يأخذ مقعد الاثنين فوراً (امتصاصٌ مبكر) — لا ينتظر، ولا يُكدَّس.
{
  const prior = new Map([['A', ''], ['B', 'w3#1#0'], ['C', 'w3#2#0']]);
  const seats: HeavySeat[] = [
    { id: 'mon', stamp: 'w4#1#0', kind: 'solo', eligible: ['A', 'B', 'C'], current: 'B' },  // قبل الحدث
    { id: 'wed', stamp: 'w4#3#0', kind: 'solo', eligible: ['B', 'C'], current: 'C' },        // الحدث/بعده
  ];
  const r = solveHeavyRecency(docs, prior, seats);
  console.log('(ج)', JSON.stringify(r.assignments));
  check('(ج) العائد يمتصّ المقعد الأبكر (الاثنين)', r.assignments.find((a) => a.seatId === 'mon')?.to === 'أحمد', JSON.stringify(r.assignments));
  check('(ج) لا يُكدَّس على العائد (الأربعاء ليس له)', !r.assignments.some((a) => a.seatId === 'wed' && a.to === 'أحمد'), JSON.stringify(r.assignments));
}

// (د) احترام الأهليّة: الأكثر استحقاقاً (A) غير مؤهَّلٍ لمقعدٍ → لا يُجبَر، يأخذه التالي.
{
  const prior = new Map([['A', 'w1'], ['B', 'w2'], ['C', 'w3']]);
  const seats: HeavySeat[] = [
    { id: 's1', stamp: 'w4#0#0', kind: 'delegator', eligible: ['B', 'C'], current: 'C' }, // A غير مؤهَّل
  ];
  const r = solveHeavyRecency(docs, prior, seats);
  console.log('(د)', JSON.stringify(r.assignments));
  check('(د) المقعد لبدر (الأقدم بين المؤهَّلين)', r.assignments.find((a) => a.seatId === 's1')?.to === 'بدر', JSON.stringify(r.assignments));
  check('(د) الأهليّة محترمة رغم وجود أقدم غير مؤهَّل', r.owedRespected, '');
}

console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
if (fails.length) fails.forEach((f) => console.log('  • ' + f));
process.exit(fail ? 1 : 0);
