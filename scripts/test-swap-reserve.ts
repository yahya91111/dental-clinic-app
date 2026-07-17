/* اختبارُ شمولِ الاحتياطيّ (EX) في السواب اليدويّ — آمنٌ (schedule_slots فقط، بلا إشعارات).
 *  (أ) دالّةٌ محضة: swapDoctorsInDaySlots تُبادلُ محتاطًا ⇄ عاملَ عيادة (المحتاطُ يعمل والعاملُ يرتاح).
 *  (ب) shiftOfDoctor يميّزُ الصباحَ من المساء (لحارسِ نفسِ الشفت).
 *  (ج) DB أمان: مسارُ الحفظِ لتبديلٍ **عاديٍّ للعيادة** لا يُضيّعُ الاحتياطَ (يُعادُ كما هو).
 *  (د) DB: تبديلُ احتياطيٍّ ⇄ عيادةٍ يثبتُ صحيحًا (المحتاطُ صار active، والعاملُ صار extra). */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule, WEEK_DAYS } from '../lib/algorithms/schedule';
import type { WeekDay, Shift } from '../lib/algorithms/schedule';
import { getWeeklySchedule, replaceDayClinicSlots } from '../lib/database';
import { swapDoctorsInDaySlots, isSwappable, shiftOfDoctor, isReserveDoctor, isShadowOnDay, type SupMap } from '../screens/Schedule/swap';
import type { ScheduleSlot, DayOfWeek } from '../screens/Schedule/types';

const CID = '10000000-0000-0000-0000-000000000001';
const W = '2099-01-04';
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };

const S = (o: Partial<ScheduleSlot> & { doctorId: string; period: number; clinicNumber: number; role: any; status: any }): ScheduleSlot => ({
  id: `${o.doctorId}-${o.period}-${o.clinicNumber}-${o.status}`, day: 'sunday', doctorName: o.doctorId,
  day_of_week: undefined as any, ...o,
} as ScheduleSlot);

const mapDB = (rows: any[]): ScheduleSlot[] => rows
  .filter((s) => { const r = String(s.role || ''); return r !== 'prev_placement' && !r.startsWith('xday'); })
  .map((s) => ({ id: s.id, day: s.day_of_week as DayOfWeek, period: s.period, clinicNumber: s.clinic_number, doctorId: s.doctor_id, doctorName: s.doctor_name, role: s.role, status: s.status }));

// نظيرُ saveSwap: يبني صفوفَ يومٍ من الخاناتِ القابلةِ للتبديل ويكتبُها عبرَ replaceDayClinicSlots.
async function persistDay(day: string, edit: ScheduleSlot[], sup: SupMap) {
  const rows = edit.filter((s) => s.day === day && isSwappable(s)).map((s) => ({
    period: s.period, clinic_number: s.clinicNumber, doctor_id: s.doctorId, doctor_name: s.doctorName,
    role: s.role, status: s.status, source: isShadowOnDay(edit, day, s.doctorId, sup) ? 'shadow' : 'ai',
  }));
  const { error } = await replaceDayClinicSlots(CID, W, day, rows);
  if (error) throw error;
}

