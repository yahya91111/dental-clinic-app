// تشخيص العدالة: لماذا يتكرّر «المنفرد» عبر الأيام؟
//   يقارن: المنفرد الفعليّ المكتوب في الجدول  vs  ما يُنتجه إعادة التشغيل (replay).
//   ويطبع مقدّمة عجلة الانفراد قبل كلّ يوم — فنرى إن كانت تدور فعلاً.
//
// تشغيل:  npx tsx --env-file=.env scripts/diag-fairness.ts [week_start]
import { supabase } from '../lib/supabase';
import { loadScheduleData, loadBuildConfig, computeWeekPlan, redistributeShift } from '../lib/algorithms/schedule';
import { createWheels, distributeShiftWheel, applyExAbsence } from '../lib/algorithms/wheel';
import type { ScheduleBuildInput, WeekDay, Shift } from '../lib/algorithms/schedule';

const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const SHIFTS: Shift[] = ['morning', 'evening'];

function currentSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function main() {
  const ws = process.argv[2] || currentSunday();

  const { data: anyRow } = await supabase.from('schedule_slots')
    .select('clinic_id').eq('week_start', ws).limit(1).maybeSingle();
  const clinicId = (anyRow as { clinic_id?: string } | null)?.clinic_id;
  if (!clinicId) { console.log('لا صفوف لهذا الأسبوع:', ws); return; }

  const { data } = await loadScheduleData(clinicId, ws);
  const recipe = await loadBuildConfig(clinicId, ws);
  if (!data) { console.log('تعذّر تحميل البيانات.'); return; }
  if (!recipe) { console.log('لا وصفة محفوظة — أعِد بناء الجدول.'); return; }

  const nameById = new Map(data.doctors.map((d) => [d.id, d.name] as const));
  const nm = (id: string) => nameById.get(id) || id.slice(0, 6);

  console.log(`الأسبوع: ${ws} — العيادات: ${data.clinicCount}\n`);

  // ── (أ) المنفرد الفعليّ المكتوب في الجدول: طبيب له خانتا عيادة بنفس يوم/شفت/عيادة ──
  console.log('═══ المنفرد الفعليّ (من الجدول المكتوب) ═══');
  for (const day of DAYS) {
    for (const shift of SHIFTS) {
      const periods = shift === 'morning' ? [1, 2] : [3, 4];
      const cells = data.existingSlots.filter((s) => s.dayOfWeek === day && s.status === 'active'
        && s.role === 'clinic' && periods.includes(s.period));
      const byClinic = new Map<number, Set<string>>();
      for (const s of cells) (byClinic.get(s.clinicNumber) ?? byClinic.set(s.clinicNumber, new Set()).get(s.clinicNumber)!).add(s.doctorId);
      const cnt = new Map<string, number>();
      for (const s of cells) cnt.set(`${s.clinicNumber}|${s.doctorId}`, (cnt.get(`${s.clinicNumber}|${s.doctorId}`) ?? 0) + 1);
      const solos = [...cnt.entries()].filter(([, c]) => c === 2).map(([k]) => nm(k.split('|')[1]!));
      const absent = data.existingSlots.filter((s) => s.dayOfWeek === day
        && (s.status === 'sick_leave' || s.status === 'vacation')).map((s) => nm(s.doctorId));
      if (solos.length || absent.length)
        console.log(`  ${day}/${shift}: منفرد=[${solos.join('، ') || '—'}]  غياب=[${[...new Set(absent)].join('، ') || '—'}]`);
    }
  }

  // ── (ب) إعادة التشغيل (نفس منطق redistributeShift) ──
  console.log('\n═══ إعادة التشغيل (recompute) — منفرد العجلة + مقدّمتها ═══');
  const input: ScheduleBuildInput = { ...recipe, clinicId, weekStart: ws, dryRun: true };
  const plan = computeWeekPlan(input, data);
  const wheels = createWheels(data.doctors, data.pastSlots);

  console.log(`  مقدّمة عجلة الانفراد (من السجل السابق فقط): ${wheels.solo.slice(0, 6).map(nm).join(' ← ')}\n`);

  for (const d of plan) {
    if (d.isHoliday) continue;
    const exFront = wheels.ex[0];
    const front = wheels.solo.slice(0, 4).map(nm).join('، ');
    const soloPicks: string[] = [];
    for (const shift of SHIFTS) {
      const sp = shift === 'morning' ? d.morning : d.evening;
      if (!sp) continue;
      const res = distributeShiftWheel(d.day, data.clinicCount, sp, wheels, input.delegatorEnabled);
      // المنفرد = طبيب بخانتي clinic بنفس العيادة في هذا الشفت
      const cnt = new Map<string, number>();
      for (const s of res.slots) if (s.role === 'clinic') cnt.set(`${s.clinicNumber}|${s.doctor.id}`, (cnt.get(`${s.clinicNumber}|${s.doctor.id}`) ?? 0) + 1);
      for (const [k, c] of cnt) if (c === 2) soloPicks.push(`${shift[0]}:${nm(k.split('|')[1]!)}`);
    }
    const absentToday = new Set<string>();
    for (const a of d.morning?.absent ?? []) absentToday.add(a.doctor.id);
    for (const a of d.evening?.absent ?? []) absentToday.add(a.doctor.id);
    applyExAbsence(wheels, absentToday, exFront);
    console.log(`  ${d.day}: مقدّمة[${front}] → اختار منفرد=[${soloPicks.join('، ') || '—'}]  غياب=[${[...absentToday].map(nm).join('، ') || '—'}]`);
  }

  // ── (ج) النتيجة الجديدة الفعليّة لـ redistributeShift (العدالة من الواقع) ──
  console.log('\n═══ اقتراح redistributeShift الجديد (يقرأ المكتوب فعلًا) ═══');
  for (const day of DAYS) {
    for (const shift of SHIFTS) {
      const r = await redistributeShift({ clinicId, weekStart: ws, day, shift });
      if (!r.success) continue;
      const cnt = new Map<string, number>();
      for (const s of r.slots) if (s.role === 'clinic') cnt.set(`${s.clinicNumber}|${s.doctor.id}`, (cnt.get(`${s.clinicNumber}|${s.doctor.id}`) ?? 0) + 1);
      const solos = [...cnt.entries()].filter(([, c]) => c === 2).map(([k]) => nm(k.split('|')[1]!));
      if (solos.length) console.log(`  ${day}/${shift}: منفرد=[${solos.join('، ')}]`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
