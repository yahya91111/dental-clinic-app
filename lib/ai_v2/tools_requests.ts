// ═══════════════════════════════════════════════════════════════
// AI V2 Requests Tools — يد الذكاء على محرّك الطلبات (requests.ts)
// ═══════════════════════════════════════════════════════════════
// نمط مطابق لـ tools.ts (الجدول): كل أداة wrapper حول دالّة من
// lib/algorithms/requests.ts. كل مراجع الأطباء بالأرقام (doctorIndex)
// تُترجَم إلى معرّفات في المعالِج عبر ctx.roster.
//
// مستقلّ عن أدوات الجدول (V2_TOOLS) — يُوصَل بالتشغيل في مرحلة التوجيه.
//
// إضافة أداة:
//   1. عرّفها في REQUESTS_TOOLS
//   2. أضف case في dispatchRequestTool
//   3. حدّث requests_assistant.md ليعرفها الذكاء
// ═══════════════════════════════════════════════════════════════

import type { V2Tool, V2ToolContext } from './tools';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;

const DAY_AR: Record<string, string> = {
  sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس',
};
const STATUS_AR: Record<string, string> = {
  sick_leave: 'مرضية', vacation: 'تفرّغ',
  permission_start: 'استئذان بداية الدوام', permission_end: 'استئذان نهاية الدوام',
  extra: 'احتياط',
};

// ─── تعريفات الأدوات ───────────────────────────────────────────
export const REQUESTS_TOOLS: V2Tool[] = [
  {
    name: 'set_schedule_status',
    description:
      'يجعل طبيبًا في يومٍ: مرضية/تفرّغ/استئذان(بداية/نهاية)/احتياط. يُطبَّق فورًا. ' +
      'يعمل على أسبوع محفوظ أو فارغ (يحترمه البناء لاحقًا). الطبيب لنفسه؛ الليدر لأيّ أحد.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string', description: 'بداية الأسبوع (أحد) YYYY-MM-DD.' },
        day: { type: 'string', enum: [...DAYS] },
        doctorIndex: { type: 'integer', description: 'رقم الطبيب من القائمة المرقّمة.' },
        status: {
          type: 'string',
          enum: ['sick_leave', 'vacation', 'permission_start', 'permission_end', 'extra'],
        },
        shift: { type: 'string', enum: ['morning', 'evening'], description: 'شفت الطبيب ذلك اليوم (لتحديد جهة EX).' },
      },
      required: ['weekStart', 'day', 'doctorIndex', 'status', 'shift'],
    },
  },
  {
    name: 'cancel_schedule_status',
    description:
      'يلغي حالة طبيبٍ ليومٍ (يُزيل المرضية/التفرّغ/الاستئذان). الطبيب لنفسه؛ الليدر لأيّ أحد. ' +
      'restorePrevPlace=true يعيده إلى مكانه قبل الغياب إن وُجد.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS] },
        doctorIndex: { type: 'integer' },
        restorePrevPlace: { type: 'boolean', description: 'إعادته لمكانه الأصليّ. افتراضي false.' },
      },
      required: ['weekStart', 'day', 'doctorIndex'],
    },
  },
  {
    name: 'place_in_clinic',
    description:
      'يضع طبيبًا في عيادة/فترات محدّدة (العكس: من غياب إلى داخل العيادة). الطبيب لنفسه في ' +
      'مكان متاح (راجِع find_placement_options أولًا)؛ الليدر لأيّ مكان.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS] },
        doctorIndex: { type: 'integer' },
        clinicNumber: { type: 'integer', description: 'رقم العيادة (1..عدد العيادات).' },
        periods: {
          type: 'array', items: { type: 'integer', enum: [1, 2, 3, 4] },
          description: 'الفترات التي يُوضع فيها (مثلًا [3,4] مساء كامل، أو [4] فترة واحدة).',
        },
      },
      required: ['weekStart', 'day', 'doctorIndex', 'clinicNumber', 'periods'],
    },
  },
  {
    name: 'find_placement_options',
    description:
      'يقرأ يومًا ويُرجِع الأماكن المتاحة لإرجاع طبيب للعيادة (فترات فارغة + عيادات قابلة ' +
      'للمشاركة). استعمله قبل place_in_clinic لعرض الخيارات.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS] },
      },
      required: ['weekStart', 'day'],
    },
  },
  {
    name: 'swap_doctors',
    description:
      'يبدّل خانات طبيبين أو أكثر (تبديل متسلسل دائريّ) ضمن نطاق فترة/شفت/يوم. ' +
      'الليدر فوري؛ طلب الطبيب يحتاج موافقة الطرف الآخر (تُدار خارج الأداة).',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: { type: 'string' },
        day: { type: 'string', enum: [...DAYS] },
        doctorIndexes: {
          type: 'array', items: { type: 'integer' },
          description: 'أرقام الأطباء مرتّبين؛ كلٌّ يأخذ مكان التالي.',
        },
        scope: { type: 'string', enum: ['day', 'shift', 'period'] },
        shift: { type: 'string', enum: ['morning', 'evening'], description: 'فقط لو scope=shift.' },
        period: { type: 'integer', enum: [1, 2, 3, 4], description: 'فقط لو scope=period.' },
      },
      required: ['weekStart', 'day', 'doctorIndexes', 'scope'],
    },
  },
  {
    name: 'set_clinic_count',
    description: 'يغيّر عدد عيادات العيادة (يؤثّر على الحاليّ والقادم بلا إعادة توزيع). الليدر فأعلى.',
    input_schema: {
      type: 'object',
      properties: { count: { type: 'integer', description: 'عدد العيادات الجديد (1+).' } },
      required: ['count'],
    },
  },
  {
    name: 'clear_week',
    description:
      'يمسح جدول أسبوعٍ كاملًا (كلّ الخانات والحالات). لا رجعة فيه. الليدر فأعلى. ' +
      'لا تستدعِها إلا بعد تأكيد المستخدم صراحةً.',
    input_schema: {
      type: 'object',
      properties: { weekStart: { type: 'string' } },
      required: ['weekStart'],
    },
  },
];

