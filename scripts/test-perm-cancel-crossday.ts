/* هل يترك كنسلُ الاستئذان أثرًا على يومٍ آخر (امتصاصٌ عبر الأيّام لم يُعكَس)؟
 * نبني أسبوعًا كاملًا واقعيًّا عبر القلب الحقيقيّ، نلتقط بصمةَ كلّ الأيّام، نُسجّل استئذانَ
 * مضيفٍ + نمرّ بإعادة التوازن الحيّة (rebalanceForward)، ثمّ نكنسل، ونقارن بصمةَ كلّ يوم.
 *   set -a; . ./.env; set +a; npx tsx scripts/test-perm-cancel-crossday.ts */
import { supabase } from '../lib/supabase';
import { requestsV2 } from '../lib/algorithms/requests_v2';
import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';
import { dispatchRequestToolV2, FINAL_MARK } from '../lib/ai_v2/tools_requests_v2';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-02-01';
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const AR: Record<string, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };

async function allRows() { const { data } = await supabase.from('schedule_slots').select('doctor_id,period,clinic_number,role,status,day_of_week').eq('clinic_id', CID).eq('week_start', WEEK); return (data || []) as any[]; }
// بصمةٌ لكلّ يومٍ على حِدة (خانات عيادة/استضافة نشطة).
function sigByDay(rows: any[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of DAYS) out[d] = rows.filter((r) => r.day_of_week === d && r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'))
    .map((r) => `${r.doctor_id}|${r.role}|p${r.period}|c${r.clinic_number}`).sort().join('  ');
  return out;
}

async function main() {
  // ابنِ أسبوعًا واقعيًّا عبر القلب الحقيقيّ (لا خاناتٍ مُصطنَعة) ليكون فيه مضيفٌ ودورات.
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK);
  const pre = await loadScheduleData(CID, WEEK);
  const tm: Record<string, TraineeMode> = {};
  for (const t of (pre.data?.doctors ?? []).filter((d: any) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: WEEK, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
  const built = await schedule.build({ ...recipe, dryRun: false } as any).catch((e: any) => ({ error: e?.message }));
  const before = sigByDay(await allRows());
  const nonEmpty = DAYS.filter((d) => before[d]);
  if (nonEmpty.length < 3) { console.log('تعذّر بناءُ أسبوعٍ كافٍ — ', JSON.stringify(built).slice(0, 160)); process.exit(1); }

  // اعثر على مضيفٍ (دليقيتر) في يومٍ — هو موضوع الاستئذان.
  const rows0 = await allRows();
  const hostRow = rows0.find((r) => r.status === 'active' && r.role === 'delegator' && r.period === 1);
  if (!hostRow) { console.log('لا مضيفَ في الأسبوع المبنيّ (شكلٌ بلا دليقيتر) — لا حالةَ امتصاصٍ تُقاس.'); process.exit(0); }
  const hostDay = hostRow.day_of_week;
  const { data } = await loadScheduleData(CID, WEEK);
  const host = (data?.doctors ?? []).find((d: any) => d.id === hostRow.doctor_id)!;
  const roster = (data?.doctors ?? []).map((d: any) => ({ id: d.id, name: d.name }));
  // تشخيص: أدوارُ المضيف ذلك اليوم + هل ثمّة بديلٌ (طبيب ف٢ حرٌّ في ف١)؟
  const hd = rows0.filter((r) => r.day_of_week === hostDay && r.doctor_id === host.id && r.status === 'active' && r.period > 0);
  const p2docs = [...new Set(rows0.filter((r) => r.day_of_week === hostDay && r.status === 'active' && r.role === 'clinic' && r.period === 2).map((r) => r.doctor_id))];
  const worksP1 = (id: string) => rows0.some((r) => r.day_of_week === hostDay && r.doctor_id === id && r.status === 'active' && r.period === 1);
  const promos = p2docs.filter((id) => id !== host.id && !worksP1(id));
  console.log(`المضيف: ${host.name} يوم ${AR[hostDay]} — أدوارُه: ${hd.map((r) => `${r.role}p${r.period}`).join(',')} | بدلاءُ ف٢-حرٌّ-في-ف١: ${promos.length}`);
  console.log(`  (أطبّاء ف٢: ${p2docs.length} | منهم حرٌّ في ف١: ${promos.length})`);

  // ① استئذان + إعادة التوازن الحيّة (كما المسار الفعليّ).
  await requestsV2.setScheduleStatus({ id: host.id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: hostDay as any, doctorId: host.id, doctorName: host.name, status: 'permission_start', shift: 'morning' } as any);
  const blockedNow = async () => (await allRows()).some((r) => r.day_of_week === hostDay && r.doctor_id === host.id && r.status === 'active' && r.period === 1 && (r.role === 'clinic' || r.role === 'delegator'));
  const conflictAfterSet = await blockedNow();
  await schedule.rebalanceForward({ clinicId: CID, weekStart: WEEK, fromDay: hostDay as any, fromShift: 'morning', today: WEEK } as any).catch(() => {});
  const conflictAfterRebalance = await blockedNow();
  console.log(`  بعد التسجيل: المستأذِن في ف١ المحجوبة؟ ${conflictAfterSet ? '🚨 نعم' : '✅ لا'} | بعد إعادة التوازن؟ ${conflictAfterRebalance ? '🚨 نعم (أُعيد التعارض)' : '✅ لا'}`);
  const mid = sigByDay(await allRows());
  const movedDays = DAYS.filter((d) => mid[d] !== before[d]);
  console.log(`  أيّامٌ تغيّرت بالاستئذان: ${movedDays.map((d) => AR[d]).join('، ') || 'لا شيء'} (سوى يوم الاستئذان ${AR[hostDay]}: ${movedDays.filter((d) => d !== hostDay).map((d) => AR[d]).join('، ') || 'لا أيّام أخرى'})`);

  // ② كنسل عبر مسار الأداة الحيّ.
  const idx = roster.findIndex((r) => r.id === host.id) + 1;
  const ctx: any = { clinicId: CID, user: { id: host.id, name: host.name, role: 'team_leader' }, roster };
  const raw = await dispatchRequestToolV2('cancel_schedule_status', { weekStart: WEEK, day: hostDay, doctorIndex: idx }, ctx);
  console.log('  → ' + raw.replace(FINAL_MARK, '').slice(0, 100));
  const afterCancelOnly = sigByDay(await allRows());
  const driftBefore = DAYS.filter((d) => d !== hostDay && afterCancelOnly[d] !== before[d]);
  // جرّب التنظيف: إعادةُ توازنٍ بعد العكس الحرفيّ — هل تُلغي تعويضَ اليوم البعيد؟
  await schedule.rebalanceForward({ clinicId: CID, weekStart: WEEK, fromDay: hostDay as any, fromShift: 'morning', today: WEEK } as any).catch(() => {});
  const after = sigByDay(await allRows());
  const driftAfter = DAYS.filter((d) => d !== hostDay && after[d] !== before[d]);
  console.log(`  انحرافٌ بعيدٌ بعد الكنسل وحده: ${driftBefore.map((d) => AR[d]).join('،') || 'لا شيء'} | بعد إعادة توازنٍ تنظيفيّة: ${driftAfter.map((d) => AR[d]).join('،') || 'لا شيء'}`);

  // قارن كلّ يوم: هل عاد كما كان؟
  console.log('\n  مقارنةُ كلّ يومٍ (قبل ↔ بعد الكنسل):');
  let exactAll = true; const drifted: string[] = [];
  for (const d of DAYS) {
    const same = after[d] === before[d];
    if (!same) { exactAll = false; drifted.push(d); }
    console.log(`    ${AR[d].padStart(8)} : ${same ? '✅ مطابق' : '⚠️ مختلف'}${d === hostDay ? '  (يوم الاستئذان)' : ''}`);
  }
  console.log('');
  if (exactAll) console.log('  ✅ الخلاصة: عاد الأسبوعُ كلُّه حرفيًّا — لا أثرَ بعيدًا (لا حاجة لتعديل).');
  else if (drifted.length === 1 && drifted[0] === hostDay) console.log('  ⚠️ يومُ الاستئذان وحده اختلف — انظر (الكنسل الحرفيّ يفترض ثباته).');
  else console.log(`  🟠 الخلاصة: انحرافٌ عبر الأيّام فعليّ على: ${drifted.filter((d) => d !== hostDay).map((d) => AR[d]).join('، ')} — هنا يلزم التعديل (عكسُ الامتصاص البعيد).`);

  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK);
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
