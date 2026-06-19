/* عرضٌ مقروء: القلبان جنبًا إلى جنبٍ على **حدثٍ واحد** (طبيب يغيب) — دون كتابة.
 * القديم: redistributeShift (جافّ). الجديد: solveDisturbance. نطبع قرار كلٍّ. */
import { loadScheduleData, schedule, redistributeShift } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';
import { extractHeavySeats, lastHeavyStamps, solveDisturbance } from '../lib/algorithms/solver';
import type { HeavySeat } from '../lib/algorithms/solver';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };

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
  const nm = (id: string) => doctors.find((d) => d.id === id)?.name ?? id;
  const poolIds = new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));

  // الحدث: نختار شفتًا به دليقيتر، ونُغيّب شاغله.
  const day: WeekDay = 'tuesday'; const periods = [1, 2];
  const shiftSlots = data.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period));
  const seats = extractHeavySeats(shiftSlots, poolIds);
  const victim = seats.find((s) => s.kind === 'delegator')?.current;
  if (!victim) { console.log('لا دليقيتر في الشفت — جرّب يومًا آخر.'); process.exit(0); }

  console.log('════════════════════════════════════════════════════');
  console.log(`الحدث: غياب ${nm(victim)} يوم الثلاثاء (صباحًا)`);
  console.log('════════════════════════════════════════════════════\n');

  // ── القلب القديم: إعادة توزيع الشفت (جافّ) ──
  const old = await redistributeShift({ clinicId: CID, weekStart: W, day, shift: 'morning', simulateAbsences: [{ doctorId: victim, day, scope: 'full' }] });
  console.log('🔵 القلب القديم (العجلة) — يعيد توزيع الشفت كاملًا:');
  if (old.success) {
    const del = old.slots.filter((s) => s.role === 'delegator');
    console.log(`   الدليقيتر بعد إعادة التوزيع: ${del.map((s) => s.doctor.name).join('، ') || '—'}`);
    console.log(`   (يعيد حساب الشفت كلّه من الوصفة)`);
  } else console.log('   تعذّر:', old.error);

  // ── القلب الجديد: حلّالٌ مُوجَّه بالحدث (أقلّ لمس) ──
  const prior = lastHeavyStamps(data.pastSlots);
  const adj: HeavySeat[] = seats.map((s) => ({ ...s, eligible: s.eligible.filter((id) => id !== victim) }));
  const rec = solveDisturbance(doctors, adj, prior, { absentIds: [victim] });
  console.log('\n🟢 القلب الجديد (الحلّال) — يلمس ما تأثّر فقط:');
  if (rec.assignments.length === 0) console.log('   لا تغيير لازم.');
  for (const a of rec.assignments) console.log(`   ${a.from} ← يتولّاها → ${a.to}`);
  console.log(`   عدد اللمسات: ${rec.assignments.length} · الأهليّة محترمة: ${rec.owedRespected ? '✓' : '✗'}`);

  console.log('\n────────────────────────────────────────────────────');
  console.log('الفرق: القديم يعيد بناء الشفت كاملًا؛ الجديد يحرّك أقلّ ما يلزم — وكلاهما عادل.');
  console.log('(كلاهما هنا في الظلّ — لم يُكتب شيء في الجدول.)');
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
