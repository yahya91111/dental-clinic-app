// ═══════════════════════════════════════════════════════════════
// الحلّال بالظلّ — **يحسب ما سيفعله، ولا يكتب شيئاً**.
//
// المرحلة ٢ من إعادة هندسة قلب العدل. وظيفته: ينظر إلى حالةٍ مختلّة (ميزانٌ
// منحرف) ويقترح **أقلّ مبادلاتٍ** تُعيد العدل — ثمّ يُصدر **إيصالاً** يُدقَّق:
//  • قائمة المبادلات المقترحة (ماذا سيغيّر بالضبط).
//  • الميزان قبل/بعد (هل تحسّن فعلاً؟).
//  • تحقّق الحفظ: مجموع التغيّرات = صفر (لا خلقَ ولا فقدَ نقطة — مبادلةٌ لا ضخّ).
//
// «بالظلّ» = لا يمسّ الجدول ولا العجلة. يُقرأ، يُقترَح، يُسجَّل — والتطبيق لاحقاً
// (المرحلة ٤) بعد التحقّق أنّه يطابق العجلة أو يتفوّق عليها.
//
// نطاق هذه المرحلة: ميزان الفترات (ف١−ف٢) داخل شفت — أوضح محور عدلٍ وأقربه
// مقارنةً بقاعدة العجلة (assignPeriods: الأقلّ ميزاناً يأخذ ف١). الأدوار الثقيلة
// (انفراد/دليقيتر) تُركَّب فوق هذا الإطار لاحقاً بنفس نمط الإيصال.
// ═══════════════════════════════════════════════════════════════
import type { LoadedDoctor, LoadedSlot } from './schedule';

const DAY_IDX: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
const isFirstPeriod = (p: number) => p === 1 || p === 3; // ف١ من الشفت (صباح١/مساء١)

/** مبادلة فترةٍ داخل عيادةٍ واحدة في شفتٍ مستهدف: مَن في ف١ ومَن في ف٢ يتبادلان. */
export type PeriodSwap = {
  kind: 'period';
  day: string;
  clinicNumber: number;
  f1Doctor: { id: string; name: string }; // الحاليّ في ف١ (سيصير ف٢)
  f2Doctor: { id: string; name: string }; // الحاليّ في ف٢ (سيصير ف١)
};

export type SolverReceipt = {
  swaps: PeriodSwap[];
  beforeAbsImbalance: number;   // مجموع |ميزان| قبل (أصغر = أعدل)
  afterAbsImbalance: number;    // مجموع |ميزان| بعد
  improvement: number;          // before − after (موجبٌ = تحسّن)
  deltas: { id: string; name: string; before: number; after: number }[]; // مَن تغيّر ميزانه
  ledgerBalanced: boolean;      // مجموع كلّ التغيّرات = صفر (حفظ النقاط)
  notes: string[];
};

type Pair = { clinicNumber: number; f1: LoadedSlot; f2: LoadedSlot };

/** يلتقط أزواج العيادة في الشفت المستهدف (عيادةٌ لها مقعد ف١ ومقعد ف٢ نشطان). */
function clinicPairs(shiftSlots: LoadedSlot[]): Pair[] {
  const byClinic = new Map<number, { f1?: LoadedSlot; f2?: LoadedSlot }>();
  for (const s of shiftSlots) {
    if (s.status !== 'active' || s.role !== 'clinic' || s.clinicNumber <= 0) continue;
    const e = byClinic.get(s.clinicNumber) ?? {};
    if (isFirstPeriod(s.period)) e.f1 = s; else e.f2 = s;
    byClinic.set(s.clinicNumber, e);
  }
  const pairs: Pair[] = [];
  for (const [c, e] of [...byClinic.entries()].sort((a, b) => a[0] - b[0])) {
    if (e.f1 && e.f2 && e.f1.doctorId !== e.f2.doctorId) pairs.push({ clinicNumber: c, f1: e.f1, f2: e.f2 });
  }
  return pairs;
}

/** ميزان الفترات الداخل (من سجلّ السياق، عدا الشفت المستهدف). */
function enteringBalance(doctors: LoadedDoctor[], contextSlots: LoadedSlot[]): Map<string, number> {
  const bal = new Map<string, number>();
  for (const d of doctors) bal.set(d.id, 0);
  for (const s of contextSlots) {
    if (s.status !== 'active' || s.role !== 'clinic' || s.clinicNumber <= 0) continue;
    bal.set(s.doctorId, (bal.get(s.doctorId) ?? 0) + (isFirstPeriod(s.period) ? 1 : -1));
  }
  return bal;
}

/**
 * يحلّ ميزان الفترات لشفتٍ مستهدف **بالظلّ**: يقرّر لكلّ زوج عيادةٍ مَن الأحقّ بـ ف١
 * (الأقلّ ميزاناً داخلاً — نفس قاعدة العجلة assignPeriods)، يقترح المبادلة إن خالف
 * الحاليّ، ويُصدر إيصالاً مدقَّقاً. **لا يكتب شيئاً**.
 *
 * @param contextSlots كلّ سجلّ النافذة عدا الشفت المستهدف (الماضي الثابت + بقيّة الأسبوع).
 * @param shiftSlots   خانات الشفت المستهدف (قابلة لإعادة الترتيب).
 */
