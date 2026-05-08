-- ═══════════════════════════════════════════════════════════════
-- Schedule System Tables
-- ═══════════════════════════════════════════════════════════════

-- 1. Doctor Groups (Group A, Group B, Trainees, etc.)
CREATE TABLE IF NOT EXISTS doctor_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL,
  name TEXT NOT NULL,
  color_index INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Doctor Group Members (which doctor in which group + work status)
CREATE TABLE IF NOT EXISTS doctor_group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES doctor_groups(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL,
  doctor_name TEXT NOT NULL,
  work_status TEXT NOT NULL DEFAULT 'active', -- 'active', 'vacation', 'light_duty'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, doctor_id)
);

-- 3. Weekly Schedule Slots (duty assignments per week)
CREATE TABLE IF NOT EXISTS schedule_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL,
  week_start DATE NOT NULL, -- Sunday of the week (ISO date)
  day_of_week TEXT NOT NULL, -- 'sunday','monday','tuesday','wednesday','thursday'
  period INTEGER NOT NULL, -- 1,2,3,4 (0 = EX)
  clinic_number INTEGER NOT NULL DEFAULT 0, -- 1-10 for clinic, 0 for delegator/EX
  doctor_id UUID NOT NULL,
  doctor_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'clinic', -- 'clinic' or 'delegator'
  status TEXT NOT NULL DEFAULT 'active', -- 'active','sick_leave','permission','vacation'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Schedule Settings (clinic count per clinic)
CREATE TABLE IF NOT EXISTS schedule_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL UNIQUE,
  clinic_count INTEGER NOT NULL DEFAULT 2,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_doctor_groups_clinic ON doctor_groups(clinic_id);
CREATE INDEX IF NOT EXISTS idx_doctor_group_members_group ON doctor_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_doctor_group_members_doctor ON doctor_group_members(doctor_id);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_clinic_week ON schedule_slots(clinic_id, week_start);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_day_period ON schedule_slots(day_of_week, period);

-- Enable RLS
ALTER TABLE doctor_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all for authenticated - app handles permissions)
CREATE POLICY "Allow all for doctor_groups" ON doctor_groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for doctor_group_members" ON doctor_group_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for schedule_slots" ON schedule_slots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for schedule_settings" ON schedule_settings FOR ALL USING (true) WITH CHECK (true);
