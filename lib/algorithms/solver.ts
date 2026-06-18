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
    // مَن يأخذ ف١؟ الأقلّ ميزاناً. عند التساوي **لا نبدّل** — المبادلة لا تحسّن
    // الخلل (لاطئة)، فنتجنّب ضجيجاً بلا فائدة. نبدّل فقط حين يكون شاغل ف١ الحاليّ
    // أعلى ميزاناً فعلاً (تحسّنٌ صارم).
    const shouldSwap = ba > bb;
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
