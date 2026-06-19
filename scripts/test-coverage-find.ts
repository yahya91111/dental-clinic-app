/* يمسح الأسابيع الثلاثة عن (يوم/شفت) فيه طبيب عيادةٍ + احتياطُ بِركةٍ حقيقيّ، ثمّ يُغيّب
 * طبيب العيادة ويتحقّق أنّ القلب الجديد يسحب الاحتياط الحقيقيّ لتغطية المقعد — تغطيةٌ
 * من بِركةٍ فعليّة (لا نقص). إن لم يوجد أيّ تكوينٍ كهذا في الفكسجر، يُعلِنه بصدق. */
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode, LoadedSlot } from '../lib/algorithms/schedule';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { extractCoverageSeats, solveCoverage, lastClinicStamps } from '../lib/algorithms/solver';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEKS = ['2099-01-04', '2099-01-11', '2099-01-18'];
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
const reservesOf = (slots: LoadedSlot[], day: WeekDay, shift: Shift, pool: Set<string>, absent: Set<string>) => {
  const exCol = shift === 'morning' ? 1 : 2;
  return [...new Set(slots.filter((s) => DI[s.dayOfWeek] === DI[day] && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol).map((s) => s.doctorId))].filter((id) => pool.has(id) && !absent.has(id));
};

(async () => {
  for (const W of WEEKS) await buildWeek(W);

  // امسح عن (أسبوع/يوم) فيه طبيب عيادةٍ صباحًا + احتياطُ بِركةٍ حقيقيّ.
  let found: { W: string; day: WeekDay; victim: LoadedSlot } | null = null;
  for (const W of WEEKS) {
    const data = (await loadScheduleData(CID, W)).data!;
    const pool = poolOf(data.doctors);
    for (const day of DAYS) {
      const res = reservesOf(data.existingSlots, day, 'morning', pool, new Set());
      const clinicDocs = data.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day] && [1, 2].includes(s.period) && s.status === 'active' && s.role === 'clinic' && pool.has(s.doctorId));
      if (res.length >= 1 && clinicDocs.length >= 1) { found = { W, day, victim: clinicDocs[0]! }; break; }
    }
    if (found) break;
  }

  if (!found) {
    console.log('ℹ لا يوجد تكوينُ (طبيب عيادة + احتياط بِركة) صباحًا في الفكسجر — التغطية من بِركةٍ حقيقيّةٍ غير قابلةِ التجربة هنا (قيد بيانات). المنطق مُثبَتٌ تركيبيًّا (test-coverage).');
    console.log('\n0 PASS / 0 FAIL (تخطّي)');
    process.exit(0);
  }

  const { W, day, victim } = found;
  console.log(`وجدتُ: أسبوع ${W} يوم ${day} — الغائب ${victim.doctorName} (عيادة ${victim.clinicNumber})\n`);
  let data = (await loadScheduleData(CID, W)).data!;
  const pool = poolOf(data.doctors);
  const reservesBefore = reservesOf(data.existingSlots, day, 'morning', pool, new Set());
  console.log(`     احتياطُ البِركة قبل الغياب: ${reservesBefore.length}`);

  const actor = { id: data.doctors[0]!.id, role: 'super_admin' };
  const res = await requestsV2.setScheduleStatus(actor, { clinicId: CID, weekStart: W, day, doctorId: victim.doctorId, doctorName: victim.doctorName, status: 'sick_leave', shift: 'morning' });
  check('غيابٌ سُجِّل', res.success, (res as any).error || '');

  data = (await loadScheduleData(CID, W)).data!;
  const slots = data.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day]);
  const vacant = extractCoverageSeats(slots);
  const avail = reservesOf(data.existingSlots, day, 'morning', pool, new Set([victim.doctorId]));
  const prior = lastClinicStamps([...data.pastSlots, ...data.existingSlots].filter((s) => s.weekStart < W || (s.weekStart === W && DI[s.dayOfWeek] < DI[day])));
  const rec = solveCoverage(data.doctors, vacant, avail, prior);
  console.log(`     شاغر=${vacant.length} احتياط=${avail.length} غطّى=${rec.fills.length}`);

  check('① كشف المقعد الشاغر', vacant.length >= 1);
  check('② غُطّي من بِركةٍ حقيقيّة (محفوظ)', avail.length >= vacant.length ? rec.conserved : rec.fills.length === avail.length);
  check('③ البديلُ احتياطٌ حقيقيٌّ من البِركة', rec.fills.every((f) => avail.includes(f.doctorId)));
  check('④ البديلُ ليس الغائب', rec.fills.every((f) => f.doctorId !== victim.doctorId));

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
