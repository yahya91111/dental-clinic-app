// اختبار معزول لمحور «إجمالي الراحة» — في الذاكرة فقط. لا DB، لا شبكة، لا إشعارات.
// شغّل: npx tsx scripts/rest-fairness-test.ts
import type { LoadedSlot } from '../lib/algorithms/schedule';
import { computeRest, proposeRestSwaps } from '../lib/algorithms/restFairness';

const WEEK = '2026-07-12';
const DOCS = {
  e: 'د. إسراء العلي',
  s: 'د. شيماء ماتقي',
  f: 'د. فاطمة أسد',
  x: 'د. زهراء العكري',
  y: 'د. إسراء درويش',
  z: 'د. نورا العويشير',
};
const doctors = Object.entries(DOCS).map(([id, name]) => ({ id, name, workStatus: 'active' as const }));

let sid = 0;
const S = (day: string, period: number, clinic: number, doc: string, status: LoadedSlot['status']): LoadedSlot => ({
  id: `s${sid++}`, weekStart: WEEK, dayOfWeek: day, period, clinicNumber: clinic,
  doctorId: doc, doctorName: DOCS[doc as keyof typeof DOCS], role: 'clinic', status,
});
// زوج عيادة صباحيّ (فترة1 + فترة2)
const pair = (day: string, clinic: number, p1doc: string, p2doc: string) => [
  S(day, 1, clinic, p1doc, 'active'), S(day, 2, clinic, p2doc, 'active'),
];
const reserve = (day: string, doc: string) => S(day, 0, 1, doc, 'extra'); // صباح clinicNumber=1
const absent = (day: string, doc: string, kind: 'vacation' | 'sick_leave') => S(day, 0, 0, doc, kind);

// ── التركيبة: عيادتان، شفت صباحيّ، ٥ أيّام، ٦ أطبّاء ──
// إسراء(e): احتياطيّ الأحد+الأربعاء + تفرّغ الخميس  → راحة ٣ (الشاذّة)
// شيماء(s): احتياطيّ الثلاثاء + طبيّة الخميس          → راحة ٢
// فاطمة(f): احتياطيّ الأحد+الأربعاء                   → راحة ٢
// x,y,z: احتياطيّ واحد لكلٍّ                          → راحة ١
function buildWeek(): LoadedSlot[] {
  return [
    // الأحد: احتياطيّ e,f | يعمل s,x,y,z
    reserve('sunday', 'e'), reserve('sunday', 'f'),
    ...pair('sunday', 1, 's', 'x'), ...pair('sunday', 2, 'y', 'z'),
    // الإثنين: احتياطيّ x,y | يعمل e,s,f,z
    reserve('monday', 'x'), reserve('monday', 'y'),
    ...pair('monday', 1, 'e', 's'), ...pair('monday', 2, 'f', 'z'),
    // الثلاثاء: احتياطيّ s,z | يعمل e,f,x,y
    reserve('tuesday', 's'), reserve('tuesday', 'z'),
    ...pair('tuesday', 1, 'e', 'f'), ...pair('tuesday', 2, 'x', 'y'),
    // الأربعاء: احتياطيّ e,f | يعمل s,x,y,z
    reserve('wednesday', 'e'), reserve('wednesday', 'f'),
    ...pair('wednesday', 1, 's', 'x'), ...pair('wednesday', 2, 'y', 'z'),
    // الخميس: e تفرّغ، s طبيّة | يعمل f,x,y,z (لا احتياطيّ)
    absent('thursday', 'e', 'vacation'), absent('thursday', 's', 'sick_leave'),
    ...pair('thursday', 1, 'f', 'x'), ...pair('thursday', 2, 'y', 'z'),
  ];
}

// ── أدوات فحص ──
let fails = 0;
function check(label: string, cond: boolean) {
  console.log(`  ${cond ? '✅' : '❌'} ${label}`);
  if (!cond) fails++;
}
function printCard(title: string, sc: ReturnType<typeof computeRest>) {
  console.log(`\n${title}  (max=${sc.maxRest} min=${sc.minRest} spread=${sc.spread})`);
  for (const r of sc.rows) console.log(`   راحة ${r.rest}  = احتياطيّ ${r.reserve} + غياب ${r.absence}   ${r.name}`);
}

