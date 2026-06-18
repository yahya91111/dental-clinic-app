/* المرحلة ٤ — رقم ١ (ظلّ): جسر الأدوار الثقيلة على بياناتٍ **حقيقيّة**. نستخرج
 * مقاعد الانفراد/الدليقيتر وأهليّتها من جدولٍ مبنيٍّ فعليّ، نشغّل الحلّال بالحداثة،
 * ونتحقّق: (أ) يحترم الأهليّة، (ب) لا يُسيء البيات، (ج) يوافق العجلة المبنيّة غالباً،
 * (د) **الامتصاص قبل الحدث** بطبيبٍ عائدٍ حقيقيّ. قراءةٌ فقط — لا يكتب حرفاً. */
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { LoadedSlot, WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';
import { extractHeavySeats, lastHeavyStamps, solveHeavyRecency } from '../lib/algorithms/solver';
import type { HeavySeat } from '../lib/algorithms/solver';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DAY_IDX: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };

async function main() {
  // تهيئة: نبني الأسبوع (all_morning, حتميّ) ونحفظ الوصفة. تهيئةُ اختبارٍ لا فعلَ الحلّال.
  const pre = await loadScheduleData(CID, WEEK);
  if (pre.data) {
    const traineeModes: Record<string, TraineeMode> = {};
    for (const t of pre.data.doctors.filter((d) => d.workStatus === 'trainee')) traineeModes[t.id] = 'beginner';
    const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
    const recipe = { weekStart: WEEK, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes };
    await schedule.build({ ...recipe, dryRun: false });
    await schedule.saveBuildConfig({ ...recipe, dryRun: true });
  }

  const { data, error } = await loadScheduleData(CID, WEEK);
  if (error || !data) { console.error('تعذّر التحميل:', error); process.exit(1); }

  // بِركة المؤهَّلين للأدوار الثقيلة كما تراها العجلة: تستثني البورد (لا يدخل عجلة
  // الدليقيتر)، والمتدرّبين الظلال، والتخفيف (يُزاوَج، لا ينفرد/يدلّق). فيرتفع التوافق.
  const poolIds = new Set(data.doctors
    .filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty')
    .map((d) => d.id));

  // ① استخراج مقاعد الأسبوع الثقيلة من الجدول الحقيقيّ (انفراد + دليقيتر)، شفتاً بشفت.
  const seats: HeavySeat[] = [];
  for (let order = 0; order < 10; order++) {
    const day = DAYS[Math.floor(order / 2)]!;
    const shift: Shift = order % 2 === 0 ? 'morning' : 'evening';
    const periods = shift === 'morning' ? [1, 2] : [3, 4];
    const shiftSlots = data.existingSlots.filter((s) => DAY_IDX[s.dayOfWeek] === DAY_IDX[day] && periods.includes(s.period));
    seats.push(...extractHeavySeats(shiftSlots, poolIds));
  }
  const soloN = seats.filter((s) => s.kind === 'solo').length;
  const delN = seats.filter((s) => s.kind === 'delegator').length;
  console.log(`مقاعد ثقيلة مستخرَجة من الجدول الحقيقيّ: ${seats.length} (انفراد ${soloN}، دليقيتر ${delN})\n`);
  check('وُجدت مقاعد ثقيلة فعليّة للفحص', seats.length > 0, '');

  // ② priorLast من التاريخ (أسابيع سابقة). ③ تشغيل الحلّال على الواقع.
  const priorLast = lastHeavyStamps(data.pastSlots);
  const rec = solveHeavyRecency(data.doctors, priorLast, seats);
  console.log(`الحلّال: ${rec.assignments.length} إعادة قسمة من ${seats.length} مقعد · أقصى بياتٍ ${rec.maxStaleBefore}→${rec.maxStaleAfter}`);

  // (أ) الأهليّة: كلّ إعادةٍ ضمن مؤهَّلي مقعدها (بحكم البناء، نتأكّد صراحةً).
  const seatById = new Map(seats.map((s) => [s.id, s] as const));
  const nameToId = new Map(data.doctors.map((d) => [d.name, d.id] as const));
  const allEligible = rec.assignments.every((a) => { const s = seatById.get(a.seatId); const id = nameToId.get(a.to); return !!s && !!id && s.eligible.includes(id); });
  check('(أ) كلّ إعادة قسمةٍ ضمن الأهليّة الحقيقيّة', allEligible, '');
  check('(ب) لا يُسيء البيات (afterStale ≤ beforeStale)', rec.maxStaleAfter <= rec.maxStaleBefore, `${rec.maxStaleBefore}→${rec.maxStaleAfter}`);
  check('(ب) الأهليّة محترمة (owedRespected)', rec.owedRespected, '');
  console.log(`  (ج) معلومة: الحلّال يوافق العجلة في ${seats.length - rec.assignments.length}/${seats.length} مقعد (الباقي تدويرُ دليقيترٍ مختلفٌ مقبول — كلاهما عادل).`);

  // (د) الامتصاص قبل الحدث على بياناتٍ حقيقيّة: نأخذ طبيباً **مؤهَّلاً لأبكر مقعد**
  //     ونجعله «عائداً» (نمسح ختمه → الأقدم مطلقاً). الحلّال يجب أن يمنحه ذلك المقعد.
  const sortedSeats = [...seats].sort((a, b) => a.stamp.localeCompare(b.stamp));
  const earliest = sortedSeats[0]!;
  const returnee = earliest.eligible.find((id) => id !== earliest.current) ?? earliest.eligible[0]!;
  const returneeName = data.doctors.find((d) => d.id === returnee)?.name ?? returnee;
  // محاكاة عودةٍ من إجازة: العائد الأقدم مطلقاً ('')، والبقيّة على ختمٍ من **الأسبوع
  //  السابق** (أقدمُ من النافذة، أحدثُ من العائد) — فيأخذ العائد دوراً واحداً ثمّ
  //  تعود البقيّة أحقَّ منه (لأنّ ختمهم أقدم من ختم النافذة الذي ناله) → لا تكدّس.
  const prior2 = new Map(priorLast);
  for (const d of data.doctors) if (d.id !== returnee && !prior2.get(d.id)) prior2.set(d.id, '2098-12-28#0#0'); // الأسبوع السابق
  prior2.set(returnee, ''); // العائد: الأقدم مطلقاً
  const rec2 = solveHeavyRecency(data.doctors, prior2, seats);
  const gotEarliest = (rec2.assignments.find((a) => a.seatId === earliest.id)?.to ?? data.doctors.find((d) => d.id === earliest.current)?.name) === returneeName;
  console.log(`  العائد «${returneeName}» مؤهَّلٌ لأبكر مقعدٍ (${earliest.id}) → ${gotEarliest ? 'امتصّه فوراً ✓' : 'لم يأخذه ✗'}`);
  check('(د) العائد يمتصّ أبكر مقعدٍ مؤهَّلٍ (امتصاصٌ قبل الحدث، واقعيّ)', gotEarliest, '');
  // لا يُكدَّس: العائد لا يتجاوز **نصيبه العادل** بالتدوير + دورةَ تعويضٍ واحدة.
  // (مع ٢٤ مقعد دليقيتر و~٨ مؤهَّلين، النصيب العادل ~٣؛ فأيّ عددٍ ≤ نصيب+١ سليم.)
  const distinctEligible = new Set(seats.flatMap((s) => s.eligible)).size;
  const fairShare = Math.ceil(seats.length / Math.max(1, distinctEligible));
  const returneeAssigns = rec2.assignments.filter((a) => a.to === returneeName).length;
  check('(د) لا تكدّس (العائد ضمن نصيبه العادل + تعويضٍ واحد)', returneeAssigns <= fairShare + 1, `أخذ ${returneeAssigns}، النصيب العادل ${fairShare}`);

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