(async () => {
  try {
    const NO_SUP: SupMap = new Map();

    // ── (أ) دالّةٌ محضة: محتاطٌ ⇄ عاملُ عيادةٍ (صباح) ──
    const slots: ScheduleSlot[] = [
      S({ doctorId: 'P1', period: 1, clinicNumber: 1, role: 'clinic', status: 'active' }),
      S({ doctorId: 'P2', period: 2, clinicNumber: 1, role: 'clinic', status: 'active' }),
      S({ doctorId: 'R',  period: 0, clinicNumber: 1, role: 'clinic', status: 'extra' }),   // محتاطُ الصباح
    ];
    const out = swapDoctorsInDaySlots(slots, 'sunday', 'R', 'P1', NO_SUP);
    const rNow = out.filter((s) => s.doctorId === 'R');
    const p1Now = out.filter((s) => s.doctorId === 'P1');
    check('(أ) المحتاطُ R صار يعملُ العيادةَ (active, فترة 1)', rNow.length === 1 && rNow[0]!.status === 'active' && rNow[0]!.period === 1 && rNow[0]!.clinicNumber === 1, JSON.stringify(rNow));
    check('(أ) العاملُ P1 صار محتاطًا (extra, فترة 0)', p1Now.length === 1 && p1Now[0]!.status === 'extra' && p1Now[0]!.period === 0, JSON.stringify(p1Now));
    check('(أ) P2 لم يتغيّر', out.some((s) => s.doctorId === 'P2' && s.period === 2 && s.status === 'active'));

    // ── (ب) shiftOfDoctor ──
    const evSlots: ScheduleSlot[] = [S({ doctorId: 'E', period: 3, clinicNumber: 1, role: 'clinic', status: 'active' })];
    check('(ب) محتاطُ العمود 1 = صباح', shiftOfDoctor(slots, 'sunday', 'R') === 'morning');
    check('(ب) عاملُ الفترة 3 = مساء', shiftOfDoctor(evSlots, 'sunday', 'E') === 'evening');
    check('(ب) isReserveDoctor يكشفُ المحتاط', isReserveDoctor(slots, 'sunday', 'R') && !isReserveDoctor(slots, 'sunday', 'P1'));

    // ── جهّزْ أسبوعًا حقيقيًّا للاختباراتِ على DB ──
    await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W);
    const pre = await loadScheduleData(CID, W);
    const tm: Record<string, 'beginner'> = {};
    for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
    const aShiftPlan = Object.fromEntries(WEEK_DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
    const recipe = { weekStart: W, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
    await schedule.build({ ...recipe, dryRun: false } as Parameters<typeof schedule.build>[0]);

    const exCount = (rows: ScheduleSlot[]) => rows.filter((s) => s.status === 'extra' && s.period === 0).length;
    const actCount = (rows: ScheduleSlot[]) => rows.filter((s) => s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator')).length;
    const load = async () => mapDB((await getWeeklySchedule(CID, W)).data || []);

    const before = await load();
    const exBefore = exCount(before), actBefore = actCount(before);

    // ── (ج) أمان: حفظُ يومٍ **بلا أيِّ تبديل** لا يُضيّعُ الاحتياط ──
    const anyDay = before.find((s) => s.status === 'extra' && s.period === 0)?.day;
    check('يوجدُ محتاطٌ في الأسبوعِ المبنيّ', !!anyDay, `ex=${exBefore}`);
    if (!anyDay) throw new Error('no reserve in built week');
    await persistDay(anyDay, before, NO_SUP);   // نفسُ الخانات، بلا تبديل
    const afterNoop = await load();
    check('(ج) حفظٌ عاديٌّ (بلا تبديل) لم يُضيّعِ الاحتياط', exCount(afterNoop) === exBefore, `${exBefore}→${exCount(afterNoop)}`);
    check('(ج) وحافظَ على خاناتِ العمل', actCount(afterNoop) === actBefore, `${actBefore}→${actCount(afterNoop)}`);

    // ── (د) تبديلٌ حقيقيٌّ: محتاطٌ ⇄ عاملُ عيادةٍ في نفسِ الشفت ──
    const dayRows = afterNoop.filter((s) => s.day === anyDay);
    const R = dayRows.find((s) => s.status === 'extra' && s.period === 0)!;   // محتاط
    const rShift = shiftOfDoctor(dayRows, anyDay, R.doctorId);
    const periods = rShift === 'evening' ? [3, 4] : [1, 2];
    // عاملُ عيادةٍ نظيفٌ في نفسِ الشفت (غيرُ المحتاطِ نفسِه)
    const W2 = dayRows.find((s) => s.status === 'active' && s.role === 'clinic' && periods.includes(s.period) && s.doctorId !== R.doctorId)!;
    check('وُجد محتاطٌ + عاملٌ في نفسِ الشفت', !!R && !!W2, `R=${R?.doctorId} W=${W2?.doctorId}`);
    const edit = swapDoctorsInDaySlots(afterNoop, anyDay, R.doctorId, W2.doctorId, NO_SUP);
    await persistDay(anyDay, edit, NO_SUP);
    const afterSwap = await load();
    const dayAfter = afterSwap.filter((s) => s.day === anyDay);
    const rAfter = dayAfter.filter((s) => s.doctorId === R.doctorId);
    const wAfter = dayAfter.filter((s) => s.doctorId === W2.doctorId);
    check('(د) المحتاطُ صار يعملُ العيادة (active)', rAfter.some((s) => s.status === 'active' && s.role === 'clinic') && !rAfter.some((s) => s.status === 'extra'), JSON.stringify(rAfter.map((s) => `${s.period}|${s.status}`)));
    check('(د) العاملُ صار محتاطًا (extra, فترة 0)', wAfter.some((s) => s.status === 'extra' && s.period === 0) && !wAfter.some((s) => s.status === 'active'), JSON.stringify(wAfter.map((s) => `${s.period}|${s.status}`)));
    check('(د) عددُ الاحتياطِ محفوظٌ بعدَ التبديل', exCount(afterSwap) === exBefore, `${exBefore}→${exCount(afterSwap)}`);
    check('(د) عددُ خاناتِ العملِ محفوظٌ', actCount(afterSwap) === actBefore, `${actBefore}→${actCount(afterSwap)}`);
    // لا ازدواج: لا طبيبٌ عاملٌ ومحتاطٌ نفسَ الشفت
    const dbl = (() => {
      const ss = dayAfter.filter((s) => (s.status === 'extra' && s.period === 0 && (rShift === 'evening' ? s.clinicNumber === 2 : s.clinicNumber === 1)) || (s.status === 'active' && s.role === 'clinic' && periods.includes(s.period)));
      const work = new Set(ss.filter((s) => s.status === 'active').map((s) => s.doctorId));
      for (const s of ss) if (s.status === 'extra' && work.has(s.doctorId)) return s.doctorId;
      return '';
    })();
    check('(د) لا ازدواجَ عامل↔محتاط', dbl === '', dbl);
  } catch (e) {
    console.error('ERR', (e as Error).message, (e as Error).stack);
    fail++;
  } finally {
    try { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', W); } catch { /* */ }
    console.log('   نظّفتُ أسبوع 2099.');
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})();
