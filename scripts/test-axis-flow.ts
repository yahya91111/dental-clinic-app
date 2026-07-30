/* المحورُ: الحجزُ يُوزَّعُ على الزمنِ لا يُصرَفُ كلُّه عندَ آخرِه — اختبارٌ محضٌ (بلا قاعدةِ بيانات).
 *
 * كان خطُّ «الآنَ» يقفُ لاصقًا ببدايةِ الكرتِ الجاري طولَ العلاجِ ثمّ يثبُ عرضَ الكرتِ كلَّه
 * دفعةً واحدةً عندَ نهايتِه — لأنّ حجزَ العرضِ كان يُصرَفُ عندَ المرساةِ الأخيرةِ وحدَها،
 * فلا ينالُ ما بينَهما شيئًا. والقاعدةُ التي استقرّت: مَن وقعَ في وسطِ حجزٍ نالَ منه
 * بقدرِ ما مضى من وقتِه.
 *
 * تشغيل: npx tsx scripts/test-axis-flow.ts
 */
import { solveAxis } from '../screens/MainQueue/queueLanes';
import type { Claim } from '../screens/MainQueue/queueLanes';

let pass = 0, fail = 0;
const ok = (cond: boolean, label: string) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
};
const near = (a: number, b: number, tol = 0.51) => Math.abs(a - b) <= tol;

const STEP = 7, HOUR_NOM = 58;
const step = (pt: number, t: number) => Math.max(STEP, ((t - pt) / 60) * HOUR_NOM);
const X = (anchors: number[], claims: Claim[]) => solveAxis(anchors, claims, step);

console.log('\n— خطُّ الآنَ يقطعُ الكرتَ الجاريَ بقدرِ ما قُطِعَ من علاجِه —');
{
  // علاجٌ من ٦٠٠ إلى ٦٣٠ (نصفُ ساعة) وعرضُه ١٥٠، و«الآنَ» بعدَ ثلثِه
  const A = [600, 610, 630];
  const xm = X(A, [{ from: 600, to: 630, w: 150 }]);
  const x0 = xm.get(600) as number, xn = xm.get(610) as number;
  ok(near(xn - x0, 50), `بعدَ ثلثِ العلاجِ يقعُ عندَ ثلثِ الكرت (${Math.round(xn - x0)} من ١٥٠)`);
  ok((xm.get(630) as number) - x0 >= 150, 'والكرتُ يسعُ عرضَه كاملًا كما كان');
}
{
  // القفزةُ القديمة: بلا توزيعٍ لا ينالُ «الآنَ» إلّا الخطوةَ الافتراضيّةَ وحدَها
  const old = step(600, 610);
  const xm = X([600, 610, 630], [{ from: 600, to: 630, w: 150 }]);
  const now = (xm.get(610) as number) - (xm.get(600) as number);
  ok(now > old * 4, `ولولا التوزيعُ لَما تحرّكَ إلّا ${Math.round(old)} بكسلًا من ١٥٠ — ثمّ وثبَ الباقيَ دفعة`);
}
{
  // سيرٌ متّصلٌ: دقيقةً دقيقةً لا وثبةَ فيه
  const claims: Claim[] = [{ from: 600, to: 640, w: 160 }];
  let prev = -Infinity, maxJump = 0, monotone = true;
  for (let n = 600; n <= 640; n++) {
    const xm = X([600, n, 640].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b), claims);
    const d = (xm.get(n) as number) - (xm.get(600) as number);
    if (d < prev - 0.01) monotone = false;
    if (prev > -Infinity) maxJump = Math.max(maxJump, d - prev);
    prev = d;
  }
  ok(monotone, 'لا يرجعُ إلى الوراءِ في أيِّ دقيقة');
  ok(maxJump <= STEP + 0.01, `وأكبرُ ما يقطعُه في دقيقةٍ ${maxJump.toFixed(1)} بكسلًا — لا يتجاوزُ الخطوةَ الدنيا`);
}

console.log('\n— والساعةُ الواقعةُ داخلَ كرتٍ تقعُ في موضعِها منه —');
{
  const xm = X([580, 600, 640], [{ from: 580, to: 640, w: 240 }]);
  ok(near((xm.get(600) as number) - (xm.get(580) as number), 80), 'ثلثُ الكتلةِ زمنًا = ثلثُها مسافةً');
}

console.log('\n— ما كان يفعلُه الحجزُ ما زالَ يفعلُه —');
{
  const xm = X([0, 30, 60], [{ from: 0, to: 30, w: 120 }, { from: 30, to: 60, w: 90 }]);
  ok((xm.get(30) as number) >= 120, 'كلُّ حجزٍ يُوفَّى عندَ آخرِه');
  ok((xm.get(60) as number) - (xm.get(30) as number) >= 90, 'والحجزُ التالي يُوفَّى بعدَه');
}
{
  const xm = X([0, 60, 120], []);
  ok(near((xm.get(60) as number), 58) && near((xm.get(120) as number), 116), 'وما لا حجزَ له يأخذُ مسافتَه الافتراضيّة');
}
{
  const xm = X([0, 5, 10], [{ from: 0, to: 10, w: 4 }]);
  ok((xm.get(5) as number) === STEP && (xm.get(10) as number) === 2 * STEP, 'وحجزٌ أضيقُ من الخطوةِ لا يُضيِّقُها');
}
{
  const xm = X([0, 20, 40], [{ from: 0, to: 40, w: 200 }, { from: 0, to: 20, w: 140 }]);
  ok(near(xm.get(20) as number, 140), 'وعندَ تزاحمِ حجزَين يُؤخَذُ أوسعُهما');
  ok((xm.get(40) as number) >= 200, 'وكلاهما موفًّى');
}
{
  const xm = X([0, 30, 60], [{ from: 7, to: 55, w: 300 }]);   // طرفاه ليسا مرساتَين
  ok(near(xm.get(30) as number, 29) && near(xm.get(60) as number, 58), 'وحجزٌ طرفُه ليس مرساةً يُهمَل — لا يُفسِدُ المحور');
}
{
  ok(solveAxis([], [], step).size === 0, 'ومحورٌ بلا مراسٍ لا ينفجر');
}

console.log('\n— المحورُ يصعدُ دائمًا —');
{
  const A = [0, 12, 30, 31, 60, 61, 120];
  const xm = X(A, [{ from: 0, to: 30, w: 150 }, { from: 30, to: 61, w: 90 }, { from: 12, to: 120, w: 400 }]);
  let up = true;
  for (let i = 1; i < A.length; i++) if ((xm.get(A[i]) as number) < (xm.get(A[i - 1]) as number) + STEP - 0.001) up = false;
  ok(up, 'كلُّ مرساةٍ أبعدُ من سابقتِها بخطوةٍ على الأقلِّ مهما تداخلتِ الحجوز');
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} ناجح · ${fail} فاشل\n`);
process.exit(fail === 0 ? 0 : 1);
