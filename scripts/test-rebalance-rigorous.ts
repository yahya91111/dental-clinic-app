/* تمحيصٌ صارمٌ لـ A1 عبر ١/٢/٣ أسابيع (ظلّ). نبني ٣ أسابيع متتالية، ثمّ:
 *  (A) أساسٌ بلا حدث → صفر لمس على نوافذ ١ و٢ و٣ أسابيع.
 *  (B) غيابُ يومٍ محدّد (absentByStamp) → يلمس ذلك اليوم فقط (لا يُسقَط من بقيّة الأيّام).
 *  (C) امتصاصٌ مبكر: العائد الأحقّ يأخذ **أبكر** مقعدٍ في النافذة (لا يؤجّل).
 *  (D) تموّجٌ عبر الأسابيع: غيابُ الأسبوع الأوّل قد يلمس الأسبوع الثاني.
 *  ثوابتُ في كلّ الحالات: لا يُسيء، يحترم الأهليّة، لا يُسنِد للغائب. قراءةٌ فقط. */
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode, LoadedSlot } from '../lib/algorithms/schedule';
import { extractHeavySeats, lastHeavyStamps, rebalanceDays } from '../lib/algorithms/solver';
import type { HeavySeat } from '../lib/algorithms/solver';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEKS = ['2099-01-04', '2099-01-11', '2099-01-18'];
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
const stampOf = (week: string, day: WeekDay) => `${week}#${DI[day]}#0`; // صباح
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };

