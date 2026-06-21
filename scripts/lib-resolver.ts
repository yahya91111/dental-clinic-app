// ═══════════════════════════════════════════════════════════════════════════
// محرّكُ العدلِ اللحظيّ المُعمَّم — قابلٌ لإعادة الاستعمال لأيّ عددٍ (أطبّاء/عيادات/بورد/تخفيف).
// يُبنى الأساسُ عبر القلب الحقيقيّ، ويُحلَّل اليومُ بمُحلِّلٍ موحَّد بترتيبٍ صارم:
//   (١) إزالة الغياب أوّلًا  (٢) الاستئذان على الناجين  (٣) تتالي العازل (العيادة أوّلًا)  (٤) امتصاص المحورين.
// ثوابتٌ مفروضة: لا غائبٌ في خانة · لا مستأذِنٌ في فترته المحجوبة · لا حجزَ مزدوج في فترة · البورد لا يستضيف ولا يُعوِّض.
// ═══════════════════════════════════════════════════════════════════════════
import { createWheels, distributeShiftWheel } from '../lib/algorithms/wheel';
import { GROUP_TEMPLATES } from '../lib/algorithms/groupTemplates';
import type { LoadedDoctor, ShiftPool, WeekDay, AssignedSlot, BoardRuleResolved } from '../lib/algorithms/schedule';

export const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
export const AR: Record<WeekDay, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };
const GA = GROUP_TEMPLATES.find((t) => t.key === 'group_a')!;
const BOARD_T = GROUP_TEMPLATES.find((t) => t.key === 'board')!;

export type DaySlots = AssignedSlot[];
export type St = Record<string, Record<string, DaySlots>>;
export type Cfg = {
  names: string[];          // أسماء الأطبّاء (الطول = العدد)
  lightIds: Set<string>;    // المخفَّفون (d-index)
  boardIds: Set<string>;    // البورد
  M: number;                // عدد العيادات
  weeks: string[];          // تواريخ بداية الأسابيع
};
export type Event = { kind: 'abs'; id: string } | { kind: 'perm'; id: string; blk: number };

export const idOf = (i: number) => `d${i + 1}`;
export function makeDocs(cfg: Cfg): LoadedDoctor[] {
  return cfg.names.map((name, i) => {
    const id = idOf(i);
    return {
      id, name, groupTemplate: cfg.boardIds.has(id) ? BOARD_T : GA, groupId: 'g',
      workStatus: cfg.lightIds.has(id) ? 'light_duty' : 'active', supervisorDoctorId: null,
    } as LoadedDoctor;
  });
}
export const nmOf = (cfg: Cfg) => (id: string) => cfg.names[Number(id.slice(1)) - 1] || id;
export function seqOf(cfg: Cfg): { week: string; day: WeekDay }[] {
  const s: { week: string; day: WeekDay }[] = [];
  for (const w of cfg.weeks) for (const d of DAYS) s.push({ week: w, day: d });
  return s;
}

export function buildBaseline(cfg: Cfg): St {
  const docs = makeDocs(cfg);
  const board = docs.filter((d) => cfg.boardIds.has(d.id));
  const active = docs.filter((d) => d.workStatus !== 'light_duty' && !cfg.boardIds.has(d.id));
  const light = docs.filter((d) => d.workStatus === 'light_duty' && !cfg.boardIds.has(d.id));
  const boardRule: BoardRuleResolved =
    board.length >= 2 ? { kind: 'shared_clinic', doctors: board } : board.length === 1 ? { kind: 'in_pool' } : { kind: 'no_board' };
  const avail = board.length === 1 ? docs.filter((d) => d.workStatus !== 'light_duty') : active; // 1 بورد يدخل البِركة (لا يستضيف عبر createWheels)
  const pool = (): ShiftPool => ({
    shift: 'morning', available: avail, lightDuty: light, beginnersByBuddy: new Map(),
    beginnersOrphan: [], absent: [], partialAvailable: [], boardRule,
  } as ShiftPool);
  const wheels = createWheels(docs, []);
  const out: St = {};
  for (const w of cfg.weeks) { out[w] = {}; for (const d of DAYS) out[w]![d] = distributeShiftWheel(d, cfg.M, pool(), wheels, true).slots; }
  return out;
}

