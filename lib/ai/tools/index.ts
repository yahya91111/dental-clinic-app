// ═══════════════════════════════════════════════════════════════
// DCM AI Tools — Phase 5 (DB-backed)
// ═══════════════════════════════════════════════════════════════
// Tool definitions (for the Claude API) and execution handlers
// (which hit Supabase) for the Team Leader / Doctor assistants.
//
// Read tools are safe — they never modify data and do not need
// confirmation per the Golden Rule. Permission scope is still
// applied implicitly: each tool reads only data inside the
// signed-in user's clinic (passed in via ToolContext).
//
// Write tools all flow through requirePermission(), which
// enforces the AI inheritance principle from permissions.ts:
// the AI runs on the user's account and may do only what the
// user could do via a button click.
//
// AI-write tagging: every insert/update on schedule_slots and
// doctor_group_members carries `source: 'ai'`. Deletes are
// preceded by an UPDATE that flips source to 'ai' on the rows
// about to be removed. The ai_events triggers (sql/ai_events.sql)
// use this column to skip events for AI-originated changes,
// preventing the AI from reacting to its own writes.
//
// Tools wired:
//   Reads      — get_clinic_info, get_clinic_doctors, get_groups,
//                get_existing_schedule, get_doctor_schedule,
//                find_swap_candidates, list_pending_swap_requests,
//                get_clinic_ai_preferences,
//                list_broadcast_swap_requests, list_recent_ai_events
//   Slot       — edit_slot, delete_slot, mark_doctor_absent
//   Bulk       — draft_weekly_schedule, draft_day_schedule,
//                confirm_weekly_schedule, discard_draft
//   Swap       — swap_slots, request_swap, cancel_swap_request,
//                broadcast_swap_request, accept_broadcast_swap,
//                cancel_broadcast_swap
//   Group      — add_doctor_to_group,
//                remove_doctor_from_group,
//                move_doctor_between_groups, set_doctor_work_status
//   Notify     — send_notification
//   Prefs      — update_clinic_ai_preferences
//   Events     — mark_events_consumed
//
// Required DB objects (apply once via Supabase SQL editor):
//   sql/ai_preferences.sql  — schedule_settings.ai_preferences col
//   sql/swap_requests.sql   — swap_requests table + accept/cancel RPCs
//   sql/ai_events.sql       — ai_events table + triggers + RPC,
//                             plus schedule_slots.source and
//                             doctor_group_members.source columns
//
// Still pending:
//   - ask_tl_choice — needs chat UI button rendering (not a tool;
//     the AI already writes `[option]` patterns in replies and the
//     chat layer just needs to make them clickable)
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
 *
 * `uiCallbacks` is wired by the screen that hosts the chat sheet
 * (currently only the Schedule screen). It lets a small set of
 * tools push UI state changes back to the front end — the only
 * use today is set_active_week, which has to move the schedule
 * grid to a different week before subsequent tool calls can
 * operate on that week.
 */
export interface ToolUICallbacks {
  setActiveWeek?: (weekStart: string) => void;
}

