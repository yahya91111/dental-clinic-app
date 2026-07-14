/* تحقّقٌ من إصلاح add_doctor_to_schedule للمتدرّب: نضيف طبيبًا كـ«متدرّب + مُشرِف» **بلا**
 * نوعٍ في الوصفة المحفوظة، ثمّ نستدعي الأداة. المتوقّع: تنجح (لا MISSING_TRAINEE_MODES)
 * ويظهر المتدرّبُ ظلًّا يطابقُ خاناتِ مدرّبِه. أسبوعٌ وهميّ (2099) + تنظيفٌ كامل + بلا إشعارات. */
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
const wedActive = (slots: any[], id: string) =>
  slots.filter((s) => s.dayOfWeek === 'wednesday' && s.doctorId === id &&
    ((s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator')) || s.status === 'extra'))
    .map((s) => `${s.period}|${s.clinicNumber}|${s.role}|${s.status}`).sort();

(async () => {
  let X: any = null, origMember: Record<string, unknown> | null = null;
  try {
    const d0 = (await loadScheduleData(CID, W)).data!;
    const groupA = d0.doctors.filter((z) => z.groupTemplate.key === 'group_a' && z.workStatus === 'active');
    if (groupA.length < 2) { console.log('ℹ أقلّ من طبيبين group_a — تخطّي.'); return; }
    X = groupA[0]; const S = groupA[1]; // X يتدرّب كظلٍّ لـ S
    console.log(`المتدرّب الجديد: ${X.name} · مدرّبه: ${S.name}`);
    const { data: rows } = await supabase.from('doctor_group_members').select('*').eq('doctor_id', X.id).eq('group_id', X.groupId);
    origMember = (rows || [])[0] as Record<string, unknown>;
    if (!origMember) { console.log('ℹ تعذّر جلب عضويّة X — تخطّي.'); return; }

    // ① خطُّ أساسٍ بلا X، وحفظُ الوصفة (فلا نوعَ محفوظ لـ X)
    await supabase.from('doctor_group_members').delete().eq('id', origMember.id as string);
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildAndSave();

    // ② أعِد X كـ«متدرّب + مُشرِف S» (كأنّ القائد أضافه للقروب حديثًا بلا وصفة)
    await supabase.from('doctor_group_members').insert({ ...origMember, work_status: 'trainee', supervisor_doctor_id: S.id });

    // ③ استدعِ الأداة من الأربعاء
    const d1 = (await loadScheduleData(CID, W)).data!;
    const roster = d1.doctors.map((x) => ({ id: x.id, name: x.name, groupKey: x.groupTemplate.key }));
    const idx = roster.findIndex((rr) => rr.id === X.id) + 1;
    const leaderCtx: Ctx = { clinicId: CID, user: { id: d1.doctors[0]!.id, name: d1.doctors[0]!.name, role: 'team_leader' }, roster };
    const out = await dispatchRequestToolV2('add_doctor_to_schedule', { weekStart: W, day: 'wednesday', doctorIndex: idx }, leaderCtx);
    check('② الأداة نجحت (لا MISSING_TRAINEE_MODES)', !out.startsWith('Tool error'), out);

    // ④ المتدرّبُ ظلٌّ يطابقُ خاناتِ مدرّبِه يوم الأربعاء
    const after = (await loadScheduleData(CID, W)).data!.existingSlots;
    const sSig = wedActive(after, S.id);
    const xSig = wedActive(after, X.id);
    console.log(`   مدرّب S خاناتُ الأربعاء: ${sSig.join(' ; ') || '—'}`);
    console.log(`   متدرّب X خاناتُ الأربعاء: ${xSig.join(' ; ') || '—'}`);
    check('X ظهر يوم الأربعاء', xSig.length > 0, 'لم يظهر');
    check('X يطابقُ خاناتِ مدرّبِه S (ظلّ)', sSig.length > 0 && JSON.stringify(sSig) === JSON.stringify(xSig), `S=${sSig} X=${xSig}`);
  } finally {
    // تنظيف: أرجِعْ عضويّة X الأصليّة بالضبط، امسح أسبوع 2099، وأعِد بناء الأساس.
    if (X && origMember) {
      try { await supabase.from('doctor_group_members').delete().eq('doctor_id', X.id).eq('group_id', X.groupId); } catch { /* */ }
      try { await supabase.from('doctor_group_members').insert(origMember); } catch { /* */ }
    }
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await buildAndSave();
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
