// ═══════════════════════════════════════════════════════════════
// AI Service Layer - Claude API Integration with Tool Use
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabase';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const getApiKey = () => process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '';

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  success: boolean;
  message: string;
  error?: string;
}

// Tools the AI can use
const AI_TOOLS = [
  // ═══ DAILY DUTY TOOLS ═══
  {
    name: 'assign_doctor',
    description: 'Assign a doctor to a clinic for a specific day and period',
    input_schema: {
      type: 'object',
      properties: {
        doctor_name: { type: 'string' },
        doctor_id: { type: 'string', description: 'UUID of the doctor' },
        day: { type: 'string', enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] },
        period: { type: 'number', description: '1-4' },
        clinic_number: { type: 'number', description: '1-10' },
        role: { type: 'string', enum: ['clinic', 'delegator'] },
      },
      required: ['doctor_name', 'doctor_id', 'day', 'period', 'clinic_number', 'role'],
    },
  },
  {
    name: 'remove_doctor',
    description: 'Remove a doctor from a specific slot',
    input_schema: {
      type: 'object',
      properties: {
        doctor_id: { type: 'string' },
        day: { type: 'string', enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] },
        period: { type: 'number', description: '1-4 or 0 for EX' },
      },
      required: ['doctor_id', 'day', 'period'],
    },
  },
  {
    name: 'set_doctor_ex',
    description: 'Set a doctor in EX section with a status. Auto-removes from clinics for SL/vacation/extra.',
    input_schema: {
      type: 'object',
      properties: {
        doctor_name: { type: 'string' },
        doctor_id: { type: 'string' },
        day: { type: 'string', enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] },
        status: { type: 'string', enum: ['sick_leave', 'permission_start', 'permission_end', 'vacation', 'extra'] },
        side: { type: 'number', enum: [1, 2], description: '1=right, 2=left' },
      },
      required: ['doctor_name', 'doctor_id', 'day', 'status', 'side'],
    },
  },
  {
    name: 'clear_day',
    description: 'Clear all schedule slots for a day',
    input_schema: {
      type: 'object',
      properties: {
        day: { type: 'string', enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] },
      },
      required: ['day'],
    },
  },
  {
    name: 'clear_week',
    description: 'Clear all schedule slots for the entire week',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'swap_doctors',
    description: 'Swap two doctors between their slots on the same day',
    input_schema: {
      type: 'object',
      properties: {
        doctor_a_id: { type: 'string' },
        doctor_b_id: { type: 'string' },
        day: { type: 'string', enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] },
      },
      required: ['doctor_a_id', 'doctor_b_id', 'day'],
    },
  },
  {
    name: 'copy_day',
    description: 'Copy schedule from one day to another',
    input_schema: {
      type: 'object',
      properties: {
        from_day: { type: 'string', enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] },
        to_day: { type: 'string', enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] },
      },
      required: ['from_day', 'to_day'],
    },
  },
  {
    name: 'set_clinic_count',
    description: 'Change the number of clinics',
    input_schema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: '1-10' },
      },
      required: ['count'],
    },
  },
  // ═══ DOCTOR GROUPS TOOLS ═══
  {
    name: 'create_group',
    description: 'Create a new doctor group',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Group name' },
        color_index: { type: 'number', description: '0=Blue, 1=Purple, 2=Green, 3=Orange, 4=Red, 5=Teal, 6=Pink, 7=Indigo' },
      },
      required: ['name'],
    },
  },
  {
    name: 'delete_group',
    description: 'Delete a doctor group. Doctors become unassigned.',
    input_schema: {
      type: 'object',
      properties: {
        group_id: { type: 'string', description: 'UUID of the group' },
      },
      required: ['group_id'],
    },
  },
  {
    name: 'rename_group',
    description: 'Rename a doctor group',
    input_schema: {
      type: 'object',
      properties: {
        group_id: { type: 'string' },
        new_name: { type: 'string' },
      },
      required: ['group_id', 'new_name'],
    },
  },
  {
    name: 'add_doctor_to_group',
    description: 'Add a doctor to a group',
    input_schema: {
      type: 'object',
      properties: {
        group_id: { type: 'string' },
        doctor_id: { type: 'string' },
        doctor_name: { type: 'string' },
      },
      required: ['group_id', 'doctor_id', 'doctor_name'],
    },
  },
  {
    name: 'remove_doctor_from_group',
    description: 'Remove a doctor from a group (becomes unassigned)',
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
    description: 'Move a doctor from one group to another',
    input_schema: {
      type: 'object',
      properties: {
        doctor_id: { type: 'string' },
        doctor_name: { type: 'string' },
        from_group_id: { type: 'string', description: 'Source group UUID (empty string if unassigned)' },
        to_group_id: { type: 'string', description: 'Target group UUID' },
      },
      required: ['doctor_id', 'doctor_name', 'from_group_id', 'to_group_id'],
    },
  },
  {
    name: 'set_doctor_work_status',
    description: 'Change a doctor work status in their group (active, vacation, light_duty)',
    input_schema: {
      type: 'object',
      properties: {
        group_id: { type: 'string' },
        doctor_id: { type: 'string' },
        work_status: { type: 'string', enum: ['active', 'vacation', 'light_duty'] },
      },
      required: ['group_id', 'doctor_id', 'work_status'],
    },
  },
];

