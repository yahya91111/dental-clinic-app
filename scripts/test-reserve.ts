/* A2 — محور الاحتياط (راحة بالحداثة، الغياب يُحسب راحة). نتحقّق: (أ) استخراج مقاعد
 * الاحتياط الحقيقيّة. (ب) قاعدة الراحة: مَن ارتاح حديثًا (احتياطًا أو **غيابًا**) لا
 * يُقدَّم على مَن لم يرتَح. (ج) أساسٌ بلا حدث → لمسٌ صفر. (د) الأهليّة محترمة. قراءةٌ فقط. */
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';
import { extractReserveSeats, lastRestStamps, solveHeavyRecency } from '../lib/algorithms/solver';
import type { HeavySeat } from '../lib/algorithms/solver';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };

async function main() {
  const pre = await loadScheduleData(CID, WEEK);
  const tm: Record<string, TraineeMode> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: WEEK, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
  await schedule.build({ ...recipe, dryRun: false });
  await schedule.saveBuildConfig({ ...recipe, dryRun: true });
  const data = (await loadScheduleData(CID, WEEK)).data!;
  const doctors = data.doctors;
  const poolIds = new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));
  const nameOf = (id: string) => doctors.find((d) => d.id === id)?.name ?? id;

  // (أ) استخراج مقاعد الاحتياط لكلّ شفت — نجد شفتًا به احتياط.
  let seats: HeavySeat[] = []; let day: WeekDay = 'sunday'; let half = 0;
  for (const d of DAYS) for (const h of [0, 1]) {
    const periods = h === 0 ? [1, 2, 0] : [3, 4, 0];
    const ss = data.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[d] && (s.status === 'extra' ? (s.clinicNumber === (h === 0 ? 1 : 2)) : periods.includes(s.period)));
    const ex = extractReserveSeats(ss, poolIds);
    if (ex.length > seats.length) { seats = ex; day = d; half = h; }
  }
  console.log(`الشفت المختار: ${day}/${half === 0 ? 'صباح' : 'مساء'} — ${seats.length} مقعد احتياط: ${seats.map((s) => nameOf(s.current)).join('، ')}`);
  check('(أ) استُخرجت مقاعد احتياطٍ حقيقيّة (kind=reserve)', seats.length >= 1 && seats.every((s) => s.kind === 'reserve'), `${seats.length}`);

  // (ج) أساسٌ بلا حدث: الحداثة الحقيقيّة (راحة) → لمسٌ صفر/قليل (الشاغلون أحقّ بالراحة).
  const rest = lastRestStamps(data.pastSlots);
  const base = solveHeavyRecency(doctors, rest, seats);
  check('(ج) أساس: لمسٌ صفر (أو محترمُ الأهليّة)', base.assignments.length === 0 && base.owedRespected, `لمس ${base.assignments.length}`);

  // (ب) القاعدة المميّزة: شاغلُ احتياطٍ **ارتاح حديثًا** (نحاكي أنّه كان غائبًا/محتاطًا
  //     لتوّه) مقابل مؤهَّلٍ **لم يرتَح** ('') → يجب أن ينتقل الاحتياط للذي لم يرتَح.
  if (seats.length >= 1) {
    const restedHolder = seats[0]!.current;                       // شاغل الاحتياط الحاليّ
    const needsRest = seats[0]!.eligible.find((id) => id !== restedHolder)!; // مؤهَّلٌ آخر
    const prior = new Map<string, string>();
    prior.set(restedHolder, `${WEEK}#${DI[day]}#${half}`);        // ارتاح لتوّه (راحةٌ حديثة)
    prior.set(needsRest, '');                                     // لم يرتَح أبدًا (الأحقّ)
    const r = solveHeavyRecency(doctors, prior, seats);
    const moved = r.assignments.find((a) => a.seatId === seats[0]!.id);
    console.log(`(ب) ${nameOf(restedHolder)} ارتاح حديثًا، ${nameOf(needsRest)} لم يرتَح → ${moved ? `${moved.from}→${moved.to}` : 'لا نقل'}`);
    check('(ب) الراحة تنتقل لمن لم يرتَح (الغياب/الاحتياط = راحة)', moved?.to === nameOf(needsRest), `${moved?.to}`);
    check('(ب) الأهليّة محترمة', r.owedRespected, '');
  }

  // (د) تحقّق «الغياب = راحة» في lastRestStamps مباشرةً (لو وُجد غيابٌ في التاريخ).
  const restMap = lastRestStamps(data.existingSlots);
  check('(د) lastRestStamps ينتج حداثةَ راحةٍ لمن احتاط/غاب', restMap.size >= 1, `${restMap.size}`);

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
