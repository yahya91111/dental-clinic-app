// ═══════════════════════════════════════════════════════════════
// اختبار انحدارٍ لقلب العدل (العجلة) — **مستقلٌّ تماماً، بلا قاعدة بيانات**.
// شبكة أمان: يحرس الخصائص التي أصلحناها كي لا ينكسر «لا عبث» في أيّ تعديلٍ قادم.
//   تشغيل:  npm run test:fairness   (أو: npx tsx scripts/wheel-regression.ts)
//   يخرج بكود ≠ 0 عند أيّ فشل — صالحٌ لبوّابة ما قبل الكوميت.
//
// الخصائص المحروسة:
//   (١) الحتميّة: بناءُ نفس الأسبوع مرّتين يُعطي نفس النتيجة بالضبط.
//   (٢) «بلا عبث»: إعادةُ حساب أيّ شفتٍ من سجلّ الواقع تطابق البناء الحيّ
//       (وإلّا أعاد المحرّك كتابة شفتاتٍ لم تتغيّر → عبثٌ وإشعاراتٌ كاذبة).
//   (٣) استثناء الظلال: المتدرّب المبتدئ (ظلّ مدرّبه) لا يلوّث حالة العجلة.
// ═══════════════════════════════════════════════════════════════
import { createWheels, distributeShiftWheel } from '../lib/algorithms/wheel';
import { GROUP_TEMPLATES } from '../lib/algorithms/groupTemplates';
import type { LoadedDoctor, LoadedSlot, ShiftPool, AssignedSlot, WeekDay, Shift } from '../lib/algorithms/schedule';

const GA = GROUP_TEMPLATES.find((t) => t.key === 'group_a')!;
const DAYS: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const SHIFTS: Shift[] = ['morning', 'evening'];
const order = (day: WeekDay, shift: Shift) => DAYS.indexOf(day) * 2 + (shift === 'evening' ? 1 : 0);

// ٦ أطبّاء عاديّون + متدرّبٌ مبتدئ (ظلّ) يتبع د١
const regs: LoadedDoctor[] = [1, 2, 3, 4, 5, 6].map((n) => ({
  id: `d${n}`, name: `د${n}`, groupTemplate: GA, groupId: 'g', workStatus: 'active', supervisorDoctorId: null,
}));
const beginner: LoadedDoctor = { id: 'b1', name: 'مبتدئ', groupTemplate: GA, groupId: 'g', workStatus: 'trainee', supervisorDoctorId: 'd1' };
const allDocs = [...regs, beginner];
const shadowIds = new Set(['b1']);

const poolFor = (shift: Shift): ShiftPool => ({
  shift, available: [...regs], lightDuty: [], absent: [], partialAvailable: [], boardRule: { kind: 'no_board' },
  beginnersByBuddy: new Map([['d1', [beginner]]]), beginnersOrphan: [],
} as ShiftPool);

const toLoaded = (slots: AssignedSlot[], day: WeekDay): LoadedSlot[] => slots.map((s, i) => ({
  id: `${day}-${i}`, weekStart: 'w', dayOfWeek: day, period: s.role === 'ex' ? 0 : s.period,
  clinicNumber: s.clinicNumber, doctorId: s.doctor.id, doctorName: s.doctor.name,
  role: (s.role === 'ex' ? 'clinic' : s.role) as LoadedSlot['role'],
  status: (s.role === 'ex' ? 'extra' : 'active') as LoadedSlot['status'],
}));

// توقيع شفتٍ مقارَن (دور|عيادة|فترة|طبيب) مرتّب — يشمل الاحتياط
const sig = (slots: AssignedSlot[]): string =>
  slots.map((s) => `${s.role}|${s.clinicNumber}|${s.role === 'ex' ? 0 : s.period}|${s.doctor.id}`).sort().join(';');

// يبني الأسبوع كاملاً (العجلة تتطوّر حيّاً) ويُرجِع شفتاته + سجلّه الكامل
function buildWeek(): { built: Map<number, AssignedSlot[]>; history: LoadedSlot[] } {
  const wheels = createWheels(allDocs, [], shadowIds);
  const built = new Map<number, AssignedSlot[]>();
  const history: LoadedSlot[] = [];
  for (const day of DAYS) for (const shift of SHIFTS) {
    const r = distributeShiftWheel(day, 3, poolFor(shift), wheels, true);
    built.set(order(day, shift), r.slots);
    history.push(...toLoaded(r.slots, day));
  }
  return { built, history };
}

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures++;
};

console.log('═══ اختبار انحدار العجلة (مستقلّ) ═══\n');

// (١) الحتميّة
const a = buildWeek();
const b = buildWeek();
let detSame = true;
for (const o of a.built.keys()) if (sig(a.built.get(o)!) !== sig(b.built.get(o)!)) detSame = false;
check('(١) الحتميّة: بناءان متطابقان', detSame);

// (٢)+(٣) «بلا عبث» مع ظلٍّ مبتدئ: إعادة الحساب من السجلّ تطابق البناء
// رتبة كلّ خانة من فترتها (احتياط period=0 → من عموده: ١=صباح، ٢=مساء)
const slotShiftOf = (s: LoadedSlot): Shift =>
  s.period === 1 || s.period === 2 ? 'morning'
    : s.period === 3 || s.period === 4 ? 'evening'
      : s.clinicNumber === 2 ? 'evening' : 'morning';
const slotOrderOf = (s: LoadedSlot) => order(s.dayOfWeek as WeekDay, slotShiftOf(s));
let meddleFails = 0; let firstBad = '';
for (const day of DAYS) for (const shift of SHIFTS) {
  const o = order(day, shift);
  const histBefore = a.history.filter((s) => slotOrderOf(s) < o); // كلّ ما سبق هذا الشفت
  const wheels2 = createWheels(allDocs, histBefore, shadowIds);
  const rec = distributeShiftWheel(day, 3, poolFor(shift), wheels2, true);
  if (sig(rec.slots) !== sig(a.built.get(o)!)) { meddleFails++; if (!firstBad) firstBad = `${day} ${shift}`; }
}
check('(٢) بلا عبث: إعادة الحساب تطابق البناء (مع ظلّ)', meddleFails === 0, `أوّل اختلاف: ${firstBad} (${meddleFails} شفت)`);

console.log(`\n${failures === 0 ? '✅ نجحت كلّ الاختبارات — شبكة الأمان سليمة.' : `❌ فشل ${failures} اختبار — انتبه: قد يعود العبث.`}`);
process.exit(failures === 0 ? 0 : 1);
