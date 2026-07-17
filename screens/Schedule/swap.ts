// تبديلُ طبيبين بكاملِ خاناتِهما في يومٍ واحد على شبكةِ الجدولِ الحيّة — نفسُ منطقِ
// جدولِ المعاينة (swapDoctorsInDay في ScheduleWizard) لكنْ على ScheduleSlot[] بدل
// AssignedSlot[]. نلمسُ فقطَ الخاناتِ النشطةَ (status='active') من دورِ العيادة/الدليقيتر؛
// الغيابُ (status≠active) والاحتياطُ (EX) والصفوفُ الداخليّةُ (prev_placement/xday) لا تُمسّ.
import { ScheduleSlot } from './types';

// معرّفُ الطبيب → معرّفُ مدرّبه (supervisor_doctor_id) — لكشفِ ظلِّ المتدرّبِ المبتدئ.
export type SupMap = Map<string, string | null>;

// خاناتُ الظلال: نشطةٌ ودورُها عيادةٌ أو دليقيتر (الظلُّ يتبعُ مدرّبَه في هذه فقط).
const isSwapRole = (s: ScheduleSlot) =>
  s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator');

// الخاناتُ القابلةُ للتبديل: عيادة/دليقيتر نشطة، **أو الاحتياطيّ** (EX: extra + period 0).
// أوسعُ من isSwapRole عمدًا — كي يشملَ السوابُ الاحتياطيَّ. الظلال تبقى على isSwapRole الضيّق.
export const isSwappable = (s: ScheduleSlot) =>
  (s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator')) ||
  (s.status === 'extra' && s.period === 0);

// شفتُ الطبيبِ ذلكَ اليوم من خاناته: عيادة/دليقيتر بالفترة (١،٢=صباح / ٣،٤=مساء)، أو
// احتياطيّ بعموده (١=صباح / ٢=مساء). للتحقّقِ من تطابقِ الشفتِ عند تبديلِ الاحتياطيّ.
export function shiftOfDoctor(slots: ScheduleSlot[], day: string, id: string): 'morning' | 'evening' | null {
  for (const s of slots) {
    if (s.day !== day || s.doctorId !== id) continue;
    if (s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator')) return s.period <= 2 ? 'morning' : 'evening';
    if (s.status === 'extra' && s.period === 0) return s.clinicNumber === 2 ? 'evening' : 'morning';
  }
  return null;
}

// هل هذا الطبيبُ محتاطٌ (له صفُّ EX) ذلكَ اليوم؟
export function isReserveDoctor(slots: ScheduleSlot[], day: string, id: string): boolean {
  return slots.some((s) => s.day === day && s.doctorId === id && s.status === 'extra' && s.period === 0);
}

// المتدرّبُ المبتدئ (الظلّ) نقرُه يُحسَبُ على مدرّبه إن كان حاضرًا في نفسِ اليوم — فالاختيارُ
// والتبديلُ دائمًا على المدرّب.
export function supervisorOfSlots(slots: ScheduleSlot[], day: string, id: string, sup: SupMap): string {
  const s = sup.get(id) ?? null;
  if (s && slots.some((x) => x.day === day && x.doctorId === s && isSwapRole(x))) return s;
  return id;
}

// هل هذا الطبيبُ ظلٌّ في هذا اليوم (مدرّبُه حاضرٌ نشطًا في نفسِ اليوم)؟
export function isShadowOnDay(slots: ScheduleSlot[], day: string, id: string, sup: SupMap): boolean {
  const s = sup.get(id) ?? null;
  return !!s && s !== id && slots.some((x) => x.day === day && x.doctorId === s && isSwapRole(x));
}

// تبديلُ الطبيبين ثُمّ إعادةُ بناءِ كلِّ ظلٍّ مرآةً لمقاعدِ مدرّبه الجديدة (كالمعاينة تمامًا).
export function swapDoctorsInDaySlots(
  slots: ScheduleSlot[],
  day: string,
  rawA: string,
  rawB: string,
  sup: SupMap,
): ScheduleSlot[] {
  const idA = supervisorOfSlots(slots, day, rawA, sup);
  const idB = supervisorOfSlots(slots, day, rawB, sup);
  if (idA === idB) return slots;

  // أسماءُ الطرفين من الخاناتِ القابلةِ للتبديل (تشملُ الاحتياطيّ) — كي يُتبادَلَ المحتاطُ أيضًا.
  const daySwap = slots.filter((s) => s.day === day && isSwappable(s));
  const nameA = daySwap.find((s) => s.doctorId === idA)?.doctorName;
  const nameB = daySwap.find((s) => s.doctorId === idB)?.doctorName;
  if (nameA === undefined || nameB === undefined) return slots;

  // مَن هو ظلٌّ ذلكَ اليوم: طبيبٌ مدرّبُه حاضرٌ نشطًا (عيادة/دليقيتر) في نفسِ اليوم. الاحتياطُ لا ظلَّ له.
  const dayActive = slots.filter((s) => s.day === day && isSwapRole(s));
  const presentActive = new Set(dayActive.map((s) => s.doctorId));
  const shadowInfo = new Map<string, { name: string; supId: string }>();
  for (const s of dayActive) {
    const supId = sup.get(s.doctorId) ?? null;
    if (supId && supId !== s.doctorId && presentActive.has(supId)) {
      shadowInfo.set(s.doctorId, { name: s.doctorName, supId });
    }
  }
  const shadowIds = new Set(shadowInfo.keys());

  // ١) بدّل الطبيبين في كلِّ مقاعدِهما ذلكَ اليوم، واحذف كلَّ مقاعدِ الظلال (سنُعيدُ بناءَها).
  const base: ScheduleSlot[] = [];
  for (const s of slots) {
    if (s.day !== day || !isSwappable(s)) { base.push(s); continue; }  // يومٌ آخرُ/غيابٌ/داخليّ — يبقى
    if (shadowIds.has(s.doctorId)) continue;                            // ظلٌّ — يُعادُ بناؤه
    if (s.doctorId === idA) { base.push({ ...s, doctorId: idB, doctorName: nameB }); continue; }
    if (s.doctorId === idB) { base.push({ ...s, doctorId: idA, doctorName: nameA }); continue; }
    base.push(s);
  }

  // ٢) أعِد بناءَ كلِّ ظلٍّ مرآةً لمقاعدِ مدرّبه الحاليّةِ (بعدَ التبديل) — يلحقُ به أينما حلّ.
  const rebuilt: ScheduleSlot[] = [];
  for (const [shadowId, info] of shadowInfo) {
    for (const s of base) {
      if (s.day === day && isSwapRole(s) && s.doctorId === info.supId) {
        rebuilt.push({
          ...s,
          id: `swap-sh-${day}-${s.period}-${s.clinicNumber}-${s.role}-${shadowId}`,
          doctorId: shadowId,
          doctorName: info.name,
        });
      }
    }
  }
  return [...base, ...rebuilt];
}

// أيّامٌ اختلفتْ فيها الخاناتُ النشطةُ (عيادة/دليقيتر) بين الأصلِ والمعدَّل — للحفظِ الموضعيّ.
export function affectedDays(orig: ScheduleSlot[], edited: ScheduleSlot[]): string[] {
  const sig = (arr: ScheduleSlot[], day: string) =>
    arr
      .filter((s) => s.day === day && isSwappable(s))
      .map((s) => `${s.period}|${s.clinicNumber}|${s.role}|${s.status}|${s.doctorId}`)
      .sort()
      .join(',');
  const days = new Set([...orig, ...edited].map((s) => s.day));
  const out: string[] = [];
  for (const d of days) if (sig(orig, d) !== sig(edited, d)) out.push(d);
  return out;
}
