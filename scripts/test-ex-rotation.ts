// ═══════════════════════════════════════════════════════════════
// Test EX rotation across weeks
// ═══════════════════════════════════════════════════════════════
// يبني 3 أسابيع متتالية ويتحقق:
//   - أسبوع 1: مجموعة معيّنة تأخذ EX
//   - أسبوع 2: مجموعة أخرى (الذين لم يأخذوا) يأخذون EX
//   - أسبوع 3: يكمل الدور
//
// يطبع لكل طبيب عدد مرات EX عبر الأسابيع الثلاثة.
// ═══════════════════════════════════════════════════════════════

import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { ScheduleBuildInput, TraineeMode } from '../lib/algorithms/schedule';
import { supabase } from '../lib/supabase';

const CLINIC_ID = '10000000-0000-0000-0000-000000000001';

const WEEKS = ['2026-05-17', '2026-05-24', '2026-05-31']; // 3 weeks back

function divider(label: string) {
  console.log(`\n${'─'.repeat(70)}\n${label}\n${'─'.repeat(70)}`);
}

async function buildWeek(weekStart: string, traineeModes: Record<string, TraineeMode>) {
  const buildInput: ScheduleBuildInput = {
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
  };
  const result = await schedule.build(buildInput);
  return result;
}

async function queryExByWeek(weekStart: string): Promise<Map<string, number>> {
  const { data } = await supabase
    .from('schedule_slots')
    .select('doctor_id, doctor_name')
    .eq('clinic_id', CLINIC_ID)
    .eq('week_start', weekStart)
    .eq('role', 'ex')
    .eq('status', 'active');
  const counts = new Map<string, number>();
  for (const s of (data || []) as any[]) {
    counts.set(s.doctor_name, (counts.get(s.doctor_name) ?? 0) + 1);
  }
  return counts;
}

async function main() {
  // Load trainees once
  const { data, error } = await loadScheduleData(CLINIC_ID, WEEKS[0]!);
  if (error || !data) {
    console.log('Failed to load:', error);
    return;
  }
  const trainees = data.doctors.filter((d) => d.workStatus === 'trainee');
  const traineeModes: Record<string, TraineeMode> = {};
  for (const t of trainees) traineeModes[t.id] = 'independent';

  // Build all 3 weeks sequentially (week 2 sees week 1's history, etc.)
  for (const w of WEEKS) {
    divider(`بناء أسبوع ${w}`);
    const result = await buildWeek(w, traineeModes);
    console.log(`success=${result.success}, slots=${result.slotsCreated}, warnings=${result.warnings.length}`);
    if (!result.success) {
      console.log('Errors:', result.errors);
      return;
    }
  }

  // Query EX assignments per week and tally
  divider('توزيع EX عبر الأسابيع');
  const weekCounts: Map<string, number>[] = [];
  for (const w of WEEKS) {
    weekCounts.push(await queryExByWeek(w));
  }

  // Collect all doctor names that appeared in any EX
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

  // Analysis: was EX rotated?
  divider('تحليل: هل دار EX بين أسبوعين متتاليين؟');
  for (let i = 1; i < WEEKS.length; i++) {
    const prev = weekCounts[i - 1]!;
    const curr = weekCounts[i]!;
    const prevDocs = new Set([...prev.keys()].filter((k) => prev.get(k)! > 0));
    const currDocs = new Set([...curr.keys()].filter((k) => curr.get(k)! > 0));
    const overlap = [...currDocs].filter((d) => prevDocs.has(d));
    const newToEx = [...currDocs].filter((d) => !prevDocs.has(d));
    console.log(`أسبوع ${WEEKS[i]}:`);
    console.log(`  أطباء جدد لم يأخذوا EX سابقاً: ${newToEx.length} (${newToEx.join(', ') || 'لا أحد'})`);
    console.log(`  أطباء تكرّروا من الأسبوع السابق: ${overlap.length} (${overlap.join(', ') || 'لا أحد'})`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