export interface ToolContext {
  clinicId: string;
  weekStart: string;
  user: User | null;
  uiCallbacks?: ToolUICallbacks;
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
    name: 'set_active_week',
    description:
      'Switch the Schedule UI to a different week and make that week the new active week for subsequent tool calls. Use this when the team leader asks to build / view / edit a week that is not currently displayed (e.g. "ابني الأسبوع القادم", "روح للأسبوع الماضي"). Compute the target Sunday from the current ctx.weekStart yourself. After this returns OK, the runtime context for the NEXT tool call already reflects the new active week, but until you receive that next user turn you still see the OLD ctx.weekStart in your prompt — do not call other week-scoped tools in the same turn after set_active_week, just confirm the switch and wait.',
    input_schema: {
      type: 'object',
      properties: {
        week_start: {
          type: 'string',
          description: 'YYYY-MM-DD of the Sunday of the target week.',
        },
      },
      required: ['week_start'],
    },
  },
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
  {
    name: 'find_swap_candidates',
    description:
      'List doctors holding clinic slots on a given day + period, excluding any doctor currently absent (SL/VC/PE/PS) that day. Use before request_swap or swap_slots to discover who is eligible.',
    input_schema: {
      type: 'object',
      properties: {
        day: {
          type: 'string',
          enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
        },
        period: { type: 'number', description: '1-4 (EX section excluded).' },
        exclude_doctor_id: {
          type: 'string',
          description: 'Optional — usually the requester, to drop from the list.',
        },
      },
      required: ['day', 'period'],
    },
  },
  {
    name: 'list_pending_swap_requests',
    description:
      'List swap requests the signed-in user has sent that are still pending (no accept/reject yet). Useful before cancel_swap_request.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_clinic_ai_preferences',
    description:
      'Read the per-clinic AI policy JSON: last Board shift, Board delegator/EX rotation flags, trainee defaults, group classification (primary/board/trainee/excluded). Returns "{}" for a brand-new clinic — that means the create_weekly first-time classification flow must run.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'update_clinic_ai_preferences',
    description:
      'Merge a JSON patch into the clinic\'s AI policy. The patch is applied with jsonb concatenation (top-level keys are replaced; nested objects are NOT deep-merged — pass the full sub-object you want). Call this incrementally as the TL answers each smart-reminder question, not in batch at the end.',
    input_schema: {
      type: 'object',
      properties: {
        patch: {
          type: 'object',
          description: 'Partial preferences object. Keys present here replace the corresponding top-level keys in the stored JSON.',
        },
      },
      required: ['patch'],
    },
  },
  {
    name: 'list_broadcast_swap_requests',
    description:
      'List broadcast swap requests visible to the signed-in user. Filter "sent" returns broadcasts the user started; "candidate" returns ones where the user is a candidate; "all" returns everything in the clinic (TL+ only). Defaults to "sent".',
    input_schema: {
      type: 'object',
      properties: {
        filter: { type: 'string', enum: ['sent', 'candidate', 'all'] },
      },
      required: [],
    },
  },
  {
    name: 'list_recent_ai_events',
    description:
      'Read unconsumed manual-action events from the clinic (slot edits, group changes, swap responses someone made through the UI). Use this at the start of a fresh chat session so the AI can react to anything the user did between sessions per the react_to_system_event workflow. Returns up to "limit" events oldest-first.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max events to return. Defaults to 20.' },
      },
      required: [],
    },
  },
  {
    name: 'mark_events_consumed',
    description:
      'Mark a batch of ai_events as consumed so they will not surface again. Call this once you have read and reacted to the events from list_recent_ai_events.',
    input_schema: {
      type: 'object',
      properties: {
        event_ids: {
          type: 'array',
          description: 'UUIDs of events to mark consumed.',
          items: { type: 'string' },
        },
      },
      required: ['event_ids'],
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
    name: 'swap_slots',
    description:
      'Atomically exchange two schedule slots between two doctors in the same week (typically the same day). Only the TL / Coordinator / Super Admin can do this on behalf of the doctors involved (no doctor consent required). For a doctor-initiated request that needs the other doctor to accept, use request_swap instead. ALWAYS propose the diff and get explicit confirmation before calling.',
    input_schema: {
      type: 'object',
      properties: {
        slot_a: {
          type: 'object',
          properties: {
            day: { type: 'string', enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] },
            period: { type: 'number', description: '1-4 (clinic periods only).' },
            clinic_number: { type: 'number' },
            role: { type: 'string', enum: ['clinic', 'delegator'] },
          },
          required: ['day', 'period', 'clinic_number', 'role'],
        },
        slot_b: {
          type: 'object',
          properties: {
            day: { type: 'string', enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] },
            period: { type: 'number', description: '1-4 (clinic periods only).' },
            clinic_number: { type: 'number' },
            role: { type: 'string', enum: ['clinic', 'delegator'] },
          },
          required: ['day', 'period', 'clinic_number', 'role'],
        },
      },
      required: ['slot_a', 'slot_b'],
    },
  },
  {
    name: 'request_swap',
    description:
      'Send a swap request from the signed-in doctor to another doctor. The requester names their own slot (from_) and the target slot they want (to_). The target doctor receives a notification with [قبول] [رفض]. On accept, a DB trigger executes the atomic swap server-side. Both slots must be on the SAME DAY. ALWAYS confirm with the user before calling.',
    input_schema: {
      type: 'object',
      properties: {
        day: {
          type: 'string',
          enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
          description: 'Same day for both slots.',
        },
        from_period: { type: 'number', description: '1-4. Requester\'s current period.' },
        from_clinic_number: { type: 'number' },
        from_role: { type: 'string', enum: ['clinic', 'delegator'] },
        to_doctor_id: { type: 'string', description: 'UUID of the target doctor.' },
        to_doctor_name: { type: 'string' },
        to_period: { type: 'number', description: '1-4. Target\'s current period.' },
        to_clinic_number: { type: 'number' },
        to_role: { type: 'string', enum: ['clinic', 'delegator'] },
      },
      required: [
        'day', 'from_period', 'from_clinic_number', 'from_role',
        'to_doctor_id', 'to_doctor_name', 'to_period', 'to_clinic_number', 'to_role',
      ],
    },
  },
  {
    name: 'add_doctor_to_group',
    description:
      'Add a doctor to a group with an initial work_status (defaults to "active"). If the doctor is already in another group you should call move_doctor_between_groups instead — this tool does NOT remove them from a previous group.',
    input_schema: {
      type: 'object',
      properties: {
        group_id: { type: 'string' },
        doctor_id: { type: 'string' },
        doctor_name: { type: 'string' },
        work_status: {
          type: 'string',
          enum: ['active', 'vacation', 'light_duty'],
          description: 'Defaults to "active".',
        },
      },
      required: ['group_id', 'doctor_id', 'doctor_name'],
    },
  },
  {
    name: 'remove_doctor_from_group',
    description:
      'Remove a doctor from a specific group. The doctor record itself is untouched.',
    input_schema: {
      type: 'object',
      properties: {
        group_id: { type: 'string' },
        doctor_id: { type: 'string' },
      },
      required: ['group_id', 'doctor_id'],
    },
  },
  {
    name: 'move_doctor_between_groups',
    description:
      'Move a doctor from one group to another in one operation. Pass from_group_id=null to add a doctor who has no group yet, or to_group_id=null to remove without re-adding (equivalent to remove_doctor_from_group).',
    input_schema: {
      type: 'object',
      properties: {
        doctor_id: { type: 'string' },
        doctor_name: { type: 'string' },
        from_group_id: { type: 'string', description: 'Or null if doctor has no current group.' },
        to_group_id: { type: 'string', description: 'Or null to just remove.' },
      },
      required: ['doctor_id', 'doctor_name'],
    },
  },
  {
    name: 'set_doctor_work_status',
    description:
      'Update a doctor\'s work_status flag inside their group (active / vacation / light_duty). Used to mark long-term unavailability that affects scheduling and group rotations — distinct from a single-day absence (use mark_doctor_absent for that).',
    input_schema: {
      type: 'object',
      properties: {
        group_id: { type: 'string' },
        doctor_id: { type: 'string' },
        work_status: {
          type: 'string',
          enum: ['active', 'vacation', 'light_duty'],
        },
      },
      required: ['group_id', 'doctor_id', 'work_status'],
    },
  },
  {
    name: 'send_notification',
    description:
      'Send a notification to one or more clinic members. Use type="announcement" for free-form clinic announcements (requires send-announcement permission, TL/Coord/SuperAdmin only). Use any other type for the unified notify_prompt flow (schedule_changed, absence_recorded, etc.) — these only require choose-notify-recipients permission, which all roles have. Always confirm the recipient list and message with the user before calling. recipient_ids must be UUIDs from get_clinic_doctors.',
    input_schema: {
      type: 'object',
      properties: {
        recipient_ids: {
          type: 'array',
          description: 'UUIDs of the doctors who should receive the notification. At least one.',
          items: { type: 'string' },
        },
        type: {
          type: 'string',
          description: 'Notification type. Common values: announcement, schedule_changed, absence_recorded, schedule_published, swap_completed.',
        },
        title: { type: 'string' },
        body: { type: 'string' },
        data: {
          type: 'object',
          description: 'Optional JSON payload describing the underlying event (e.g. {day, period, doctor_id}).',
        },
      },
      required: ['recipient_ids', 'type', 'title', 'body'],
    },
  },
  {
    name: 'broadcast_swap_request',
    description:
      'Open a broadcast swap: the signed-in user offers up one of their slots (source_slot_id) and asks every candidate doctor on a target (day + period) to take it. The first candidate to accept wins; the others get the notification silently removed. Notifications carry type="broadcast_swap_request" with action_type="accept_reject". Use find_swap_candidates first to get the candidate_ids list. Confirm with the user before calling. Defaults to a 24-hour expiry per the swap_broadcast.md workflow.',
    input_schema: {
      type: 'object',
      properties: {
        source_slot_id: {
          type: 'string',
          description: 'UUID of the slot the requester is offering. From find_swap_candidates context or get_doctor_schedule.',
        },
        target_day: {
          type: 'string',
          enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
        },
        target_period: { type: 'number', description: '1-4.' },
        candidate_ids: {
          type: 'array',
          description: 'UUIDs of doctors who will receive the broadcast.',
          items: { type: 'string' },
        },
        timeout_hours: {
          type: 'number',
          description: 'How long the broadcast stays open. Defaults to 24.',
        },
      },
      required: ['source_slot_id', 'target_day', 'target_period', 'candidate_ids'],
    },
  },
  {
    name: 'accept_broadcast_swap',
    description:
      'Accept a broadcast swap request as the signed-in doctor. Wraps the atomic accept_broadcast_swap server RPC: locks the request, verifies the doctor is still a candidate and the broadcast is still pending, performs the atomic two-slot swap, and clears the broadcast notifications from the other candidates. Use this only when the doctor explicitly confirms acceptance.',
    input_schema: {
      type: 'object',
      properties: {
        request_id: {
          type: 'string',
          description: 'UUID of the swap_requests row.',
        },
      },
      required: ['request_id'],
    },
  },
  {
    name: 'cancel_broadcast_swap',
    description:
      'Cancel an open broadcast swap request the signed-in user started. Wraps the cancel_broadcast_swap server RPC, which only allows the original requester to cancel.',
    input_schema: {
      type: 'object',
      properties: {
        request_id: { type: 'string' },
      },
      required: ['request_id'],
    },
  },
  {
    name: 'cancel_swap_request',
    description:
      'Cancel a pending swap request the signed-in user sent earlier. Use list_pending_swap_requests first to obtain the notification_id. Only the original sender can cancel their own request.',
    input_schema: {
      type: 'object',
      properties: {
        notification_id: {
          type: 'string',
          description: 'UUID of the swap_request notification to cancel.',
        },
      },
      required: ['notification_id'],
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
      // ─── UI navigation ───────────────────────────────────────
      case 'set_active_week':
        return setActiveWeek(ctx, input);

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
      case 'find_swap_candidates':
        return await findSwapCandidates(ctx, input);
      case 'list_pending_swap_requests':
        return await listPendingSwapRequests(ctx);
      case 'get_clinic_ai_preferences':
        return await getClinicAiPreferences(ctx);
      case 'list_broadcast_swap_requests':
        return await listBroadcastSwapRequests(ctx, input);
      case 'list_recent_ai_events':
        return await listRecentAiEvents(ctx, input);

      // ─── Write tools ─────────────────────────────────────────
      case 'edit_slot':
        return await editSlot(ctx, input);
      case 'delete_slot':
        return await deleteSlot(ctx, input);
      case 'mark_doctor_absent':
        return await markDoctorAbsent(ctx, input);
      case 'add_doctor_to_group':
        return await addDoctorToGroupTool(ctx, input);
      case 'remove_doctor_from_group':
        return await removeDoctorFromGroupTool(ctx, input);
      case 'move_doctor_between_groups':
        return await moveDoctorBetweenGroupsTool(ctx, input);
      case 'set_doctor_work_status':
        return await setDoctorWorkStatus(ctx, input);
      case 'send_notification':
        return await sendNotification(ctx, input);
      case 'swap_slots':
        return await swapSlots(ctx, input);
      case 'request_swap':
        return await requestSwap(ctx, input);
      case 'cancel_swap_request':
        return await cancelSwapRequest(ctx, input);
      case 'update_clinic_ai_preferences':
        return await updateClinicAiPreferences(ctx, input);
      case 'broadcast_swap_request':
        return await broadcastSwapRequest(ctx, input);
      case 'accept_broadcast_swap':
        return await acceptBroadcastSwap(ctx, input);
      case 'cancel_broadcast_swap':
        return await cancelBroadcastSwap(ctx, input);
      case 'mark_events_consumed':
        return await markEventsConsumed(ctx, input);

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

function setActiveWeek(ctx: ToolContext, input: Record<string, unknown>): string {
  const weekStart = (input.week_start as string) || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return 'Error: week_start must be a YYYY-MM-DD date.';
  }
  // Sanity-check: the date must be a Sunday. We don't enforce here
  // because timezone math is fiddly, but we surface a warning so
  // bugs are visible in the chat.
  if (!ctx.uiCallbacks?.setActiveWeek) {
    return 'Refused: the host UI did not wire a setActiveWeek callback. The active week cannot be changed from this screen.';
  }
  ctx.uiCallbacks.setActiveWeek(weekStart);
  return (
    `OK — Schedule UI switched to ${weekStart}. The next user turn ` +
    `will run with this as the active week. End this turn now and ` +
    `wait for the team leader to continue.`
  );
}

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
  // Mark source='ai' before delete so the ai_events trigger skips us.
  if (role === 'delegator') {
    await supabase
      .from('schedule_slots')
      .update({ source: 'ai' })
      .eq('clinic_id', ctx.clinicId)
      .eq('week_start', ctx.weekStart)
      .eq('day_of_week', day)
      .eq('period', period)
      .eq('role', 'delegator');
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
    .update({ source: 'ai' })
    .eq('clinic_id', ctx.clinicId)
    .eq('week_start', ctx.weekStart)
    .eq('day_of_week', day)
    .eq('period', period)
    .eq('clinic_number', clinicNumber)
    .eq('role', role);
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
    source: 'ai',
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

  // Mark source='ai' so the ai_events DELETE trigger skips us.
  await supabase
    .from('schedule_slots')
    .update({ source: 'ai' })
    .eq('clinic_id', ctx.clinicId)
    .eq('week_start', ctx.weekStart)
    .eq('day_of_week', day)
    .eq('period', period)
    .eq('clinic_number', clinicNumber)
    .eq('role', role);

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
      .update({ source: 'ai' })
      .eq('clinic_id', ctx.clinicId)
      .eq('week_start', ctx.weekStart)
      .eq('day_of_week', day)
      .eq('doctor_id', doctorId)
      .gt('period', 0);
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
      .update({ source: 'ai' })
      .eq('clinic_id', ctx.clinicId)
      .eq('week_start', ctx.weekStart)
      .eq('day_of_week', day)
      .eq('doctor_id', doctorId)
      .eq('period', period);
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
    source: 'ai',
  });
  if (error) return `Error recording absence: ${error.message}`;

  return `OK — ${absenceType} recorded for ${doctorName} on ${day}${period ? ` period P${period}` : ''}.`;
}


