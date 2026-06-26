/* طبقة الفرق: كرت «طرأ تغييرٌ على جدولك» يُرسَل لكلّ طبيبٍ تغيّر موضعُه عبر الموزّع.
 *  (أ) نقلُ القائد (place_in_clinic) لطبيبٍ إلى عيادةٍ أخرى → المنقول يصله كرت seat_change
 *      بحمولة (تاريخ → old/new) صحيحة، والقائد (الفاعل) لا يصله شيء.
 *  (ب) صاحب الحدث (طبيبٌ سجّل غيابه بنفسه) لا يصله كرتٌ ليومه (suppress)؛ والمتأثّرون
 *      بالتغطية (إن وُجدوا) يصلهم. */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import { dispatchRequestToolV2 } from '../lib/ai_v2/tools_requests_v2';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };
const wipeNotifs = () => supabase.from('notifications').delete().eq('clinic_id', CID).eq('type', 'seat_change');
type Ctx = Parameters<typeof dispatchRequestToolV2>[2];

async function buildWeek() {
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, 'beginner'> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning'])) as Record<string, 'morning'>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' }, includeInExRotation: false }, traineeModes: tm } as Parameters<typeof schedule.build>[0];
  await schedule.build({ ...recipe, dryRun: false });
  await schedule.saveBuildConfig({ ...recipe, dryRun: true } as Parameters<typeof schedule.saveBuildConfig>[0]);
}

(async () => {
  try {
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildWeek();
    const d = (await loadScheduleData(CID, W)).data!;
    const roster = d.doctors.map((x) => ({ id: x.id, name: x.name, groupKey: x.groupTemplate.key }));
    const idx = (id: string) => roster.findIndex((r) => r.id === id) + 1;
    const leader = d.doctors[0]!; // فاعلٌ قائد (الصلاحيّة من ctx.user.role لا من قاعدة البيانات)
    const leaderCtx: Ctx = { clinicId: CID, user: { id: leader.id, name: leader.name, role: 'team_leader' }, roster };

    // ── (أ) نقل القائد ──────────────────────────────────────────
    const thuActive = d.existingSlots.filter((s) => s.dayOfWeek === 'thursday' && s.status === 'active' && s.role === 'clinic' && s.period > 0);
    const byDoc = new Map<string, { clinic: number; periods: number[] }>();
    for (const s of thuActive) { const e = byDoc.get(s.doctorId) ?? { clinic: s.clinicNumber, periods: [] }; e.periods.push(s.period); byDoc.set(s.doctorId, e); }
    const single = [...byDoc.entries()].find(([id, e]) => e.periods.length === 1 && id !== leader.id); // طبيبٌ في فترةٍ واحدة، غير القائد (الفاعل)
    if (!single) { console.log('ℹ لا طبيب فترةٍ واحدة الخميس — تخطّي (أ).'); }
    else {
      const [Aid, Ainfo] = single;
      await wipeNotifs();
      // اجعله منفردًا في عيادته (الفترتان) — نقلةٌ حتميّةٌ تُغيّر موضعه (يكسب الفترة الأخرى).
      const out = await dispatchRequestToolV2('place_in_clinic',
        { doctorIndex: idx(Aid), day: 'thursday', clinicNumber: Ainfo.clinic, periods: [1, 2], weekStart: W }, leaderCtx);
      check('(أ) place_in_clinic نجح', !out.startsWith('Tool error'), out);
      const cards = (await supabase.from('notifications').select('recipient_id, data').eq('clinic_id', CID).eq('type', 'seat_change')).data as { recipient_id: string; data: any }[] || [];
      const aCard = cards.find((c) => c.recipient_id === Aid);
      check('(أ) المنقول وصله كرت seat_change', !!aCard, `cards=${cards.length}`);
      const thuCh = aCard?.data?.changes?.find((ch: any) => ch.day === 'thursday');
      check('(أ) الكرت يحمل تغيير الخميس بـ old/new مختلفَين', !!thuCh && JSON.stringify(thuCh.old) !== JSON.stringify(thuCh.new),
        JSON.stringify(thuCh));
      check('(أ) الكرت يحمل clinic_count لرسم هيكل المعاينة', Number(aCard?.data?.clinic_count) > 0,
        `clinic_count=${aCard?.data?.clinic_count}`);
      check('(أ) القائد (الفاعل) لا يصله كرت', !cards.some((c) => c.recipient_id === leader.id), `leader=${leader.id.slice(0, 8)}`);
    }

    // ── (ب) صاحب الحدث: غيابٌ ذاتيّ ─────────────────────────────
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildWeek();
    const d2 = (await loadScheduleData(CID, W)).data!;
    const roster2 = d2.doctors.map((x) => ({ id: x.id, name: x.name, groupKey: x.groupTemplate.key }));
    const idx2 = (id: string) => roster2.findIndex((r) => r.id === id) + 1;
    const B = d2.existingSlots.find((s) => s.dayOfWeek === 'wednesday' && s.status === 'active' && s.role === 'clinic' && s.period > 0)!;
    if (!B) { console.log('ℹ لا طبيب عيادةٍ نشطٌ الأربعاء — تخطّي (ب).'); }
    else {
      await wipeNotifs();
      const selfCtx: Ctx = { clinicId: CID, user: { id: B.doctorId, name: B.doctorName, role: 'doctor' }, roster: roster2 };
      const out = await dispatchRequestToolV2('set_schedule_status',
        { doctorIndex: idx2(B.doctorId), day: 'wednesday', status: 'sick_leave', weekStart: W }, selfCtx);
      check('(ب) set_schedule_status (مرضية ذاتيّة) نجح', !out.startsWith('Tool error'), out);
      const cards = (await supabase.from('notifications').select('recipient_id').eq('clinic_id', CID).eq('type', 'seat_change')).data as { recipient_id: string }[] || [];
      check('(ب) صاحب الغياب لا يصله كرت ليومه', !cards.some((c) => c.recipient_id === B.doctorId), `cards=${cards.map((c) => c.recipient_id.slice(0, 4)).join(',')}`);
    }
  } finally {
    await wipeNotifs();
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildWeek();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
