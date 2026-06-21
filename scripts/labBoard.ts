// ═══════════════════════════════════════════════════════════════════════════
// مختبر البورد — يتحقّق أنّ القلب الحقيقيّ يُطبّق استثناءات البورد كما حدّدها المستخدم:
//   • البورد مستثنون من الدليقيتر (لا يستضيفون أبدًا) → عدّاد دل = ٠ لهم.
//   • ٢ بورد → يتقاسمان عيادةً واحدة (الفترتان)، وبقيّة الفريق تدور حولهم.
//   • ٣+ بورد → اثنان بالعيادة، والباقي احتياطيّ بورد يتناوب يوميًّا.
//   • ١ بورد → داخل المجموعة كطبيبٍ عاديّ (in_pool) — أيّ طبيبٍ يزامله.
//   • ٤ أطبّاء/٣ عيادات (٢ بورد + ٢ عاديّ) → البورد منفردٌ بعيادة، لا يستضيف.
//   تشغيل:  npx tsx scripts/labBoard.ts
// ═══════════════════════════════════════════════════════════════════════════
import { createWheels, distributeShiftWheel } from '../lib/algorithms/wheel';
import { GROUP_TEMPLATES } from '../lib/algorithms/groupTemplates';
import type { LoadedDoctor, ShiftPool, WeekDay, AssignedSlot, BoardRuleResolved } from '../lib/algorithms/schedule';

const GA = GROUP_TEMPLATES.find((t) => t.key === 'group_a')!;
const GB = GROUP_TEMPLATES.find((t) => t.key === 'board')!;
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const AR: Record<WeekDay, string> = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس' };
const POOL_NAMES = ['محمد', 'أحمد', 'خالد', 'سعد', 'فهد', 'علي', 'عمر', 'زيد'];

function mkDocs(specs: { name: string; board?: boolean; light?: boolean }[]): LoadedDoctor[] {
  return specs.map((s, i) => ({
    id: `d${i + 1}`, name: s.name, groupTemplate: s.board ? GB : GA, groupId: 'g',
    workStatus: s.light ? 'light_duty' : 'active', supervisorDoctorId: null,
    isBoard: !!s.board,
  } as LoadedDoctor & { isBoard: boolean }));
}

function renderDay(slots: AssignedSlot[], label: string, nm: (id: string) => string, board: Set<string>): string {
  const clinic = new Map<number, Record<number, string>>(); const del: Record<number, string> = {}; const ex: string[] = [];
  const tag = (id: string) => `${nm(id)}${board.has(id) ? '🅑' : ''}`;
  for (const s of slots) {
    if (s.role === 'delegator') { del[s.period] = tag(s.doctor.id); continue; }
    if (s.role === 'ex') { ex.push(tag(s.doctor.id)); continue; }
    const c = clinic.get(s.clinicNumber) || {}; c[s.period] = tag(s.doctor.id); clinic.set(s.clinicNumber, c);
  }
  const parts: string[] = [];
  for (const c of [...clinic.keys()].sort((a, b) => a - b)) {
    const p = clinic.get(c)!; const occ = [...new Set(Object.values(p))]; const solo = occ.length === 1;
    parts.push(`ع${c}{${Object.keys(p).sort().map((pr) => `ف${pr}:${p[+pr]}`).join(' ')}}${solo ? '★' : ''}`);
  }
  if (Object.keys(del).length) parts.push(`دل{${Object.keys(del).sort().map((pr) => `ف${pr}:${del[+pr]}`).join(' ')}}`);
  if (ex.length) parts.push(`احتياط[${[...new Set(ex)].join('+')}]`);
  return `${label.padStart(8)} │ ${parts.join('   ')}`;
}

