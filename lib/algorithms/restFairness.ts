// ═══════════════════════════════════════════════════════════════
// محور «إجمالي الراحة» (احتياطيّ + غياب) — **قراءة/اقتراح فقط، بلا كتابة**.
//
// المراقب القديم (fairness.ts) أعمى عن الاحتياطيّ: يتخطّى كلّ خانة status ≠ active،
// وخانة الاحتياطيّ status = 'extra' فلا تُعدّ أبدًا. فلا شيء يكتشف أنّ متغيّبًا
// أخذ احتياطيًّا زائدًا فوق راحته.
//
// هذا المحور يُعطي المراقب عينًا جديدة:
//   • راحة كل طبيب = عدد أيّام الاحتياطيّ + عدد أيّام الغياب (طبيّة/تفرّغ).
//     (الاستئذان PS/PE جزئيّ لا يوم راحة كامل → لا يُحسب، كقاعدة العجلة.)
//   • ثمّ يقترح — بالظلّ — نقل الاحتياطيّ الزائد من صاحب الراحة الأعلى (غالبًا
//     متغيّب) إلى حاضرٍ راحته أقلّ، عبر **مبادلة احتياطيّ↔عيادة داخل نفس الشفت**:
//     تبديل شاغِلَي خانتَين موجودتَين (لا خلق ولا حذف) — يحفظ شكل الجدول تمامًا.
//   • قاعدة التوقّف: إن كان أعلى راحةٍ لا يزيد على أقلّها بأكثر من ١ (الباقي حتميّ
//     عند ٧÷٦ مثلاً) → لا مبادلة. لا نُطارِد صفرًا مستحيلاً ولا نُحدث ذبذبة.
//
// «بالظلّ» = يوازي فلسفة solver.ts: يقرأ، يقترح، يُصدر إيصالاً يُدقَّق (حفظ المجموع).
// التطبيق الحيّ لاحقًا بعد التحقّق.
// ═══════════════════════════════════════════════════════════════
import type { LoadedSlot, DoctorWorkStatus } from './schedule';

type DoctorLite = { id: string; name: string; workStatus?: DoctorWorkStatus };
type Shift = 'morning' | 'evening';

export type RestRow = {
  id: string; name: string;
  reserve: number;   // أيّام الاحتياطيّ (status='extra')
  absence: number;   // أيّام الغياب الكامل (sick_leave/vacation)
  rest: number;      // الإجمالي = reserve + absence
};

export type RestScorecard = {
  rows: RestRow[];   // مرتّبة: الأعلى راحةً أوّلاً
  maxRest: number;
  minRest: number;
  spread: number;    // max − min (0/1 = عادل ضمن الحتميّة)
};

export type RestSwap = {
  day: string; shift: Shift;
  clinicNumber: number; period: number;      // مقعد العيادة المنقول إلى H
  from: { id: string; name: string };        // H: كان احتياطيًّا (راحة أعلى) → صار يعمل
  to: { id: string; name: string };          // L: كان يعمل (راحة أقلّ) → صار احتياطيًّا
};

export type RestReceipt = {
  before: RestScorecard;
  after: RestScorecard;
  swaps: RestSwap[];
  restConserved: boolean;   // مجموع الراحة قبل == بعد (مبادلة لا ضخّ)
  reserveConserved: boolean; // مجموع خانات الاحتياطيّ ثابت
  notes: string[];
};

const isFullAbsence = (st: string): boolean => st === 'sick_leave' || st === 'vacation';

// الشفت من الخانة: الفترات 1،2 = صباح ؛ 3،4 = مساء. خانة الاحتياطيّ (period 0)
// تحمل clinicNumber = 1 (صباح) أو 2 (مساء) من الباني (exClinicSlot).
function slotShift(s: LoadedSlot): Shift {
  if (s.period > 0) return s.period <= 2 ? 'morning' : 'evening';
  return s.clinicNumber === 2 ? 'evening' : 'morning';
}

// البركة المؤهّلة للتناوب: مَن ظهر في احتياطيّ أو مقعد عيادةٍ فعليّ، عدا الظلال (trainee).
function inferPool(doctors: ReadonlyArray<DoctorLite>, slots: LoadedSlot[]): Set<string> {
  const ws = new Map(doctors.map((d) => [d.id, d.workStatus]));
  const ids = new Set<string>();
  for (const s of slots) {
    if (ws.get(s.doctorId) === 'trainee') continue; // ظلّ المدرّب لا يتناوب
    if (s.status === 'extra') ids.add(s.doctorId);
    else if (s.status === 'active' && s.role === 'clinic' && s.clinicNumber > 0) ids.add(s.doctorId);
  }
  return ids;
}

