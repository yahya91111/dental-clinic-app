/* قواعدُ عمودِ التبديل — اختبارٌ محضٌ (بلا قاعدةِ بيانات).
 *
 * ① موضعُه من الورقة: حدٌّ في وسطِها له شفتانِ بيضاوانِ — من أينَ ابتدأَ وأينَ انتهى. أمّا
 *    الذي يبدأُ مع اليومِ أو ينتهي بانتهائه فليس حدًّا **فيها** بل حدٌّ **لها** — فله شفةٌ
 *    واحدةٌ من جهةِ الورقةِ وحدَها، إذ ما وراءَه ليس ورقةً حتّى يُعلَّمَ عليها حدّ.
 *
 * ② وحائطُ الراحلين: شارةُ «+N» تلتصقُ بالتبديلِ الذي يختمُ **شفتَهم هم** لا بأوّلِ تبديلٍ
 *    في اليوم — فمَن تركتَه في شفتِ المساءِ كانت شارتُه تُعرَضُ عندَ تبديلِ الظهرِ الذي مضى.
 *
 * تشغيل: npx tsx scripts/test-fold-side.ts
 */
import { foldSide, foldLips, shiftWall, DAY_START, DAY_END } from '../screens/MainQueue/queueLanes';

let pass = 0, fail = 0;
const ok = (cond: boolean, label: string) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
};
const H = (h: number, m = 0) => h * 60 + m;
const lips = (s: ReturnType<typeof foldSide>) => (foldLips(s).left ? 1 : 0) + (foldLips(s).right ? 1 : 0);

console.log('\n— الحكمُ بالوقتِ: أين يقعُ من اليوم؟ —');
{
  ok(foldSide({ start: H(0), end: H(7) }) === 'start', '٠٠:٠٠ ← ٧:٠٠ يفتحُ اليوم');
  ok(foldSide({ start: H(20), end: H(24) }) === 'end', '٢٠:٠٠ ← ٠٠:٠٠ يختمُ اليوم');
  ok(foldSide({ start: H(13, 15), end: H(14, 30) }) === 'mid', 'و١٣:١٥ ← ١٤:٣٠ حدٌّ في وسطِها');
  ok(foldSide({ start: DAY_START, end: DAY_END }) === 'start', 'ومَن ملأَ اليومَ كلَّه فهو فاتحتُه — لا شيءَ قبلَه');
}

console.log('\n— الشفةُ البيضاء: اثنتانِ في الوسطِ وواحدةٌ عندَ الطرف —');
{
  ok(lips('mid') === 2, 'حدُّ الوسطِ له شفتان');
  ok(lips('start') === 1 && foldLips('start').right, 'وخاتمُ الفاتحةِ شفتُه اليمنى وحدَها — إلى الورقة');
  ok(lips('end') === 1 && foldLips('end').left, 'وخاتمُ النهايةِ شفتُه اليسرى وحدَها — إلى الورقة');
  ok(!foldLips('start').left, 'ولا شفةَ إلى يسارِ الفاتحةِ — ليس هناك ورق');
  ok(!foldLips('end').right, 'ولا إلى يمينِ النهايةِ — كذلك');
}

console.log('\n— لا يُخطئُ الحدودَ بدقيقة —');
{
  ok(foldSide({ start: H(0, 1), end: H(7) }) === 'mid', 'دقيقةٌ بعدَ منتصفِ الليلِ لم تعُدْ فاتحة');
  ok(foldSide({ start: H(20), end: H(23, 59) }) === 'mid', 'ودقيقةٌ قبلَ منتصفِ الليلِ لم تعُدْ خاتمة');
  ok(foldSide({ start: H(23, 59), end: H(24) }) === 'end', 'وآخرُ دقيقةٍ في اليومِ تختمُه');
  ok(foldSide({ start: -5, end: H(6) }) === 'start', 'وما سبقَ اليومَ يُعدُّ فاتحتَه لا وسطًا');
  ok(foldSide({ start: H(21), end: H(30) }) === 'end', 'وما تجاوزَ منتصفَ الليلِ يُعدُّ خاتمتَه');
}

console.log('\n— ويومٌ بحدودٍ أخرى يُحاكَمُ بحدودِه هو —');
{
  ok(foldSide({ start: H(8), end: H(9) }, H(8), H(20)) === 'start', 'في يومٍ من ٨ إلى ٢٠، ما بدأَ بالثامنةِ فاتحتُه');
  ok(foldSide({ start: H(18), end: H(20) }, H(8), H(20)) === 'end', 'وما انتهى بالعشرينَ خاتمتُه');
  ok(foldSide({ start: H(12), end: H(13) }, H(8), H(20)) === 'mid', 'وما بينهما وسط');
}

console.log('\n— حائطُ الراحلين: أيُّ تبديلٍ يختمُ الشفتَ الجاري؟ —');
{
  // يومٌ بتبديلَين: ظهرًا ١٣:١٥ ← ١٤:٣٠، ومساءً ٢٠:١٥ ← منتصفِ الليل
  const NOON = { start: H(13, 15), end: H(14, 30) };
  const EVE = { start: H(20, 15), end: H(24) };
  const seams = [NOON, EVE];
  ok(shiftWall(seams, H(10)) === NOON, 'صباحًا: شفتُنا ينتهي بتبديلِ الظهر');
  ok(shiftWall(seams, H(13, 40)) === NOON, 'وداخلَ تبديلِ الظهرِ: حائطُنا هو هو — شفتُنا انقضى للتوّ');
  ok(shiftWall(seams, H(16)) === EVE, '**والبلاغُ**: مساءً بعدَ تبديلِ الظهرِ يكونُ الحائطُ تبديلَ المساء لا الظهر');
  ok(shiftWall(seams, H(20)) === EVE, 'وقبيلَ المساءِ بربعِ ساعةٍ كذلك');
  ok(shiftWall(seams, H(21)) === EVE, 'وداخلَ تبديلِ المساءِ كذلك');
  ok(shiftWall(seams, H(14, 30)) === EVE, 'وفي لحظةِ انتهاءِ تبديلِ الظهرِ ينتقلُ الحائطُ إلى التالي');
  ok(shiftWall(seams, H(14, 29)) === NOON, 'وقبلَها بدقيقةٍ لم ينتقلْ بعد');
}
{
  ok(shiftWall([], H(10)) === undefined, 'ويومٌ بلا تبديلٍ لا حائطَ فيه');
  const only = [{ start: H(13), end: H(14) }];
  ok(shiftWall(only, H(18)) === undefined, 'ومَن مضى تبديلُه الأخيرُ لا حائطَ خلفَه — الشارةُ تلحقُ آخرَ كرت');
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} ناجح · ${fail} فاشل\n`);
process.exit(fail === 0 ? 0 : 1);
