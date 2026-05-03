// Schedule Types
export type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday';

export type DoctorRole = 'clinic' | 'delegator';
export type DoctorStatus = 'active' | 'sick_leave' | 'permission' | 'vacation';

export interface ScheduleSlot {
  id: string;
  day: DayOfWeek;
  period: number; // 1-4
  clinicNumber: number; // 1-5
  doctorId: string;
  doctorName: string;
  role: DoctorRole;
  status: DoctorStatus;
}

export interface WeekSchedule {
  id: string;
  clinicId: string;
  weekStartDate: string; // ISO date string (Sunday)
  weekEndDate: string; // ISO date string (Thursday)
  slots: ScheduleSlot[];
  createdAt: string;
  updatedAt: string;
}

export const DAYS: { key: DayOfWeek; label: string; shortLabel: string }[] = [
  { key: 'sunday', label: 'Sunday', shortLabel: 'Sun' },
  { key: 'monday', label: 'Monday', shortLabel: 'Mon' },
  { key: 'tuesday', label: 'Tuesday', shortLabel: 'Tue' },
  { key: 'wednesday', label: 'Wednesday', shortLabel: 'Wed' },
  { key: 'thursday', label: 'Thursday', shortLabel: 'Thu' },
];

export const PERIODS: { id: number; label: string; icon: string; start: string; end: string }[] = [
  { id: 4, label: 'Period 4', icon: '🌙', start: '17:30', end: '21:00' },
  { id: 3, label: 'Period 3', icon: '🌅', start: '14:00', end: '17:30' },
  { id: 2, label: 'Period 2', icon: '🌤️', start: '10:30', end: '14:00' },
  { id: 1, label: 'Period 1', icon: '☀️', start: '7:00', end: '10:30' },
];

export const STATUS_CONFIG: Record<DoctorStatus, { label: string; color: string; bgColor: string; borderColor: string; icon: string }> = {
  active: { label: 'Active', color: '#2563EB', bgColor: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.3)', icon: '🏥' },
  sick_leave: { label: 'Sick Leave', color: '#DC2626', bgColor: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)', icon: '🔴' },
  permission: { label: 'Permission', color: '#D97706', bgColor: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.3)', icon: '🟡' },
  vacation: { label: 'Vacation', color: '#6B7280', bgColor: 'rgba(107,114,128,0.15)', borderColor: 'rgba(107,114,128,0.3)', icon: '⚪' },
};

export const ROLE_CONFIG: Record<DoctorRole, { label: string; color: string; bgColor: string; borderColor: string }> = {
  clinic: { label: 'Clinic', color: '#2563EB', bgColor: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.3)' },
  delegator: { label: 'Delegator', color: '#7C3AED', bgColor: 'rgba(139,92,246,0.15)', borderColor: 'rgba(139,92,246,0.3)' },
};
