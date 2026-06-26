/* ج١ سيناريو ٤ — ترقيةُ متدرّبٍ ظلٍّ إلى مستقلّ + إعادةُ توزيعٍ من الأربعاء (عبر الأداة).
 *  (أ) الأحد–الثلاثاء سليمة. (ب) الأربعاء/الخميس: المتدرّب حاضرٌ، بلا حجزٍ مزدوج.
 *  (ج) وضعُه في الوصفة صار 'independent'. يُرمَّم في النهاية. */
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
  try {
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildAndSave();
    const d0 = (await loadScheduleData(CID, W)).data!;
    const T = d0.doctors.find((z) => z.workStatus === 'trainee');
    if (!T) { console.log('ℹ لا متدرّب — تخطّي.'); return; }
    console.log(`المتدرّب المُرقَّى: ${T.name}`);
    const before = (await loadScheduleData(CID, W)).data!.existingSlots;
    const beforeSig = Object.fromEntries(['sunday', 'monday', 'tuesday'].map((day) => [day, sig(before, day)]));

    const roster = d0.doctors.map((z) => ({ id: z.id, name: z.name, groupKey: z.groupTemplate.key }));
    const idx = roster.findIndex((z) => z.id === T.id) + 1;
    const leaderCtx: Ctx = { clinicId: CID, user: { id: d0.doctors[0]!.id, name: d0.doctors[0]!.name, role: 'team_leader' }, roster };
    const out = await dispatchRequestToolV2('promote_trainee_independent', { weekStart: W, day: 'wednesday', doctorIndex: idx }, leaderCtx);
    check('① الأداة نجحت', !out.startsWith('Tool error'), out);

    const after = (await loadScheduleData(CID, W)).data!.existingSlots;
    for (const day of ['sunday', 'monday', 'tuesday']) check(`(أ) ${day} لم يُمسّ`, beforeSig[day] === sig(after, day), 'تغيّر');
    check('(ب) المتدرّب حاضرٌ الأربعاء أو الخميس', has(after, 'wednesday', T.id) || has(after, 'thursday', T.id), 'غائب');
    for (const day of ['wednesday', 'thursday']) check(`(ب) ${day} بلا حجزٍ مزدوج`, !dbl(after, day), dbl(after, day));
    const cfg = await schedule.loadBuildConfig(CID, W);
    check('(ج) وضعُه في الوصفة صار مستقلًّا', (cfg as { traineeModes?: Record<string, string> } | null)?.traineeModes?.[T.id] === 'independent', JSON.stringify((cfg as any)?.traineeModes?.[T.id]));
  } finally {
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildAndSave();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