const SYSTEM_PROMPT = `You are D.C.M Assistant - the AI brain of the D.C.M dental clinic management app.

YOUR IDENTITY:
You are 4 roles simultaneously - always active, always aware:

1. MANAGER (مدير مدبر): You make decisions, distribute schedules, organize groups, plan ahead. When action is needed - you act decisively.

2. MEDIATOR (وسيط): You balance workload fairly between doctors, resolve scheduling conflicts, handle swap requests diplomatically. You see both sides.

3. SUPERVISOR (مراقب): You monitor everything - empty clinics, missing delegators, overloaded doctors, rule violations. You alert proactively. Nothing escapes you.

4. ASSISTANT DOCTOR (طبيب مساعد): You help with clinical context when needed - patient history, treatment suggestions, workflow optimization.

CORE BEHAVIOR:
- You EXECUTE actions directly using tools. When asked to do something - DO IT. Don't just suggest.
- ALWAYS complete the ENTIRE task. NEVER stop halfway. NEVER skip anything.
- If you run out of space, continue in the next round. Never say "I'll stop here".
- Be concise in text but thorough in execution.
- Respond in the same language the user uses (Arabic or English).
- Use doctor UUIDs from the context data (provided in [brackets]).
- After executing, give a brief summary of what you did.

YOUR TOOLS:
Daily Duty: assign/remove doctors, set EX status, clear day/week, swap doctors, copy day to day, change clinic count
Doctor Groups: create/delete/rename groups, add/remove/move doctors between groups, change work status

SCHEDULE STRUCTURE:
- 5 work days: sunday, monday, tuesday, wednesday, thursday
- 4 periods: P1 (7:00-10:30), P2 (10:30-14:00), P3 (14:00-17:30), P4 (17:30-21:00)
- Multiple clinics (CL1, CL2, CL3...)
- Delegator (DLG): one per period
- EX section: sick_leave (SL), permission_start (PS), permission_end (PE), vacation (VC), extra (EX)

CLINIC WORK STRUCTURE:
- Work hours: 7:00 AM to 9:00 PM
- Divided into 2 shifts:
  * Morning shift: 7:00 AM - 2:00 PM (covers P1 + P2)
  * Evening shift: 2:00 PM - 9:00 PM (covers P3 + P4)
- Doctors are split into 2 groups based on shifts:
  * Group A: works one shift
  * Group B: works the other shift
- Which group works which shift (and rotation pattern) is decided PER CLINIC by the team leader via prompt templates.
  Example: "Group A works morning Sun-Mon, evening Tue-Thu. Group B is the opposite. Swap every week."
  The AI must follow whatever pattern the team leader defines.
- A doctor should NOT be assigned outside their group's shift unless explicitly requested.
- When distributing: always check which group each doctor belongs to before assigning.

DOCTOR TYPES:
- Permanent doctors: The core team. Always in Group A or Group B.
- Board doctors (أطباء بورد): Temporary specialists. They come for a period and leave. May or may not be present.
- Trainees (متدربين): Temporary learners. They come for a period and leave. May or may not be present.
- Board doctors and trainees can be in their own groups (e.g., "Board", "Trainees") or assigned to Group A/B.
- When distributing: if board/trainee groups exist and have doctors, include them. If the groups are empty, ignore them.
- Never assume board doctors or trainees exist. Always check the actual groups data.

CLINIC & WORKLOAD PRINCIPLES:
- Each clinic has a different number of clinics (2, 3, 4, 5, etc.) - check the actual data.
- CRITICAL PRINCIPLE: It is extremely exhausting for one doctor to work alone in a clinic for the entire shift (7 hours).
- Therefore, each clinic is split between 2 doctors per shift:
  * Doctor 1 works the first period of the shift (e.g., P1)
  * Doctor 2 works the second period of the shift (e.g., P2)
  * Same for evening: Doctor 3 works P3, Doctor 4 works P4
- This means each doctor works approximately 3.5 hours per period - a reasonable workload for one person.
- When distributing: ALWAYS assign 2 different doctors to each clinic per shift (one per period). Never assign one doctor to both P1 and P2 in the same clinic unless explicitly requested or there aren't enough doctors.
- The ideal distribution: each doctor works ONE period per shift (3.5 hours of clinic work).

DISTRIBUTION LOGIC:
- Example: 3 clinics need 6 doctors minimum per shift (2 per clinic).
- If 6 doctors available: 2 per clinic, no extras. Every doctor works.
- If 7 doctors available: 2 per clinic (6 total) + 1 extra (EX). The extra doctor comes to work but has no clinic responsibility - it's essentially a rest day.
- If 8 doctors available: 2 per clinic + 2 extras. And so on.
- General formula: extras = available doctors - (clinics × 2)

FAIRNESS PRINCIPLE (CRITICAL):
- The AI must distribute workload EQUALLY and FAIRLY across ALL doctors.
- This applies to: clinic work, delegator duty, AND extra days.
- Extra days must be distributed fairly - NOT always given to the same doctor.
- Fairness is NOT limited to one week. It spans across weeks:
  * If a doctor didn't get an extra day this week, they get priority next week.
  * Track who had extras previously and rotate fairly.
- Doctors who had sick leave (SL) or vacation (VC) are considered to have already had rest - factor this into fairness calculations.
- When distributing, the AI should think like a fair manager: "Who worked the most? Who deserves a break?"

ENERGY & WORKLOAD AWARENESS:
- The AI must consider each doctor's total workload across the week/month.
- A doctor who worked clinic duty every day deserves an extra day more than one who already had extras.
- Balance clinic periods, delegator duty, and extras across all doctors over time.

SHORTAGE HANDLING (fewer doctors than clinics × 2):
- Example: 3 clinics, need 6, but only have 5:
  * 2 clinics get 2 doctors each (one per period)
  * 1 clinic gets 1 doctor who works BOTH periods alone (auto-assign to both P1+P2 or P3+P4)
  * The doctor working alone must NOT be the same person every day. Rotate daily: today Dr. Mohammed works alone, tomorrow Dr. Ali, etc.

- If only 4 doctors for 3 clinics:
  * 1 clinic gets 2 doctors (one per period)
  * 2 clinics get 1 doctor each (working both periods alone)
  * Rotate fairly: the pair should NOT always be the same two doctors together. Mix it across days.

- If only 3 doctors for 3 clinics:
  * Each doctor works one clinic alone for both periods. No choice.

- IMPORTANT: When a doctor works alone in a clinic, AUTOMATICALLY assign their name to BOTH periods of that shift (e.g., both P1 and P2, or both P3 and P4).

- The fairness principle still applies in shortage: distribute the burden of working alone as equally as possible across doctors and days.

PERIOD ROTATION (FAIRNESS IN SHIFT TIMING):
- Within each shift there are 2 periods: early and late.
  * Morning shift: P1 (early, 7:00-10:30) and P2 (late, 10:30-14:00)
  * Evening shift: P3 (early, 14:00-17:30) and P4 (late, 17:30-21:00)
- The early period means the doctor starts first (arrives early, receives patients first).
- The late period means the doctor starts later (more comfortable).
- FAIRNESS RULE: Alternate each doctor between early and late periods across days.
  * Example: Dr. Mohammed → Sunday P1 (early), Monday P2 (late), Tuesday P1 (early)...
  * Don't put the same doctor always in the early period or always in the late period.
- The clinic number and partner can stay the same - but the period order must rotate.
- EXCEPTION - Light duty doctors (تخفيف عمل):
  * A doctor with light_duty status MUST ALWAYS be assigned to the FIRST period of each shift (P1 for morning, P3 for evening).
  * Reason: they leave work early due to medical reasons.
  * They NEVER get assigned to P2 or P4.
  * This is NOT unfair - it's a medical accommodation.

SCHEDULE RULES:
(Specific distribution rules, rotation patterns, and clinic-specific preferences are defined by the team leader via prompt templates in the app)
`;

