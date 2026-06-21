// ═══════════════════════════════════════════════════════════════════════════
// مختبر العدل اللحظيّ — ٦ أطبّاء / ٣ عيادات / أسبوعان (وهميّان)
// يستخدم قلب التوزيع الإنتاجيّ نفسه (createWheels + distributeShiftWheel).
// يحفظ الحالة في scripts/.lab-state.json ليُعاد الضبط بين السيناريوهات.
//
// الأوامر:
//   npx tsx scripts/lab.ts build      → يبني الأساس (الأسبوعين) ويحفظه ويعرضه
//   npx tsx scripts/lab.ts show       → يعرض الحالة الحاليّة
//   npx tsx scripts/lab.ts reset      → يعيد الحالة إلى الأساس المحفوظ
// ═══════════════════════════════════════════════════════════════════════════
import * as fs from 'fs';
import * as path from 'path';
import { createWheels, distributeShiftWheel } from '../lib/algorithms/wheel';
import { GROUP_TEMPLATES } from '../lib/algorithms/groupTemplates';
import type { LoadedDoctor, LoadedSlot, ShiftPool, AssignedSlot, WeekDay } from '../lib/algorithms/schedule';

const GA = GROUP_TEMPLATES.find((t) => t.key === 'group_a')!;
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const AR: Record<WeekDay, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };
const WEEKS = ['2026-08-13', '2026-08-20'];
const STATE = path.join(__dirname, '.lab-state.json');

// ٦ أطبّاء بأسماء حقيقيّة (محمد سيكون «المضيف» في سيناريوهاتنا)
const NAMES = ['محمد', 'أحمد', 'خالد', 'سعد', 'فهد', 'علي'];
const docs: LoadedDoctor[] = NAMES.map((name, i) => ({
  id: `d${i + 1}`, name, groupTemplate: GA, groupId: 'g', workStatus: 'active', supervisorDoctorId: null,
}));
const nm = (id: string) => docs.find((d) => d.id === id)?.name || id;

const pool = (av: LoadedDoctor[]): ShiftPool => ({
  shift: 'morning', available: av, lightDuty: [], beginnersByBuddy: new Map(),
  beginnersOrphan: [], absent: [], partialAvailable: [], boardRule: { kind: 'no_board' },
} as ShiftPool);

// ─── العرض: لكلّ عيادة مَن فيها بكلّ فترة، مع وسم المضيف/المنفرد/الدليقيتر ───
type DaySlots = AssignedSlot[];
function render(week: Record<string, DaySlots>, title: string, changed?: Set<string>): string {
  const lines: string[] = [`\n${'═'.repeat(60)}\n${title}\n${'═'.repeat(60)}`];
  for (const day of DAYS) {
    const slots = week[day] || [];
    // عيادة → فترة → اسم
    const clinic = new Map<number, Record<number, string>>();
    const del: Record<number, string> = {};
    const ex: string[] = [];
    for (const s of slots) {
      if (s.role === 'delegator') { del[s.period] = nm(s.doctor.id); continue; }
      if (s.role === 'ex') { ex.push(nm(s.doctor.id)); continue; }
      const c = clinic.get(s.clinicNumber) || {};
      c[s.period] = nm(s.doctor.id);
      clinic.set(s.clinicNumber, c);
    }
    const parts: string[] = [];
    for (const c of [...clinic.keys()].sort((a, b) => a - b)) {
      const p = clinic.get(c)!;
      const occ = [...new Set(Object.values(p))];
      const solo = occ.length === 1;
      const seg = Object.keys(p).sort().map((pr) => `ف${pr}:${p[+pr]}`).join(' ');
      parts.push(`ع${c}{${seg}}${solo ? '★منفرد' : ''}`);
    }
    if (Object.keys(del).length) {
      const seg = Object.keys(del).sort().map((pr) => `ف${pr}:${del[+pr]}`).join(' ');
      parts.push(`دليقيتر{${seg}}`);
    }
    if (ex.length) parts.push(`احتياط[${[...new Set(ex)].join('+')}]`);
    const flag = changed?.has(day) ? ' ⚠️' : '';
    lines.push(`${AR[day].padStart(6)}${flag} │ ${parts.join('   ')}`);
  }
  return lines.join('\n');
}

// عرض يومٍ واحد في سطر
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
    const seg = Object.keys(p).sort().map((pr) => `ف${pr}:${p[+pr]}`).join(' ');
    parts.push(`ع${c}{${seg}}${solo ? '★منفرد' : ''}`);
  }
  if (Object.keys(del).length) parts.push(`دليقيتر{${Object.keys(del).sort().map((pr) => `ف${pr}:${del[+pr]}`).join(' ')}}`);
  else parts.push('دليقيتر{—}');
  if (ex.length) parts.push(`احتياط[${[...new Set(ex)].join('+')}]`);
  return `${label} │ ${parts.join('   ')}`;
}