// ═══ اختبار ١: حالة إسراء ═══
console.log('═══════════ اختبار ١: المتغيّبة أخذت احتياطيًّا زائدًا ═══════════');
{
  const slots = buildWeek();
  const before = computeRest(doctors, slots);
  printCard('قبل:', before);
  const e0 = before.rows.find((r) => r.id === 'e')!;
  check('إسراء هي الأعلى راحةً (٣)', e0.rest === 3 && before.maxRest === 3);
  check('إسراء متغيّبة (غياب ≥ ١)', e0.absence >= 1);
  check('إسراء أخذت احتياطيَّين', e0.reserve === 2);

  const rec = proposeRestSwaps(doctors, slots);
  console.log(`\nالمبادلات المقترَحة: ${rec.swaps.length}`);
  for (const sw of rec.swaps) console.log(`   ${sw.day}: ${sw.from.name} (كان احتياطيًّا) ⇄ ${sw.to.name} (كان يعمل) → ${sw.to.name} يصير احتياطيًّا`);
  printCard('بعد:', rec.after);

  const e1 = rec.after.rows.find((r) => r.id === 'e')!;
  const presentMax = Math.max(...rec.after.rows.filter((r) => r.absence === 0).map((r) => r.rest));
  check('نُقلت مبادلةٌ واحدةٌ على الأقلّ', rec.swaps.length >= 1);
  check('المبادلة أخذت من إسراء وأعطت حاضرًا', rec.swaps.every((s) => s.from.id === 'e') && rec.swaps.some((s) => ['x', 'y', 'z'].includes(s.to.id)));
  check('احتياطيّ إسراء نقص (٢ ← ١)', e1.reserve === 1);
  check('راحة إسراء لم تعُد شاذّةً (≤ أعلى حاضر)', e1.rest <= presentMax);
  check('حفظُ إجماليِّ الراحة (لا ضخّ)', rec.restConserved);
  check('حفظُ مجموعِ خانات الاحتياطيّ', rec.reserveConserved);
  const absBefore = before.rows.reduce((a, r) => a + r.absence, 0);
  const absAfter = rec.after.rows.reduce((a, r) => a + r.absence, 0);
  check('الغياب لم يُمَسّ', absBefore === absAfter);
  check('الفارق النهائيّ ≤ ١', rec.after.spread <= 1);
}

// ═══ اختبار ٢: الباقي الحتميّ (الجميع حاضر) — لا مبادلة ═══
console.log('\n═══════════ اختبار ٢: باقٍ حتميّ بلا متغيّب — يُترَك ═══════════');
{
  // ٦ أطبّاء كلّهم حاضرون، ٧ احتياطيّات (واحدٌ يأخذ ٢) — لا أحدَ متغيّب.
  const slots: LoadedSlot[] = [
    reserve('sunday', 'e'), reserve('sunday', 'f'), ...pair('sunday', 1, 's', 'x'), ...pair('sunday', 2, 'y', 'z'),
    reserve('monday', 'x'), reserve('monday', 'y'), ...pair('monday', 1, 'e', 's'), ...pair('monday', 2, 'f', 'z'),
    reserve('tuesday', 's'), reserve('tuesday', 'z'), ...pair('tuesday', 1, 'e', 'f'), ...pair('tuesday', 2, 'x', 'y'),
    reserve('wednesday', 'e'), ...pair('wednesday', 1, 's', 'x'), ...pair('wednesday', 2, 'f', 'y'), // z يعمل، e احتياطيّ ثانٍ
    S('wednesday', 1, 3, 'z', 'active'), S('wednesday', 2, 3, 'z', 'active'), // z منفرد (كي يتوازن العدد)
  ];
  const before = computeRest(doctors, slots);
  printCard('قبل:', before);
  const rec = proposeRestSwaps(doctors, slots);
  check('لا مبادلة (الفارق ≤ ١، لا متغيّب أقلّ راحة)', rec.swaps.length === 0);
  check('الفارق ≤ ١', before.spread <= 1);
}