export function solveShiftPeriods(
  doctors: LoadedDoctor[], contextSlots: LoadedSlot[], shiftSlots: LoadedSlot[],
): SolverReceipt {
  const notes: string[] = [];
  const nameOf = new Map(doctors.map((d) => [d.id, d.name] as const));
  const pairs = clinicPairs(shiftSlots);

  // الميزان الجاري يبدأ من السياق ويتطوّر زوجاً بزوج (كما العجلة تماماً).
  const running = enteringBalance(doctors, contextSlots);
  // الميزان النهائيّ «قبل» = السياق + التوزيع الحاليّ للشفت (للمقارنة).
  const before = new Map(running);
  for (const p of pairs) {
    before.set(p.f1.doctorId, (before.get(p.f1.doctorId) ?? 0) + 1);
    before.set(p.f2.doctorId, (before.get(p.f2.doctorId) ?? 0) - 1);
  }

  // قرار الحلّال: لكلّ زوج، الأقلّ ميزاناً جارياً يأخذ ف١. ثبّت التعادل بالاسم (حتميّ).
  const swaps: PeriodSwap[] = [];
  const after = new Map(running);
  for (const p of pairs) {
    const aId = p.f1.doctorId, bId = p.f2.doctorId;
    const ba = running.get(aId) ?? 0, bb = running.get(bId) ?? 0;
    // نبدّل فقط إذا قلّ **إجماليّ |الخلل|** فعلاً (تحسّنٌ صارم عالميّ، لا قاعدة
    // محليّة فقط): مساهمة الوضع الحاليّ |ba+1|+|bb−1| مقابل المبدَّل |ba−1|+|bb+1|.
    // فلا مبادلةٌ لاطئة (نفس |الخلل|) ولا حين يكون الميزانان بنفس الإشارة بعيدَين.
    const curCost = Math.abs(ba + 1) + Math.abs(bb - 1);
    const swapCost = Math.abs(ba - 1) + Math.abs(bb + 1);
    const shouldSwap = swapCost < curCost;
    const f1Id = shouldSwap ? bId : aId;
    const f2Id = shouldSwap ? aId : bId;
    if (shouldSwap) {
      swaps.push({
        kind: 'period', day: p.f1.dayOfWeek, clinicNumber: p.clinicNumber,
        f1Doctor: { id: aId, name: nameOf.get(aId) ?? '' },
        f2Doctor: { id: bId, name: nameOf.get(bId) ?? '' },
      });
    }
    after.set(f1Id, (after.get(f1Id) ?? 0) + 1);
    after.set(f2Id, (after.get(f2Id) ?? 0) - 1);
    running.set(f1Id, (running.get(f1Id) ?? 0) + 1);
    running.set(f2Id, (running.get(f2Id) ?? 0) - 1);
  }

  const sumAbs = (m: Map<string, number>) => [...m.values()].reduce((a, v) => a + Math.abs(v), 0);
  const beforeAbs = sumAbs(before);
  const afterAbs = sumAbs(after);

  // إيصال التغيّرات + تحقّق الحفظ (مجموع كلّ فروق الميزان = صفر: مبادلةٌ لا ضخّ).
  const deltas: SolverReceipt['deltas'] = [];
  let net = 0;
  for (const d of doctors) {
    const bf = before.get(d.id) ?? 0, af = after.get(d.id) ?? 0;
    net += af - bf;
    if (bf !== af) deltas.push({ id: d.id, name: d.name, before: bf, after: af });
  }
  if (swaps.length === 0) notes.push('الشفت متوازنٌ أصلاً — لا حاجة لأيّ مبادلة.');
  else notes.push(`${swaps.length} مبادلة مقترحة، |الخلل| ${beforeAbs}→${afterAbs}.`);

  return {
    swaps,
    beforeAbsImbalance: beforeAbs,
    afterAbsImbalance: afterAbs,
    improvement: beforeAbs - afterAbs,
    deltas,
    ledgerBalanced: net === 0,
    notes,
  };
}

// ═══════════════════════════════════════════════════════════════
// محور الأدوار الثقيلة (انفراد/دليقيتر) — تسويةٌ بالحداثة **عبر الأيّام**.
//
// هذا قلب «الامتصاص قبل الحدث»: المقاعد الثقيلة في النافذة (ما لم يقع بعدُ) تُعاد
// قسمتُها بالحداثة — الأكثر استحقاقاً (الأقدم ظهوراً) يأخذ أوّل مقعدٍ **مؤهَّلٍ**،
// ولو كان يوماً **قبل** الحدث، ما دام مستقبلاً. فيتسوّى العدل فوراً لا تدريجاً.
//
// قاعدة الحداثة (لا المجاميع): العائد من إجازةٍ طويلة ختمُه أقدم → يأخذ **دوراً
// واحداً** تعويضاً ثمّ يرجع آخر الطابور (لا تكدّس). يطابق منطق order في العجلة.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// نواة النظر-للأمام — «الامتصاص قبل الحدث» (القلب الحقيقيّ)
// ═══════════════════════════════════════════════════════════════
// الحلّال الأماميّ الجشِع يوزّع كلّ مقعدٍ دون رؤية قيود المستقبل، فيُثقِل مَن سيُجبَر
// على مقعدٍ لاحق (أهليّةٌ ضيّقة). النظر-للأمام يعالج المقاعد **الأكثر تقييدًا أوّلًا**
// (الأقلّ مؤهَّلين = المُجبَرة)، فيُحجَز المُجبَر على مقعده المستقبليّ، ثمّ تُوزَّع
// المقاعد الوفيرة المبكّرة على غيره — فيُرتاح المُجبَر في يومٍ **قبل** الحدث.
//
// مفتاح الاختيار: ① أقلّ حِملًا (توازن، يمنع الإثقال) ② الأقدم حداثةً (يخدم الأحقّ)
// ③ ترتيب الطاقم (حتميّ). المفتاح نفسه يحقّق «دورةٌ واحدة للعائد ثمّ يدور» (الحِمل
// يمنع تكديسه) و«الامتصاص قبل الحدث» (الترتيب بالتقييد يُحرّر الأيّام المبكّرة).

