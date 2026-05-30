// ═══════════════════════════════════════════════════════════════
// نموذج أوّلي (prototype) — منطق «العجلة/الدور» بدل «الحمل»
//
// كل دور يُوزَّع بـ «عجلة» مستقلّة: مَن أخذه أقلّ يأخذه التالي → تدوير
// عادل، والتذبذب يذوب عبر تراكم الأسابيع (لا تصفير للعجلات).
//
// سلّم الأولويات (الأعلى يُحسَم أولاً ويكسر تعادل الأدنى):
//   ① الاحتياطي  ② المنفرد  ③ الدليقيتر  ④ تنوّع الفترات (ف1/ف2)
//
// نقاط السؤال (سياسات للّيدر — لها افتراضي وتُقلَب عند الطلب):
//   • DELEGATOR_ENABLED : هل المركز يستعمل الدليقيتر أصلاً؟ (افتراضي: نعم)
//   • SURPLUS_AS_RESERVE: الفائض الأول احتياطي بدل دليقيتر منفرد؟ (افتراضي: لا)
//
// تشغيل:  npx tsx scripts/proto-queue.ts
// ═══════════════════════════════════════════════════════════════

// ─── إعدادات السيناريو (من سطر الأوامر: عيادات أطباء تخفيف أسابيع) ───
// مثال:  npx tsx scripts/proto-queue.ts 3 5 0 2
const CLINICS = Number(process.argv[2] ?? 2);
const NUM_DOCTORS = Number(process.argv[3] ?? 4);
const NUM_LD = Number(process.argv[4] ?? 0); // عدد أطباء التخفيف (آخر K)
const WEEKS = Number(process.argv[5] ?? 2);
const DOCTORS = Array.from({ length: NUM_DOCTORS }, (_, i) => `د${i + 1}`);
const LIGHT_DUTY = DOCTORS.slice(NUM_DOCTORS - NUM_LD); // آخر K أطباء = تخفيف
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

// ─── نقاط السؤال (سياسات قابلة للقلب) ───
const DELEGATOR_ENABLED = true; // افتراضي: المركز يستعمل الدليقيتر
const SURPLUS_AS_RESERVE = false; // افتراضي: الفائض الأول دليقيتر منفرد

// ─── شكل التوزيع: كم دور من كل نوع في اليوم (D أطباء، M عيادات) ───
type Shape = {
  hostClinics: number; // عيادة مضيفة: طبيبان يوماً كاملاً (عيادة+دليقيتر)
  plainPairs: number; // عيادة زوج: طبيبان نصف يوم لكلٍّ فترة
  solos: number; // عيادة منفرد: طبيب يوماً كاملاً وحده
  soloDelegator: number; // دليقيتر منفرد (فترتان دليقيتر)
  ex: number; // احتياط (راحة)
  empty: number; // عيادات بلا طبيب (شح)
};

function computeShape(D: number, M: number, delegator = DELEGATOR_ENABLED): Shape {
  const z: Shape = { hostClinics: 0, plainPairs: 0, solos: 0, soloDelegator: 0, ex: 0, empty: 0 };
  if (D <= 0) return { ...z, empty: M };
  if (D < M) return { ...z, solos: D, empty: M - D };
  if (D === M) return { ...z, solos: M }; // طبيب لكل عيادة، يوم كامل وحده

  // ── الدليقيتر مُعطّل (أو مأخوذ مسبقاً): عيادات منفرد/زوج فقط، والفائض يرتاح ──
  if (!delegator) {
    if (D <= 2 * M) return { ...z, plainPairs: D - M, solos: 2 * M - D };
    return { ...z, plainPairs: M, ex: D - 2 * M };
  }

  // ── علم الدليقيتر مُفعّل ──
  if (D <= 2 * M) {
    const k = D - M; // عيادات مزدوجة
    return { ...z, hostClinics: 1, plainPairs: k - 1, solos: M - k };
  }
  if (D === 2 * M + 1) {
    // الفائض الأول: دليقيتر منفرد (افتراضي) أم احتياطي (عند الطلب)؟
    return SURPLUS_AS_RESERVE
      ? { ...z, plainPairs: M, ex: 1 }
      : { ...z, plainPairs: M, soloDelegator: 1 };
  }
  // فائض أكبر: أزواج + دليقيتر منفرد + الباقي احتياط
  return SURPLUS_AS_RESERVE
    ? { ...z, plainPairs: M, ex: D - 2 * M }
    : { ...z, plainPairs: M, soloDelegator: 1, ex: D - (2 * M + 1) };
}

