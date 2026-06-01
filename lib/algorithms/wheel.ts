// ═══════════════════════════════════════════════════════════════
// قلب التوزيع الجديد — القاعدة الرباعية بالعجلات (يحلّ محلّ نظام الحمل)
//
// عجلات دوران (موضع لا أرقام): مَن يأخذ الدور → آخر الطابور. الغائب يبقى في
// مكانه فيُؤخذ أوّلاً عند عودته (دورة واحدة ثم لآخره) — لا تكدّس ولا إثقال.
//
// سلّم الأولويات: ① الاحتياط ② المنفرد ③ الدليقيتر ④ تنوّع الفترات (ف1/ف2).
//
// النموذج التجريبي المرجعيّ: scripts/proto-queue.ts
// ═══════════════════════════════════════════════════════════════

import type {
  LoadedDoctor,
  LoadedSlot,
  ShiftPool,
  AssignedSlot,
  ShiftDistribution,
  Period,
  Shift,
  WeekDay,
} from './schedule';

// فترات كل شفت (مُضمَّنة لتفادي دورة استيراد مع schedule.ts)
const PERIODS: Record<Shift, [Period, Period]> = {
  morning: [1, 2],
  evening: [3, 4],
};
const isFirstPeriod = (p: number) => p === 1 || p === 3;

// ─── نقاط السؤال (سياسات الليدر — مؤقّتاً ثوابت، تُمرَّر لاحقاً من المدخلات) ───
export const DELEGATOR_ENABLED = true; // المركز يستعمل الدليقيتر
export const SURPLUS_AS_RESERVE = false; // الفائض الأول دليقيتر منفرد (لا احتياطي)

// ─── حالة العجلات (تُبنى من سجل الأسابيع السابقة، وتستمرّ عبر أيام الأسبوع) ───
export type Wheels = {
  solo: string[]; // عجلة الانفراد (ترتيب دوران بمعرّفات الأطباء)
  del: string[]; // عجلة الدليقيتر
  ex: string[]; // عجلة الاحتياط
  board: string[]; // عجلة البورد (3+: مَن في العيادة مقابل الاحتياط، تتناوب)
  p1MinusP2: Map<string, number>; // ميزان مقعد العيادة ف1/ف2 — لا يحسب الدليقيتر (حياديّ عند الصفر)
  pairWith: Map<string, number>; // "ld|reg" → عدد المزاوجات (منع تثبيت شريك التخفيف)
};

// ─── شكل التوزيع اليوميّ (كم دور من كل نوع) ───
type Shape = {
  hostClinics: number;
  plainPairs: number;
  solos: number;
  soloDelegator: number;
  ex: number;
  empty: number;
};

function computeShape(D: number, M: number, delegator: boolean): Shape {
  const z: Shape = { hostClinics: 0, plainPairs: 0, solos: 0, soloDelegator: 0, ex: 0, empty: 0 };
  if (D <= 0) return { ...z, empty: M };
  if (D < M) return { ...z, solos: D, empty: M - D };
  if (D === M) return { ...z, solos: M };
  if (!delegator) {
    if (D <= 2 * M) return { ...z, plainPairs: D - M, solos: 2 * M - D };
    return { ...z, plainPairs: M, ex: D - 2 * M };
  }
  if (D <= 2 * M) {
    const k = D - M;
    return { ...z, hostClinics: 1, plainPairs: k - 1, solos: M - k };
  }
  if (D === 2 * M + 1) {
    return SURPLUS_AS_RESERVE
      ? { ...z, plainPairs: M, ex: 1 }
      : { ...z, plainPairs: M, soloDelegator: 1 };
  }
  return SURPLUS_AS_RESERVE
    ? { ...z, plainPairs: M, ex: D - 2 * M }
    : { ...z, plainPairs: M, soloDelegator: 1, ex: D - (2 * M + 1) };
}

// يأخذ أوّل count متاحين من مقدّمة العجلة، وينقلهم لآخرها (الباقون بمكانهم).
function spin(wheel: string[], avail: Set<string>, count: number): string[] {
  const picked: string[] = [];
  for (const d of wheel) {
    if (picked.length >= count) break;
    if (avail.has(d)) picked.push(d);
  }
  if (picked.length) {
    const ps = new Set(picked);
    const rest = wheel.filter((d) => !ps.has(d));
    wheel.length = 0;
    wheel.push(...rest, ...picked);
  }
  return picked;
}