export type LookaheadReceipt = {
  assignments: { seatId: string; from: string; to: string }[]; // التغييرات فقط
  fullAssignment: { seatId: string; doctorId: string }[];       // القسمة الكاملة (للتدقيق)
  maxLoadBefore: number;        // أقصى عددِ مقاعدٍ لطبيبٍ واحد — في التوزيع الحاليّ
  maxLoadAfter: number;         // وبعد النظر-للأمام (يجب ألّا يزيد؛ غالبًا يقلّ)
  loadAfter: { id: string; name: string; load: number }[];      // حِمل كلّ طبيبٍ بعدُ
  eligibilityRespected: boolean;
  conserved: boolean;           // كلّ مقعدٍ أُسنِد لمؤهَّلٍ واحد
  daysTouched: number[];
  notes: string[];
};

/**
 * حلّال النظر-للأمام: يوزّع مقاعد نافذةٍ كاملةٍ مع وعيٍ بقيود المستقبل، فيوازن الحِمل
 * ويمتصّ الظلم **عبر كلّ الأيّام التي لم تقع** — بما فيها ما قبل يوم الحدث. **لا يكتب**.
 * @param seats مقاعد النافذة، أهليّةُ كلٍّ تعكس مَن يصلح له (شاملةً قيود ذلك الشفت).
 * @param priorLast الحداثة الداخلة من التاريخ الحقيقيّ قبل النافذة.
 */
