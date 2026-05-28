// ═══════════════════════════════════════════════════════════════
// Test Delegator rotation across weeks
// ═══════════════════════════════════════════════════════════════
// نفس فكرة EX rotation لكن لـ delegator role.
// التحقق:
//   - كل طبيب يأخذ delegator بالدور
//   - مرة واحدة لكل شفت (solo del = 1 ليس 2)
//   - الذي أخذ ينتقل لآخر الطابور
//   - يحمل بين الأسابيع
//   - light_duty يدخل الدوران أيضاً
// ═══════════════════════════════════════════════════════════════

import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { ScheduleBuildInput, TraineeMode } from '../lib/algorithms/schedule';
import { supabase } from '../lib/supabase';

const CLINIC_ID = '10000000-0000-0000-0000-000000000001';
const WEEKS = ['2026-05-17', '2026-05-24', '2026-05-31'];

function divider(label: string) {
  console.log(`\n${'─'.repeat(70)}\n${label}\n${'─'.repeat(70)}`);
}

async function buildWeek(weekStart: string, traineeModes: Record<string, TraineeMode>) {
  return schedule.build({
    weekStart,
    clinicId: CLINIC_ID,
    aShiftPlan: {
      sunday: 'morning', monday: 'morning', tuesday: 'morning',
      wednesday: 'morning', thursday: 'morning',
    },
    boardConfig: {
      scenario: { kind: 'all_morning' },
      includeInExRotation: false,
    },
    traineeModes,
    dryRun: false,
  });
}

/**
 * يعدّ مرات أخذ delegator لكل طبيب — 1 لكل شفت
 * (solo del = 2 خانات لكن 1 شفت → 1 count)
 */
async function queryDelByWeek(weekStart: string): Promise<Map<string, number>> {
  const { data } = await supabase
    .from('schedule_slots')
    .select('doctor_id, doctor_name, day_of_week, period')
    .eq('clinic_id', CLINIC_ID)
    .eq('week_start', weekStart)
    .eq('role', 'delegator')
    .eq('status', 'active');
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const s of (data || []) as any[]) {
    const shift = s.period <= 2 ? 'morning' : 'evening';
    const key = `${s.doctor_id}|${s.day_of_week}|${shift}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts.set(s.doctor_name, (counts.get(s.doctor_name) ?? 0) + 1);
  }
  return counts;
}

async function main() {
  const { data, error } = await loadScheduleData(CLINIC_ID, WEEKS[0]!);
  if (error || !data) {
    console.log('Failed:', error);
    return;
  }
  const trainees = data.doctors.filter((d) => d.workStatus === 'trainee');
  const traineeModes: Record<string, TraineeMode> = {};
  for (const t of trainees) traineeModes[t.id] = 'independent';

  for (const w of WEEKS) {
    divider(`بناء ${w}`);
    const result = await buildWeek(w, traineeModes);
    console.log(`success=${result.success}, slots=${result.slotsCreated}, warnings=${result.warnings.length}`);
    if (!result.success) {
      console.log('Errors:', result.errors);
      return;
    }
  }

  divider('توزيع Delegator عبر الأسابيع (شفت واحد = مرة واحدة)');
  const weekCounts: Map<string, number>[] = [];
  for (const w of WEEKS) weekCounts.push(await queryDelByWeek(w));

  const allDocs = new Set<string>();
  for (const w of weekCounts) for (const k of w.keys()) allDocs.add(k);

  console.log(
    'الطبيب'.padEnd(30) +
      WEEKS.map((w) => w.slice(5)).map((s) => s.padEnd(12)).join('') +
      'إجمالي',
  );
  console.log('-'.repeat(80));
  const totals: { name: string; counts: number[]; total: number }[] = [];
  for (const docName of allDocs) {
    const counts = weekCounts.map((w) => w.get(docName) ?? 0);
    const total = counts.reduce((a, b) => a + b, 0);
    totals.push({ name: docName, counts, total });
  }
  totals.sort((a, b) => b.total - a.total);

  for (const t of totals) {
    console.log(
      t.name.padEnd(30) +
        t.counts.map((c) => String(c).padEnd(12)).join('') +
        String(t.total),
    );
  }

  // Analysis
  divider('تحليل: التدوير بين الأسابيع');
  for (let i = 1; i < WEEKS.length; i++) {
    const prev = weekCounts[i - 1]!;
    const curr = weekCounts[i]!;
    const prevDocs = new Set([...prev.keys()].filter((k) => prev.get(k)! > 0));
    const currDocs = new Set([...curr.keys()].filter((k) => curr.get(k)! > 0));
    const newToDel = [...currDocs].filter((d) => !prevDocs.has(d));
    console.log(`أسبوع ${WEEKS[i]}: أطباء جدد أخذوا del (لم يأخذوا في السابق): ${newToDel.length}`);
    if (newToDel.length > 0) console.log(`  ${newToDel.join(', ')}`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
