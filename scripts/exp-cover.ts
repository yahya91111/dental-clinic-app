// تجربة ٢: تعويض النقص بإعادة توزيع الشفت (من الوصفة المحفوظة، بلا تخمين).
//   يعرض: الجدول الحاليّ (فيه النقص) ⟵ الجديد (بعد إعادة التوزيع) ⟵ الفرق.
//   يرسم أزواج (مدرّب + ظلّه) في نفس المقعد. لا كتابة في DB — حساب فقط.
//
// تشغيل:   npx tsx --env-file=.env scripts/exp-cover.ts [day] [shift] [اسم طبيب للمحاكاة]
//   بلا اسم → يستعمل الغيابات المسجَّلة فعلًا في الجدول (الأصحّ).
import { supabase } from '../lib/supabase';
import { schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift } from '../lib/algorithms/schedule';

function currentSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const cell = (clinic: number, period: number, role: string) =>
  role === 'delegator' ? `دليقيتر/ف${period}` : role === 'ex' ? 'احتياط' : `ع${clinic}/ف${period}`;

// مقعد → قائمة أسماء (مدرّب + ظلّ قد يجتمعان)
function seatMap(rows: { clinic: number; period: number; role: string; name: string }[]) {
  const m = new Map<string, string[]>();
  for (const r of rows) {
    const k = `${r.role}|${r.clinic}|${r.period}`;
    (m.get(k) ?? m.set(k, []).get(k)!).push(r.name);
  }
  for (const v of m.values()) v.sort();
  return m;
}
const join = (names?: string[]) => (names && names.length ? names.join(' + ') : '—');

async function main() {
  const ws = currentSunday();
  const day = (process.argv[2] as WeekDay) || 'sunday';
  const shift = (process.argv[3] as Shift) || 'morning';
  const simName = process.argv[4];
  const periods = shift === 'morning' ? [1, 2] : [3, 4];

  const { data: anyRow } = await supabase.from('schedule_slots')
    .select('clinic_id').eq('week_start', ws).eq('day_of_week', day).limit(1).maybeSingle();
  const clinicId = (anyRow as { clinic_id?: string } | null)?.clinic_id;
  if (!clinicId) { console.log('لا صفوف لليوم.'); return; }

  const { data: rows } = await supabase.from('schedule_slots')
    .select('clinic_number, period, role, doctor_id, doctor_name, status')
    .eq('clinic_id', clinicId).eq('week_start', ws).eq('day_of_week', day);
  const all = (rows || []) as { clinic_number: number; period: number; role: string; doctor_id: string; doctor_name: string; status: string }[];

  const cur = all.filter((s) => s.status === 'active'
    && ((s.role === 'clinic' && periods.includes(s.period)) || (s.role === 'delegator' && periods.includes(s.period))))
    .map((s) => ({ clinic: s.clinic_number, period: s.period, role: s.role, name: s.doctor_name }));
  const absentNow = all.filter((s) => s.period === 0 && (s.status === 'sick_leave' || s.status === 'vacation')).map((s) => s.doctor_name);

  let sim;
  if (simName) {
    const v = cur.find((s) => s.role === 'clinic' && s.name.includes(simName));
    const vid = all.find((s) => s.doctor_name.includes(simName))?.doctor_id;
    if (!v || !vid) { console.log('لم أجد الطبيب للمحاكاة.'); return; }
    sim = [{ doctorId: vid, day, scope: 'full' as const, status: 'sick_leave' as const }];
    console.log(`═══ ${day}/${shift} — محاكاة غياب «${v.name}» ═══`);
  } else {
    console.log(`═══ ${day}/${shift} — الغيابات المسجَّلة: ${absentNow.join('، ') || 'لا شيء'} ═══`);
  }

  const res = await schedule.redistributeShift({ clinicId, weekStart: ws, day, shift, simulateAbsences: sim });
  if (!res.success) { console.log('✗', res.error); return; }

  const oldM = seatMap(cur);
  const newM = seatMap(res.slots.filter((s) => s.role !== 'ex').map((s) => ({ clinic: s.clinicNumber, period: s.period, role: s.role, name: s.doctor.name })));

  console.log('\n— الحاليّ —');
  for (const k of [...oldM.keys()].sort()) { const [r, c, p] = k.split('|'); console.log(`  ${cell(+c, +p, r).padEnd(12)} — ${join(oldM.get(k))}`); }
  console.log('\n— الجديد (إعادة التوزيع) —');
  for (const k of [...newM.keys()].sort()) { const [r, c, p] = k.split('|'); console.log(`  ${cell(+c, +p, r).padEnd(12)} — ${join(newM.get(k))}`); }
  const ex = res.slots.filter((s) => s.role === 'ex').map((s) => s.doctor.name);
  if (ex.length) console.log(`  ${'احتياط'.padEnd(12)} — ${ex.sort().join('، ')}`);

  console.log('\n— الفرق —');
  let n = 0;
  for (const k of [...new Set([...oldM.keys(), ...newM.keys()])].sort()) {
    const o = join(oldM.get(k)), nv = join(newM.get(k));
    if (o === nv) continue;
    const [r, c, p] = k.split('|');
    console.log(`  ${cell(+c, +p, r).padEnd(12)}: ${o}  →  ${nv}`);
    n++;
  }
  if (!n) console.log('  (لا تغيير)');
  if (res.warnings.length) console.log('\n  ⚠ ' + res.warnings.join(' | '));
}
main().catch((e) => { console.error(e); process.exit(1); });
