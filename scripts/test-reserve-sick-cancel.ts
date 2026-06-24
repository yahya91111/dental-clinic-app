/* مرضيّةُ طبيبٍ احتياطيّ ثمّ إلغاؤها → يجب أن يعود صفُّ احتياطه (extra):
 * عند المرض تُحفَظ بصمةُ الاحتياط (prev_placement فترة 0)، والإلغاء يستردّها. */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import { setScheduleStatus, cancelStatus } from '../lib/algorithms/requests_v2';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' — ' + d); } };

async function build() {
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).in('status', ['sick_leave', 'vacation']);
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).eq('role', 'prev_placement');
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W).eq('source', 'request');
  const pre = await loadScheduleData(CID, W);
  const tm: Record<string, TraineeMode> = {}; for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
  await schedule.build({ ...recipe, dryRun: false });
}

(async () => {
  await supabase.from('schedule_settings').update({ clinic_count: 3 }).eq('clinic_id', CID);
  await build();
  const day: WeekDay = 'thursday';
  const data = (await loadScheduleData(CID, W)).data!;
  // ابحث عن طبيبٍ احتياطيّ (صفّ extra، فترة 0) يوم الخميس صباحًا.
  const ex = data.existingSlots.find((s) => s.dayOfWeek === day && s.status === 'extra' && s.period === 0 && [1].includes(s.clinicNumber));
  if (!ex) { console.log('لا احتياطيّ صباحَ الخميس في الفكسجر — تخطّي.'); process.exit(0); }
  const rid = ex.doctorId; const rname = ex.doctorName; const exCol = ex.clinicNumber;
  console.log(`الاحتياطيّ: ${rname} (عمود EX ${exCol})`);
  const actor = { id: data.doctors[0]!.id, role: 'super_admin' };

  // ① مرضيّة للاحتياطيّ.
  await setScheduleStatus(actor, { clinicId: CID, weekStart: W, day, doctorId: rid, doctorName: rname, status: 'sick_leave', shift: 'morning' });
  const s1 = (await loadScheduleData(CID, W)).data!.existingSlots.filter((x) => x.dayOfWeek === day && x.doctorId === rid);
  check('① صفّ الاحتياط أُزيل (لم يَعُد extra)', !s1.some((x) => x.status === 'extra' && x.period === 0), JSON.stringify(s1.map((x) => x.status)));
  check('① حُفظت بصمةُ الاحتياط (prev_placement فترة 0)', s1.some((x) => x.role === 'prev_placement' && x.period === 0 && x.clinicNumber === exCol), JSON.stringify(s1.map((x) => `${x.role}/${x.period}/${x.status}`)));
  check('① صفّ المرضيّة مكتوب', s1.some((x) => x.status === 'sick_leave'));

  // ② إلغاء المرضيّة → يعود صفُّ الاحتياط.
  const r = await cancelStatus(actor, { clinicId: CID, weekStart: W, day, doctorId: rid, restoreToPrevPlace: true });
  const s2 = (await loadScheduleData(CID, W)).data!.existingSlots.filter((x) => x.dayOfWeek === day && x.doctorId === rid);
  check('② الإلغاء نجح + restored', r.success && (r as { restored?: boolean }).restored === true, JSON.stringify(r));
  check('② عاد صفُّ الاحتياط (extra فترة 0، نفس العمود)', s2.some((x) => x.status === 'extra' && x.period === 0 && x.clinicNumber === exCol), JSON.stringify(s2.map((x) => `${x.role}/${x.period}/${x.status}`)));
  check('② لا صفّ مرضيّة باقٍ', !s2.some((x) => x.status === 'sick_leave'));
  check('② لا بصمةُ احتياطٍ متبقّية (prev_placement)', !s2.some((x) => x.role === 'prev_placement'));

  await build();
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
