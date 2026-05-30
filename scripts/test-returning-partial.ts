// ═══════════════════════════════════════════════════════════════
// اختبار: العائد بعد غياب جزئي داخل نافذة الأسبوعين
// السيناريو (مثال المستخدم):
//   أسبوع 1 (W1): حاضر ويعمل
//   أسبوع 2 (W2): إجازة (لا خانات)
//   أسبوع 3 (W3): يعود → النافذة (أسبوعان) = W1 + W2
// المتوقّع: شرط «أقلّ من الأقران» يكشفه (حضر أسبوعاً من اثنين)،
//   فيُمهَّد بـ (الأعلى − 1) حِملاً ودليقيتراً → لا يلحق العجز،
//   يأخذ نوبة واحدة فيتساوى مع المستقرّين (لا يُحمَّل ضعفاً).
// ═══════════════════════════════════════════════════════════════
import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { WeekDay, Shift } from '../lib/algorithms/schedule';
import { supabase } from '../lib/supabase';

const C = '10000000-0000-0000-0000-000000000001';
const W1 = '2026-05-17', W2 = '2026-05-24', W3 = '2026-05-31';
const RET = 'يحيى';
const A_SHIFT: Record<WeekDay, Shift> = {
  sunday: 'morning', monday: 'morning', tuesday: 'evening', wednesday: 'evening', thursday: 'evening',
};

async function clear(w: string) {
  await supabase.from('schedule_slots').delete().eq('clinic_id', C).eq('week_start', w);
}
async function setStatus(name: string, status: string) {
  const { data } = await supabase.from('doctor_group_members')
    .select('id, doctor_name').ilike('doctor_name', `%${name}%`);
  for (const r of (data || []) as any[]) {
    await supabase.from('doctor_group_members').update({ work_status: status }).eq('id', r.id);
  }
}
async function build(w: string) {
  const { data } = await loadScheduleData(C, w);
  const tmodes: Record<string, 'independent'> = {};
  for (const t of (data?.doctors || []).filter((d) => d.workStatus === 'trainee')) tmodes[t.id] = 'independent';
  return schedule.build({
    weekStart: w, clinicId: C, aShiftPlan: A_SHIFT,
    boardConfig: { scenario: { kind: 'separate_schedule' }, includeInExRotation: false },
    traineeModes: tmodes, dryRun: false,
  });
}
async function periodsOf(w: string, group: string) {
  const { data: dd } = await loadScheduleData(C, w);
  const ids = new Map((dd?.doctors || []).filter((d) => d.groupTemplate.key === group).map((d) => [d.id, d.name]));
  const { data } = await supabase.from('schedule_slots')
    .select('doctor_id, period, clinic_number, role')
    .eq('clinic_id', C).eq('week_start', w).eq('status', 'active');
  const per = new Map<string, number>(); const solo = new Map<string, number>();
  const clinicKey = new Map<string, number>();
  for (const r of (data || []) as any[]) {
    if (!ids.has(r.doctor_id)) continue;
    if (r.role === 'clinic' || r.role === 'delegator') per.set(r.doctor_id, (per.get(r.doctor_id) ?? 0) + 1);
    if (r.role === 'clinic') {
      const sh = r.period <= 2 ? 'm' : 'e';
      const k = `${r.doctor_id}|${sh}|${r.clinic_number}`;
      clinicKey.set(k, (clinicKey.get(k) ?? 0) + 1);
    }
  }
  for (const [k, n] of clinicKey) { if (n === 2) { const id = k.split('|')[0]!; solo.set(id, (solo.get(id) ?? 0) + 1); } }
  return { ids, per, solo };
}

async function main() {
  console.log('تهيئة: مسح الأسابيع وإرجاع', RET, 'نشطاً…');
  await clear(W1); await clear(W2); await clear(W3);
  await setStatus(RET, 'active');

  console.log(`\n[W1 ${W1}] ${RET} حاضر — بناء…`);
  await build(W1);

  console.log(`\n[W2 ${W2}] ${RET} إجازة — بناء…`);
  await setStatus(RET, 'vacation');
  await build(W2);

  console.log(`\n[W3 ${W3}] ${RET} يعود — بناء (النافذة = W1+W2)…`);
  await setStatus(RET, 'active');
  const r3 = await build(W3);
  console.log('تحذيرات W3:', r3.warnings.filter((w) => w.includes('مُهّد') || w.includes(RET)));

  // تقرير: فترات كل طبيب في W3 (قروب يحيى = group_a)
  const { data: dd3 } = await loadScheduleData(C, W3);
  const ldSet = new Set((dd3?.doctors || []).filter((d) => d.workStatus === 'light_duty').map((d) => d.id));
  const { ids, per, solo } = await periodsOf(W3, 'group_a');
  console.log(`\nفترات قروب A في الأسبوع الثالث (W3) — العائد = ${RET}:`);
  console.log('الطبيب'.padEnd(22) + 'فترات  منفرد');
  const vals: number[] = []; let retPeriods = 0;
  for (const [id, name] of ids) {
    const p = per.get(id) ?? 0; const s = solo.get(id) ?? 0;
    if (p === 0) continue;
    const isLD = ldSet.has(id);
    const mark = name.includes(RET) ? '  ← عائد' : (isLD ? '  (تخفيف)' : '');
    console.log(name.padEnd(22) + String(p).padEnd(7) + String(s) + mark);
    if (name.includes(RET)) retPeriods = p;
    if (!isLD) vals.push(p); // نستثني التخفيف من نطاق المقارنة
  }
  const max = Math.max(...vals), min = Math.min(...vals);
  console.log(`\nنطاق العاديين (بلا تخفيف): ${min}–${max} فترة. العائد = ${retPeriods}.`);
  console.log(max - min <= 2
    ? '✓ العائد ضمن نطاق الأقران — اندمج بالتوازي، لا حِمل مضاعف (بلا تمهيد كان سيقارب الضعف).'
    : '✗ فارق كبير — تحقّق.');
}

main().catch((e) => { console.error(e); process.exit(1); });