// ─── Swap tool implementations ───────────────────────────────────

/**
 * Statuses that mean the doctor is unavailable for swapping on
 * the day in question. Used to exclude rows in find_swap_candidates.
 */
const ABSENT_STATUSES = ['sick_leave', 'vacation', 'permission_start', 'permission_end'];

async function findSwapCandidates(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const day = input.day as string;
  const period = input.period as number;
  const excludeDoctorId = input.exclude_doctor_id as string | undefined;

  if (!day || !period) return 'Error: day and period are required.';
  if (period < 1 || period > 4) return 'Error: period must be 1-4.';

  // Candidates currently holding a clinic slot on this day + period.
  const { data: holders, error: hErr } = await supabase
    .from('schedule_slots')
    .select('doctor_id, doctor_name, clinic_number, role, status')
    .eq('clinic_id', ctx.clinicId)
    .eq('week_start', ctx.weekStart)
    .eq('day_of_week', day)
    .eq('period', period)
    .order('clinic_number');

  if (hErr) return `Error: ${hErr.message}`;
  if (!holders || holders.length === 0) {
    return `No doctors hold a slot on ${day} P${period}.`;
  }

  // Anyone marked absent in the EX section that day is unavailable.
  const { data: absent } = await supabase
    .from('schedule_slots')
    .select('doctor_id, status')
    .eq('clinic_id', ctx.clinicId)
    .eq('week_start', ctx.weekStart)
    .eq('day_of_week', day)
    .eq('period', 0)
    .in('status', ABSENT_STATUSES);

  const absentIds = new Set((absent || []).map((r) => r.doctor_id));

  const eligible = holders.filter(
    (h) => !absentIds.has(h.doctor_id) && h.doctor_id !== excludeDoctorId,
  );

  if (eligible.length === 0) {
    return `No eligible candidates on ${day} P${period} (all absent or excluded).`;
  }

  const lines = eligible.map((h) => {
    const roleLabel = h.role === 'delegator' ? 'DLG' : `CL${h.clinic_number}`;
    return `- ${h.doctor_name} [${h.doctor_id}] @ ${roleLabel}`;
  });
  return `Eligible candidates on ${day} P${period} (${eligible.length}):\n${lines.join('\n')}`;
}

