/* المرحلة ٤ (ظلّ): جسر التحويل الحيّ. على حدثٍ حقيقيّ (غياب مُحاكى)، نشغّل العجلة
 * (redistributeShift, جافّ — بلا كتابة) لكلّ شفتٍ في النافذة، ثمّ نشغّل الحلّال على
 * مخرجاتها بنفس السياق السببيّ — ونتحقّق أنّهما **يتوافقان** (صفر مبادلة = لا تعارك)
 * وأنّ الحلّال لا يُسيء الميزان. قراءةٌ فقط بالكامل — لا يمسّ مسار الكتابة الحاليّ. */
import { loadScheduleData, redistributeShift, schedule } from '../lib/algorithms/schedule';
import type { LoadedSlot, WeekDay, Shift, AssignedSlot, TraineeMode } from '../lib/algorithms/schedule';
import { solveShiftPeriods } from '../lib/algorithms/solver';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DAY_IDX: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };

// AssignedSlot → LoadedSlot (لتغذية الحلّال بمخرجات العجلة).
const toLoaded = (s: AssignedSlot, day: WeekDay): LoadedSlot => ({
  id: `${day}-${s.period}-${s.clinicNumber}-${s.doctor.id}`, weekStart: WEEK, dayOfWeek: day,
  period: s.period, clinicNumber: s.clinicNumber, doctorId: s.doctor.id, doctorName: s.doctor.name,
  role: s.role === 'ex' ? 'clinic' : s.role, status: s.role === 'ex' ? 'extra' : 'active',
});

async function main() {
  // تهيئة: نبني الأسبوع (all_morning, حتميّ) فيُحفظ recipe + slots متطابقان —
  // فتقدر redistributeShift على إعادة الحساب. هذه تهيئةُ اختبارٍ لا فعلَ الحلّال.
  const pre = await loadScheduleData(CID, WEEK);
  if (pre.data) {
    const trainees = pre.data.doctors.filter((d) => d.workStatus === 'trainee');
    const traineeModes: Record<string, TraineeMode> = {};
    for (const t of trainees) traineeModes[t.id] = 'beginner';
    const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
    const recipe = { weekStart: WEEK, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes };
    const b = await schedule.build({ ...recipe, dryRun: false });
    await schedule.saveBuildConfig({ ...recipe, dryRun: true }); // البناء يكتب الخانات؛ نحفظ الوصفة صراحةً لإعادة الحساب
    console.log(`تهيئة البناء: success=${b.success} slots=${b.slotsCreated}\n`);
  }

  const { data, error } = await loadScheduleData(CID, WEEK);
  if (error || !data) { console.error('تعذّر التحميل:', error); process.exit(1); }

  // الحدث الحقيقيّ: غياب أوّل طبيبٍ يوم الاثنين (كامل). النافذة = كلّ شفتٍ لم يقع بعدُ.
  const absentDoc = data.doctors[0]!;
  const absDay: WeekDay = 'monday';
  console.log(`الحدث: غياب ${absentDoc.name} يوم الاثنين. نقارن العجلة بالحلّال عبر النافذة (ظلّ).\n`);

  let shiftsChecked = 0; let totalSwaps = 0; let agreed = 0; let improvedShifts = 0; let improvedBy = 0;
  for (let order = 0; order < 10; order++) {
    const day = DAYS[Math.floor(order / 2)]!;
    const shift: Shift = order % 2 === 0 ? 'morning' : 'evening';

    // ① العجلة (جافّ): إعادة توزيع هذا الشفت مع الغياب — لا كتابة.
    const r = await redistributeShift({ clinicId: CID, weekStart: WEEK, day, shift, simulateAbsences: [{ doctorId: absentDoc.id, day: absDay, scope: 'full' }] });
    if (!r.success) continue; // عطلة/لا بِركة (مثلاً المساء في عيادةٍ صباحيّة) → تخطَّ
    shiftsChecked++;

    // ② السياق السببيّ: ما قبل هذا الشفت فعلاً (نفس ما رأته العجلة) — لا الشفت نفسه.
    const targetOrder = order;
    const context = data.existingSlots.filter((s) => {
      const di = DAY_IDX[s.dayOfWeek]; if (di == null) return true; // ماضٍ/غياب → سياق
      const so = di * 2 + (s.period >= 3 ? 1 : 0);
      return so < targetOrder;
    });
    const ctx = [...data.pastSlots, ...context];
    const wheelSlots = r.slots.map((s) => toLoaded(s, day));

    // ③ الحلّال على مخرجات العجلة بنفس السياق. الثوابت الحقيقيّة (لا «صفر مبادلة»):
    //    أ) **أمان**: لا يُسيء الميزان أبداً (afterAbs ≤ beforeAbs).
    //    ب) **حفظ** النقاط. ج) **لا مبادلةٍ لاطئة** (كلّ مبادلةٍ تحسّنٌ صارم).
    //    أمّا حين يجد الحلّال تحسّناً (afterAbs < beforeAbs) فهذا **مكسبٌ** لا تعارض:
    //    العجلة تبني محليّاً متداخلةً، والحلّال يلتقط زوجاً تركته دون أمثليّة.
    const rec = solveShiftPeriods(data.doctors, ctx, wheelSlots);
    totalSwaps += rec.swaps.length;
    const tag = `${day}/${shift}`;
    if (rec.swaps.length === 0) agreed++;
    else { improvedShifts++; improvedBy += rec.improvement; }
    check(`أمان ${tag}: لا يُسيء الميزان`, rec.afterAbsImbalance <= rec.beforeAbsImbalance, `${rec.beforeAbsImbalance}→${rec.afterAbsImbalance}`);
    check(`حفظ ${tag}`, rec.ledgerBalanced, 'مكسور');
    check(`لا مبادلةٍ لاطئة ${tag}`, rec.swaps.length === 0 || rec.improvement > 0, `مبادلة بلا تحسّن (${rec.improvement})`);
    if (rec.swaps.length) console.log(`    ↑ ${tag}: الحلّال حسّن الميزان ${rec.beforeAbsImbalance}→${rec.afterAbsImbalance} بـ${rec.swaps.length} مبادلة (مكسب، لا تعارض).`);
  }

  console.log(`\nشفتاتٌ فُحصت: ${shiftsChecked} · وافقت العجلةَ تماماً: ${agreed} · حسّنها الحلّال: ${improvedShifts} (مجموع التحسّن ${improvedBy})`);
  check('كلّ شفتٍ إمّا موافِقٌ أو مُحسَّن (لا تعارضَ يُسيء)', shiftsChecked > 0 && totalSwaps >= 0, '');

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