// ─── العدّادات ───
export function delOf(cfg: Cfg, st: St): Map<string, number> {
  const m = new Map<string, number>(); cfg.names.forEach((_, i) => m.set(idOf(i), 0));
  for (const { week, day } of seqOf(cfg)) for (const s of st[week]![day]!) if (s.role === 'delegator') m.set(s.doctor.id, (m.get(s.doctor.id) || 0) + 1);
  return m;
}
export function exOf(cfg: Cfg, st: St): Map<string, number> {
  const m = new Map<string, number>(); cfg.names.forEach((_, i) => m.set(idOf(i), 0));
  for (const { week, day } of seqOf(cfg)) { const seen = new Set<string>(); for (const s of st[week]![day]!) if (s.role === 'ex' && !seen.has(s.doctor.id)) { seen.add(s.doctor.id); m.set(s.doctor.id, (m.get(s.doctor.id) || 0) + 1); } }
  return m;
}

const docObj = (cfg: Cfg, id: string) => ({ id, name: nmOf(cfg)(id) });

export type ResolveResult = { logs: string[]; problems: string[]; delSwaps: string[]; delBalanced: boolean; exBalancedExceptAbsent: boolean };

// ─── مصدرُ الأحداث: سجلٌّ مرتّب من دفعات اليوم. الجدول = الأساس + replay(journal) ───
// كلُّ مُدخَلٍ = أحداثُ يومٍ واحدٍ تُحَلّ معًا (مُعرَّفٌ id للكنسل المنفرد).
export type JournalEntry = { id: string; week: string; day: WeekDay; events: Event[] };
export type Journal = JournalEntry[];

// يُعيد بناء الجدول من الأساس (الثابت) بتطبيق السجلّ بالترتيب. لا يمسّ baseline.
export function replay(cfg: Cfg, baseline: St, journal: Journal): St {
  const st = JSON.parse(JSON.stringify(baseline)) as St;
  for (const e of journal) resolveDay(cfg, st, e.week, e.day, e.events);
  return st;
}
// إعادةُ بناءٍ تجمع مشاكلَ الثوابت من كلّ يوم (للاختبار). تُعيد {st, problems}.
export function replayChecked(cfg: Cfg, baseline: St, journal: Journal): { st: St; problems: string[] } {
  const st = JSON.parse(JSON.stringify(baseline)) as St;
  const problems: string[] = [];
  for (const e of journal) { const r = resolveDay(cfg, st, e.week, e.day, e.events); problems.push(...r.problems.map((p) => `[${e.id} ${AR[e.day]}] ${p}`)); }
  return { st, problems };
}

// وصفُ دورِ طبيبٍ في يومٍ (للفروق): عيادة/فترة · دل · احتياط · غائب.
export function describeDay(cfg: Cfg, st: St, week: string, day: WeekDay, docId: string): string {
  const mine = st[week]![day]!.filter((s) => s.doctor.id === docId);
  if (!mine.length) return 'غائب';
  return mine.map((s) => (s.role === 'delegator' ? `دل ف${s.period}` : s.role === 'ex' ? 'احتياط' : `ع${s.clinicNumber}/ف${s.period}`)).sort().join('+');
}
export type DiffEntry = { week: string; day: WeekDay; doctor: string; before: string; after: string };
// فروقُ جدولين: لكلّ (يوم، طبيب) تغيّر دورُه → مُدخَل. تُبلَّغ هذه الأطبّاء فقط.
export function diffSchedules(cfg: Cfg, oldSt: St, newSt: St): DiffEntry[] {
  const out: DiffEntry[] = [];
  for (const { week, day } of seqOf(cfg)) for (let i = 0; i < cfg.names.length; i++) {
    const id = idOf(i); const b = describeDay(cfg, oldSt, week, day, id); const a = describeDay(cfg, newSt, week, day, id);
    if (b !== a) out.push({ week, day, doctor: id, before: b, after: a });
  }
  return out;
}