const toL = (slots: AssignedSlot[], week: string, day: WeekDay): LoadedSlot[] =>
  slots.map((s, i) => ({
    id: `${week}-${day}-${i}`, weekStart: week, dayOfWeek: day,
    period: s.role === 'ex' ? 0 : s.period, clinicNumber: s.clinicNumber,
    doctorId: s.doctor.id, doctorName: s.doctor.name,
    role: (s.role === 'ex' ? 'clinic' : s.role) as LoadedSlot['role'],
    status: (s.role === 'ex' ? 'extra' : 'active') as LoadedSlot['status'],
  }));

// ─── بناء الأساس: عجلةٌ واحدةٌ مستمرّة عبر الأسبوعين (الحداثة تتراكم) ───
function buildBaseline(): Record<string, Record<string, DaySlots>> {
  const wheels = createWheels(docs, []);
  const out: Record<string, Record<string, DaySlots>> = {};
  for (const week of WEEKS) {
    out[week] = {};
    for (const day of DAYS) {
      const r = distributeShiftWheel(day, 3, pool(docs), wheels, true);
      out[week]![day] = r.slots;
    }
  }
  return out;
}

function save(state: any) { fs.writeFileSync(STATE, JSON.stringify(state, null, 2), 'utf8'); }
function load(): any { return JSON.parse(fs.readFileSync(STATE, 'utf8')); }

// ─── ترتيب (أسبوع,يوم) مسطّح عبر الأسبوعين ───
const SEQ: { week: string; day: WeekDay }[] = [];
for (const w of WEEKS) for (const d of DAYS) SEQ.push({ week: w, day: d });
const seqIdx = (week: string, day: WeekDay) => SEQ.findIndex((s) => s.week === week && s.day === day);

// توقيع شفت (لمقارنة التغيّر، نتجاهل الاحتياط)
const sig = (slots: DaySlots): string =>
  slots.filter((s) => s.role !== 'ex').map((s) => `${s.clinicNumber}/${s.period}/${s.role}/${s.doctor.id}`).sort().join(';');
// خريطة طبيب→مقاعده (لمعرفة مَن تحرّك)
const seatMap = (slots: DaySlots): Map<string, string> => {
  const m = new Map<string, string[]>();
  for (const s of slots) { if (s.role === 'ex') continue; (m.get(s.doctor.id) ?? m.set(s.doctor.id, []).get(s.doctor.id)!).push(`${s.role === 'delegator' ? 'دل' : 'ع' + s.clinicNumber}/ف${s.period}`); }
  const out = new Map<string, string>(); for (const [id, arr] of m) out.set(id, arr.sort().join(',')); return out;
};

const cmd = process.argv[2] || 'show';

