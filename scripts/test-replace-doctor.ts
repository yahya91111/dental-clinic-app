/* ج١ سيناريو ٢ — استبدالٌ حرفيّ: د(in) يأخذ خانات د(out) نفسها من الأربعاء (عبر الأداة).
 *  (أ) الأحد–الثلاثاء سليمة. (ب) خاناتُ out يوم الأربعاء/الخميس صارت لـin حرفيًّا.
 *  (ج) out بلا خاناتٍ الأربعاء/الخميس. (هذا الأسبوع فقط — بلا permanent.) */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule, WEEK_DAYS } from '../lib/algorithms/schedule';
import { dispatchRequestToolV2 } from '../lib/ai_v2/tools_requests_v2';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };
type Ctx = Parameters<typeof dispatchRequestToolV2>[2];
const recipe = () => ({ weekStart: W, clinicId: CID, aShiftPlan: Object.fromEntries(WEEK_DAYS.map((d) => [d, 'morning'])) as Record<string, 'morning'>, boardConfig: { scenario: { kind: 'all_morning' }, includeInExRotation: false } } as Parameters<typeof schedule.build>[0]);
async function buildAndSave() {
  const pre = await loadScheduleData(CID, W); const tm: Record<string, 'beginner'> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  await schedule.build({ ...recipe(), traineeModes: tm, dryRun: false } as Parameters<typeof schedule.build>[0]);
  await schedule.saveBuildConfig({ ...recipe(), traineeModes: tm, dryRun: true } as Parameters<typeof schedule.saveBuildConfig>[0]);
}
const dayRows = (s: any[], day: string) => s.filter((x) => x.dayOfWeek === day && ((x.status === 'active' && (x.role === 'clinic' || x.role === 'delegator')) || x.status === 'extra'));
const sig = (s: any[], day: string) => dayRows(s, day).map((x) => `${x.period}|${x.clinicNumber}|${x.role}|${x.status}|${x.doctorId}`).sort().join(' ; ');
const posOf = (s: any[], day: string, id: string) => dayRows(s, day).filter((x) => x.doctorId === id).map((x) => `${x.period}|${x.clinicNumber}|${x.role}|${x.status}`).sort();
const has = (s: any[], day: string, id: string) => dayRows(s, day).some((x) => x.doctorId === id);

(async () => {
  try {
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildAndSave();
    const d0 = (await loadScheduleData(CID, W)).data!;
    const ga = d0.doctors.filter((z) => z.groupTemplate.key === 'group_a' && z.workStatus === 'active');
    if (ga.length < 2) { console.log('ℹ لا طبيبَي group_a — تخطّي.'); return; }
    const before = (await loadScheduleData(CID, W)).data!.existingSlots;
    // out = طبيبٌ له خاناتٌ الأربعاء؛ in = طبيبٌ آخر
    const out = ga.find((z) => dayRows(before, 'wednesday').some((x) => x.doctorId === z.id)) || ga[0]!;
    const inn = ga.find((z) => z.id !== out.id)!;
    console.log(`out=${out.name} · in=${inn.name}`);
    const beforeSig = Object.fromEntries(['sunday', 'monday', 'tuesday'].map((day) => [day, sig(before, day)]));
    const outPos = { wednesday: posOf(before, 'wednesday', out.id), thursday: posOf(before, 'thursday', out.id) };

    const roster = d0.doctors.map((z) => ({ id: z.id, name: z.name, groupKey: z.groupTemplate.key }));
    const idx = (id: string) => roster.findIndex((z) => z.id === id) + 1;
    const leaderCtx: Ctx = { clinicId: CID, user: { id: d0.doctors[0]!.id, name: d0.doctors[0]!.name, role: 'team_leader' }, roster };
    const res = await dispatchRequestToolV2('replace_doctor_in_schedule', { weekStart: W, day: 'wednesday', outDoctorIndex: idx(out.id), inDoctorIndex: idx(inn.id) }, leaderCtx);
    check('① الأداة نجحت', !res.startsWith('Tool error'), res);

    const after = (await loadScheduleData(CID, W)).data!.existingSlots;
    for (const day of ['sunday', 'monday', 'tuesday']) check(`(أ) ${day} لم يُمسّ`, beforeSig[day] === sig(after, day), 'تغيّر');
    for (const day of ['wednesday', 'thursday'] as const) {
      const inPosAfter = posOf(after, day, inn.id);
      // كلُّ مواضعِ out السابقة صارت لـin حرفيًّا
      check(`(ب) ${day}: in أخذ مواضع out حرفيًّا`, outPos[day].every((p) => inPosAfter.includes(p)), `out=${outPos[day].join(',')} inNow=${inPosAfter.join(',')}`);
      check(`(ج) ${day}: out بلا خانات`, !has(after, day, out.id), 'باقٍ');
    }
  } finally {
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildAndSave();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
