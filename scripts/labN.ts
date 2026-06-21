// ═══════════════════════════════════════════════════════════════════════════
// المختبر المعمَّم — عددٌ متغيّر من الأطبّاء/العيادات + احتياط + تخفيف
// يبني عبر القلب الحقيقيّ (createWheels + distributeShiftWheel)، أسبوعان وهميّان.
// ثلاثة عدّادات للعدل: الدليقيتر (الاستضافة) · الاحتياط (الراحة) · الانفراد.
//
// الأوامر:
//   npx tsx scripts/labN.ts build              → يبني الأساس ويحفظه ويعرضه + العدّادات
//   npx tsx scripts/labN.ts show               → يعرض الحالة + العدّادات
//   npx tsx scripts/labN.ts reset              → يعيد للأساس
//   npx tsx scripts/labN.ts compare [1|2]      → قبل/بعد لأسبوع
// ═══════════════════════════════════════════════════════════════════════════
import * as fs from 'fs';
import * as path from 'path';
import { createWheels, distributeShiftWheel } from '../lib/algorithms/wheel';
import { GROUP_TEMPLATES } from '../lib/algorithms/groupTemplates';
import type { LoadedDoctor, ShiftPool, WeekDay, AssignedSlot } from '../lib/algorithms/schedule';

const GA = GROUP_TEMPLATES.find((t) => t.key === 'group_a')!;
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const AR: Record<WeekDay, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };
const WEEKS = ['2026-09-03', '2026-09-10'];
const NCLINICS = 3;
const STATE = path.join(__dirname, '.labN-state.json');

// ٨ أطبّاء، الثامن (زيد) تخفيف عمل
const NAMES = ['محمد', 'أحمد', 'خالد', 'سعد', 'فهد', 'علي', 'عمر', 'زيد'];
const LIGHT = new Set(['d8']);
const docs: LoadedDoctor[] = NAMES.map((name, i) => ({
  id: `d${i + 1}`, name, groupTemplate: GA, groupId: 'g',
  workStatus: LIGHT.has(`d${i + 1}`) ? 'light_duty' : 'active', supervisorDoctorId: null,
}));
const nm = (id: string) => docs.find((d) => d.id === id)?.name || id;
const active = docs.filter((d) => !LIGHT.has(d.id));
const lightDuty = docs.filter((d) => LIGHT.has(d.id));
const pool = (): ShiftPool => ({
  shift: 'morning', available: active, lightDuty, beginnersByBuddy: new Map(),
  beginnersOrphan: [], absent: [], partialAvailable: [], boardRule: { kind: 'no_board' },
} as ShiftPool);

type DaySlots = AssignedSlot[];

// ─── العرض ───
function renderDay(slots: DaySlots, label: string): string {
  const clinic = new Map<number, Record<number, string>>(); const del: Record<number, string> = {}; const ex: string[] = [];
  for (const s of slots) {
    if (s.role === 'delegator') { del[s.period] = nm(s.doctor.id); continue; }
    if (s.role === 'ex') { ex.push(nm(s.doctor.id)); continue; }
    const c = clinic.get(s.clinicNumber) || {}; c[s.period] = nm(s.doctor.id); clinic.set(s.clinicNumber, c);
  }
  const parts: string[] = [];
  for (const c of [...clinic.keys()].sort((a, b) => a - b)) {
    const p = clinic.get(c)!; const occ = [...new Set(Object.values(p))]; const solo = occ.length === 1;
    parts.push(`ع${c}{${Object.keys(p).sort().map((pr) => `ف${pr}:${p[+pr]}`).join(' ')}}${solo ? '★منفرد' : ''}`);
  }
  if (Object.keys(del).length) parts.push(`دل{${Object.keys(del).sort().map((pr) => `ف${pr}:${del[+pr]}`).join(' ')}}`);
  if (ex.length) parts.push(`احتياط[${[...new Set(ex)].join('+')}]`);
  return `${label.padStart(8)} │ ${parts.join('   ')}`;
}
function render(week: Record<string, DaySlots>, title: string, changed?: Set<string>): string {
  const lines = [`\n${'═'.repeat(64)}\n${title}\n${'═'.repeat(64)}`];
  for (const day of DAYS) lines.push(renderDay(week[day] || [], AR[day] + (changed?.has(day) ? ' ⚠️' : '')));
  return lines.join('\n');
}

// ─── الترتيب الزمنيّ المسطّح ───
const SEQ: { week: string; day: WeekDay }[] = [];
for (const w of WEEKS) for (const d of DAYS) SEQ.push({ week: w, day: d });
const seqIdx = (week: string, day: WeekDay) => SEQ.findIndex((s) => s.week === week && s.day === day);

// ─── العدّادات الثلاثة ───
type St = Record<string, Record<string, DaySlots>>;
const delOf = (st: St): Map<string, number> => { // الاستضافة: كلّ خانة دليقيتر
  const m = new Map<string, number>(); for (const d of docs) m.set(d.id, 0);
  for (const { week, day } of SEQ) for (const s of st[week]![day]!) if (s.role === 'delegator') m.set(s.doctor.id, (m.get(s.doctor.id) || 0) + 1);
  return m;
};
const exOf = (st: St): Map<string, number> => { // الاحتياط: كلّ خانة احتياط = دورُ راحة
  const m = new Map<string, number>(); for (const d of docs) m.set(d.id, 0);
  for (const { week, day } of SEQ) { const seen = new Set<string>(); for (const s of st[week]![day]!) if (s.role === 'ex' && !seen.has(s.doctor.id)) { seen.add(s.doctor.id); m.set(s.doctor.id, (m.get(s.doctor.id) || 0) + 1); } }
  return m;
};
const soloOf = (st: St): Map<string, number> => { // الانفراد: عيادةٌ يشغلها طبيبٌ واحد
  const m = new Map<string, number>(); for (const d of docs) m.set(d.id, 0);
  for (const { week, day } of SEQ) {
    const byC = new Map<number, Set<string>>();
    for (const s of st[week]![day]!) if (s.role === 'clinic') (byC.get(s.clinicNumber) ?? byC.set(s.clinicNumber, new Set()).get(s.clinicNumber)!).add(s.doctor.id);
    for (const ids of byC.values()) if (ids.size === 1) { const o = [...ids][0]!; m.set(o, m.get(o)! + 1); }
  }
  return m;
};
const showCounters = (st: St) => {
  const d = delOf(st), e = exOf(st), s = soloOf(st);
  console.log(`\n📊 العدّادات (دليقيتر · احتياط · انفراد):`);
  for (const doc of docs) console.log(`   ${doc.name.padStart(5)}:  دل ${d.get(doc.id)}   احتياط ${e.get(doc.id)}   انفراد ${s.get(doc.id)}`);
};

