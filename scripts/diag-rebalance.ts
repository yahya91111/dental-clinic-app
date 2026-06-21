// تشخيص «الموازنة للأمام»: بعد معالجة يومٍ (المرساة)، ماذا يتغيّر في بقيّة
// الأسبوع (والأسابيع المبنيّة بعده)؟ نطبع الفرق شفتًا بشفت — مَن خرج، مَن دخل.
//
// تشغيل (معاينة للقراءة فقط — لا يكتب):
//   npx tsx --env-file=.env scripts/diag-rebalance.ts [week_start] [fromDay] [fromShift]
// تشغيل فعليّ (يكتب الفرق فعلاً ثمّ يطبع الأسابيع المتأثّرة):
//   npx tsx --env-file=.env scripts/diag-rebalance.ts [week_start] [fromDay] [fromShift] apply
//
// مثال:  ...diag-rebalance.ts 2026-06-14 monday morning
//   = «عُولجت تغطية الإثنين صباحًا» → اعرض ما يتغيّر من الإثنين مساءً فصاعدًا.
//
// ملاحظة: المعاينة (بلا apply) تُظهر «الطبقة الأولى» فقط — كلّ شفتٍ يُقارن
// بالأصل لا بنتيجة الشفت الأسبق، فالتتالي الكامل لا يظهر إلّا في التشغيل الفعليّ.
import { supabase } from '../lib/supabase';
import {
  loadScheduleData, loadBuildConfig, redistributeShift, rebalanceForward, SHIFT_PERIODS,
} from '../lib/algorithms/schedule';
import type { WeekDay, Shift, Period } from '../lib/algorithms/schedule';

const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DAY_AR: Record<WeekDay, string> = {
  sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس',
};
const DAY_IDX: Record<WeekDay, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };

function currentSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// خريطة المقعد→الشاغل من خانات DB لشفتٍ واحد (عيادة/دليقيتر + احتياط).
function seatMapFromDb(
  slots: { dayOfWeek: string; period: number; clinicNumber: number; doctorName: string; doctorId: string; role: string; status: string }[],
  day: WeekDay, periods: Period[], exCol: number,
): Map<string, string> {
  const m = new Map<string, string>();
  const ex: string[] = [];
  for (const s of slots) {
    if (s.dayOfWeek !== day) continue;
    if (s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol) { ex.push(s.doctorName); continue; }
    if (s.status !== 'active') continue;
    if (s.role !== 'clinic' && s.role !== 'delegator') continue;
    if (!periods.includes(s.period as Period)) continue;
    const seat = s.role === 'delegator' ? `دليقيتر/ف${s.period}` : `ع${s.clinicNumber}/ف${s.period}`;
    m.set(seat, (m.get(seat) ? `${m.get(seat)} + ` : '') + s.doctorName);
  }
  if (ex.length) m.set('احتياط', ex.sort().join('، '));
  return m;
}
function seatMapFromAssigned(
  slots: { period: number; clinicNumber: number; doctor: { name: string }; role: string }[],
  exCol: number,
): Map<string, string> {
  const m = new Map<string, string>();
  const ex: string[] = [];
  for (const s of slots) {
    if (s.role === 'ex') { ex.push(s.doctor.name); continue; }
    const seat = s.role === 'delegator' ? `دليقيتر/ف${s.period}` : `ع${s.clinicNumber}/ف${s.period}`;
    m.set(seat, (m.get(seat) ? `${m.get(seat)} + ` : '') + s.doctor.name);
  }
  if (ex.length) m.set('احتياط', ex.sort().join('، '));
  return m;
}

