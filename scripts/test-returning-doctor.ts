// ═══════════════════════════════════════════════════════════════
// Test — عدالة الطبيب العائد من إجازة / الجديد (سجل صفري)
// ═══════════════════════════════════════════════════════════════
// يحيى في إجازة أسبوعَي 17 و 24 (سجل صفري) → يعود الأسبوع 31.
// المتوقّع: دليقيتر ≥ 1 (يواكب) ، احتياطي = 0 (مرتاح فيعمل عيادة).
// ═══════════════════════════════════════════════════════════════

import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { ScheduleBuildInput, TraineeMode, WeekDay, Shift } from '../lib/algorithms/schedule';
import { supabase } from '../lib/supabase';

const C = '10000000-0000-0000-0000-000000000001';
const W1 = '2026-05-17', W2 = '2026-05-24', W3 = '2026-05-31';
const RET = 'يحيى';
const A_SHIFT: Record<WeekDay, Shift> = {
  sunday: 'morning', monday: 'morning', tuesday: 'evening', wednesday: 'evening', thursday: 'evening',
};

function divider(s: string) { console.log(`\n${'═'.repeat(70)}\n${s}\n${'═'.repeat(70)}`); }
async function clear(w: string) { await supabase.from('schedule_slots').delete().eq('clinic_id', C).eq('week_start', w); }
async function modes(w: string): Promise<Record<string, TraineeMode>> {
  const { data } = await loadScheduleData(C, w); const m: Record<string, TraineeMode> = {};
  for (const t of (data?.doctors || []).filter((d) => d.workStatus === 'trainee')) m[t.id] = 'independent';
  return m;
}
function input(w: string, m: Record<string, TraineeMode>): ScheduleBuildInput {
  return {
    weekStart: w, clinicId: C, aShiftPlan: A_SHIFT,
    boardConfig: { scenario: { kind: 'hybrid_evening_days', eveningDays: ['sunday', 'monday'] }, includeInExRotation: false },
    traineeModes: m, dryRun: false,
  };
}
async function tally(w: string) {
  const { data } = await supabase.from('schedule_slots').select('doctor_id,doctor_name,day_of_week,period,clinic_number,role').eq('clinic_id', C).eq('week_start', w).eq('status', 'active');
  const t = new Map<string, { n: string; c: number; d: number; e: number }>(); const seen = new Set<string>();
  for (const r of (data || []) as any[]) {
    const o = t.get(r.doctor_id) || { n: r.doctor_name, c: 0, d: 0, e: 0 };
    const sh = r.period <= 2 ? 'm' : r.period >= 3 ? 'e' : (r.clinic_number === 1 ? 'm' : 'e');
    const k = `${r.doctor_id}|${r.day_of_week}|${sh}|${r.role}`;
    if (!seen.has(k)) { seen.add(k); if (r.role === 'clinic') o.c++; else if (r.role === 'delegator') o.d++; else if (r.role === 'ex') o.e++; }
    t.set(r.doctor_id, o);
  }
  return t;
}

async function main() {
  divider('تهيئة: مسح 17 / 24 / 31');
  for (const w of [W1, W2, W3]) await clear(w);
  const { data } = await loadScheduleData(C, W3);
  const ret = (data?.doctors || []).find((d) => d.name.includes(RET))!;
  console.log('العائد:', ret.name);

  divider('1) يحيى في إجازة — بناء 17 و 24');
  await supabase.from('doctor_group_members').update({ work_status: 'vacation' }).eq('doctor_id', ret.id);
  try {
    for (const w of [W1, W2]) { const r = await schedule.build(input(w, await modes(w))); console.log(`  ${w}: slots=${r.slotsCreated}`); }
  } finally {
    await supabase.from('doctor_group_members').update({ work_status: 'active' }).eq('doctor_id', ret.id);
  }
  console.log('  ✓ عاد إلى active');

  divider('2) بناء 31 — يحيى عائد بسجل صفري');
  const r3 = await schedule.build(input(W3, await modes(W3)));
  console.log(`slots=${r3.slotsCreated}, warnings=${r3.warnings.length}`);
  if (r3.warnings.length) console.log(r3.warnings.join('\n'));

  divider('3) توزيع الأدوار (شفت = مرة)');
  const t = await tally(W3);
  const rows = [...t.entries()].sort((a, b) => (b[1].d + b[1].e) - (a[1].d + a[1].e));
  console.log('طبيب'.padEnd(20) + 'عيادة دليقيتر احتياطي');
  for (const [id, r] of rows) console.log(`${r.n.padEnd(20)}${String(r.c).padEnd(6)}${String(r.d).padEnd(8)}${r.e}${id === ret.id ? '  ⬅️ العائد' : ''}`);
  const y = t.get(ret.id);
  divider('الخلاصة');
  console.log(`يحيى: عيادة=${y?.c ?? 0}، دليقيتر=${y?.d ?? 0}، احتياطي=${y?.e ?? 0}  | المتوقّع: دليقيتر≥1، احتياطي=0`);
}
main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