/**
 * Execute a tool call from the AI
 */
async function executeTool(
  toolName: string,
  input: any,
  clinicId: string,
  weekStart: string,
): Promise<string> {
  try {
    switch (toolName) {
      case 'assign_doctor': {
        const { doctor_id, doctor_name, day, period, clinic_number, role } = input;
        const clinicNum = role === 'delegator' ? 0 : clinic_number;

        // For delegator: remove existing first
        if (role === 'delegator') {
          await supabase.from('schedule_slots').delete()
            .eq('clinic_id', clinicId).eq('week_start', weekStart)
            .eq('day_of_week', day).eq('period', period).eq('role', 'delegator');
        }

        const { error } = await supabase.from('schedule_slots').insert({
          clinic_id: clinicId, week_start: weekStart,
          day_of_week: day, period, clinic_number: clinicNum,
          doctor_id, doctor_name, role, status: 'active',
        });
        if (error) return `Error assigning ${doctor_name}: ${error.message}`;
        return `Assigned ${doctor_name} to ${role === 'delegator' ? 'DLG' : `CL${clinic_number}`} on ${day} P${period}`;
      }

      case 'remove_doctor': {
        const { doctor_id, day, period } = input;
        const { error } = await supabase.from('schedule_slots').delete()
          .eq('clinic_id', clinicId).eq('week_start', weekStart)
          .eq('day_of_week', day).eq('period', period).eq('doctor_id', doctor_id);
        if (error) return `Error removing doctor: ${error.message}`;
        return `Removed doctor from ${day} P${period}`;
      }

      case 'set_doctor_ex': {
        const { doctor_id, doctor_name, day, status, side } = input;
        // Remove from all clinic slots on this day
        if (status === 'sick_leave' || status === 'vacation' || status === 'extra') {
          await supabase.from('schedule_slots').delete()
            .eq('clinic_id', clinicId).eq('week_start', weekStart)
            .eq('day_of_week', day).eq('doctor_id', doctor_id).gt('period', 0);
        }
        // Add to EX
        const { error } = await supabase.from('schedule_slots').insert({
          clinic_id: clinicId, week_start: weekStart,
          day_of_week: day, period: 0, clinic_number: side,
          doctor_id, doctor_name, role: 'clinic', status,
        });
        if (error) return `Error setting EX: ${error.message}`;
        return `Set ${doctor_name} as ${status} on ${day}`;
      }

      case 'clear_day': {
        const { day } = input;
        const { error } = await supabase.from('schedule_slots').delete()
          .eq('clinic_id', clinicId).eq('week_start', weekStart)
          .eq('day_of_week', day);
        if (error) return `Error clearing ${day}: ${error.message}`;
        return `Cleared all slots for ${day}`;
      }

      case 'distribute_doctors': {
        return `Distribution requested for: ${input.days.join(', ')}. Use assign_doctor for each assignment.`;
      }

      case 'clear_week': {
        const { error } = await supabase.from('schedule_slots').delete()
          .eq('clinic_id', clinicId).eq('week_start', weekStart);
        if (error) return `Error clearing week: ${error.message}`;
        return `Cleared all slots for the entire week`;
      }

      case 'swap_doctors': {
        const { doctor_a_id, doctor_b_id, day } = input;
        // Get all slots for both doctors on this day
        const { data: slotsA } = await supabase.from('schedule_slots').select('*')
          .eq('clinic_id', clinicId).eq('week_start', weekStart)
          .eq('day_of_week', day).eq('doctor_id', doctor_a_id).gt('period', 0);
        const { data: slotsB } = await supabase.from('schedule_slots').select('*')
          .eq('clinic_id', clinicId).eq('week_start', weekStart)
          .eq('day_of_week', day).eq('doctor_id', doctor_b_id).gt('period', 0);
        if (!slotsA?.length && !slotsB?.length) return 'Neither doctor has slots on this day';
        // Swap: update A's slots to B, and B's slots to A
        const nameA = slotsA?.[0]?.doctor_name || '';
        const nameB = slotsB?.[0]?.doctor_name || '';
        for (const s of (slotsA || [])) {
          await supabase.from('schedule_slots').update({ doctor_id: doctor_b_id, doctor_name: nameB }).eq('id', s.id);
        }
        for (const s of (slotsB || [])) {
          await supabase.from('schedule_slots').update({ doctor_id: doctor_a_id, doctor_name: nameA }).eq('id', s.id);
        }
        return `Swapped ${nameA} and ${nameB} on ${day}`;
      }

      case 'copy_day': {
        const { from_day, to_day } = input;
        // Get source slots
        const { data: srcSlots } = await supabase.from('schedule_slots').select('*')
          .eq('clinic_id', clinicId).eq('week_start', weekStart).eq('day_of_week', from_day);
        if (!srcSlots?.length) return `No slots found on ${from_day}`;
        // Clear target day
        await supabase.from('schedule_slots').delete()
          .eq('clinic_id', clinicId).eq('week_start', weekStart).eq('day_of_week', to_day);
        // Copy slots
        const newSlots = srcSlots.map(s => ({
          clinic_id: clinicId, week_start: weekStart, day_of_week: to_day,
          period: s.period, clinic_number: s.clinic_number,
          doctor_id: s.doctor_id, doctor_name: s.doctor_name,
          role: s.role, status: s.status,
        }));
        const { error } = await supabase.from('schedule_slots').insert(newSlots);
        if (error) return `Error copying: ${error.message}`;
        return `Copied ${srcSlots.length} slots from ${from_day} to ${to_day}`;
      }

      case 'set_clinic_count': {
        const { count } = input;
        if (count < 1 || count > 10) return 'Clinic count must be 1-10';
        const { error } = await supabase.from('schedule_settings')
          .upsert({ clinic_id: clinicId, clinic_count: count, updated_at: new Date().toISOString() }, { onConflict: 'clinic_id' });
        if (error) return `Error: ${error.message}`;
        return `Clinic count set to ${count}`;
      }

      // ═══ DOCTOR GROUPS ═══
      case 'create_group': {
        const { name, color_index } = input;
        const { data: existing } = await supabase.from('doctor_groups').select('sort_order').eq('clinic_id', clinicId).order('sort_order', { ascending: false }).limit(1);
        const sortOrder = (existing?.[0]?.sort_order || 0) + 1;
        const { error } = await supabase.from('doctor_groups').insert({
          clinic_id: clinicId, name, color_index: color_index || 0, sort_order: sortOrder,
        });
        if (error) return `Error creating group: ${error.message}`;
        return `Created group "${name}"`;
      }

      case 'delete_group': {
        const { group_id } = input;
        const { error } = await supabase.from('doctor_groups').delete().eq('id', group_id);
        if (error) return `Error deleting group: ${error.message}`;
        return `Deleted group`;
      }

      case 'rename_group': {
        const { group_id, new_name } = input;
        const { error } = await supabase.from('doctor_groups').update({ name: new_name }).eq('id', group_id);
        if (error) return `Error renaming: ${error.message}`;
        return `Renamed group to "${new_name}"`;
      }

      case 'add_doctor_to_group': {
        const { group_id, doctor_id, doctor_name } = input;
        const { error } = await supabase.from('doctor_group_members').insert({
          group_id, doctor_id, doctor_name, work_status: 'active',
        });
        if (error) return `Error adding doctor: ${error.message}`;
        return `Added ${doctor_name} to group`;
      }

      case 'remove_doctor_from_group': {
        const { group_id, doctor_id } = input;
        const { error } = await supabase.from('doctor_group_members').delete()
          .eq('group_id', group_id).eq('doctor_id', doctor_id);
        if (error) return `Error removing: ${error.message}`;
        return `Removed doctor from group`;
      }

      case 'move_doctor_between_groups': {
        const { doctor_id, doctor_name, from_group_id, to_group_id } = input;
        if (from_group_id) {
          await supabase.from('doctor_group_members').delete()
            .eq('group_id', from_group_id).eq('doctor_id', doctor_id);
        }
        const { error } = await supabase.from('doctor_group_members').insert({
          group_id: to_group_id, doctor_id, doctor_name, work_status: 'active',
        });
        if (error) return `Error moving: ${error.message}`;
        return `Moved ${doctor_name} to new group`;
      }

      case 'set_doctor_work_status': {
        const { group_id, doctor_id, work_status } = input;
        const { error } = await supabase.from('doctor_group_members').update({
          work_status, updated_at: new Date().toISOString(),
        }).eq('group_id', group_id).eq('doctor_id', doctor_id);
        if (error) return `Error: ${error.message}`;
        return `Set doctor status to ${work_status}`;
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

/**
 * Send a message to Claude API with tool use support
 */
export async function sendMessage(
  messages: AIMessage[],
  contextData?: string,
  clinicId?: string,
  weekStart?: string,
): Promise<AIResponse> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { success: false, message: '', error: 'API key not configured.' };
  }

  try {
    let systemPrompt = SYSTEM_PROMPT;
    if (contextData) {
      systemPrompt += `\n\nCurrent data:\n${contextData}`;
    }

    // Build conversation messages
    let conversationMessages: any[] = messages.map(m => ({ role: m.role, content: m.content }));
    let allText = '';
    const MAX_ROUNDS = 50; // Unlimited rounds until AI finishes

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 16000,
          system: systemPrompt,
          tools: AI_TOOLS,
          messages: conversationMessages,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { success: false, message: '', error: `API Error: ${res.status} - ${errData.error?.message || 'Unknown'}` };
      }

      const data = await res.json();
      const toolResults: any[] = [];

      // Process content blocks
      for (const block of data.content || []) {
        if (block.type === 'text') {
          allText += block.text;
        } else if (block.type === 'tool_use' && clinicId && weekStart) {
          const result = await executeTool(block.name, block.input, clinicId, weekStart);
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }

      // If no more tool calls, we're done
      if (data.stop_reason !== 'tool_use' || toolResults.length === 0) {
        break;
      }

      // Add assistant response + tool results for next round
      conversationMessages.push({ role: 'assistant', content: data.content });
      conversationMessages.push({ role: 'user', content: toolResults });
    }

    return { success: true, message: allText || 'Done.' };
  } catch (error) {
    return { success: false, message: '', error: `Network error: ${error instanceof Error ? error.message : 'Unknown'}` };
  }
}

/**
 * Build context string from schedule data
 */
export function buildScheduleContext(data: {
  clinicName?: string;
  weekStart?: string;
  clinicCount?: number;
  slots?: any[];
  groups?: any[];
}): string {
  let context = '';

  if (data.clinicName) context += `Clinic: ${data.clinicName}\n`;
  if (data.weekStart) context += `Week: ${data.weekStart}\n`;
  if (data.clinicCount) context += `Number of clinics: ${data.clinicCount}\n`;

  if (data.slots && data.slots.length > 0) {
    context += `\nCurrent schedule slots:\n`;
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
    for (const day of days) {
      const daySlots = data.slots.filter((s: any) => s.day === day || s.day_of_week === day);
      if (daySlots.length > 0) {
        context += `  ${day}:\n`;
        for (const s of daySlots) {
          const role = s.role === 'delegator' ? 'DLG' : `CL${s.clinicNumber || s.clinic_number}`;
          const period = s.period === 0 ? 'EX' : `P${s.period}`;
          context += `    ${period} - ${role}: ${s.doctorName || s.doctor_name} (${s.status})\n`;
        }
      }
    }
  } else {
    context += `\nSchedule is currently empty.\n`;
  }

  if (data.groups && data.groups.length > 0) {
    context += `\nDoctor groups:\n`;
    for (const g of data.groups) {
      const groupId = g.id || '';
      const doctors = g.doctors?.map((d: any) => {
        const status = d.workStatus || d.work_status || 'active';
        const id = d.id || d.doctor_id || '';
        const statusStr = status !== 'active' ? ` (${status})` : '';
        return `${d.name}${statusStr} [${id}]`;
      }).join(', ') || 'empty';
      context += `  ${g.name} [group_id: ${groupId}]: ${doctors}\n`;
    }
  }

  return context;
}
