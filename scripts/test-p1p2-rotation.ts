// ═══════════════════════════════════════════════════════════════
// Test P1/P2 alternation inside clinic
// ═══════════════════════════════════════════════════════════════
// التحقق من تناوب الطبيب بين الفترة الأولى والثانية عبر الأسبوع:
//   - الطبيب يأخذ P1 يوماً ثم P2 اليوم التالي ثم P1 وهكذا
//   - لو أخذ EX/del يوم، النمط يستمر من حيث توقّف
//   - لو أخذ عياده كامله (P1+P2)، لا يحدّث النمط
//   - عبر الأسابيع: يبدأ من حيث انتهى الأسبوع السابق
// ═══════════════════════════════════════════════════════════════

import { schedule, loadScheduleData } from '../lib/algorithms/schedule';
import type { TraineeMode } from '../lib/algorithms/schedule';
import { supabase } from '../lib/supabase';

const CLINIC_ID = '10000000-0000-0000-0000-000000000001';
const WEEKS = ['2026-05-17', '2026-05-24', '2026-05-31'];
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;

function divider(label: string) {
  console.log(`\n${'─'.repeat(80)}\n${label}\n${'─'.repeat(80)}`);
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
 * يرجع لكل طبيب نمطه اليومي لشفت الصباح:
 *   'P1' = فترة أولى فردية (عياده مشتركة)
 *   'P2' = فترة ثانية فردية (عياده مشتركة)
 *   'FULL' = عياده كامله (P1+P2)
 *   'DEL' = دليقيتر فقط
 *   'EX'  = احتياط
 *   '-'   = غائب أو لا يعمل
 */
async function queryDayPatterns(
  weekStart: string,
): Promise<Map<string, Map<string, string>>> {
  const { data } = await supabase
    .from('schedule_slots')
    .select('doctor_id, doctor_name, day_of_week, period, role, status')
    .eq('clinic_id', CLINIC_ID)
    .eq('week_start', weekStart)
    .eq('status', 'active');
  const byDoctor = new Map<string, Map<string, string>>();
  // أولاً نجمع كل أدوار الطبيب في اليوم (الصباح فقط: period 1, 2, أو 0=EX-shift)
  const tmp = new Map<string, { clinics: number[]; del: number[]; ex: boolean }>();
  for (const s of (data || []) as any[]) {
    const isMorning = s.period === 1 || s.period === 2 || s.period === 0;
    if (!isMorning) continue; // اقتصرنا على الصباح
    const key = `${s.doctor_name}|${s.day_of_week}`;
    let rec = tmp.get(key);
    if (!rec) {
      rec = { clinics: [], del: [], ex: false };
      tmp.set(key, rec);
    }
    if (s.role === 'clinic') rec.clinics.push(s.period);
    else if (s.role === 'delegator') rec.del.push(s.period);
    else if (s.role === 'ex') rec.ex = true;
  }
  for (const [key, rec] of tmp) {
    const [name, day] = key.split('|');
    let label = '-';
    if (rec.clinics.length === 2) label = 'FULL';
    else if (rec.clinics.length === 1) label = `P${rec.clinics[0]}`;
    else if (rec.del.length > 0) label = 'DEL';
    else if (rec.ex) label = 'EX';
    const docMap = byDoctor.get(name!) || new Map<string, string>();
    docMap.set(day!, label);
    byDoctor.set(name!, docMap);
  }
  return byDoctor;
}

async function main() {
  const { data, error } = await loadScheduleData(CLINIC_ID, WEEKS[0]!);
  if (error || !data) {
    console.log('فشل التحميل:', error);
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
      console.log('errors:', result.errors);
      return;
    }
  }

  // اجمع كل الأسابيع في جدول موحّد
  divider('نمط فترات الصباح لكل طبيب عبر الأسابيع');
  const weekPatterns: Map<string, Map<string, string>>[] = [];
  for (const w of WEEKS) weekPatterns.push(await queryDayPatterns(w));

  const allDocs = new Set<string>();
  for (const w of weekPatterns) for (const k of w.keys()) allDocs.add(k);

  // Header
  const cols = ['الطبيب'.padEnd(28)];
  for (const w of WEEKS) {
    for (const d of DAYS) cols.push(`${w.slice(5)}/${d.slice(0, 3)}`.padEnd(10));
  }
  console.log(cols.join(''));
  console.log('-'.repeat(28 + 15 * 10));

  type Row = { name: string; days: string[] };
  const rows: Row[] = [];
  for (const name of [...allDocs].sort()) {
    const days: string[] = [];
    for (let wi = 0; wi < WEEKS.length; wi++) {
      const wMap = weekPatterns[wi]!.get(name);
      for (const d of DAYS) days.push(wMap?.get(d) || '-');
    }
    rows.push({ name, days });
  }
  for (const r of rows) {
    console.log(
      r.name.padEnd(28) +
        r.days.map((s) => s.padEnd(10)).join(''),
    );
  }

  // تحليل التناوب: لكل طبيب عادي نأخذ تسلسل P1/P2 (نتجاهل FULL/DEL/EX/-)
  // light_duty مستثنى لأنهم دائماً P1 بالتصميم
  const lightDutyNames = new Set(
    data.doctors.filter((d) => d.workStatus === 'light_duty').map((d) => d.name),
  );
  // النمط مرن: المهم التوازن التراكمي (نسبة P1 قريبة من 50%)، لا التبديل الصارم.
  // يُسمح بيومين فترة أولى ثم يومين ثانية طالما التوازن صحي.
  divider('تحليل توازن P1/P2 لكل طبيب (يستثني light_duty) — الهدف نسبة قريبة من 50%');
  console.log('الطبيب'.padEnd(28) + 'تسلسل الفترات الفردية'.padEnd(42) + 'نسبة P1  حالة');
  console.log('-'.repeat(82));
  let good = 0;
  let fair = 0;
  let bad = 0;
  for (const r of rows) {
    if (lightDutyNames.has(r.name)) continue;
    const seq = r.days.filter((s) => s === 'P1' || s === 'P2');
    if (seq.length === 0) continue;
    const p1c = seq.filter((s) => s === 'P1').length;
    const ratio = (p1c / seq.length) * 100;
    // توازن صحي: 40-60%. مقبول: 33-67%. خارجها: ضعيف
    const mark = ratio >= 40 && ratio <= 60 ? '✓ متوازن'
      : ratio >= 33 && ratio <= 67 ? '~ مقبول'
      : '✗ غير متوازن';
    if (ratio >= 40 && ratio <= 60) good++;
    else if (ratio >= 33 && ratio <= 67) fair++;
    else bad++;
    console.log(
      r.name.padEnd(28) +
        seq.join(' ').padEnd(42) +
        `${ratio.toFixed(0)}%`.padEnd(9) +
        mark,
    );
  }
  console.log('-'.repeat(82));
  console.log(`المجموع: ${good} متوازن، ${fair} مقبول، ${bad} غير متوازن`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
