/* تطبيقُ التغطية (كتابة) — بحيلة «عيادتان بنفس عدد الأطبّاء» (احتياطٌ وفيرٌ من البِركة).
 * نضبط clinic_count=2 مؤقّتًا، نبني، نمسح عن شفتٍ غنيٍّ بالبِركة (عيادة+احتياط)، نُغيّب
 * طبيب عيادةٍ مرضيًّا، ثمّ applyCoverage ونتحقّق:
 *  (أ) المقعد الشاغر صار مأهولًا ببديلٍ احتياطٍ حقيقيٍّ من البِركة، وليس الغائب.
 *  (ب) لا حجزٌ مزدوجٌ بنفس (عيادة/فترة).
 *  (ج) المغطّي لم يَعُد محتاطًا (أُزيل صفّ احتياطه).
 *  (د) idempotent: إعادة التطبيق = صفر.
 * (الغياب يبقى عبر إعادة البناء عمدًا — لا نفحص ذلك.) ونُعيد clinic_count كما كان. */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode, LoadedSlot } from '../lib/algorithms/schedule';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { applyCoverage } from '../lib/algorithms/solver_shadow';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };

const getCC = async (): Promise<number> => ((await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID).maybeSingle()).data as any)?.clinic_count ?? 3;
const setCC = async (n: number) => { await supabase.from('schedule_settings').update({ clinic_count: n }).eq('clinic_id', CID); };
async function build() {
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
  await schedule.build({ ...recipe, dryRun: false });
  await schedule.saveBuildConfig({ ...recipe, dryRun: true } as any);
}
const poolOf = (doctors: any[]) => new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));
const reservesOf = (slots: LoadedSlot[], day: WeekDay, exCol: number, pool: Set<string>) =>
  [...new Set(slots.filter((s) => DI[s.dayOfWeek] === DI[day] && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol).map((s) => s.doctorId))].filter((id) => pool.has(id));

(async () => {
  const original = await getCC();
  try {
    await setCC(2);
    await build();
    const { newHeartConfig } = await import('../lib/algorithms/new_heart_config');
    newHeartConfig.mode = 'apply'; newHeartConfig.clinics = null;

    let data = (await loadScheduleData(CID, W)).data!;
    const pool = poolOf(data.doctors);

    // امسح عن (يوم/نصف) فيه طبيب عيادةٍ + احتياطُ بِركة.
    let tgt: { day: WeekDay; half: 0 | 1; victim: LoadedSlot } | null = null;
    for (const day of DAYS) for (const half of [1, 0] as const) {
      const periods = half === 0 ? [1, 2] : [3, 4]; const exCol = half === 0 ? 1 : 2;
      const res = reservesOf(data.existingSlots, day, exCol, pool);
      const cds = data.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period) && s.status === 'active' && s.role === 'clinic' && pool.has(s.doctorId));
      if (res.length >= 1 && cds.length >= 1) { tgt = { day, half, victim: cds[0]! }; break; }
      if (tgt) break;
    }
    if (!tgt) { console.log('لا تكوينَ مناسبٍ حتى بعيادتين — تخطّي'); newHeartConfig.mode = 'off'; return; }

    const { day, half, victim } = tgt;
    const exCol = half === 0 ? 1 : 2;
    const shift: Shift = half === 0 ? 'morning' : 'evening';
    const reserves = reservesOf(data.existingSlots, day, exCol, pool);
    console.log(`الهدف: ${day}/${half === 0 ? 'ص' : 'م'} | الغائب ${victim.doctorName} (عيادة ${victim.clinicNumber} ف${victim.period}) | احتياط=${reserves.length}`);

    const actor = { id: data.doctors[0]!.id, role: 'super_admin' };
    const sres = await requestsV2.setScheduleStatus(actor, { clinicId: CID, weekStart: W, day, doctorId: victim.doctorId, doctorName: victim.doctorName, status: 'sick_leave', shift });
    check('غيابٌ سُجِّل', sres.success, (sres as any).error || '');

    const r1 = await applyCoverage({ clinicId: CID, weekStart: W, label: 'test' });
    console.log(`     طُبّق: filled=${r1.filled} shortages=${r1.shortages}`);
    check('تغطيةٌ طُبّقت', r1.filled >= 1, `${r1.filled}`);

    data = (await loadScheduleData(CID, W)).data!;
    const periods = half === 0 ? [1, 2] : [3, 4];
    const seatNow = data.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day] && s.clinicNumber === victim.clinicNumber && s.period === victim.period && s.status === 'active' && s.role === 'clinic');
    check('(أ) المقعد الشاغر صار مأهولًا', seatNow.length === 1, `${seatNow.length}`);
    check('(أ) المغطّي احتياطٌ حقيقيٌّ من البِركة', seatNow.length === 1 && reserves.includes(seatNow[0]!.doctorId), seatNow[0]?.doctorName);
    check('(أ) المغطّي ليس الغائب', seatNow.every((s) => s.doctorId !== victim.doctorId));

    const seen = new Set<string>(); let dbl = false;
    for (const s of data.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period) && s.status === 'active' && s.role === 'clinic')) {
      const k = `${s.clinicNumber}#${s.period}`; if (seen.has(k)) dbl = true; seen.add(k);
    }
    check('(ب) لا حجزٌ مزدوجٌ بنفس عيادة/فترة', !dbl);

    const stillReserve = data.existingSlots.some((s) => DI[s.dayOfWeek] === DI[day] && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol && s.doctorId === seatNow[0]?.doctorId);
    check('(ج) المغطّي أُزيل من الاحتياط', !stillReserve);

    const r2 = await applyCoverage({ clinicId: CID, weekStart: W, label: 'test' });
    check('(د) idempotent: إعادة التطبيق = صفر', r2.filled === 0, `${r2.filled}`);

    newHeartConfig.mode = 'off';
  } finally {
    await setCC(original);
    await build();
  }

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
