// ═══════════════════════════════════════════════════════════════
// AI V2 Tools — تعريفات الأدوات التي ينادي بها الذكاء الخوارزميات
// ═══════════════════════════════════════════════════════════════
// نمط: كل أداة هنا = wrapper بسيط حول خوارزمية من lib/algorithms/
//
// كيف نضيف أداة جديدة:
//   1. أضف تعريف JSON Schema في V2_TOOLS
//   2. أضف case في dispatchV2Tool ينادي الخوارزمية
//   3. حدّث lib/ai_v2/catalog.md ليعرفها الذكاء
//   4. شغّل: node scripts/build-ai-v2.js
// ═══════════════════════════════════════════════════════════════

// schedule محمّل بشكل lazy حتى لا يستورد supabase وقت الـ bundle
// (مهم لاختبارات Node — راجع scripts/test-ai-v2.ts)
import type { ScheduleBuildInput, WeekDay } from '../algorithms/schedule';

const WEEK_DAYS_LIST: WeekDay[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday',
];

export type V2Tool = {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type V2ToolContext = {
  clinicId: string;
  user: {
    id: string;
    name: string;
    role: string;
    clinicId?: string;
    clinicName?: string;
  } | null;
};

/**
 * قائمة الأدوات التي يراها الذكاء.
 * كل أداة wrapper حول خوارزمية في lib/algorithms/.
 */
export const V2_TOOLS: V2Tool[] = [
  {
    name: 'build_schedule',
    description:
      'يبني جدول دوام أسبوع كامل لعيادة التيم ليدر. لا تستدعِها بدون ' +
      'تأكيد المستخدم على بداية الأسبوع وتوزيع الشفتات وإعدادات البورد. ' +
      'الإخراج: ملخّص يحوي عدد الخانات، الأطباء المُعيّنين، الغيابات المُحترمة، التحذيرات.',
    input_schema: {
      type: 'object',
      properties: {
        weekStart: {
          type: 'string',
          description:
            'بداية الأسبوع — يجب أن تكون يوم أحد بصيغة YYYY-MM-DD',
        },
        aShiftPlan: {
          type: 'object',
          description:
            'شفت قروب A لكل يوم (قروب B يأخذ العكس). القيم: "morning" أو "evening".',
          properties: {
            sunday:    { type: 'string', enum: ['morning', 'evening'] },
            monday:    { type: 'string', enum: ['morning', 'evening'] },
            tuesday:   { type: 'string', enum: ['morning', 'evening'] },
            wednesday: { type: 'string', enum: ['morning', 'evening'] },
            thursday:  { type: 'string', enum: ['morning', 'evening'] },
          },
          required: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
        },
        boardConfig: {
          type: 'object',
          description: 'إعدادات قروب البورد لهذا الأسبوع.',
          properties: {
            scenarioKind: {
              type: 'string',
              enum: [
                'separate_schedule',
                'all_morning',
                'all_evening',
                'hybrid_evening_days',
              ],
              description:
                'separate_schedule=دوام منفصل | all_morning=كل الأسبوع صباحاً | ' +
                'all_evening=كل الأسبوع مساءً | hybrid_evening_days=أيام محددة مساءً. ' +
                'توزيع البورد داخل الشفت تلقائي: 2+ بورد يشاركون عيادة، 1 بورد يصير عادي.',
            },
            eveningDays: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
              },
              description: 'فقط لو scenarioKind=hybrid_evening_days',
            },
            includeInExRotation: {
              type: 'boolean',
              description:
                'هل يدخل البورد في تدوير الاحتياطي؟ ' +
                '(الدليقيتر مستثنى دائماً — الليدر يضيفهم يدوياً)',
            },
          },
          required: ['scenarioKind', 'includeInExRotation'],
        },
        holidayDays: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
          },
          description: 'أيام عطل رسمية لا تُوزّع (اختياري).',
        },
        traineeModes: {
          type: 'object',
          description:
            'وضع كل تريني (key = doctor_id): "independent" يوزّع كطبيب عادي، ' +
            '"beginner" يلتصق بالمدرّب نفس العيادة. اختياري.',
          additionalProperties: {
            type: 'string',
            enum: ['independent', 'beginner'],
          },
        },
        doctorPreferences: {
          type: 'object',
          description:
            'تفضيلات أطباء محددين (key = doctor_id). القيم: ' +
            'always_morning، always_evening، always_first_period، always_second_period. اختياري.',
          additionalProperties: {
            type: 'string',
            enum: [
              'always_morning',
              'always_evening',
              'always_first_period',
              'always_second_period',
            ],
          },
        },
        dryRun: {
          type: 'boolean',
          description:
            'true = يحسب ويرجّع الملخّص بدون كتابة في DB (للمعاينة). ' +
            'افتراضي false (يحفظ).',
        },
      },
      required: ['weekStart', 'aShiftPlan', 'boardConfig'],
    },
  },
];

