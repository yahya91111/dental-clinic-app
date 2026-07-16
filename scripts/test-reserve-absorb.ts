/* اختبارُ امتصاصِ الاحتياطيّ الحيّ (كتابةٌ على DB) — أسبوعٌ وهميّ 2099 + تنظيفٌ كامل + بلا إشعارات.
 * (أ) بناءٌ عادلٌ ⇒ الامتصاصُ لا يعبث (applied=0) والثوابتُ سليمة.
 * (ب) نُفسِدُ توزيعَ الاحتياطيّ عمدًا (نُعطيه لأقلِّ استحقاقًا) ⇒ الامتصاصُ يُصلّحه:
 *     بعده لا يوجد عاملٌ في القروب أحقُّ بالراحةِ من محتاطِ الشفت + حفظُ العدد + لا تداخل.
 * (ج) حتميّ + idempotent. */
import { supabase } from '../lib/supabase';
import { loadScheduleData, schedule, WEEK_DAYS } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, LoadedSlot } from '../lib/algorithms/schedule';
import { lastRestStamps } from '../lib/algorithms/solver';
import { applyReserveAbsorption } from '../lib/algorithms/solver_shadow';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEKS = ['2099-01-04', '2099-01-11', '2099-01-18'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };
const reserveStamp = (s: LoadedSlot): string => `${s.weekStart}#${DI[s.dayOfWeek] ?? 0}#${s.clinicNumber === 2 ? 1 : 0}`;

