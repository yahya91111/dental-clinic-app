/* الحالة الثانية: إبلاغ من تحرّك مقعده. نتحقّق:
 *  (أ) applyCoverage يُرجِع moves بالطبيب/العيادة/الفترة/النوع الصحيح (احتياطيّ ينزل).
 *  (ب) منفرد: شريكٌ يغطّي فترةً إضافيّة → move kind=partner_solo.
 *  (ج) notifyDoctorSeatChange يُنشئ إشعار request_result بحمولة seat_change + لا تكرار. */
import { supabase } from '../lib/supabase';
import { loadScheduleData } from '../lib/algorithms/schedule';
import { applyCoverage } from '../lib/algorithms/solver_shadow';
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
  let rcpt = '';
  try {
    await setCC(3); await wipe();
    const d0 = (await loadScheduleData(CID, W)).data!;
    const pool = d0.doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty');
    const [P1, P2, P3] = pool;
    rcpt = P2!.id;

    // (أ) احتياطيّ ينزل: مقعد بِركة شاغر P1 (عيادة2/ف1) + احتياطيّ بِركة P2.
    await wipe();
    await ins({ doctor_id: P1!.id, doctor_name: P1!.name, period: 1, clinic_number: 2, role: 'prev_placement', status: 'active' });
    await ins({ doctor_id: P2!.id, doctor_name: P2!.name, period: 0, clinic_number: 1, role: 'clinic', status: 'extra' });
    const rA = await applyCoverage({ clinicId: CID, weekStart: W, label: 'sc-a' });
    const mA = rA.moves.find((m) => m.doctorId === P2!.id);
    check('(أ) move: الاحتياطيّ نزل (عيادة2/ف1، kind=reserve)', !!mA && mA.clinicNumber === 2 && mA.period === 1 && mA.kind === 'reserve', JSON.stringify(rA.moves));

    // (ب) منفرد: عيادة1 فيها P3 بـف2 فقط، ومقعد ف1 شاغر (P1)، بلا احتياط/دليقيتر → P3 ينفرد ف1.
    await wipe();
    await ins({ doctor_id: P1!.id, doctor_name: P1!.name, period: 1, clinic_number: 1, role: 'prev_placement', status: 'active' });
    await ins({ doctor_id: P3!.id, doctor_name: P3!.name, period: 2, clinic_number: 1, role: 'clinic', status: 'active' });
    const rB = await applyCoverage({ clinicId: CID, weekStart: W, label: 'sc-b' });
    const mB = rB.moves.find((m) => m.doctorId === P3!.id);
    check('(ب) move: الشريك انفرد (عيادة1/ف1، kind=partner_solo)', !!mB && mB.clinicNumber === 1 && mB.period === 1 && mB.kind === 'partner_solo', JSON.stringify(rB.moves));

    // (ج) الإشعار + لا تكرار.
    await supabase.from('notifications').delete().eq('clinic_id', CID).eq('recipient_id', rcpt).eq('type', 'request_result');
    await notifications.notifyDoctorSeatChange({ clinicId: CID, recipientId: rcpt, weekStart: W, day: 'thursday', seats: [{ clinicNumber: 2, period: 1 }], reason: 'coverage' });
    let q = await supabase.from('notifications').select('id, data, body').eq('clinic_id', CID).eq('recipient_id', rcpt).eq('type', 'request_result');
    let rows = (q.data || []) as any[];
    check('(ج) إشعارٌ واحدٌ بحمولة seat_change', rows.length === 1 && rows[0]?.data?.seat_change?.seats?.[0]?.clinic_number === 2, JSON.stringify(rows.map((x) => x.data?.seat_change)));
    check('(ج) الجسم صريحٌ بالعيادة/الفترة', typeof rows[0]?.body === 'string' && rows[0].body.includes('عيادة 2') && rows[0].body.includes('الفترة 1'), rows[0]?.body);
    // لا تكرار: نداءٌ ثانٍ يحذف غير المقروء ويضع واحدًا.
    await notifications.notifyDoctorSeatChange({ clinicId: CID, recipientId: rcpt, weekStart: W, day: 'thursday', seats: [{ clinicNumber: 3, period: 2 }], reason: 'coverage' });
    q = await supabase.from('notifications').select('id, data, body').eq('clinic_id', CID).eq('recipient_id', rcpt).eq('type', 'request_result');
    rows = (q.data || []) as any[];
    check('(ج) لا تكرار — إشعارٌ واحدٌ مُحدَّث', rows.length === 1 && rows[0]?.data?.seat_change?.seats?.[0]?.clinic_number === 3, `${rows.length}`);
  } finally {
    if (rcpt) await supabase.from('notifications').delete().eq('clinic_id', CID).eq('recipient_id', rcpt).eq('type', 'request_result');
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