function scenario(title: string, docs: LoadedDoctor[], nClinics: number, boardRule: BoardRuleResolved) {
  const nm = (id: string) => docs.find((d) => d.id === id)?.name || id;
  const boardSet = new Set(docs.filter((d) => (d as any).isBoard).map((d) => d.id));
  const active = docs.filter((d) => d.workStatus !== 'light_duty' && !(d as any).isBoard);
  const lightDuty = docs.filter((d) => d.workStatus === 'light_duty' && !(d as any).isBoard);
  // عند in_pool (بوردٌ واحد) يدخل البورد المجموعة كطبيبٍ عاديّ
  const inPool = boardRule.kind === 'in_pool';
  const avail = inPool ? docs.filter((d) => d.workStatus !== 'light_duty') : active;
  const pool = (): ShiftPool => ({
    shift: 'morning', available: avail, lightDuty, beginnersByBuddy: new Map(),
    beginnersOrphan: [], absent: [], partialAvailable: [], boardRule,
  } as ShiftPool);
  const wheels = createWheels(docs, []);
  console.log(`\n${'═'.repeat(72)}\n${title}\n${'═'.repeat(72)}`);
  const delCount = new Map<string, number>(); docs.forEach((d) => delCount.set(d.id, 0));
  for (const day of DAYS) {
    const r = distributeShiftWheel(day, nClinics, pool(), wheels, true);
    console.log(renderDay(r.slots, AR[day], nm, boardSet));
    for (const s of r.slots) if (s.role === 'delegator') delCount.set(s.doctor.id, (delCount.get(s.doctor.id) || 0) + 1);
    for (const w of r.warnings) console.log(`        ⚠️ ${w}`);
  }
  const boardDel = [...boardSet].map((id) => `${nm(id)}:${delCount.get(id)}`).join(' ');
  console.log(`   📊 عدّاد الدليقيتر للبورد (يجب أن يكون ٠): ${boardDel || '— لا بورد'}`);
}

// ① ٢ بورد + ٦ عاديّ (زيد تخفيف) على ٣ عيادات
{
  const docs = mkDocs([
    { name: 'محمد', board: true }, { name: 'أحمد', board: true },
    { name: 'خالد' }, { name: 'سعد' }, { name: 'فهد' }, { name: 'علي' }, { name: 'عمر' }, { name: 'زيد', light: true },
  ]);
  const board = docs.filter((d) => (d as any).isBoard);
  scenario('① ٢ بورد (محمد، أحمد) + ٦ عاديّ/١ تخفيف — ٣ عيادات: بورد بعيادةٍ، والباقي يدور', docs, 3, { kind: 'shared_clinic', doctors: board });
}

// ② ١ بورد (in_pool) — يُعامل كعاديّ
{
  const docs = mkDocs([
    { name: 'محمد', board: true },
    { name: 'أحمد' }, { name: 'خالد' }, { name: 'سعد' }, { name: 'فهد' }, { name: 'علي' }, { name: 'عمر' },
  ]);
  scenario('② ١ بورد (محمد) — in_pool: يدخل كطبيبٍ عاديّ، قد يستضيف', docs, 3, { kind: 'in_pool' });
}

// ③ ٣ بورد — اثنان بالعيادة، الثالث احتياطيّ بورد يتناوب
{
  const docs = mkDocs([
    { name: 'محمد', board: true }, { name: 'أحمد', board: true }, { name: 'خالد', board: true },
    { name: 'سعد' }, { name: 'فهد' }, { name: 'علي' }, { name: 'عمر' }, { name: 'زيد' },
  ]);
  const board = docs.filter((d) => (d as any).isBoard);
  scenario('③ ٣ بورد (محمد، أحمد، خالد) — اثنان بالعيادة والثالث احتياطيّ بورد يتناوب', docs, 3, { kind: 'shared_clinic', doctors: board });
}

// ④ ٤ أطبّاء/٣ عيادات: ٢ بورد + ٢ عاديّ → البورد منفردٌ بعيادة، لا يستضيف
{
  const docs = mkDocs([
    { name: 'محمد', board: true }, { name: 'أحمد', board: true }, { name: 'خالد' }, { name: 'سعد' },
  ]);
  const board = docs.filter((d) => (d as any).isBoard);
  scenario('④ ٤ أطبّاء/٣ عيادات (٢ بورد + ٢ عاديّ) — البورد منفردٌ بعيادة، لا يستضيف', docs, 3, { kind: 'shared_clinic', doctors: board });
}
