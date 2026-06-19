/* تغطيةُ الغياب — إجهادٌ على بياناتٍ حقيقيّة: غيابات متعدّدةٌ بيومٍ واحد، نقصٌ مُتعمَّد
 * (غيابٌ أكثر من الاحتياط)، وعبر يومين. نتحقّق أنّ الجديد:
 *  • يكشف كلّ المقاعد الشاغرة، (لا يكرّر فترةً لبديل)، لا يختلق طبيبًا،
 *  • يغطّي بقدر الاحتياط ثمّ يُعلن النقص صراحةً (يطابق نقص القديم: لا يترك عيادةً
 *    فارغةً يملؤها القديم)،
 *  • حتميّ. */
import { loadScheduleData, schedule, redistributeShift } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode, LoadedSlot } from '../lib/algorithms/schedule';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { extractCoverageSeats, solveCoverage, lastClinicStamps } from '../lib/algorithms/solver';

const CID = '10000000-0000-0000-0000-000000000001';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };

async function buildWeek(W: string) {
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
  await schedule.build({ ...recipe, dryRun: false });
  await schedule.saveBuildConfig({ ...recipe, dryRun: true } as any);
}
const poolOf = (doctors: any[]) => new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));
function coverageAvailable(slots: LoadedSlot[], day: WeekDay, shift: Shift, pool: Set<string>, absent: Set<string>): string[] {
  const exCol = shift === 'morning' ? 1 : 2;
  return [...new Set(slots.filter((s) => DI[s.dayOfWeek] === DI[day] && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol).map((s) => s.doctorId))].filter((id) => pool.has(id) && !absent.has(id));
}
const newCoverage = (data: any, day: WeekDay, pool: Set<string>, absent: Set<string>, W: string) => {
  const slots = data.existingSlots.filter((s: LoadedSlot) => DI[s.dayOfWeek] === DI[day]);
  const vacant = extractCoverageSeats(slots);
  const avail = coverageAvailable(data.existingSlots, day, 'morning', pool, absent);
  const prior = lastClinicStamps(data.pastSlots.filter((s: LoadedSlot) => s.weekStart < W));
  return { vacant, avail, rec: solveCoverage(data.doctors, vacant, avail, prior) };
};

(async () => {
  const W = '2099-01-04';
  await buildWeek(W);
  let data = (await loadScheduleData(CID, W)).data!;
  const pool = poolOf(data.doctors);
  const actor = { id: data.doctors[0]!.id, role: 'super_admin' };

  // كلّ أطبّاء العيادة يوم الأحد صباحًا.
  const sunDocs = [...new Set(data.existingSlots.filter((s) => DI[s.dayOfWeek] === 0 && [1, 2].includes(s.period) && s.status === 'active' && s.role === 'clinic' && pool.has(s.doctorId)).map((s) => s.doctorId))];
  const reservesCount = coverageAvailable(data.existingSlots, 'sunday', 'morning', pool, new Set()).length;
  console.log(`أطبّاء عيادةٍ (أحد ص): ${sunDocs.length} | احتياط: ${reservesCount}\n`);

  // ── سيناريو أ: غيابان بيومٍ واحد (إن وُجد احتياطان) ──
  const twoVictims = sunDocs.slice(0, 2);
  for (const id of twoVictims) {
    const nm = data.doctors.find((d) => d.id === id)!.name;
    await requestsV2.setScheduleStatus(actor, { clinicId: CID, weekStart: W, day: 'sunday', doctorId: id, doctorName: nm, status: 'sick_leave', shift: 'morning' });
  }
  data = (await loadScheduleData(CID, W)).data!;
  const absentSet = new Set(twoVictims);
  const A = newCoverage(data, 'sunday', pool, absentSet, W);
  console.log(`أ) غيابان: شاغر=${A.vacant.length} احتياط=${A.avail.length} غطّى=${A.rec.fills.length} محفوظ=${A.rec.conserved}`);
  check('أ: لا بديلٌ يكرّر الفترة', new Set(A.rec.fills.map((f) => `${f.period}#${f.doctorId}`)).size === A.rec.fills.length);
  check('أ: لا طبيبٌ مختلَق', A.rec.fills.every((f) => pool.has(f.doctorId) && !absentSet.has(f.doctorId)));
  check('أ: غطّى = min(شاغر، احتياط)', A.rec.fills.length === Math.min(A.vacant.length, /*سعة الفترات*/ A.vacant.length, A.avail.length * 2) && A.rec.fills.length <= A.vacant.length);
  check('أ: conserved يطابق كفاية الاحتياط', A.rec.conserved === (A.avail.length >= A.vacant.length));

  // مقارنة النقص بالقديم: أيّ عيادةٍ تركها الجديد فارغةً، هل القديم يملؤها؟
  const oldR = await redistributeShift({ clinicId: CID, weekStart: W, day: 'sunday', shift: 'morning' });
  const oldStaffed = new Set<string>();
  if (oldR.success) for (const s of oldR.slots.filter((x) => x.role === 'clinic' && x.clinicNumber > 0 && !absentSet.has(x.doctor.id))) oldStaffed.add(`c${s.clinicNumber}`);
  const newStaffed = new Set<string>();
  for (const s of data.existingSlots.filter((x) => DI[x.dayOfWeek] === 0 && x.status === 'active' && x.role === 'clinic' && x.clinicNumber > 0 && !absentSet.has(x.doctorId))) newStaffed.add(`c${s.clinicNumber}`);
  for (const f of A.rec.fills) newStaffed.add(`c${f.clinicNumber}`);
  const onlyOld = [...oldStaffed].filter((c) => !newStaffed.has(c));
  check('أ: لا عيادةً يملؤها القديمُ ويتركها الجديدُ فارغةً (ضمن سعة الاحتياط)', onlyOld.length === 0 || A.avail.length < A.vacant.length, `فقط القديم: ${onlyOld.join(',')}`);

  // ── سيناريو ب: الحتميّة — إعادة الحساب نفسه ──
  const B = newCoverage(data, 'sunday', pool, absentSet, W);
  check('ب: حتميّ (نفس القرار)', JSON.stringify(A.rec.fills) === JSON.stringify(B.rec.fills));

  // ── سيناريو ج: نقصٌ مُتعمَّد — غيّب كلّ من يمكن حتى يَعجِز الاحتياط ──
  for (const id of sunDocs.slice(2)) {
    const nm = data.doctors.find((d) => d.id === id)!.name;
    await requestsV2.setScheduleStatus(actor, { clinicId: CID, weekStart: W, day: 'sunday', doctorId: id, doctorName: nm, status: 'sick_leave', shift: 'morning' });
  }
  data = (await loadScheduleData(CID, W)).data!;
  const allAbsent = new Set(sunDocs);
  const C = newCoverage(data, 'sunday', pool, allAbsent, W);
  console.log(`ج) نقص: شاغر=${C.vacant.length} احتياط=${C.avail.length} غطّى=${C.rec.fills.length} محفوظ=${C.rec.conserved}`);
  check('ج: نقصٌ مُعلَنٌ صراحةً (conserved=false) حين يَعجِز الاحتياط', C.avail.length >= C.vacant.length ? C.rec.conserved : !C.rec.conserved);
  check('ج: لا انهيار، لا طبيبٌ مختلَق', C.rec.fills.every((f) => pool.has(f.doctorId)));
  check('ج: غطّى لا يتجاوز الاحتياطَ المتاح', C.rec.fills.length <= C.avail.length * 2);

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