if (cmd === 'absence') {
  // npx tsx scripts/lab.ts absence <1|2> <day> <docId>   مثال: absence 1 tuesday d5
  const state = load();
  const wIdx = Number(process.argv[3]) - 1;
  const absDay = process.argv[4] as WeekDay;
  const absId = process.argv[5]!;
  const absWeek = WEEKS[wIdx]!;
  const cur: Record<string, Record<string, DaySlots>> = JSON.parse(JSON.stringify(state.current));
  const before: Record<string, Record<string, DaySlots>> = JSON.parse(JSON.stringify(state.current));

  const docObj = (id: string) => ({ id, name: nm(id) });
  const M = 3;
  const presentCount = docs.length - 1; // غيابٌ ليومٍ واحد
  const start = seqIdx(absWeek, absDay);

  // عدّاد الدليقيتر لحالةٍ ما
  const delOf = (st: Record<string, Record<string, DaySlots>>): Map<string, number> => {
    const m = new Map<string, number>(); for (const d of docs) m.set(d.id, 0);
    for (const { week, day } of SEQ) for (const s of st[week]![day]!) if (s.role === 'delegator') m.set(s.doctor.id, (m.get(s.doctor.id) || 0) + 1);
    return m;
  };
  const baseDel = delOf(before); // الأساس = الهدف

  // ═══ (١) يوم الغياب ═══
  const dslots: DaySlots = cur[absWeek]![absDay]!;
  const aSlots = dslots.filter((s) => s.doctor.id === absId && s.role !== 'ex');
  const aClinic = aSlots.find((s) => s.role === 'clinic')?.clinicNumber ?? null;
  const aWasHost = aSlots.some((s) => s.role === 'delegator');
  const aClinicSeats = aSlots.filter((s) => s.role === 'clinic').map((s) => ({ c: s.clinicNumber, p: s.period }));
  const coverer = aClinic != null
    ? dslots.find((s) => s.role === 'clinic' && s.clinicNumber === aClinic && s.doctor.id !== absId)?.doctor.id ?? null
    : null;

  let next = dslots.filter((s) => s.doctor.id !== absId); // أزِل الغائب
  if (aWasHost && presentCount > M && coverer) {
    // الحالة ٢: العدد كافٍ → أبقِ الدليقيتر. اسحب الأكثر استحقاقًا شريكًا مضيفًا، وشريكُه ينفرد
    const vacClinicP = aSlots.find((s) => s.role === 'clinic')!.period;
    const vacDelP = aSlots.find((s) => s.role === 'delegator')!.period;
    const plain = [...new Set(next.filter((s) => s.role === 'clinic' && s.clinicNumber !== aClinic).map((s) => s.doctor.id))];
    const puller = plain.sort((a, b) => (baseDel.get(a)! - baseDel.get(b)!) || a.localeCompare(b))[0]!;
    const pSlot = next.find((s) => s.role === 'clinic' && s.doctor.id === puller)!;
    const pClinic = pSlot.clinicNumber, pPeriod = pSlot.period;
    const q = next.find((s) => s.role === 'clinic' && s.clinicNumber === pClinic && s.doctor.id !== puller)?.doctor.id;
    pSlot.clinicNumber = aClinic!; pSlot.period = vacClinicP; // الساحب → العيادة المضيفة
    next.push({ role: 'delegator', period: vacDelP, clinicNumber: aClinic!, doctor: docObj(puller) } as AssignedSlot);
    if (q) next.push({ role: 'clinic', period: pPeriod, clinicNumber: pClinic, doctor: docObj(q) } as AssignedSlot); // الشريك ينفرد
  } else {
    // الحالة ٣ (العدد غير كافٍ) أو غير مضيف: المُغطّي يبتلع، ويذوب الدليقيتر إن كان مضيفًا
    next = next.filter((s) => !(aWasHost && s.role === 'delegator'));
    for (const { c, p } of aClinicSeats) if (coverer) next.push({ role: 'clinic', period: p, clinicNumber: c, doctor: docObj(coverer) } as AssignedSlot);
  }
  cur[absWeek]![absDay] = next;

  // ═══ (٢) موازنة العدل: أعِد عدّاد الدليقيتر إلى الأساس بأقلّ تبديلات ═══
  // اتّجاه السداد: (أ) قَبْليّ/امتصاص أوّلًا — أيّامٌ قبل الغياب داخل أسبوعه، الأقرب-للغياب أوّلًا،
  //               فيبقى ما بعد الطبيّة مستقرًّا ولا نُعدّل يومًا مضى (نبقى داخل أسبوع الغياب).
  //               (ب) أمامي احتياطًا — إن لم يوجد سدادٌ قَبْليّ صالح.
  const weekStartIdx = SEQ.findIndex((s) => s.week === absWeek); // أوّل يوم في أسبوع الغياب
  const searchOrder: number[] = [];
  for (let i = start - 1; i >= weekStartIdx; i--) searchOrder.push(i); // قَبْليّ: الأقرب-للغياب ← بداية الأسبوع
  for (let i = start + 1; i < SEQ.length; i++) searchOrder.push(i);    // أمامي: احتياط
  const swaps: string[] = [];
  for (let iter = 0; iter < 8; iter++) {
    const dc = delOf(cur);
    const deficit = docs.map((d) => d.id).filter((id) => dc.get(id)! < baseDel.get(id)!);
    const surplus = docs.map((d) => d.id).filter((id) => dc.get(id)! > baseDel.get(id)!);
    if (!deficit.length || !surplus.length) break;
    let done = false;
    for (const i of searchOrder) {
      if (done) break;
      const { week, day } = SEQ[i]!; const slots = cur[week]![day]!;
      const hosts = slots.filter((s) => s.role === 'delegator').map((s) => s.doctor.id);
      const S = surplus.find((id) => hosts.includes(id));
      const Dd = deficit.find((id) => slots.some((s) => s.role === 'clinic' && s.doctor.id === id) && !hosts.includes(id));
      if (!S || !Dd) continue;
      const sClin = slots.find((s) => s.role === 'clinic' && s.doctor.id === S)!;
      const sDel = slots.find((s) => s.role === 'delegator' && s.doctor.id === S)!;
      const dClin = slots.find((s) => s.role === 'clinic' && s.doctor.id === Dd)!;
      sClin.doctor = docObj(Dd); sDel.doctor = docObj(Dd); dClin.doctor = docObj(S);
      const dir = i < start ? 'قَبْليّ' : 'أمامي';
      swaps.push(`${AR[day]} ${week} [${dir}]: ${nm(Dd)} ↔ ${nm(S)}`);
      done = true;
    }
    if (!done) break;
  }

  state.current = cur;
  (state as any).lastSwaps = swaps;
  state.scenarios.push({ kind: 'absence', week: absWeek, day: absDay, doc: absId });
  save(state);

  // ─── تقرير الفرق ───
  console.log(`\n🩺 السيناريو: ${nm(absId)} طبيّة يوم ${AR[absDay]} (${absWeek})`);
  const allMovers = new Set<string>();
  for (const { week, day } of SEQ) {
    const b = before[week]![day]!, a = cur[week]![day]!;
    if (sig(b) === sig(a)) continue;
    const bm = seatMap(b), am = seatMap(a);
    const ids = new Set([...bm.keys(), ...am.keys()]);
    const moved = [...ids].filter((id) => bm.get(id) !== am.get(id));
    const realMovers = moved.filter((id) => !(week === absWeek && day === absDay && id === absId));
    realMovers.forEach((id) => allMovers.add(id));
    console.log(`\n── ${AR[day]} ${week} ⚠️ تغيّر ──`);
    console.log(renderDay(b, 'قبل'));
    console.log(renderDay(a, 'بعد'));
    console.log(`   تحرّك: ${realMovers.map(nm).join('، ') || '—'}${(week === absWeek && day === absDay) ? `  (غائب: ${nm(absId)})` : ''}`);
  }
  console.log(`\n📊 أيّامٌ تغيّرت: ${SEQ.filter(({ week, day }) => sig(before[week]![day]!) !== sig(cur[week]![day]!)).length}`);
  console.log(`👥 أطبّاء تحرّكوا (عدا الغائب): ${allMovers.size} → ${[...allMovers].map(nm).join('، ') || '—'}`);
  // عدّاد الدليقيتر: قبل/بعد
  const db = delOf(before), da = delOf(cur);
  console.log(`\n📈 عدّاد الدليقيتر (قبل → بعد) عبر الأسبوعين:`);
  console.log('   ' + docs.map((d) => `${d.name}:${db.get(d.id)}→${da.get(d.id)}`).join('  '));
  const sw = (state as any).lastSwaps as string[];
  console.log(`\n🔧 تبديلات سداد العدل: ${sw.length ? sw.join(' | ') : 'لا شيء'}`);
} else if (cmd === 'permission') {
  // npx tsx scripts/lab.ts permission <1|2> <day> <docId> <فترة محجوبة 1|2>
  // الاستئذان = فترةٌ واحدةٌ محجوبة (ف١=بداية الدوام، ف٢=نهايته). الطبيب يبقى يعمل الفترة الأخرى.
  const state = load();
  const wIdx = Number(process.argv[3]) - 1;
  const pDay = process.argv[4] as WeekDay;
  const pId = process.argv[5]!;
  const pBlk = Number(process.argv[6]) || 1;
  const pWeek = WEEKS[wIdx]!;
  const before: Record<string, Record<string, DaySlots>> = JSON.parse(JSON.stringify(state.current));
  const cur: Record<string, Record<string, DaySlots>> = JSON.parse(JSON.stringify(state.current));
  const slots: DaySlots = cur[pWeek]![pDay]!;

  const mine = slots.filter((s) => s.doctor.id === pId && s.role !== 'ex');
  const myClinic = mine.filter((s) => s.role === 'clinic');
  const isHost = mine.some((s) => s.role === 'delegator');
  const isSolo = myClinic.length >= 2 && new Set(myClinic.map((s) => s.clinicNumber)).size === 1;
  const caseName = isHost ? '٢ (مضيف)' : isSolo ? '٣ (منفرد)' : '١ (فترة واحدة)';

  console.log(`\n🚪 السيناريو: ${nm(pId)} استئذان ف${pBlk} يوم ${AR[pDay]} (${pWeek})`);
  console.log(`   الحالة المكتشفة: ${caseName}`);

  // أدوات السداد (تُعاد كحالة الغياب)
  const docObj = (id: string) => ({ id, name: nm(id) });
  const start = seqIdx(pWeek, pDay);
  const weekStartIdx = SEQ.findIndex((s) => s.week === pWeek);
  const searchOrder: number[] = [];
  for (let i = start - 1; i >= weekStartIdx; i--) searchOrder.push(i); // قَبْليّ أوّلًا
  for (let i = start + 1; i < SEQ.length; i++) searchOrder.push(i);    // أمامي احتياطًا
  const delOf = (st: Record<string, Record<string, DaySlots>>): Map<string, number> => {
    const m = new Map<string, number>(); for (const d of docs) m.set(d.id, 0);
    for (const { week, day } of SEQ) for (const s of st[week]![day]!) if (s.role === 'delegator') m.set(s.doctor.id, (m.get(s.doctor.id) || 0) + 1);
    return m;
  };
  const baseDel = delOf(before);
  const isHostNow = (id: string) => slots.some((s) => s.role === 'delegator' && s.doctor.id === id);
  // عدّاد الانفراد: لكلّ يومٍ، أيّ عيادةٍ يشغلها طبيبٌ واحدٌ (الفترتان له) = انفرادٌ +١ له
  const soloOf = (st: Record<string, Record<string, DaySlots>>): Map<string, number> => {
    const m = new Map<string, number>(); for (const d of docs) m.set(d.id, 0);
    for (const { week, day } of SEQ) {
      const byClinic = new Map<number, Set<string>>();
      for (const s of st[week]![day]!) if (s.role === 'clinic') (byClinic.get(s.clinicNumber) ?? byClinic.set(s.clinicNumber, new Set()).get(s.clinicNumber)!).add(s.doctor.id);
      for (const ids of byClinic.values()) if (ids.size === 1) { const only = [...ids][0]!; m.set(only, m.get(only)! + 1); }
    }
    return m;
  };

  if (isHost) {
    const myClinicSeat = myClinic[0]!;
    const myDelSlot = mine.find((s) => s.role === 'delegator')!;
    const clinicBlocked = myClinicSeat.period === pBlk;
    // أقرب يوم سدادٍ (فائضٌ يستضيف + ناقصٌ عاديّ) في ترتيب البحث (قَبْليّ أوّلًا)
    const repayPos = (surplus: string[], deficit: string[]): number => {
      for (let pos = 0; pos < searchOrder.length; pos++) {
        const { week, day } = SEQ[searchOrder[pos]!]!; const sl = cur[week]![day]!;
        const hosts = new Set(sl.filter((s) => s.role === 'delegator').map((s) => s.doctor.id));
        const hasS = surplus.some((id) => hosts.has(id));
        const hasD = deficit.some((id) => sl.some((s) => s.role === 'clinic' && s.doctor.id === id) && !hosts.has(id));
        if (hasS && hasD) return pos;
      }
      return Infinity;
    };
    if (!clinicBlocked) {
      // ═══ الحالة المرآة: حُجبت فترة الاستضافة، العيادة سليمة → ننقل الاستضافة فقط ═══
      const clinicP = myClinicSeat.period; // فترة عيادة المضيف؛ مَن يعمل فيها متفرّغٌ ليستضيف ف${pBlk}
      const best = [...new Set(slots.filter((s) => s.role === 'clinic' && s.period === clinicP
          && s.doctor.id !== pId && !isHostNow(s.doctor.id)).map((s) => s.doctor.id))]
        .map((rid) => ({ rid, pos: repayPos([rid], [pId]) }))
        .sort((a, b) => a.pos - b.pos)[0];
      if (best) {
        myDelSlot.doctor = docObj(best.rid); // البديل يستلم الاستضافة، والعيادة لا تُمَسّ
        console.log(`   ✅ الحالة المرآة: ${nm(best.rid)} يستلم الاستضافة ف${pBlk} مكان ${nm(pId)} (العيادة سليمة، لا تُمَسّ)`);
      } else {
        console.log('   ⚠️ لا بديل للاستضافة → تسقط (قاعدة نقص العدد لاحقًا).');
      }
      cur[pWeek]![pDay] = slots;
    } else {
      // ═══ المضيف حُجبت فترة عيادته → حلّ أ أو ب، نختار الأنسب للعدل (الأقرب قَبْليًّا ثمّ الأقلّ تحريكًا) ═══
      const c = myClinicSeat.clinicNumber;
      const openP = pBlk === 1 ? 2 : 1;
      const partnerSeat = slots.find((s) => s.role === 'clinic' && s.clinicNumber === c && s.period === openP && s.doctor.id !== pId)!;
      const partnerId = partnerSeat.doctor.id;
      const partnerDel = slots.find((s) => s.role === 'delegator' && s.doctor.id === partnerId);
      // ── حلّ ب: بديلٌ عاديٌّ يعمل فترة المضيف المتاحة (openP) يُرقّى مضيفًا، والمضيف يأخذ مقعده ──
      const bBest = [...new Set(slots.filter((s) => s.role === 'clinic' && s.period === openP
          && s.doctor.id !== pId && s.doctor.id !== partnerId && !isHostNow(s.doctor.id)).map((s) => s.doctor.id))]
        .map((rid) => ({ rid, pos: repayPos([rid], [pId]) }))
        .sort((a, b) => a.pos - b.pos)[0];
      // ── حلّ أ: زوج المضيف ينزل، الاستضافة تنتقل لزوجٍ عاديّ سليم ──
      const aBest = [...new Set(slots.filter((s) => s.role === 'clinic' && s.clinicNumber !== c).map((s) => s.clinicNumber))]
        .map((cn) => ({ clinic: cn, ids: [...new Set(slots.filter((s) => s.role === 'clinic' && s.clinicNumber === cn).map((s) => s.doctor.id))] }))
        .filter((p) => p.ids.length === 2)
        .map((p) => ({ ...p, pos: repayPos(p.ids, [pId, partnerId]) }))
        .sort((a, b) => a.pos - b.pos)[0];
      // ── الاختيار: الأقرب قَبْليًّا أوّلًا، ثمّ الأقلّ تحريكًا (ب=٢ أطبّاء، أ=٤) ──
      const opts: { form: 'ب' | 'أ'; pos: number; movers: number }[] = [];
      if (bBest && bBest.pos < Infinity) opts.push({ form: 'ب', pos: bBest.pos, movers: 2 });
      if (aBest && aBest.pos < Infinity) opts.push({ form: 'أ', pos: aBest.pos, movers: 4 });
      opts.sort((a, b) => a.pos - b.pos || a.movers - b.movers);
      const pick = opts[0]?.form ?? (aBest ? 'أ' : bBest ? 'ب' : null);

      if (pick === 'ب' && bBest) {
        const R = bBest.rid;
        const rSeat = slots.find((s) => s.role === 'clinic' && s.period === openP && s.doctor.id === R)!;
        rSeat.doctor = docObj(pId);       // المضيف ← مقعد البديل (فترته المتاحة)
        myClinicSeat.doctor = docObj(R);  // البديل ← المقعد المحجوب
        myDelSlot.doctor = docObj(R);     // البديل ← الاستضافة
        cur[pWeek]![pDay] = slots;
        console.log(`   ✅ حلّ ب (أقلّ تحريكًا): ${nm(R)} يحلّ مكان ${nm(pId)} (العيادة+الاستضافة)، و${nm(pId)}←مقعد ${nm(R)}`);
      } else if (pick === 'أ' && aBest) {
        const x1 = slots.find((s) => s.role === 'clinic' && s.clinicNumber === aBest.clinic && s.period === 1)!.doctor.id;
        const x2 = slots.find((s) => s.role === 'clinic' && s.clinicNumber === aBest.clinic && s.period === 2)!.doctor.id;
        myClinicSeat.period = openP; partnerSeat.period = pBlk;
        const work = slots.filter((s) => s !== myDelSlot && s !== partnerDel);
        work.push({ role: 'delegator', period: 2, clinicNumber: aBest.clinic, doctor: docObj(x1) } as AssignedSlot);
        work.push({ role: 'delegator', period: 1, clinicNumber: aBest.clinic, doctor: docObj(x2) } as AssignedSlot);
        cur[pWeek]![pDay] = work;
        console.log(`   ✅ حلّ أ: ${nm(pId)}←ف${openP}، ${nm(partnerId)}←ف${pBlk} (ع${c} مكتملة)؛ الاستضافة → ع${aBest.clinic} (${nm(x1)}،${nm(x2)})`);
      } else {
        console.log('   ⚠️ لا حلّ متاح — قاعدة نقص العدد لاحقًا.');
        cur[pWeek]![pDay] = slots;
      }
    }
  } else if (isSolo) {
    // ═══ الحالة ٣: منفردٌ يستأذن → ننقل الانفراد لطبيبٍ آخر (الأقلّ انفرادًا = الأحقّ) ═══
    const soloC = myClinic[0]!.clinicNumber; // عيادة الانفراد
    const openP = pBlk === 1 ? 2 : 1;        // فترة المستأذِن المتاحة
    const baseSolo = soloOf(before);
    // جسرٌ Y: يعمل openP في عيادةٍ أخرى (متفرّغٌ في pBlk)، ليس مضيفًا ولا منفردًا؛
    // شريكُه في تلك العيادة (يعمل pBlk) يصير المنفرد الجديد. نختار الجسر الذي شريكُه الأقلّ انفرادًا.
    const yCands = [...new Set(slots.filter((s) => s.role === 'clinic' && s.period === openP && s.clinicNumber !== soloC
        && s.doctor.id !== pId && !isHostNow(s.doctor.id)
        && !slots.some((o) => o.role === 'clinic' && o.clinicNumber === s.clinicNumber && o.period === pBlk && o.doctor.id === s.doctor.id)
      ).map((s) => s.doctor.id))]
      .map((yid) => {
        const yClinic = slots.find((s) => s.role === 'clinic' && s.doctor.id === yid && s.period === openP)!.clinicNumber;
        const partner = slots.find((s) => s.role === 'clinic' && s.clinicNumber === yClinic && s.period === pBlk && s.doctor.id !== yid)?.doctor.id;
        return { yid, yClinic, partner };
      })
      .filter((y) => y.partner)
      .sort((a, b) => (baseSolo.get(a.partner!)! - baseSolo.get(b.partner!)!) || a.partner!.localeCompare(b.partner!));
    const Y = yCands[0];
    if (Y) {
      const { yid, yClinic, partner: newSolo } = Y as { yid: string; yClinic: number; partner: string };
      // أزِل مقعد المستأذِن في الفترة المحجوبة (يبقى يعمل openP فقط)
      const work = slots.filter((s) => !(s.role === 'clinic' && s.doctor.id === pId && s.clinicNumber === soloC && s.period === pBlk));
      // Y ينتقل لتغطية الفترة المحجوبة في عيادة الانفراد (فيصير مع المستأذِن زوجًا)
      const ySeat = work.find((s) => s.role === 'clinic' && s.doctor.id === yid && s.period === openP && s.clinicNumber === yClinic)!;
      ySeat.clinicNumber = soloC; ySeat.period = pBlk;
      // شريك Y يصير منفردًا في عيادته (يغطّي openP التي تركها Y)
      work.push({ role: 'clinic', period: openP, clinicNumber: yClinic, doctor: docObj(newSolo) } as AssignedSlot);
      cur[pWeek]![pDay] = work;
      console.log(`   ✅ الحالة ٣: ${nm(yid)}←ع${soloC}/ف${pBlk} (يصير زوجًا مع ${nm(pId)})؛ الانفراد ينتقل → ${nm(newSolo)} (ع${yClinic})`);
    } else {
      console.log('   ⚠️ لا جسرَ متاح لنقل الانفراد (قاعدة نقص العدد لاحقًا).');
      cur[pWeek]![pDay] = slots;
    }
  } else {
    // ── الحالة ١: تبديل الفترة مع زميل العيادة (نظيف، بلا دَيْن عدل) ──
    const blockedSeat = myClinic.find((s) => s.period === pBlk);
    if (!blockedSeat) {
      console.log(`   ⚠️ ${nm(pId)} لا يعمل ف${pBlk} أصلًا — لا تعارض.`);
    } else {
      const partner = slots.find((s) => s.role === 'clinic' && s.clinicNumber === blockedSeat.clinicNumber && s.period !== pBlk && s.doctor.id !== pId);
      if (partner) {
        const otherP = partner.period;
        blockedSeat.period = otherP; partner.period = pBlk;
        console.log(`   ✅ تبديلٌ نظيفٌ مع زميل العيادة: ${nm(pId)}←ف${otherP}، ${nm(partner.doctor.id)}←ف${pBlk} (لا مساس بالعدل)`);
      } else {
        console.log('   ⚠️ لا زميل في العيادة → تبديلٌ بين العيادات (لاحقًا).');
      }
    }
    cur[pWeek]![pDay] = slots;
  }

  // ── سداد العدل (قَبْليّ أوّلًا) — يُعاد استعماله؛ بلا أثرٍ إن كان العدّاد متوازنًا (الحالة ١) ──
  const swaps: string[] = [];
  for (let iter = 0; iter < 8; iter++) {
    const dc = delOf(cur);
    const deficit = docs.map((d) => d.id).filter((id) => dc.get(id)! < baseDel.get(id)!);
    const surplus = docs.map((d) => d.id).filter((id) => dc.get(id)! > baseDel.get(id)!);
    if (!deficit.length || !surplus.length) break;
    let done = false;
    for (const i of searchOrder) {
      if (done) break;
      const { week, day } = SEQ[i]!; const sl = cur[week]![day]!;
      const hosts = sl.filter((s) => s.role === 'delegator').map((s) => s.doctor.id);
      const S = surplus.find((id) => hosts.includes(id));
      const Dd = deficit.find((id) => sl.some((s) => s.role === 'clinic' && s.doctor.id === id) && !hosts.includes(id));
      if (!S || !Dd) continue;
      const sClin = sl.find((s) => s.role === 'clinic' && s.doctor.id === S)!;
      const sDel = sl.find((s) => s.role === 'delegator' && s.doctor.id === S)!;
      const dClin = sl.find((s) => s.role === 'clinic' && s.doctor.id === Dd)!;
      sClin.doctor = docObj(Dd); sDel.doctor = docObj(Dd); dClin.doctor = docObj(S);
      swaps.push(`${AR[day]} ${week} [${i < start ? 'قَبْليّ' : 'أمامي'}]: ${nm(Dd)} ↔ ${nm(S)}`);
      done = true;
    }
    if (!done) break;
  }

  state.current = cur;
  state.scenarios.push({ kind: 'permission', week: pWeek, day: pDay, doc: pId, blocked: pBlk });
  save(state);

  // ── تقرير الفرق ──
  for (const { week, day } of SEQ) {
    const b = before[week]![day]!, a = cur[week]![day]!;
    if (sig(b) === sig(a)) continue;
    console.log(`\n── ${AR[day]} ${week} ⚠️ تغيّر ──`);
    console.log(renderDay(b, 'قبل'));
    console.log(renderDay(a, 'بعد'));
  }
  console.log(`\n📊 أيّامٌ تغيّرت: ${SEQ.filter(({ week, day }) => sig(before[week]![day]!) !== sig(cur[week]![day]!)).length}`);
  if (isHost || isSolo) {
    const db = delOf(before), da = delOf(cur);
    console.log(`📈 عدّاد الدليقيتر (قبل → بعد): ${docs.map((d) => `${d.name}:${db.get(d.id)}→${da.get(d.id)}`).join('  ')}`);
    if (isSolo) {
      const sb = soloOf(before), sa = soloOf(cur);
      console.log(`📈 عدّاد الانفراد (قبل → بعد): ${docs.map((d) => `${d.name}:${sb.get(d.id)}→${sa.get(d.id)}`).join('  ')}`);
    }
    console.log(`🔧 تبديلات سداد العدل: ${swaps.length ? swaps.join(' | ') : 'لا شيء'}`);
  }
} else if (cmd === 'thin') {
  // npx tsx scripts/lab.ts thin <عدد العيادات N> [light]
  // قاعدة نقص العدد: N عيادة + (N+1) طبيب → مضيفٌ كامل (الفترتين) + N منفردين (كلٌّ عيادة).
  // مع light: طبيب تخفيفٍ ضمنهم يعمل الفترتين استثناءً (هنا = الدليقيتر الكامل).
  const N = Math.max(2, Number(process.argv[3]) || 3);
  const hasLight = process.argv[4] === 'light';
  const team = docs.slice(0, N + 1);
  const host = hasLight ? team[N]! : team[0]!; // التخفيف (إن وُجد) = الدليقيتر الكامل
  const soloDocs = team.filter((d) => d.id !== host.id);
  const thinDay: DaySlots = [];
  soloDocs.forEach((d, i) => {
    thinDay.push({ role: 'clinic', period: 1, clinicNumber: i + 1, doctor: { id: d.id, name: d.name } } as AssignedSlot);
    thinDay.push({ role: 'clinic', period: 2, clinicNumber: i + 1, doctor: { id: d.id, name: d.name } } as AssignedSlot);
  });
  thinDay.push({ role: 'delegator', period: 1, clinicNumber: 0, doctor: { id: host.id, name: host.name } } as AssignedSlot);
  thinDay.push({ role: 'delegator', period: 2, clinicNumber: 0, doctor: { id: host.id, name: host.name } } as AssignedSlot);
  console.log(`\n🩹 قاعدة نقص العدد: ${N} عيادة + ${N + 1} طبيب${hasLight ? ` (${host.name} تخفيفٌ يعمل الفترتين استثناءً)` : ''}`);
  console.log(renderDay(thinDay, 'التغطية'));
  console.log(`   = مضيفٌ واحدٌ كامل (${host.name}) + ${N} منفردين (${soloDocs.map((d) => d.name).join('، ')}) — الاستضافة لا تسقط.`);
} else if (cmd === 'build') {
  const baseline = buildBaseline();
  const state = { docs: docs.map((d) => ({ id: d.id, name: d.name })), weeks: WEEKS, baseline, current: baseline, scenarios: [] };
  save(state);
  console.log('✅ بُني الأساس وحُفظ في .lab-state.json\n');
  for (const w of WEEKS) console.log(render(baseline[w]!, `الأسبوع ${w} — الأساس`));
} else if (cmd === 'reset') {
  const state = load();
  state.current = JSON.parse(JSON.stringify(state.baseline));
  state.scenarios = [];
  save(state);
  console.log('↩️ أُعيدت الحالة إلى الأساس.\n');
  for (const w of WEEKS) console.log(render(state.current[w], `الأسبوع ${w} — بعد إعادة الضبط`));
} else if (cmd === 'compare') {
  // npx tsx scripts/lab.ts compare [1|2]   قبل/بعد للأسبوع كاملًا، مع ⚠️ على الأيّام المتغيّرة
  const state = load();
  const pick = process.argv[3];
  const weeks = pick === '1' ? [WEEKS[0]!] : pick === '2' ? [WEEKS[1]!] : WEEKS;
  for (const w of weeks) {
    const changed = new Set<string>();
    for (const day of DAYS) if (sig(state.baseline[w][day] || []) !== sig(state.current[w][day] || [])) changed.add(day);
    console.log(render(state.baseline[w], `الأسبوع ${w} — قبل (الأساس)`));
    console.log(render(state.current[w], `الأسبوع ${w} — بعد (الحاليّ)`, changed));
    console.log(changed.size ? `\n⚠️ أيّام متغيّرة: ${[...changed].map((d) => AR[d as WeekDay]).join('، ')}` : '\n✓ لا تغيير في هذا الأسبوع');
  }
} else {
  const state = load();
  for (const w of WEEKS) console.log(render(state.current[w], `الأسبوع ${w} — الحالة الحاليّة`));
}
