/* قفلُ الماضي: امتصاصُ الاحتياطيّ لا يمسُّ يومًا مضى وانتهى، ويُصلّحُ المستقبلَ فقط.
 * نبني ٣ أسابيع (2099)، today=الأربعاء، نُفسِد الاثنين (ماضٍ) والخميس (مستقبل)، نُشغّل
 * الامتصاص: الاثنين يبقى كما أفسدناه، والخميس يُصلَح. أسبوعٌ وهميّ + تنظيف + بلا إشعارات. */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule, WEEK_DAYS } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, LoadedSlot } from '../lib/algorithms/schedule';
import { lastRestStamps } from '../lib/algorithms/solver';
import { applyReserveAbsorption } from '../lib/algorithms/solver_shadow';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEKS = ['2099-01-04', '2099-01-11', '2099-01-18'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };
const isoPlus = (weekStart: string, days: number) => new Date(Date.parse(weekStart) + days * 86400000).toISOString().slice(0, 10);

async function buildWeek(w: string) {
  const pre = await loadScheduleData(CID, w);
  const tm: Record<string, 'beginner'> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(WEEK_DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: w, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
  await schedule.build({ ...recipe, dryRun: false } as Parameters<typeof schedule.build>[0]);
  await schedule.saveBuildConfig({ ...recipe, dryRun: true } as Parameters<typeof schedule.saveBuildConfig>[0]);
}

// أفسِد شفتًا صباحيًّا: أعطِ الاحتياطَ لأقلِّ استحقاقٍ (عاملُ عيادة) وأنزِل المحتاطَ للعيادة.
// يُرجِع بصمةَ خانةِ الاحتياطِ بعد الإفساد (لِنقارن). null إن لم يوجد شفتٌ صالح.
async function corruptMorning(W: string, dayIdx: number, slots: LoadedSlot[], rest: Map<string, string>,
  poolIds: Set<string>, groupOf: Map<string, string>, supIds: Set<string>, nameById: Map<string, string>) {
  const periods = [1, 2];
  const ss = slots.filter((s) => DI[s.dayOfWeek] === dayIdx &&
    ((s.status === 'active' && s.role === 'clinic' && periods.includes(s.period)) || (s.status === 'extra' && s.period === 0 && s.clinicNumber === 1)));
  const rez = ss.filter((s) => s.status === 'extra' && poolIds.has(s.doctorId) && !supIds.has(s.doctorId));
  for (const rslot of rez) {
    const R = rslot.doctorId; const g = groupOf.get(R);
    const workers = [...new Set(ss.filter((s) => s.status === 'active' && s.role === 'clinic' && groupOf.get(s.doctorId) === g && poolIds.has(s.doctorId) && !supIds.has(s.doctorId)).map((s) => s.doctorId))];
    const Wd = workers.find((w) => !ss.some((s) => s.status === 'extra' && s.doctorId === w) && (rest.get(w) ?? '') >= (rest.get(R) ?? '') && w !== R);
    if (!Wd) continue;
    const rEx = ss.filter((s) => s.doctorId === R && s.status === 'extra');
    const wCl = ss.filter((s) => s.doctorId === Wd && s.status === 'active' && s.role === 'clinic');
    await supabase.from('schedule_slots').update({ doctor_id: Wd, doctor_name: nameById.get(Wd) }).in('id', rEx.map((r) => r.id));
    await supabase.from('schedule_slots').update({ doctor_id: R, doctor_name: nameById.get(R) }).in('id', wCl.map((r) => r.id));
    return { holder: Wd }; // مَن يحملُ الاحتياطَ بعد الإفساد
  }
  return null;
}

const exHolder = (slots: LoadedSlot[], dayIdx: number) =>
  slots.filter((s) => DI[s.dayOfWeek] === dayIdx && s.status === 'extra' && s.period === 0 && s.clinicNumber === 1).map((s) => s.doctorId).sort();

(async () => {
  try {
    for (const w of WEEKS) await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', w);
    for (const w of WEEKS) await buildWeek(w);
    const W = WEEKS[2]!;
    const today = isoPlus(W, 3); // الأربعاء (idx=3) — يقفل الأحد/الاثنين/الثلاثاء
    console.log(`weekStart=${W} · today=${today} (الأربعاء)`);

    const d3 = (await loadScheduleData(CID, W)).data!;
    const doctors = d3.doctors;
    const poolIds = new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));
    const groupOf = new Map(doctors.map((d) => [d.id, d.groupTemplate.key]));
    const supIds = new Set(doctors.filter((d) => d.workStatus === 'trainee' && d.supervisorDoctorId).map((d) => d.supervisorDoctorId as string));
    const nameById = new Map(doctors.map((d) => [d.id, d.name]));
    const rest = lastRestStamps(d3.pastSlots);

    const s0 = d3.existingSlots;
    const cM = await corruptMorning(W, 1, s0, rest, poolIds, groupOf, supIds, nameById); // الاثنين = ماضٍ
    const cT = await corruptMorning(W, 4, s0, rest, poolIds, groupOf, supIds, nameById); // الخميس = مستقبل
    check('وُجد شفتٌ صالحٌ للإفساد في الاثنين (ماضٍ)', !!cM, 'لم يوجد');
    check('وُجد شفتٌ صالحٌ للإفساد في الخميس (مستقبل)', !!cT, 'لم يوجد');
    if (!cM || !cT) throw new Error('no target');

    const monBefore = exHolder((await loadScheduleData(CID, W)).data!.existingSlots, 1);
    const thuBefore = exHolder((await loadScheduleData(CID, W)).data!.existingSlots, 4);

    // شغّل الامتصاص مع today=الأربعاء
    const r = await applyReserveAbsorption({ clinicId: CID, weekStart: W, label: 'اختبار-قفل', today });
    console.log(`   تطبيقاتُ الامتصاص: ${r.applied}`);

    const after = (await loadScheduleData(CID, W)).data!.existingSlots;
    const monAfter = exHolder(after, 1);
    const thuAfter = exHolder(after, 4);

    check('(الماضي) الاثنين لم يُمَسّ رغمَ الإفساد', JSON.stringify(monBefore) === JSON.stringify(monAfter), `${monBefore} → ${monAfter}`);
    check('(المستقبل) الخميس تحرّك (أُصلِح)', JSON.stringify(thuBefore) !== JSON.stringify(thuAfter), `${thuBefore} → ${thuAfter} (لم يتحرّك)`);
  } catch (e) {
    console.error('ERR', (e as Error).message, (e as Error).stack); fail++;
  } finally {
    for (const w of WEEKS) { try { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', w); } catch { /* */ } }
    console.log('   نظّفتُ أسابيع 2099.');
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})();
