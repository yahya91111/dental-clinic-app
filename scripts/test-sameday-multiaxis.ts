/* يُغلق «الملاحظة الصادقة»: عدّة غياباتٍ **بيومٍ واحد** على **بياناتٍ حقيقيّة**، تضرب
 * محاور مختلفة معًا (دليقيتر + احتياط + فترات) — كما يحدث واقعًا. نتحقّق أنّ كلّ محورٍ
 * يُعالَج صحيحًا في اليوم نفسه. قراءةٌ فقط — لا يكتب حرفًا. */
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';
import { extractHeavySeats, extractReserveSeats, lastHeavyStamps, lastRestStamps, solveDisturbance, solveShiftPeriods } from '../lib/algorithms/solver';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };

async function main() {
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
  await schedule.build({ ...recipe, dryRun: false });
  await schedule.saveBuildConfig({ ...recipe, dryRun: true });
  const data = (await loadScheduleData(CID, W)).data!;
  const doctors = data.doctors;
  const nm = (id: string) => doctors.find((x) => x.id === id)?.name ?? id;
  const poolIds = new Set(doctors.filter((x) => x.groupTemplate.key !== 'board' && x.workStatus !== 'trainee' && x.workStatus !== 'light_duty').map((x) => x.id));

  // اليوم: الأحد صباحًا. نجمع كلّ خاناته (للفترات والاحتياط)، والدليقيتر.
  const day: WeekDay = 'sunday';
  const shiftSlots = data.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day] && [1, 2].includes(s.period));
  const exSlots = data.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day] && (s.status === 'extra' ? s.clinicNumber === 1 : [1, 2].includes(s.period)));

  const delSeats = extractHeavySeats(shiftSlots, poolIds);
  const exSeats = extractReserveSeats(exSlots, poolIds);
  const delHolder = delSeats.find((s) => s.kind === 'delegator')?.current;
  const exHolder = exSeats[0]?.current;
  const clinicDoctor = shiftSlots.find((s) => s.role === 'clinic' && poolIds.has(s.doctorId) && s.doctorId !== delHolder && s.doctorId !== exHolder)?.doctorId;

  console.log('عدّة غيابات يوم الأحد (محاور مختلفة):');
  console.log(`   دليقيتر: ${nm(delHolder ?? '—')} · احتياط: ${nm(exHolder ?? '—')} · عيادة: ${nm(clinicDoctor ?? '—')}`);

  // ① محور الدليقيتر: غياب شاغل الدليقيتر → تغطية.
  if (delHolder) {
    const prior = lastHeavyStamps(data.pastSlots);
    const adj = delSeats.map((s) => ({ ...s, eligible: s.eligible.filter((id) => id !== delHolder) }));
    const r = solveDisturbance(doctors, adj, prior, { absentIds: [delHolder] });
    console.log(`   ① الدليقيتر: ${r.assignments.map((a) => `${a.from}→${a.to}`).join('، ') || 'لا تغيير'}`);
    check('① الدليقيتر يُغطّى، لا يُسنَد للغائب', r.owedRespected && !r.assignments.some((a) => a.to === nm(delHolder)), '');
  }

  // ② محور الاحتياط: غياب شاغل الاحتياط نفس اليوم → إعادة قسمة الراحة.
  if (exHolder) {
    const rest = lastRestStamps(data.pastSlots);
    const adj = exSeats.map((s) => ({ ...s, eligible: s.eligible.filter((id) => id !== exHolder) }));
    const r = solveDisturbance(doctors, adj, rest, { absentIds: [exHolder] });
    console.log(`   ② الاحتياط: ${r.assignments.map((a) => `${a.from}→${a.to}`).join('، ') || 'لا تغيير'}`);
    check('② الاحتياط يُعاد، لا يُسنَد للغائب', r.owedRespected && !r.assignments.some((a) => a.to === nm(exHolder)), '');
  }

  // ③ محور الفترات: غياب طبيب عيادةٍ نفس اليوم → الميزان لا يسوء بعد إعادة القسمة.
  if (clinicDoctor) {
    const ctx = data.existingSlots.filter((s) => !(DI[s.dayOfWeek] === DI[day] && [1, 2].includes(s.period)));
    const remaining = shiftSlots.filter((s) => s.doctorId !== clinicDoctor);
    const r = solveShiftPeriods(doctors, ctx, remaining);
    console.log(`   ③ الفترات: |خلل| ${r.beforeAbsImbalance}→${r.afterAbsImbalance} (حفظ=${r.ledgerBalanced ? '✓' : '✗'})`);
    check('③ الفترات لا تسوء بعد غياب طبيب عيادة', r.afterAbsImbalance <= r.beforeAbsImbalance && r.ledgerBalanced, '');
  }

  check('عدّة غياباتٍ بيومٍ واحد عبر المحاور: كلٌّ عُولج صحيحًا', fail === 0, '');

  console.log(`\n════════ النتيجة: ${pass} PASS / ${fail} FAIL ════════`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