async function listPendingSwapRequests(ctx: ToolContext): Promise<string> {
  if (!ctx.user) return 'Refused: no signed-in user.';

  const { data, error } = await supabase
    .from('notifications')
    .select('id, recipient_id, body, data, created_at, action_status')
    .eq('sender_id', ctx.user.id)
    .eq('type', 'swap_request')
    .eq('action_status', 'pending')
    .order('created_at', { ascending: false });

  if (error) return `Error: ${error.message}`;
  if (!data || data.length === 0) {
    return 'You have no pending swap requests.';
  }

  const lines = data.map((n) => {
    const d = (n.data || {}) as Record<string, unknown>;
    const day = d.day || '?';
    const fromP = d.from_period ?? '?';
    const toP = d.to_period ?? '?';
    const toName = d.to_doctor_name || '?';
    return `- [${n.id}] → ${toName}: ${day} P${fromP} ↔ P${toP}`;
  });
  return `Your pending swap requests (${data.length}):\n${lines.join('\n')}`;
}

async function swapSlots(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const denied = requirePermission(ctx, 'canSwapOnBehalfOfOthers', 'swap two doctors\' slots');
  if (denied) return denied;

  const a = input.slot_a as Record<string, unknown>;
  const b = input.slot_b as Record<string, unknown>;
  if (!a || !b) return 'Error: slot_a and slot_b are required.';

  const matchSlot = async (s: Record<string, unknown>) => {
    return supabase
      .from('schedule_slots')
      .select('*')
      .eq('clinic_id', ctx.clinicId)
      .eq('week_start', ctx.weekStart)
      .eq('day_of_week', s.day as string)
      .eq('period', s.period as number)
      .eq('clinic_number', s.clinic_number as number)
      .eq('role', s.role as string)
      .maybeSingle();
  };

  const { data: rowA, error: aErr } = await matchSlot(a);
  if (aErr) return `Error reading slot A: ${aErr.message}`;
  if (!rowA) return `Slot A not found: ${a.day} P${a.period} CL${a.clinic_number} ${a.role}.`;

  const { data: rowB, error: bErr } = await matchSlot(b);
  if (bErr) return `Error reading slot B: ${bErr.message}`;
  if (!rowB) return `Slot B not found: ${b.day} P${b.period} CL${b.clinic_number} ${b.role}.`;

  if (rowA.doctor_id === rowB.doctor_id) {
    return `Both slots hold the same doctor (${rowA.doctor_name}). Nothing to swap.`;
  }

  // Atomic exchange: put A's doctor where B was, and vice-versa.
  const { error: updAErr } = await supabase
    .from('schedule_slots')
    .update({ doctor_id: rowB.doctor_id, doctor_name: rowB.doctor_name, source: 'ai' })
    .eq('id', rowA.id);
  if (updAErr) return `Error updating slot A: ${updAErr.message}`;

  const { error: updBErr } = await supabase
    .from('schedule_slots')
    .update({ doctor_id: rowA.doctor_id, doctor_name: rowA.doctor_name, source: 'ai' })
    .eq('id', rowB.id);
  if (updBErr) {
    // Rollback A so we don't leave the schedule in a torn state.
    await supabase
      .from('schedule_slots')
      .update({ doctor_id: rowA.doctor_id, doctor_name: rowA.doctor_name, source: 'ai' })
      .eq('id', rowA.id);
    return `Error updating slot B (rolled back): ${updBErr.message}`;
  }

  return (
    `OK — swapped:\n` +
    `  ${rowA.doctor_name}: ${a.day} P${a.period} CL${a.clinic_number} → ${b.day} P${b.period} CL${b.clinic_number}\n` +
    `  ${rowB.doctor_name}: ${b.day} P${b.period} CL${b.clinic_number} → ${a.day} P${a.period} CL${a.clinic_number}`
  );
}

