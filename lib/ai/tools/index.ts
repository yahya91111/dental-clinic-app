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
import {
  User,
  PermissionCheck,
  getPermissions,
  canActOnClinic,
} from '../../../permissions';

/**
 * Context every tool receives. Filled in by the AI service from
 * the signed-in user's session.
 *
 * `user` is required for any write tool. Read tools work even
 * without it (they're scoped to clinicId anyway).
 */
export interface ToolContext {
  clinicId: string;
  weekStart: string;
  user: User | null;
}

/**
 * Gate a write tool by a boolean permission and the clinic scope.
 * Returns an error string if the check fails (the AI will read
 * it and decide what to tell the user); returns null on success.
 *
 * Per the AI permission inheritance principle in permissions.ts:
 * the AI runs on the user's account, inherits exactly the user's
 * permissions, and must wrap every write with these same checks
 * a button click would face.
 */
function requirePermission(
  ctx: ToolContext,
  flag: keyof PermissionCheck,
  description: string,
): string | null {
  if (!ctx.user) {
    return `Refused: no signed-in user; cannot ${description}.`;
  }
  const perms = getPermissions(ctx.user.role);
  if (!perms[flag]) {
    return `Refused: your role (${ctx.user.role}) does not have permission to ${description}.`;
  }
  if (!canActOnClinic(ctx.user, ctx.clinicId)) {
    return `Refused: you cannot act on this clinic (out of your scope).`;
  }
  return null;
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

// ─── Write tool definitions ──────────────────────────────────────

export const WRITE_TOOLS = [
  {
    name: 'edit_slot',
    description:
      'Add or replace a single schedule slot. Use period 0 to write into the EX section (clinic_number then means the EX side, 1 or 2). For delegator role, only one delegator can exist per period — calling this with role=delegator replaces the existing one. ALWAYS propose this to the TL and get explicit confirmation before calling.',
    input_schema: {
      type: 'object',
      properties: {
        day: {
          type: 'string',
          enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
        },
        period: {
          type: 'number',
          description: '1-4 for clinic periods, 0 for EX section.',
        },
        clinic_number: {
          type: 'number',
          description: '1-10 for clinic rooms, 1-2 for EX side.',
        },
        doctor_id: { type: 'string', description: 'UUID of the doctor.' },
        doctor_name: {
          type: 'string',
          description: 'Display name (use the exact name from get_clinic_doctors).',
        },
        role: { type: 'string', enum: ['clinic', 'delegator'] },
        status: {
          type: 'string',
          enum: [
            'active',
            'sick_leave',
            'permission_start',
            'permission_end',
            'vacation',
            'extra',
          ],
          description: 'Defaults to "active" if omitted.',
        },
      },
      required: ['day', 'period', 'clinic_number', 'doctor_id', 'doctor_name', 'role'],
    },
  },
  {
    name: 'delete_slot',
    description:
      'Remove a single schedule slot. Identify it by day + period + clinic_number + role. ALWAYS propose this to the TL and get explicit confirmation before calling.',
    input_schema: {
      type: 'object',
      properties: {
        day: {
          type: 'string',
          enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
        },
        period: { type: 'number', description: '0-4' },
        clinic_number: { type: 'number' },
        role: { type: 'string', enum: ['clinic', 'delegator'] },
      },
      required: ['day', 'period', 'clinic_number', 'role'],
    },
  },
  {
    name: 'mark_doctor_absent',
    description:
      'Record an absence for a doctor (PE, PS, SL, or VC). SL and VC automatically remove the doctor from all clinic slots on that day; PE/PS only affect their specific period. ALWAYS propose this and get explicit confirmation before calling (per submit_absence.md / mark_unavailable.md).',
    input_schema: {
      type: 'object',
      properties: {
        doctor_id: { type: 'string', description: 'UUID of the doctor.' },
        doctor_name: { type: 'string' },
        absence_type: {
          type: 'string',
          enum: ['PE', 'PS', 'SL', 'VC'],
          description:
            'PE = end-of-shift permission, PS = start-of-shift permission, SL = sick leave, VC = vacation.',
        },
        day: {
          type: 'string',
          enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
        },
        period: {
          type: 'number',
          description: 'Required for PE/PS (1-4). Ignored for SL/VC.',
        },
        ex_side: {
          type: 'number',
          enum: [1, 2],
          description: 'Which side of the EX section to place the entry (1 = right, 2 = left). Defaults to 1.',
        },
      },
      required: ['doctor_id', 'doctor_name', 'absence_type', 'day'],
    },
  },
];

export const ALL_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];

// ─── Execution handler ────────────────────────────────────────────

/**
 * Execute a tool (read or write) by name. Returns a plain-text
 * string that is fed back to the AI as the tool_result content.
 *
 * Errors are returned as strings (not thrown) so the AI can read
 * them and decide how to respond.
 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  try {
    switch (name) {
      // ─── Read tools ──────────────────────────────────────────
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

      // ─── Write tools ─────────────────────────────────────────
      case 'edit_slot':
        return await editSlot(ctx, input);
      case 'delete_slot':
        return await deleteSlot(ctx, input);
      case 'mark_doctor_absent':
        return await markDoctorAbsent(ctx, input);

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (error) {
    return `Tool error (${name}): ${error instanceof Error ? error.message : 'Unknown'}`;
  }
}

/** Backwards-compatible alias kept while the read-only callers
 * are still around. New code should use `executeTool`. */