export function solveLookahead(
  doctors: LoadedDoctor[], seats: HeavySeat[], priorLast: Map<string, string>,
): LookaheadReceipt {
  const nameOf = new Map(doctors.map((d) => [d.id, d.name] as const));
  const rosterIdx = new Map(doctors.map((d, i) => [d.id, i] as const));
  const tie = (id: string) => rosterIdx.get(id) ?? 0;
  const last = new Map<string, string>();
  for (const d of doctors) last.set(d.id, priorLast.get(d.id) ?? '');
  const load = new Map<string, number>(doctors.map((d) => [d.id, 0]));
  const takenInStamp = new Map<string, Set<string>>();
  const seatById = new Map(seats.map((s) => [s.id, s] as const));
  const holderOf = new Map<string, string>();     // seatId → الطبيب المُسنَد
  const isAdd = (st: string, id: string) => { const t = takenInStamp.get(st) ?? new Set<string>(); t.add(id); takenInStamp.set(st, t); };
  let eligibilityRespected = true; let conserved = true;

  // **بأقلّ لمس** (لا إعادة بناء): نبني على القسمة الحاليّة. مرحلتان:
  // (أ) نُبقي كلّ شاغلٍ مؤهَّلٍ مكانه، ونجمع المقاعد «المفتوحة» (شاغلها لم يعد مؤهَّلًا
  //     = غائب/قيد). (ب) نغطّي المفتوحة بالأقلّ حِملًا. (ج) نُريح الإثقال الحقيقيّ فقط
  //     (فجوة ٢+) بنقلٍ موضعيّ — فيُمتصّ المُجبَر مبكّرًا دون مساسٍ بالمتوازن.
  const open: HeavySeat[] = [];
  for (const s of seats) {
    const elig = s.eligible.includes(s.current) && !(takenInStamp.get(s.stamp)?.has(s.current));
    if (elig) { holderOf.set(s.id, s.current); load.set(s.current, (load.get(s.current) ?? 0) + 1); isAdd(s.stamp, s.current); if (s.stamp > (last.get(s.current) ?? '')) last.set(s.current, s.stamp); }
    else open.push(s);
  }
  // (ب) تغطية المفتوحة: الأكثر تقييدًا أوّلًا، لكلٍّ الأقلّ حِملًا ثمّ الأقدم ثمّ الطاقم.
  for (const seat of [...open].sort((a, b) => a.eligible.length - b.eligible.length || a.stamp.localeCompare(b.stamp) || a.id.localeCompare(b.id))) {
    const cands = seat.eligible.filter((id) => !(takenInStamp.get(seat.stamp)?.has(id)));
    if (cands.length === 0) { conserved = false; holderOf.set(seat.id, seat.current); continue; }
    const pick = [...cands].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0) || (last.get(a) ?? '').localeCompare(last.get(b) ?? '') || tie(a) - tie(b))[0]!;
    holderOf.set(seat.id, pick); load.set(pick, (load.get(pick) ?? 0) + 1); isAdd(seat.stamp, pick);
    if (seat.stamp > (last.get(pick) ?? '')) last.set(pick, seat.stamp);
  }
  // (ج) إراحة الإثقال الحقيقيّ فقط: انقل مقعدًا من مُثقَلٍ إلى مؤهَّلٍ أقلّ حِملًا بفجوة
  //     ≥ ٢ (تحسّنٌ صارمٌ لمجموع المربّعات → يتوقّف). نُفضّل المقعد الأبكر (امتصاصٌ قبل
  //     الحدث) والمُستلِم الأقدم حداثةً. المقاعد المُقيَّدة (مؤهَّلٌ واحد) لا تتحرّك.
  for (let guard = 0; guard < seats.length * seats.length + 4; guard++) {
    let best: { sid: string; from: string; to: string; gain: number } | null = null;
    for (const s of [...seats].sort((a, b) => a.stamp.localeCompare(b.stamp))) {
      const O = holderOf.get(s.id)!; const lo = load.get(O) ?? 0;
      const ys = s.eligible.filter((y) => y !== O && !(takenInStamp.get(s.stamp)?.has(y)) && (load.get(y) ?? 0) <= lo - 2);
      if (ys.length === 0) continue;
      const Y = [...ys].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0) || (last.get(a) ?? '').localeCompare(last.get(b) ?? '') || tie(a) - tie(b))[0]!;
      const gain = lo - (load.get(Y) ?? 0);
      if (!best || gain > best.gain) best = { sid: s.id, from: O, to: Y, gain };
    }
    if (!best) break;
    const s = seatById.get(best.sid)!;
    holderOf.set(s.id, best.to);
    load.set(best.from, (load.get(best.from) ?? 0) - 1);
    load.set(best.to, (load.get(best.to) ?? 0) + 1);
    takenInStamp.get(s.stamp)?.delete(best.from); isAdd(s.stamp, best.to);
  }
  for (const s of seats) if (!s.eligible.includes(holderOf.get(s.id)!)) eligibilityRespected = false;
  const chosenBy = holderOf;

  // الحِمل قبل (التوزيع الحاليّ) وبعد (قرار الحلّال).
  const loadBeforeMap = new Map<string, number>();
  for (const s of seats) loadBeforeMap.set(s.current, (loadBeforeMap.get(s.current) ?? 0) + 1);
  const maxLoadBefore = Math.max(0, ...loadBeforeMap.values());
  const maxLoadAfter = Math.max(0, ...load.values());

  const assignments: LookaheadReceipt['assignments'] = [];
  const days = new Set<number>();
  for (const s of seats) {
    const to = chosenBy.get(s.id)!;
    if (to !== s.current) {
      assignments.push({ seatId: s.id, from: nameOf.get(s.current) ?? s.current, to: nameOf.get(to) ?? to });
      const di = dayOfSeatId(s.id); if (di >= 0) days.add(di);
    }
  }
  const notes: string[] = [];
  if (assignments.length === 0) notes.push('متوازنٌ أصلًا — لا إعادة قسمة.');
  else notes.push(`${assignments.length} إعادة قسمة، أقصى حِملٍ ${maxLoadBefore}→${maxLoadAfter}.`);

  return {
    assignments,
    fullAssignment: seats.map((s) => ({ seatId: s.id, doctorId: chosenBy.get(s.id)! })),
    maxLoadBefore, maxLoadAfter,
    loadAfter: doctors.map((d) => ({ id: d.id, name: d.name, load: load.get(d.id) ?? 0 })).filter((x) => x.load > 0),
    eligibilityRespected, conserved,
    daysTouched: [...days].sort((x, y) => x - y),
    notes,
  };
}

/** مقعدٌ ثقيلٌ قابلٌ لإعادة القسمة في شفته (انفراد/دليقيتر = عبء، أو احتياط = راحة). */
export type HeavySeat = {
  id: string;            // معرّفٌ للإيصال (مثلاً «الثلاثاء-ص-ع٣»)
  stamp: string;         // ختم الشفت الزمنيّ (أسبوع#يوم#صباح|مساء) — للترتيب والحداثة
  kind: 'solo' | 'delegator' | 'reserve' | 'board';
  eligible: string[];    // المؤهَّلون المتاحون لهذا المقعد في شفته
  current: string;       // الشاغل الحاليّ (id)
};

export type HeavyReceipt = {
  assignments: { seatId: string; from: string; to: string }[]; // التغييرات فقط
  maxStaleBefore: number; // أقدم ختمٍ (رتبة) لطبيبٍ **مؤهَّلٍ** بقي بلا دور — قبل
  maxStaleAfter: number;  // وبعد (أصغر = أعدل: لم يُترَك الأكثر استحقاقاً)
  owedRespected: boolean; // لكلّ مقعد: الشاغل المختار ليس أحدثَ من مؤهَّلٍ تُرك
  notes: string[];
};

/**
 * يعيد قسمة مقاعد ثقيلة بالحداثة (الأقدم أوّلاً) **بالظلّ**. يبدأ من آخر ظهورٍ لكلّ
 * طبيب (priorLast)، يعالج المقاعد بترتيبها الزمنيّ، ويمنح كلّ مقعدٍ لأكثر مؤهَّليه
 * استحقاقاً (أقدم ختم) ثمّ يحدّث ختمه — فيدور دوراً واحداً ويعود آخر الطابور.
 * يُصدر إيصالاً مدقَّقاً. **لا يكتب شيئاً**.
 */
