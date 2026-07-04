// تبديلُ طبيبين بكاملِ خاناتِهما في يومٍ واحد على شبكةِ الجدولِ الحيّة — نفسُ منطقِ
// جدولِ المعاينة (swapDoctorsInDay في ScheduleWizard) لكنْ على ScheduleSlot[] بدل
// AssignedSlot[]. نلمسُ فقطَ الخاناتِ النشطةَ (status='active') من دورِ العيادة/الدليقيتر؛
// الغيابُ (status≠active) والاحتياطُ (EX) والصفوفُ الداخليّةُ (prev_placement/xday) لا تُمسّ.
import { ScheduleSlot } from './types';

// معرّفُ الطبيب → معرّفُ مدرّبه (supervisor_doctor_id) — لكشفِ ظلِّ المتدرّبِ المبتدئ.
export type SupMap = Map<string, string | null>;

// نلمسُ فقط الخاناتِ القابلةَ للتبديل: نشطةٌ ودورُها عيادةٌ أو دليقيتر.
const isSwapRole = (s: ScheduleSlot) =>
  s.status === 'active' && (s.role === 'clinic' || s.role === 'delegator');

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

  const dayActive = slots.filter((s) => s.day === day && isSwapRole(s));
  const nameA = dayActive.find((s) => s.doctorId === idA)?.doctorName;
  const nameB = dayActive.find((s) => s.doctorId === idB)?.doctorName;
  if (nameA === undefined || nameB === undefined) return slots;

  // مَن هو ظلٌّ ذلكَ اليوم: طبيبٌ مدرّبُه حاضرٌ نشطًا في نفسِ اليوم.
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
    if (s.day !== day || !isSwapRole(s)) { base.push(s); continue; }   // يومٌ آخرُ/غيابٌ/EX/داخليّ — يبقى
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
      .filter((s) => s.day === day && isSwapRole(s))
      .map((s) => `${s.period}|${s.clinicNumber}|${s.role}|${s.doctorId}`)
      .sort()
      .join(',');
  const days = new Set([...orig, ...edited].map((s) => s.day));
  const out: string[] = [];
  for (const d of days) if (sig(orig, d) !== sig(edited, d)) out.push(d);
  return out;
}