export const executeReadTool = executeTool;

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

// ─── Write tool implementations ──────────────────────────────────

async function editSlot(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const denied = requirePermission(ctx, 'canEditScheduleSlot', 'edit a schedule slot');
  if (denied) return denied;

  const day = input.day as string;
  const period = input.period as number;
  const clinicNumber = input.clinic_number as number;
  const doctorId = input.doctor_id as string;
  const doctorName = input.doctor_name as string;
  const role = input.role as string;
  const status = (input.status as string) || 'active';

  // Delegator: only one per period — remove any existing one first.
  if (role === 'delegator') {
    await supabase
      .from('schedule_slots')
      .delete()
      .eq('clinic_id', ctx.clinicId)
      .eq('week_start', ctx.weekStart)
      .eq('day_of_week', day)
      .eq('period', period)
      .eq('role', 'delegator');
  }

  // Also replace any existing slot at the exact (day, period, clinic_number, role) coordinate.
  await supabase
    .from('schedule_slots')
    .delete()
    .eq('clinic_id', ctx.clinicId)
    .eq('week_start', ctx.weekStart)
    .eq('day_of_week', day)
    .eq('period', period)
    .eq('clinic_number', clinicNumber)
    .eq('role', role);

  const { error } = await supabase.from('schedule_slots').insert({
    clinic_id: ctx.clinicId,
    week_start: ctx.weekStart,
    day_of_week: day,
    period,
    clinic_number: clinicNumber,
    doctor_id: doctorId,
    doctor_name: doctorName,
    role,
    status,
  });
  if (error) return `Error inserting slot: ${error.message}`;

  const periodLabel = period === 0 ? 'EX' : `P${period}`;
  const roleLabel = role === 'delegator' ? 'DLG' : `CL${clinicNumber}`;
  return `OK — ${doctorName} placed at ${day} ${periodLabel} ${roleLabel} (status: ${status}).`;
}

async function deleteSlot(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const denied = requirePermission(ctx, 'canEditScheduleSlot', 'delete a schedule slot');
  if (denied) return denied;

  const day = input.day as string;
  const period = input.period as number;
  const clinicNumber = input.clinic_number as number;
  const role = input.role as string;

  const { error, count } = await supabase
    .from('schedule_slots')
    .delete({ count: 'exact' })
    .eq('clinic_id', ctx.clinicId)
    .eq('week_start', ctx.weekStart)
    .eq('day_of_week', day)
    .eq('period', period)
    .eq('clinic_number', clinicNumber)
    .eq('role', role);

  if (error) return `Error deleting slot: ${error.message}`;
  if (!count) {
    return `No slot found at ${day} period=${period} clinic=${clinicNumber} role=${role}. Nothing to delete.`;
  }
  const periodLabel = period === 0 ? 'EX' : `P${period}`;
  const roleLabel = role === 'delegator' ? 'DLG' : `CL${clinicNumber}`;
  return `OK — slot at ${day} ${periodLabel} ${roleLabel} deleted.`;
}

async function markDoctorAbsent(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  // Permission depends on whose absence this is.
  const doctorId = input.doctor_id as string;
  const isSelf = ctx.user?.id === doctorId;
  const flag = isSelf ? 'canSubmitOwnAbsence' : 'canMarkOtherDoctorAbsence';
  const denied = requirePermission(
    ctx,
    flag,
    isSelf ? 'submit your own absence' : "mark another doctor's absence",
  );
  if (denied) return denied;

  const doctorName = input.doctor_name as string;
  const absenceType = input.absence_type as 'PE' | 'PS' | 'SL' | 'VC';
  const day = input.day as string;
  const period = input.period as number | undefined;
  const exSide = (input.ex_side as number) || 1;

  const statusMap: Record<string, string> = {
    PE: 'permission_end',
    PS: 'permission_start',
    SL: 'sick_leave',
    VC: 'vacation',
  };
  const status = statusMap[absenceType];

  // SL / VC: remove the doctor from every clinic slot on that day.
  if (absenceType === 'SL' || absenceType === 'VC') {
    await supabase
      .from('schedule_slots')
      .delete()
      .eq('clinic_id', ctx.clinicId)
      .eq('week_start', ctx.weekStart)
      .eq('day_of_week', day)
      .eq('doctor_id', doctorId)
      .gt('period', 0);
  } else if (absenceType === 'PE' || absenceType === 'PS') {
    // PE / PS: remove only the specific period the doctor was in.
    if (!period) {
      return `Error: period is required for ${absenceType}.`;
    }
    await supabase
      .from('schedule_slots')
      .delete()
      .eq('clinic_id', ctx.clinicId)
      .eq('week_start', ctx.weekStart)
      .eq('day_of_week', day)
      .eq('doctor_id', doctorId)
      .eq('period', period);
  }

  // Add the EX-section entry that records the absence.
  const { error } = await supabase.from('schedule_slots').insert({
    clinic_id: ctx.clinicId,
    week_start: ctx.weekStart,
    day_of_week: day,
    period: 0,
    clinic_number: exSide,
    doctor_id: doctorId,
    doctor_name: doctorName,
    role: 'clinic',
    status,
  });
  if (error) return `Error recording absence: ${error.message}`;

  return `OK — ${absenceType} recorded for ${doctorName} on ${day}${period ? ` period P${period}` : ''}.`;
}
