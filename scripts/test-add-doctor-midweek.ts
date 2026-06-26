/* ج١ — إضافةُ طبيبٍ منتصف الأسبوع (المحاكاة): نزيل طبيبًا من قروبه ونبني الأسبوع
 * (N−1)، ثمّ نعيده ونعيد البناء **من الأربعاء**. نتحقّق:
 *  (أ) الأحد–الثلاثاء لم تُمسّ (تبقى بلا الطبيب، N−1).
 *  (ب) الأربعاء–الخميس صار فيها الطبيب (أُدخِل، N).
 *  (ج) لا خرقٌ صارم (لا حجز مزدوج، لا تكرار طبيبٍ في فترة). */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule, WEEK_DAYS } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };

function recipe(fromDay?: string) {
  const aShiftPlan = Object.fromEntries(WEEK_DAYS.map((d) => [d, 'morning'])) as Record<string, 'morning'>;
  return { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' }, includeInExRotation: false }, ...(fromDay ? { fromDay } : {}) } as Parameters<typeof schedule.build>[0];
}
async function build(fromDay?: string) {
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, 'beginner'> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  return schedule.build({ ...recipe(fromDay), traineeModes: tm, dryRun: false } as Parameters<typeof schedule.build>[0]);
}
const dayRows = (slots: any[], day: string) => slots.filter((s) => s.dayOfWeek === day && ((s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator')) || s.status === 'extra'));
const sig = (slots: any[], day: string) => dayRows(slots, day).map((s) => `${s.period}|${s.clinicNumber}|${s.role}|${s.status}|${s.doctorId}`).sort().join(' ; ');
const hasDoctor = (slots: any[], day: string, id: string) => dayRows(slots, day).some((s) => s.doctorId === id);
function doubleBooked(slots: any[], day: string): string {
  const seen = new Map<string, string>();
  for (const s of slots.filter((x) => x.dayOfWeek === day && x.status === 'active' && (x.role === 'clinic' || x.role === 'delegator'))) {
    const k = `${s.doctorId}|${s.period}`;
    if (seen.has(k)) return `${s.doctorId.slice(0, 6)} مكرّر ف${s.period}`;
    seen.set(k, s.id);
  }
  return '';
}

(async () => {
  let member: Record<string, unknown> | null = null;
  let restored = false;
  try {
    const d0 = (await loadScheduleData(CID, W)).data!;
    const X = d0.doctors.find((z) => z.groupTemplate.key === 'group_a' && z.workStatus === 'active');
    if (!X) { console.log('ℹ لا طبيب group_a مناسب — تخطّي.'); return; }
    const { data: rows } = await supabase.from('doctor_group_members').select('*').eq('doctor_id', X.id).eq('group_id', X.groupId);
    member = (rows || [])[0] as Record<string, unknown>;
    if (!member) { console.log('ℹ تعذّر جلب عضويّة الطبيب — تخطّي.'); return; }
    console.log(`الطبيب المُضاف لاحقًا: ${X.name}`);

    // ① أزِله من القروب وابنِ الأسبوع (N−1)
    await supabase.from('doctor_group_members').delete().eq('id', member.id as string);
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    const rFull = await build();
    check('① بناء N−1 نجح', rFull.success, rFull.summary);
    const beforeSlots = (await loadScheduleData(CID, W)).data!.existingSlots;
    check('① الطبيب غائبٌ تمامًا من أسبوع N−1', !WEEK_DAYS.some((day) => hasDoctor(beforeSlots, day, X.id)), 'موجودٌ رغم إزالته');
    const beforeSig = Object.fromEntries(WEEK_DAYS.map((day) => [day, sig(beforeSlots, day)]));

    // ② أعِده إلى القروب ثمّ أعِد البناء من الأربعاء
    await supabase.from('doctor_group_members').insert(member); restored = true;
    const rPart = await build('wednesday');
    check('② إعادة البناء من الأربعاء نجحت', rPart.success, rPart.summary);
    const afterSlots = (await loadScheduleData(CID, W)).data!.existingSlots;

    // (أ) الأحد–الثلاثاء لم تُمسّ
    for (const day of ['sunday', 'monday', 'tuesday']) {
      check(`(أ) ${day} لم يُمسّ`, beforeSig[day] === sig(afterSlots, day), 'تغيّر');
      check(`(أ) ${day} ما زال بلا الطبيب`, !hasDoctor(afterSlots, day, X.id), 'ظهر مبكّرًا');
    }
    // (ب) الأربعاء/الخميس صار فيها الطبيب
    check('(ب) الطبيب أُدخِل في الأربعاء أو الخميس', hasDoctor(afterSlots, 'wednesday', X.id) || hasDoctor(afterSlots, 'thursday', X.id),
      'لم يُدخَل');
    // (ج) لا حجز مزدوج في الأيّام المُعادة
    for (const day of ['wednesday', 'thursday']) check(`(ج) ${day} بلا حجزٍ مزدوج`, !doubleBooked(afterSlots, day), doubleBooked(afterSlots, day));
  } finally {
    if (member && !restored) { try { await supabase.from('doctor_group_members').insert(member); } catch { /* */ } }
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    await build();
    await schedule.saveBuildConfig({ ...recipe(), dryRun: true } as Parameters<typeof schedule.saveBuildConfig>[0]);
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