// ─── أدوات مساعدة ──────────────────────────────────────────────
type Resolved = { id: string; name: string };
function resolveDoctor(ctx: V2ToolContext, n: unknown): Resolved | null {
  const list = ctx.roster ?? [];
  const i = typeof n === 'number' ? n : parseInt(String(n), 10);
  if (!Number.isInteger(i) || i < 1 || i > list.length) return null;
  const d = list[i - 1]!;
  return { id: d.id, name: d.name };
}

const isDay = (d: unknown): d is (typeof DAYS)[number] =>
  typeof d === 'string' && (DAYS as readonly string[]).includes(d);

function actorOf(ctx: V2ToolContext): { id: string; role: string } | null {
  if (!ctx.user) return null;
  return { id: ctx.user.id, role: ctx.user.role };
}

async function getClinicCount(clinicId: string): Promise<number> {
  const { getScheduleSettings } = await import('../database');
  const { data } = await getScheduleSettings(clinicId);
  return data?.clinic_count ?? 2;
}

// ─── الموزّع ───────────────────────────────────────────────────
export async function dispatchRequestTool(
  name: string,
  input: unknown,
  ctx: V2ToolContext,
): Promise<string> {
  if (!ctx.clinicId) return 'Tool error: لا توجد عيادة مرتبطة بالمستخدم الحالي.';
  const actor = actorOf(ctx);
  if (!actor) return 'Tool error: لا يوجد مستخدم لتحديد الصلاحيّة.';
  const r = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const { requests } = await import('../algorithms/requests');

  try {
    switch (name) {
      case 'set_schedule_status': {
        const doc = resolveDoctor(ctx, r.doctorIndex);
        if (!doc) return 'Tool error: رقم الطبيب غير صالح.';
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        const status = r.status;
        const shift = r.shift === 'evening' ? 'evening' : 'morning';
        if (!['sick_leave', 'vacation', 'permission_start', 'permission_end', 'extra'].includes(String(status))) {
          return 'Tool error: الحالة غير صالحة.';
        }
        const res = await requests.setScheduleStatus(actor, {
          clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day,
          doctorId: doc.id, doctorName: doc.name,
          status: status as 'sick_leave' | 'vacation' | 'permission_start' | 'permission_end' | 'extra',
          shift,
        });
        if (!res.success) return `Tool error: ${res.error}`;
        let out = `تمّ: ${STATUS_AR[String(status)]} لـ${doc.name} يوم ${DAY_AR[r.day]} (${r.weekStart}).`;
        if (res.gaps && res.gaps.length > 0) {
          out += ` نقص تغطية: ${res.gaps.map((g) => `عيادة ${g.clinicNumber} فترة ${g.period}`).join('، ')}.`;
        }
        return out;
      }

      case 'cancel_schedule_status': {
        const doc = resolveDoctor(ctx, r.doctorIndex);
        if (!doc) return 'Tool error: رقم الطبيب غير صالح.';
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        const res = await requests.cancelStatus(actor, {
          clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day,
          doctorId: doc.id, restoreToPrevPlace: r.restorePrevPlace === true,
        });
        return res.success ? `تمّ إلغاء حالة ${doc.name} يوم ${DAY_AR[r.day]}.` : `Tool error: ${res.error}`;
      }

      case 'place_in_clinic': {
        const doc = resolveDoctor(ctx, r.doctorIndex);
        if (!doc) return 'Tool error: رقم الطبيب غير صالح.';
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        const periods = Array.isArray(r.periods)
          ? r.periods.filter((p): p is number => Number.isInteger(p) && p >= 1 && p <= 4) : [];
        const res = await requests.placeInClinic(actor, {
          clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day,
          doctorId: doc.id, doctorName: doc.name,
          clinicNumber: Number(r.clinicNumber), periods,
        });
        return res.success
          ? `تمّ وضع ${doc.name} في عيادة ${r.clinicNumber} (الفترات ${periods.join('، ')}) يوم ${DAY_AR[r.day]}.`
          : `Tool error: ${res.error}`;
      }

      case 'find_placement_options': {
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        const count = await getClinicCount(ctx.clinicId);
        const opts = await requests.findPlacementOptions(ctx.clinicId, String(r.weekStart), r.day, count);
        if (opts.length === 0) return `لا توجد أماكن متاحة يوم ${DAY_AR[r.day]}.`;
        const lines = opts.map((o) =>
          o.kind === 'empty'
            ? `عيادة ${o.clinicNumber} فترة ${o.period} فارغة`
            : `عيادة ${o.clinicNumber} فترة ${o.period} (مشاركة مع ${o.withDoctorName})`,
        );
        return `أماكن متاحة يوم ${DAY_AR[r.day]}:\n${lines.join('\n')}`;
      }

      case 'swap_doctors': {
        if (!isDay(r.day)) return 'Tool error: اليوم غير صالح.';
        const idxs = Array.isArray(r.doctorIndexes) ? r.doctorIndexes : [];
        const docs = idxs.map((n) => resolveDoctor(ctx, n)).filter((d): d is Resolved => d != null);
        if (docs.length < 2) return 'Tool error: التبديل يحتاج طبيبين صالحين على الأقلّ.';
        const scope =
          r.scope === 'shift' ? { kind: 'shift' as const, shift: (r.shift === 'evening' ? 'evening' : 'morning') as 'morning' | 'evening' }
            : r.scope === 'period' ? { kind: 'period' as const, period: Number(r.period) }
              : { kind: 'day' as const };
        const res = await requests.swapInSchedule(actor, {
          clinicId: ctx.clinicId, weekStart: String(r.weekStart), day: r.day,
          doctorIds: docs.map((d) => d.id), scope,
        });
        return res.success
          ? `تمّ التبديل بين: ${docs.map((d) => d.name).join('، ')} يوم ${DAY_AR[r.day]}.`
          : `Tool error: ${res.error}`;
      }

      case 'set_clinic_count': {
        const res = await requests.setClinicCount(actor, ctx.clinicId, Number(r.count));
        return res.success ? `تمّ ضبط عدد العيادات على ${r.count}.` : `Tool error: ${res.error}`;
      }

      case 'clear_week': {
        const res = await requests.clearWeek(actor, ctx.clinicId, String(r.weekStart));
        return res.success ? `تمّ مسح جدول أسبوع ${r.weekStart} كاملًا.` : `Tool error: ${res.error}`;
      }

      default:
        return `Tool error: أداة طلبات غير معروفة "${name}".`;
    }
  } catch (e) {
    return `Tool error: ${e instanceof Error ? e.message : 'خطأ غير متوقّع.'}`;
  }
}