// ─── ميزان ف1/ف2 ───
const p1mp2 = (w: Wheels, id: string) => w.p1MinusP2.get(id) ?? 0;
function takeP1(w: Wheels, id: string) { w.p1MinusP2.set(id, p1mp2(w, id) + 1); }
function takeP2(w: Wheels, id: string) { w.p1MinusP2.set(id, p1mp2(w, id) - 1); }

// يرتّب زوجاً عادياً: الأكثر ف1 يُدفع لـ ف2 → [ف1, ف2]
function assignPeriods(w: Wheels, a: LoadedDoctor, b: LoadedDoctor): [LoadedDoctor, LoadedDoctor] {
  const [first, second] = p1mp2(w, a.id) <= p1mp2(w, b.id) ? [a, b] : [b, a];
  takeP1(w, first.id); takeP2(w, second.id);
  return [first, second];
}

// يختار شريك المخفّف: الأقلّ مزاوجةً معه أولاً، ثم الأعلى استحقاقاً لـ ف2، ثم الاسم
function pickPartner(w: Wheels, ld: LoadedDoctor, candidates: LoadedDoctor[]): LoadedDoctor {
  return [...candidates].sort((a, b) => {
    const wa = w.pairWith.get(`${ld.id}|${a.id}`) ?? 0;
    const wb = w.pairWith.get(`${ld.id}|${b.id}`) ?? 0;
    if (wa !== wb) return wa - wb;
    const d = p1mp2(w, b.id) - p1mp2(w, a.id);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name);
  })[0]!;
}

// ─── خطة اليوم (عناصر مجرّدة قبل ربطها بأرقام العيادات/الفترات) ───
type DayPlan = {
  hostPairs: [LoadedDoctor, LoadedDoctor][]; // [عيادة-ف1+دليقيتر-ف2 , عيادة-ف2+دليقيتر-ف1]
  soloDelegators: LoadedDoctor[];
  solos: LoadedDoctor[];
  plainPairs: [LoadedDoctor, LoadedDoctor][]; // [ف1, ف2]
  ldClinics: [LoadedDoctor, LoadedDoctor][]; // [تخفيف ف1, شريك ف2]
  ex: LoadedDoctor[];
};

function fillRegulars(
  pool: LoadedDoctor[], s: Shape, plan: DayPlan,
  lds: LoadedDoctor[], Lc: number, w: Wheels, ldSet: Set<string>,
) {
  const byId = new Map(pool.map((d) => [d.id, d]));
  let arr = [...pool];
  const ids = () => new Set(arr.map((d) => d.id));
  const remove = (rm: string[]) => { const set = new Set(rm); arr = arr.filter((d) => !set.has(d.id)); };

  // ① الاحتياط  ② المنفرد  ③ الدليقيتر — كلٌّ بعجلته
  const exIds = spin(w.ex, ids(), s.ex);
  for (const id of exIds) plan.ex.push(byId.get(id)!);
  remove(exIds);

  const soloIds = spin(w.solo, ids(), s.solos);
  for (const id of soloIds) plan.solos.push(byId.get(id)!);
  remove(soloIds);

  const delSeats = s.soloDelegator + s.hostClinics * 2;
  const delIds = spin(w.del, ids(), delSeats);
  let di = 0;
  for (let c = 0; c < s.soloDelegator; c++) plan.soloDelegators.push(byId.get(delIds[di++]!)!);
  for (let c = 0; c < s.hostClinics; c++) {
    const x = byId.get(delIds[di++]!)!, y = byId.get(delIds[di++]!)!;
    // مَن جلس عيادة-ف1 أقلّ يأخذ مقعد ف1 الآن (والآخر ف2) → تناوب الدور الفرعيّ
    const [a, b] = p1mp2(w, x.id) <= p1mp2(w, y.id) ? [x, y] : [y, x];
    takeP1(w, a.id); takeP2(w, b.id);
    plan.hostPairs.push([a, b]); // a: عيادة-ف1+دليقيتر-ف2 · b: عيادة-ف2+دليقيتر-ف1
  }
  remove(delIds);

  // ④ شركاء التخفيف (عيادة محجوزة): التخفيف ف1، شريكه يتدوّر (لا تثبيت)
  for (let i = 0; i < Lc; i++) {
    const ld = lds[i]!;
    const partner = pickPartner(w, ld, arr);
    arr = arr.filter((d) => d.id !== partner.id);
    w.pairWith.set(`${ld.id}|${partner.id}`, (w.pairWith.get(`${ld.id}|${partner.id}`) ?? 0) + 1);
    takeP1(w, ld.id); takeP2(w, partner.id);
    plan.ldClinics.push([ld, partner]);
  }

  // ⑤ الأزواج: أولاً أزواج التخفيف الموجود في البركة (عند العدد العالي)، ثم العادية
  let remainingPairs = s.plainPairs;
  for (const ld of arr.filter((d) => ldSet.has(d.id))) {
    if (remainingPairs <= 0) break;
    const others = arr.filter((d) => d.id !== ld.id && !ldSet.has(d.id));
    if (others.length === 0) break;
    const partner = pickPartner(w, ld, others);
    arr = arr.filter((d) => d.id !== ld.id && d.id !== partner.id);
    w.pairWith.set(`${ld.id}|${partner.id}`, (w.pairWith.get(`${ld.id}|${partner.id}`) ?? 0) + 1);
    takeP1(w, ld.id); takeP2(w, partner.id);
    plan.plainPairs.push([ld, partner]);
    remainingPairs--;
  }
  let li = 0;
  for (let c = 0; c < remainingPairs; c++) {
    plan.plainPairs.push(assignPeriods(w, arr[li]!, arr[li + 1]!));
    li += 2;
  }
}

