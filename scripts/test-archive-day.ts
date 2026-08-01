/* يومُ الأرشيفِ تقويمٌ محلّيٌّ لا لحظةٌ عالميّة — اختبارٌ محضٌ (بلا قاعدةِ بيانات).
 *
 * البلاغ: يومَ ٢-٨ الساعةَ ١:٢٥ فجرًا بتوقيتِ الكويت، ظهرَ عملُ الخميسِ ٣٠-٧ تحتَ
 * عنوانِ الجمعةِ ٣١-٧. والسبب: الكتابةُ محلّيّةٌ (localDay في الأرشفة، و٢٣:٥٩ بتوقيتِ
 * بغدادَ في pg_cron، ولقطةُ المخطّط) والقراءةُ كانت تُحوِّلُ إلى UTC — وبيننا وبينه
 * ثلاثُ ساعات، فكلُّ تاريخٍ يحملُ ساعةً قبلَ الثالثةِ فجرًا ينزلقُ يومًا إلى الوراء.
 *
 * تشغيل: npx tsx scripts/test-archive-day.ts
 */
process.env.TZ = 'Asia/Kuwait';   // قبلَ أيِّ تاريخ: نُثبِّتُ توقيتَ المستخدمِ (UTC+3)

import { localDay } from '../screens/MainQueue/queueLanes';

let pass = 0, fail = 0;
const ok = (cond: boolean, label: string) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
};
const utcDay = (d: Date) => d.toISOString().split('T')[0];   // القراءةُ القديمة

const offset = -new Date(2026, 6, 31, 12, 0).getTimezoneOffset() / 60;
console.log(`\n(التوقيتُ المُثبَّتُ للاختبار: UTC+${offset})`);

console.log('\n— البلاغُ نفسُه، مُعادًا —');
{
  // المُنتَقي يحملُ ساعةَ فتحِ الصفحة: اختيرَ ٣١-٧ والساعةُ ١:٢٥ فجرًا
  const picked = new Date(2026, 6, 31, 1, 25);
  ok(utcDay(picked) === '2026-07-30', `القراءةُ القديمةُ كانت تطلبُ ${utcDay(picked)} — وهو الخميس`);
  ok(localDay(picked) === '2026-07-31', `والقراءةُ الآنَ تطلبُ ${localDay(picked)} — وهو ما كُتِبَ عليه العنوان`);
}

console.log('\n— لا أثرَ لساعةِ اليومِ في يومِ التقويم —');
{
  let stable = true, brokenHours: number[] = [];
  for (let h = 0; h < 24; h++) {
    const d = new Date(2026, 6, 31, h, 30);
    if (localDay(d) !== '2026-07-31') stable = false;
    if (utcDay(d) !== '2026-07-31') brokenHours.push(h);
  }
  ok(stable, 'التقويمُ المحلّيُّ ثابتٌ في الأربعِ والعشرين ساعةً كلِّها');
  ok(brokenHours.length === offset, `والقديمُ كان ينزلقُ في ${brokenHours.length} ساعاتٍ منها (${brokenHours.join(', ')})`);
}

console.log('\n— ما يُكتَبُ هو ما يُقرَأ —');
{
  // الكتابة: archive_date = localDay() لحظةَ الأرشفةِ (٢٣:٥٩ محلّيًّا)، ولقطةُ المخطّطِ مثلُها
  const written = localDay(new Date(2026, 6, 30, 23, 59));
  ok(written === '2026-07-30', 'الأرشفةُ عندَ ٢٣:٥٩ تكتبُ يومَها هو');
  // القراءة: أيُّ ساعةٍ من ذلك اليومِ في المُنتَقي تُصيبُه
  let allHit = true;
  for (let h = 0; h < 24; h++) if (localDay(new Date(2026, 6, 30, h, 7)) !== written) allHit = false;
  ok(allHit, 'وأيُّ ساعةٍ يحملُها المُنتَقي من ذلك اليومِ تُصيبُ ما كُتِب');
  ok(localDay(new Date(2026, 6, 31, 0, 5)) !== written, 'وأوّلُ دقيقةٍ من الغدِ لا تُصيبُه — فاليومُ يومان لا يوم');
}

console.log('\n— حدودُ الشهرِ والسنةِ لا تكسرُه —');
{
  ok(localDay(new Date(2026, 6, 31, 23, 59)) === '2026-07-31', 'آخرُ لحظةٍ في تمّوز');
  ok(localDay(new Date(2026, 7, 1, 0, 1)) === '2026-08-01', 'وأوّلُ لحظةٍ في آب');
  ok(localDay(new Date(2026, 11, 31, 22, 0)) === '2026-12-31', 'وآخرُ ليلةٍ في السنة');
  ok(localDay(new Date(2027, 0, 1, 1, 0)) === '2027-01-01', 'وأوّلُ فجرٍ في التي بعدَها');
  ok(localDay(new Date(2028, 1, 29, 1, 0)) === '2028-02-29', 'ويومُ الكبيسةِ يُكتَبُ كما هو');
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} ناجح · ${fail} فاشل\n`);
process.exit(fail === 0 ? 0 : 1);