export function solveHeavyRecency(
  doctors: LoadedDoctor[], priorLast: Map<string, string>, seats: HeavySeat[],
): HeavyReceipt {
  const nameOf = new Map(doctors.map((d) => [d.id, d.name] as const));
  // كسر التعادل بترتيب الطاقم (rosterIdx)، لا الاسم — كي يطابق احتياطيّ order في
  // العجلة (الأقدم ختماً أوّلاً، ثمّ ترتيب الطاقم) فيتوافق الحلّال معها على بياناتٍ
  // حقيقيّةٍ بلا تاريخٍ ثقيلٍ سابق (تعادلٌ شامل → كلاهما يقع على ترتيب الطاقم).
  const rosterIdx = new Map(doctors.map((d, i) => [d.id, i] as const));
  const tie = (id: string) => rosterIdx.get(id) ?? 0;
  const last = new Map<string, string>();
  for (const d of doctors) last.set(d.id, priorLast.get(d.id) ?? '');
  // رتبة الأقدميّة (لقياس «أقدم مؤهَّلٍ تُرك»): الأقدم ختماً = رتبةٌ أصغر.
  const ordered = [...new Set([...doctors.map((d) => d.id)])]
    .sort((a, b) => (last.get(a) ?? '').localeCompare(last.get(b) ?? '') || tie(a) - tie(b));
  const rank = new Map(ordered.map((id, i) => [id, i] as const));

  // أكبر «بياتٍ» لمؤهَّلٍ بقي بلا دور خلال النافذة (للمقارنة قبل/بعد).
  const maxStaleOf = (assign: (seat: HeavySeat) => string): number => {
    let worst = 0;
    for (const seat of [...seats].sort((a, b) => a.stamp.localeCompare(b.stamp))) {
      const chosen = assign(seat);
      for (const e of seat.eligible) {
        if (e === chosen) continue;
        // مؤهَّلٌ أقدم من المختار تُرك؟ مقدار تجاوز الرتبة = شدّة الظلم.
        const gap = (rank.get(chosen) ?? 0) - (rank.get(e) ?? 0);
        if (gap > worst) worst = gap;
      }
    }
    return worst;
  };
  const staleBefore = maxStaleOf((seat) => seat.current);

  // قرار الحلّال: أقدم مؤهَّلٍ أوّلاً، ثمّ تحديث ختمه (دورةٌ واحدة ثمّ يدور).
  const assignments: HeavyReceipt['assignments'] = [];
  let owedRespected = true;
  const sorted = [...seats].sort((a, b) => a.stamp.localeCompare(b.stamp));
  const chosenBy = new Map<string, string>();
  // قيدٌ فيزيائيّ: الطبيب شخصٌ واحد — لا يأخذ أكثر من مقعدٍ ثقيلٍ في الشفت نفسه
  // (نفس الختم). فنستبعد مَن أخذ مقعداً هذا الشفت من بقيّة مقاعده.
  const takenInStamp = new Map<string, Set<string>>();
  for (const seat of sorted) {
    const taken = takenInStamp.get(seat.stamp) ?? new Set<string>();
    const cands = seat.eligible.filter((id) => !taken.has(id));
    const pick = [...cands].sort((a, b) =>
      (last.get(a) ?? '').localeCompare(last.get(b) ?? '') || tie(a) - tie(b),
    )[0];
    if (!pick) { owedRespected = false; continue; } // مقعدٌ بلا مؤهَّلٍ متاح (نادر)
    // **تحسّنٌ صارم فقط** (تفاعلٌ لا إعادةُ بناء): نُبقي الشاغل الحاليّ ما لم يوجد
    // مؤهَّلٌ **أحقَّ منه فعلاً** (ختمُه أقدم). فلا churn على أسبوعٍ عادلٍ أصلاً —
    // الحلّال يتحرّك فقط حين يكون هناك ظلمٌ يُصلَح (غيابٌ/عودة).
    const curLast = last.get(seat.current) ?? '';
    const pickLast = last.get(pick) ?? '';
    const chosen = (cands.includes(seat.current) && !(pickLast < curLast)) ? seat.current : pick;
    chosenBy.set(seat.id, chosen);
    taken.add(chosen); takenInStamp.set(seat.stamp, taken);
    // تدقيق: لا مؤهَّلٌ متاحٌ أقدم من المختار تُرك دون داعٍ (نسمح بإبقاء الشاغل عند التعادل).
    for (const e of cands) {
      if (e !== chosen && (last.get(e) ?? '') < (last.get(chosen) ?? '')) owedRespected = false;
    }
    if (chosen !== seat.current) {
      assignments.push({ seatId: seat.id, from: nameOf.get(seat.current) ?? seat.current, to: nameOf.get(chosen) ?? chosen });
    }
    if (seat.stamp > (last.get(chosen) ?? '')) last.set(chosen, seat.stamp);
  }
  const staleAfter = maxStaleOf((seat) => chosenBy.get(seat.id) ?? seat.current);

  const notes: string[] = [];
  if (assignments.length === 0) notes.push('قسمة الأدوار الثقيلة عادلةٌ أصلاً — لا إعادة قسمة.');
  else notes.push(`${assignments.length} إعادة قسمة، أقصى بياتٍ ${staleBefore}→${staleAfter}.`);

  return { assignments, maxStaleBefore: staleBefore, maxStaleAfter: staleAfter, owedRespected, notes };
}

