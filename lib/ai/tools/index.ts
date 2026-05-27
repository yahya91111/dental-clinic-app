// ═══════════════════════════════════════════════════════════════
// DCM AI Tools — Phase 4-A: Read tools only
// ═══════════════════════════════════════════════════════════════
// Tool definitions (for the Claude API) and execution handlers
// (which hit Supabase) for the read-only tools the Team Leader
// assistant uses to answer questions about the current state.
//
// Read tools are safe — they never modify data and do not need
// confirmation per the Golden Rule. Permission scope is still
// applied implicitly: each tool reads only data inside the
// signed-in user's clinic (passed in via ToolContext).
//
// Write tools come in later phases.
// ═══════════════════════════════════════════════════════════════

import { supabase } from '../../supabase';

/**
 * Context every tool receives. Filled in by the AI service from
 * the signed-in user's session.
 */
export interface ToolContext {
  clinicId: string;
  weekStart: string;
}

// ─── Tool definitions for the Claude API ─────────────────────────

export const READ_TOOLS = [
  {
    name: 'get_clinic_info',
    description:
      'Get basic info about the current clinic: name, number of clinic rooms, and the active week start date. Use this before any other tool when you need clinic-level context.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_clinic_doctors',
    description:
      'List all doctors currently belonging to the clinic. Each doctor includes id, name, and role (doctor / team_leader / coordinator).',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_groups',
    description:
      'List all doctor groups in the clinic together with their members (and each member work_status: active / vacation / light_duty).',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_existing_schedule',
    description:
      'Get the current weekly schedule for the clinic. Returns every slot (day, period, clinic_number, role, doctor, status). Optionally filter by a single day.',
    input_schema: {
      type: 'object',
      properties: {
        day: {
          type: 'string',
          enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
          description: 'Optional — limit the result to one day.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_doctor_schedule',
    description:
      'Get all slots a specific doctor holds in the current week. Useful to answer "what does Dr X have this week" or to plan a swap.',
    input_schema: {
      type: 'object',
      properties: {
        doctor_id: {
          type: 'string',
          description: 'UUID of the doctor. Required.',
        },
      },
      required: ['doctor_id'],
    },
  },
];

// ─── Execution handler ────────────────────────────────────────────

/**
 * Execute a read tool by name. Returns a plain-text string that
 * is fed back to the AI as the tool_result content.
 *
 * Errors are returned as strings (not thrown) so the AI can read
 * them and decide how to respond.
 */
export async function executeReadTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  try {
    switch (name) {
      case 'get_clinic_info':
        return await getClinicInfo(ctx);
      case 'get_clinic_doctors':
        return await getClinicDoctors(ctx);
      case 'get_groups':
        return await getGroups(ctx);
      case 'get_existing_schedule':
        return await getExistingSchedule(ctx, input.day as string | undefined);
      case 'get_doctor_schedule':
        return await getDoctorScheduleForWeek(ctx, input.doctor_id as string);
      default:
        return `Unknown read tool: ${name}`;
    }
  } catch (error) {
    return `Tool error (${name}): ${error instanceof Error ? error.message : 'Unknown'}`;
  }
}

// ─── Individual tool implementations ─────────────────────────────

async function getClinicInfo(ctx: ToolContext): Promise<string> {
  const { data: clinic } = await supabase
    .from('clinics')
    .select('id, name')
    .eq('id', ctx.clinicId)
    .maybeSingle();

  const { data: settings } = await supabase
    .from('schedule_settings')
    .select('clinic_count')
    .eq('clinic_id', ctx.clinicId)
    .maybeSingle();

  const lines = [
    `clinic_id: ${ctx.clinicId}`,
    `clinic_name: ${clinic?.name || '(unknown)'}`,
    `clinic_count: ${settings?.clinic_count ?? '(unset)'}`,
    `week_start: ${ctx.weekStart}`,
  ];
  return lines.join('\n');
}

async function getClinicDoctors(ctx: ToolContext): Promise<string> {
  const { data, error } = await supabase
    .from('doctors')
    .select('id, name, role')
    .eq('clinic_id', ctx.clinicId)
    .order('name');

  if (error) return `Error: ${error.message}`;
  if (!data || data.length === 0) return 'No doctors found in this clinic.';

  const lines = data.map(
    (d) => `- ${d.name} [${d.id}] (role: ${d.role})`,
  );
  return `Doctors in clinic (${data.length}):\n${lines.join('\n')}`;
}

async function getGroups(ctx: ToolContext): Promise<string> {
  const { data: groups, error: gErr } = await supabase
    .from('doctor_groups')
    .select('id, name, color_index, sort_order')
    .eq('clinic_id', ctx.clinicId)
    .order('sort_order');

  if (gErr) return `Error fetching groups: ${gErr.message}`;
  if (!groups || groups.length === 0) return 'No groups defined in this clinic.';

  const { data: members } = await supabase
    .from('doctor_group_members')
    .select('group_id, doctor_id, doctor_name, work_status')
    .in('group_id', groups.map((g) => g.id));

  const lines: string[] = [];
  for (const g of groups) {
    const groupMembers = (members || []).filter((m) => m.group_id === g.id);
    const memberStr =
      groupMembers
        .map((m) => {
          const status = m.work_status !== 'active' ? ` (${m.work_status})` : '';
          return `${m.doctor_name}${status} [${m.doctor_id}]`;
        })
        .join(', ') || '(empty)';
    lines.push(`- ${g.name} [group_id: ${g.id}]: ${memberStr}`);
  }
  return `Groups (${groups.length}):\n${lines.join('\n')}`;
}

async function getExistingSchedule(
  ctx: ToolContext,
  day?: string,
): Promise<string> {
  let query = supabase
    .from('schedule_slots')
    .select('*')
    .eq('clinic_id', ctx.clinicId)
    .eq('week_start', ctx.weekStart)
    .order('day_of_week')
    .order('period')
    .order('clinic_number');

  if (day) {
    query = query.eq('day_of_week', day);
  }

  const { data, error } = await query;
  if (error) return `Error: ${error.message}`;
  if (!data || data.length === 0) {
    return day
      ? `No slots on ${day} for week ${ctx.weekStart}.`
      : `Schedule is empty for week ${ctx.weekStart}.`;
  }

  const lines: string[] = [];
  const days = day
    ? [day]
    : ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
  for (const d of days) {
    const daySlots = data.filter((s) => s.day_of_week === d);
    if (daySlots.length === 0) continue;
    lines.push(`${d}:`);
    for (const s of daySlots) {
      const periodLabel = s.period === 0 ? 'EX' : `P${s.period}`;
      const roleLabel =
        s.role === 'delegator' ? 'DLG' : `CL${s.clinic_number}`;
      lines.push(
        `  ${periodLabel} ${roleLabel}: ${s.doctor_name} [${s.doctor_id}] (${s.status})`,
      );
    }
  }
  return lines.join('\n');
}

async function getDoctorScheduleForWeek(
  ctx: ToolContext,
  doctorId: string,
): Promise<string> {
  if (!doctorId) return 'Error: doctor_id is required.';

  const { data, error } = await supabase
    .from('schedule_slots')
    .select('*')
    .eq('clinic_id', ctx.clinicId)
    .eq('week_start', ctx.weekStart)
    .eq('doctor_id', doctorId)
    .order('day_of_week')
    .order('period');

  if (error) return `Error: ${error.message}`;
  if (!data || data.length === 0) {
    return `Doctor ${doctorId} has no slots in week ${ctx.weekStart}.`;
  }

  const doctorName = data[0].doctor_name;
  const lines = [
    `Schedule for ${doctorName} [${doctorId}] in week ${ctx.weekStart}:`,
  ];
  for (const s of data) {
    const periodLabel = s.period === 0 ? 'EX' : `P${s.period}`;
    const roleLabel =
      s.role === 'delegator' ? 'DLG' : `CL${s.clinic_number}`;
    lines.push(
      `- ${s.day_of_week} ${periodLabel} ${roleLabel} (${s.status})`,
    );
  }
  return lines.join('\n');
}
