/* ج١ سيناريو ٣ — حذفُ طبيب (دائم) + إعادةُ توزيعٍ عادلة من الأربعاء (عبر dispatchRequestToolV2).
 *  (أ) الأحد–الثلاثاء سليمة وما زال الطبيب فيها. (ب) الأربعاء–الخميس بلا الطبيب، بلا حجزٍ مزدوج.
 *  (ج) أُزيل من قروبه (دائم). يُرمَّم في النهاية. */
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
const has = (s: any[], day: string, id: string) => dayRows(s, day).some((x) => x.doctorId === id);
function dbl(s: any[], day: string): string {
  const seen = new Set<string>();
  for (const x of s.filter((y) => y.dayOfWeek === day && y.status === 'active' && (y.role === 'clinic' || y.role === 'delegator'))) {
    const k = `${x.doctorId}|${x.period}`; if (seen.has(k)) return `${x.doctorId.slice(0, 6)} ف${x.period}`; seen.add(k);
  }
  return '';
}

(async () => {
  let member: Record<string, unknown> | null = null; let restored = false;
  try {
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildAndSave();
    const d0 = (await loadScheduleData(CID, W)).data!;
    const X = d0.doctors.find((z) => z.groupTemplate.key === 'group_a' && z.workStatus === 'active');
    if (!X) { console.log('ℹ لا طبيب مناسب — تخطّي.'); return; }
    const { data: rows } = await supabase.from('doctor_group_members').select('*').eq('doctor_id', X.id).eq('group_id', X.groupId);
    member = (rows || [])[0] as Record<string, unknown>;
    console.log(`المحذوف: ${X.name}`);
    const before = (await loadScheduleData(CID, W)).data!.existingSlots;
    const beforeSig = Object.fromEntries(['sunday', 'monday', 'tuesday'].map((day) => [day, sig(before, day)]));
    check('① الطبيب موجودٌ قبل الحذف (الأربعاء/الخميس)', has(before, 'wednesday', X.id) || has(before, 'thursday', X.id), '');

    const roster = d0.doctors.map((z) => ({ id: z.id, name: z.name, groupKey: z.groupTemplate.key }));
    const idx = roster.findIndex((z) => z.id === X.id) + 1;
    const leaderCtx: Ctx = { clinicId: CID, user: { id: d0.doctors[0]!.id, name: d0.doctors[0]!.name, role: 'team_leader' }, roster };
    const out = await dispatchRequestToolV2('remove_doctor_from_schedule', { weekStart: W, day: 'wednesday', doctorIndex: idx, permanent: true }, leaderCtx);
    check('② الأداة نجحت', !out.startsWith('Tool error'), out);

    const after = (await loadScheduleData(CID, W)).data!.existingSlots;
    for (const day of ['sunday', 'monday', 'tuesday']) {
      check(`(أ) ${day} لم يُمسّ`, beforeSig[day] === sig(after, day), 'تغيّر');
      check(`(أ) ${day} ما زال فيه الطبيب`, has(after, day, X.id), 'اختفى مبكّرًا');
    }
    check('(ب) الأربعاء بلا الطبيب', !has(after, 'wednesday', X.id), 'باقٍ');
    check('(ب) الخميس بلا الطبيب', !has(after, 'thursday', X.id), 'باقٍ');
    for (const day of ['wednesday', 'thursday']) check(`(ب) ${day} بلا حجزٍ مزدوج`, !dbl(after, day), dbl(after, day));
    const { data: stillIn } = await supabase.from('doctor_group_members').select('id').eq('doctor_id', X.id).eq('group_id', X.groupId);
    check('(ج) أُزيل من قروبه (دائم)', (stillIn || []).length === 0, 'ما زال بالقروب');
  } finally {
    if (member) { const { data: ex } = await supabase.from('doctor_group_members').select('id').eq('id', member.id as string); if (!(ex || []).length) { try { await supabase.from('doctor_group_members').insert(member); } catch { /* */ } } restored = true; }
    void restored;
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildAndSave();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
