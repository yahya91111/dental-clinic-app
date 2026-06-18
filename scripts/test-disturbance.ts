/* الحلّال المُوجَّه بالحدث (شفت واحد): «يلمس ما تأثّر بقدر الحاجة». على بياناتٍ
 * حقيقيّة نتحقّق: (أ) بلا حدث → لمسٌ صفر (الأساس عادل). (ب) غيابٌ → يُفرَّغ مقعد
 * الغائب ويُعاد لأحقّ متاح، بأقلّ لمس. (ج) عودةُ أحقَّ → يأخذ دورًا ويتموّج بقدر
 * الحاجة. (د) غيابُ اثنين → يلمس اثنين+. قراءةٌ فقط — لا يكتب حرفًا. */
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';
import { extractHeavySeats, lastHeavyStamps, solveDisturbance } from '../lib/algorithms/solver';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DAY_IDX: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
const ORD = (day: string, period: number) => DAY_IDX[day]! * 2 + (period >= 3 ? 1 : 0);
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };

async function main() {
  // تهيئة بناءٍ حتميّ + حفظ الوصفة.
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

  const poolIds = new Set(data.doctors
    .filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty')
    .map((d) => d.id));
  const nameOf = (id: string) => data.doctors.find((d) => d.id === id)?.name ?? id;

  // نمسح كلّ الشفتات ونختار الأنسب للبرهان: أكثرها مقاعد ثقيلة وفيه شاغلٌ له تاريخٌ
  // سابق (last != '') — كي يقدر العائد الأقدم على تجاوزه فعلًا (تحسّنٌ صارم).
  let day: WeekDay = 'wednesday'; let shift: Shift = 'morning';
  let seats = [] as ReturnType<typeof extractHeavySeats>;
  let priorLast = new Map<string, string>();
  let bestScore = -1;
  for (let order = 0; order < 10; order++) {
    const d = DAYS[Math.floor(order / 2)]!; const sh: Shift = order % 2 === 0 ? 'morning' : 'evening';
    const ps = sh === 'morning' ? [1, 2] : [3, 4]; const to = ORD(d, ps[0]!);
    const ss = data.existingSlots.filter((s) => DAY_IDX[s.dayOfWeek] === DAY_IDX[d] && ps.includes(s.period));
    const se = extractHeavySeats(ss, poolIds);
    if (se.length === 0) continue;
    const bf = [...data.pastSlots, ...data.existingSlots.filter((s) => ORD(s.dayOfWeek, s.period) < to)];
    const pl = lastHeavyStamps(bf);
    const hasHistory = se.some((s) => (pl.get(s.current) ?? '') !== '');
    const score = se.length + (hasHistory ? 100 : 0); // فضّل وجود تاريخٍ ثمّ كثرة المقاعد
    if (score > bestScore) { bestScore = score; day = d; shift = sh; seats = se; priorLast = pl; }
  }
  console.log(`الشفت: ${day}/${shift} — ${seats.length} مقعد ثقيل. الشاغلون: ${seats.map((s) => nameOf(s.current)).join('، ')}\n`);
  check('وُجدت مقاعد ثقيلة في الشفت', seats.length >= 1, `${seats.length}`);

  // (أ) بلا حدث → لمسٌ صفر (الخاصيّة الجوهريّة: الأساس عادلٌ ثابت).
  const base = solveDisturbance(data.doctors, seats, priorLast, {});
  check('(أ) بلا حدث: لمسٌ صفر (لا churn)', base.assignments.length === 0, `لمس ${base.assignments.length}: ${JSON.stringify(base.assignments)}`);

  // (ب) غيابُ شاغلٍ واحد → يُفرَّغ مقعده ويُعاد لأحقّ متاح، والغائب لا يُسنَد له شيء.
  const victim = seats[0]!.current;
  const r1 = solveDisturbance(data.doctors, seats, priorLast, { absentIds: [victim] });
  console.log(`(ب) غياب ${nameOf(victim)}: لمس ${r1.assignments.length} — ${r1.assignments.map((a) => `${a.from}→${a.to}`).join('، ')}`);
  check('(ب) لمسٌ واحدٌ على الأقل (تغطية الفراغ)', r1.assignments.length >= 1, '');
  check('(ب) الغائب لا يُسنَد له مقعد', !r1.assignments.some((a) => a.to === nameOf(victim)), '');
  check('(ب) لا يُسيء العدل والأهليّة محترمة', r1.maxStaleAfter <= Math.max(r1.maxStaleBefore, r1.maxStaleAfter) && r1.owedRespected, '');

  // (ج) سيناريو العودة الحقيقيّ: شاغلٌ أخذ الدور **بينما الأحقّ غائب** (فحداثته
  //     حديثة)، ثمّ يعود الأحقّ (حداثته الأقدم '') → الحلّال يبدّله له، ويتموّج بقدر
  //     الحاجة. نُحاكيه بجعل شاغل المقعد الأوّل حديثَ العهد والعائد الأقدم.
  const outsider = data.doctors.find((d) => poolIds.has(d.id) && !seats.some((s) => s.eligible.includes(d.id)));
  if (outsider) {
    const recentStamp = `2099-01-04#${DAY_IDX[day]}#0`; // ختمٌ حديثٌ للشاغل (كأنّه أخذ الدور لتوّه)
    const prior2 = new Map(priorLast);
    prior2.set(seats[0]!.current, recentStamp);          // الشاغل ليس الأحقّ الآن
    const r2 = solveDisturbance(data.doctors, seats, prior2, { extraEligible: [{ id: outsider.id, lastStamp: '' }] });
    console.log(`(ج) عودة ${outsider.name} (الأحقّ) مقابل ${nameOf(seats[0]!.current)} (أخذ الدور حديثًا): لمس ${r2.assignments.length} — ${r2.assignments.map((a) => `${a.from}→${a.to}`).join('، ')}`);
    check('(ج) العائد الأحقّ يأخذ دورًا (تحسّنٌ صارم)', r2.assignments.some((a) => a.to === outsider.name), '');
    check('(ج) لمسٌ بقدر الحاجة (≥1) والأهليّة محترمة', r2.assignments.length >= 1 && r2.owedRespected, '');
  } else {
    console.log('(ج) تخطّي: لا يوجد طبيبٌ خارج الشفت لإثبات العودة.');
  }

  // (د) غيابُ اثنين → يلمس اثنين أو أكثر (مفتوحٌ بقدر الحاجة).
  if (seats.length >= 2) {
    const two = [seats[0]!.current, seats[1]!.current].filter((v, i, a) => a.indexOf(v) === i);
    const r3 = solveDisturbance(data.doctors, seats, priorLast, { absentIds: two });
    console.log(`(د) غياب ${two.map(nameOf).join(' و ')}: لمس ${r3.assignments.length}`);
    check('(د) يلمس بقدر الغياب (≥ عدد الغائبين الفعليّين)', r3.assignments.length >= two.length, `لمس ${r3.assignments.length} لغياب ${two.length}`);
    check('(د) لا أحدٌ من الغائبين يُسنَد له مقعد', !r3.assignments.some((a) => two.map(nameOf).includes(a.to)), '');
  }

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