// ─── استخراج المقاعد الثقيلة وأهليّتها من سجلٍّ **حقيقيّ** (لا مُصطنَع) ───
// يُحوّل خانات جدولٍ مبنيٍّ إلى HeavySeat[] جاهزة للحلّال: مقعد انفرادٍ لكلّ طبيبٍ
// ملأ فترتَي عيادةٍ واحدة في شفت، ومقعد دليقيترٍ لكلّ دور دليقيتر. الأهليّة =
// مَن كان **حاضراً عاملاً** ذلك الشفت (له عيادة/دليقيتر نشط) — مرشّحو المبادلة الواقعيّون.
const heavyStamp = (s: LoadedSlot): string => `${s.weekStart}#${DAY_IDX[s.dayOfWeek] ?? 0}#${s.period <= 2 ? 0 : 1}`;

/** يستخرج المقاعد الثقيلة لشفتٍ واحد من خاناته النشطة.
 *  poolIds (اختياريّ) = بِركة المؤهَّلين للأدوار الثقيلة كما تراها العجلة (تستثني
 *  البورد والظلال والتخفيف من عجلة الدليقيتر). إن مُرِّرت، تُقصَر الأهليّة عليها
 *  (مع ضمان بقاء الشاغل الحاليّ مؤهَّلاً لمقعده دائماً). */