// ═══ اختبار ٣: عزلُ القروبات — المبادلة لا تعبر قروبًا ولو كان الآخر أقلَّ راحة ═══
console.log('\n═══════════ اختبار ٣: عزلُ القروبات ═══════════');
{
  // قروب أ = {e,s,f} ، قروب ب = {x,y}. e (قروب أ) راحته ٣، وفي نفس شفتِ الأحد
  // يحضر مرشّحون: s,f (أ، راحة ١) و x,y (ب، راحة ٠). العزلُ يمنعُ إعطاء الـ+١ لقروب ب.
  const g = new Map<string, string>([['e', 'group_a'], ['s', 'group_a'], ['f', 'group_a'], ['x', 'group_b'], ['y', 'group_b']]);
  const pool = new Set(['e', 's', 'f', 'x', 'y']);
  const slots: LoadedSlot[] = [
    reserve('sunday', 'e'), ...pair('sunday', 1, 's', 'f'), ...pair('sunday', 2, 'x', 'y'),
    absent('monday', 'e', 'vacation'), reserve('monday', 's'),
    absent('tuesday', 'e', 'vacation'), reserve('tuesday', 'f'),
  ];
  const noGroup = proposeRestSwaps(doctors, slots, { poolIds: pool });
  const withGroup = proposeRestSwaps(doctors, slots, { poolIds: pool, groupOf: g });
  console.log(`   بلا عزل: ${noGroup.swaps.map((s) => `${s.from.name}→${s.to.name}`).join('، ') || '—'}`);
  console.log(`   مع العزل: ${withGroup.swaps.map((s) => `${s.from.name}→${s.to.name}`).join('، ') || '—'}`);
  check('بلا عزلٍ يعبرُ إلى قروب ب (x/y)', noGroup.swaps.length >= 1 && ['x', 'y'].includes(noGroup.swaps[0]!.to.id));
  check('مع العزلِ يبقى داخل قروب أ (s/f)', withGroup.swaps.length >= 1 && ['s', 'f'].includes(withGroup.swaps[0]!.to.id));
  check('مع العزلِ لا يمسّ قروب ب إطلاقًا', !withGroup.swaps.some((s) => ['x', 'y'].includes(s.to.id)));
}

// ═══ اختبار ٤: العدلُ عبرَ الأسابيع (رصيدٌ تاريخيّ carryRest) ═══
console.log('\n═══════════ اختبار ٤: العدلُ عبرَ الأسابيع ═══════════');
{
  // شيماء ارتاحت ٢ في أسبوعٍ سابق (رصيد)، والباقون ٠. هذا الأسبوعُ متساوٍ داخليًّا،
  // لكن عبرَ الأسبوعَين شيماءُ الأعلى راحةً → يجب نقلُ احتياطيِّها لحاضرٍ أقلَّ رصيدًا.
  const carry = new Map<string, number>([['s', 2]]);
  const pool = new Set(['s', 'x', 'z']);
  const slots: LoadedSlot[] = [reserve('sunday', 's'), ...pair('sunday', 1, 'x', 'z')];
  const noCarry = proposeRestSwaps(doctors, slots, { poolIds: pool });
  const withCarry = proposeRestSwaps(doctors, slots, { poolIds: pool, carryRest: carry });
  console.log(`   بلا تاريخ: ${noCarry.swaps.map((s) => `${s.from.name}→${s.to.name}`).join('، ') || '—'}`);
  console.log(`   مع التاريخ: ${withCarry.swaps.map((s) => `${s.from.name}→${s.to.name}`).join('، ') || '—'}`);
  check('بلا تاريخٍ: لا مبادلة (متساوٍ هذا الأسبوع)', noCarry.swaps.length === 0);
  check('مع التاريخِ: ينقل احتياطيّ المرتاحةِ سابقًا (شيماء) لحاضر', withCarry.swaps.length >= 1 && withCarry.swaps[0]!.from.id === 's' && ['x', 'z'].includes(withCarry.swaps[0]!.to.id));
}

console.log(`\n${fails === 0 ? '🎉 كلّ الفحوص نجحت' : `⚠️ ${fails} فحصٌ فشل`}`);
process.exit(fails === 0 ? 0 : 1);