function planDay(regulars: LoadedDoctor[], lds: LoadedDoctor[], M: number, w: Wheels): DayPlan {
  const plan: DayPlan = { hostPairs: [], soloDelegators: [], solos: [], plainPairs: [], ldClinics: [], ex: [] };
  const ldSet = new Set(lds.map((d) => d.id));
  const total = regulars.length + lds.length;
  const sAll = computeShape(total, M, DELEGATOR_ENABLED);

  // العدد ≥ 2M+1 (لا منفرد ولا مضيف): التخفيف مشارك عاديّ في العجلات
  if (sAll.solos === 0 && sAll.hostClinics === 0) {
    fillRegulars([...regulars, ...lds], sAll, plan, [], 0, w, ldSet);
    return plan;
  }

  // العدد ≤ 2M: التخفيف يُفضّل الزوج؛ والفائض منه ينفرد عند الشحّ (تعدّد التخفيف)
  const R = regulars.length;
  const surplus = Math.max(0, total - M);
  const Lc = Math.min(lds.length, surplus);
  const ldSoloN = lds.length - Lc;
  const ldSoloIds = new Set(spin(w.solo, new Set(lds.map((d) => d.id)), ldSoloN));
  for (const d of lds) if (ldSoloIds.has(d.id)) plan.solos.push(d);
  const ldPaired = lds.filter((d) => !ldSoloIds.has(d.id));
  const s = computeShape(R - Lc, Math.max(0, M - lds.length), DELEGATOR_ENABLED);
  fillRegulars([...regulars], s, plan, ldPaired, Lc, w, ldSet);
  return plan;
}

