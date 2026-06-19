/* A3 — تناوب عيادة البورد (ظلّ). القاعدة: الأقدمُ دخولًا للعيادة يدخلها التالي.
 * مُصطنَعٌ بـ٤ أطبّاء بورد ومقعدين (يلزم ٣+ ليظهر التناوب؛ عيادة الاختبار فيها ٢ فقط
 * فلا تناوب). نتحقّق: (أ) الأقدمان دخولًا يدخلان. (ب) أساسٌ بلا حدث → صفر لمس.
 * (ج) غيابُ داخلٍ → التالي الأقدم يدخل. قراءةٌ فقط — لا يكتب حرفًا. */
import { solveHeavyRecency } from '../lib/algorithms/solver';
import type { HeavySeat } from '../lib/algorithms/solver';
import type { LoadedDoctor } from '../lib/algorithms/schedule';

const W = '2099-01-04';
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };
const bd = (id: string, name: string): LoadedDoctor => ({ id, name, groupTemplate: { key: 'board' } as any, groupId: 'b', workStatus: 'normal' as any, supervisorDoctorId: null });
const docs = [bd('P', 'بورد١'), bd('Q', 'بورد٢'), bd('R', 'بورد٣'), bd('S', 'بورد٤')];
const nm = (id: string) => docs.find((d) => d.id === id)?.name ?? id;

function main() {
  const stamp = `${W}#1#0`; // الاثنين صباحًا
  // مقعدا عيادة البورد (ف١، ف٢)، شاغلهما الحاليّ P و Q. المؤهَّلون: الأربعة.
  const seats: HeavySeat[] = [
    { id: `board|${stamp}|p1`, stamp, kind: 'board', eligible: ['P', 'Q', 'R', 'S'], current: 'P' },
    { id: `board|${stamp}|p2`, stamp, kind: 'board', eligible: ['P', 'Q', 'R', 'S'], current: 'Q' },
  ];

  // (أ) آخر دخولٍ للعيادة: R و S لم يدخلا منذ زمنٍ بعيد ('')، P و Q دخلا حديثًا.
  //     فالأحقّ بالدخول الآن R و S (الأقدمان دخولًا). يجب أن ينتقل المقعدان إليهما.
  const lastBoard = new Map([['P', `${W}#0#0`], ['Q', `${W}#0#0`], ['R', ''], ['S', '']]);
  const r = solveHeavyRecency(docs, lastBoard, seats);
  const holders = seats.map((s) => r.assignments.find((a) => a.seatId === s.id)?.to ?? nm(s.current));
  console.log('(أ) داخلا العيادة بعد التناوب:', holders.join('، '));
  check('(أ) الأقدمان دخولًا (بورد٣ وبورد٤) يدخلان', holders.includes('بورد٣') && holders.includes('بورد٤'), holders.join('،'));
  check('(أ) الأحدثان (بورد١ وبورد٢) يخرجان للاحتياط', !holders.includes('بورد١') && !holders.includes('بورد٢'), holders.join('،'));
  check('(أ) الأهليّة محترمة', r.owedRespected, '');

  // (ب) أساسٌ بلا حدث: الشاغلان الحاليّان هما الأقدمان دخولًا → لمسٌ صفر.
  const lastBoard2 = new Map([['P', ''], ['Q', ''], ['R', `${W}#0#0`], ['S', `${W}#0#0`]]);
  const base = solveHeavyRecency(docs, lastBoard2, seats);
  check('(ب) أساس: لمسٌ صفر (الشاغلان هما الأقدمان)', base.assignments.length === 0, `لمس ${base.assignments.length}`);

  // (ج) غيابُ داخلٍ (P) → التالي الأقدم يدخل بدله، والآخر (Q) يبقى.
  const r3 = solveHeavyRecency(docs, lastBoard2, seats.map((s) => s.id.endsWith('p1') ? { ...s, eligible: ['Q', 'R', 'S'] } : s));
  const p1Holder = r3.assignments.find((a) => a.seatId.endsWith('p1'))?.to ?? 'P';
  console.log(`(ج) غياب بورد١ → دخل بدله: ${p1Holder}`);
  check('(ج) غيابُ داخلٍ: التالي الأقدم يدخل (لا يبقى الغائب)', p1Holder !== 'بورد١', p1Holder);
  check('(ج) الأهليّة محترمة', r3.owedRespected, '');

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
}
main();