export function extractHeavySeats(shiftSlots: LoadedSlot[], poolIds?: Set<string>): HeavySeat[] {
  const active = shiftSlots.filter((s) => s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator'));
  if (active.length === 0) return [];
  const stamp = heavyStamp(active[0]!);
  // الأهليّة = الحاضرون العاملون، مقصورةً على بِركة المؤهَّلين إن وُجدت.
  const working = [...new Set(active.map((s) => s.doctorId))];
  const base = poolIds ? working.filter((id) => poolIds.has(id)) : working;
  const eligibleFor = (current: string) => (base.includes(current) ? base : [...base, current]);
  const seats: HeavySeat[] = [];
  // انفراد: (طبيب|عيادة) بفترتين.
  const clinicCount = new Map<string, { id: string; clinic: number; n: number }>();
  for (const s of active) {
    if (s.role !== 'clinic' || s.clinicNumber <= 0) continue;
    const k = `${s.doctorId}|${s.clinicNumber}`;
    const e = clinicCount.get(k) ?? { id: s.doctorId, clinic: s.clinicNumber, n: 0 };
    e.n++; clinicCount.set(k, e);
  }
  for (const e of clinicCount.values()) {
    if (e.n === 2) seats.push({ id: `solo|${stamp}|c${e.clinic}`, stamp, kind: 'solo', eligible: eligibleFor(e.id), current: e.id });
  }
  // دليقيتر: مقعدٌ **لكلّ طبيبٍ** له دور دليقيتر في الشفت (لا لكلّ فترة) — فالمنفرد
  // بالدليقيتر (فترتان لطبيبٍ واحد) مقعدٌ واحد، كالمنفرد بالعيادة تمامًا. وإلّا خرق
  // قيدُ «مقعدٌ واحدٌ للطبيب في الشفت» نفسَه عند الأساس فأحدث لمسًا زائفًا.
  const delDocs = new Set<string>();
  for (const s of active) if (s.role === 'delegator') delDocs.add(s.doctorId);
  for (const id of delDocs) {
    seats.push({ id: `del|${stamp}|${id}`, stamp, kind: 'delegator', eligible: eligibleFor(id), current: id });
  }
  return seats;
}

// ─── الاحتياط (EX) — محورٌ مختلف: «راحة» تُوزَّع بالحداثة، والغياب يُحسب راحة ───
// ختم الاحتياط من عمود الشفت (1=صباح، 2=مساء) لأنّ فترته 0.
const reserveStamp = (s: LoadedSlot): string => `${s.weekStart}#${DAY_IDX[s.dayOfWeek] ?? 0}#${s.clinicNumber === 2 ? 1 : 0}`;

/** يستخرج مقاعد الاحتياط لشفتٍ واحد (status='extra', period=0). الأهليّة = الحاضرون
 *  في الشفت (عاملون أو محتاطون) ضمن البِركة — أيٌّ منهم يصلح للراحة. */
export function extractReserveSeats(shiftSlots: LoadedSlot[], poolIds?: Set<string>): HeavySeat[] {
  const ex = shiftSlots.filter((s) => s.status === 'extra' && s.period === 0);
  if (ex.length === 0) return [];
  const stamp = reserveStamp(ex[0]!);
  // الحاضرون في الشفت = عاملون (clinic/delegator نشط) + محتاطون.
  const present = shiftSlots.filter((s) => (s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator')) || (s.status === 'extra' && s.period === 0));
  const working = [...new Set(present.map((s) => s.doctorId))];
  const base = poolIds ? working.filter((id) => poolIds.has(id)) : working;
  const eligibleFor = (current: string) => (base.includes(current) ? base : [...base, current]);
  return ex.map((s) => ({ id: `ex|${stamp}|${s.clinicNumber}|${s.doctorId}`, stamp, kind: 'reserve' as const, eligible: eligibleFor(s.doctorId), current: s.doctorId }));
}

/** آخر «راحة» لكلّ طبيبٍ من التاريخ: احتياطٌ **أو غياب** (طبية/تفرّغ) — كلاهما راحة.
 *  هذا جوهر قاعدة الاحتياط: مَن ارتاح (احتياطًا أو غيابًا) يتأخّر دوره في الراحة. */
export function lastRestStamps(historySlots: LoadedSlot[]): Map<string, string> {
  const last = new Map<string, string>();
  const bump = (id: string, st: string) => { if (st > (last.get(id) ?? '')) last.set(id, st); };
  for (const s of historySlots) {
    if (s.status === 'extra' && s.period === 0) bump(s.doctorId, reserveStamp(s));                 // احتياط
    else if (s.status === 'sick_leave' || s.status === 'vacation') bump(s.doctorId, heavyStamp(s)); // غيابٌ = راحة
  }
  return last;
}

// ─── البورد — تناوبٌ على عيادةٍ مشتركة (اثنان داخلها، الباقي احتياط) ───
// القاعدة: الأقدمُ دخولًا للعيادة يدخلها التالي (الذي استراح خارجها أطولَ يعمل).
// يلزمه ٣+ أطبّاء بورد ليظهر التناوب (مع اثنين فقط لا تناوب — كلاهما داخلها دومًا).

/** يستخرج مقعدَي عيادة البورد المشتركة لشفت (خانتا العيادة النشطتان لأطبّاء البورد). */
export function extractBoardSeats(shiftSlots: LoadedSlot[], boardIds: Set<string>): HeavySeat[] {
  const inClinic = shiftSlots.filter((s) => s.status === 'active' && s.role === 'clinic' && boardIds.has(s.doctorId));
  if (inClinic.length === 0) return [];
  const stamp = heavyStamp(inClinic[0]!);
  // الحاضرون من البورد = داخل العيادة + احتياط البورد ذلك الشفت.
  const present = shiftSlots.filter((s) => boardIds.has(s.doctorId) && ((s.status === 'active' && s.role === 'clinic') || (s.status === 'extra' && s.period === 0)));
  const eligible = [...new Set(present.map((s) => s.doctorId))];
  return inClinic.map((s) => ({ id: `board|${stamp}|p${s.period}`, stamp, kind: 'board' as const, eligible, current: s.doctorId }));
}

/** آخر دخولٍ لعيادة البورد لكلّ طبيب بورد (active clinic) — للتناوب بالحداثة. */
export function lastBoardStamps(historySlots: LoadedSlot[], boardIds: Set<string>): Map<string, string> {
  const last = new Map<string, string>();
  for (const s of historySlots) {
    if (s.status === 'active' && s.role === 'clinic' && boardIds.has(s.doctorId)) {
      const st = heavyStamp(s); if (st > (last.get(s.doctorId) ?? '')) last.set(s.doctorId, st);
    }
  }
  return last;
}

// ─── الحلّال المُوجَّه بالحدث — «يلمس ما تأثّر، بقدر الحاجة» ───
// على حدثٍ في شفت (غياب/عودة)، يعيد قسمة **مقاعد ذلك الشفت فقط** بأقلّ لمسٍ يحقّق
// العدل: يبقي كلّ شاغلٍ حاليٍّ ما لم يُجبَر (غائب) أو يوجد أحقُّ منه أُتيح بالحدث.
// بلا حدث: لمسٌ صفر (الشاغلون الحاليّون هم الأحقّ عند الدخول للشفت بحداثة التاريخ).
// مع حدث: يلمس ٢ أو ٣ أو ٥… بقدر ما يتطلّبه إصلاح الظلم — لا أكثر.
export type Disturbance = {
  /** غائبون في **كلّ** النافذة (إجازة ممتدّة): يُسقَطون من كلّ المقاعد. */
  absentIds?: string[];
  /** غائبون في شفتاتٍ **محدّدة** (ختم→معرّفات): يُسقَطون من تلك الشفتات فقط — كي لا
   *  يُعامَل غائبُ يومٍ غائبًا في بقيّة الأيّام (دقّةٌ ضروريّة عبر الأيّام). */
  absentByStamp?: Map<string, string[]>;
  /** عائدون/مُتاحون الآن: يُضافون للأهليّة بحداثتهم القديمة (الأحقّ يأخذ دورًا). */
  extraEligible?: { id: string; lastStamp: string }[];
};

/**
 * يعيد قسمة مقاعد **شفتٍ واحد** ردًّا على حدثٍ فيه — بأقلّ لمسٍ يحقّق العدل. يبني
 * على القسمة الحاليّة كأساسٍ عادل (لا يعيد بناءها)، ويتحرّك فقط للمجبَر أو للأحقّ
 * الذي أتاحه الحدث. priorLast = الحداثة الداخلة للشفت من **التاريخ الحقيقيّ قبله**.
 * يُصدر إيصالًا مدقَّقًا. **لا يكتب شيئًا**.
 */
export function solveDisturbance(
  doctors: LoadedDoctor[], shiftSeats: HeavySeat[], priorLast: Map<string, string>, dist: Disturbance = {},
): HeavyReceipt {
  const absentAll = new Set(dist.absentIds ?? []);
  const prior = new Map(priorLast);
  for (const ex of dist.extraEligible ?? []) prior.set(ex.id, ex.lastStamp);
  const extraIds = (dist.extraEligible ?? []).map((e) => e.id);
  // أهليّةٌ معدّلةٌ بالحدث: نُسقِط الغائبين (الممتدّ من كلّ الشفتات، والمحدّد من شفته
  // فقط)، ونضيف المُتاحين الجدد. الإسقاط لكلّ مقعدٍ حسب ختمه.
  const seats = shiftSeats.map((s) => {
    const absentHere = new Set([...absentAll, ...(dist.absentByStamp?.get(s.stamp) ?? [])]);
    let elig = s.eligible.filter((id) => !absentHere.has(id));
    for (const id of extraIds) if (!elig.includes(id)) elig = [...elig, id];
    return { ...s, eligible: elig };
  });
  return solveHeavyRecency(doctors, prior, seats);
}

// ─── التوازن عبر الأيّام — «اللمس بقدر الحاجة، عبر شفتات عدّة أيّام» ───
// نفس المنطق المُوجَّه بالحدث، لكن على نافذةٍ تمتدّ أيّامًا: المقاعد مرتّبةٌ زمنيًّا
// (solveHeavyRecency يفرزها بالختم) فالحداثة تتدفّق عبر الأيّام، والقيد «مقعدٌ واحدٌ
// للطبيب في الشفت» يبقى لكلّ ختمٍ على حدة. يلمس يومًا أو يومين أو أكثر بقدر ما يلزم.
// fromStamp (اختياريّ) = نبدأ من شفت الحدث فصاعدًا (نافذة التأثّر) — فبلا حدثٍ صفر لمس.

/** يستخرج رتبة اليوم من ختم المقعد (`...|week#dayIdx#half|...`). */
const dayOfSeatId = (seatId: string): number => {
  const st = seatId.split('|')[1] ?? '';
  const di = Number(st.split('#')[1]);
  return Number.isNaN(di) ? -1 : di;
};

/**
 * يوازن نافذةً متعدّدة الأيّام ردًّا على حدث (غياب قد يمتدّ أيّامًا / عودة). يبني على
 * القسمة الحاليّة، يبدأ من شفت الحدث (fromStamp) فصاعدًا، ويلمس بأقلّ ما يحقّق العدل
 * عبر الأيّام. priorLast = الحداثة الداخلة لأوّل شفتٍ في النافذة من التاريخ الحقيقيّ.
 * يُصدر الإيصال + قائمة الأيّام الملموسة. **لا يكتب شيئًا**.
 */
export function rebalanceDays(
  doctors: LoadedDoctor[], windowSeats: HeavySeat[], priorLast: Map<string, string>,
  dist: Disturbance = {}, fromStamp = '',
): HeavyReceipt & { daysTouched: number[] } {
  const seats = fromStamp ? windowSeats.filter((s) => s.stamp >= fromStamp) : windowSeats;
  const rec = solveDisturbance(doctors, seats, priorLast, dist);
  const days = new Set<number>();
  for (const a of rec.assignments) { const di = dayOfSeatId(a.seatId); if (di >= 0) days.add(di); }
  return { ...rec, daysTouched: [...days].sort((x, y) => x - y) };
}

/** آخر ظهورٍ لكلّ طبيبٍ في دورٍ ثقيل (انفراد أو دليقيتر) من سجلٍّ تاريخيّ — priorLast. */
export function lastHeavyStamps(historySlots: LoadedSlot[]): Map<string, string> {
  const last = new Map<string, string>();
  const seatCount = new Map<string, number>();
  const bump = (id: string, st: string) => { if (st > (last.get(id) ?? '')) last.set(id, st); };
  for (const s of historySlots) {
    if (s.status !== 'active') continue;
    const st = heavyStamp(s);
    if (s.role === 'delegator') { bump(s.doctorId, st); continue; }
    if (s.role === 'clinic' && s.clinicNumber > 0) {
      const k = `${s.doctorId}|${st}|${s.clinicNumber}`;
      const n = (seatCount.get(k) ?? 0) + 1; seatCount.set(k, n);
      if (n === 2) bump(s.doctorId, st); // انفراد
    }
  }
  return last;
}

/** تقسيم سجلٍّ إلى (سياق، شفت مستهدف) بمفتاح أسبوع/يوم/شفت — أداةٌ للحلّال والاختبار. */
export function splitTargetShift(
  slots: LoadedSlot[], weekStart: string, day: string, shift: 'morning' | 'evening',
): { contextSlots: LoadedSlot[]; shiftSlots: LoadedSlot[] } {
  const inTarget = (s: LoadedSlot) =>
    s.weekStart === weekStart && DAY_IDX[s.dayOfWeek] === DAY_IDX[day]
    && (shift === 'morning' ? s.period <= 2 : s.period >= 3);
  const contextSlots: LoadedSlot[] = []; const shiftSlots: LoadedSlot[] = [];
  for (const s of slots) (inTarget(s) ? shiftSlots : contextSlots).push(s);
  return { contextSlots, shiftSlots };
}
