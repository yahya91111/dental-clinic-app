// اختبار «الموازنة للأمام» في الذاكرة (لا يكتب على قاعدة البيانات).
//   يبني الجدول القانونيّ (dry build) من الوصفة المحفوظة، ثمّ:
//   (١) اختبار «بلا عبث»: يحاكي إعادة الحساب لكلّ شفت من الجدول القانونيّ نفسه
//       ويتأكّد أنّ النتيجة مطابقة (وإلّا فالمحرّك سيُعيد كتابة شفتات لم تتغيّر).
//   (٢) اختبار «التتالي»: يُغيّب طبيبًا يومًا، يحاكي التعويض، ثمّ يمسح الأمام
//       ويطبع أيّ الشفتات تغيّرت فعلًا وأيّها بقي ثابتًا (يطابق منطق rebalanceForward).
//
// تشغيل:  npx tsx --env-file=.env scripts/test-rebalance.ts [week_start] [absentName] [absentDay]
//   مثال:  ...test-rebalance.ts 2026-06-14 محمد monday
import { supabase } from '../lib/supabase';
import {
  schedule, loadScheduleData, loadBuildConfig, computeWeekPlan, SHIFT_PERIODS,
} from '../lib/algorithms/schedule';
import { createWheels, distributeShiftWheel } from '../lib/algorithms/wheel';
import type {
  ScheduleBuildInput, WeekDay, Shift, Period, LoadedSlot, LoadedData, AssignedSlot, LoadedDoctor,
} from '../lib/algorithms/schedule';

const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DAY_AR: Record<WeekDay, string> = {
  sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس',
};
const DAY_IDX: Record<WeekDay, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
const shAr = (s: Shift) => (s === 'morning' ? 'صباحًا' : 'مساءً');