function nameOf(doctors: ReadonlyArray<DoctorLite>, slots: LoadedSlot[], id: string): string {
  const d = doctors.find((x) => x.id === id);
  if (d) return d.name;
  const s = slots.find((x) => x.doctorId === id);
  return s?.doctorName ?? id;
}

function scorecardFrom(rows: RestRow[]): RestScorecard {
  const sorted = [...rows].sort((a, b) => b.rest - a.rest || a.name.localeCompare(b.name));
  const rests = sorted.map((r) => r.rest);
  const maxRest = rests.length ? Math.max(...rests) : 0;
  const minRest = rests.length ? Math.min(...rests) : 0;
  return { rows: sorted, maxRest, minRest, spread: maxRest - minRest };
}

/** يحسب راحة كل طبيب في البركة (احتياطيّ + غياب). قراءة فقط.
 *  carryRest: رصيدُ راحةٍ تاريخيٌّ من أسابيعَ سابقة (احتياطيّ+غياب) — يجعل العدلَ يعمل
 *  **عبر الأسابيع** لا داخلَ الأسبوعِ فقط (مَن ارتاح أكثر سابقًا يبدأ براحةٍ أعلى). */
export function computeRest(
  doctors: ReadonlyArray<DoctorLite>, slots: LoadedSlot[],
  opts?: { poolIds?: Set<string>; carryRest?: Map<string, number> },
): RestScorecard {
  const poolIds = opts?.poolIds ?? inferPool(doctors, slots);
  const rows = new Map<string, RestRow>();
  for (const id of poolIds) rows.set(id, { id, name: nameOf(doctors, slots, id), reserve: 0, absence: 0, rest: 0 });

  const absDays = new Map<string, Set<string>>(); // طبيب → أيّام غياب فريدة
  for (const s of slots) {
    const row = rows.get(s.doctorId);
    if (!row) continue;
    if (s.status === 'extra') row.reserve++;
    else if (isFullAbsence(s.status)) {
      let d = absDays.get(s.doctorId);
      if (!d) { d = new Set(); absDays.set(s.doctorId, d); }
      d.add(s.dayOfWeek);
    }
  }
  for (const [id, days] of absDays) { const r = rows.get(id); if (r) r.absence = days.size; }
  const carry = opts?.carryRest;
  for (const r of rows.values()) r.rest = (carry?.get(r.id) ?? 0) + r.reserve + r.absence;
  return scorecardFrom([...rows.values()]);
}

// مقاعد العيادة القابلة للاستلام في (يوم+شفت): طبيبٌ له **خانةٌ نشطةٌ واحدةٌ فقط**
// في هذا الشفت وهي مقعد عيادة (role='clinic'). هذا يستثني تلقائيًّا:
//   • المنفرد (خانتان في نفس الشفت) — كيلا نحرّك دور انفراد.
//   • المضيف/الدليقيتر المنفرد (خانة عيادة + خانة دليقيتر / خانتَي دليقيتر).
//   • التخفيف (light_duty) والظلال (trainee).
// فيبقى فقط عضو زوجٍ عاديّ يعمل فترةً واحدة → مبادلته احتياطيًّا لا تمسّ محاور أخرى.
function movableSeats(
  slots: LoadedSlot[], day: string, shift: Shift,
  doctors: ReadonlyArray<DoctorLite>, poolIds: Set<string>,
): { slot: LoadedSlot; docId: string }[] {
  const ws = new Map(doctors.map((d) => [d.id, d.workStatus]));
  const active = slots.filter((s) => s.dayOfWeek === day && s.status === 'active' && slotShift(s) === shift);
  const cnt = new Map<string, number>();
  for (const s of active) cnt.set(s.doctorId, (cnt.get(s.doctorId) ?? 0) + 1);
  const out: { slot: LoadedSlot; docId: string }[] = [];
  for (const s of active) {
    if (!poolIds.has(s.doctorId)) continue;
    if ((cnt.get(s.doctorId) ?? 0) !== 1) continue;       // خانة واحدة فقط في الشفت
    if (s.role !== 'clinic' || s.clinicNumber <= 0) continue;
    const w = ws.get(s.doctorId);
    if (w === 'light_duty' || w === 'trainee') continue;
    out.push({ slot: s, docId: s.doctorId });
  }
  return out;
}

