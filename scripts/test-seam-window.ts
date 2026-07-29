/* تبديلُ الشفتِ حاجزٌ لا يُخترَق — اختبارٌ محضٌ (بلا قاعدةِ بيانات).
 *
 * الكرتُ كان يُرسَمُ في موضعِ دقيقتِه على المحور، والتبديلُ عمودٌ رفيعٌ في موضعِه — فمَن
 * وقعتْ دقيقتُه **داخلَ** وقتِ التبديلِ رُسِمَ فوقَه. والقاعدةُ التي استقرّتْ:
 *   • دخلَ داخلَ التبديل → مكانُه **بعدَه**، ووقتُ دخولِه الحقيقيُّ يبقى فوقَ كرتِه.
 *   • تأخّرَ فانتهى داخلَه → يبقى **قبلَه** كاملًا، ووقتُ انتهائه كما سُجِّل.
 *
 * تشغيل: npx tsx scripts/test-seam-window.ts
 */
import { drawWindow } from '../screens/MainQueue/queueLanes';
import type { Blk } from '../screens/MainQueue/queueLanes';

let pass = 0, fail = 0;
const ok = (cond: boolean, label: string) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
};
const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

const P: any = { id: 'p', name: 'x', queue_number: 1 };
const B = (start: number, end: number, kind: any = 'done'): Blk => ({ start, end, kind, p: P } as Blk);
const SEAM = (start: number, end: number): Blk => ({ start, end, kind: 'break', fixed: true, p: P } as Blk);

// تبديلٌ من ١٣:١٥ إلى ١٤:٣٠ (٧٩٥ → ٨٧٠)
const seams = [SEAM(795, 870)];

console.log('\n— دخلَ داخلَ وقتِ التبديل → مكانُه بعدَه —');
{
  const w = drawWindow(B(868, 895), seams);        // ١٤:٢٨ → ١٤:٥٥
  ok(w.ds === 870, `يُرسَمُ من ${hm(w.ds)} لا من 14:28`);
  ok(w.moved === true, 'ويُوسَمُ مُزاحًا فيُعرَضُ وقتُه الحقيقيُّ فوقَه');
  ok(w.de === 895, 'ونهايتُه كما هي');
}
{
  const w = drawWindow(B(800, 830), seams);        // دخلَ وخرجَ داخلَ التبديلِ كلِّه
  ok(w.ds === 870 && w.de === 870, 'ومَن وقعَ كلُّه داخلَه يُدفَعُ خلفَه كلُّه');
  ok(w.moved === true, 'وهو مُزاحٌ أيضًا');
}

console.log('\n— تأخّرَ فانتهى داخلَ التبديل → يبقى قبلَه —');
{
  const w = drawWindow(B(780, 820), seams);        // ١٣:٠٠ → ١٣:٤٠
  ok(w.ds === 780, 'يبدأُ من ساعتِه 13:00');
  ok(w.de === 795, `وينتهي رسمُه عندَ حاجزِ ${hm(w.de)} فلا يعبرُه`);
  ok(w.moved === false, 'ولم يُزَحْ — ساعتُه هي موضعُه');
}
{
  const w = drawWindow(B(700, 900), seams);        // بدأَ قبلَه وامتدَّ بعدَه
  ok(w.ds === 700 && w.de === 795, 'والعابرُ من طرفٍ إلى طرفٍ يُقَصُّ رسمُه عندَ الحاجزِ لا يعبرُه');
}

console.log('\n— ما لا يمسُّه الحاجز —');
{
  ok(JSON.stringify(drawWindow(B(600, 700), seams)) === JSON.stringify({ ds: 600, de: 700, moved: false }), 'ما قبلَ التبديلِ كلُّه كما هو');
  ok(JSON.stringify(drawWindow(B(900, 960), seams)) === JSON.stringify({ ds: 900, de: 960, moved: false }), 'وما بعدَه كما هو');
  const s = drawWindow(seams[0], seams);
  ok(s.ds === 795 && s.de === 870 && !s.moved, 'والتبديلُ نفسُه لا يُزيحُ نفسَه');
}

console.log('\n— تبديلانِ في يوم —');
{
  const two = [SEAM(795, 870), SEAM(1215, 1440)];
  ok(drawWindow(B(1220, 1260), two).ds === 1440, 'الدخولُ في الثاني يُدفَعُ خلفَه هو');
  ok(drawWindow(B(1200, 1250), two).de === 1215, 'والانتهاءُ داخلَه يبقى قبلَه');
  ok(drawWindow(B(880, 1000), two).de === 1000, 'وما بينهما لا يمسُّه شيء');
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} ناجح · ${fail} فاشل\n`);
process.exit(fail === 0 ? 0 : 1);
