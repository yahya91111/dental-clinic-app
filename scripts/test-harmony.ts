/* تناسقُ البناء مع القلب الجديد: غيابٌ في الأسبوع الأوّل يُغطّيه القلب الجديد (R يغطّي
 * مكان X) → نبني الأسبوع الثاني → نتحقّق:
 *  (أ) الكتابة صحيحة: مقعد X مأهولٌ بـR، وX مسجّلٌ غائبًا (استراح)، وR عمل (لا احتياط له).
 *  (ب) التاريخ يسجّل الدَّين: lastRestStamps يُظهر X استراح ذلك الشفت، وR لم يَستَرِح فيه
 *      → R أحقُّ بالراحة من X داخلًا للأسبوع الثاني.
 *  (ج) البناء يتناسق: بناءُ الأسبوع الثاني ينجح ويقرأ تاريخ الأوّل (لا انهيار، صالح).
 * (clinic_count=2 لاحتياطٍ وفير.) */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode, LoadedSlot } from '../lib/algorithms/schedule';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { applyCoverage } from '../lib/algorithms/solver_shadow';
import { lastRestStamps } from '../lib/algorithms/solver';

const CID = '10000000-0000-0000-0000-000000000001';
const W1 = '2099-01-04'; const W2 = '2099-01-11';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };

const getCC = async (): Promise<number> => ((await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID).maybeSingle()).data as any)?.clinic_count ?? 3;
const setCC = async (n: number) => { await supabase.from('schedule_settings').update({ clinic_count: n }).eq('clinic_id', CID); };
async function cleanWeek(W: string) {
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).in('status', ['sick_leave', 'vacation']);
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).eq('role', 'prev_placement');
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).eq('source', 'request');
}
async function build(W: string) {
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
  await schedule.build({ ...recipe, dryRun: false });
  await schedule.saveBuildConfig({ ...recipe, dryRun: true } as any);
}
const poolOf = (doctors: any[]) => new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));

(async () => {
  const original = await getCC();
  try {
    await setCC(2);
    await cleanWeek(W1); await build(W1);
    await cleanWeek(W2); await build(W2);

    let d1 = (await loadScheduleData(CID, W1)).data!;
    const pool = poolOf(d1.doctors);
    // شفتٌ غنيٌّ بالاحتياط + ضحيّةُ عيادة.
    let tgt: { day: WeekDay; half: 0 | 1; victim: LoadedSlot } | null = null;
    for (const day of DAYS) for (const half of [1, 0] as const) {
      const periods = half === 0 ? [1, 2] : [3, 4]; const exCol = half === 0 ? 1 : 2;
      const res = [...new Set(d1.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day] && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol).map((s) => s.doctorId))].filter((id) => pool.has(id));
      const cds = d1.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period) && s.status === 'active' && s.role === 'clinic' && pool.has(s.doctorId));
      if (res.length && cds[0]) { tgt = { day, half, victim: cds[0] }; break; }
      if (tgt) break;
    }
    if (!tgt) { console.log('لا هدفَ مناسب — تخطّي'); return; }
    const { day, half, victim } = tgt; const X = victim.doctorId;
    const shift: Shift = half === 0 ? 'morning' : 'evening';
    console.log(`الأسبوع ١: الغائب X=${victim.doctorName} (عيادة ${victim.clinicNumber} ف${victim.period} ${day})`);

    // غياب X + تغطية القلب الجديد.
    await requestsV2.setScheduleStatus({ id: d1.doctors[0]!.id, role: 'super_admin' }, { clinicId: CID, weekStart: W1, day, doctorId: X, doctorName: victim.doctorName, status: 'sick_leave', shift });
    await applyCoverage({ clinicId: CID, weekStart: W1, label: 'harmony' });

    d1 = (await loadScheduleData(CID, W1)).data!;
    // R = مَن يشغل مقعد X الآن.
    const seat = d1.existingSlots.find((s) => DI[s.dayOfWeek] === DI[day] && s.clinicNumber === victim.clinicNumber && s.period === victim.period && s.status === 'active' && s.role === 'clinic' && s.doctorId !== X);
    check('(أ) مقعد X مأهولٌ ببديلٍ R', !!seat, 'لا بديل');
    if (!seat) { throw new Error('no coverer'); }
    const R = seat.doctorId; const rName = d1.doctors.find((x) => x.id === R)?.name ?? R;
    console.log(`     غطّى R=${rName}`);
    check('(أ) X مسجّلٌ غائبًا (استراح)', d1.existingSlots.some((s) => s.doctorId === X && (s.status === 'sick_leave' || (s.role as string) === 'prev_placement')));
    check('(أ) R عمل (خانة عيادة) ولا احتياطَ له ذلك الشفت', !d1.existingSlots.some((s) => s.doctorId === R && DI[s.dayOfWeek] === DI[day] && s.status === 'extra' && s.period === 0));

    // (ب) التاريخ يسجّل الدَّين.
    const rest1 = lastRestStamps(d1.existingSlots);
    const xRest = rest1.get(X); const rRest = rest1.get(R);
    console.log(`     آخر راحة — X(الغائب)=${xRest ?? 'لا شيء'} | R(المغطّي)=${rRest ?? 'لا شيء'}`);
    check('(ب) X سُجّل أنّه استراح (غياب=راحة)', !!xRest);
    check('(ب) R أحقُّ بالراحة من X (استراح أقدمَ أو لم يَستَرِح)', rRest === undefined || (xRest !== undefined && rRest < xRest), `X=${xRest} R=${rRest}`);

    // (ج) بناء الأسبوع الثاني يقرأ تاريخ الأوّل ويتناسق.
    let threw = false;
    try { await build(W2); } catch { threw = true; }
    check('(ج) بناء الأسبوع الثاني لا ينهار', !threw);
    const d2 = (await loadScheduleData(CID, W2)).data!;
    // صالح: لا طبيبٌ في خانتين بنفس الفترة (الظلّ طبيبٌ آخر — مسموح).
    let dbl = false;
    for (const dy of DAYS) for (const h of [[1, 2], [3, 4]]) { const seen = new Set<string>(); for (const s of d2.existingSlots.filter((s) => DI[s.dayOfWeek] === DI[dy] && h.includes(s.period) && s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator'))) { const k = `${s.doctorId}|${s.period}`; if (seen.has(k)) dbl = true; seen.add(k); } }
    check('(ج) الأسبوع الثاني صالح (لا طبيبٌ مكرّرٌ بنفس الفترة)', !dbl);
    // قرأ تاريخ الأوّل: pastSlots للأسبوع الثاني تضمّ خانات الأوّل (شاملةً التغطية).
    const reads = d2.pastSlots.some((s) => s.weekStart === W1 && s.doctorId === R && DI[s.dayOfWeek] === DI[day]);
    check('(ج) البناء قرأ عملَ R في الأسبوع الأوّل (التاريخ متّصل)', reads);
  } finally {
    await setCC(original);
    await cleanWeek(W1); await build(W1);
    await cleanWeek(W2); await build(W2);
  }

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