/**
 * يقترح — بالظلّ — نقل الاحتياطيّ الزائد من الأعلى راحةً إلى الأقلّ، عبر مبادلات
 * احتياطيّ↔عيادة داخل نفس الشفت. لا يمسّ الغياب ولا يخلق/يحذف خانة.
 * يعيد نسخةً معدّلة داخليًّا للحساب فقط؛ لا يمسّ مصفوفة المتّصل.
 */
export function proposeRestSwaps(
  doctors: ReadonlyArray<DoctorLite>, slots: LoadedSlot[],
  opts?: { poolIds?: Set<string>; groupOf?: Map<string, string>; carryRest?: Map<string, number> },
): RestReceipt {
  const work: LoadedSlot[] = slots.map((s) => ({ ...s })); // نسخة قابلة للتعديل
  const poolIds = opts?.poolIds ?? inferPool(doctors, work);
  const groupOf = opts?.groupOf; // عزلُ القروبات: L لا يُبادَل إلا من قروبِ H نفسِه
  const carryRest = opts?.carryRest; // رصيدُ راحةٍ تاريخيٌّ — للعدلِ عبر الأسابيع
  const before = computeRest(doctors, work, { poolIds, carryRest });
  const notes: string[] = [];
  const swaps: RestSwap[] = [];

  const rest = new Map(before.rows.map((r) => [r.id, r.rest]));
  const restOf = (id: string) => rest.get(id) ?? 0;

  const MAX_ITERS = 200;
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const reserveSlots = work.filter((s) => s.status === 'extra' && poolIds.has(s.doctorId));
    // H مرشّح: أصحاب أعلى راحةٍ ممّن لديهم خانةَ احتياطيٍّ قابلةً للنقل
    const Horder = [...new Set(reserveSlots.map((s) => s.doctorId))].sort((a, b) => restOf(b) - restOf(a));
    let moved = false;

    for (const Hid of Horder) {
      const Hrest = restOf(Hid);
      for (const rs of reserveSlots.filter((s) => s.doctorId === Hid)) {
        const day = rs.dayOfWeek, shift = slotShift(rs);
        // L: حاضرٌ في نفس الشفت، راحته ≤ Hrest−2 (تحسّنٌ بلا تجاوز)، والأقلّ راحةً أولاً
        const cand = movableSeats(work, day, shift, doctors, poolIds)
          .filter((x) => x.docId !== Hid && restOf(x.docId) <= Hrest - 2
            && (!groupOf || groupOf.get(x.docId) === groupOf.get(Hid)))
          .sort((a, b) => restOf(a.docId) - restOf(b.docId) || a.docId.localeCompare(b.docId))[0];
        if (!cand) continue;

        const Lid = cand.docId;
        const Hname = nameOf(doctors, work, Hid), Lname = nameOf(doctors, work, Lid);
        swaps.push({
          day, shift, clinicNumber: cand.slot.clinicNumber, period: cand.slot.period,
          from: { id: Hid, name: Hname }, to: { id: Lid, name: Lname },
        });
        // تبديل الشاغِلَين على خانتَين موجودتَين (حفظٌ تامّ للشكل)
        rs.doctorId = Lid; rs.doctorName = Lname;              // خانة الاحتياطيّ ← L
        cand.slot.doctorId = Hid; cand.slot.doctorName = Hname; // مقعد العيادة ← H
        rest.set(Hid, Hrest - 1);
        rest.set(Lid, restOf(Lid) + 1);
        moved = true;
        break;
      }
      if (moved) break;
    }
    if (!moved) break;
    if (iter === MAX_ITERS - 1) notes.push('بلغ الحدّ الأقصى للتكرارات — تحقّقْ يدويًّا');
  }

  const after = computeRest(doctors, work, { poolIds, carryRest });
  const sum = (sc: RestScorecard) => sc.rows.reduce((a, r) => a + r.rest, 0);
  const reserveSum = (sc: RestScorecard) => sc.rows.reduce((a, r) => a + r.reserve, 0);
  if (!swaps.length) notes.push('لا مبادلة: الميزان ضمن الحتميّة (الفارق ≤ ١) أو لا حاضرَ أقلّ راحةً.');
  return {
    before, after, swaps,
    restConserved: sum(before) === sum(after),
    reserveConserved: reserveSum(before) === reserveSum(after),
    notes,
  };
}