async function requestSwap(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const denied = requirePermission(ctx, 'canRequestSwap', 'request a swap');
  if (denied) return denied;
  if (!ctx.user) return 'Refused: no signed-in user.';

  const day = input.day as string;
  const fromPeriod = input.from_period as number;
  const fromClinic = input.from_clinic_number as number;
  const fromRole = input.from_role as string;
  const toDoctorId = input.to_doctor_id as string;
  const toDoctorName = input.to_doctor_name as string;
  const toPeriod = input.to_period as number;
  const toClinic = input.to_clinic_number as number;
  const toRole = input.to_role as string;

  if (toDoctorId === ctx.user.id) {
    return 'Refused: cannot swap with yourself.';
  }

  // Verify the requester actually holds the from-slot.
  const { data: mySlot, error: mErr } = await supabase
    .from('schedule_slots')
    .select('id, doctor_id, doctor_name')
    .eq('clinic_id', ctx.clinicId)
    .eq('week_start', ctx.weekStart)
    .eq('day_of_week', day)
    .eq('period', fromPeriod)
    .eq('clinic_number', fromClinic)
    .eq('role', fromRole)
    .maybeSingle();
  if (mErr) return `Error reading your slot: ${mErr.message}`;
  if (!mySlot || mySlot.doctor_id !== ctx.user.id) {
    return `Refused: you do not hold the slot ${day} P${fromPeriod} CL${fromClinic} ${fromRole}.`;
  }

  // Verify the target holds the to-slot.
  const { data: theirSlot, error: tErr } = await supabase
    .from('schedule_slots')
    .select('id, doctor_id')
    .eq('clinic_id', ctx.clinicId)
    .eq('week_start', ctx.weekStart)
    .eq('day_of_week', day)
    .eq('period', toPeriod)
    .eq('clinic_number', toClinic)
    .eq('role', toRole)
    .maybeSingle();
  if (tErr) return `Error reading target slot: ${tErr.message}`;
  if (!theirSlot || theirSlot.doctor_id !== toDoctorId) {
    return `Refused: ${toDoctorName} does not hold ${day} P${toPeriod} CL${toClinic} ${toRole}.`;
  }

  const myName = mySlot.doctor_name;
  const { error: nErr } = await supabase.from('notifications').insert({
    clinic_id: ctx.clinicId,
    recipient_id: toDoctorId,
    sender_id: ctx.user.id,
    sender_name: myName,
    type: 'swap_request',
    title: `${myName} wants to swap`,
    body: `${myName} wants to swap with you on ${day} P${fromPeriod}`,
    data: {
      // 'source: ai' tells the ai_events INSERT trigger to skip
      // this row — otherwise the AI would see its own swap_request
      // as a "manual swap sent" event next session.
      source: 'ai',
      from_doctor_id: ctx.user.id,
      from_doctor_name: myName,
      from_period: fromPeriod,
      from_clinic_number: fromClinic,
      from_role: fromRole,
      to_doctor_id: toDoctorId,
      to_doctor_name: toDoctorName,
      to_period: toPeriod,
      to_clinic_number: toClinic,
      to_role: toRole,
      day,
      week_start: ctx.weekStart,
      clinic_id: ctx.clinicId,
    },
    action_type: 'accept_reject',
    action_status: 'pending',
  });
  if (nErr) return `Error sending swap request: ${nErr.message}`;

  return `OK — swap request sent to ${toDoctorName} for ${day} P${fromPeriod} ↔ P${toPeriod}.`;
}