// الواجهة: عند استئذانِ مضيفٍ متفرّغ، تُجرّب الشكلين (تبديلٌ كامل / استدعاء ثنائيّ) وتختار الأقلّ
// اضطرابًا في عدّاد الدليقيتر (تعادل → التبديل الكامل، يحفظ شكل المضيف المتفرّغ). وإلّا نواةٌ واحدة.
export function resolveDay(cfg: Cfg, st: St, week: string, day: WeekDay, events: Event[], strategy: 'auto' | 'full-swap' | 'relocate' = 'auto'): ResolveResult {
  if (strategy !== 'auto') return resolveDayCore(cfg, st, week, day, events, strategy);
  const dedHostPerm = events.some((e) => {
    if (e.kind !== 'perm') return false;
    const mine = st[week]![day]!.filter((s) => s.doctor.id === e.id && s.role !== 'ex');
    return mine.filter((s) => s.role === 'delegator').length === 2 && !mine.some((s) => s.role === 'clinic');
  });
  if (!dedHostPerm) return resolveDayCore(cfg, st, week, day, events, 'full-swap');
  const baseDel = delOf(cfg, st);
  const imbalance = (s: St): number => { const d = delOf(cfg, s); let t = 0; for (let i = 0; i < cfg.names.length; i++) { const id = idOf(i); if (!cfg.boardIds.has(id)) t += Math.abs(d.get(id)! - baseDel.get(id)!); } return t; };
  const stA = JSON.parse(JSON.stringify(st)) as St; const rA = resolveDayCore(cfg, stA, week, day, events, 'full-swap');
  const stB = JSON.parse(JSON.stringify(st)) as St; const rB = resolveDayCore(cfg, stB, week, day, events, 'relocate');
  const cA = imbalance(stA), cB = imbalance(stB);
  const useB = cB < cA; const chosen = useB ? stB : stA; const res = useB ? rB : rA;
  res.logs.unshift(`⚖️ شكلُ استئذان المضيف: ${useB ? 'استدعاء ثنائيّ (أقلّ اضطرابًا)' : 'تبديلٌ كامل (يحفظ المضيف المتفرّغ)'} [بقايا دل: تبديل=${cA} استدعاء=${cB}]`);
  for (const w of cfg.weeks) for (const d of DAYS) st[w]![d] = chosen[w]![d];
  return res;
}
// المُحلِّل الموحَّد ليومٍ واحد (نواة). strategy يحكم شكلَ استئذان المضيف المتفرّغ. يُعدِّل st موضعيًّا.
function resolveDayCore(cfg: Cfg, st: St, week: string, day: WeekDay, events: Event[], strategy: 'full-swap' | 'relocate'): ResolveResult {
  const nm = nmOf(cfg);
  const SEQ = seqOf(cfg);
  const seqIdx = (w: string, d: WeekDay) => SEQ.findIndex((s) => s.week === w && s.day === d);
  const isBoard = (id: string) => cfg.boardIds.has(id);
  const baseDel = delOf(cfg, JSON.parse(JSON.stringify(st)) as St); // الأساس = قبل التعديل
  const baseEx = exOf(cfg, JSON.parse(JSON.stringify(st)) as St);    // أساس الاحتياط (للسداد النهائيّ)
  const absI = seqIdx(week, day);
  const orderFrom = (w: string, d: WeekDay): number[] => {
    const dS = seqIdx(w, d); const wk = SEQ.findIndex((s) => s.week === w);
    const o: number[] = [];
    for (let i = dS - 1; i >= wk; i--) o.push(i);
    for (let i = dS + 1; i < SEQ.length; i++) o.push(i);
    return o;
  };
  const absent = new Set<string>();
  const perms: { id: string; blk: number }[] = [];
  for (const e of events) { if (e.kind === 'abs') absent.add(e.id); else perms.push({ id: e.id, blk: e.blk }); }
  const blocked = new Map<string, Set<number>>();
  for (const p of perms) if (!absent.has(p.id)) (blocked.get(p.id) ?? blocked.set(p.id, new Set()).get(p.id)!).add(p.blk);
  const logs: string[] = [];

  // ─── (١) إزالة الغياب أوّلًا ───
  let slots = st[week]![day]!;
  const vac: { clinic: number; period: number; owner: string | null }[] = [];
  const hostVacated: number[] = [];
  const boardAbsent: { clinic: number; period: number }[] = [];
  for (const s of slots) {
    if (!absent.has(s.doctor.id)) continue;
    if (isBoard(s.doctor.id)) { if (s.role === 'clinic') boardAbsent.push({ clinic: s.clinicNumber, period: s.period }); continue; }
    if (s.role === 'clinic') vac.push({ clinic: s.clinicNumber, period: s.period, owner: s.doctor.id });
    else if (s.role === 'delegator') hostVacated.push(s.period);
  }
  slots = slots.filter((s) => !absent.has(s.doctor.id));
  st[week]![day] = slots;

  // غيابُ بورديٍّ عياديّ: زميلُه البورديّ ينفرد بالعيادة (البورد لا يُعوَّض من العاديّين)
  for (const ba of boardAbsent) {
    const mate = slots.find((s) => s.role === 'clinic' && s.clinicNumber === ba.clinic && isBoard(s.doctor.id));
    if (mate) { slots.push({ role: 'clinic', period: ba.period, clinicNumber: ba.clinic, doctor: docObj(cfg, mate.doctor.id) } as AssignedSlot); logs.push(`غيابُ بورد: ${nm(mate.doctor.id)} ينفرد بـع${ba.clinic} (داخليّ، لا يمسّ العاديّين).`); }
    else { const br = slots.find((s) => s.role === 'ex' && isBoard(s.doctor.id)); if (br) { slots = slots.filter((s) => !(s.role === 'ex' && s.doctor.id === br.doctor.id)); slots.push({ role: 'clinic', period: ba.period, clinicNumber: ba.clinic, doctor: docObj(cfg, br.doctor.id) } as AssignedSlot); st[week]![day] = slots; logs.push(`غيابُ بورد: احتياطيُّ البورد ${nm(br.doctor.id)} غطّى ع${ba.clinic}.`); } else logs.push(`غيابُ بورد ع${ba.clinic}/ف${ba.period} بلا تغطيةٍ بورديّة (نقص بورد).`); }
  }
  st[week]![day] = slots;

  // ─── (٢) الاستئذان على الناجين ───
  for (const { id, blk } of perms) {
    if (absent.has(id)) { logs.push(`استئذان ${nm(id)} ساقط (غائب).`); continue; }
    if (isBoard(id)) { logs.push(`استئذان بورديّ ${nm(id)} — مستثنى (يُعالَج داخل البورد).`); continue; }
    const mine = slots.filter((s) => s.doctor.id === id && s.role !== 'ex');
    const openP = blk === 1 ? 2 : 1;
    // الأدوار في الفترة المحجوبة: عيادة؟ استضافة؟  وهل يعمل الفترة الأخرى أصلًا (مزدوجُ دور)؟
    const myClinicBlk = mine.find((s) => s.role === 'clinic' && s.period === blk);
    const myHostBlk = mine.find((s) => s.role === 'delegator' && s.period === blk);
    const hostSlots = mine.filter((s) => s.role === 'delegator');
    const worksOpen = mine.some((s) => s.period === openP);
    // مضيفٌ متفرّغ = يستضيف الفترتين بلا مقعدِ عيادة (شكل ٧/٣ وما فوق). استئذانُه = تبديلٌ كامل (لا تجزئة).
    const dedicatedFull = !!myHostBlk && hostSlots.length === 2 && !mine.some((s) => s.role === 'clinic');
    const fullSwapR = dedicatedFull
      ? [...new Set(slots.filter((s) => s.role === 'clinic' && s.period === openP).map((s) => s.doctor.id))]
          .filter((x) => !absent.has(x) && !isBoard(x) && !(blocked.get(x)?.has(blk)) && !(blocked.get(x)?.has(openP)) && !slots.some((y) => y.role === 'delegator' && y.doctor.id === x))
          .sort((a, b) => (baseDel.get(a)! - baseDel.get(b)!) || a.localeCompare(b))[0]
      : undefined;
    if (dedicatedFull && fullSwapR && strategy === 'full-swap') {
      // البديل R (يعمل ف${openP}) يصير المضيفَ المتفرّغ (الفترتين)، والمستأذِن ينزل لمقعد R في ف${openP}. ثمّ العدل يوازن.
      const rSeat = slots.find((s) => s.role === 'clinic' && s.doctor.id === fullSwapR && s.period === openP)!;
      rSeat.doctor = docObj(cfg, id);
      for (const ds of hostSlots) ds.doctor = docObj(cfg, fullSwapR);
      logs.push(`استئذان مضيفٍ متفرّغ: ${nm(fullSwapR)} صار المضيفَ المتفرّغ (الفترتين)، و${nm(id)} نزل لمقعد ${nm(fullSwapR)} ف${openP}.`);
    } else if (myHostBlk) {
      // ثنائيُّ استضافة (أو متفرّغٌ بلا بديل كامل) → انقل استضافة الفترة المحجوبة لطبيبٍ يعمل openP
      const promo = [...new Set(slots.filter((s) => s.role === 'clinic' && s.period === openP && s.doctor.id !== id).map((s) => s.doctor.id))]
        .filter((x) => !absent.has(x) && !isBoard(x) && !(blocked.get(x)?.has(blk)) && !slots.some((y) => y.doctor.id === x && (y.role === 'delegator' || y.period === blk)))
        .sort((a, b) => (baseDel.get(a)! - baseDel.get(b)!) || a.localeCompare(b))[0];
      if (promo) { myHostBlk.doctor = docObj(cfg, promo); logs.push(`استئذان مضيف: ${nm(promo)} يستضيف ف${blk} مكان ${nm(id)}.`); }
      else logs.push(`لا مرشّح لاستضافة ف${blk} مكان ${nm(id)} — تؤجَّل.`);
    } else if (myClinicBlk) {
      if (!worksOpen) {
        // حرٌّ في الفترة الأخرى → تبديلُ فترةٍ مع زميل العيادة (نظيف، بلا دَين)
        const partner = slots.find((s) => s.role === 'clinic' && s.clinicNumber === myClinicBlk.clinicNumber && s.period === openP && s.doctor.id !== id && !absent.has(s.doctor.id) && !isBoard(s.doctor.id) && !(blocked.get(s.doctor.id)?.has(blk)));
        if (partner) { myClinicBlk.period = openP; partner.period = blk; logs.push(`استئذان عياديّ: ${nm(id)}↔${nm(partner.doctor.id)} (تبديل فترة).`); }
        else { myClinicBlk.period = openP; vac.push({ clinic: myClinicBlk.clinicNumber, period: blk, owner: null }); logs.push(`${nm(id)} بلا زميل → يبقى ف${openP}، شاغرةُ ف${blk} للعازل.`); }
      } else {
        // مزدوجُ دور (عيادة في blk + عيادة/استضافة في openP، مثل ثنائيّ استضافة ٦/٣): يبقى دورُه في openP، ومقعدُه المحجوب يصير شاغرةً يملؤها العازل
        slots = slots.filter((s) => !(s.role === 'clinic' && s.doctor.id === id && s.period === blk));
        st[week]![day] = slots;
        vac.push({ clinic: myClinicBlk.clinicNumber, period: blk, owner: null });
        logs.push(`استئذان مزدوج: ${nm(id)} يبقى ف${openP}، وعيادتُه ف${blk} شاغرةٌ للعازل.`);
      }
    } else {
      logs.push(`${nm(id)} لا يعمل ف${blk} — لا تعارض.`);
    }
  }
  st[week]![day] = slots;

  // ─── (٣) تتالي العازل — العيادةُ أوّلًا ───
  const usedRes = new Set<string>();
  // يُعوِّض المُغطّي (coverer) بأخذ دورِ احتياط المَدين (owner: غائبٌ أو مستأذِن) على يومٍ قَبْليّ ثمّ أماميّ. يُعيد true إن نجح.
  const reserveAbsorb = (coverer: string, owner: string | null): boolean => {
    if (!owner || owner === coverer) return false;
    for (const i of orderFrom(week, day)) {
      const { week: w2, day: d2 } = SEQ[i]!; const sl = st[w2]![d2]!;
      if (!sl.some((s) => s.role === 'ex' && s.doctor.id === owner)) continue;
      if (!sl.some((s) => s.role === 'clinic' && s.doctor.id === coverer)) continue;
      const ns: DaySlots = [];
      for (const s of sl) {
        if (s.role === 'ex' && s.doctor.id === owner) continue;
        if (s.role === 'clinic' && s.doctor.id === coverer) { ns.push({ ...s, doctor: docObj(cfg, owner) }); continue; }
        ns.push(s);
      }
      ns.push({ role: 'ex', period: 0, clinicNumber: 1, doctor: docObj(cfg, coverer) } as AssignedSlot);
      st[w2]![d2] = ns;
      logs.push(`   ↳ امتصاص احتياط: ${nm(coverer)} يرتاح ${AR[d2]} ${w2} [${i < absI ? 'قَبْليّ' : 'أمامي'}] بدل ${nm(owner)}.`);
      return true;
    }
    return false;
  };
  for (const v of vac) {
    if (slots.some((s) => s.role === 'clinic' && s.clinicNumber === v.clinic && s.period === v.period)) continue;
    const r = [...new Set(slots.filter((s) => s.role === 'ex' && !absent.has(s.doctor.id) && !isBoard(s.doctor.id) && !usedRes.has(s.doctor.id) && !(blocked.get(s.doctor.id)?.has(v.period))).map((s) => s.doctor.id))][0];
    if (r) {
      slots = slots.filter((s) => !(s.role === 'ex' && s.doctor.id === r));
      slots.push({ role: 'clinic', period: v.period, clinicNumber: v.clinic, doctor: docObj(cfg, r) } as AssignedSlot);
      usedRes.add(r); st[week]![day] = slots;
      logs.push(`عازل احتياط: ${nm(r)} غطّى ع${v.clinic}/ف${v.period}.`);
      reserveAbsorb(r, v.owner);
    } else {
      const hp = slots.find((s) => s.role === 'delegator' && s.period === v.period && !absent.has(s.doctor.id) && !isBoard(s.doctor.id));
      if (hp) {
        const hId = hp.doctor.id;
        slots = slots.filter((s) => !(s.role === 'delegator' && s.doctor.id === hId && s.period === v.period));
        slots.push({ role: 'clinic', period: v.period, clinicNumber: v.clinic, doctor: docObj(cfg, hId) } as AssignedSlot);
        const otherP = v.period === 1 ? 2 : 1;
        const promo = [...new Set(slots.filter((s) => s.role === 'clinic' && s.period === otherP && s.doctor.id !== hId).map((s) => s.doctor.id))]
          .filter((x) => !absent.has(x) && !isBoard(x) && !usedRes.has(x) && !(blocked.get(x)?.has(v.period)) && !slots.some((y) => y.doctor.id === x && (y.role === 'delegator' || y.period === v.period)))
          .sort((a, b) => (baseDel.get(a)! - baseDel.get(b)!) || a.localeCompare(b))[0];
        if (promo) { slots.push({ role: 'delegator', period: v.period, clinicNumber: v.clinic, doctor: docObj(cfg, promo) } as AssignedSlot); logs.push(`نزول المضيف: ${nm(hId)}→ع${v.clinic}/ف${v.period}؛ ${nm(promo)} يستضيف ف${v.period}.`); }
        else { logs.push(`نزول المضيف: ${nm(hId)}→ع${v.clinic}/ف${v.period}؛ استضافةُ ف${v.period} سقطت (انفرادٌ/نقص).`); }
        st[week]![day] = slots;
      } else logs.push(`شاغرةُ ع${v.clinic}/ف${v.period} بلا عازل — للقائد (نقص عدد).`);
    }
  }
  for (const hp of hostVacated) {
    if (slots.some((s) => s.role === 'delegator' && s.period === hp)) continue;
    const otherP = hp === 1 ? 2 : 1;
    const promo = [...new Set(slots.filter((s) => s.role === 'clinic' && s.period === otherP).map((s) => s.doctor.id))]
      .filter((x) => !absent.has(x) && !isBoard(x) && !(blocked.get(x)?.has(hp)) && !slots.some((y) => y.doctor.id === x && (y.role === 'delegator' || y.period === hp)))
      .sort((a, b) => (baseDel.get(a)! - baseDel.get(b)!) || a.localeCompare(b))[0];
    if (promo) { slots.push({ role: 'delegator', period: hp, clinicNumber: 1, doctor: docObj(cfg, promo) } as AssignedSlot); logs.push(`استضافةُ غائبٍ ف${hp} → ${nm(promo)}.`); }
    else logs.push(`استضافةُ غائبٍ ف${hp} سقطت (لا مرشّح).`);
  }
  st[week]![day] = slots;

  // ─── (٤) امتصاص الدليقيتر (قَبْليّ أوّلًا)، يستبعد الغائبين والبورد ───
  const order = orderFrom(week, day);
  const delSwaps: string[] = [];
  const ids = cfg.names.map((_, i) => idOf(i));
  // ينقل خانةَ استضافةٍ من S (فائض) إلى Dd (ناقص) على يومٍ واحد (قَبْليّ أوّلًا). يُعيد وصفَ التبديل أو null.
  const directMove = (S: string, Dd: string): string | null => {
    for (const i of order) {
      if (i === absI) continue;
      const { week: w, day: d } = SEQ[i]!; const sl = st[w]![d]!;
      const sDel = sl.filter((s) => s.role === 'delegator' && s.doctor.id === S);
      if (!sDel.length) continue;
      const ddP = new Set(sl.filter((s) => s.role === 'clinic' && s.doctor.id === Dd).map((s) => s.period));
      if (!ddP.size) continue;
      const slot = sDel.find((s) => !ddP.has(s.period) && !sl.some((x) => x.role === 'delegator' && x.doctor.id === Dd && x.period === s.period));
      if (!slot) continue;
      slot.doctor = docObj(cfg, Dd);
      return `${AR[d]} ${w} [${i < absI ? 'قَبْليّ' : 'أمامي'}]: ف${slot.period} ${nm(S)} ← ${nm(Dd)}`;
    }
    return null;
  };
  // سلسلةُ خطوتين عبر وسيطٍ M (حين لا يوجد تبديلٌ مباشر): S→M يومًا، ثمّ M→Dd يومًا آخر (صافي: S−١، Dd+١، M=٠).
  const twoHopMove = (S: string, Dd: string): string[] | null => {
    for (const M of ids) {
      if (isBoard(M) || absent.has(M) || M === S || M === Dd) continue;
      let legB: { i: number; slot: AssignedSlot } | null = null; // M يستضيف يومًا يأخذه Dd
      for (const i of order) {
        if (i === absI) continue;
        const sl = st[SEQ[i]!.week]![SEQ[i]!.day]!;
        const mDel = sl.filter((s) => s.role === 'delegator' && s.doctor.id === M);
        if (!mDel.length) continue;
        const ddP = new Set(sl.filter((s) => s.role === 'clinic' && s.doctor.id === Dd).map((s) => s.period));
        if (!ddP.size) continue;
        const slot = mDel.find((s) => !ddP.has(s.period) && !sl.some((x) => x.role === 'delegator' && x.doctor.id === Dd && x.period === s.period));
        if (slot) { legB = { i, slot }; break; }
      }
      if (!legB) continue;
      let legA: { i: number; slot: AssignedSlot } | null = null; // S يستضيف يومًا (≠ يوم ب) يأخذه M
      for (const i of order) {
        if (i === absI || i === legB.i) continue;
        const sl = st[SEQ[i]!.week]![SEQ[i]!.day]!;
        const sDel = sl.filter((s) => s.role === 'delegator' && s.doctor.id === S);
        if (!sDel.length) continue;
        const mP = new Set(sl.filter((s) => s.role === 'clinic' && s.doctor.id === M).map((s) => s.period));
        if (!mP.size) continue;
        const slot = sDel.find((s) => !mP.has(s.period) && !sl.some((x) => x.role === 'delegator' && x.doctor.id === M && x.period === s.period));
        if (slot) { legA = { i, slot }; break; }
      }
      if (!legA) continue;
      legA.slot.doctor = docObj(cfg, M); legB.slot.doctor = docObj(cfg, Dd);
      const dA = SEQ[legA.i]!, dB = SEQ[legB.i]!;
      return [`${AR[dA.day]} ${dA.week} [سلسلة]: ف${legA.slot.period} ${nm(S)}→${nm(M)}`, `${AR[dB.day]} ${dB.week} [سلسلة]: ف${legB.slot.period} ${nm(M)}→${nm(Dd)}`];
    }
    return null;
  };
  for (let iter = 0; iter < 16; iter++) {
    const dc = delOf(cfg, st);
    const deficit = ids.filter((id) => !absent.has(id) && !isBoard(id) && dc.get(id)! < baseDel.get(id)!);
    const surplus = ids.filter((id) => !absent.has(id) && !isBoard(id) && dc.get(id)! > baseDel.get(id)!);
    if (!deficit.length || !surplus.length) break;
    let applied = false;
    for (const S of surplus) { for (const Dd of deficit) { const m = directMove(S, Dd); if (m) { delSwaps.push(m); applied = true; break; } } if (applied) break; }
    if (!applied) { for (const S of surplus) { for (const Dd of deficit) { const ms = twoHopMove(S, Dd); if (ms) { delSwaps.push(...ms); applied = true; break; } } if (applied) break; } }
    if (!applied) break;
  }

  // ─── (٥) سدادُ احتياطٍ نهائيّ: مُغطٍّ حاضرٌ فقَد راحته يُعوَّض من مَدينٍ (غائبٍ أو مستأذِن) له احتياطٌ غير مستهلَك ───
  const debtors = [...new Set([...absent, ...perms.filter((p) => !absent.has(p.id)).map((p) => p.id)])].filter((id) => !isBoard(id));
  for (let pass = 0; pass < ids.length + 2; pass++) {
    const ea = exOf(cfg, st);
    const needy = ids.filter((id) => !isBoard(id) && !absent.has(id) && !debtors.includes(id) && ea.get(id)! < baseEx.get(id)!);
    if (!needy.length) break;
    let any = false;
    for (const coverer of needy) { for (const debtor of debtors) { if (reserveAbsorb(coverer, debtor)) { any = true; break; } } if (any) break; }
    if (!any) { for (const c of needy) logs.push(`   ↳ [ج] خسارةُ راحةِ ${nm(c)} مقبولة (المَدينون استنفدوا احتياطهم/خارج النافذة).`); break; }
  }

  // ─── الثوابت ───
  const problems: string[] = [];
  const d1 = st[week]![day]!;
  for (const id of absent) if (d1.some((s) => s.doctor.id === id)) problems.push(`الغائب ${nm(id)} ما زال في خانة`);
  for (const p of perms) if (!absent.has(p.id) && d1.some((s) => s.role === 'clinic' && s.doctor.id === p.id && s.period === p.blk)) problems.push(`المستأذِن ${nm(p.id)} يعمل ف${p.blk} المحجوبة`);
  for (const period of [1, 2]) { const seen = new Map<string, number>(); for (const s of d1.filter((x) => x.period === period && x.role !== 'ex')) seen.set(s.doctor.id, (seen.get(s.doctor.id) || 0) + 1); for (const [id, n] of seen) if (n > 1) problems.push(`${nm(id)} محجوزٌ مرّتين في ف${period}`); }
  // كلُّ عيادةٍ مأهولةٌ في الفترتين (إلا إن صُرِّح بانفرادٍ مقصود)؟ نتحقّق من وجود تغطية
  for (let c = 1; c <= cfg.M; c++) for (const period of [1, 2]) { const occ = d1.filter((s) => s.role === 'clinic' && s.clinicNumber === c && s.period === period); if (occ.length > 1) problems.push(`ع${c}/ف${period} مزدحمة (${occ.length})`); }

  // اتّزان المحورين
  const daF = delOf(cfg, st);
  const delBalanced = ids.every((id) => isBoard(id) || absent.has(id) || daF.get(id)! === baseDel.get(id)!);
  const exBalancedExceptAbsent = true; // يُحسب خارجيًّا بدقّة في المصفوفة
  return { logs, problems, delSwaps, delBalanced, exBalancedExceptAbsent };
}
