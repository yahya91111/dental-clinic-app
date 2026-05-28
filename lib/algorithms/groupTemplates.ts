// ═══════════════════════════════════════════════════════════════
// Group Templates — تعريف القروبات الثابتة في النظام
// ═══════════════════════════════════════════════════════════════
// كل عيادة تحتوي على هذه القروبات الـ4 فقط، بنفس الأسماء والألوان
// والترتيب. لا يمكن إضافة قروبات جديدة أو حذفها أو تعديلها.
//
// قروب Unassigned يُعرض في الـ UI كقسم منفصل، وليس قروباً
// مسجّلاً في قاعدة البيانات.
// ═══════════════════════════════════════════════════════════════

export type GroupTemplate = {
  key: string;          // معرّف ثابت يستخدمه الكود
  name: string;         // الاسم المعروض في الواجهة
  colorIndex: number;   // فهرس اللون في GROUP_COLORS
  color: string;        // لون مباشر (نسخة احتياطية)
  sortOrder: number;    // الترتيب في الواجهة
};

export const GROUP_TEMPLATES: GroupTemplate[] = [
  {
    key: 'agd',
    name: 'AGD',
    colorIndex: 2,
    color: '#10B981',  // Green
    sortOrder: 0,
  },
  {
    key: 'group_a',
    name: 'Group A',
    colorIndex: 0,
    color: '#3B82F6',  // Blue
    sortOrder: 1,
  },
  {
    key: 'group_b',
    name: 'Group B',
    colorIndex: 1,
    color: '#8B5CF6',  // Purple
    sortOrder: 2,
  },
  {
    key: 'board',
    name: 'Board',
    colorIndex: 3,
    color: '#F59E0B',  // Orange
    sortOrder: 3,
  },
];

/**
 * الأسماء التي تُعتبر قوالب صالحة.
 * يُستخدم لفلترة القروبات من قاعدة البيانات.
 */
export const TEMPLATE_NAMES = new Set(GROUP_TEMPLATES.map((t) => t.name));

/**
 * يرجع القالب المطابق للاسم، أو undefined إذا كان قروباً قديماً
 * غير ضمن القوالب.
 */
export function getTemplateByName(name: string): GroupTemplate | undefined {
  return GROUP_TEMPLATES.find((t) => t.name === name);
}

/**
 * يرتّب قائمة قروبات حسب ترتيب القوالب الثابت.
 * القروبات غير المعروفة تذهب للنهاية.
 */
export function sortByTemplateOrder<T extends { name: string }>(groups: T[]): T[] {
  return [...groups].sort((a, b) => {
    const aTpl = getTemplateByName(a.name);
    const bTpl = getTemplateByName(b.name);
    if (aTpl && bTpl) return aTpl.sortOrder - bTpl.sortOrder;
    if (aTpl) return -1;
    if (bTpl) return 1;
    return 0;
  });
}