function currentSunday(): string {
  const d = new Date(); d.setDate(d.getDate() - d.getDay());
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// AssignedSlot[] → LoadedSlot[] (نفس تمثيل DB: الاحتياط role=clinic/status=extra/period0).
function toLoaded(slots: AssignedSlot[], weekStart: string): LoadedSlot[] {
  return slots.map((s, i) => ({
    id: `mem-${i}`, weekStart, dayOfWeek: s.day,
    period: s.role === 'ex' ? 0 : s.period,
    clinicNumber: s.clinicNumber,
    doctorId: s.doctor.id, doctorName: s.doctor.name,
    role: (s.role === 'ex' ? 'clinic' : s.role) as LoadedSlot['role'],
    status: (s.role === 'ex' ? 'extra' : 'active') as LoadedSlot['status'],
  }));
}

// رتبة الشفت (مطابقة لمنطق redistributeShift) — لفرز «ما قبل الهدف».
function slotOrder(s: LoadedSlot, targetDayIdx: number): number | null {
  const di = DAY_IDX[s.dayOfWeek as WeekDay];
  if (di == null) return null;
  if (s.period === 1 || s.period === 2) return di * 2;
  if (s.period === 3 || s.period === 4) return di * 2 + 1;
  if (s.status === 'extra' && s.period === 0) return di * 2 + (s.clinicNumber === 2 ? 1 : 0);
  return di < targetDayIdx ? di * 2 : null;
}

// يعيد حساب شفتٍ واحد كما يفعل redistributeShift، لكن مصدر «تاريخ الأسبوع» = داخل الذاكرة.
function recomputeShift(
  day: WeekDay, shift: Shift, weekStart: string,
  sourceWeek: LoadedSlot[], data: LoadedData, input: ScheduleBuildInput,
  excludeEx: Set<string>, excludeDel: Set<string>,
): AssignedSlot[] | null {
  const targetOrder = DAY_IDX[day] * 2 + (shift === 'evening' ? 1 : 0);
  const prior = sourceWeek.filter((s) => {
    const o = slotOrder(s, DAY_IDX[day]);
    return o != null && o < targetOrder;
  });
  const shadowIds = new Set(
    Object.entries(input.traineeModes || {}).filter(([, m]) => m === 'beginner').map(([id]) => id),
  );
  const wheels = createWheels(data.doctors, [...data.pastSlots, ...prior], shadowIds);
  const plan = computeWeekPlan(input, data);
  const td = plan.find((d) => d.day === day);
  if (!td || td.isHoliday) return null;
  const pool = shift === 'morning' ? td.morning : td.evening;
  if (!pool) return null;
  const res = distributeShiftWheel(day, data.clinicCount, pool, wheels, input.delegatorEnabled, excludeEx, excludeDel);
  return res.slots;
}

// توقيع شفت: (دور|عيادة|فترة|طبيب) مرتّبة — يشمل الاحتياط.
function shiftSig(slots: { role: string; status?: string; period: number; clinicNumber: number; doctorId?: string; doctor?: { id: string } }[], day: WeekDay, periods: Period[], exCol: number, isAssigned: boolean): string[] {
  const keys: string[] = [];
  for (const s of slots) {
    const did = isAssigned ? s.doctor!.id : s.doctorId!;
    const role = isAssigned ? s.role : s.role;
    const isEx = isAssigned ? role === 'ex' : (s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol);
    if (isAssigned ? false : (s as LoadedSlot).dayOfWeek !== day) continue;
    if (isEx) { keys.push(`ex|${did}`); continue; }
    if (!isAssigned && s.status !== 'active') continue;
    if (role !== 'clinic' && role !== 'delegator') continue;
    if (!periods.includes(s.period as Period)) continue;
    keys.push(`${role}|${s.clinicNumber}|${s.period}|${did}`);
  }
  return keys.sort();
}

function exclusions(input: ScheduleBuildInput): { excludeEx: Set<string>; excludeDel: Set<string> } {
  const modes = input.traineeModes || {};
  const opts = input.traineeOptions || {};
  const excludeEx = new Set<string>(); const excludeDel = new Set<string>();
  for (const [id, o] of Object.entries(opts)) {
    if (modes[id] !== 'independent') continue;
    if (o.inDelegator === false) excludeDel.add(id);
    if (o.inReserve === false) excludeEx.add(id);
  }
  return { excludeEx, excludeDel };
}

async function main() {
  const ws = process.argv[2] || currentSunday();
  const absentName = process.argv[3] || '';
  const absentDay = (process.argv[4] as WeekDay) || 'monday';

  const { data: anyRow } = await supabase.from('schedule_slots').select('clinic_id').eq('week_start', ws).limit(1).maybeSingle();
  const clinicId = (anyRow as { clinic_id?: string } | null)?.clinic_id;
  if (!clinicId) { console.log('لا صفوف لهذا الأسبوع:', ws); return; }
  const recipe = await loadBuildConfig(clinicId, ws);
  if (!recipe) { console.log('لا وصفة محفوظة لهذا الأسبوع — لا يمكن الاختبار.'); return; }
  const { data } = await loadScheduleData(clinicId, ws);
  if (!data) { console.log('تعذّر تحميل البيانات.'); return; }

  const input: ScheduleBuildInput = { ...recipe, clinicId, weekStart: ws, dryRun: true };
  const baseRes = await schedule.build(input);
  if (!baseRes.success || !baseRes.previewSlots) { console.log('فشل البناء التجريبيّ:', baseRes.summary); return; }
  const SBuild = toLoaded(baseRes.previewSlots, ws);
  const { excludeEx, excludeDel } = exclusions(input);
  const nm = (id: string) => data.doctors.find((d) => d.id === id)?.name || id.slice(0, 6);

  // ═══ اختبار (١): بلا عبث — إعادة الحساب من الجدول القانونيّ تطابقه ═══
  console.log(`\n═══ (١) اختبار «بلا عبث» — أسبوع ${ws} ═══`);
  let mismatches = 0;
  for (const day of DAYS) {
    for (const shift of ['morning', 'evening'] as Shift[]) {
      const periods = SHIFT_PERIODS[shift]; const exCol = shift === 'morning' ? 1 : 2;
      const rec = recomputeShift(day, shift, ws, SBuild, data, input, excludeEx, excludeDel);
      if (!rec) continue;
      const a = shiftSig(SBuild, day, periods, exCol, false);
      const b = shiftSig(rec as never, day, periods, exCol, true);
      if (a.join(';') !== b.join(';')) {
        mismatches++;
        console.log(`  ✗ ${DAY_AR[day]} ${shAr(shift)}: إعادة الحساب لا تطابق البناء`);
        const setA = new Set(a); const setB = new Set(b);
        for (const k of a) if (!setB.has(k)) console.log(`      - بُني: ${k.split('|').slice(0, -1).join('|')} = ${nm(k.split('|').pop()!)}`);
        for (const k of b) if (!setA.has(k)) console.log(`      + حُسب: ${k.split('|').slice(0, -1).join('|')} = ${nm(k.split('|').pop()!)}`);
      }
    }
  }
  console.log(mismatches === 0
    ? '  ✓ تطابقٌ تامّ — لا يُعاد كتابة أيّ شفتٍ مستقرّ (لا عبث).'
    : `  ⚠️ ${mismatches} شفت لا يطابق — انتبه: قد يحدث عبثٌ في شفتات لم تتغيّر.`);

  // ═══ اختبار (٢): التتالي عند الغياب ═══
  const absent = absentName ? data.doctors.find((d) => d.name.includes(absentName)) : null;
  if (!absent) { console.log('\n(لم يُمرَّر اسم غائب صالح — تخطّي اختبار التتالي. مرّر اسمًا ثالثًا.)'); return; }

  console.log(`\n═══ (٢) اختبار التتالي — غياب ${absent.name} يوم ${DAY_AR[absentDay]} ═══`);
  // المرساة = أوّل شفتٍ للغائب ذلك اليوم (نأخذ الصباح إن كان فيه، وإلّا المساء).
  const inMorning = SBuild.some((s) => s.dayOfWeek === absentDay && s.doctorId === absent.id && s.period <= 2 && s.status === 'active');
  const anchorShift: Shift = inMorning ? 'morning' : 'evening';

  // غيابٌ ليوم واحد فقط (المرساة): يدخل البِركة كاستثناء، وبقيّة الأيّام حاضرٌ فيها.
  const inputAbsent: ScheduleBuildInput = {
    ...input,
    extraAbsences: [...(input.extraAbsences || []), { doctorId: absent.id, day: absentDay, scope: 'full', status: 'sick_leave' }],
  };
  const dataAbsentDayOnly: LoadedData = { ...data }; // computeWeekPlan يقرأ extraAbsences من input

  // ابدأ من نسخة الجدول القانونيّ، عالِج المرساة (التعويض) ثمّ امسح الأمام.
  const S = [...SBuild];
  const writeShift = (day: WeekDay, shift: Shift, rec: AssignedSlot[]) => {
    const periods = SHIFT_PERIODS[shift]; const exCol = shift === 'morning' ? 1 : 2;
    const keep = S.filter((s) => !(s.dayOfWeek === day && (
      (s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator') && periods.includes(s.period as Period)) ||
      (s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol))));
    S.length = 0; S.push(...keep, ...toLoaded(rec, ws).filter((s) => s.dayOfWeek === day));
  };

  // المرساة: عوّض شفت الغائب (يقرأ البِركة بالغياب).
  const anchorRec = recomputeShift(absentDay, anchorShift, ws, S, dataAbsentDayOnly, inputAbsent, excludeEx, excludeDel);
  if (anchorRec) {
    writeShift(absentDay, anchorShift, anchorRec);
    console.log(`  • المرساة (${DAY_AR[absentDay]} ${shAr(anchorShift)}): عُوّض النقص.`);
  }

  // امسح الأمام (بقيّة الأسبوع) — الغائب حاضرٌ في بقيّة الأيّام (بلا غياب).
  let startOrder = DAY_IDX[absentDay] * 2 + (anchorShift === 'evening' ? 1 : 0) + 1;
  let changed = 0; let stable = 0;
  for (let order = startOrder; order < 10; order++) {
    const day = DAYS[Math.floor(order / 2)]!; const shift: Shift = order % 2 === 0 ? 'morning' : 'evening';
    const periods = SHIFT_PERIODS[shift]; const exCol = shift === 'morning' ? 1 : 2;
    const rec = recomputeShift(day, shift, ws, S, data, input, excludeEx, excludeDel); // بلا غياب
    if (!rec) continue;
    const before = shiftSig(SBuild, day, periods, exCol, false);
    const after = shiftSig(rec as never, day, periods, exCol, true);
    if (before.join(';') === after.join(';')) { stable++; continue; }
    changed++;
    writeShift(day, shift, rec);
    console.log(`  ⚠️ ${DAY_AR[day]} ${shAr(shift)}: تغيّر`);
    const setB = new Set(before); const setA = new Set(after);
    const moved = new Set<string>();
    for (const k of before) if (!setA.has(k)) moved.add(k.split('|').pop()!);
    for (const k of after) if (!setB.has(k)) moved.add(k.split('|').pop()!);
    console.log(`      تبدّل مقعد: ${[...moved].map(nm).join('، ')}`);
  }
  console.log(`\n  الخلاصة: ${changed} شفت تغيّر، ${stable} شفت بقي ثابتًا (لن يُكتب ولا يُشعَر عنه).`);
  console.log('  → يُكتب الفرق فقط، وإشعار «راجِع الجدول» للأطبّاء الذين تبدّلت مقاعدهم.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
