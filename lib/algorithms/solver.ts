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

/** مقعدٌ ثقيلٌ قابلٌ لإعادة القسمة في شفته (انفراد أو دليقيتر). */
export type HeavySeat = {
  id: string;            // معرّفٌ للإيصال (مثلاً «الثلاثاء-ص-ع٣»)
  stamp: string;         // ختم الشفت الزمنيّ (أسبوع#يوم#صباح|مساء) — للترتيب والحداثة
  kind: 'solo' | 'delegator';
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
    chosenBy.set(seat.id, pick);
    taken.add(pick); takenInStamp.set(seat.stamp, taken);
    // تدقيق: لا مؤهَّلٌ متاحٌ أقدم من المختار تُرك (الاختيار argmin → دائماً صحيح).
    for (const e of cands) {
      if (e !== pick && (last.get(e) ?? '') < (last.get(pick) ?? '')) owedRespected = false;
    }
    if (pick !== seat.current) {
      assignments.push({ seatId: seat.id, from: nameOf.get(seat.current) ?? seat.current, to: nameOf.get(pick) ?? pick });
    }
    if (seat.stamp > (last.get(pick) ?? '')) last.set(pick, seat.stamp);
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

/** يستخرج المقاعد الثقيلة لشفتٍ واحد من خاناته النشطة. */
export function extractHeavySeats(shiftSlots: LoadedSlot[]): HeavySeat[] {
  const active = shiftSlots.filter((s) => s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator'));
  if (active.length === 0) return [];
  const stamp = heavyStamp(active[0]!);
  // الحاضرون العاملون = الأهليّة (مرشّحو المبادلة لأيّ مقعدٍ ثقيلٍ في الشفت).
  const eligible = [...new Set(active.map((s) => s.doctorId))];
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
    if (e.n === 2) seats.push({ id: `solo|${stamp}|c${e.clinic}`, stamp, kind: 'solo', eligible, current: e.id });
  }
  // دليقيتر: مقعدٌ لكلّ دور دليقيتر (نميّزه بالفترة كي لا يندمج مقعدان).
  for (const s of active) {
    if (s.role !== 'delegator') continue;
    seats.push({ id: `del|${stamp}|p${s.period}|${s.doctorId}`, stamp, kind: 'delegator', eligible, current: s.doctorId });
  }
  return seats;
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
