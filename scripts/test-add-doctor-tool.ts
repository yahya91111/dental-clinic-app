/* ج١ — أداة الذكاء add_doctor_to_schedule (طرفٌ لطرف عبر dispatchRequestToolV2):
 * نزيل طبيبًا ونبني N−1 (مع حفظ الوصفة)، ثمّ نعيده ونستدعي الأداة من الأربعاء.
 * نتحقّق: الأداة نجحت · الأحد–الثلاثاء بلا الطبيب وسليمة · الأربعاء–الخميس فيها الطبيب. */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule, WEEK_DAYS } from '../lib/algorithms/schedule';
import { dispatchRequestToolV2 } from '../lib/ai_v2/tools_requests_v2';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };
type Ctx = Parameters<typeof dispatchRequestToolV2>[2];

function recipe() {
  const aShiftPlan = Object.fromEntries(WEEK_DAYS.map((d) => [d, 'morning'])) as Record<string, 'morning'>;
  return { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' }, includeInExRotation: false } } as Parameters<typeof schedule.build>[0];
}
async function buildAndSave() {
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, 'beginner'> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  await schedule.build({ ...recipe(), traineeModes: tm, dryRun: false } as Parameters<typeof schedule.build>[0]);
  await schedule.saveBuildConfig({ ...recipe(), traineeModes: tm, dryRun: true } as Parameters<typeof schedule.saveBuildConfig>[0]);
}
const dayRows = (slots: any[], day: string) => slots.filter((s) => s.dayOfWeek === day && ((s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator')) || s.status === 'extra'));
const sig = (slots: any[], day: string) => dayRows(slots, day).map((s) => `${s.period}|${s.clinicNumber}|${s.role}|${s.status}|${s.doctorId}`).sort().join(' ; ');
const hasDoctor = (slots: any[], day: string, id: string) => dayRows(slots, day).some((s) => s.doctorId === id);

(async () => {
  let member: Record<string, unknown> | null = null; let restored = false;
  try {
    const d0 = (await loadScheduleData(CID, W)).data!;
    const X = d0.doctors.find((z) => z.groupTemplate.key === 'group_a' && z.workStatus === 'active');
    if (!X) { console.log('ℹ لا طبيب group_a مناسب — تخطّي.'); return; }
    const { data: rows } = await supabase.from('doctor_group_members').select('*').eq('doctor_id', X.id).eq('group_id', X.groupId);
    member = (rows || [])[0] as Record<string, unknown>;
    if (!member) { console.log('ℹ تعذّر جلب العضويّة — تخطّي.'); return; }
    console.log(`الطبيب المُضاف لاحقًا: ${X.name}`);

    // ① N−1 + حفظ الوصفة
    await supabase.from('doctor_group_members').delete().eq('id', member.id as string);
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildAndSave();
    const before = (await loadScheduleData(CID, W)).data!.existingSlots;
    const beforeSig = Object.fromEntries(['sunday', 'monday', 'tuesday'].map((day) => [day, sig(before, day)]));
    check('① الطبيب غائبٌ من أسبوع N−1', !WEEK_DAYS.some((day) => hasDoctor(before, day, X.id)), '');

    // ② أعِده ثمّ استدعِ الأداة من الأربعاء
    await supabase.from('doctor_group_members').insert(member); restored = true;
    const d1 = (await loadScheduleData(CID, W)).data!;
    const roster = d1.doctors.map((x) => ({ id: x.id, name: x.name, groupKey: x.groupTemplate.key }));
    const idx = roster.findIndex((rr) => rr.id === X.id) + 1;
    const leaderCtx: Ctx = { clinicId: CID, user: { id: d1.doctors[0]!.id, name: d1.doctors[0]!.name, role: 'team_leader' }, roster };
    const out = await dispatchRequestToolV2('add_doctor_to_schedule', { weekStart: W, day: 'wednesday', doctorIndex: idx }, leaderCtx);
    check('② الأداة نجحت', !out.startsWith('Tool error'), out);

    const after = (await loadScheduleData(CID, W)).data!.existingSlots;
    for (const day of ['sunday', 'monday', 'tuesday']) {
      check(`(أ) ${day} لم يُمسّ`, beforeSig[day] === sig(after, day), 'تغيّر');
      check(`(أ) ${day} بلا الطبيب`, !hasDoctor(after, day, X.id), 'ظهر مبكّرًا');
    }
    check('(ب) الطبيب أُدخِل الأربعاء/الخميس', hasDoctor(after, 'wednesday', X.id) || hasDoctor(after, 'thursday', X.id), 'لم يُدخَل');
  } finally {
    if (member && !restored) { try { await supabase.from('doctor_group_members').insert(member); } catch { /* */ } }
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildAndSave();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
