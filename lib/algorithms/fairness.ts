// ═══════════════════════════════════════════════════════════════
// مقياس العدل (كشف النقاط) — **قراءةٌ فقط، بلا أيّ كتابة**.
//
// يُحوّل عدل العجلة الضمنيّ إلى **رقمٍ ظاهرٍ يُقرأ ويُدقَّق**:
//  • لكلّ طبيبٍ كم أخذ من كلّ دورٍ ثقيل (انفراد/دليقيتر) في نافذةٍ من الأسابيع.
//  • ميزان فتراته p1MinusP2 (ف١ − ف٢ للعيادة) — نفس حساب createWheels تمامًا.
//  • **الحداثة** (متى آخر ظهور لكلّ دور) — وهي **ما يقود العدل**، لا المجاميع،
//    فلا تكديس على العائد من إجازةٍ طويلة (يأخذ دورًا واحدًا ثمّ يرجع آخر الطابور).
//
// هذا أساسُ «المراقب» (يعرض العدل ويشرحه) ولاحقًا «الحلّال» (يقيس كلّ مبادلة).
// لا يمسّ العجلة ولا الجدول — يقرأ السجلّ فقط.
// ═══════════════════════════════════════════════════════════════
import type { LoadedDoctor, LoadedSlot } from './schedule';

const DAY_IDX: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
const isFirstPeriod = (p: number) => p === 1 || p === 3;
// ختمٌ زمنيٌّ بدقّة الشفت (أسبوع#يوم#صباح|مساء) — للحداثة، كما في createWheels (shiftStamp).
const shiftStamp = (s: LoadedSlot): string => `${s.weekStart}#${DAY_IDX[s.dayOfWeek] ?? 0}#${s.period <= 2 ? 0 : 1}`;

export type DoctorScore = {
  id: string; name: string;
  solo: number;          // مرّات الانفراد (ملأ فترتَي عيادةٍ واحدة في شفت)
  delegator: number;     // مرّات الدليقيتر
  clinicSeats: number;   // مقاعد العيادة (إجماليّ، الفترتان)
  p1MinusP2: number;     // ميزان الفترات (ف١ − ف٢) — مقعد العيادة فقط
  lastSolo: string;      // آخر ظهورٍ منفردًا ('' = لم يظهر = الأقدم استحقاقًا)
  lastDelegator: string;
};

export type Scorecard = {
  rows: DoctorScore[];
  owedSolo: string[];       // ids مرتّبة بالاستحقاق: الأقدم ظهورًا (الأكثر استحقاقًا) أوّلًا
  owedDelegator: string[];
};

/** يحسب كشف النقاط من سجلّ الخانات (نافذةٌ من الأسابيع تُمرّر كاملةً). قراءةٌ فقط. */
export function computeScorecard(
  doctors: LoadedDoctor[], slots: LoadedSlot[], shadowIds: Set<string> = new Set(),
): Scorecard {
  const real = shadowIds.size ? slots.filter((s) => !shadowIds.has(s.doctorId)) : slots;
  const byId = new Map<string, DoctorScore>();
  for (const d of doctors) {
    byId.set(d.id, { id: d.id, name: d.name, solo: 0, delegator: 0, clinicSeats: 0, p1MinusP2: 0, lastSolo: '', lastDelegator: '' });
  }
  const seatCount = new Map<string, number>(); // (طبيب|شفت|عيادة) → عدد فتراته (٢ = منفرد)
  for (const s of real) {
    if (s.status !== 'active') continue;
    const row = byId.get(s.doctorId);
    if (!row) continue;
    const sk = shiftStamp(s);
    if (s.role === 'delegator') {
      row.delegator++;
      if (sk > row.lastDelegator) row.lastDelegator = sk;
    } else if (s.role === 'clinic' && s.period > 0) {
      row.clinicSeats++;
      if (isFirstPeriod(s.period)) row.p1MinusP2++; else row.p1MinusP2--;
      const ck = `${s.doctorId}|${sk}|${s.clinicNumber}`;
      const n = (seatCount.get(ck) ?? 0) + 1;
      seatCount.set(ck, n);
      if (n === 2) { row.solo++; if (sk > row.lastSolo) row.lastSolo = sk; }
    }
  }
  const rows = doctors.map((d) => byId.get(d.id)!);
  // الاستحقاق بالحداثة: الأقدم ظهورًا أوّلًا ('' = لم يظهر قطّ = الأقدم). كسر التعادل بالاسم (حتميّ).
  const owedBy = (key: 'lastSolo' | 'lastDelegator') => [...rows]
    .sort((a, b) => a[key].localeCompare(b[key]) || a.name.localeCompare(b.name))
    .map((r) => r.id);
  return { rows, owedSolo: owedBy('lastSolo'), owedDelegator: owedBy('lastDelegator') };
}

export type ImbalanceSummary = {
  soloGap: number;          // فرق العدّ (وصفيٌّ للرؤية، لا «دَيْن» — الدَّيْن بالحداثة)
  delegatorGap: number;
  maxAbsP1MinusP2: number;
  mostOwedSolo: string;     // الأكثر استحقاقًا للانفراد (بالحداثة)
  mostAheadSolo: string;
};

/** ملخّصٌ مقروء: الفجوات (وصفيّة) + الأكثر استحقاقًا/تقدّمًا (بالحداثة). */
export function summarizeImbalance(sc: Scorecard): ImbalanceSummary {
  const gap = (xs: number[]) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
  const nameOf = (id: string) => sc.rows.find((r) => r.id === id)?.name ?? '';
  return {
    soloGap: gap(sc.rows.map((r) => r.solo)),
    delegatorGap: gap(sc.rows.map((r) => r.delegator)),
    maxAbsP1MinusP2: Math.max(0, ...sc.rows.map((r) => Math.abs(r.p1MinusP2))),
    mostOwedSolo: nameOf(sc.owedSolo[0] ?? ''),
    mostAheadSolo: nameOf(sc.owedSolo[sc.owedSolo.length - 1] ?? ''),
  };
}
