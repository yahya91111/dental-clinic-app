/* إشعار الظلّ عند تغيّر مكان مدرّبه — طبقة الفرق (withSeatChangeDiff).
 *  (أ) ينتقل المدرّب (تبديلٌ إلى عيادةٍ أخرى) → الظلّ يتبعه ويصله كرت seat_change
 *      موسومٌ supervisor_moved=المدرّب، ونصُّه يذكر «تبِعتَ مدرّبك»؛ المدرّب يصله كرتُه
 *      الخاصّ **بلا** supervisor_moved، والشريك المُبدَّل كذلك.
 *  (ب) لو كان المدرّبُ هو الفاعلَ المكتومَ (suppress يومه) فلا يصله كرتٌ ليومه، لكنّ
 *      الظلَّ ما زال يصله كرتٌ موسومٌ بأنّه تبِع مدرّبه. */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import { withSeatChangeDiff, swapFullPositions } from '../lib/algorithms/requests_v2';
import { getAllGroupMembers } from '../lib/database';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };

async function buildWeek() {
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, 'beginner'> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning'])) as Record<string, 'morning'>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' }, includeInExRotation: false }, traineeModes: tm } as Parameters<typeof schedule.build>[0];
  await schedule.build({ ...recipe, dryRun: false });
}
const wipe = () => supabase.from('notifications').delete().eq('clinic_id', CID).eq('type', 'seat_change');
type Found = { day: string; supId: string; supName: string; shId: string; shName: string; partnerId: string };

async function findCase(): Promise<Found | null> {
  const d = (await loadScheduleData(CID, W)).data!;
  const { data: mem } = await getAllGroupMembers(CID);
  const members = (mem || []) as { doctor_id: string; doctor_name: string; work_status?: string; supervisor_doctor_id?: string | null }[];
  const shadows = members.filter((m) => m.work_status === 'trainee' && m.supervisor_doctor_id);
  const slots = d.existingSlots;
  const dayRows = (day: string) => slots.filter((s) => s.dayOfWeek === day && s.status === 'active' && s.role === 'clinic' && s.period > 0);
  for (const day of ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday']) {
    const rows = dayRows(day);
    for (const sh of shadows) {
      const supId = sh.supervisor_doctor_id!;
      const shRows = rows.filter((r) => r.doctorId === sh.doctor_id);
      const supRows = rows.filter((r) => r.doctorId === supId);
      if (!shRows.length || !supRows.length) continue;
      const supClinic = supRows[0]!.clinicNumber;
      if (shRows[0]!.clinicNumber !== supClinic) continue;
      const partner = rows.find((r) => r.clinicNumber !== supClinic && r.doctorId !== supId && r.doctorId !== sh.doctor_id && !shadows.some((s) => s.doctor_id === r.doctorId));
      if (!partner) continue;
      return { day, supId, supName: members.find((x) => x.doctor_id === supId)?.doctor_name || supId, shId: sh.doctor_id, shName: sh.doctor_name, partnerId: partner.doctorId };
    }
  }
  return null;
}
const cardsNow = async () => (await supabase.from('notifications').select('recipient_id, body, data').eq('clinic_id', CID).eq('type', 'seat_change')).data as { recipient_id: string; body: string; data: any }[] || [];

(async () => {
  try {
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildWeek();
    const f = await findCase();
    if (!f) { console.log('ℹ لا ظلٌّ مع مدرّبه في عيادةٍ واحدة + شريكٌ في أخرى — تخطّي.'); console.log('\n0 PASS / 0 FAIL'); process.exit(0); }
    console.log(`الحالة: [${f.day}] مدرّب=${f.supName} ↔ شريك | ظلّ=${f.shName}`);
    const sender = (await loadScheduleData(CID, W)).data!.doctors.find((x) => x.id !== f.supId && x.id !== f.shId && x.id !== f.partnerId)!.id;
    const doSwap = () => swapFullPositions({ id: sender, role: 'team_leader' }, { clinicId: CID, weekStart: W, day: f.day as any, aId: f.supId, bId: f.partnerId });

    // ── (أ) المدرّب ليس الفاعلَ المكتوم ──────────────────────────
    await wipe();
    await withSeatChangeDiff({ clinicId: CID, weekStart: W, senderId: sender, senderName: 'مُختبِر' }, doSwap);
    let cards = await cardsNow();
    const shCard = cards.find((c) => c.recipient_id === f.shId);
    const supCard = cards.find((c) => c.recipient_id === f.supId);
    const pCard = cards.find((c) => c.recipient_id === f.partnerId);
    check('(أ) الظلّ وصله كرت seat_change', !!shCard, `cards=${cards.length}`);
    check('(أ) كرت الظلّ موسومٌ supervisor_moved=المدرّب', shCard?.data?.supervisor_moved?.id === f.supId, JSON.stringify(shCard?.data?.supervisor_moved));
    check('(أ) نصُّ كرت الظلّ يذكر «تبِعتَ مدرّبك»', !!shCard && /تبِعتَ مدرّبك/.test(shCard.body), shCard?.body);
    check('(أ) المدرّب وصله كرتُه الخاصّ', !!supCard, '');
    check('(أ) كرت المدرّب بلا supervisor_moved', !!supCard && !supCard.data?.supervisor_moved, JSON.stringify(supCard?.data?.supervisor_moved));
    check('(أ) كرت الشريك بلا supervisor_moved', !pCard || !pCard.data?.supervisor_moved, JSON.stringify(pCard?.data?.supervisor_moved));

    // أعِد الجدول ثمّ كرّر الحالة (ب)
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildWeek();

    // ── (ب) المدرّب هو الفاعلُ المكتوم (suppress يومه) ───────────
    await wipe();
    const suppress = new Set([`${f.supId}|${W}|${f.day}`]);
    await withSeatChangeDiff({ clinicId: CID, weekStart: W, senderId: f.supId, senderName: f.supName, suppress }, doSwap);
    cards = await cardsNow();
    const shCard2 = cards.find((c) => c.recipient_id === f.shId);
    const supCard2 = cards.find((c) => c.recipient_id === f.supId);
    check('(ب) المدرّب (الفاعل المكتوم) لا يصله كرتٌ ليومه', !supCard2, JSON.stringify(supCard2?.data?.changes));
    check('(ب) الظلّ ما زال يصله كرتٌ موسومٌ supervisor_moved', shCard2?.data?.supervisor_moved?.id === f.supId, JSON.stringify(shCard2?.data?.supervisor_moved));
  } finally {
    await wipe();
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildWeek();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
