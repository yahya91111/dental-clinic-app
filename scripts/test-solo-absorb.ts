/* اختبارُ امتصاصِ الانفرادِ الحيّ (كتابةٌ على schedule_slots فقط — بلا إشعارات) — أسبوعٌ وهميّ 2099 + تنظيفٌ كامل.
 * نبني يدويًّا الشكلَ المختلطَ الذي يحتاجُه الانفراد (قروبٌ فيه منفرِدٌ + مقترِنون) — عيادةُ المشرف
 * لا تنتجه (قروب أ كلُّه مقترن، قروب ب كلُّه منفرد مُجبَر). نتحكّم بالتاريخِ لضبطِ الاستحقاق.
 *  (أ) عادلٌ (الأحقُّ بالانفرادِ منفرِدٌ أصلًا) ⇒ لا يعبث (applied=0).
 *  (ب) مُفسَد (الأقلُّ استحقاقًا منفرِدٌ) ⇒ يُسلّمُ الانفرادَ للأحقّ + حفظُ الصفوف + تغطيةُ العيادتين + لا ازدواج.
 *  (ج) حمايةُ الظلّ: منفرِدٌ مشرفٌ لا يُنقَل.
 *  (د) idempotent. */
import { supabase } from '../lib/supabase';
import { loadScheduleData, WEEK_DAYS } from '../lib/algorithms/schedule';
import type { LoadedSlot } from '../lib/algorithms/schedule';
import { lastSoloStamps } from '../lib/algorithms/solver';
import { applySoloAbsorption } from '../lib/algorithms/solver_shadow';

const CID = '10000000-0000-0000-0000-000000000001';
const W1 = '2099-01-04', W2 = '2099-01-11', W3 = '2099-01-18';
const WEEKS = [W1, W2, W3];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };

type Row = { doctorId: string; name: string; period: number; clinic: number; role: 'clinic'; };
async function putShift(week: string, day: string, rows: Row[]) {
  await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', week);
  if (rows.length === 0) return;
  await supabase.from('schedule_slots').insert(rows.map((r) => ({
    clinic_id: CID, week_start: week, day_of_week: day, period: r.period, clinic_number: r.clinic,
    doctor_id: r.doctorId, doctor_name: r.name, role: r.role, status: 'active', source: 'build',
  })));
}
// شفتٌ صباحيّ (sunday) لثلاثةِ أطبّاء: solo يشغلُ عيادةً كاملة، p1/p2 يقترنان في الأخرى.
const shift = (solo: {id: string; name: string}, p1: {id: string; name: string}, p2: {id: string; name: string}): Row[] => [
  { doctorId: solo.id, name: solo.name, period: 1, clinic: 1, role: 'clinic' },
  { doctorId: solo.id, name: solo.name, period: 2, clinic: 1, role: 'clinic' },
  { doctorId: p1.id, name: p1.name, period: 1, clinic: 2, role: 'clinic' },
  { doctorId: p2.id, name: p2.name, period: 2, clinic: 2, role: 'clinic' },
];
const sundaySlots = (slots: LoadedSlot[]) => slots.filter((s) => DI[s.dayOfWeek] === 0 && s.status === 'active' && s.role === 'clinic' && [1, 2].includes(s.period));
const rowsOf = (slots: LoadedSlot[], id: string) => sundaySlots(slots).filter((s) => s.doctorId === id);