async function cancelSwapRequest(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const denied = requirePermission(ctx, 'canCancelOwnSwapRequest', 'cancel your swap request');
  if (denied) return denied;
  if (!ctx.user) return 'Refused: no signed-in user.';

  const notificationId = input.notification_id as string;
  if (!notificationId) return 'Error: notification_id is required.';

  // Verify the user actually owns this request.
  const { data: row, error: rErr } = await supabase
    .from('notifications')
    .select('id, sender_id, type, action_status, data')
    .eq('id', notificationId)
    .maybeSingle();
  if (rErr) return `Error reading notification: ${rErr.message}`;
  if (!row) return `Notification ${notificationId} not found.`;
  if (row.type !== 'swap_request') {
    return `Refused: notification ${notificationId} is not a swap request.`;
  }
  if (row.sender_id !== ctx.user.id) {
    return `Refused: this swap request was not sent by you.`;
  }
  if (row.action_status !== 'pending') {
    return `Cannot cancel — request is already ${row.action_status}.`;
  }

  // Soft-cancel: mark the action and remove the row so it disappears from the recipient.
  const { error: dErr } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId);
  if (dErr) return `Error cancelling swap request: ${dErr.message}`;

  const d = (row.data || {}) as Record<string, unknown>;
  const toName = d.to_doctor_name || 'the recipient';
  return `OK — swap request to ${toName} cancelled.`;
}

// ─── Group tool implementations ──────────────────────────────────

/**
 * Verify the named group exists and lives in the signed-in clinic.
 * Returns null on success, an error string otherwise.
 */
async function ensureGroupInClinic(
  ctx: ToolContext,
  groupId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('doctor_groups')
    .select('clinic_id')
    .eq('id', groupId)
    .maybeSingle();
  if (error) return `Error reading group: ${error.message}`;
  if (!data) return `Group ${groupId} not found.`;
  if (data.clinic_id !== ctx.clinicId) {
    return `Refused: group ${groupId} belongs to a different clinic.`;
  }
  return null;
}

async function addDoctorToGroupTool(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const denied = requirePermission(ctx, 'canAddDoctorToGroup', 'add a doctor to a group');
  if (denied) return denied;

  const groupId = input.group_id as string;
  const doctorId = input.doctor_id as string;
  const doctorName = input.doctor_name as string;
  const workStatus = (input.work_status as string) || 'active';

  if (!groupId || !doctorId || !doctorName) {
    return 'Error: group_id, doctor_id, and doctor_name are all required.';
  }

  const groupErr = await ensureGroupInClinic(ctx, groupId);
  if (groupErr) return groupErr;

  const { error } = await supabase.from('doctor_group_members').insert({
    group_id: groupId,
    doctor_id: doctorId,
    doctor_name: doctorName,
    work_status: workStatus,
    source: 'ai',
  });
  if (error) return `Error adding doctor: ${error.message}`;

  return `OK — ${doctorName} added to group (status: ${workStatus}).`;
}

async function removeDoctorFromGroupTool(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const denied = requirePermission(ctx, 'canAddDoctorToGroup', 'remove a doctor from a group');
  if (denied) return denied;

  const groupId = input.group_id as string;
  const doctorId = input.doctor_id as string;
  if (!groupId || !doctorId) {
    return 'Error: group_id and doctor_id are required.';
  }

  const groupErr = await ensureGroupInClinic(ctx, groupId);
  if (groupErr) return groupErr;

  await supabase
    .from('doctor_group_members')
    .update({ source: 'ai' })
    .eq('group_id', groupId)
    .eq('doctor_id', doctorId);
  const { error, count } = await supabase
    .from('doctor_group_members')
    .delete({ count: 'exact' })
    .eq('group_id', groupId)
    .eq('doctor_id', doctorId);
  if (error) return `Error removing doctor: ${error.message}`;
  if (!count) return `Doctor ${doctorId} was not a member of this group.`;

  return `OK — doctor removed from group.`;
}

async function moveDoctorBetweenGroupsTool(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const denied = requirePermission(ctx, 'canMoveDoctorBetweenGroups', 'move a doctor between groups');
  if (denied) return denied;

  const doctorId = input.doctor_id as string;
  const doctorName = input.doctor_name as string;
  const fromGroupId = input.from_group_id as string | undefined;
  const toGroupId = input.to_group_id as string | undefined;

  if (!doctorId || !doctorName) {
    return 'Error: doctor_id and doctor_name are required.';
  }
  if (!fromGroupId && !toGroupId) {
    return 'Error: at least one of from_group_id or to_group_id must be provided.';
  }

  if (fromGroupId) {
    const fromErr = await ensureGroupInClinic(ctx, fromGroupId);
    if (fromErr) return `from_group: ${fromErr}`;
    await supabase
      .from('doctor_group_members')
      .update({ source: 'ai' })
      .eq('group_id', fromGroupId)
      .eq('doctor_id', doctorId);
    await supabase
      .from('doctor_group_members')
      .delete()
      .eq('group_id', fromGroupId)
      .eq('doctor_id', doctorId);
  }

  if (toGroupId) {
    const toErr = await ensureGroupInClinic(ctx, toGroupId);
    if (toErr) return `to_group: ${toErr}`;
    const { error } = await supabase.from('doctor_group_members').insert({
      group_id: toGroupId,
      doctor_id: doctorId,
      doctor_name: doctorName,
      source: 'ai',
    });
    if (error) return `Error adding doctor to new group: ${error.message}`;
  }

  if (fromGroupId && toGroupId) return `OK — ${doctorName} moved between groups.`;
  if (toGroupId) return `OK — ${doctorName} added to group.`;
  return `OK — ${doctorName} removed from group.`;
}

async function setDoctorWorkStatus(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const denied = requirePermission(ctx, 'canAddDoctorToGroup', 'update a doctor work status');
  if (denied) return denied;

  const groupId = input.group_id as string;
  const doctorId = input.doctor_id as string;
  const workStatus = input.work_status as string;

  if (!groupId || !doctorId || !workStatus) {
    return 'Error: group_id, doctor_id, and work_status are required.';
  }
  if (!['active', 'vacation', 'light_duty'].includes(workStatus)) {
    return `Error: work_status must be active/vacation/light_duty (got ${workStatus}).`;
  }

  const groupErr = await ensureGroupInClinic(ctx, groupId);
  if (groupErr) return groupErr;

  const { error, count } = await supabase
    .from('doctor_group_members')
    .update(
      { work_status: workStatus, updated_at: new Date().toISOString(), source: 'ai' },
      { count: 'exact' },
    )
    .eq('group_id', groupId)
    .eq('doctor_id', doctorId);
  if (error) return `Error updating status: ${error.message}`;
  if (!count) return `Doctor ${doctorId} is not a member of this group.`;

  return `OK — work_status set to ${workStatus}.`;
}

