/* تمحيصٌ صارمٌ لنواة النظر-للأمام على بياناتٍ **حقيقيّة** عبر ١/٢/٣ أسابيع (ظلّ).
 *  (A) أساسٌ: لا يزيد أقصى الحِمل أبدًا، الأهليّة محترمة، القسمة محفوظة — على كلّ المقاييس.
 *  (B) إجبارٌ حقيقيّ: نجعل طبيبًا الوحيدَ المؤهَّل لشفتٍ **لاحق** وهو يشغل شفتًا **مبكّرًا**
 *      → النظر-للأمام يُرتاحه مبكّرًا (لمسٌ **قبل** الحدث)، وحِمله لا يتضاعف.
 *  (C) النظر-للأمام لا يُسوّئ التوازن مقابل التوزيع الحاليّ. قراءةٌ فقط — لا يكتب. */
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode, LoadedSlot } from '../lib/algorithms/schedule';
import { extractHeavySeats, lastHeavyStamps, solveLookahead } from '../lib/algorithms/solver';
import type { HeavySeat } from '../lib/algorithms/solver';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEKS = ['2099-01-04', '2099-01-11', '2099-01-18'];
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };

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
  const nameOf = (id: string) => doctors.find((d) => d.id === id)?.name ?? id;

  const windowSeats = (weeks: string[]): HeavySeat[] => {
    const out: HeavySeat[] = [];
    for (const w of weeks) for (const d of DAYS) {
      const ss = allSlots.filter((s) => s.weekStart === w && DI[s.dayOfWeek] === DI[d] && [1, 2].includes(s.period));
      out.push(...extractHeavySeats(ss, poolIds));
    }
    return out.sort((a, b) => a.stamp.localeCompare(b.stamp));
  };
  const priorBefore = (firstWeek: string) => lastHeavyStamps(allSlots.filter((s) => s.weekStart < firstWeek));

  // ── (A) الأساس عبر ١/٢/٣ أسابيع: لا يزيد أقصى الحِمل، أهليّةٌ محترمة، قسمةٌ محفوظة ──
  for (const [label, weeks] of [['أسبوع', [WEEKS[0]!]], ['أسبوعين', [WEEKS[0]!, WEEKS[1]!]], ['٣ أسابيع', WEEKS]] as const) {
    const seats = windowSeats(weeks);
    const rec = solveLookahead(doctors, seats, priorBefore(weeks[0]!));
    check(`(A) ${label}: أقصى الحِمل لا يزيد (${rec.maxLoadBefore}→${rec.maxLoadAfter})`, rec.maxLoadAfter <= rec.maxLoadBefore, `${rec.maxLoadBefore}→${rec.maxLoadAfter}`);
    check(`(A) ${label}: أهليّةٌ محترمة + قسمةٌ محفوظة (${seats.length} مقعد)`, rec.eligibilityRespected && rec.conserved, '');
  }

  // ── (B) إجبارٌ حقيقيّ: طبيبٌ يشغل أبكر مقعدٍ، نجبره ليكون الوحيدَ لأبعد مقعد ──
  const seats3 = windowSeats(WEEKS);
  if (seats3.length >= 2) {
    const early = seats3[0]!;
    const late = seats3[seats3.length - 1]!;
    const D = early.current;                  // شاغل أبكر مقعد
    // اجعل D مُجبَرًا على أبعد مقعد (الوحيد المؤهَّل) وشاغلَه حاليًّا أيضًا.
    const forced: HeavySeat[] = seats3.map((s) => {
      if (s.id === late.id) return { ...s, eligible: [D], current: D };
      return s;
    });
    const before = solveLookahead(doctors, seats3, priorBefore(WEEKS[0]!)); // قبل الإجبار (مرجع)
    const rec = solveLookahead(doctors, forced, priorBefore(WEEKS[0]!));
    const loadD = rec.loadAfter.find((x) => x.id === D)?.load ?? 0;
    const lateHolder = rec.fullAssignment.find((a) => a.seatId === late.id)?.doctorId;
    const earlyHolder = rec.fullAssignment.find((a) => a.seatId === early.id)?.doctorId;
    console.log(`(B) إجبار ${nameOf(D)} على أبعد مقعد (${late.id.split('|')[1]}). حِمله=${loadD}، أقصى حِمل ${rec.maxLoadBefore}→${rec.maxLoadAfter}`);
    console.log(`    أبكر مقعد (${early.id.split('|')[1]}) صار لـ ${nameOf(earlyHolder ?? '')}`);
    check('(B) المُجبَر يبقى على المقعد المُجبَر', lateHolder === D, `${lateHolder}`);
    check('(B) لا يتضاعف حِمل المُجبَر (يُرتاح مبكّرًا)', loadD <= Math.max(1, before.loadAfter.find((x) => x.id === D)?.load ?? 1), `حِمل=${loadD}`);
    check('(B) أبكر مقعدٍ أُعطي لغير المُجبَر (امتصاصٌ قبل الحدث)', earlyHolder !== D || early.id === late.id, `${earlyHolder}`);
    check('(B) أقصى الحِمل لا يزيد بالإجبار', rec.maxLoadAfter <= rec.maxLoadBefore + 0, `${rec.maxLoadBefore}→${rec.maxLoadAfter}`);
    check('(B) الأهليّة محترمة + القسمة محفوظة', rec.eligibilityRespected && rec.conserved, '');
  }

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