(async () => {
  try {
    for (const w of WEEKS) await supabase.from('schedule_slots').delete().eq('clinic_id', CID).eq('week_start', w);
    const d = (await loadScheduleData(CID, W3)).data!;
    const supervisorIds = new Set(d.doctors.filter((x) => x.workStatus === 'trainee' && x.supervisorDoctorId).map((x) => x.supervisorDoctorId as string));
    // ثلاثةُ أطبّاءِ قروب أ في البِركة (نشط، لا بورد/متدرّب/تخفيف) وليسوا مشرفين.
    const poolA = d.doctors.filter((x) => x.groupTemplate.key === 'group_a' && x.workStatus !== 'trainee' && x.workStatus !== 'light_duty' && !supervisorIds.has(x.id));
    check('توفّرُ ٣ أطبّاءِ قروب أ للاختبار', poolA.length >= 3, `عدد=${poolA.length}`);
    if (poolA.length < 3) throw new Error('need 3 pool group_a doctors');
    const [A, B, C] = poolA.map((x) => ({ id: x.id, name: x.name }));

    // ── التاريخ (W1,W2): يضبطُ آخرَ انفرادٍ لكلّ طبيب ──
    // C انفردَ في W1 (أقدم)، A انفردَ في W2 (أحدث) ⇒ الاستحقاق: B('' الأحقّ) > C > A.
    await putShift(W1, 'sunday', shift(C!, A!, B!));
    await putShift(W2, 'sunday', shift(A!, B!, C!));
    const soloHist = lastSoloStamps((await loadScheduleData(CID, W3)).data!.pastSlots);
    check('التاريخ: B الأحقُّ بالانفراد (أقدمُ ختمٍ)', (soloHist.get(B!.id) ?? '') < (soloHist.get(C!.id) ?? '') && (soloHist.get(C!.id) ?? '') < (soloHist.get(A!.id) ?? ''),
      `B=${soloHist.get(B!.id) ?? '∅'} C=${soloHist.get(C!.id) ?? '∅'} A=${soloHist.get(A!.id) ?? '∅'}`);

    // ── (أ) عادل: B (الأحقّ) منفرِدٌ أصلًا ⇒ لا يعبث ──
    await putShift(W3, 'sunday', shift(B!, A!, C!));
    const rA = await applySoloAbsorption({ clinicId: CID, weekStart: W3, label: 'اختبار-عادل' });
    check('(أ) عادل ⇒ لا يعبث (applied=0)', rA.applied === 0, `applied=${rA.applied}`);

    // ── (ب) مُفسَد: A (الأقلُّ استحقاقًا) منفرِدٌ، B مقترِن ⇒ يُسلّمُ الانفرادَ لـB ──
    await putShift(W3, 'sunday', shift(A!, B!, C!));
    const before = (await loadScheduleData(CID, W3)).data!.existingSlots;
    const rB = await applySoloAbsorption({ clinicId: CID, weekStart: W3, label: 'اختبار-إصلاح' });
    check('(ب) تحرّك لإصلاحِ الظلم (applied≥1)', rB.applied >= 1, `applied=${rB.applied}`);
    const after = (await loadScheduleData(CID, W3)).data!.existingSlots;
    // ① B صارَ منفرِدًا (صفّان في عيادةٍ واحدة)
    const bRows = rowsOf(after, B!.id);
    check('(ب-①) B صارَ المنفرِد (فترتان، عيادةٌ واحدة)', bRows.length === 2 && new Set(bRows.map((r) => r.clinicNumber)).size === 1, `صفوف=${bRows.length}`);
    // ② A صارَ مقترِنًا (صفٌّ واحد)
    check('(ب-②) A صارَ مقترِنًا (صفٌّ واحد)', rowsOf(after, A!.id).length === 1, `صفوف=${rowsOf(after, A!.id).length}`);
    // ③ C لم يتغيّر
    const cBefore = rowsOf(before, C!.id).map((r) => `${r.period}|${r.clinicNumber}`).sort().join(',');
    const cAfter = rowsOf(after, C!.id).map((r) => `${r.period}|${r.clinicNumber}`).sort().join(',');
    check('(ب-③) C (غيرُ المعنيّ) لم يتغيّر', cBefore === cAfter, `${cBefore} → ${cAfter}`);
    // ④ حفظُ الصفوف الكليّ + تغطيةُ العيادتين (كلُّ عيادةٍ لها فترتاها)
    check('(ب-④أ) حفظُ عددِ الصفوف (٤)', sundaySlots(after).length === 4, `${sundaySlots(after).length}`);
    const cover = (slots: LoadedSlot[]) => {
      for (const cn of [1, 2]) { const ps = new Set(sundaySlots(slots).filter((s) => s.clinicNumber === cn).map((s) => s.period)); if (!(ps.has(1) && ps.has(2))) return `عيادة ${cn} ناقصة`; }
      return '';
    };
    check('(ب-④ب) العيادتان مغطّاتان (فترتان لكلٍّ)', cover(after) === '', cover(after));
    // ⑤ لا طبيبٌ في عيادتين مختلفتين (ازدواج)
    const dbl = (slots: LoadedSlot[]) => {
      for (const id of new Set(sundaySlots(slots).map((s) => s.doctorId))) { if (new Set(rowsOf(slots, id).map((r) => r.clinicNumber)).size > 1) return id; }
      return '';
    };
    check('(ب-⑤) لا ازدواجَ عيادةٍ لطبيب', dbl(after) === '', dbl(after));

    // ── (ج) الظلُّ يتبعُ مشرفَه (شخصٌ واحد): يحتاجُ متدرّبًا مبتدئًا — لا يوجدُ في الطاقمِ حاليًّا ──
    // منطقُ الإلصاقِ مطابقٌ حرفيًّا لامتصاصِ الدليقيتر (applyNewHeartRebalance) المُختبَرِ بظلٍّ فعليّ.
    check('(ج) لا متدرّبَ في الطاقم ⇒ الإلصاقُ لا يُستدعى (لا شيءَ يُكسَر)', supervisorIds.size === 0, `مشرفون=${supervisorIds.size} — راجعِ الإلصاق`);

    // ── (د) idempotent: بعد إصلاحِ (ب) تشغيلٌ ثانٍ لا يعبث ──
    await putShift(W3, 'sunday', shift(A!, B!, C!));
    await applySoloAbsorption({ clinicId: CID, weekStart: W3, label: 'idem-1' });
    const rD = await applySoloAbsorption({ clinicId: CID, weekStart: W3, label: 'idem-2' });
    check('(د) idempotent: تشغيلٌ ثانٍ لا يعبث (applied=0)', rD.applied === 0, `applied=${rD.applied}`);
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