// ─── بناء العجلات من سجل الأسابيع السابقة (استمرارية عبر الأسابيع) ───
// ترتيب العجلة = الأقدم/مَن لم يأخذ الدور أولاً (مقدّمة الطابور). الأحدث آخراً.
export function createWheels(doctors: LoadedDoctor[], pastSlots: LoadedSlot[]): Wheels {
  const roster = doctors.map((d) => d.id);
  const rosterIdx = new Map(roster.map((id, i) => [id, i]));
  const boardIds = new Set(
    doctors.filter((d) => d.groupTemplate.key === 'board').map((d) => d.id),
  );

  // آخر ظهور لكل دور (وقت قابل للمقارنة: "أسبوع#يوم")
  const dayIdx: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4 };
  const stamp = (s: LoadedSlot) => `${s.weekStart}#${dayIdx[s.dayOfWeek] ?? 0}`;
  const lastDel = new Map<string, string>();
  const lastEx = new Map<string, string>();
  const lastSolo = new Map<string, string>();
  const lastBoardClinic = new Map<string, string>(); // آخر مرّة كان بورديّ في العيادة المشتركة
  const p1MinusP2 = new Map<string, number>();

  // كشف المنفرد: طبيب له خانتا clinic بنفس (يوم|شفت|عيادة)
  const clinicKey = new Map<string, { id: string; t: string }[]>();
  for (const s of pastSlots) {
    if (s.status !== 'active') continue;
    const t = stamp(s);
    if (s.role === 'delegator') {
      if ((lastDel.get(s.doctorId) ?? '') < t) lastDel.set(s.doctorId, t);
    } else if ((s.role as string) === 'ex') {
      if ((lastEx.get(s.doctorId) ?? '') < t) lastEx.set(s.doctorId, t);
    }
    // ميزان الفترات يحسب مقعد العيادة فقط (لا الدليقيتر) — وإلا بقي المضيف
    // متعادلاً صفراً دائماً (عيادة-ف1 يقابلها دليقيتر-ف2) فيُثبَّت دوره الفرعيّ.
    if (s.role === 'clinic') {
      if (isFirstPeriod(s.period)) p1MinusP2.set(s.doctorId, (p1MinusP2.get(s.doctorId) ?? 0) + 1);
      else p1MinusP2.set(s.doctorId, (p1MinusP2.get(s.doctorId) ?? 0) - 1);
      if (boardIds.has(s.doctorId) && (lastBoardClinic.get(s.doctorId) ?? '') < t) {
        lastBoardClinic.set(s.doctorId, t); // لتدوير احتياط البورد
      }
    }
    if (s.role === 'clinic') {
      const sh = s.period <= 2 ? 'm' : 'e';
      const k = `${s.doctorId}|${s.weekStart}|${s.dayOfWeek}|${sh}|${s.clinicNumber}`;
      const list = clinicKey.get(k) || [];
      list.push({ id: s.doctorId, t });
      clinicKey.set(k, list);
    }
  }
  for (const [, list] of clinicKey) {
    if (list.length === 2) {
      const { id, t } = list[0]!;
      if ((lastSolo.get(id) ?? '') < t) lastSolo.set(id, t);
    }
  }

  const order = (last: Map<string, string>, pool: string[] = roster): string[] =>
    [...pool].sort((a, b) => {
      const la = last.get(a) ?? '', lb = last.get(b) ?? '';
      if (la !== lb) return la < lb ? -1 : 1; // الأقدم/الأبعد أولاً (مقدّمة)
      return (rosterIdx.get(a) ?? 0) - (rosterIdx.get(b) ?? 0);
    });

  // البورد لا يدخل عجلة الدليقيتر إطلاقاً (حتى لو كان وحده داخل البِركة) —
  // يوزَّع بالعيادات/الاحتياط فقط. فنبني عجلة الدليقيتر من غير البورد.
  const nonBoard = roster.filter((id) => !boardIds.has(id));
  const boardRoster = roster.filter((id) => boardIds.has(id));

  return {
    solo: order(lastSolo),
    del: order(lastDel, nonBoard),
    ex: order(lastEx),
    board: order(lastBoardClinic, boardRoster), // الأقدم في العيادة أولاً → يدخلها التالي
    p1MinusP2,
    pairWith: new Map(),
  };
}

