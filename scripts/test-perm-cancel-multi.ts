/* زحامٌ: استئذانان لمضيفين في يومين مختلفين، امتصاصُ كلٍّ قد يلمس أيّامًا بعيدةً (ربّما
 * متداخلة). نُسجّل الاثنين (كلٌّ ملفوفٌ بيوميّات الأثر البعيد كما المسار الحيّ)، ثمّ نكنسل
 * بترتيبٍ معاكس (LIFO) — هل يعود الأسبوعُ كلُّه للأساس حرفيًّا؟ ثمّ نُعيد ونكنسل بترتيبٍ
 * طرديّ (الأقدم أوّلًا) لنرى التعامل مع التشابك (تُرك + يُسجَّل، بلا إفساد).
 *   set -a; . ./.env; set +a; npx tsx scripts/test-perm-cancel-multi.ts */
import { supabase } from '../lib/supabase';
import { requestsV2, withXdayJournal } from '../lib/algorithms/requests_v2';
import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode } from '../lib/algorithms/schedule';
import { dispatchRequestToolV2, FINAL_MARK } from '../lib/ai_v2/tools_requests_v2';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEK = '2099-03-01';
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const AR: Record<string, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };
let pass = 0; let fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' — ' + d); } };

async function allRows() { const { data } = await supabase.from('schedule_slots').select('doctor_id,period,clinic_number,role,status,day_of_week').eq('clinic_id', CID).eq('week_start', WEEK); return (data || []) as any[]; }
function sigByDay(rows: any[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of DAYS) out[d] = rows.filter((r) => r.day_of_week === d && r.status === 'active' && r.period > 0 && (r.role === 'clinic' || r.role === 'delegator'))
    .map((r) => `${r.doctor_id}|${r.role}|p${r.period}|c${r.clinic_number}`).sort().join('  ');
  return out;
}
const driftDays = (a: Record<string, string>, b: Record<string, string>) => DAYS.filter((d) => a[d] !== b[d]);

async function setPerm(host: { id: string; name: string }, day: string) {
  await requestsV2.setScheduleStatus({ id: host.id, role: 'team_leader' }, { clinicId: CID, weekStart: WEEK, day: day as any, doctorId: host.id, doctorName: host.name, status: 'permission_start', shift: 'morning' } as any);
  await withXdayJournal(CID, WEEK, { day, doctorId: host.id }, () =>
    schedule.rebalanceForward({ clinicId: CID, weekStart: WEEK, fromDay: day as any, fromShift: 'morning', today: WEEK } as any)).catch(() => {});
}
async function cancelPerm(host: { id: string; name: string }, day: string, roster: { id: string; name: string }[]) {
  const idx = roster.findIndex((r) => r.id === host.id) + 1;
  const ctx: any = { clinicId: CID, user: { id: host.id, name: host.name, role: 'team_leader' }, roster };
  const raw = await dispatchRequestToolV2('cancel_schedule_status', { weekStart: WEEK, day, doctorIndex: idx }, ctx);
  return raw.replace(FINAL_MARK, '').slice(0, 80);
}

async function build() {
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK);
  const pre = await loadScheduleData(CID, WEEK);
  const tm: Record<string, TraineeMode> = {};
  for (const t of (pre.data?.doctors ?? []).filter((d: any) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  await schedule.build({ weekStart: WEEK, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm, dryRun: false } as any).catch(() => {});
}

async function main() {
  await build();
  const base = sigByDay(await allRows());
  const { data } = await loadScheduleData(CID, WEEK);
  const roster = (data?.doctors ?? []).map((d: any) => ({ id: d.id, name: d.name }));
  const rows0 = await allRows();
  // مضيفون (دليقيتر ف١) في أيّامٍ مختلفة.
  const hostsByDay = new Map<string, { id: string; name: string }>();
  for (const r of rows0.filter((x) => x.status === 'active' && x.role === 'delegator' && x.period === 1)) {
    if (!hostsByDay.has(r.day_of_week)) { const d = roster.find((x) => x.id === r.doctor_id); if (d) hostsByDay.set(r.day_of_week, d); }
  }
  const entries = [...hostsByDay.entries()];
  if (entries.length < 2) { console.log(`أقلّ من مضيفين في الأسبوع المبنيّ (${entries.length}) — لا حالةَ زحامٍ تُقاس.`); process.exit(0); }
  const [[dayA, hostA], [dayB, hostB]] = entries as any;
  console.log(`مضيفان: ${hostA.name} (${AR[dayA]}) و ${hostB.name} (${AR[dayB]})`);

  // ── سيناريو ١: تسجيل A ثمّ B، كنسل LIFO (B ثمّ A) ──
  await setPerm(hostA, dayA);
  await setPerm(hostB, dayB);
  const mid = sigByDay(await allRows());
  console.log(`  بعد الاستئذانين: أيّامٌ تغيّرت = ${driftDays(base, mid).map((d) => AR[d]).join('،') || 'لا شيء'}`);
  console.log('  كنسل B: ' + await cancelPerm(hostB, dayB, roster));
  console.log('  كنسل A: ' + await cancelPerm(hostA, dayA, roster));
  const afterLifo = sigByDay(await allRows());
  const drift1 = driftDays(base, afterLifo);
  check('LIFO: عاد الأسبوعُ كلُّه للأساس حرفيًّا', drift1.length === 0, `انحراف على: ${drift1.map((d) => AR[d]).join('،')}`);

  // ── سيناريو ٢: تسجيلٌ ثانٍ، كنسل طرديّ (A ثمّ B) — التشابك (إن وُجد) يُترَك بلا إفساد ──
  await build();
  const base2 = sigByDay(await allRows());
  await setPerm(hostA, dayA);
  await setPerm(hostB, dayB);
  console.log('  [طرديّ] كنسل A: ' + await cancelPerm(hostA, dayA, roster));
  console.log('  [طرديّ] كنسل B: ' + await cancelPerm(hostB, dayB, roster));
  const afterFifo = sigByDay(await allRows());
  const drift2 = driftDays(base2, afterFifo);
  // إفسادٌ بنيويّ = تصادمُ مقعدٍ (فترة|عيادة|دور) **زائدٌ عمّا في الأساس** (الأساس فيه
  // تصادماتٌ شرعيّةٌ: المتدرّب الظلّ يلاصق مدرّبه في نفس المقعد). نقارن العدّ، لا الوجود.
  const collisions = (rows: any[]) => {
    const c = new Map<string, number>();
    for (const r of rows.filter((x) => x.status === 'active' && x.period > 0 && (x.role === 'clinic' || x.role === 'delegator'))) {
      const k = `${r.day_of_week}|${r.period}|${r.clinic_number}|${r.role}`; c.set(k, (c.get(k) || 0) + 1);
    }
    return [...c.values()].filter((n) => n > 1).reduce((a, b) => a + (b - 1), 0);
  };
  // أعِد بناء الأساس في نسخةٍ نظيفةٍ للمقارنة العادلة (نفس الوصفة).
  const baseColl = collisions(rows0);
  const fifoColl = collisions(await allRows());
  check('طرديّ: لا إفسادٌ بنيويّ زائدٌ عن الأساس', fifoColl <= baseColl, `تصادمات: أساس=${baseColl} بعد=${fifoColl}`);
  console.log(`  [طرديّ] انحرافٌ متبقٍّ (مقبولٌ — يُصحّحه البناء التالي): ${drift2.map((d) => AR[d]).join('،') || 'لا شيء (عاد حرفيًّا)'}`);

  console.log(`\n══════ النتيجة: ${pass} PASS / ${fail} FAIL ══════`);
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', WEEK);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