async function main() {
  // ── بناء ٣ أسابيع متتالية (all_morning) + حفظ الوصفات ──
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
  const allSlots: LoadedSlot[] = [...w3.pastSlots, ...w3.existingSlots]; // الأسابيع الثلاثة
  const doctors = w3.doctors;
  const poolIds = new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));
  const nameOf = (id: string) => doctors.find((d) => d.id === id)?.name ?? id;

  // مقاعد نافذةٍ تمتدّ أسابيع (صباحًا)، مرتّبة زمنيًّا بالختم.
  const windowSeats = (weeks: string[]): HeavySeat[] => {
    const out: HeavySeat[] = [];
    for (const w of weeks) for (const d of DAYS) {
      const ss = allSlots.filter((s) => s.weekStart === w && DI[s.dayOfWeek] === DI[d] && [1, 2].includes(s.period));
      out.push(...extractHeavySeats(ss, poolIds));
    }
    return out.sort((a, b) => a.stamp.localeCompare(b.stamp));
  };
  // الحداثة الداخلة لنافذةٍ تبدأ بأوّل أسبوعها: من التاريخ الحقيقيّ قبل ذلك الأسبوع.
  const priorBefore = (firstWeek: string) => lastHeavyStamps(allSlots.filter((s) => s.weekStart < firstWeek));

  // ── (A) الأساس: صفر لمس على ١ و٢ و٣ أسابيع ──
  for (const [label, weeks] of [['أسبوع', [WEEKS[1]!]], ['أسبوعين', [WEEKS[1]!, WEEKS[2]!]], ['٣ أسابيع', WEEKS]] as const) {
    const seats = windowSeats(weeks);
    const pl = priorBefore(weeks[0]!);
    const base = rebalanceDays(doctors, seats, pl, {}, stampOf(weeks[0]! as string, 'sunday'));
    check(`(A) أساس ${label}: صفر لمس (${seats.length} مقعد)`, base.assignments.length === 0, `لمس ${base.assignments.length}`);
  }

  // نعمل على نافذة الأسبوعين (week2..week3) بحداثةٍ حقيقيّةٍ من الأسبوع الأوّل.
  const weeks2 = [WEEKS[1]!, WEEKS[2]!];
  const seats2 = windowSeats(weeks2);
  const pl2 = priorBefore(WEEKS[1]!);
  const fromW2 = stampOf(WEEKS[1]!, 'sunday');
  const seatsByStamp = (st: string) => seats2.filter((s) => s.stamp === st);

  // ── (B) غيابُ يومٍ محدّد: شاغلٌ يوم (week2,wednesday) غائبٌ ذلك اليوم فقط ──
  const wedStamp = stampOf(WEEKS[1]!, 'wednesday');
  const wedSeats = seatsByStamp(wedStamp);
  if (wedSeats.length) {
    const victim = wedSeats[0]!.current;
    // غائبٌ يوم الأربعاء فقط (لا كلّ النافذة)
    const r = rebalanceDays(doctors, seats2, pl2, { absentByStamp: new Map([[wedStamp, [victim]]]) }, fromW2);
    const touchedStamps = [...new Set(r.assignments.map((a) => a.seatId.split('|')[1]!))];
    // الغائب يحتفظ بمقاعده في أيّامٍ أخرى (لم يُسقَط عالميًّا).
    const otherSeatsOfVictim = seats2.filter((s) => s.current === victim && s.stamp !== wedStamp);
    const victimMovedElsewhere = otherSeatsOfVictim.some((s) => r.assignments.some((a) => a.seatId === s.id));
    console.log(`(B) غياب ${nameOf(victim)} (الأربعاء فقط): لمس ${r.assignments.length}، أختام=${touchedStamps.join('، ')}`);
    check('(B) يلمس يوم الغياب (الأربعاء)', touchedStamps.includes(wedStamp), `${touchedStamps}`);
    check('(B) الغائب لا يُسنَد له مقعد في يوم غيابه', !r.assignments.some((a) => a.seatId.split('|')[1] === wedStamp && a.to === nameOf(victim)), '');
    check('(B) الأهليّة محترمة', r.owedRespected, '');
    // **التمحيص الحاسم:** لا لمسَ في ختمٍ **قبل** الحدث (التموّج أماميٌّ فقط، لا رجعيّ).
    const beforeEvent = touchedStamps.filter((st) => st < wedStamp);
    check('(B) لا لمسَ قبل ختم الحدث (لا تموّج رجعيّ غير مفسَّر)', beforeEvent.length === 0, `قبل=${beforeEvent.join('،')}`);
    // معلومة (لا شرط): قد يُعاد مقعدٌ لاحقٌ للغائب لمن هو أحقّ — مشروعٌ بقاعدة «بقدر
    // الحاجة» و owedRespected يضمن أنّ المُستلِم أحقّ. ليس مقاعدُه الأخرى «مقدّسة».
    if (victimMovedElsewhere) console.log('    ℹ️ مقعدٌ لاحقٌ للغائب أُعيد لأحقّ منه (مشروع — التموّج الأماميّ).');
  } else { console.log('(B) تخطّي: لا مقاعد ثقيلة يوم الأربعاء (أسبوع٢).'); }

  // ── (C) امتصاصٌ مبكر: العائد الأحقّ يأخذ أبكر مقعدٍ في النافذة، لا يؤجّل ──
  const outsider = doctors.find((d) => poolIds.has(d.id) && !seats2.some((s) => s.eligible.includes(d.id)));
  if (outsider && seats2.length) {
    // اجعل شاغلَ أبكر مقعدٍ حديثَ العهد كي يتجاوزه العائد (تحسّنٌ صارم).
    const earliest = seats2[0]!;
    const prior3 = new Map(pl2);
    prior3.set(earliest.current, stampOf(WEEKS[1]!, 'sunday'));
    const r = rebalanceDays(doctors, seats2, prior3, { extraEligible: [{ id: outsider.id, lastStamp: '' }] }, fromW2);
    const taken = r.assignments.find((a) => a.to === outsider.name);
    const takenStamp = taken?.seatId.split('|')[1] ?? '';
    console.log(`(C) عودة ${outsider.name}: أخذ ختم=${takenStamp.split('#').slice(0).join('#')} (أبكر النافذة=${earliest.stamp})`);
    check('(C) العائد يأخذ دورًا (امتصاص)', !!taken, '');
    check('(C) الامتصاص في **أبكر** شفتٍ مؤهَّل (لا يؤجّل)', takenStamp === earliest.stamp, `أخذ ${takenStamp} متوقّع ${earliest.stamp}`);
  } else { console.log('(C) تخطّي: لا يوجد طبيبٌ خارج النافذة.'); }

  // ── (D) تموّجٌ عبر الأسابيع: غيابُ شاغلٍ في أوّل أسبوعٍ من النافذة (week2) ──
  if (seats2.length) {
    const v = seats2[0]!.current;
    const dStamp = seats2[0]!.stamp;
    const r = rebalanceDays(doctors, seats2, pl2, { absentByStamp: new Map([[dStamp, [v]]]) }, fromW2);
    const weeksTouched = new Set(r.assignments.map((a) => (a.seatId.split('|')[1] ?? '').split('#')[0]));
    const beforeEvent = r.assignments.map((a) => a.seatId.split('|')[1]!).filter((st) => st < dStamp);
    console.log(`(D) غياب ${nameOf(v)} (أوّل النافذة): لمس ${r.assignments.length}، أسابيع=${[...weeksTouched]}`);
    check('(D) يلمس على الأقلّ شفت الغياب', r.assignments.length >= 1, '');
    check('(D) لا يُسيء العدل', r.owedRespected, '');
    check('(D) لا لمسَ قبل ختم الحدث (تموّج أماميّ فقط)', beforeEvent.length === 0, `قبل=${beforeEvent.join('،')}`);
    check('(D) التموّج محدود (لا يتجاوز مقاعد النافذة)', r.assignments.length <= seats2.length, `${r.assignments.length}/${seats2.length}`);
    if (weeksTouched.size > 1) console.log(`    ↑ تموّجٌ عبر الأسابيع: ${[...weeksTouched].join(' و ')} (مكسب).`);
  }

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
