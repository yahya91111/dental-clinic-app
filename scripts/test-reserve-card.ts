/* الخطوة ٢‑٥ (تكامل الكرت): سيناريو احتياطيّ بورد → applyCoverage يُرجِع pending →
 * notifyLeaderReserveChoice يُنشئ كرت gap_alert v2 (reserve_choice) للقائد. نتحقّق:
 *  (أ) صفّ إشعارٍ واحدٌ بالحمولة الصحيحة (مرشّح البورد + المقعد + اليوم).
 *  (ب) لا تكرار (نداءٌ ثانٍ يُرجِع نفس الكرت).
 *  (ج) القبول: placeReserveInSeat يضع المختار + resolveReserveChoiceV2 يُغلق الكرت. */
import { supabase } from '../lib/supabase';
import { loadScheduleData } from '../lib/algorithms/schedule';
import { applyCoverage, placeReserveInSeat } from '../lib/algorithms/solver_shadow';
import { notifications } from '../lib/algorithms/notifications';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };
const setCC = async (n: number) => { await supabase.from('schedule_settings').update({ clinic_count: n }).eq('clinic_id', CID); };
const wipe = () => supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
const ins = (row: Record<string, unknown>) => supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: W, day_of_week: 'thursday', ...row });

(async () => {
  const origCC = ((await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID).maybeSingle()).data as any)?.clinic_count ?? 3;
  let leaderId = '';
  try {
    await setCC(3); await wipe();
    const d0 = (await loadScheduleData(CID, W)).data!;
    const board = d0.doctors.filter((d) => d.groupTemplate.key === 'board');
    if (board.length < 2) { console.log('ℹ بوردان غير متوفّرَين — تخطّي.'); return; }
    const [B1, B2] = board;
    leaderId = d0.doctors[0]!.id; // متلقٍّ للكرت (يكفي للاختبار)
    await supabase.from('notifications').delete().eq('clinic_id', CID).eq('recipient_id', leaderId).eq('type', 'gap_alert');

    await ins({ doctor_id: B1!.id, doctor_name: B1!.name, period: 1, clinic_number: 1, role: 'prev_placement', status: 'active' });
    await ins({ doctor_id: B2!.id, doctor_name: B2!.name, period: 0, clinic_number: 1, role: 'clinic', status: 'extra' });

    const cov = await applyCoverage({ clinicId: CID, weekStart: W, label: 'card-test' });
    const pend = cov.pending.filter((p) => p.scope === 'BOARD');
    check('pending بورد موجود', pend.length >= 1, `${cov.pending.length}`);

    // محاكاة التوصيل: تجميع باليوم وبناء المرشّحين + إرسال الكرت.
    const seats = pend.map((e) => ({ clinicNumber: e.clinicNumber, period: e.period }));
    const candIds = [...new Set(pend.flatMap((e) => e.candidateIds))];
    const candidates = candIds.map((id) => ({ doctorId: id, doctorName: d0.doctors.find((x) => x.id === id)?.name ?? id, kind: 'board' as const }));
    const absentNames = [...new Set(pend.map((e) => e.absentName))];
    await notifications.notifyLeaderReserveChoice({ clinicId: CID, leaderId, weekStart: W, day: 'thursday', seats, candidates, absentNames });

    const q1 = await supabase.from('notifications').select('id, data, action_status').eq('clinic_id', CID).eq('recipient_id', leaderId).eq('type', 'gap_alert');
    const rows1 = (q1.data || []) as any[];
    check('(أ) كرتٌ واحد أُنشئ', rows1.length === 1, `${rows1.length}`);
    const rc = rows1[0]?.data?.reserve_choice;
    check('(أ) الحمولة reserve_choice صحيحة (اليوم/المقعد)', !!rc && rc.day === 'thursday' && rc.seats?.[0]?.clinic_number === 1 && rc.seats?.[0]?.period === 1, JSON.stringify(rc?.seats));
    check('(أ) المرشّح البورد B2 في الكرت', !!rc && rc.candidates?.some((c: any) => c.doctor_id === B2!.id && c.kind === 'board'), JSON.stringify(rc?.candidates));

    // (ب) لا تكرار.
    await notifications.notifyLeaderReserveChoice({ clinicId: CID, leaderId, weekStart: W, day: 'thursday', seats, candidates, absentNames });
    const q2 = await supabase.from('notifications').select('id').eq('clinic_id', CID).eq('recipient_id', leaderId).eq('type', 'gap_alert');
    check('(ب) لا تكرار — كرتٌ واحدٌ بعد النداء الثاني', (q2.data || []).length === 1, `${(q2.data || []).length}`);

    // (ج) القبول.
    const pr = await placeReserveInSeat({ clinicId: CID, weekStart: W, day: 'thursday', clinicNumber: 1, period: 1, doctorId: B2!.id });
    await notifications.resolveReserveChoiceV2({ clinicId: CID, weekStart: W, day: 'thursday' });
    const sD = (await loadScheduleData(CID, W)).data!.existingSlots;
    const placed = sD.find((s) => s.dayOfWeek === 'thursday' && s.clinicNumber === 1 && s.period === 1 && s.status === 'active' && s.role === 'clinic');
    const q3 = await supabase.from('notifications').select('action_status').eq('clinic_id', CID).eq('recipient_id', leaderId).eq('type', 'gap_alert');
    check('(ج) القبول: B2 وُضع', pr.success && !!placed && placed.doctorId === B2!.id, placed?.doctorName);
    check('(ج) الكرت أُغلق (accepted)', (q3.data || []).every((x: any) => x.action_status === 'accepted'), JSON.stringify(q3.data));
  } finally {
    if (leaderId) await supabase.from('notifications').delete().eq('clinic_id', CID).eq('recipient_id', leaderId).eq('type', 'gap_alert');
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