// ─── التوزيع لشفت واحد: يحوّل خطة اليوم إلى خانات حقيقية ───
export function distributeShiftWheel(
  day: WeekDay, N: number, pool: ShiftPool, w: Wheels,
): ShiftDistribution {
  const slots: AssignedSlot[] = [];
  const warnings: string[] = [];
  const [p1, p2] = PERIODS[pool.shift];
  const exClinicSlot = pool.shift === 'morning' ? 1 : 2;

  const addClinic = (c: number, p: Period, doc: LoadedDoctor) =>
    slots.push({ day, period: p, clinicNumber: c, doctor: doc, role: 'clinic' });
  const addDel = (p: Period, doc: LoadedDoctor) =>
    slots.push({ day, period: p, clinicNumber: 0, doctor: doc, role: 'delegator' });
  const addEx = (doc: LoadedDoctor) =>
    slots.push({ day, period: 0 as unknown as Period, clinicNumber: exClinicSlot, doctor: doc, role: 'ex' });

  let available = [...pool.available];
  const lds = [...pool.lightDuty];

  // ── البورد (2+): اثنان يتقاسمان آخر عيادة (الفترتان)، والباقي احتياطيّ
  //    يتناوب يوميّاً عبر عجلة البورد (مَن لم يدخل العيادة مؤخّراً يدخلها) ──
  let boardClinic: number | null = null;
  if (pool.boardRule.kind === 'shared_clinic') {
    const boardDocs = pool.boardRule.doctors;
    const byId = new Map(boardDocs.map((d) => [d.id, d]));
    const boardAvail = new Set(boardDocs.map((d) => d.id));
    boardClinic = N;
    const inClinicIds = spin(w.board, boardAvail, 2); // الاثنان للعيادة
    const inClinic = inClinicIds.map((id) => byId.get(id)!);
    if (inClinic.length >= 2) {
      const [x, y] = inClinic;
      const [bf, bs] = p1mp2(w, x!.id) <= p1mp2(w, y!.id) ? [x!, y!] : [y!, x!];
      addClinic(boardClinic, p1, bf); takeP1(w, bf.id);
      addClinic(boardClinic, p2, bs); takeP2(w, bs.id);
    } else if (inClinic.length === 1) {
      addClinic(boardClinic, p1, inClinic[0]!); addClinic(boardClinic, p2, inClinic[0]!);
    }
    const inSet = new Set(inClinicIds);
    for (const d of boardDocs) if (!inSet.has(d.id)) addEx(d); // الباقي احتياطيّ
    available = available.filter((d) => !boardAvail.has(d.id));
  }

  // أرقام العيادات المتاحة (عدا عيادة البورد)
  const clinicNums: number[] = [];
  for (let i = 1; i <= N; i++) if (i !== boardClinic) clinicNums.push(i);

  // ── استئذان جزئيّ (PS/PE): كلٌّ يحجز عيادة في فترته المتاحة، وشريك كامل
  //    يغطّي الفترة الأخرى. يستهلك عيادة وطبيباً كاملاً، فيقلّ M والبِركة. ──
  const partials = pool.partialAvailable ?? [];
  const partialIds = new Set(partials.map((p) => p.doctor.id));
  const partialClinics: [Period, LoadedDoctor, Period, LoadedDoctor][] = []; // [فترة المستأذِن، هو، فترة الشريك، الشريك]
  for (const { doctor, openPeriod } of partials) {
    const otherPeriod: Period = openPeriod === p1 ? p2 : p1;
    const cands = available.filter((d) => !partialIds.has(d.id));
    if (cands.length === 0) { warnings.push(`لا شريك متاح لاستئذان ${doctor.name}`); continue; }
    // الشريك: الأكثر استحقاقاً للفترة الأخرى (عبر ميزان مقعد العيادة)
    const partnerFirst = otherPeriod === p1;
    const partner = [...cands].sort((a, b) =>
      partnerFirst ? p1mp2(w, a.id) - p1mp2(w, b.id) : p1mp2(w, b.id) - p1mp2(w, a.id),
    )[0]!;
    available = available.filter((d) => d.id !== partner.id);
    if (openPeriod === p1) takeP1(w, doctor.id); else takeP2(w, doctor.id);
    if (otherPeriod === p1) takeP1(w, partner.id); else takeP2(w, partner.id);
    partialClinics.push([openPeriod, doctor, otherPeriod, partner]);
  }
  const M = Math.max(0, clinicNums.length - partialClinics.length);

  // ── القاعدة الرباعية على العاديين + التخفيف ──
  const plan = planDay(available, lds, M, w);

  let ci = 0;
  for (const [docP, doc, partP, partner] of partialClinics) {
    const c = clinicNums[ci++]!;
    addClinic(c, docP, doc); addClinic(c, partP, partner);
  }
  for (const [a, b] of plan.hostPairs) {
    const c = clinicNums[ci++]!;
    addClinic(c, p1, a); addClinic(c, p2, b); // العيادة
    addDel(p2, a); addDel(p1, b); // الدليقيتر (كلٌّ في فترته الأخرى)
  }
  for (const [a, b] of plan.plainPairs) {
    const c = clinicNums[ci++]!;
    addClinic(c, p1, a); addClinic(c, p2, b);
  }
  for (const [ld, partner] of plan.ldClinics) {
    const c = clinicNums[ci++]!;
    addClinic(c, p1, ld); addClinic(c, p2, partner);
  }
  for (const doc of plan.solos) {
    const c = clinicNums[ci++]!;
    addClinic(c, p1, doc); addClinic(c, p2, doc);
  }
  for (const doc of plan.soloDelegators) {
    addDel(p1, doc); addDel(p2, doc);
  }
  for (const doc of plan.ex) addEx(doc);

  if (ci < M) warnings.push(`${M - ci} عيادة فارغة (نقص أطباء)`);

  // ── التريني beginner: ظلّ المدرّب (نسخ كل خاناته) ──
  for (const [supId, beginners] of pool.beginnersByBuddy.entries()) {
    const supSlots = slots.filter((s) => s.doctor.id === supId);
    for (const beg of beginners) {
      for (const ss of supSlots) {
        slots.push({ day, period: ss.period, clinicNumber: ss.clinicNumber, doctor: beg, role: ss.role });
      }
    }
  }
  // ── beginner يتيم (مدرّبه غائب) → احتياط ──
  for (const orphan of pool.beginnersOrphan) addEx(orphan);

  return { shift: pool.shift, slots, warnings };
}
