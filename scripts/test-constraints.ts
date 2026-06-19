/* A4 (التخفيف) + A6 (النقص) — قيدان (ظلّ، لا كتابة).
 *  A4: طبيب التخفيف لا يدخل أهليّة الأدوار الثقيلة (انفراد/دليقيتر/احتياط/بورد)؛
 *      يُستثنى من البِركة فلا يُسنَد له دورٌ ثقيلٌ أبدًا.
 *  A6: مقعدٌ بلا مرشّحٍ (نقصٌ حقيقيّ) → يبقى مفتوحًا (conserved=false)، بلا انهيارٍ
 *      ولا اختراعِ طبيب. */
import { extractHeavySeats, solveLookahead, solveHeavyRecency } from '../lib/algorithms/solver';
import type { HeavySeat } from '../lib/algorithms/solver';
import type { LoadedDoctor, LoadedSlot } from '../lib/algorithms/schedule';

const W = '2099-01-04';
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };
const doc = (id: string, name: string, ws = 'normal'): LoadedDoctor => ({ id, name, groupTemplate: { key: 'group_a' } as any, groupId: 'g', workStatus: ws as any, supervisorDoctorId: null });
const slot = (o: Partial<LoadedSlot>): LoadedSlot => ({ id: 'x', weekStart: W, dayOfWeek: 'monday', period: 1, clinicNumber: 1, doctorId: '', doctorName: '', role: 'clinic', status: 'active', ...o });

function main() {
  // ════════ A4 — التخفيف ════════
  console.log('A4 — قيد التخفيف:');
  const docs = [doc('A', 'أحمد'), doc('B', 'بدر'), doc('C', 'جمال'), doc('L', 'مخفَّف', 'light_duty')];
  const poolIds = new Set(['A', 'B', 'C']); // التخفيف L مُستثنى من البِركة (كما في البناء)
  // شفتٌ فيه دليقيترٌ لأحمد، والتخفيف L **مُزاوَجٌ** في العيادة (ف١ معه، ف٢ لجمال).
  const shift: LoadedSlot[] = [
    slot({ period: 1, clinicNumber: 1, doctorId: 'A', doctorName: 'أحمد', role: 'clinic' }),
    slot({ period: 2, clinicNumber: 1, doctorId: 'B', doctorName: 'بدر', role: 'clinic' }),
    slot({ period: 1, clinicNumber: 0, doctorId: 'A', doctorName: 'أحمد', role: 'delegator' }),
    slot({ period: 1, clinicNumber: 2, doctorId: 'L', doctorName: 'مخفَّف', role: 'clinic' }), // ف١ التخفيف
    slot({ period: 2, clinicNumber: 2, doctorId: 'C', doctorName: 'جمال', role: 'clinic' }),   // ف٢ شريكه
  ];
  const seats = extractHeavySeats(shift, poolIds);
  const delSeat = seats.find((s) => s.kind === 'delegator');
  console.log('   أنواع المقاعد:', seats.map((s) => `${s.kind}/${docs.find((d) => d.id === s.current)?.name}`).join('، '));
  check('A4: التخفيف ليس في أهليّة الدليقيتر', !!delSeat && !delSeat.eligible.includes('L'), `${delSeat?.eligible}`);
  check('A4: التخفيف المُزاوَج لا يُنتِج مقعد انفراد', !seats.some((s) => s.kind === 'solo' && s.current === 'L'), '');
  check('A4: التخفيف ليس شاغلًا لأيّ دورٍ ثقيل (انفراد/دليقيتر)', !seats.some((s) => s.current === 'L'), '');
  if (delSeat) {
    const r = solveHeavyRecency(docs, new Map([['A', `${W}#0#0`], ['B', ''], ['C', '']]), [delSeat]);
    check('A4: الحلّال لا يُسنِد الدليقيتر للتخفيف', !r.assignments.some((a) => a.to === 'مخفَّف'), '');
  }

  // ════════ A6 — النقص ════════
  console.log('\nA6 — قيد النقص (لا مرشّح):');
  const docs2 = [doc('A', 'أحمد'), doc('B', 'بدر')];
  // مقعدٌ مفتوحٌ بلا أيّ مؤهَّلٍ متاح (الكلّ غائب/غير مؤهَّل) — نقصٌ حقيقيّ.
  const shortSeat: HeavySeat[] = [{ id: `del|${W}#1#0|A`, stamp: `${W}#1#0`, kind: 'delegator', eligible: [], current: 'A' }];
  let crashed = false; let rec: any = null;
  try { rec = solveLookahead(docs2, shortSeat, new Map()); } catch { crashed = true; }
  console.log(`   conserved=${rec?.conserved} · لمس=${rec?.assignments.length} · انهيار=${crashed}`);
  check('A6: لا انهيار عند النقص', !crashed, '');
  check('A6: يُعلِّم النقص (conserved=false)', rec?.conserved === false, `${rec?.conserved}`);
  check('A6: لا يخترع طبيبًا (المقعد يبقى للحاليّ، لا إسناد وهميّ)', (rec?.assignments.length ?? 99) === 0, `${rec?.assignments.length}`);

  // نقصٌ جزئيّ: مقعدان، مرشّحٌ واحدٌ فقط لكليهما → يُملأ واحدٌ ويُترك الآخر (conserved=false).
  const partial: HeavySeat[] = [
    { id: `del|${W}#1#0|A`, stamp: `${W}#1#0`, kind: 'delegator', eligible: ['A'], current: 'A' },
    { id: `del2|${W}#1#0|B`, stamp: `${W}#1#0`, kind: 'delegator', eligible: ['A'], current: 'B' }, // نفس المرشّح
  ];
  const rec2 = solveLookahead(docs2, partial, new Map());
  check('A6: نقصٌ جزئيّ → conserved=false (مقعدٌ بلا شاغلٍ صالح)', rec2.conserved === false, `${rec2.conserved}`);

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
}
main();
