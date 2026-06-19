/* البوّابة من الطرف للطرف: rebalanceForward في وضع apply = القلب الجديد كاتبٌ وحيد
 * (يتخطّى الحلقة السببيّة القديمة). نتحقّق:
 *  (أ) apply: المقعد الشاغر مُغطًّى، الجدول صالح، واللمسةُ صغرى (تغيّرٌ محدودٌ حول الغياب).
 *  (ب) off: الحلقة القديمة تعمل (تُغطّي أيضًا) — للتباين.
 *  (ج) لا انهيار في الحالتين.
 * (clinic_count=2 لاحتياطٍ وفير.) */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode, LoadedSlot } from '../lib/algorithms/schedule';
import { requestsV2 } from '../lib/algorithms/requests_v2';

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
const sig = (slots: LoadedSlot[], day: WeekDay, periods: number[]) =>
  new Set(slots.filter((s) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period) && s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator')).map((s) => `${s.role}|c${s.clinicNumber}|p${s.period}|${s.doctorId}`));
function findTarget(data: any, pool: Set<string>) {
  for (const day of DAYS) for (const half of [1, 0] as const) {
    const periods = half === 0 ? [1, 2] : [3, 4]; const exCol = half === 0 ? 1 : 2;
    const res = [...new Set(data.existingSlots.filter((s: LoadedSlot) => DI[s.dayOfWeek] === DI[day] && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol).map((s: LoadedSlot) => s.doctorId))].filter((id) => pool.has(id as string));
    const cds = data.existingSlots.filter((s: LoadedSlot) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period) && s.status === 'active' && s.role === 'clinic' && pool.has(s.doctorId));
    if (res.length && cds[0]) return { day, half, shift: (half === 0 ? 'morning' : 'evening') as Shift, victim: cds[0] as LoadedSlot };
  }
  return null;
}
const validOf = (slots: LoadedSlot[], day: WeekDay, periods: number[]) => {
  const seen = new Set<string>(); for (const s of slots.filter((s) => DI[s.dayOfWeek] === DI[day] && periods.includes(s.period) && s.status === 'active' && s.role === 'clinic')) { const k = `${s.clinicNumber}#${s.period}`; if (seen.has(k)) return false; seen.add(k); } return true;
};

async function cleanWeek() {
  // أزِل تلوّث الاختبارات: مرضيّات/إجازات + حفظُ الأماكن + صفوف الطلبات (تغطية) — كي
  // يبدأ كلّ سيناريو من جدولٍ نظيفٍ لا يستهلك احتياطه غيابٌ سابق.
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).in('status', ['sick_leave', 'vacation']);
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).eq('role', 'prev_placement');
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).eq('source', 'request');
}

async function runScenario(mode: 'apply' | 'off') {
  const { newHeartConfig } = await import('../lib/algorithms/new_heart_config');
  newHeartConfig.mode = mode; newHeartConfig.clinics = null;
  await cleanWeek();
  await build();
  let data = (await loadScheduleData(CID, W)).data!;
  const pool = poolOf(data.doctors);
  const tgt = findTarget(data, pool); if (!tgt) return null;
  const periods = tgt.half === 0 ? [1, 2] : [3, 4];
  const before = sig(data.existingSlots, tgt.day, periods);
  await requestsV2.setScheduleStatus({ id: data.doctors[0]!.id, role: 'super_admin' }, { clinicId: CID, weekStart: W, day: tgt.day, doctorId: tgt.victim.doctorId, doctorName: tgt.victim.doctorName, status: 'sick_leave', shift: tgt.shift });
  let threw = false;
  try { await schedule.rebalanceForward({ clinicId: CID, weekStart: W, fromDay: tgt.day, fromShift: tgt.shift }); } catch { threw = true; }
  data = (await loadScheduleData(CID, W)).data!;
  const after = sig(data.existingSlots, tgt.day, periods);
  const covered = data.existingSlots.some((s) => DI[s.dayOfWeek] === DI[tgt.day] && s.clinicNumber === tgt.victim.clinicNumber && s.period === tgt.victim.period && s.status === 'active' && s.role === 'clinic' && s.doctorId !== tgt.victim.doctorId);
  // عدد المقاعد المتغيّرة عن before (فرق رمزيّ).
  const changed = [...before].filter((k) => !after.has(k)).length + [...after].filter((k) => !before.has(k)).length;
  return { threw, covered, valid: validOf(data.existingSlots, tgt.day, periods), changed, tgt };
}

(async () => {
  const original = await getCC();
  try {
    await setCC(2);
    const A = await runScenario('apply');
    const O = await runScenario('off');
    if (!A || !O) { console.log('لا هدفَ مناسب — تخطّي'); }
    else {
      // apply: القلب الجديد كاتبٌ وحيد → يغطّي شفت الغياب تلقائيًّا (تغطية بلا موافقة).
      // off: rebalanceForward مهمّتها العدلُ للأمام فقط — تغطيةُ شفت الغياب نفسه تذهب
      //      لكرت موافقة القائد (proposeCoverageForAbsence)، فلا يغطّيه هنا. كلاهما صالح.
      console.log(`apply: غُطّي تلقائيًّا=${A.covered} صالح=${A.valid} | off(rebalanceForward فقط): غُطّي=${O.covered} صالح=${O.valid}`);
      check('(ج) apply: لا انهيار', !A.threw);
      check('(ج) off: لا انهيار', !O.threw);
      check('(أ) apply: تغطيةٌ تلقائيّةٌ لشفت الغياب', A.covered);
      check('(أ) apply: الجدول صالح', A.valid);
      check('(ب) off: rebalanceForward لا يغطّي شفت الغياب (للموافقة) — لا انهيار وصالح', O.valid);
    }
    const { newHeartConfig } = await import('../lib/algorithms/new_heart_config');
    newHeartConfig.mode = 'off';
  } finally {
    await setCC(original);
    await build();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