async function buildWeek(w: string) {
  const pre = await loadScheduleData(CID, w);
  const tm: Record<string, 'beginner'> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(WEEK_DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  const recipe = { weekStart: w, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
  await schedule.build({ ...recipe, dryRun: false } as Parameters<typeof schedule.build>[0]);
  await schedule.saveBuildConfig({ ...recipe, dryRun: true } as Parameters<typeof schedule.saveBuildConfig>[0]);
}

// خانات شفت (يوم+نصف) لأسبوعٍ محمَّل
const shiftSlots = (slots: LoadedSlot[], dayIdx: number, half: 0 | 1) => {
  const periods = half === 0 ? [1, 2] : [3, 4]; const exCol = half === 0 ? 1 : 2;
  return slots.filter((s) => DI[s.dayOfWeek] === dayIdx &&
    ((s.status === 'active' && s.role === 'clinic' && periods.includes(s.period)) || (s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol)));
};

(async () => {
  try {
    // نظّف ثمّ ابنِ ٣ أسابيع (تاريخُ راحةٍ حقيقيّ)
    for (const w of WEEKS) await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', w);
    for (const w of WEEKS) await buildWeek(w);

    const W = WEEKS[2]!;
    const d3 = (await loadScheduleData(CID, W)).data!;
    const doctors = d3.doctors;
    const poolIds = new Set(doctors.filter((d) => d.groupTemplate.key !== 'board' && d.workStatus !== 'trainee' && d.workStatus !== 'light_duty').map((d) => d.id));
    const groupOf = new Map(doctors.map((d) => [d.id, d.groupTemplate.key]));
    const supervisorIds = new Set(doctors.filter((d) => d.workStatus === 'trainee' && d.supervisorDoctorId).map((d) => d.supervisorDoctorId as string));
    const nameById = new Map(doctors.map((d) => [d.id, d.name]));
    const history = [...d3.pastSlots]; // W1+W2 (weekStart < W3)
    const rest = lastRestStamps(history);

    // ── (أ) بناءٌ عادل: الامتصاص لا يعبث + الثوابت ──
    const r0 = await applyReserveAbsorption({ clinicId: CID, weekStart: W, label: 'اختبار-أساس' });
    check('(أ) بناءٌ عادل ⇒ الامتصاص لا يعبث (applied=0)', r0.applied === 0, `applied=${r0.applied}`);

    const s0 = (await loadScheduleData(CID, W)).data!.existingSlots;
    // ثابت: لا طبيبٌ عاملٌ ومحتاطٌ في نفس الشفت
    const conflict = (slots: LoadedSlot[]) => {
      for (let d = 0; d < 5; d++) for (const h of [0, 1] as const) {
        const ss = shiftSlots(slots, d, h);
        const work = new Set(ss.filter((s) => s.status === 'active').map((s) => s.doctorId));
        const rez = new Set(ss.filter((s) => s.status === 'extra').map((s) => s.doctorId));
        for (const id of rez) if (work.has(id)) return `${WEEK_DAYS[d]}/${h}: ${nameById.get(id)}`;
      }
      return '';
    };
    check('(أ) لا تداخل عامل↔محتاط', conflict(s0) === '', conflict(s0));

    // اختر شفتًا فيه محتاطٌ (pool، غير مشرف) + عاملُ عيادةٍ من نفس القروب (غير مشرف) أقلَّ استحقاقًا
    let target: { dayIdx: number; half: 0 | 1; R: string; W: string } | null = null;
    for (let d = 0; d < 5 && !target; d++) for (const h of [0, 1] as const) {
      const ss = shiftSlots(s0, d, h);
      const rez = ss.filter((s) => s.status === 'extra' && poolIds.has(s.doctorId) && !supervisorIds.has(s.doctorId));
      for (const rslot of rez) {
        const R = rslot.doctorId; const g = groupOf.get(R);
        // عاملُ عيادةٍ نظيف (كلّ خاناته النشطة في هذا الشفت عيادة، لا احتياط له) من نفس القروب، غير مشرف
        const workers = [...new Set(ss.filter((s) => s.status === 'active' && s.role === 'clinic' && groupOf.get(s.doctorId) === g && poolIds.has(s.doctorId) && !supervisorIds.has(s.doctorId)).map((s) => s.doctorId))];
        const Wd = workers.find((w) => {
          const hasEx = ss.some((s) => s.status === 'extra' && s.doctorId === w);
          const lessOwed = (rest.get(w) ?? '') >= (rest.get(R) ?? ''); // W أحدثُ راحةً (أقلّ استحقاقًا) أو مساوٍ
          return !hasEx && lessOwed && w !== R;
        });
        if (Wd) { target = { dayIdx: d, half: h, R, W: Wd }; break; }
      }
    }
    check('وُجد شفتٌ صالحٌ للإفساد المتعمَّد', !!target, 'لم يوجد — القروب صغير؟');
    if (!target) throw new Error('no target');

    // ── (ب) أفسِد: أعطِ الاحتياطَ لـ W (أقلّ استحقاقًا) وأنزِل R للعيادة ──
    const { dayIdx, half, R, Wd } = { ...target, Wd: target.W };
    const day = WEEK_DAYS[dayIdx];
    const periods = half === 0 ? [1, 2] : [3, 4]; const exCol = half === 0 ? 1 : 2;
    const rEx = s0.filter((s) => s.doctorId === R && DI[s.dayOfWeek] === dayIdx && s.status === 'extra' && s.period === 0 && s.clinicNumber === exCol);
    const wCl = s0.filter((s) => s.doctorId === Wd && DI[s.dayOfWeek] === dayIdx && s.status === 'active' && s.role === 'clinic' && periods.includes(s.period));
    await supabase.from('schedule_slots').update({ doctor_id: Wd, doctor_name: nameById.get(Wd) }).in('id', rEx.map((r) => r.id));
    await supabase.from('schedule_slots').update({ doctor_id: R, doctor_name: nameById.get(R) }).in('id', wCl.map((r) => r.id));
    console.log(`   أفسدتُ ${day}/${half === 0 ? 'ص' : 'م'}: راحة→${nameById.get(Wd)} (أقلّ استحقاقًا) · عمل→${nameById.get(R)} (أحقّ)`);

    const before = (await loadScheduleData(CID, W)).data!.existingSlots;
    const exCountBefore = before.filter((s) => s.status === 'extra' && s.period === 0).length;

    // ── الامتصاص يُصلّح ──
    const r1 = await applyReserveAbsorption({ clinicId: CID, weekStart: W, label: 'اختبار-إصلاح' });
    check('(ب) الامتصاص تحرّك لإصلاح الظلم (applied≥1)', r1.applied >= 1, `applied=${r1.applied}`);

    const after = (await loadScheduleData(CID, W)).data!.existingSlots;
    // ثابت ①: حفظُ عددِ خاناتِ الاحتياطِ كليًّا
    const exCountAfter = after.filter((s) => s.status === 'extra' && s.period === 0).length;
    check('(ب-①) عددُ الاحتياطِ محفوظٌ', exCountBefore === exCountAfter, `${exCountBefore}→${exCountAfter}`);
    // ثابت ②: لا تداخل عامل↔محتاط
    check('(ب-②) لا تداخل عامل↔محتاط بعد الإصلاح', conflict(after) === '', conflict(after));
    // ثابت ③: عدالةُ الشفت المُصلَح — لا عاملُ عيادةٍ (نفس القروب، pool، غير مشرف) أحقُّ بالراحةِ من محتاطِه
    const restNow = lastRestStamps(history); // نفس التاريخ (لم يتغيّر)
    const ss2 = shiftSlots(after, dayIdx, half);
    const rezDoc = ss2.filter((s) => s.status === 'extra' && poolIds.has(s.doctorId)).map((s) => s.doctorId);
    let fairOk = true; let fairDet = '';
    for (const rid of rezDoc) {
      const g = groupOf.get(rid);
      for (const s of ss2) {
        if (s.status !== 'active' || s.role !== 'clinic' || !poolIds.has(s.doctorId) || supervisorIds.has(s.doctorId) || groupOf.get(s.doctorId) !== g) continue;
        if ((restNow.get(s.doctorId) ?? '') < (restNow.get(rid) ?? '')) { fairOk = false; fairDet = `${nameById.get(s.doctorId)} أحقُّ من محتاط ${nameById.get(rid)}`; }
      }
    }
    check('(ب-③) بعد الإصلاح: لا عاملٌ أحقُّ بالراحةِ من المحتاط', fairOk, fairDet);
    // ثابت ④: لم يتحرّك مشرفٌ (حمايةُ الظلّ) — كلُّ مشرفٍ نفسُ خاناته قبل/بعد
    let supMoved = '';
    for (const sup of supervisorIds) {
      const sig = (slots: LoadedSlot[]) => slots.filter((s) => s.doctorId === sup).map((s) => `${s.dayOfWeek}|${s.period}|${s.clinicNumber}|${s.status}`).sort().join(';');
      if (sig(before) !== sig(after)) supMoved = nameById.get(sup) ?? sup;
    }
    check('(ب-④) لم يتحرّك أيُّ مشرف (حمايةُ الظلّ)', supMoved === '', supMoved);

    // ── (ج) idempotent: تشغيلٌ ثانٍ ⇒ لا حركة ──
    const r2 = await applyReserveAbsorption({ clinicId: CID, weekStart: W, label: 'اختبار-idempotent' });
    check('(ج) idempotent: تشغيلٌ ثانٍ لا يعبث (applied=0)', r2.applied === 0, `applied=${r2.applied}`);
  } catch (e) {
    console.error('ERR', (e as Error).message, (e as Error).stack);
    fail++;
  } finally {
    for (const w of WEEKS) { try { await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', w); } catch { /* */ } }
    console.log('   نظّفتُ أسابيع 2099.');
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
})();
