/* الخطوة ١: الاحتياطيّ الخاصّ (بورد/متدرّب) لا يُوضع تلقائيًّا — applyCoverage يُرجِعه
 * pending للسؤال. نزرع سيناريو محدّدًا (مقعد بورد شاغر + احتياطيّ بورد) ونتحقّق:
 *  (أ) الاحتياطيّ العاديّ (بِركة) لا يزال يُملأ تلقائيًّا (لا تراجع).
 *  (ب) احتياطيّ البورد → pending (لا وضع تلقائيّ، المقعد يبقى شاغرًا).
 *  (ج) الرفض (excludeReserveIds) = كأنّ الـEX فارغة → يُكمل عاديًّا (هنا: نقص، لا بورد).
 *  (د) placeReserveInSeat يضع المختار ويُزيل صفّ احتياطه. */
import { supabase } from '../lib/supabase';
import { loadScheduleData } from '../lib/algorithms/schedule';
import { applyCoverage, placeReserveInSeat } from '../lib/algorithms/solver_shadow';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };

const setCC = async (n: number) => { await supabase.from('schedule_settings').update({ clinic_count: n }).eq('clinic_id', CID); };
async function wipe() {
  // أسبوعٌ فارغٌ تمامًا — فمقاعدي المزروعة لا تقع على مقعدٍ مأهولٍ من بناءٍ سابق.
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
}
const ins = (row: Record<string, unknown>) => supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: W, day_of_week: 'thursday', ...row });
const activeAt = (slots: any[], c: number, p: number) => slots.find((s) => s.dayOfWeek === 'thursday' && s.clinicNumber === c && s.period === p && s.status === 'active' && s.role === 'clinic');

(async () => {
  const origCC = ((await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID).maybeSingle()).data as any)?.clinic_count ?? 3;
  try {
    await setCC(3); await wipe();
    const data0 = (await loadScheduleData(CID, W)).data!;
    const board = data0.doctors.filter((d) => d.groupTemplate.key === 'board');
    const pool = data0.doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty');
    if (board.length < 2 || pool.length < 2) { console.log('ℹ الفكسجر يفتقر بوردَين/بِركتين — تخطّي.'); return; }
    const [B1, B2] = board; const [P1, P2] = pool;

    // ── (أ) احتياطيّ بِركة عاديّ يُملأ تلقائيًّا: مقعد بِركة شاغر (P1) + احتياطيّ بِركة (P2).
    await wipe();
    await ins({ doctor_id: P1!.id, doctor_name: P1!.name, period: 1, clinic_number: 2, role: 'prev_placement', status: 'active' });
    await ins({ doctor_id: P2!.id, doctor_name: P2!.name, period: 0, clinic_number: 1, role: 'clinic', status: 'extra' });
    const rA = await applyCoverage({ clinicId: CID, weekStart: W, label: 't-normal' });
    const sA = (await loadScheduleData(CID, W)).data!.existingSlots;
    check('(أ) الاحتياطيّ العاديّ مُلئ تلقائيًّا (لا pending)', rA.filled === 1 && rA.pending.length === 0 && !!activeAt(sA, 2, 1), `filled=${rA.filled} pending=${rA.pending.length}`);

    // ── (ب) احتياطيّ بورد → pending، لا وضع تلقائيّ. مقعد بورد شاغر (B1) + احتياطيّ بورد (B2).
    await wipe();
    await ins({ doctor_id: B1!.id, doctor_name: B1!.name, period: 1, clinic_number: 1, role: 'prev_placement', status: 'active' });
    await ins({ doctor_id: B2!.id, doctor_name: B2!.name, period: 0, clinic_number: 1, role: 'clinic', status: 'extra' });
    const rB = await applyCoverage({ clinicId: CID, weekStart: W, label: 't-board' });
    const sB = (await loadScheduleData(CID, W)).data!.existingSlots;
    const pend = rB.pending.find((p) => p.scope === 'BOARD');
    check('(ب) احتياطيّ البورد → pending (لا وضع تلقائيّ)', !!pend && !activeAt(sB, 1, 1), `pending=${rB.pending.length} filled=${rB.filled}`);
    check('(ب) المرشّح في الـpending هو احتياطيّ البورد B2', !!pend && pend.candidateIds.includes(B2!.id), pend?.candidateIds.join(','));
    check('(ب) المقعد المسجَّل صحيح (عيادة 1 ف1)', !!pend && pend.clinicNumber === 1 && pend.period === 1);

    // ── (ج) الرفض = كأنّ الـEX فارغة. نفس الزرع، لكن نستبعد B2 → لا pending، يُكمل عاديًّا (نقص هنا).
    const rC = await applyCoverage({ clinicId: CID, weekStart: W, label: 't-decline' }, { specialReserves: 'exclude' });
    const sC = (await loadScheduleData(CID, W)).data!.existingSlots;
    check('(ج) الرفض: لا pending وأكمل عاديًّا (نقص، لا بورد تلقائيّ)', rC.pending.length === 0 && rC.shortages >= 1 && !activeAt(sC, 1, 1), `pending=${rC.pending.length} short=${rC.shortages}`);

    // ── (د) القبول: placeReserveInSeat يضع B2 ويُزيل صفّ احتياطه.
    const rD = await placeReserveInSeat({ clinicId: CID, weekStart: W, day: 'thursday', clinicNumber: 1, period: 1, doctorId: B2!.id });
    const sD = (await loadScheduleData(CID, W)).data!.existingSlots;
    const exGone = !sD.some((s) => s.dayOfWeek === 'thursday' && s.doctorId === B2!.id && s.status === 'extra');
    const placed = activeAt(sD, 1, 1);
    check('(د) القبول: B2 وُضع في المقعد', !!placed && placed.doctorId === B2!.id, placed?.doctorName);
    check('(د) أُزيل صفّ احتياط B2', exGone);
  } finally {
    await setCC(origCC); await wipe();
    const { schedule } = await import('../lib/algorithms/schedule');
    const pre = await loadScheduleData(CID, W);
    const tm: Record<string, any> = {}; for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
    const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
    const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning'])) as any;
    const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' }, includeInExRotation: false }, traineeModes: tm } as any;
    await schedule.build({ ...recipe, dryRun: false }); await schedule.saveBuildConfig({ ...recipe, dryRun: true });
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
