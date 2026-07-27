/**
 * قياسُ ما يجري على الخيطِ الرئيسِ عندَ دخولِ صفحةِ الدور.
 *
 * الشكوى «تقطيعٌ عندَ الدخول» لها احتمالان لا ثالثَ لهما: إمّا حسابٌ ثقيلٌ يشغلُ
 * جافاسكربت فتفوتُ الإطارات، وإمّا تركيبُ مناظرَ كثيرةٍ دفعةً واحدة. هذا الملفُّ
 * يفصلُ الأوّلَ عن الثاني: يقيسُ الحسابَ وحدَه بلا رسم. فإن كان الحسابُ سريعًا
 * فالعلّةُ في طبقةِ العرضِ لا في الأرقام.
 *
 *   EXPO_PUBLIC_SUPABASE_URL="http://localhost" EXPO_PUBLIC_SUPABASE_ANON_KEY="x" \
 *   npx tsx scripts/bench-queue.ts
 */
import { buildLanes, snapshotChart, localDay, type Break } from '../screens/MainQueue/queueLanes';
import type { Patient } from '../screens/MainQueue/constants';

const TX = ['Filling', 'Extraction', 'Scaling', 'Pulpectomy', 'Cementation'];
const at = (min: number) => { const d = new Date(); d.setHours(Math.floor(min / 60), min % 60, 0, 0); return d; };

// طابورٌ واقعيٌّ: ثلثٌ أُنجِزَ، وقليلٌ داخلَ العيادات، والباقي ينتظر
function makeQueue(n: number): Patient[] {
  const out: Patient[] = [];
  for (let i = 0; i < n; i++) {
    const done = i < n / 3;
    const inClinic = !done && i < n / 3 + 3;
    const reg = 8 * 60 + i * 2;
    out.push({
      id: `p${i}`, queue_number: i + 1, name: `Patient ${i}`, age: 30,
      clinic: done || inClinic ? `Clinic ${(i % 3) + 1}` : 'Clinic',
      condition: 'Pain', treatment: TX[i % TX.length],
      timestamp: at(reg), registered_at: at(reg),
      status: done ? 'complete' : 'normal',
      isElderly: i % 11 === 0,
      expected_minutes: 20 + (i % 4) * 10,
      clinic_entry_at: done || inClinic ? at(reg + 5) : undefined,
      completed_at: done ? at(reg + 25) : undefined,
    } as Patient);
  }
  return out;
}

const CHAIRS = ['Clinic 1', 'Clinic 2', 'Clinic 3'];
const BREAKS: Break[] = [{ start: 13 * 60, end: 14 * 60 + 30, fixed: true }];
const NOW = 12 * 60 + 40;

// نفسُ البصمةِ التي يبنيها QueueTimeline قبلَ حفظِ اللقطة
const sigOf = (ps: Patient[], chairs: number) =>
  ps.map((p) => `${p.id}:${p.status}:${p.expected_minutes}:${p.appointment_min}:${p.clinic_entry_at?.getTime() ?? ''}:${p.completed_at?.getTime() ?? ''}:${p.na_at?.getTime() ?? ''}`)
    .join('|') + `#${JSON.stringify(BREAKS)}#${chairs}`;

const time = (label: string, runs: number, fn: () => void): number => {
  fn();                                   // إحماء
  const t0 = performance.now();
  for (let r = 0; r < runs; r++) fn();
  const ms = (performance.now() - t0) / runs;
  console.log(`   ${label.padEnd(26)} ${ms.toFixed(2)} ms`);
  return ms;
};

console.log('\n  قياسُ حسابِ صفحةِ الدور (بلا رسم)\n');
for (const n of [30, 60, 200, 500]) {
  const ps = makeQueue(n);
  console.log(`  ── ${n} مريضًا ──`);
  const a = time('buildLanes', 20, () => { buildLanes(ps, NOW, CHAIRS, BREAKS); });
  const data = buildLanes(ps, NOW, CHAIRS, BREAKS);
  const b = time('snapshotChart', 20, () => { snapshotChart(data, BREAKS, localDay(), NOW); });
  const c = time('signature', 20, () => { sigOf(ps, 3); });
  const d = time('JSON.stringify(snapshot)', 20, () => {
    JSON.stringify(snapshotChart(data, BREAKS, localDay(), NOW));
  });
  const total = a + b + c + d;
  const frames = total / 16.7;
  console.log(`   ${'المجموع'.padEnd(24)} ${total.toFixed(2)} ms  ≈ ${frames.toFixed(1)} إطار\n`);
}