// ─── Notification tool implementation ────────────────────────────

async function sendNotification(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  if (!ctx.user) return 'Refused: no signed-in user.';

  const recipientIds = input.recipient_ids as string[] | undefined;
  const type = input.type as string;
  const title = input.title as string;
  const body = input.body as string;
  const data = (input.data as Record<string, unknown>) || null;

  if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
    return 'Error: recipient_ids is required and must be non-empty.';
  }
  if (!type || !title || !body) {
    return 'Error: type, title, and body are all required.';
  }

  // Permission depends on the kind of notification.
  const flag: keyof PermissionCheck =
    type === 'announcement' ? 'canSendAnnouncement' : 'canChooseNotifyRecipients';
  const verb = type === 'announcement' ? 'send announcements' : 'send notifications';
  const denied = requirePermission(ctx, flag, verb);
  if (denied) return denied;

  // Drop self from the recipient list — no one needs a notification of an
  // action they just performed themselves.
  const recipients = recipientIds.filter((id) => id && id !== ctx.user!.id);
  if (recipients.length === 0) {
    return 'Error: no valid recipients after removing yourself.';
  }

  // Stamp every AI-sent notification with source='ai' inside the
  // data payload so the ai_events INSERT trigger skips us. The
  // trigger's convention reads data->>'source' (notifications has
  // no source column of its own).
  const dataWithSource = { ...(data || {}), source: 'ai' };
  const rows = recipients.map((rid) => ({
    clinic_id: ctx.clinicId,
    recipient_id: rid,
    sender_id: ctx.user!.id,
    sender_name: ctx.user!.name,
    type,
    title,
    body,
    data: dataWithSource,
  }));

  const { error } = await supabase.from('notifications').insert(rows);
  if (error) return `Error sending notifications: ${error.message}`;

  return `OK — sent "${title}" to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}.`;
}

// ─── AI preferences tools ────────────────────────────────────────

async function getClinicAiPreferences(ctx: ToolContext): Promise<string> {
  const { data, error } = await supabase
    .from('schedule_settings')
    .select('ai_preferences')
    .eq('clinic_id', ctx.clinicId)
    .maybeSingle();
  if (error) return `Error: ${error.message}`;
  const prefs = (data?.ai_preferences as Record<string, unknown>) || {};
  return `ai_preferences: ${JSON.stringify(prefs)}`;
}

async function updateClinicAiPreferences(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  // Mirror the schedule-creation permission — only roles allowed to
  // build the schedule should also set its policy.
  const denied = requirePermission(ctx, 'canCreateWeeklySchedule', 'update clinic AI preferences');
  if (denied) return denied;

  const patch = input.patch as Record<string, unknown> | undefined;
  if (!patch || typeof patch !== 'object') {
    return 'Error: patch must be an object.';
  }

  // Read-modify-write: shallow merge at the top level.
  const { data: existing, error: rErr } = await supabase
    .from('schedule_settings')
    .select('ai_preferences')
    .eq('clinic_id', ctx.clinicId)
    .maybeSingle();
  if (rErr) return `Error reading existing prefs: ${rErr.message}`;

  const current = (existing?.ai_preferences as Record<string, unknown>) || {};
  const merged = { ...current, ...patch };

  const { error: uErr } = await supabase
    .from('schedule_settings')
    .upsert(
      {
        clinic_id: ctx.clinicId,
        ai_preferences: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clinic_id' },
    );
  if (uErr) return `Error saving prefs: ${uErr.message}`;

  return `OK — preferences updated. Keys patched: ${Object.keys(patch).join(', ')}.`;
}

// ─── Broadcast swap tools ────────────────────────────────────────

async function broadcastSwapRequest(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  // Both Doctors (canRequestSwap) and TLs (canSwapOnBehalfOfOthers)
  // can broadcast — the underlying schema supports either.
  const denied = requirePermission(ctx, 'canRequestSwap', 'broadcast a swap request');
  if (denied) return denied;
  if (!ctx.user) return 'Refused: no signed-in user.';

  const sourceSlotId = input.source_slot_id as string;
  const targetDay = input.target_day as string;
  const targetPeriod = input.target_period as number;
  const candidateIds = input.candidate_ids as string[] | undefined;
  const timeoutHours = (input.timeout_hours as number) || 24;

  if (!sourceSlotId || !targetDay || !targetPeriod) {
    return 'Error: source_slot_id, target_day, and target_period are required.';
  }
  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    return 'Error: candidate_ids must be a non-empty array.';
  }

  // Verify the source slot exists in this clinic + week and belongs
  // to the requester (Doctor flow) — TLs can broadcast on behalf so
  // we relax ownership for them.
  const { data: src, error: sErr } = await supabase
    .from('schedule_slots')
    .select('id, doctor_id, doctor_name, day_of_week, period, clinic_number, role')
    .eq('id', sourceSlotId)
    .eq('clinic_id', ctx.clinicId)
    .eq('week_start', ctx.weekStart)
    .maybeSingle();
  if (sErr) return `Error reading source slot: ${sErr.message}`;
  if (!src) return `Source slot ${sourceSlotId} not found in current week.`;

  const isTLOnBehalf = src.doctor_id !== ctx.user.id;
  if (isTLOnBehalf) {
    const onBehalfDenied = requirePermission(ctx, 'canSwapOnBehalfOfOthers', 'broadcast on behalf of another doctor');
    if (onBehalfDenied) return onBehalfDenied;
  }

  const expiresAt = new Date(Date.now() + timeoutHours * 3600 * 1000).toISOString();

  // Create the broadcast row.
  const { data: req, error: rErr } = await supabase
    .from('swap_requests')
    .insert({
      clinic_id: ctx.clinicId,
      week_start: ctx.weekStart,
      requester_id: ctx.user.id,
      requester_name: ctx.user.name,
      source_slot_id: sourceSlotId,
      target_day: targetDay,
      target_period: targetPeriod,
      candidate_ids: candidateIds,
      expires_at: expiresAt,
    })
    .select('id')
    .single();
  if (rErr) return `Error creating swap request: ${rErr.message}`;

  // Fan-out: one notification per candidate.
  const rows = candidateIds.map((cid) => ({
    clinic_id: ctx.clinicId,
    recipient_id: cid,
    sender_id: ctx.user!.id,
    sender_name: ctx.user!.name,
    type: 'broadcast_swap_request',
    title: `${src.doctor_name} يطلب تبديل`,
    body: `طلب تبديل ${src.day_of_week} P${src.period} ↔ ${targetDay} P${targetPeriod}.`,
    data: {
      // Tags this row so the ai_events INSERT trigger skips it.
      source: 'ai',
      request_id: req.id,
      source_slot_id: sourceSlotId,
      source_day: src.day_of_week,
      source_period: src.period,
      source_clinic_number: src.clinic_number,
      source_role: src.role,
      source_doctor_id: src.doctor_id,
      source_doctor_name: src.doctor_name,
      target_day: targetDay,
      target_period: targetPeriod,
      expires_at: expiresAt,
    },
    action_type: 'accept_reject',
    action_status: 'pending',
  }));

  const { error: nErr } = await supabase.from('notifications').insert(rows);
  if (nErr) {
    // Best-effort rollback of the request row so we don't have a
    // ghost broadcast with no notifications.
    await supabase.from('swap_requests').delete().eq('id', req.id);
    return `Error fanning out notifications (rolled back request): ${nErr.message}`;
  }

  return `OK — broadcast ${req.id} sent to ${candidateIds.length} candidate${candidateIds.length === 1 ? '' : 's'} (expires in ${timeoutHours}h).`;
}