const save = (state: any) => fs.writeFileSync(STATE, JSON.stringify(state, null, 2), 'utf8');
const load = () => JSON.parse(fs.readFileSync(STATE, 'utf8'));

function buildBaseline(): St {
  const wheels = createWheels(docs, []);
  const out: St = {};
  for (const week of WEEKS) { out[week] = {}; for (const day of DAYS) out[week]![day] = distributeShiftWheel(day, NCLINICS, pool(), wheels, true).slots; }
  return out;
}

const sig = (slots: DaySlots): string => slots.map((s) => `${s.role}/${s.clinicNumber}/${s.period}/${s.doctor.id}`).sort().join(';');

const cmd = process.argv[2] || 'show';

if (cmd === 'build') {
  const baseline = buildBaseline();
  const state = { docs: docs.map((d) => ({ id: d.id, name: d.name })), weeks: WEEKS, baseline, current: baseline, scenarios: [] };
  save(state);
  console.log(`✅ بُني الأساس: ٨ أطبّاء / ${NCLINICS} عيادات (زيد تخفيف) — ٣ أزواج + مضيفٌ متفرّغ + احتياطيّ، يدوران.\n`);
  for (const w of WEEKS) console.log(render(baseline[w]!, `أسبوع ${w} — الأساس`));
  showCounters(baseline);
} else if (cmd === 'reset') {
  const state = load();
  state.current = JSON.parse(JSON.stringify(state.baseline)); state.scenarios = [];
  save(state);
  console.log('↩️ أُعيد للأساس.');
  for (const w of WEEKS) console.log(render(state.current[w], `أسبوع ${w}`));
  showCounters(state.current);
} else if (cmd === 'compare') {
  const state = load(); const pick = process.argv[3];
  const weeks = pick === '1' ? [WEEKS[0]!] : pick === '2' ? [WEEKS[1]!] : WEEKS;
  for (const w of weeks) {
    const changed = new Set<string>();
    for (const day of DAYS) if (sig(state.baseline[w][day] || []) !== sig(state.current[w][day] || [])) changed.add(day);
    console.log(render(state.baseline[w], `أسبوع ${w} — قبل`));
    console.log(render(state.current[w], `أسبوع ${w} — بعد`, changed));
  }
} else if (cmd === 'absence') {
  // npx tsx scripts/labN.ts absence <1|2> <day> <docId> [أيّام N]
  // غياب طبيّة. في ٨/٣: الاحتياطيّ يغطّي مقعد العيادة، ثمّ يأخذ دورَ احتياط الغائب تعويضًا (الغائب يتحمّل).
  const state = load();
  const wIdx = Number(process.argv[3]) - 1;
  const aDay = process.argv[4] as WeekDay;
  const aId = process.argv[5]!;
  const nDays = Math.max(1, Number(process.argv[6]) || 1);
  const aWeek = WEEKS[wIdx]!;
  const docObj = (id: string) => ({ id, name: nm(id) });
  const before: St = JSON.parse(JSON.stringify(state.current));
  const cur: St = JSON.parse(JSON.stringify(state.current));
  const logs: string[] = [];
  const startI = seqIdx(aWeek, aDay);
  const absDays = [];
  for (let k = 0; k < nDays && startI + k < SEQ.length; k++) absDays.push(SEQ[startI + k]!);
  console.log(`\n🩺 غياب: ${nm(aId)} طبيّة ${nDays > 1 ? `${nDays} أيّام من ` : ''}${AR[aDay]} (${aWeek})`);

  for (const { week, day } of absDays) {
    const slots = cur[week]![day]!;
    const xSlots = slots.filter((s) => s.doctor.id === aId);
    const xClinic = xSlots.filter((s) => s.role === 'clinic');
    const xHost = xSlots.some((s) => s.role === 'delegator');
    const xReserve = xSlots.some((s) => s.role === 'ex');
    if (xReserve && xClinic.length === 0) { cur[week]![day] = slots.filter((s) => s.doctor.id !== aId); logs.push(`${AR[day]}: ${nm(aId)} كان احتياطيًّا (راحة) — لا تغطية`); continue; }
    if (xHost) { logs.push(`${AR[day]}: ${nm(aId)} كان مضيفًا — (نزول المضيف لاحقًا)`); continue; }
    const resId = [...new Set(slots.filter((s) => s.role === 'ex').map((s) => s.doctor.id))][0];
    if (!resId) { logs.push(`${AR[day]}: لا احتياطيّ متاح — (تغطية بنزول المضيف/منفرد لاحقًا)`); continue; }
    // الاحتياطيّ R يغطّي مقاعد X
    const work = slots.filter((s) => s.doctor.id !== aId && !(s.role === 'ex' && s.doctor.id === resId));
    for (const cs of xClinic) work.push({ role: 'clinic', period: cs.period, clinicNumber: cs.clinicNumber, doctor: docObj(resId) } as AssignedSlot);
    cur[week]![day] = work;
    logs.push(`${AR[day]}: ${nm(resId)} (احتياطيّ) غطّى ${nm(aId)} في ع${xClinic.map((c) => c.clinicNumber).join('،')}`);

    // ── امتصاص الاحتياط: R فقَد راحته → ينقل دورَ احتياط X إليه (قَبْليّ أوّلًا) ──
    const dStart = seqIdx(week, day);
    const wkStart = SEQ.findIndex((s) => s.week === week);
    const order: number[] = [];
    for (let i = dStart - 1; i >= wkStart; i--) order.push(i);
    for (let i = dStart + 1; i < SEQ.length; i++) order.push(i);
    let done = false;
    for (const i of order) {
      if (done) break;
      const { week: w2, day: d2 } = SEQ[i]!; const sl = cur[w2]![d2]!;
      const xIsRes = sl.some((s) => s.role === 'ex' && s.doctor.id === aId);
      const rClinic = sl.filter((s) => s.role === 'clinic' && s.doctor.id === resId);
      if (!xIsRes || rClinic.length === 0) continue;
      // بادل: X يأخذ مقاعد R في العيادة، R يصير احتياطيًّا (يرتاح)
      const newSl: DaySlots = [];
      for (const s of sl) {
        if (s.role === 'ex' && s.doctor.id === aId) continue;
        if (s.role === 'clinic' && s.doctor.id === resId) { newSl.push({ ...s, doctor: docObj(aId) }); continue; }
        newSl.push(s);
      }
      newSl.push({ role: 'ex', period: 0, clinicNumber: 1, doctor: docObj(resId) } as AssignedSlot);
      cur[w2]![d2] = newSl;
      logs.push(`   ↳ تعويض احتياط: ${nm(resId)} يرتاح ${AR[d2]} ${w2} [${i < dStart ? 'قَبْليّ' : 'أمامي'}] بدل ${nm(aId)}`);
      done = true;
    }
    if (!done) logs.push(`   ↳ [ج] ${nm(aId)} استنفد دورَ احتياطه — خسارةُ راحةِ ${nm(resId)} مقبولةٌ (غيابُ الأيّام المتعدّدة يُنقص الراحة حتمًا)`);
  }

  state.current = cur;
  state.scenarios.push({ kind: 'absence', week: aWeek, day: aDay, doc: aId, days: nDays });
  save(state);

  console.log(logs.map((l) => '  ' + l).join('\n'));
  console.log(`\n📊 أيّامٌ تغيّرت: ${SEQ.filter(({ week, day }) => sig(before[week]![day]!) !== sig(cur[week]![day]!)).length}`);
  const eb = exOf(before), ea = exOf(cur);
  console.log(`📈 عدّاد الاحتياط (قبل → بعد): ${docs.map((d) => `${d.name}:${eb.get(d.id)}→${ea.get(d.id)}`).join('  ')}`);
} else if (cmd === 'multi') {
  // npx tsx scripts/labN.ts multi <1|2> <day> <id1,id2,...>
  // غيابٌ مركّبٌ في يومٍ واحد → تتالي العازل: الاحتياطيّ يغطّي الأوّل (٨→٧)، ثمّ المضيف ينزل للثاني (٧→٦).
  // العيادةُ أوّلًا دائمًا. عازلُ الاحتياط يمتصّ على محور الاحتياط؛ نزولُ المضيف يمتصّ على محور الدليقيتر.
  const state = load();
  const wIdx = Number(process.argv[3]) - 1;
  const aDay = process.argv[4] as WeekDay;
  const aIds = (process.argv[5] || '').split(',').filter(Boolean);
  const aWeek = WEEKS[wIdx]!;
  const docObj = (id: string) => ({ id, name: nm(id) });
  const before: St = JSON.parse(JSON.stringify(state.current));
  const cur: St = JSON.parse(JSON.stringify(state.current));
  const baseDel = delOf(before);
  const logs: string[] = [];
  const absI = seqIdx(aWeek, aDay);
  const orderFrom = (week: string, day: WeekDay): number[] => {
    const dStart = seqIdx(week, day); const wkStart = SEQ.findIndex((s) => s.week === week);
    const o: number[] = [];
    for (let i = dStart - 1; i >= wkStart; i--) o.push(i); // قَبْليّ: الأقرب-للحدث ← بداية الأسبوع
    for (let i = dStart + 1; i < SEQ.length; i++) o.push(i); // أمامي
    return o;
  };
  console.log(`\n🩺🩺 غيابٌ مركّب: ${aIds.map(nm).join(' + ')} طبّيّة يوم ${AR[aDay]} (${aWeek})`);

  const day0 = cur[aWeek]![aDay]!;
  const clinicAbs = aIds.filter((id) => day0.some((s) => s.role === 'clinic' && s.doctor.id === id));
  let resId: string | null = [...new Set(day0.filter((s) => s.role === 'ex').map((s) => s.doctor.id))][0] || null;
  let buffersUsed = 0;
  const coverers = new Set<string>(); // مَن غطّى اليوم (لا يُرقَّى مضيفًا — مُحمَّلٌ أصلًا)

  for (const aId of clinicAbs) {
    const slots = cur[aWeek]![aDay]!;
    const xClinic = slots.filter((s) => s.role === 'clinic' && s.doctor.id === aId);
    if (resId) {
      // ── العازل ١: الاحتياطيّ يغطّي (٨→٧) ──
      const rId = resId;
      const work = slots.filter((s) => s.doctor.id !== aId && !(s.role === 'ex' && s.doctor.id === rId));
      for (const cs of xClinic) work.push({ role: 'clinic', period: cs.period, clinicNumber: cs.clinicNumber, doctor: docObj(rId) } as AssignedSlot);
      cur[aWeek]![aDay] = work;
      logs.push(`عازل ١ (٨→٧): ${nm(rId)} (احتياطيّ) غطّى ${nm(aId)} في ع${xClinic.map((c) => c.clinicNumber).join('،')}`);
      // امتصاص الاحتياط (قَبْليّ أوّلًا): الغائب يدفع دورَ احتياطه للمُغطّي
      let done = false;
      for (const i of orderFrom(aWeek, aDay)) {
        if (done) break;
        const { week: w2, day: d2 } = SEQ[i]!; const sl = cur[w2]![d2]!;
        if (!sl.some((s) => s.role === 'ex' && s.doctor.id === aId)) continue;
        if (!sl.some((s) => s.role === 'clinic' && s.doctor.id === rId)) continue;
        const newSl: DaySlots = [];
        for (const s of sl) {
          if (s.role === 'ex' && s.doctor.id === aId) continue;
          if (s.role === 'clinic' && s.doctor.id === rId) { newSl.push({ ...s, doctor: docObj(aId) }); continue; }
          newSl.push(s);
        }
        newSl.push({ role: 'ex', period: 0, clinicNumber: 1, doctor: docObj(rId) } as AssignedSlot);
        cur[w2]![d2] = newSl;
        logs.push(`   ↳ امتصاص الاحتياط: ${nm(rId)} يرتاح ${AR[d2]} ${w2} [${i < absI ? 'قَبْليّ' : 'أمامي'}] بدل ${nm(aId)}`);
        done = true;
      }
      if (!done) logs.push(`   ↳ [ج] ${nm(aId)} استنفد دورَ احتياطه — خسارةُ راحةِ ${nm(rId)} مقبولة`);
      coverers.add(rId); resId = null; buffersUsed++;
    } else {
      // ── العازل ٢: المضيف ينزل (٧→٦) — العيادةُ أوّلًا ──
      const dayS = cur[aWeek]![aDay]!;
      const hostId = [...new Set(dayS.filter((s) => s.role === 'delegator').map((s) => s.doctor.id))][0];
      if (!hostId) { logs.push(`الثاني (${nm(aId)}): لا مضيف للنزول — (تحوّلٌ لمنفرد لاحقًا)`); continue; }
      const seat = xClinic[0]!;
      const work: DaySlots = [];
      for (const s of dayS) {
        if (s.role === 'clinic' && s.doctor.id === aId) continue; // أزِل الغائب
        if (s.role === 'delegator' && s.doctor.id === hostId && s.period === seat.period) continue; // المضيف يترك استضافة فترة المقعد
        work.push(s);
      }
      work.push({ role: 'clinic', period: seat.period, clinicNumber: seat.clinicNumber, doctor: docObj(hostId) } as AssignedSlot);
      // رقِّ طبيبًا يعمل الفترة الأخرى (حرٌّ في فترة المقعد) ليستضيف الفترة الشاغرة — الأقلّ دليقيترًا
      const otherP = seat.period === 1 ? 2 : 1;
      const promo = [...new Set(work.filter((s) => s.role === 'clinic' && s.period === otherP).map((s) => s.doctor.id))]
        .filter((id) => id !== hostId && !coverers.has(id))
        .sort((a, b) => (baseDel.get(a)! - baseDel.get(b)!) || a.localeCompare(b))[0];
      if (promo) {
        work.push({ role: 'delegator', period: seat.period, clinicNumber: seat.clinicNumber, doctor: docObj(promo) } as AssignedSlot);
        logs.push(`عازل ٢ (٧→٦): العيادةُ أوّلًا — ${nm(hostId)} (مضيف) نزل لـع${seat.clinicNumber} ف${seat.period} مكان ${nm(aId)}؛ ${nm(promo)} رُقِّيَ مضيفًا ف${seat.period} (ثنائيُّ استضافةٍ مثل ٦/٣)`);
      } else logs.push(`عازل ٢: ${nm(hostId)} نزل لـع${seat.clinicNumber} ف${seat.period}؛ استضافةُ ف${seat.period} سقطت (لا مرشّح)`);
      cur[aWeek]![aDay] = work;
      buffersUsed++;
    }
  }

  // ═══ موازنة الدليقيتر إلى الأساس (قَبْليّ أوّلًا، أمامي احتياطًا) ═══
  // نقلُ خانةِ استضافةٍ من فائضٍ إلى ناقصٍ حُرٍّ في تلك الفترة — لا يُمَسّ أيُّ مقعدِ عيادة.
  const order = orderFrom(aWeek, aDay);
  const delSwaps: string[] = [];
  for (let iter = 0; iter < 8; iter++) {
    const dc = delOf(cur);
    const deficit = docs.map((d) => d.id).filter((id) => dc.get(id)! < baseDel.get(id)!);
    const surplus = docs.map((d) => d.id).filter((id) => dc.get(id)! > baseDel.get(id)!);
    if (!deficit.length || !surplus.length) break;
    let done = false;
    for (const i of order) {
      if (done) break;
      if (i === absI) continue; // لا نوازن على يوم الحدث نفسه
      const { week, day } = SEQ[i]!; const slots = cur[week]![day]!;
      for (const S of surplus) {
        const sDel = slots.filter((s) => s.role === 'delegator' && s.doctor.id === S);
        if (!sDel.length) continue;
        for (const Dd of deficit) {
          const ddP = new Set(slots.filter((s) => s.role === 'clinic' && s.doctor.id === Dd).map((s) => s.period));
          if (!ddP.size) continue; // Dd يجب أن يعمل عيادةً ذلك اليوم (ليستضيف فترته الحرّة)
          const slot = sDel.find((s) => !ddP.has(s.period) && !slots.some((x) => x.role === 'delegator' && x.doctor.id === Dd && x.period === s.period));
          if (!slot) continue;
          slot.doctor = docObj(Dd);
          delSwaps.push(`${AR[day]} ${week} [${i < absI ? 'قَبْليّ' : 'أمامي'}]: خانةُ استضافةِ ف${slot.period} ${nm(S)} ← ${nm(Dd)}`);
          done = true; break;
        }
        if (done) break;
      }
    }
    if (!done) break;
  }

  state.current = cur;
  state.scenarios.push({ kind: 'multi', week: aWeek, day: aDay, docs: aIds });
  save(state);

  console.log(logs.map((l) => '  ' + l).join('\n'));
  console.log(`\n🔧 موازنة الدليقيتر: ${delSwaps.length ? delSwaps.join(' | ') : 'لا حاجة'}`);
  // اعرض اليوم المتغيّر قبل/بعد
  console.log(renderDay(before[aWeek]![aDay]!, 'قبل'));
  console.log(renderDay(cur[aWeek]![aDay]!, 'بعد'));
  console.log(`\n📊 أيّامٌ تغيّرت: ${SEQ.filter(({ week, day }) => sig(before[week]![day]!) !== sig(cur[week]![day]!)).length}`);
  const db = delOf(before), da = delOf(cur), eb = exOf(before), ea = exOf(cur);
  console.log(`📈 الدليقيتر (قبل→بعد): ${docs.map((d) => `${d.name}:${db.get(d.id)}→${da.get(d.id)}`).join('  ')}`);
  console.log(`📈 الاحتياط (قبل→بعد): ${docs.map((d) => `${d.name}:${eb.get(d.id)}→${ea.get(d.id)}`).join('  ')}`);
} else if (cmd === 'permission') {
  // npx tsx scripts/labN.ts permission <1|2> <day> <docId> <فترة محجوبة 1|2>
  // الاستئذان = فترةٌ واحدةٌ محجوبة؛ الطبيب حاضرٌ يعمل الفترة الأخرى. في ٨/٣ ثلاثة أشكال:
  //   • احتياطيّ (راحة) → لا تعارض.  • عياديّ (فترة واحدة) → تبديلُ فترةٍ مع زميل العيادة (بلا دَين عدل).
  //   • مضيفٌ متفرّغ → تُنقَل استضافةُ الفترة المحجوبة لطبيبٍ متفرّغٍ فيها، ثمّ امتصاصُ الدليقيتر للأساس.
  const state = load();
  const wIdx = Number(process.argv[3]) - 1;
  const pDay = process.argv[4] as WeekDay;
  const pId = process.argv[5]!;
  const pBlk = Number(process.argv[6]) || 1;
  const pWeek = WEEKS[wIdx]!;
  const docObj = (id: string) => ({ id, name: nm(id) });
  const before: St = JSON.parse(JSON.stringify(state.current));
  const cur: St = JSON.parse(JSON.stringify(state.current));
  const baseDel = delOf(before);
  const absI = seqIdx(pWeek, pDay);
  const orderFrom = (week: string, day: WeekDay): number[] => {
    const dStart = seqIdx(week, day); const wkStart = SEQ.findIndex((s) => s.week === week);
    const o: number[] = [];
    for (let i = dStart - 1; i >= wkStart; i--) o.push(i);
    for (let i = dStart + 1; i < SEQ.length; i++) o.push(i);
    return o;
  };
  const slots: DaySlots = cur[pWeek]![pDay]!;
  const mine = slots.filter((s) => s.doctor.id === pId && s.role !== 'ex');
  const myClinic = mine.filter((s) => s.role === 'clinic');
  const isHost = mine.some((s) => s.role === 'delegator');
  const isReserve = myClinic.length === 0 && !isHost && slots.some((s) => s.role === 'ex' && s.doctor.id === pId);
  const openP = pBlk === 1 ? 2 : 1;
  const caseName = isReserve ? 'احتياطيّ (راحة)' : isHost ? 'مضيفٌ متفرّغ' : 'عياديّ (فترة واحدة)';
  console.log(`\n🚪 استئذان: ${nm(pId)} يحجب ف${pBlk} يوم ${AR[pDay]} (${pWeek}) — الحالة: ${caseName}`);
  const logs: string[] = [];

  if (isReserve) {
    logs.push('راحةٌ أصلًا — لا يعمل أيَّ فترة، لا تعارض.');
  } else if (isHost) {
    const delBlk = mine.find((s) => s.role === 'delegator' && s.period === pBlk);
    if (!delBlk) logs.push(`${nm(pId)} لا يستضيف ف${pBlk} — لا تعارض.`);
    else {
      // رقِّ طبيبًا يعمل openP (متفرّغٌ في pBlk) ليستضيف الفترة المحجوبة — الأقلّ دليقيترًا
      const promo = [...new Set(slots.filter((s) => s.role === 'clinic' && s.period === openP && s.doctor.id !== pId).map((s) => s.doctor.id))]
        .filter((id) => !slots.some((x) => x.role === 'delegator' && x.doctor.id === id))
        .sort((a, b) => (baseDel.get(a)! - baseDel.get(b)!) || a.localeCompare(b))[0];
      if (promo) { delBlk.doctor = docObj(promo); logs.push(`${nm(promo)} يستضيف ف${pBlk} مكان ${nm(pId)} (يعمل عيادته ف${openP})؛ ${nm(pId)} يبقى يستضيف ف${openP}.`); }
      else logs.push(`لا مرشّح لاستضافة ف${pBlk} — تسقط (نقص العدد لاحقًا).`);
    }
    cur[pWeek]![pDay] = slots;
  } else {
    // عياديّ: تبديلُ فترةٍ مع زميل العيادة
    const blockedSeat = myClinic.find((s) => s.period === pBlk);
    if (!blockedSeat) logs.push(`${nm(pId)} يعمل ف${openP} لا ف${pBlk} — لا تعارض.`);
    else {
      const partner = slots.find((s) => s.role === 'clinic' && s.clinicNumber === blockedSeat.clinicNumber && s.period === openP && s.doctor.id !== pId);
      if (partner) { blockedSeat.period = openP; partner.period = pBlk; logs.push(`تبديلٌ نظيفٌ مع زميل العيادة: ${nm(pId)}←ف${openP}، ${nm(partner.doctor.id)}←ف${pBlk} (لا دَينَ عدل).`); }
      else {
        // احتياطيٌّ متفرّغٌ يأخذ المقعد المحجوب، والمستأذِن يرتاح؟ — بسيط: الاحتياطيّ يغطّي ف${pBlk}
        const resId = [...new Set(slots.filter((s) => s.role === 'ex').map((s) => s.doctor.id))][0];
        if (resId) { blockedSeat.doctor = docObj(resId); logs.push(`لا زميلَ متاح → الاحتياطيّ ${nm(resId)} يغطّي ف${pBlk} (امتصاصُ احتياطٍ لاحقًا).`); }
        else logs.push('لا زميلَ ولا احتياطيّ → تبديلٌ بين العيادات (لاحقًا).');
      }
    }
    cur[pWeek]![pDay] = slots;
  }

  // ═══ امتصاص الدليقيتر إلى الأساس (قَبْليّ أوّلًا) — بلا أثرٍ إن كان متوازنًا (العياديّ النظيف) ═══
  const order = orderFrom(pWeek, pDay);
  const delSwaps: string[] = [];
  for (let iter = 0; iter < 8; iter++) {
    const dc = delOf(cur);
    const deficit = docs.map((d) => d.id).filter((id) => dc.get(id)! < baseDel.get(id)!);
    const surplus = docs.map((d) => d.id).filter((id) => dc.get(id)! > baseDel.get(id)!);
    if (!deficit.length || !surplus.length) break;
    let done = false;
    for (const i of order) {
      if (done) break;
      if (i === absI) continue;
      const { week, day } = SEQ[i]!; const sl = cur[week]![day]!;
      for (const S of surplus) {
        const sDel = sl.filter((s) => s.role === 'delegator' && s.doctor.id === S);
        if (!sDel.length) continue;
        for (const Dd of deficit) {
          const ddP = new Set(sl.filter((s) => s.role === 'clinic' && s.doctor.id === Dd).map((s) => s.period));
          if (!ddP.size) continue;
          const slot = sDel.find((s) => !ddP.has(s.period) && !sl.some((x) => x.role === 'delegator' && x.doctor.id === Dd && x.period === s.period));
          if (!slot) continue;
          slot.doctor = docObj(Dd);
          delSwaps.push(`${AR[day]} ${week} [${i < absI ? 'قَبْليّ' : 'أمامي'}]: خانةُ استضافةِ ف${slot.period} ${nm(S)} ← ${nm(Dd)}`);
          done = true; break;
        }
        if (done) break;
      }
    }
    if (!done) break;
  }

  state.current = cur;
  state.scenarios.push({ kind: 'permission', week: pWeek, day: pDay, doc: pId, blk: pBlk });
  save(state);

  console.log(logs.map((l) => '  ' + l).join('\n'));
  console.log(`🔧 امتصاص الدليقيتر: ${delSwaps.length ? delSwaps.join(' | ') : 'لا حاجة (متوازن)'}`);
  console.log(renderDay(before[pWeek]![pDay]!, 'قبل'));
  console.log(renderDay(cur[pWeek]![pDay]!, 'بعد'));
  console.log(`\n📊 أيّامٌ تغيّرت: ${SEQ.filter(({ week, day }) => sig(before[week]![day]!) !== sig(cur[week]![day]!)).length}`);
  const db = delOf(before), da = delOf(cur);
  console.log(`📈 الدليقيتر (قبل→بعد): ${docs.map((d) => `${d.name}:${db.get(d.id)}→${da.get(d.id)}`).join('  ')}`);
} else if (cmd === 'day') {
  // npx tsx scripts/labN.ts day <1|2> <day> "<events>"   حيث events بـ'+': abs:dN  |  perm:dN:P
  // مُحلِّلُ اليومِ الموحَّد — يمنع كسرَ المزيج (مزيج ج). ترتيبٌ صارم:
  //   (١) إزالة كلّ الغائبين أوّلًا (يخرجون من كلّ الأدوار) — ثوابت: لا يظهر غائبٌ في أيّ خانة.
  //   (٢) الاستئذان على الناجين فقط (لا يُرقَّى/يُبدَّل غائب).
  //   (٣) تتالي العازل (العيادة أوّلًا): احتياطيّ يغطّي ← مضيف ينزل — مع استبعاد الغائبين واحترام الحجب.
  //   (٤) امتصاص المحورين (احتياط + دليقيتر) للأساس، مع استبعاد الغائبين من أيّ إسناد.
  const state = load();
  const wIdx = Number(process.argv[3]) - 1;
  const dDay = process.argv[4] as WeekDay;
  const evStr = process.argv[5] || '';
  const dWeek = WEEKS[wIdx]!;
  const docObj = (id: string) => ({ id, name: nm(id) });
  const before: St = JSON.parse(JSON.stringify(state.current));
  const cur: St = JSON.parse(JSON.stringify(state.current));
  const baseDel = delOf(before);
  const absI = seqIdx(dWeek, dDay);
  const orderFrom = (week: string, day: WeekDay): number[] => {
    const dStart = seqIdx(week, day); const wkStart = SEQ.findIndex((s) => s.week === week);
    const o: number[] = [];
    for (let i = dStart - 1; i >= wkStart; i--) o.push(i);
    for (let i = dStart + 1; i < SEQ.length; i++) o.push(i);
    return o;
  };
  // تحليل الأحداث
  const absent = new Set<string>();
  const perms: { id: string; blk: number }[] = [];
  for (const tok of evStr.split('+').filter(Boolean)) {
    const p = tok.split(':');
    if (p[0] === 'abs') absent.add(p[1]!);
    else if (p[0] === 'perm') perms.push({ id: p[1]!, blk: Number(p[2]) || 1 });
  }
  const blocked = new Map<string, Set<number>>();
  for (const p of perms) if (!absent.has(p.id)) (blocked.get(p.id) ?? blocked.set(p.id, new Set()).get(p.id)!).add(p.blk);
  const logs: string[] = [];
  console.log(`\n🗓️  يومٌ مركّب: ${AR[dDay]} (${dWeek}) — غياب:[${[...absent].map(nm).join('،') || '—'}] · استئذان:[${perms.map((p) => `${nm(p.id)} ف${p.blk}`).join('، ') || '—'}]`);

  // ─── (١) إزالة الغائبين أوّلًا ───
  let slots = cur[dWeek]![dDay]!;
  const vac: { clinic: number; period: number; owner: string | null }[] = [];
  const hostVacated: number[] = [];
  for (const s of slots) {
    if (!absent.has(s.doctor.id)) continue;
    if (s.role === 'clinic') vac.push({ clinic: s.clinicNumber, period: s.period, owner: s.doctor.id });
    else if (s.role === 'delegator') hostVacated.push(s.period);
  }
  slots = slots.filter((s) => !absent.has(s.doctor.id));
  cur[dWeek]![dDay] = slots;
  if (absent.size) logs.push(`(١) أُزيل الغائبون → شواغر [${vac.map((v) => `ع${v.clinic}/ف${v.period}`).join('، ') || '—'}]${hostVacated.length ? `، استضافةٌ شاغرة ف[${hostVacated.join('،')}]` : ''}.`);

  // ─── (٢) الاستئذان على الناجين ───
  for (const { id, blk } of perms) {
    if (absent.has(id)) { logs.push(`(٢) ${nm(id)} غائبٌ — استئذانه ساقط.`); continue; }
    const mine = slots.filter((s) => s.doctor.id === id && s.role !== 'ex');
    const isHost = mine.some((s) => s.role === 'delegator');
    const openP = blk === 1 ? 2 : 1;
    if (isHost) {
      const delBlk = mine.find((s) => s.role === 'delegator' && s.period === blk);
      if (!delBlk) { logs.push(`(٢) ${nm(id)} لا يستضيف ف${blk} — لا تعارض.`); continue; }
      const promo = [...new Set(slots.filter((s) => s.role === 'clinic' && s.period === openP && s.doctor.id !== id).map((s) => s.doctor.id))]
        .filter((x) => !absent.has(x) && !(blocked.get(x)?.has(blk)) && !slots.some((y) => y.role === 'delegator' && y.doctor.id === x))
        .sort((a, b) => (baseDel.get(a)! - baseDel.get(b)!) || a.localeCompare(b))[0];
      if (promo) { delBlk.doctor = docObj(promo); logs.push(`(٢) استئذان مضيف: ${nm(promo)} يستضيف ف${blk} مكان ${nm(id)}.`); }
      else logs.push(`(٢) لا مرشّح لاستضافة ف${blk} مكان ${nm(id)} — تؤجَّل.`);
    } else {
      const blockedSeat = mine.find((s) => s.role === 'clinic' && s.period === blk);
      if (!blockedSeat) { logs.push(`(٢) ${nm(id)} يعمل ف${openP} لا ف${blk} — لا تعارض.`); continue; }
      const partner = slots.find((s) => s.role === 'clinic' && s.clinicNumber === blockedSeat.clinicNumber && s.period === openP && s.doctor.id !== id && !absent.has(s.doctor.id) && !(blocked.get(s.doctor.id)?.has(blk)));
      if (partner) { blockedSeat.period = openP; partner.period = blk; logs.push(`(٢) استئذان عياديّ: ${nm(id)}↔${nm(partner.doctor.id)} (تبديل فترة، بلا دَين).`); }
      else { blockedSeat.period = openP; vac.push({ clinic: blockedSeat.clinicNumber, period: blk, owner: null }); logs.push(`(٢) ${nm(id)} بلا زميلٍ متاح → يبقى ف${openP}، وشاغرةُ ف${blk} للعازل.`); }
    }
  }
  cur[dWeek]![dDay] = slots;

  // ─── (٣) تتالي العازل — العيادةُ أوّلًا ───
  const usedRes = new Set<string>();
  const reserveAbsorb = (coverer: string, owner: string | null) => {
    if (!owner) return;
    for (const i of orderFrom(dWeek, dDay)) {
      const { week: w2, day: d2 } = SEQ[i]!; const sl = cur[w2]![d2]!;
      if (!sl.some((s) => s.role === 'ex' && s.doctor.id === owner)) continue;
      if (!sl.some((s) => s.role === 'clinic' && s.doctor.id === coverer)) continue;
      const ns: DaySlots = [];
      for (const s of sl) {
        if (s.role === 'ex' && s.doctor.id === owner) continue;
        if (s.role === 'clinic' && s.doctor.id === coverer) { ns.push({ ...s, doctor: docObj(owner) }); continue; }
        ns.push(s);
      }
      ns.push({ role: 'ex', period: 0, clinicNumber: 1, doctor: docObj(coverer) } as AssignedSlot);
      cur[w2]![d2] = ns;
      logs.push(`   ↳ امتصاص احتياط: ${nm(coverer)} يرتاح ${AR[d2]} ${w2} [${i < absI ? 'قَبْليّ' : 'أمامي'}] بدل ${nm(owner)}.`);
      return;
    }
    logs.push(`   ↳ [ج] ${nm(owner)} استنفد احتياطه — خسارةُ ${nm(coverer)} مقبولة.`);
  };
  for (const v of vac) {
    if (slots.some((s) => s.role === 'clinic' && s.clinicNumber === v.clinic && s.period === v.period)) continue; // مُلِئت
    const r = [...new Set(slots.filter((s) => s.role === 'ex' && !absent.has(s.doctor.id) && !usedRes.has(s.doctor.id) && !(blocked.get(s.doctor.id)?.has(v.period))).map((s) => s.doctor.id))][0];
    if (r) {
      slots = slots.filter((s) => !(s.role === 'ex' && s.doctor.id === r));
      slots.push({ role: 'clinic', period: v.period, clinicNumber: v.clinic, doctor: docObj(r) } as AssignedSlot);
      usedRes.add(r); cur[dWeek]![dDay] = slots;
      logs.push(`(٣) عازل احتياط: ${nm(r)} غطّى ع${v.clinic}/ف${v.period}.`);
      reserveAbsorb(r, v.owner);
    } else {
      const hp = slots.find((s) => s.role === 'delegator' && s.period === v.period && !absent.has(s.doctor.id));
      if (hp) {
        const hId = hp.doctor.id;
        slots = slots.filter((s) => !(s.role === 'delegator' && s.doctor.id === hId && s.period === v.period));
        slots.push({ role: 'clinic', period: v.period, clinicNumber: v.clinic, doctor: docObj(hId) } as AssignedSlot);
        const otherP = v.period === 1 ? 2 : 1;
        const promo = [...new Set(slots.filter((s) => s.role === 'clinic' && s.period === otherP && s.doctor.id !== hId).map((s) => s.doctor.id))]
          .filter((x) => !absent.has(x) && !usedRes.has(x) && !(blocked.get(x)?.has(v.period)) && !slots.some((y) => y.role === 'delegator' && y.doctor.id === x))
          .sort((a, b) => (baseDel.get(a)! - baseDel.get(b)!) || a.localeCompare(b))[0];
        if (promo) { slots.push({ role: 'delegator', period: v.period, clinicNumber: v.clinic, doctor: docObj(promo) } as AssignedSlot); logs.push(`(٣) نزول المضيف: ${nm(hId)}→ع${v.clinic}/ف${v.period}؛ ${nm(promo)} يستضيف ف${v.period}.`); }
        else logs.push(`(٣) نزول المضيف: ${nm(hId)}→ع${v.clinic}/ف${v.period}؛ استضافةُ ف${v.period} سقطت (لا مرشّح).`);
        cur[dWeek]![dDay] = slots;
      } else logs.push(`(٣) شاغرةُ ع${v.clinic}/ف${v.period} بلا عازل — تُترك للقائد (نقص عدد).`);
    }
  }
  // استضافةٌ تركها غائبٌ مضيف → رقِّ ناجيًا (إن لم تُملأ)
  for (const hp of hostVacated) {
    if (slots.some((s) => s.role === 'delegator' && s.period === hp)) continue;
    const otherP = hp === 1 ? 2 : 1;
    const promo = [...new Set(slots.filter((s) => s.role === 'clinic' && s.period === otherP).map((s) => s.doctor.id))]
      .filter((x) => !absent.has(x) && !(blocked.get(x)?.has(hp)) && !slots.some((y) => y.role === 'delegator' && y.doctor.id === x))
      .sort((a, b) => (baseDel.get(a)! - baseDel.get(b)!) || a.localeCompare(b))[0];
    if (promo) { slots.push({ role: 'delegator', period: hp, clinicNumber: 1, doctor: docObj(promo) } as AssignedSlot); logs.push(`(٣) استضافةُ غائبٍ ف${hp} → ${nm(promo)}.`); }
    else logs.push(`(٣) استضافةُ غائبٍ ف${hp} سقطت (لا مرشّح).`);
  }
  cur[dWeek]![dDay] = slots;

  // ─── (٤) امتصاص الدليقيتر للأساس (قَبْليّ أوّلًا) — يستبعد الغائبين ───
  const order = orderFrom(dWeek, dDay);
  const delSwaps: string[] = [];
  for (let iter = 0; iter < 10; iter++) {
    const dc = delOf(cur);
    const deficit = docs.map((d) => d.id).filter((id) => !absent.has(id) && dc.get(id)! < baseDel.get(id)!);
    const surplus = docs.map((d) => d.id).filter((id) => !absent.has(id) && dc.get(id)! > baseDel.get(id)!);
    if (!deficit.length || !surplus.length) break;
    let done = false;
    for (const i of order) {
      if (done) break;
      if (i === absI) continue;
      const { week, day } = SEQ[i]!; const sl = cur[week]![day]!;
      for (const S of surplus) {
        const sDel = sl.filter((s) => s.role === 'delegator' && s.doctor.id === S);
        if (!sDel.length) continue;
        for (const Dd of deficit) {
          const ddP = new Set(sl.filter((s) => s.role === 'clinic' && s.doctor.id === Dd).map((s) => s.period));
          if (!ddP.size) continue;
          const slot = sDel.find((s) => !ddP.has(s.period) && !sl.some((x) => x.role === 'delegator' && x.doctor.id === Dd && x.period === s.period));
          if (!slot) continue;
          slot.doctor = docObj(Dd);
          delSwaps.push(`${AR[day]} ${week} [${i < absI ? 'قَبْليّ' : 'أمامي'}]: ف${slot.period} ${nm(S)} ← ${nm(Dd)}`);
          done = true; break;
        }
        if (done) break;
      }
    }
    if (!done) break;
  }

  // ─── فحص الثوابت ───
  const day1 = cur[dWeek]![dDay]!;
  const problems: string[] = [];
  for (const id of absent) if (day1.some((s) => s.doctor.id === id)) problems.push(`✗ الغائب ${nm(id)} ما زال في خانة!`);
  for (const p of perms) if (!absent.has(p.id) && day1.some((s) => s.role === 'clinic' && s.doctor.id === p.id && s.period === p.blk)) problems.push(`✗ المستأذِن ${nm(p.id)} يعمل ف${p.blk} المحجوبة!`);
  for (const period of [1, 2]) {
    const seen = new Map<string, number>();
    for (const s of day1) if (s.period === period || (s.role === 'ex')) { /* ex فترته 0 */ }
    for (const s of day1.filter((x) => x.period === period)) seen.set(s.doctor.id, (seen.get(s.doctor.id) || 0) + 1);
    for (const [id, n] of seen) if (n > 1) problems.push(`✗ ${nm(id)} محجوزٌ مرّتين في ف${period}!`);
  }

  state.current = cur;
  state.scenarios.push({ kind: 'day', week: dWeek, day: dDay, events: evStr });
  save(state);

  // دَينٌ مؤجَّل على محور الدليقيتر: فائضٌ على ناجين لا يقابله إلّا نقصٌ لدى غائب (مضيفٌ غاب
  // فوزِّعت استضافتُه ولا يملك دورًا آخر يُعوِّض به) → يُؤجَّل لأقدميّة البناء القادم (لا يُسدَّد الآن).
  const dcF = delOf(cur);
  const resSurplus = docs.map((d) => d.id).filter((id) => !absent.has(id) && dcF.get(id)! > baseDel.get(id)!);
  const resAbsDeficit = docs.map((d) => d.id).filter((id) => absent.has(id) && dcF.get(id)! < baseDel.get(id)!);
  let delMsg = delSwaps.length ? delSwaps.join(' | ') : '';
  if (resSurplus.length && resAbsDeficit.length) delMsg += `${delMsg ? ' + ' : ''}[ج-دليقيتر] استضافةُ الغائب (${resAbsDeficit.map(nm).join('،')}) وُزِّعت على ${resSurplus.map(nm).join('،')} — دَينٌ يؤجَّل لأقدميّة البناء القادم`;
  if (!delMsg) delMsg = 'لا حاجة';
  console.log(logs.map((l) => '  ' + l).join('\n'));
  console.log(`🔧 امتصاص الدليقيتر: ${delMsg}`);
  console.log(renderDay(before[dWeek]![dDay]!, 'قبل'));
  console.log(renderDay(cur[dWeek]![dDay]!, 'بعد'));
  console.log(`\n${problems.length ? '🚨 ' + problems.join('  ') : '✅ الثوابت سليمة: لا غائبٌ في خانة، لا مستأذِنٌ في فترته المحجوبة، لا حجزَ مزدوج.'}`);
  const db = delOf(before), da = delOf(cur), eb = exOf(before), ea = exOf(cur);
  console.log(`📈 الدليقيتر (قبل→بعد): ${docs.map((d) => `${d.name}:${db.get(d.id)}→${da.get(d.id)}`).join('  ')}`);
  console.log(`📈 الاحتياط (قبل→بعد): ${docs.map((d) => `${d.name}:${eb.get(d.id)}→${ea.get(d.id)}`).join('  ')}`);
} else {
  const state = load();
  for (const w of WEEKS) console.log(render(state.current[w], `أسبوع ${w} — الحاليّ`));
  showCounters(state.current);
}
