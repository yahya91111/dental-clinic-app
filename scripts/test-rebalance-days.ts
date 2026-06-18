/* A1 — التوازن عبر الأيّام (ظلّ). نافذةٌ تمتدّ أيّامًا. نتحقّق: (أ) بلا حدث → صفر لمس
 * عبر النافذة. (ب) غيابُ يومٍ واحد → يلمس يومًا. (ج) **غيابٌ يمتدّ يومين → يلمس
 * يومين** (جوهر «عبر الأيّام»). (د) عودةُ أحقّ → امتصاصٌ عبر الأيّام. قراءةٌ فقط. */
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';
import { extractHeavySeats, lastHeavyStamps, rebalanceDays } from '../lib/algorithms/solver';
import type { HeavySeat } from '../lib/algorithms/solver';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-01-04';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DAY_IDX: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
const ORD = (day: string, period: number) => DAY_IDX[day]! * 2 + (period >= 3 ? 1 : 0);
const stampOf = (day: WeekDay, shift: Shift) => `${WEEK}#${DAY_IDX[day]}#${shift === 'morning' ? 0 : 1}`;
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  FAIL ' + n + ' — ' + d); } };

async function main() {
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

  // النافذة = الاثنين..الخميس (صباحًا). الحداثة الداخلة = التاريخ قبل الاثنين (الأحد + ماضٍ).
  const winDays: WeekDay[] = ['monday', 'tuesday', 'wednesday', 'thursday'];
  const windowSeats: HeavySeat[] = [];
  for (const d of winDays) {
    const ss = data.existingSlots.filter((s) => DAY_IDX[s.dayOfWeek] === DAY_IDX[d] && [1, 2].includes(s.period));
    windowSeats.push(...extractHeavySeats(ss, poolIds));
  }
  const winStart = stampOf('monday', 'morning');
  const before = [...data.pastSlots, ...data.existingSlots.filter((s) => ORD(s.dayOfWeek, s.period) < ORD('monday', 1))];
  const priorLast = lastHeavyStamps(before);
  const seatsByDay = (di: number) => windowSeats.filter((s) => Number(s.id.split('|')[1]!.split('#')[1]) === di);
  console.log(`النافذة (اثنين..خميس صباحًا): ${windowSeats.length} مقعد ثقيل عبر ${winDays.length} أيّام.\n`);
  check('النافذة تمتدّ أيّامًا متعدّدة', new Set(windowSeats.map((s) => s.id.split('|')[1]!.split('#')[1])).size >= 2, '');

  // (أ) بلا حدث → صفر لمس عبر النافذة كلّها.
  const base = rebalanceDays(data.doctors, windowSeats, priorLast, {}, winStart);
  check('(أ) بلا حدث: صفر لمس عبر النافذة', base.assignments.length === 0, `لمس ${base.assignments.length}: ${JSON.stringify(base.assignments)}`);

  // (ب) غيابُ شاغلٍ يوم الاثنين → يلمس الاثنين (التغطية)، وقد يتموّج لأيّامٍ لاحقة
  //     (الذي غطّى صار أحدث عهدًا → يُعاد توزيع دورٍ لاحقٍ لمن هو أحقّ). كِلاهما عدل.
  const monSeats = seatsByDay(DAY_IDX.monday);
  if (monSeats.length) {
    const victim = monSeats[0]!.current;
    const r1 = rebalanceDays(data.doctors, windowSeats, priorLast, { absentIds: [victim] }, winStart);
    console.log(`(ب) غياب ${nameOf(victim)} (الاثنين): لمس ${r1.assignments.length}، أيّام=${r1.daysTouched}`);
    check('(ب) يلمس يوم الغياب (التغطية)', r1.daysTouched.includes(DAY_IDX.monday), `أيّام=${r1.daysTouched}`);
    check('(ب) الغائب لا يُسنَد له مقعد', !r1.assignments.some((a) => a.to === nameOf(victim)), '');
    check('(ب) لا يُسيء العدل والأهليّة محترمة', r1.owedRespected, '');
    if (r1.daysTouched.length > 1) console.log(`    ↑ تموّجٌ عبر الأيّام: التغطية يوم الاثنين حرّكت العدل في أيّام ${r1.daysTouched.filter((d) => d !== DAY_IDX.monday)} (مكسب).`);
  }

  // (ج) **برهان «عبر الأيّام» الحتميّ:** غيابُ شاغلٍ يوم الاثنين **وآخر** يوم الأربعاء
  //     معًا → يجب أن يلمس اليومين (الاثنين والأربعاء) لتغطيتهما.
  const wedSeats = seatsByDay(DAY_IDX.wednesday);
  if (monSeats.length && wedSeats.length) {
    const v1 = monSeats[0]!.current;
    const v2 = wedSeats.find((s) => s.current !== v1)?.current ?? wedSeats[0]!.current;
    const r2 = rebalanceDays(data.doctors, windowSeats, priorLast, { absentIds: [v1, v2] }, winStart);
    console.log(`(ج) غياب ${nameOf(v1)} (الاثنين) و ${nameOf(v2)} (الأربعاء): لمس ${r2.assignments.length}، أيّام=${r2.daysTouched}`);
    check('(ج) يلمس يومين (عبر الأيّام) — الاثنين والأربعاء', r2.daysTouched.includes(DAY_IDX.monday) && r2.daysTouched.includes(DAY_IDX.wednesday), `أيّام=${r2.daysTouched}`);
    check('(ج) لا أحدٌ من الغائبين يُسنَد له مقعد', !r2.assignments.some((a) => [nameOf(v1), nameOf(v2)].includes(a.to)), '');
    check('(ج) لا يُسيء العدل والأهليّة محترمة', r2.owedRespected, '');
  } else {
    console.log('(ج) تخطّي: لا توجد مقاعد ثقيلة في كلا اليومين بهذه البيانات.');
  }

  // (د) عودةُ أحقّ عبر النافذة (حداثته '') مقابل شاغلٍ حديثِ العهد → امتصاصٌ مبكر.
  const outsider = data.doctors.find((d) => poolIds.has(d.id) && !windowSeats.some((s) => s.eligible.includes(d.id)));
  if (outsider && monSeats.length) {
    const prior2 = new Map(priorLast);
    prior2.set(monSeats[0]!.current, `${WEEK}#${DAY_IDX.monday}#0`); // شاغل الاثنين أخذ الدور لتوّه
    const r3 = rebalanceDays(data.doctors, windowSeats, priorLast === prior2 ? priorLast : prior2, { extraEligible: [{ id: outsider.id, lastStamp: '' }] }, winStart);
    console.log(`(د) عودة ${outsider.name} (الأحقّ): لمس ${r3.assignments.length}، أيّام=${r3.daysTouched} — ${r3.assignments.map((a) => `${a.from}→${a.to}`).join('، ')}`);
    check('(د) العائد الأحقّ يمتصّ مقعدًا مبكّرًا', r3.assignments.some((a) => a.to === outsider.name), '');
    check('(د) الأهليّة محترمة', r3.owedRespected, '');
  }

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
