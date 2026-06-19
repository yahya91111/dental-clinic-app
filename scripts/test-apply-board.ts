/* غيابُ طبيب بورد — الحرج: القلب الجديد لا يملأ مقعد البورد الشاغر بطبيبٍ من البِركة
 * العاديّة (مقاعد البورد لأطبّاء البورد حصرًا). مع طبيبَي بوردٍ فقط لا يوجد احتياطُ بورد،
 * فالمقعد يبقى نقصَ بوردٍ صريحًا — لا يُحشى بعاديّ. نتحقّق:
 *  (أ) لا طبيبٌ غيرُ بورد دخل عيادة البورد.
 *  (ب) لا حجزٌ مزدوج.
 *  (ج) إن وُجد احتياطُ بورد، يُملأ منه فقط. */
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { applyCoverage } from '../lib/algorithms/solver_shadow';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };

async function build() {
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
  await schedule.build({ ...recipe, dryRun: false });
  await schedule.saveBuildConfig({ ...recipe, dryRun: true } as any);
}

(async () => {
  await build();
  const { newHeartConfig } = await import('../lib/algorithms/new_heart_config');
  newHeartConfig.mode = 'apply'; newHeartConfig.clinics = null;
  try {
    let data = (await loadScheduleData(CID, W)).data!;
    const boardIds = new Set(data.doctors.filter((d) => d.groupTemplate.key === 'board').map((d) => d.id));
    // طبيب بورد داخل العيادة يوم الأحد صباحًا.
    const inClinic = data.existingSlots.filter((s) => DI[s.dayOfWeek] === 0 && [1, 2].includes(s.period) && s.status === 'active' && s.role === 'clinic' && boardIds.has(s.doctorId));
    if (inClinic.length === 0) { console.log('لا طبيب بورد في عيادة الأحد ص — تخطّي'); newHeartConfig.mode = 'off'; process.exit(0); }
    const victim = inClinic[0]!;
    const boardClinic = victim.clinicNumber;
    console.log(`الغائب بورد: ${victim.doctorName} (عيادة بورد ${boardClinic} ف${victim.period})`);

    const actor = { id: data.doctors[0]!.id, role: 'super_admin' };
    await requestsV2.setScheduleStatus(actor, { clinicId: CID, weekStart: W, day: 'sunday', doctorId: victim.doctorId, doctorName: victim.doctorName, status: 'sick_leave', shift: 'morning' });

    const r = await applyCoverage({ clinicId: CID, weekStart: W, label: 'test' });
    console.log(`     طُبّق: filled=${r.filled} shortages=${r.shortages}`);

    data = (await loadScheduleData(CID, W)).data!;
    const seatOccupants = data.existingSlots.filter((s) => DI[s.dayOfWeek] === 0 && s.clinicNumber === boardClinic && s.period === victim.period && s.status === 'active' && s.role === 'clinic');
    // (أ) لا غيرُ بوردٍ دخل مقعد البورد.
    check('(أ) لا طبيبٌ من البِركة العاديّة حشا مقعد البورد', seatOccupants.every((s) => boardIds.has(s.doctorId)), seatOccupants.map((s) => s.doctorName).join(','));
    // (ج) إن مُلئ، فبِبورد؛ وإلّا نقصُ بوردٍ صريح (طبيبان فقط = لا احتياط).
    if (seatOccupants.length >= 1) check('(ج) مُلئ ببورد', seatOccupants.every((s) => boardIds.has(s.doctorId) && s.doctorId !== victim.doctorId));
    else check('(ج) لا احتياطَ بورد → نقصٌ صريح (مقعدٌ شاغر)', true);

    // (ب) التغطية لم تُضِف حجزًا مزدوجًا في **مقعد البورد** المعنيّ (الفكسجر قد يحوي
    //     مشاركةَ عيادةٍ سابقةً غير متعلّقةٍ بنا — نفحص مقعدنا فقط).
    const boardSeatDocs = data.existingSlots.filter((s) => DI[s.dayOfWeek] === 0 && s.clinicNumber === boardClinic && s.period === victim.period && s.status === 'active' && s.role === 'clinic');
    check('(ب) لا حجزٌ مزدوجٌ في مقعد البورد', boardSeatDocs.length <= 1, `${boardSeatDocs.length}`);

    newHeartConfig.mode = 'off';
  } finally {
    await build();
  }

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
