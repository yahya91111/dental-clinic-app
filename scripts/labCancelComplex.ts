// اختبارٌ معقّد للكنسل (الخيار أ: إعادة اشتقاق + فروق).
// سجلٌّ من ٦ أحداثٍ عبر أسبوعين (مفردة + مركّبة + استئذانات)، ثمّ نكنسل أحداثًا
// من البداية/الوسط/النهاية ونتحقّق: الثوابت تبقى سليمة، والفروق تُظهر المتأثّرين فقط.
//   npx tsx scripts/labCancelComplex.ts
import { buildBaseline, replayChecked, diffSchedules, delOf, exOf, idOf, nmOf, AR } from './lib-resolver';
import type { Cfg, St, Journal, JournalEntry } from './lib-resolver';
import type { WeekDay } from '../lib/algorithms/schedule';

const NAMES = ['محمد', 'أحمد', 'خالد', 'سعد', 'فهد', 'علي', 'عمر', 'زيد'];
const WEEKS = ['2026-09-03', '2026-09-10'];
const cfg: Cfg = { names: NAMES, lightIds: new Set(['d8']), boardIds: new Set(), M: 3, weeks: WEEKS };
const nm = nmOf(cfg);
const [W1, W2] = WEEKS as [string, string];

const cnt = (st: St) => { const d = delOf(cfg, st), e = exOf(cfg, st); return cfg.names.map((_, i) => { const id = idOf(i); return `${nm(id)}:د${d.get(id)}ح${e.get(id)}`; }).join('  '); };

// السجلّ الكامل — ٦ أحداث (id ثابت لكلّ حدثٍ للكنسل المنفرد)
const JOURNAL: Journal = [
  { id: 'E1', week: W1, day: 'sunday', events: [{ kind: 'abs', id: 'd3' }] },                               // خالد طبيّة الأحد
  { id: 'E2', week: W1, day: 'monday', events: [{ kind: 'perm', id: 'd6', blk: 2 }] },                       // علي استئذان ف2 الإثنين
  { id: 'E3', week: W1, day: 'wednesday', events: [{ kind: 'abs', id: 'd1' }, { kind: 'abs', id: 'd2' }] },  // محمد+أحمد طبيّة الأربعاء (مركّب)
  { id: 'E4', week: W1, day: 'thursday', events: [{ kind: 'perm', id: 'd4', blk: 1 }] },                     // سعد استئذان ف1 الخميس
  { id: 'E5', week: W2, day: 'tuesday', events: [{ kind: 'abs', id: 'd7' }] },                               // عمر طبيّة الثلاثاء w2
  { id: 'E6', week: W2, day: 'wednesday', events: [{ kind: 'perm', id: 'd5', blk: 2 }] },                    // فهد استئذان ف2 الأربعاء w2
];
const label = (e: JournalEntry) => `${e.id}: ${e.events.map((x) => x.kind === 'abs' ? `${nm(x.id)} طبيّة` : `${nm(x.id)} استئذان ف${x.blk}`).join(' + ')} (${AR[e.day]} ${e.week === W1 ? 'أ١' : 'أ٢'})`;

const baseline = buildBaseline(cfg);

console.log('══════════════════════════════════════════════════════════════════════');
console.log('  اختبارٌ معقّد — كنسلٌ من البداية/الوسط/النهاية مع تحقّقٍ من الثوابت');
console.log('══════════════════════════════════════════════════════════════════════');
console.log('\nالسجلّ الكامل:'); JOURNAL.forEach((e) => console.log('   • ' + label(e)));

const full = replayChecked(cfg, baseline, JOURNAL);
console.log(`\n① بعد تطبيق السجلّ كاملًا — مشاكلُ الثوابت: ${full.problems.length ? '🚨 ' + full.problems.join(' · ') : '✅ لا شيء'}`);
console.log(`   العدّادات: ${cnt(full.st)}`);

// نكنسل كلّ حدثٍ على حِدة (من نسخةٍ نظيفة من السجلّ الكامل) ونتحقّق
const toCancel = ['E1', 'E3', 'E6'];
let allOk = full.problems.length === 0;
for (const cid of toCancel) {
  const remaining = JOURNAL.filter((e) => e.id !== cid);
  const rebuilt = replayChecked(cfg, baseline, remaining);
  const diff = diffSchedules(cfg, full.st, rebuilt.st);
  const affected = [...new Set(diff.map((d) => d.doctor))];
  const okProblems = rebuilt.problems.length === 0;
  allOk = allOk && okProblems;
  const cancelled = JOURNAL.find((e) => e.id === cid)!;
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`② كنسل ${label(cancelled)}`);
  console.log(`   الثوابت بعد إعادة البناء: ${okProblems ? '✅ سليمة' : '🚨 ' + rebuilt.problems.join(' · ')}`);
  console.log(`   📊 أيّامٌ مسّها الفرق: ${[...new Set(diff.map((d) => `${AR[d.day]}${d.week === W1 ? '' : '٢'}`))].length} · 👥 أطبّاءُ تأثّروا: ${affected.length} (${affected.map(nm).join('، ')})`);
  // تفصيلُ تغيّرِ الملغى نفسه (يجب أن يعود)
  const subj = cancelled.events.map((x) => x.id);
  for (const s of subj) {
    const sd = diff.filter((d) => d.doctor === s);
    if (sd.length) console.log(`      ↩ ${nm(s)} (صاحب الحدث): ${sd.map((d) => `${AR[d.day]} ${d.before}→${d.after}`).join(' | ')}`);
  }
  // عيّنةٌ من تأثُّرِ الآخرين
  const others = diff.filter((d) => !subj.includes(d.doctor)).slice(0, 4);
  if (others.length) console.log(`      … وغيرهم: ${others.map((d) => `${nm(d.doctor)} ${AR[d.day]} ${d.before}→${d.after}`).join(' | ')}`);
}

console.log(`\n${'═'.repeat(70)}`);
console.log(allOk ? '✅ كلُّ عمليّات الكنسل أبقت الثوابت سليمة، والفروق تُحدِّد المتأثّرين بدقّة.' : '🚨 ثمّة كسرٌ في إحدى عمليّات الكنسل.');
