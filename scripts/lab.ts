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
function render(week: Record<string, DaySlots>, title: string): string {
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
    lines.push(`${AR[day].padStart(6)} │ ${parts.join('   ')}`);
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

  // ═══ (٢) موازنةٌ أماميّة عامّة: أعِد عدّاد الدليقيتر إلى الأساس بأقلّ تبديلات ═══
  const swaps: string[] = [];
  for (let iter = 0; iter < 8; iter++) {
    const dc = delOf(cur);
    const deficit = docs.map((d) => d.id).filter((id) => dc.get(id)! < baseDel.get(id)!);
    const surplus = docs.map((d) => d.id).filter((id) => dc.get(id)! > baseDel.get(id)!);
    if (!deficit.length || !surplus.length) break;
    let done = false;
    for (let i = start + 1; i < SEQ.length && !done; i++) {
      const { week, day } = SEQ[i]!; const slots = cur[week]![day]!;
      const hosts = slots.filter((s) => s.role === 'delegator').map((s) => s.doctor.id);
      const S = surplus.find((id) => hosts.includes(id));
      const Dd = deficit.find((id) => slots.some((s) => s.role === 'clinic' && s.doctor.id === id) && !hosts.includes(id));
      if (!S || !Dd) continue;
      const sClin = slots.find((s) => s.role === 'clinic' && s.doctor.id === S)!;
      const sDel = slots.find((s) => s.role === 'delegator' && s.doctor.id === S)!;
      const dClin = slots.find((s) => s.role === 'clinic' && s.doctor.id === Dd)!;
      sClin.doctor = docObj(Dd); sDel.doctor = docObj(Dd); dClin.doctor = docObj(S);
      swaps.push(`${AR[day]} ${week}: ${nm(Dd)} ↔ ${nm(S)}`);
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
  console.log(`\n🔧 تبديلات جراحيّة أماميّة: ${sw.length ? sw.join(' | ') : 'لا شيء'}`);
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
} else {
  const state = load();
  for (const w of WEEKS) console.log(render(state.current[w], `الأسبوع ${w} — الحالة الحاليّة`));
}