// ─── Helpers ─────────────────────────────────────────────────

/** يحوّل scenarioKind المسطّح إلى البنية المتداخلة للخوارزمية */
function buildBoardScenario(
  kind: string,
  eveningDays: string[] | undefined,
): ScheduleBuildInput['boardConfig']['scenario'] | null {
  switch (kind) {
    case 'separate_schedule':
      return { kind: 'separate_schedule' };
    case 'all_morning':
      return { kind: 'all_morning' };
    case 'all_evening':
      return { kind: 'all_evening' };
    case 'hybrid_evening_days': {
      const validDays = new Set<string>(WEEK_DAYS_LIST);
      const filtered = (eveningDays || []).filter((d) => validDays.has(d));
      return {
        kind: 'hybrid_evening_days',
        eveningDays: filtered as WeekDay[],
      };
    }
    default:
      return null;
  }
}

/** يحوّل خريطة tarinee modes الخامة إلى الصيغة المُتوقّعة */
function normalizeTraineeModes(
  raw: unknown,
): ScheduleBuildInput['traineeModes'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, 'independent' | 'beginner'> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === 'independent' || v === 'beginner') out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** يحوّل تفضيلات الأطباء من المسطّح إلى الكائنات */
function normalizeDoctorPreferences(
  raw: unknown,
): ScheduleBuildInput['doctorPreferences'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: NonNullable<ScheduleBuildInput['doctorPreferences']> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (
      v === 'always_morning' ||
      v === 'always_evening' ||
      v === 'always_first_period' ||
      v === 'always_second_period'
    ) {
      out[k] = { kind: v };
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * ينادي الخوارزمية المناسبة حسب اسم الأداة.
 * يرجّع نصاً يعود إلى الذكاء كـ tool_result.
 */
export async function dispatchV2Tool(
  name: string,
  input: unknown,
  ctx: V2ToolContext,
): Promise<string> {
  if (name === 'build_schedule') {
    return await handleBuildSchedule(input, ctx);
  }
  return `Tool error: unknown tool "${name}".`;
}

async function handleBuildSchedule(
  rawInput: unknown,
  ctx: V2ToolContext,
): Promise<string> {
  if (!ctx.clinicId) {
    return 'Tool error: لا توجد عيادة مرتبطة بالمستخدم الحالي.';
  }
  if (!rawInput || typeof rawInput !== 'object') {
    return 'Tool error: مدخلات build_schedule غير صالحة.';
  }
  const input = rawInput as Record<string, unknown>;

  const weekStart = typeof input.weekStart === 'string' ? input.weekStart : '';
  const aShiftPlan = input.aShiftPlan as ScheduleBuildInput['aShiftPlan'] | undefined;
  const board = input.boardConfig as
    | {
        scenarioKind?: string;
        eveningDays?: string[];
        includeInExRotation?: boolean;
      }
    | undefined;

  if (!weekStart || !aShiftPlan || !board || !board.scenarioKind) {
    return 'Tool error: weekStart و aShiftPlan و boardConfig.scenarioKind مطلوبة.';
  }

  const scenario = buildBoardScenario(board.scenarioKind, board.eveningDays);
  if (!scenario) {
    return `Tool error: scenarioKind غير معروف: ${board.scenarioKind}`;
  }

  const buildInput: ScheduleBuildInput = {
    weekStart,
    clinicId: ctx.clinicId,
    aShiftPlan,
    boardConfig: {
      scenario,
      includeInExRotation: board.includeInExRotation === true,
    },
    holidayDays: Array.isArray(input.holidayDays)
      ? (input.holidayDays as ScheduleBuildInput['holidayDays'])
      : undefined,
    traineeModes: normalizeTraineeModes(input.traineeModes),
    doctorPreferences: normalizeDoctorPreferences(input.doctorPreferences),
    dryRun: input.dryRun === true,
  };

  try {
    // lazy import: يحمّل supabase فقط عند الاستدعاء الفعلي
    const { schedule } = await import('../algorithms/schedule');
    const result = await schedule.build(buildInput);
    const lines: string[] = [];
    lines.push(`success: ${result.success}`);
    lines.push(`summary: ${result.summary}`);
    lines.push(`slotsCreated: ${result.slotsCreated}`);
    lines.push(`doctorsAssigned: ${result.doctorsAssigned}`);
    lines.push(`absencesRespected: ${result.absencesRespected}`);
    if (result.warnings.length > 0) {
      lines.push(`warnings:`);
      for (const w of result.warnings) lines.push(`  - ${w}`);
    }
    if (result.errors.length > 0) {
      lines.push(`errors:`);
      for (const e of result.errors) lines.push(`  - ${e}`);
    }
    return lines.join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Tool error: ${msg}`;
  }
}
