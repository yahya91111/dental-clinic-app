/* هل يعكس كنسلُ المرضيّة الأثرَ البعيد بدقّة (كما الاستئذان)؟ نبني أسبوعًا، نُغيّب مضيفًا
 * (دليقيتر) مرضيًّا عبر مسار الأداة (تغطية+امتصاص ملفوفٌ بيوميّات الأثر البعيد)، ثمّ نكنسل
 * ونقارن بصمة كلّ يوم.   set -a; . ./.env; set +a; npx tsx scripts/test-sick-cancel-crossday.ts */
import { supabase } from '../lib/supabase';
import { requestsV2, withXdayJournal } from '../lib/algorithms/requests_v2';
import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';
import { applyCoverage, applyNewHeartRebalance } from '../lib/algorithms/solver_shadow';
import { dispatchRequestToolV2, FINAL_MARK } from '../lib/ai_v2/tools_requests_v2';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-04-05';
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const AR: Record<string, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };

async function allRows() { const { data } = await supabase.from('schedule_slots').select('doctor_id,period,clinic_number,role,status,day_of_week').eq('clinic_id', CID).eq('week_start', WEEK); return (data || []) as any[]; }
function sigByDay(rows: any[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of DAYS) out[d] = rows.filter((r) => r.day_of_week === d && r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'))
    .map((r) => `${r.doctor_id}|${r.role}|p${r.period}|c${r.clinic_number}`).sort().join('  ');
  return out;
}

async function main() {
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK);
  const pre = await loadScheduleData(CID, WEEK);
  const tm: Record<string, TraineeMode> = {};
  for (const t of (pre.data?.doctors ?? []).filter((d: any) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  await schedule.build({ weekStart: WEEK, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm, dryRun: false } as any).catch(() => {});
  const before = sigByDay(await allRows());
  if (DAYS.filter((d) => before[d]).length < 3) { console.log('أسبوعٌ غير كافٍ'); process.exit(1); }

  const rows0 = await allRows();
  const hostRow = rows0.find((r) => r.status === 'active' && r.role === 'delegator' && r.period === 1);
  if (!hostRow) { console.log('لا مضيفَ — لا حالةَ امتصاصٍ تُقاس.'); process.exit(0); }
  const day = hostRow.day_of_week;
  const { data } = await loadScheduleData(CID, WEEK);
  const host = (data?.doctors ?? []).find((d: any) => d.id === hostRow.doctor_id)!;
  const roster = (data?.doctors ?? []).map((d: any) => ({ id: d.id, name: d.name }));
  console.log(`المضيف الغائب مرضيًّا: ${host.name} يوم ${AR[day]}`);

  // ① مرضيّة عبر مسار الأداة (تغطية+امتصاص ملفوفٌ بيوميّات الأثر البعيد).
  await requestsV2.setScheduleStatus({ id: host.id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: host.id, doctorName: host.name, status: 'sick_leave', shift: 'morning' } as any);
  await withXdayJournal(CID, WEEK, { day, doctorId: host.id }, async () => {
    await applyCoverage({ clinicId: CID, weekStart: WEEK, label: 'مرضية' });
    await applyNewHeartRebalance({ clinicId: CID, weekStart: WEEK, label: 'مرضية' });
  });
  const mid = sigByDay(await allRows());
  const moved = DAYS.filter((d) => mid[d] !== before[d]);
  console.log(`  أيّامٌ تغيّرت بالمرضيّة: ${moved.map((d) => AR[d]).join('،') || 'لا شيء'} (بعيدةٌ سوى يوم الغياب: ${moved.filter((d) => d !== day).map((d) => AR[d]).join('،') || 'لا شيء'})`);

  // ② كنسل عبر مسار الأداة الحيّ.
  const idx = roster.findIndex((r) => r.id === host.id) + 1;
  const ctx: any = { clinicId: CID, user: { id: host.id, name: host.name, role: 'team_leader' }, roster };
  const raw = await dispatchRequestToolV2('cancel_schedule_status', { weekStart: WEEK, day, doctorIndex: idx }, ctx);
  console.log('  → ' + raw.replace(FINAL_MARK, '').slice(0, 90));
  const after = sigByDay(await allRows());

  console.log('\n  مقارنةُ كلّ يومٍ (قبل ↔ بعد الكنسل):');
  const farDrift: string[] = []; let sameDayDrift = false;
  for (const d of DAYS) {
    const same = after[d] === before[d];
    if (!same) { if (d === day) sameDayDrift = true; else farDrift.push(d); }
    console.log(`    ${AR[d].padStart(8)} : ${same ? '✅ مطابق' : '⚠️ مختلف'}${d === day ? '  (يوم الغياب — إرجاعُه آليّةٌ قائمةٌ مستقلّة)' : ''}`);
  }
  console.log('');
  // نطاقُ عملي = الأيّام البعيدة (الامتصاص عبر الأيّام). يومُ الغياب يملكه إرجاعُ المكان.
  if (farDrift.length === 0) console.log('  ✅ الخلاصة (الأيّام البعيدة): لا انحرافَ بعيدًا — كنسل المرضيّة يعكس الأثر البعيد بدقّة (سليم).');
  else console.log(`  🟠 انحرافٌ بعيدٌ على: ${farDrift.map((d) => AR[d]).join('، ')} — يلزم مراجعة اليوميّات.`);
  if (sameDayDrift) console.log('  ℹ️ يومُ الغياب اختلف — إرجاعُ المرضيّة في يومها (تقسيم/دليقيتر) آليّةٌ قائمةٌ مستقلّةٌ عن الأثر البعيد.');

  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK);
  process.exit(farDrift.length === 0 ? 0 : 1);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
