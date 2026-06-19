/* تجربةٌ شاملةٌ كأنّ القلب الجديد هو الحيّ (ظلّ): مزيجٌ من الطبيّات والاستئذانات عبر
 * ٣ أسابيع — متزامنة، متعدّدة بيومٍ واحد، بعيدة للأسبوع القادم، + الامتصاص قبل الحدث
 * + سيناريوهاتٌ مقصودةٌ لإخراج الأخطاء (نقص، حدثٌ مكرّر، أهليّةٌ فارغة، تعارض).
 * قراءةٌ فقط — لا يكتب حرفًا. */
import { loadScheduleData, schedule } from '../lib/algorithms/schedule';
import type { WeekDay, Shift, TraineeMode, LoadedSlot } from '../lib/algorithms/schedule';
import { extractHeavySeats, lastHeavyStamps, solveLookahead } from '../lib/algorithms/solver';
import type { HeavySeat } from '../lib/algorithms/solver';

const CID = '10000000-0000-0000-0000-000000000001';
const WEEKS = ['2099-01-04', '2099-01-11', '2099-01-18'];
const WL: Record<string, string> = { '2099-01-04': 'الأوّل', '2099-01-11': 'الثاني', '2099-01-18': 'الثالث' };
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DL = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
const DI: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
const st = (w: string, di: number) => `${w}#${di}#0`;
let pass = 0; let fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; fails.push(`${n} — ${d}`); console.log('  ✗ ' + n + ' — ' + d); } };

type Ev = { type: 'طبية' | 'استئذان'; who: string; w: string; di: number };