async function main() {
  const ws = process.argv[2] || currentSunday();
  const fromDay = (process.argv[3] as WeekDay) || 'sunday';
  const fromShift = (process.argv[4] as Shift) || 'morning';
  const apply = process.argv[5] === 'apply';

  const { data: anyRow } = await supabase.from('schedule_slots')
    .select('clinic_id').eq('week_start', ws).limit(1).maybeSingle();
  const clinicId = (anyRow as { clinic_id?: string } | null)?.clinic_id;
  if (!clinicId) { console.log('لا صفوف لهذا الأسبوع:', ws); return; }

  const recipe = await loadBuildConfig(clinicId, ws);
  if (!recipe) { console.log('لا وصفة محفوظة — أعِد بناء الجدول.'); return; }

  console.log(`الأسبوع: ${ws}  —  المرساة: ${DAY_AR[fromDay]} ${fromShift === 'morning' ? 'صباحًا' : 'مساءً'}`);
  console.log(`الوضع: ${apply ? '⚠️  تشغيل فعليّ (يكتب الفرق)' : 'معاينة للقراءة فقط'}\n`);

  if (apply) {
    const { changedWeeks } = await rebalanceForward({ clinicId, weekStart: ws, fromDay, fromShift });
    if (changedWeeks.length === 0) { console.log('لا تغيير — التوازن ثابت، لم يُكتب شيء.'); return; }
    for (const wk of changedWeeks) {
      const { data } = await loadScheduleData(clinicId, wk.weekStart);
      const nm = new Map((data?.doctors || []).map((d) => [d.id, d.name] as const));
      console.log(`📋 أسبوع ${wk.weekStart}: تغيّر مقعد [${wk.affectedDoctorIds.map((id) => nm.get(id) || id.slice(0, 6)).join('، ')}]`);
    }
    console.log(`\nإجمالي الأسابيع المتأثّرة: ${changedWeeks.length} (إشعار «راجِع الجدول» واحدٌ لكلّ أسبوع).`);
    return;
  }

  // ── معاينة: امسح الأمام شفتًا بشفت عبر الأسابيع المبنيّة، اطبع الفرق ──
  let week = ws;
  let startOrder = DAY_IDX[fromDay] * 2 + (fromShift === 'evening' ? 1 : 0) + 1;
  let totalChanged = 0;

  for (let wi = 0; wi < 4; wi++) {
    const rec = await loadBuildConfig(clinicId, week);
    if (!rec) break;
    const { data } = await loadScheduleData(clinicId, week);
    if (!data) break;
    const built = data.existingSlots.some((s) => s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator'));
    if (!built) break;

    console.log(`══ أسبوع ${week} ══`);
    let weekChanges = 0;
    for (let order = startOrder; order < 10; order++) {
      const day = DAYS[Math.floor(order / 2)]!;
      const shift: Shift = order % 2 === 0 ? 'morning' : 'evening';
      const r = await redistributeShift({ clinicId, weekStart: week, day, shift });
      if (!r.success) continue;
      const periods = SHIFT_PERIODS[shift];
      const exCol = shift === 'morning' ? 1 : 2;
      const cur = seatMapFromDb(data.existingSlots, day, periods, exCol);
      const rec2 = seatMapFromAssigned(r.slots, exCol);
      const seats = [...new Set([...cur.keys(), ...rec2.keys()])].sort();
      const diffs = seats
        .map((seat) => ({ seat, from: cur.get(seat) || '—', to: rec2.get(seat) || '—' }))
        .filter((x) => x.from !== x.to);
      if (diffs.length === 0) continue;
      weekChanges += diffs.length;
      console.log(`  ${DAY_AR[day]} ${shift === 'morning' ? 'صباحًا' : 'مساءً'}:`);
      for (const x of diffs) console.log(`    ${x.seat}: ${x.from}  →  ${x.to}`);
    }
    if (weekChanges === 0) console.log('  (لا تغيير)');
    totalChanged += weekChanges;
    startOrder = 0;
    week = addDaysISO(week, 7);
  }
  console.log(`\nإجمالي المقاعد المتغيّرة (الطبقة الأولى): ${totalChanged}`);
  console.log('للتتالي الكامل والكتابة الفعليّة: أضِف «apply» في آخر الأمر.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
