/* A5 — استئذان طبيبٍ مُضيف (clinic@فترة + delegator@الأخرى)، بالظلّ. أسئلة المستخدم:
 *  ① مَن يُختار من الفترة الأخرى ليغطّي؟  → الأعدلُ (الأكثر استحقاقًا للعمل / الأقلّ عملًا)
 *     بدل «أقلّ رقم عيادة» كما يفعل النظام الحاليّ.
 *  ② أين يعدّل: في «الماضي الذي لم يأتِ» (أيّامٌ قبل يوم الاستئذان لكنّها مستقبل) أم في
 *     ما بعد الطلب؟  → يغطّي عند يوم الحدث؛ ويلمس قبله فقط عند إثقالٍ مُجبَر.
 *  ③ لو عاد وألغى الاستئذان → يرجع المُضيف مكانه (تصحيحٌ عكسيّ).
 *  قراءةٌ فقط — لا يكتب حرفًا. */
import { solveHeavyRecency, rebalanceDays, extractHeavySeats, lastHeavyStamps } from '../lib/algorithms/solver';
import type { HeavySeat } from '../lib/algorithms/solver';
import type { LoadedDoctor } from '../lib/algorithms/schedule';

const W = '2099-01-04';
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };
const doc = (id: string, name: string): LoadedDoctor => ({ id, name, groupTemplate: { key: 'group_a' } as any, groupId: 'g', workStatus: 'normal' as any, supervisorDoctorId: null });
const docs = [doc('H', 'المُضيف'), doc('A', 'أحمد'), doc('B', 'بدر'), doc('C', 'جمال')];
const nm = (id: string) => docs.find((d) => d.id === id)?.name ?? id;

// ════════ ① مَن يغطّي؟ الأعدلُ (الأقلّ عملًا = الأكثر استحقاقًا للعمل) ════════
// المُضيف H استأذن عن فترة عيادته → مقعد عيادته مفتوحٌ ويغطّيه طبيبٌ من الفترة الأخرى.
// المرشّحان أحمد وبدر. أحمد عَمِل حديثًا (ختمٌ حديث)، بدر عَمِل قديمًا (الأكثر استحقاقًا).
function s1() {
  console.log('\n① مَن يغطّي مقعد المُضيف؟');
  const coverSeat: HeavySeat[] = [{ id: `cover|${W}#1#0|H`, stamp: `${W}#1#0`, kind: 'delegator', eligible: ['A', 'B'], current: 'H' }];
  const workRecency = new Map([['A', `${W}#1#0`], ['B', `${W}#0#0`]]); // أحمد أحدثُ عملًا، بدر أقدم
  const r = solveHeavyRecency(docs, workRecency, coverSeat);
  const cov = r.assignments[0]?.to;
  console.log(`   غطّى: ${cov} (أحمد عمِل حديثًا، بدر قديمًا)`);
  check('① يختار الأعدل (بدر، الأقلّ عملًا) لا برقم العيادة', cov === 'بدر', `${cov}`);
}

// ════════ ② أين يعدّل: قبل الحدث أم بعده؟ ════════
// استئذانٌ يوم الأربعاء (مستقبل)، النافذة من الأحد. نرى أين تقع التغطية.
function s2() {
  console.log('\n② أين يعدّل (قبل الحدث أم بعده)؟');
  // مقاعد عملٍ عبر الأسبوع (الأحد→الخميس)، المُضيف يشغل مقعد الأربعاء.
  const seats: HeavySeat[] = [0, 1, 2, 3, 4].map((di) => ({
    id: `w|${W}#${di}#0|x`, stamp: `${W}#${di}#0`, kind: 'delegator' as const,
    eligible: ['H', 'A', 'B', 'C'], current: di === 3 ? 'H' : ['A', 'B', 'C', 'A', 'B'][di]!,
  }));
  const prior = lastHeavyStamps([]); // بلا تاريخ
  // الحالة العاديّة: غياب المُضيف يوم الأربعاء فقط (absentByStamp) → تغطيةٌ عند الأربعاء.
  const r = rebalanceDays(docs, seats, prior, { absentByStamp: new Map([[`${W}#3#0`, ['H']]]) }, `${W}#0#0`);
  const days = r.daysTouched;
  console.log(`   أيّام التعديل: ${days} (الأربعاء=٣ هو يوم الاستئذان)`);
  check('② يغطّي عند يوم الحدث (الأربعاء)', days.includes(3), `${days}`);
  const beforeEvent = days.filter((d) => d < 3);
  console.log(`   لمسٌ قبل الحدث (أيّام < ٣): ${beforeEvent.length ? beforeEvent.join(',') : 'لا شيء — تغطيةٌ بسيطة عند الحدث'}`);
  check('② لا لمسَ قبل الحدث بلا إثقال (تغطيةٌ بسيطة)', beforeEvent.length === 0, `${beforeEvent}`);
}

// ════════ ②ب مع إثقالٍ مُجبَر: يمتصّ قبل الحدث ════════
// لو كان المُغطّي الوحيد المتاح سيُجبَر لاحقًا أيضًا، النظر-للأمام يُرتاحه مبكّرًا.
// (أُثبِت في test-lookahead؛ هنا تذكيرٌ أنّ المسار نفسه ينطبق على الاستئذان.)
function s2b() {
  console.log('\n②ب مع إثقال: يمتصّ قبل الحدث (مُثبَتٌ في النظر-للأمام).');
}

// ════════ ③ الإلغاء → يرجع المُضيف مكانه ════════
function s3() {
  console.log('\n③ إلغاء الاستئذان → يعود المُضيف؟');
  // بعد التغطية: مقعد المُضيف صار لبدر. عند الإلغاء، المُضيف عاد ومستحقٌّ مقعده (أقدم عملًا).
  const seat: HeavySeat[] = [{ id: `cover|${W}#1#0|H`, stamp: `${W}#1#0`, kind: 'delegator', eligible: ['H', 'A', 'B'], current: 'B' }];
  // المُضيف H لم يعمل (كان مستأذنًا) → الأقدم عملًا = الأحقّ باستعادة مقعده.
  const workRecency = new Map([['H', ''], ['A', `${W}#0#0`], ['B', `${W}#1#0`]]);
  const r = solveHeavyRecency(docs, workRecency, seat);
  const back = r.assignments[0]?.to ?? 'B';
  console.log(`   بعد الإلغاء صار المقعد لـ: ${back}`);
  check('③ المقعد يعود للمُضيف عند الإلغاء', back === 'المُضيف', `${back}`);
}

s1(); s2(); s2b(); s3();
console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
if (fails.length) fails.forEach((f) => console.log('  • ' + f));
process.exit(fail ? 1 : 0);