// ─── حالة العجلات (تستمرّ عبر الأيام والأسابيع — لا تُصفَّر) ───
type Counter = Map<string, number>;
const inc = (m: Counter, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const get = (m: Counter, k: string) => m.get(k) ?? 0;

const exCount: Counter = new Map(); // ① عجلة الاحتياطي
const soloCount: Counter = new Map(); // ② عجلة الانفراد
const delCount: Counter = new Map(); // ③ عجلة الدليقيتر
const p1c: Counter = new Map(); // ④ تنوّع الفترة
const p2c: Counter = new Map();

const p1minusP2 = (id: string) => get(p1c, id) - get(p2c, id);
// يرتّب (a,b) فيعيد [ف1, ف2] ويحدّث العدّاد: الأكثر ف1 يُدفع لـ ف2
function assignPeriods(a: string, b: string): [string, string] {
  const [first, second] = p1minusP2(a) <= p1minusP2(b) ? [a, b] : [b, a];
  inc(p1c, first); inc(p2c, second);
  return [first, second];
}

// ─── محاكاة يوم واحد ───
type DayPlan = {
  hostPairs: [string, string][];
  soloDelegators: string[];
  solos: string[];
  plainPairs: [string, string][];
  ldClinics: [string, string][]; // [تخفيف(ف1), شريك(ف2)]
  ex: string[];
};

// تختار «الأقلّ أخذاً» لدور ما من بركة، وتكسر التعادل بترتيب الكيو (استقرار)
function pickByWheel(pool: string[], wheel: Counter, qi: (id: string) => number, count: number): string[] {
  return [...pool]
    .sort((a, b) => {
      const ca = get(wheel, a), cb = get(wheel, b);
      if (ca !== cb) return ca - cb;
      return qi(a) - qi(b);
    })
    .slice(0, count);
}

const QI = (id: string) => DOCTORS.indexOf(id); // ترتيب عامّ ثابت لكسر التعادل
const LD_SET = new Set(LIGHT_DUTY); // التخفيف: دائماً ف1، لا ينفرد، لا مضيف
const isLD = (id: string) => LD_SET.has(id);

// كم زاوَج كل (مخفّف|عاديّ) — لمنع تثبيت شريك مع المخفّف (يدور على الجميع)
const pairWith: Counter = new Map();
// يختار شريك المخفّف: الأقلّ مزاوجةً معه أولاً، ثم الأعلى استحقاقاً لـ ف2، ثم الاسم
function pickPartner(ld: string, candidates: string[]): string {
  return [...candidates].sort((a, b) => {
    const wa = get(pairWith, `${ld}|${a}`), wb = get(pairWith, `${ld}|${b}`);
    if (wa !== wb) return wa - wb;
    const d = p1minusP2(b) - p1minusP2(a);
    if (d !== 0) return d;
    return QI(a) - QI(b);
  })[0]!;
}

// يوزّع بركة العاديين على الشكل s عبر العجلات (احتياط←منفرد←دليقيتر←أزواج)،
// ثم يربط Lc شركاء للتخفيف من الباقي. يُرجع الأزواج العادية والباقي.
function fillRegulars(pool: string[], s: Shape, plan: DayPlan, lds: string[], Lc: number) {
  const remove = (taken: string[]) => { const set = new Set(taken); pool = pool.filter((d) => !set.has(d)); };

  // ① الاحتياط  ② المنفرد  ③ الدليقيتر
  const exChosen = pickByWheel(pool, exCount, QI, s.ex);
  for (const d of exChosen) { plan.ex.push(d); inc(exCount, d); }
  remove(exChosen);

  const soloChosen = pickByWheel(pool, soloCount, QI, s.solos);
  for (const d of soloChosen) { plan.solos.push(d); inc(soloCount, d); }
  remove(soloChosen);

  const delSeats = s.soloDelegator + s.hostClinics * 2;
  const delChosen = pickByWheel(pool, delCount, QI, delSeats);
  let di = 0;
  for (let c = 0; c < s.soloDelegator; c++) { const d = delChosen[di++]!; plan.soloDelegators.push(d); inc(delCount, d); }
  for (let c = 0; c < s.hostClinics; c++) {
    const a = delChosen[di++]!, b = delChosen[di++]!;
    plan.hostPairs.push([a, b]); inc(delCount, a); inc(delCount, b);
  }
  remove(delChosen);

  // ④ شركاء التخفيف (عيادة محجوزة): التخفيف ف1، وشريكه = الأعلى استحقاقاً لـ ف2
  //    (أكبر p1−p2) عبر العجلة الرابعة → يتدوّر الشريك ولا يعلق أحد في ف2.
  for (let i = 0; i < Lc; i++) {
    const ld = lds[i]!;
    const partner = pickPartner(ld, pool);
    pool = pool.filter((d) => d !== partner);
    inc(pairWith, `${ld}|${partner}`); inc(p1c, ld); inc(p2c, partner);
    plan.ldClinics.push([ld, partner]); // [تخفيف ف1, شريك ف2]
  }

  // ⑤ الأزواج. أولاً أزواج التخفيف: التخفيف ف1 دائماً، وشريكه = الأعلى استحقاقاً
  //    لـ ف2 (أكبر p1−p2) كي يتدوّر الشريك ولا يعلق أحد في ف2.
  let remainingPairs = s.plainPairs;
  for (const ld of pool.filter(isLD)) {
    if (remainingPairs <= 0) break;
    const others = pool.filter((d) => d !== ld && !isLD(d));
    const partner = pickPartner(ld, others);
    pool = pool.filter((d) => d !== ld && d !== partner);
    inc(pairWith, `${ld}|${partner}`); inc(p1c, ld); inc(p2c, partner);
    plan.plainPairs.push([ld, partner]);
    remainingPairs--;
  }
  // ثم الأزواج العادية + تنوّع الفترات
  let li = 0;
  for (let c = 0; c < remainingPairs; c++) {
    plan.plainPairs.push(assignPeriods(pool[li]!, pool[li + 1]!));
    li += 2;
  }
}

function planDay(regulars: string[], lds: string[], M: number): DayPlan {
  const plan: DayPlan = { hostPairs: [], soloDelegators: [], solos: [], plainPairs: [], ldClinics: [], ex: [] };
  const total = regulars.length + lds.length;
  const sAll = computeShape(total, M);

  // ── التخفيف لا ينفرد ولا يكون مضيفاً. فإن خلا الشكل منهما (العدد ≥ 2M+1:
  //    أزواج + دليقيتر منفرد + احتياط) فلا خطر على التخفيف → يدخل العجلات
  //    كعاديّ تماماً: يأخذ الدليقيتر المنفرد بـ دوره (لا كل يوم)، وإلا زوج/احتياط. ──
  if (sAll.solos === 0 && sAll.hostClinics === 0) {
    fillRegulars([...regulars, ...lds], sAll, plan, [], 0);
    return plan;
  }

  // ── يوجد منفرد/مضيف (العدد ≤ 2M): التخفيف يُفضّل الزوج (ف1 + شريك). ──
  //    أزواج التخفيف محدودة بالفائض (العيادات القابلة للمضاعفة). فإن كثُر
  //    التخفيف وقلّ الفائض (مثل 4/3 + تخفيفين) → الفائض من المخففين يَنفرد
  //    (مسموح عند تعدّد التخفيف، لفتح العيادات)، بدوره بينهم لا تثبيتاً.
  const R = regulars.length;
  const surplus = Math.max(0, total - M); // عيادات قابلة للمضاعفة
  const Lc = Math.min(lds.length, surplus); // عدد أزواج التخفيف
  const ldSoloN = lds.length - Lc; // فائض التخفيف → منفرد
  const ldSolo = pickByWheel(lds, soloCount, QI, ldSoloN); // أيّهم ينفرد (تدوير)
  const ldSoloSet = new Set(ldSolo);
  for (const ld of ldSolo) { plan.solos.push(ld); inc(soloCount, ld); }
  const ldPaired = lds.filter((d) => !ldSoloSet.has(d));
  const s = computeShape(R - Lc, Math.max(0, M - lds.length)); // العاديون الباقون
  fillRegulars([...regulars], s, plan, ldPaired, Lc);
  return plan;
}

// ─── عدّادات التقرير ───
const fullDays: Counter = new Map();
const halfDays: Counter = new Map();
const periods: Counter = new Map();

function tally(plan: DayPlan) {
  for (const [a, b] of plan.hostPairs) for (const d of [a, b]) { inc(fullDays, d); inc(periods, d, 2); }
  for (const d of plan.soloDelegators) { inc(fullDays, d); inc(periods, d, 2); }
  for (const d of plan.solos) { inc(fullDays, d); inc(periods, d, 2); }
  for (const [a, b] of plan.plainPairs) for (const d of [a, b]) { inc(halfDays, d); inc(periods, d, 1); }
  for (const [ld, partner] of plan.ldClinics) {
    // ف1/ف2 حُسبا وقت التعيين في fillRegulars؛ هنا فقط نصف اليوم والفترات
    inc(halfDays, ld); inc(periods, ld, 1);
    inc(halfDays, partner); inc(periods, partner, 1);
  }
}

// ─── العرض ───
function renderDay(dayName: string, plan: DayPlan) {
  const parts: string[] = [];
  let cn = 1;
  for (const [a, b] of plan.hostPairs) parts.push(`ع${cn++}[مضيف]: ${a}(عيادة+دليقيتر)  ${b}(عيادة+دليقيتر)`);
  for (const [a, b] of plan.plainPairs) parts.push(`ع${cn++}[زوج]: ${a}(ف1)  ${b}(ف2)`);
  for (const [ld, p] of plan.ldClinics) parts.push(`ع${cn++}[تخفيف]: ${ld}(ف1-تخفيف)  ${p}(ف2)`);
  for (const d of plan.solos) parts.push(`ع${cn++}[منفرد]: ${d}(يوم كامل)`);
  for (const d of plan.soloDelegators) parts.push(`دليقيتر منفرد: ${d}`);
  if (plan.ex.length) parts.push(`احتياط: ${plan.ex.join('، ')}`);
  console.log(`  ${dayName.padEnd(8)} ${parts.join('   |   ')}`);
}

// ─── التشغيل ───
function main() {
  const M = CLINICS;
  const lds = DOCTORS.filter((d) => LIGHT_DUTY.includes(d));
  const regulars = DOCTORS.filter((d) => !LIGHT_DUTY.includes(d));

  console.log(`السيناريو: ${M} عيادات، ${DOCTORS.length} أطباء (منهم ${lds.length} تخفيف: ${lds.join('، ') || 'لا'}).`);
  console.log(`نقاط السؤال: الدليقيتر=${DELEGATOR_ENABLED ? 'مُفعّل' : 'مُعطّل'}  الفائض-احتياطي=${SURPLUS_AS_RESERVE}\n`);

  for (let w = 0; w < WEEKS; w++) {
    console.log(`═══ الأسبوع ${w + 1} ═══`);
    for (const day of DAYS) {
      const plan = planDay(regulars, lds, M);
      renderDay(day, plan);
      tally(plan);
    }
    console.log('');
  }

  console.log('═══ التقرير (مجموع أسبوعين) ═══');
  console.log('الطبيب'.padEnd(10) + 'منفرد  دليقيتر  احتياط  أنصاف  فترات  ف1  ف2');
  for (const d of DOCTORS) {
    console.log(
      d.padEnd(11) +
        String(get(soloCount, d)).padEnd(7) +
        String(get(delCount, d)).padEnd(9) +
        String(get(exCount, d)).padEnd(8) +
        String(get(halfDays, d)).padEnd(7) +
        String(get(periods, d)).padEnd(7) +
        String(get(p1c, d)).padEnd(4) +
        String(get(p2c, d)),
    );
  }
}

main();
