/* ب١: مساران بالكود لكرت «تغطية نقص — قرارك» (بلا ذكاء) — يستعملهما زرّا الكرت:
 *  (أ) placeReserveByCode(closeCard:true): يضع المرشّح في المقعد ويُغلق الكرت.
 *  (ب) declineReserveChoiceByCode: «لا أحد» — يُكمل المحرّك بلا الاحتياطيّ ويُغلق الكرت.
 * نبني نفس سيناريو البورد في test-reserve-card (prev_placement + احتياط بورد). */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import { applyCoverage } from '../lib/algorithms/solver_shadow';
import { notifications } from '../lib/algorithms/notifications';
import { placeReserveByCode, declineReserveChoiceByCode } from '../lib/ai_v2/tools_requests_v2';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };
const setCC = async (n: number) => { await supabase.from('schedule_settings').update({ clinic_count: n }).eq('clinic_id', CID); };
const wipe = () => supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
const ins = (row: Record<string, unknown>) => supabase.from('schedule_slots').insert({ clinic_id: CID, week_start: W, day_of_week: 'thursday', ...row });

async function setupGapAndCard(leaderId: string) {
  await wipe();
  const d0 = (await loadScheduleData(CID, W)).data!;
  const board = d0.doctors.filter((d) => d.groupTemplate.key === 'board');
  const [B1, B2] = board;
  await supabase.from('notifications').delete().eq('clinic_id', CID).eq('recipient_id', leaderId).eq('type', 'gap_alert');
  await ins({ doctor_id: B1!.id, doctor_name: B1!.name, period: 1, clinic_number: 1, role: 'prev_placement', status: 'active' });
  await ins({ doctor_id: B2!.id, doctor_name: B2!.name, period: 0, clinic_number: 1, role: 'clinic', status: 'extra' });
  const cov = await applyCoverage({ clinicId: CID, weekStart: W, label: 'bycode-test' });
  const pend = cov.pending.filter((p) => p.scope === 'BOARD');
  const seats = pend.map((e) => ({ clinicNumber: e.clinicNumber, period: e.period }));
  const candIds = [...new Set(pend.flatMap((e) => e.candidateIds))];
  const candidates = candIds.map((id) => ({ doctorId: id, doctorName: d0.doctors.find((x) => x.id === id)?.name ?? id, kind: 'board' as const }));
  await notifications.notifyLeaderReserveChoice({ clinicId: CID, leaderId, weekStart: W, day: 'thursday', seats, candidates, absentNames: [...new Set(pend.map((e) => e.absentName))] });
  return { B2: B2! };
}
const cardStatuses = async (leaderId: string) =>
  ((await supabase.from('notifications').select('action_status').eq('clinic_id', CID).eq('recipient_id', leaderId).eq('type', 'gap_alert')).data || []) as { action_status: string | null }[];

(async () => {
  const origCC = ((await supabase.from('schedule_settings').select('clinic_count').eq('clinic_id', CID).maybeSingle()).data as any)?.clinic_count ?? 3;
  let leaderId = '';
  try {
    await setCC(3);
    const d0 = (await loadScheduleData(CID, W)).data!;
    if (d0.doctors.filter((d) => d.groupTemplate.key === 'board').length < 2) { console.log('ℹ بوردان غير متوفّرَين — تخطّي.'); return; }
    leaderId = d0.doctors[0]!.id;

    // ── (أ) placeReserveByCode ──────────────────────────────────
    const { B2 } = await setupGapAndCard(leaderId);
    const r1 = await placeReserveByCode({ clinicId: CID, weekStart: W, day: 'thursday', clinicNumber: 1, period: 1, doctorId: B2.id, closeCard: true });
    check('(أ) placeReserveByCode نجح', r1.success, r1.error || '');
    const placed = (await loadScheduleData(CID, W)).data!.existingSlots.find((s) => s.dayOfWeek === 'thursday' && s.clinicNumber === 1 && s.period === 1 && s.status === 'active' && s.role === 'clinic');
    check('(أ) المرشّح B2 وُضع في المقعد', !!placed && placed.doctorId === B2.id, placed?.doctorName);
    check('(أ) الكرت أُغلق (closeCard)', (await cardStatuses(leaderId)).every((x) => x.action_status === 'accepted'), '');

    // ── (ب) declineReserveChoiceByCode ─────────────────────────
    await setupGapAndCard(leaderId);
    const r2 = await declineReserveChoiceByCode({ clinicId: CID, weekStart: W, day: 'thursday' });
    check('(ب) declineReserveChoiceByCode نجح', r2.success, r2.error || '');
    check('(ب) الكرت أُغلق بعد «لا أحد»', (await cardStatuses(leaderId)).every((x) => x.action_status === 'accepted'), '');
  } finally {
    if (leaderId) await supabase.from('notifications').delete().eq('clinic_id', CID).eq('recipient_id', leaderId).eq('type', 'gap_alert');
    await setCC(origCC); await wipe();
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