async function main() {
  const pre = await loadScheduleData(CID, WEEKS[0]!);
  const tm: Record<string, TraineeMode> = {};
  for (const t of pre.data!.doctors.filter((d) => d.workStatus === 'trainee')) tm[t.id] = 'beginner';
  const aShiftPlan = Object.fromEntries(DAYS.map((d) => [d, 'morning' as Shift])) as Record<WeekDay, Shift>;
  for (const w of WEEKS) {
    const recipe = { weekStart: w, clinicId: CID, aShiftPlan, boardConfig: { scenario: { kind: 'all_morning' as const }, includeInExRotation: false }, traineeModes: tm };
    await schedule.build({ ...recipe, dryRun: false });
    await schedule.saveBuildConfig({ ...recipe, dryRun: true });
  }
  const d3 = (await loadScheduleData(CID, WEEKS[2]!)).data!;
  const allSlots: LoadedSlot[] = [...d3.pastSlots, ...d3.existingSlots];
  const doctors = d3.doctors;
  const nm = (id: string) => doctors.find((x) => x.id === id)?.name ?? id;
  const idOf = (name: string) => doctors.find((x) => x.id === name || x.name === name)?.id ?? name;
  const poolIds = new Set(doctors.filter((x) => x.groupTemplate.key !== 'board' && x.workStatus !== 'trainee' && x.workStatus !== 'light_duty').map((x) => x.id));

  const windowSeats = (): HeavySeat[] => {
    const out: HeavySeat[] = [];
    for (const w of WEEKS) for (const di of [0, 1, 2, 3, 4]) {
      const ss = allSlots.filter((s) => s.weekStart === w && DI[s.dayOfWeek] === di && [1, 2].includes(s.period));
      out.push(...extractHeavySeats(ss, poolIds));
    }
    return out.sort((a, b) => a.stamp.localeCompare(b.stamp));
  };
  const prior = lastHeavyStamps(allSlots.filter((s) => s.weekStart < WEEKS[0]!));

  // يطبّق أحداثًا (طبية/استئذان = الطبيب غير مؤهَّلٍ ذلك الشفت) ويُشغّل القلب الجديد.
  const apply = (seats: HeavySeat[], evs: Ev[]) => {
    const absentByStamp = new Map<string, Set<string>>();
    for (const e of evs) { const s = st(e.w, e.di); (absentByStamp.get(s) ?? absentByStamp.set(s, new Set()).get(s)!).add(idOf(e.who)); }
    const adj = seats.map((s) => ({ ...s, eligible: s.eligible.filter((id) => !absentByStamp.get(s.stamp)?.has(id)) }));
    return solveLookahead(doctors, adj, prior);
  };
  // تحقّقٌ بنيويّ: لا طبيبٌ في مقعدين بنفس الختم (قيد فيزيائيّ).
  const noDoubleBook = (rec: any, seats: HeavySeat[]) => {
    const byStamp = new Map<string, string[]>();
    for (const fa of rec.fullAssignment) { const seat = seats.find((s) => s.id === fa.seatId)!; (byStamp.get(seat.stamp) ?? byStamp.set(seat.stamp, []).get(seat.stamp)!).push(fa.doctorId); }
    for (const ids of byStamp.values()) if (new Set(ids).size !== ids.length) return false;
    return true;
  };
  const report = (rec: any) => {
    const byWeek: Record<string, number> = { [WEEKS[0]!]: 0, [WEEKS[1]!]: 0, [WEEKS[2]!]: 0 };
    for (const a of rec.assignments) { const w = (a.seatId.split('|')[1] ?? '').split('#')[0]!; if (w in byWeek) byWeek[w]++; }
    console.log(`     لمسات: ${rec.assignments.length} [أوّل=${byWeek[WEEKS[0]!]} ثاني=${byWeek[WEEKS[1]!]} ثالث=${byWeek[WEEKS[2]!]}] · حِمل ${rec.maxLoadBefore}→${rec.maxLoadAfter} · أهليّة=${rec.eligibilityRespected ? '✓' : '✗'} · محفوظ=${rec.conserved ? '✓' : '✗'}`);
  };

  const seats = windowSeats();
  console.log(`النافذة: ${seats.length} مقعد دليقيتر عبر ٣ أسابيع.\n`);

  // ════════ سيناريو ١: د١ طبية + د٢ استئذان **نفس اليوم** (الأسبوع الأوّل، الثلاثاء) ════════
  console.log('① طبية + استئذان متزامنان (الأسبوع الأوّل، الثلاثاء):');
  const tueSeats = seats.filter((s) => s.stamp === st(WEEKS[0]!, 2));
  const d1 = tueSeats[0]?.current ?? [...poolIds][0]!;
  const d2 = [...poolIds].find((id) => id !== d1)!;
  const r1 = apply(seats, [{ type: 'طبية', who: d1, w: WEEKS[0]!, di: 2 }, { type: 'استئذان', who: d2, w: WEEKS[0]!, di: 2 }]);
  console.log(`   ${nm(d1)} طبية، ${nm(d2)} استئذان — كلاهما الثلاثاء`); report(r1);
  check('① لا يُسنَد لغائبٍ مقعدٌ يوم غيابه', !r1.assignments.some((a) => a.seatId.includes(st(WEEKS[0]!, 2)) && [nm(d1), nm(d2)].includes(a.to)), '');
  check('① لا حجزٌ مزدوج + أهليّة + حفظ', noDoubleBook(r1, seats) && r1.eligibilityRespected && r1.conserved, '');

  // ════════ سيناريو ٢: أكثر من طبية بيومٍ واحد (الأسبوع الثاني، الاثنين) ════════
  console.log('\n② عدّة طبيّات بيومٍ واحد (الأسبوع الثاني، الاثنين):');
  const monSeats = seats.filter((s) => s.stamp === st(WEEKS[1]!, 1));
  const sick = monSeats.slice(0, Math.min(2, monSeats.length)).map((s) => s.current);
  const r2 = apply(seats, sick.map((w) => ({ type: 'طبية' as const, who: w, w: WEEKS[1]!, di: 1 })));
  console.log(`   غياب: ${sick.map(nm).join('، ')}`); report(r2);
  check('② يغطّي رغم عدّة غيابات، بلا حجزٍ مزدوج', noDoubleBook(r2, seats) && r2.eligibilityRespected, '');

  // ════════ سيناريو ٣: طلبٌ بعيدٌ للأسبوع القادم (استئذان الأسبوع الثالث الأربعاء) ════════
  console.log('\n③ طلبٌ بعيد (استئذان الأسبوع الثالث، الأربعاء):');
  const farSeats = seats.filter((s) => s.stamp === st(WEEKS[2]!, 3));
  const far = farSeats[0]?.current ?? d1;
  const r3 = apply(seats, [{ type: 'استئذان', who: far, w: WEEKS[2]!, di: 3 }]);
  console.log(`   ${nm(far)} استئذان الأسبوع الثالث الأربعاء`); report(r3);
  check('③ التعديل في الأسبوع الثالث فقط (لا يمسّ ما قبله بلا داعٍ)', r3.assignments.every((a) => (a.seatId.split('|')[1] ?? '').startsWith(WEEKS[2]!)) || r3.assignments.length === 0, '');

  // ════════ سيناريو ٤: المزيج الكامل في تجربةٍ واحدة ════════
  console.log('\n④ المزيج الكامل (طبيّات + استئذانات عبر الأسابيع الثلاثة معًا):');
  const mix: Ev[] = [
    { type: 'طبية', who: d1, w: WEEKS[0]!, di: 2 },
    { type: 'استئذان', who: d2, w: WEEKS[0]!, di: 2 },
    ...sick.map((w) => ({ type: 'طبية' as const, who: w, w: WEEKS[1]!, di: 1 })),
    { type: 'استئذان', who: far, w: WEEKS[2]!, di: 3 },
  ];
  const r4 = apply(seats, mix);
  report(r4);
  check('④ المزيج: لا حجزٌ مزدوج', noDoubleBook(r4, seats), '');
  check('④ المزيج: أهليّةٌ محترمة + لا يُسيء الحِمل', r4.eligibilityRespected && r4.maxLoadAfter <= r4.maxLoadBefore + 1, `${r4.maxLoadBefore}→${r4.maxLoadAfter}`);
  check('④ المزيج: لا غائبٌ في مقعدٍ يوم غيابه', !r4.assignments.some((a) => { const s = (a.seatId.split('|')[1] ?? ''); return mix.some((e) => st(e.w, e.di) === s && nm(idOf(e.who)) === a.to); }), '');
  const r4b = apply(seats, mix);
  check('④ المزيج: حتميّ (نفس المخرَج)', JSON.stringify(r4.assignments) === JSON.stringify(r4b.assignments), '');

  // ════════ سيناريو ٥: الامتصاص قبل الحدث — مُجبَرٌ لاحقًا يُرتاح مبكّرًا ════════
  console.log('\n⑤ الامتصاص قبل الحدث (إجبارٌ مستقبليّ → راحةٌ مبكّرة):');
  const early = seats[0]!; const late = seats[seats.length - 1]!;
  const forced = seats.map((s) => s.id === late.id ? { ...s, eligible: [early.current], current: early.current } : s);
  const r5 = solveLookahead(doctors, forced, prior);
  const earlyAfter = r5.fullAssignment.find((a) => a.seatId === early.id)?.doctorId;
  console.log(`   ${nm(early.current)} مُجبَرٌ على آخر مقعد (الأسبوع الثالث) → أبكر مقعد صار لـ ${nm(earlyAfter ?? '')}`);
  report(r5);
  check('⑤ المُجبَر يُرتاح مبكّرًا (امتصاصٌ قبل الحدث)', earlyAfter !== early.current || early.id === late.id, `${nm(earlyAfter ?? '')}`);
  check('⑤ لا يزيد أقصى الحِمل', r5.maxLoadAfter <= r5.maxLoadBefore, `${r5.maxLoadBefore}→${r5.maxLoadAfter}`);

  // ════════ سيناريوهاتٌ لإخراج الأخطاء ════════
  console.log('\n⑥ مُلاحقة الأخطاء (حالاتٌ حدّيّة):');
  // (أ) نقص: كلّ مؤهَّلي شفتٍ غائبون → مقعدٌ بلا شاغل (conserved=false)، لا انهيار.
  let crashed = false; let rShort: any = null;
  try {
    const sStamp = st(WEEKS[0]!, 0);
    const allElig = new Set(seats.filter((s) => s.stamp === sStamp).flatMap((s) => s.eligible));
    rShort = apply(seats, [...allElig].map((id) => ({ type: 'طبية' as const, who: id, w: WEEKS[0]!, di: 0 })));
  } catch { crashed = true; }
  check('⑥أ نقصٌ كامل: لا انهيار + يُعلِّم النقص', !crashed && rShort?.conserved === false, `crash=${crashed} conserved=${rShort?.conserved}`);
  // (ب) حدثٌ مكرّر: نفس الطبيب طبية + استئذان نفس اليوم → كأنّه غيابٌ واحد (لا تضاعف).
  const rDup = apply(seats, [{ type: 'طبية', who: d1, w: WEEKS[0]!, di: 2 }, { type: 'استئذان', who: d1, w: WEEKS[0]!, di: 2 }]);
  const rSingle = apply(seats, [{ type: 'طبية', who: d1, w: WEEKS[0]!, di: 2 }]);
  check('⑥ب حدثٌ مكرّر لنفس الطبيب = غيابٌ واحد (متطابق)', JSON.stringify(rDup.assignments) === JSON.stringify(rSingle.assignments), '');
  // (ج) غيابُ طبيبٍ لا يملك أيّ مقعدٍ ثقيل → لا تغيير (no-op).
  const noSeatDoc = [...poolIds].find((id) => !seats.some((s) => s.current === id)) ?? 'ZZZ';
  const rNoop = apply(seats, [{ type: 'طبية', who: noSeatDoc, w: WEEKS[1]!, di: 4 }]);
  const rBase = solveLookahead(doctors, seats, prior);
  check('⑥ج غيابُ بلا مقعدٍ ثقيل = لا تغيير', JSON.stringify(rNoop.assignments) === JSON.stringify(rBase.assignments), '');
  // (د) نافذةٌ فارغة → لا انهيار.
  let emptyOk = true; try { solveLookahead(doctors, [], prior); } catch { emptyOk = false; }
  check('⑥د نافذةٌ فارغة: لا انهيار', emptyOk, '');

  // ════════ سيناريو ⑦: ضغطٌ كثيفٌ مُصطنَع — مقاعد كثيرة + غيابات متداخلة (كسرٌ متعمّد) ════════
  console.log('\n⑦ ضغطٌ كثيف (مقعدان/شفت × ١٠ شفتات، غيابات متداخلة):');
  const S = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
  const sdocs = S.map((id, i) => ({ id, name: `ط${i + 1}`, groupTemplate: { key: 'group_a' } as any, groupId: 'g', workStatus: 'normal' as any, supervisorDoctorId: null }));
  const dense: HeavySeat[] = [];
  for (let k = 0; k < 10; k++) { // ١٠ شفتات
    const stmp = `9999-01-01#${k}#0`;
    dense.push({ id: `d|${stmp}|a`, stamp: stmp, kind: 'delegator', eligible: [...S], current: S[k % 6]! });
    dense.push({ id: `d|${stmp}|b`, stamp: stmp, kind: 'delegator', eligible: [...S], current: S[(k + 1) % 6]! });
  }
  // غيابات متداخلة: كلّ طبيبٍ غائبٌ في شفتاتٍ مختلفة، بعضها يتقاطع.
  const denseAbsent = new Map<string, Set<string>>();
  const addAbs = (k: number, id: string) => { const s = `9999-01-01#${k}#0`; (denseAbsent.get(s) ?? denseAbsent.set(s, new Set()).get(s)!).add(id); };
  for (let k = 0; k < 10; k++) { addAbs(k, S[k % 6]!); if (k % 3 === 0) addAbs(k, S[(k + 2) % 6]!); } // أحيانًا غيابان بشفت
  const denseAdj = dense.map((s) => ({ ...s, eligible: s.eligible.filter((id) => !denseAbsent.get(s.stamp)?.has(id)) }));
  let denseCrash = false; let rD: any = null;
  try { rD = solveLookahead(sdocs, denseAdj, new Map()); } catch (e: any) { denseCrash = true; console.log('   انهيار:', e.message); }
  if (rD) {
    report(rD);
    // تحقّق الحجز المزدوج يدويًّا على المقاعد الكثيفة.
    const byStamp = new Map<string, string[]>();
    for (const fa of rD.fullAssignment) { const seat = dense.find((s) => s.id === fa.seatId)!; (byStamp.get(seat.stamp) ?? byStamp.set(seat.stamp, []).get(seat.stamp)!).push(fa.doctorId); }
    let dbl = false; for (const ids of byStamp.values()) if (new Set(ids).size !== ids.length) dbl = true;
    // لا يُسنَد لغائبٍ مقعدٌ في شفت غيابه.
    let absHit = false;
    for (const fa of rD.fullAssignment) { const seat = dense.find((s) => s.id === fa.seatId)!; if (denseAbsent.get(seat.stamp)?.has(fa.doctorId)) absHit = true; }
    const rD2 = solveLookahead(sdocs, denseAdj, new Map());
    check('⑦ لا انهيار تحت الضغط', !denseCrash, '');
    check('⑦ لا حجزٌ مزدوج (طبيبٌ في مقعدين بنفس الشفت)', !dbl, '');
    check('⑦ لا غائبٌ يُسنَد له في شفت غيابه', !absHit, '');
    check('⑦ الأهليّة محترمة + محفوظ', rD.eligibilityRespected && rD.conserved, '');
    check('⑦ حتميّ تحت الضغط', JSON.stringify(rD.fullAssignment) === JSON.stringify(rD2.fullAssignment), '');
  } else check('⑦ لا انهيار تحت الضغط', false, 'انهار');

  console.log(`\n════════ النتيجة: ${pass} PASS / ${fail} FAIL ════════`);
  if (fails.length) fails.forEach((f) => console.log('  • ' + f));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
