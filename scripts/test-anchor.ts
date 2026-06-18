/* وحدة: مرساة «الآن» (firstFutureShift) — أسبوع يبدأ الأحد 2099-01-04. */
import { firstFutureShift as f } from '../lib/algorithms/schedule';
const W = '2099-01-04'; // أحد
let pass = 0; let fail = 0;
const eq = (n: string, got: any, exp: any) => {
  const g = JSON.stringify(got); const e = JSON.stringify(exp);
  if (g === e) { pass++; console.log('  PASS ' + n); } else { fail++; console.log(`  FAIL ${n} — got ${g} exp ${e}`); }
};
eq('السبت (قبل الأسبوع) → الأسبوع كلّه (أحد ص)', f(W, '2099-01-03'), { day: 'sunday', shift: 'morning' });
eq('الأحد (اليوم) → الاثنين ص', f(W, '2099-01-04'), { day: 'monday', shift: 'morning' });
eq('الثلاثاء → الأربعاء ص', f(W, '2099-01-06'), { day: 'wednesday', shift: 'morning' });
eq('الأربعاء → الخميس ص', f(W, '2099-01-07'), { day: 'thursday', shift: 'morning' });
eq('الخميس → null (لا مستقبل بالأسبوع)', f(W, '2099-01-08'), null);
eq('بعد الأسبوع → null', f(W, '2099-01-20'), null);
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
