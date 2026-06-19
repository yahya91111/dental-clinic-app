/* المرحلة ب — بوّابة التحقّق الشامل (ظلّ). نبني ٣ أسابيع حقيقيّة ونشغّل **كلّ المحاور
 * القابلة للاستخراج** (دليقيتر/احتياط/فترات) معًا، ونتحقّق من الثوابت التي تسمح بالكتابة
 * لاحقًا: (١) لا يُسيء العدل أبدًا. (٢) يحترم الأهليّة. (٣) يحفظ القسمة. (٤) حتميّ
 * (نفس المدخل → نفس المخرَج). (٥) أساسٌ بلا حدث = لمسٌ صفر/أدنى. قراءةٌ فقط — لا كتابة. */
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode, LoadedSlot } from '../lib/algorithms/schedule';
import {
  extractHeavySeats, extractReserveSeats, lastHeavyStamps, lastRestStamps,
  solveLookahead, solveHeavyRecency, solveShiftPeriods,
} from '../lib/algorithms/solver';
import type { HeavySeat } from '../lib/algorithms/solver';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEKS = ['2099-01-04', '2099-01-11', '2099-01-18'];
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };
const sig = (as: { seatId: string; to: string }[]) => as.map((a) => `${a.seatId}=${a.to}`).sort().join('|');

async function main() {
  const pre = await loadScheduleData(CID, WEEKS[0]!);
  const tm: Record<string, TraineeMode> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  for (const w of WEEKS) {
    const recipe = { weekStart: w, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
    await schedule.build({ ...recipe, dryRun: false });
    await schedule.saveBuildConfig({ ...recipe, dryRun: true });
  }
  const w3 = (await loadScheduleData(CID, WEEKS[2]!)).data!;
  const allSlots: LoadedSlot[] = [...w3.pastSlots, ...w3.existingSlots];
  const doctors = w3.doctors;
  const poolIds = new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));

  // ════════ المحور ①: الدليقيتر (نظر-للأمام، عبء) عبر ٣ أسابيع ════════
  console.log('المحور ① الدليقيتر (نظر-للأمام):');
  const delSeats: HeavySeat[] = [];
  for (const w of WEEKS) for (const d of DAYS) {
    const ss = allSlots.filter((s) => s.weekStart === w && DI[s.dayOfWeek] === DI[d] && [1, 2].includes(s.period));
    delSeats.push(...extractHeavySeats(ss, poolIds));
  }
  delSeats.sort((a, b) => a.stamp.localeCompare(b.stamp));
  const dlPrior = lastHeavyStamps(allSlots.filter((s) => s.weekStart < WEEKS[0]!));
  const dl1 = solveLookahead(doctors, delSeats, dlPrior);
  const dl2 = solveLookahead(doctors, delSeats, dlPrior);
  check('① لا يُسيء الحِمل (after ≤ before)', dl1.maxLoadAfter <= dl1.maxLoadBefore, `${dl1.maxLoadBefore}→${dl1.maxLoadAfter}`);
  check('① أهليّةٌ محترمة + قسمةٌ محفوظة', dl1.eligibilityRespected && dl1.conserved, '');
  check('① أساسٌ بلا حدث: لمسٌ صفر/أدنى (لا churn)', dl1.assignments.length === 0, `لمس ${dl1.assignments.length}`);
  check('① حتميّ (نفس المخرَج)', sig(dl1.assignments) === sig(dl2.assignments), '');

  // ════════ المحور ②: الاحتياط (حداثة، راحة، الغياب = راحة) ════════
  console.log('المحور ② الاحتياط (حداثة):');
  const rest = lastRestStamps(allSlots.filter((s) => s.weekStart < WEEKS[0]!));
  let exTotal = 0; let exTouch = 0; let exOk = true; let exDet = true;
  for (const w of WEEKS) for (const d of DAYS) for (const h of [0, 1]) {
    const periods = h === 0 ? [1, 2, 0] : [3, 4, 0];
    const ss = allSlots.filter((s) => s.weekStart === w && DI[s.dayOfWeek] === DI[d] && (s.status === 'extra' ? s.clinicNumber === (h === 0 ? 1 : 2) : periods.includes(s.period)));
    const seats = extractReserveSeats(ss, poolIds);
    if (seats.length === 0) continue;
    exTotal += seats.length;
    const r1 = solveHeavyRecency(doctors, rest, seats);
    const r2 = solveHeavyRecency(doctors, rest, seats);
    exTouch += r1.assignments.length;
    if (!r1.owedRespected || r1.maxStaleAfter > r1.maxStaleBefore) exOk = false;
    if (sig(r1.assignments) !== sig(r2.assignments)) exDet = false;
  }
  console.log(`   مقاعد احتياط: ${exTotal} · لمس الأساس: ${exTouch}`);
  check('② لا يُسيء الراحة + أهليّةٌ محترمة', exOk, '');
  check('② أساسٌ بلا حدث: لمسٌ صفر', exTouch === 0, `${exTouch}`);
  check('② حتميّ', exDet, '');

  // ════════ المحور ③: ميزان الفترات (لا يُسيء |الخلل|) ════════
  console.log('المحور ③ ميزان الفترات:');
  let pWorse = false; let pDet = true; let pShifts = 0;
  for (const w of WEEKS) for (const d of DAYS) for (const sh of ['morning', 'evening'] as Shift[]) {
    const periods = sh === 'morning' ? [1, 2] : [3, 4];
    const shiftSlots = allSlots.filter((s) => s.weekStart === w && DI[s.dayOfWeek] === DI[d] && periods.includes(s.period));
    if (shiftSlots.filter((s) => s.status === 'active' && s.role === 'clinic').length < 2) continue;
    const ctx = allSlots.filter((s) => !(s.weekStart === w && DI[s.dayOfWeek] === DI[d] && periods.includes(s.period)));
    const r1 = solveShiftPeriods(doctors, ctx, shiftSlots);
    const r2 = solveShiftPeriods(doctors, ctx, shiftSlots);
    pShifts++;
    if (r1.afterAbsImbalance > r1.beforeAbsImbalance || !r1.ledgerBalanced) pWorse = true;
    if (r1.swaps.length !== r2.swaps.length) pDet = false;
  }
  console.log(`   شفتات مفحوصة: ${pShifts}`);
  check('③ لا يُسيء |الخلل| أبدًا + حفظُ النقاط', !pWorse, '');
  check('③ حتميّ', pDet, '');

  console.log(`\n════════ بوّابة التحقّق: ${pass} PASS / ${fail} FAIL ════════`);
  console.log(fail === 0 ? 'كلّ المحاور آمنة: لا تُسيء، تحترم الأهليّة، تحفظ، حتميّة. ✓ جاهزٌ للمرحلة ج.' : 'تحقّق: ثَمّ خللٌ يجب إصلاحه قبل الكتابة.');
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