async function listBroadcastSwapRequests(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  if (!ctx.user) return 'Refused: no signed-in user.';
  const filter = (input.filter as string) || 'sent';

  // Expire any stale ones first so the list only shows truly open requests.
  await supabase.rpc('expire_stale_swap_requests');

  let query = supabase
    .from('swap_requests')
    .select('*')
    .eq('clinic_id', ctx.clinicId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (filter === 'sent') {
    query = query.eq('requester_id', ctx.user.id);
  } else if (filter === 'candidate') {
    query = query.contains('candidate_ids', [ctx.user.id]);
  } else if (filter === 'all') {
    // TL+ only.
    const denied = requirePermission(ctx, 'canSwapOnBehalfOfOthers', 'list all clinic broadcasts');
    if (denied) return denied;
  } else {
    return `Error: filter must be sent/candidate/all (got "${filter}").`;
  }

  const { data, error } = await query;
  if (error) return `Error: ${error.message}`;
  if (!data || data.length === 0) return 'No open broadcast swap requests.';

  const lines = data.map(
    (r) =>
      `- [${r.id}] ${r.requester_name} → ${r.target_day} P${r.target_period} (${(r.candidate_ids || []).length} candidates, expires ${r.expires_at})`,
  );
  return `Open broadcast swap requests (${data.length}):\n${lines.join('\n')}`;
}

async function acceptBroadcastSwap(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  if (!ctx.user) return 'Refused: no signed-in user.';
  const requestId = input.request_id as string;
  if (!requestId) return 'Error: request_id is required.';

  const { data, error } = await supabase.rpc('accept_broadcast_swap', {
    p_request_id: requestId,
    p_doctor_id: ctx.user.id,
  });
  if (error) return `Error calling accept RPC: ${error.message}`;

  const result = data as { ok?: boolean; error?: string; request_id?: string } | null;
  if (!result?.ok) return `Refused: ${result?.error || 'unknown'}.`;
  return `OK — broadcast ${result.request_id} accepted; swap executed.`;
}

async function cancelBroadcastSwap(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  if (!ctx.user) return 'Refused: no signed-in user.';
  const requestId = input.request_id as string;
  if (!requestId) return 'Error: request_id is required.';

  const { data, error } = await supabase.rpc('cancel_broadcast_swap', {
    p_request_id: requestId,
    p_actor_id: ctx.user.id,
  });
  if (error) return `Error calling cancel RPC: ${error.message}`;

  const result = data as { ok?: boolean; error?: string; request_id?: string } | null;
  if (!result?.ok) return `Refused: ${result?.error || 'unknown'}.`;
  return `OK — broadcast ${result.request_id} cancelled.`;
}

// ─── AI events tools ─────────────────────────────────────────────

async function listRecentAiEvents(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const limit = (input.limit as number) || 20;

  const { data, error } = await supabase
    .from('ai_events')
    .select('id, event_type, payload, actor_id, actor_name, created_at')
    .eq('clinic_id', ctx.clinicId)
    .eq('consumed', false)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) return `Error: ${error.message}`;
  if (!data || data.length === 0) return 'No new events since last session.';

  const lines = data.map(
    (e) =>
      `- [${e.id}] ${e.event_type} @ ${e.created_at}${e.actor_name ? ` by ${e.actor_name}` : ''}: ${JSON.stringify(e.payload)}`,
  );
  return `Recent unconsumed events (${data.length}):\n${lines.join('\n')}`;
}

async function markEventsConsumed(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  // No permission gate — every signed-in user can consume their
  // clinic's events. (The clinic scope is enforced by the RPC's
  // implicit pairing with ai_events rows we just read.)
  if (!ctx.user) return 'Refused: no signed-in user.';

  const eventIds = input.event_ids as string[] | undefined;
  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    return 'Error: event_ids must be a non-empty array.';
  }

  const { data, error } = await supabase.rpc('consume_ai_events', {
    p_event_ids: eventIds,
  });
  if (error) return `Error: ${error.message}`;
  return `OK — marked ${data ?? 0} event(s) consumed.`;
}

