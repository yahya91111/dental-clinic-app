// Mock data for schedule development - will be replaced with Supabase data
import { ScheduleSlot } from './types';

export const MOCK_SLOTS: ScheduleSlot[] = [
  // Sunday - Period 1
  { id: '1', day: 'sunday', period: 1, clinicNumber: 1, doctorId: 'd1', doctorName: 'أحمد', role: 'clinic', status: 'active' },
  { id: '2', day: 'sunday', period: 1, clinicNumber: 2, doctorId: 'd2', doctorName: 'سارة', role: 'clinic', status: 'active' },
  { id: '3', day: 'sunday', period: 1, clinicNumber: 0, doctorId: 'd3', doctorName: 'خالد', role: 'delegator', status: 'active' },
  // Sunday - Period 2
  { id: '4', day: 'sunday', period: 2, clinicNumber: 1, doctorId: 'd4', doctorName: 'محمد', role: 'clinic', status: 'active' },
  { id: '5', day: 'sunday', period: 2, clinicNumber: 0, doctorId: 'd5', doctorName: 'فهد', role: 'clinic', status: 'sick_leave' },
  { id: '6', day: 'sunday', period: 2, clinicNumber: 0, doctorId: 'd6', doctorName: 'ليلى', role: 'delegator', status: 'active' },
  // Sunday - Period 3
  { id: '7', day: 'sunday', period: 3, clinicNumber: 1, doctorId: 'd7', doctorName: 'عبدالله', role: 'clinic', status: 'active' },
  { id: '8', day: 'sunday', period: 3, clinicNumber: 0, doctorId: 'd8', doctorName: 'هند', role: 'clinic', status: 'permission' },
  // Sunday - Period 4
  { id: '9', day: 'sunday', period: 4, clinicNumber: 1, doctorId: 'd9', doctorName: 'ريم', role: 'clinic', status: 'active' },
  { id: '10', day: 'sunday', period: 4, clinicNumber: 0, doctorId: 'd10', doctorName: 'سعود', role: 'clinic', status: 'vacation' },
  // Sunday - EX (period: 0)
  { id: '50', day: 'sunday', period: 0, clinicNumber: 0, doctorId: 'd11', doctorName: 'ناصر', role: 'clinic', status: 'sick_leave' },
  { id: '51', day: 'sunday', period: 0, clinicNumber: 0, doctorId: 'd12', doctorName: 'منى', role: 'clinic', status: 'vacation' },

  // Monday - Period 1
  { id: '11', day: 'monday', period: 1, clinicNumber: 1, doctorId: 'd4', doctorName: 'محمد', role: 'clinic', status: 'active' },
  { id: '12', day: 'monday', period: 1, clinicNumber: 2, doctorId: 'd2', doctorName: 'نورة', role: 'clinic', status: 'active' },
  { id: '13', day: 'monday', period: 1, clinicNumber: 0, doctorId: 'd6', doctorName: 'ليلى', role: 'delegator', status: 'active' },
  // Monday - Period 2
  { id: '14', day: 'monday', period: 2, clinicNumber: 1, doctorId: 'd1', doctorName: 'أحمد', role: 'clinic', status: 'active' },
  { id: '15', day: 'monday', period: 2, clinicNumber: 2, doctorId: 'd2', doctorName: 'سارة', role: 'clinic', status: 'active' },
  // Monday - Period 3
  { id: '16', day: 'monday', period: 3, clinicNumber: 1, doctorId: 'd9', doctorName: 'ريم', role: 'clinic', status: 'active' },
  { id: '17', day: 'monday', period: 3, clinicNumber: 2, doctorId: 'd10', doctorName: 'سعود', role: 'clinic', status: 'active' },
  // Monday - Period 4
  { id: '18', day: 'monday', period: 4, clinicNumber: 1, doctorId: 'd3', doctorName: 'خالد', role: 'clinic', status: 'active' },

  // Tuesday
  { id: '19', day: 'tuesday', period: 1, clinicNumber: 1, doctorId: 'd1', doctorName: 'أحمد', role: 'clinic', status: 'active' },
  { id: '20', day: 'tuesday', period: 1, clinicNumber: 0, doctorId: 'd2', doctorName: 'سارة', role: 'delegator', status: 'active' },
  { id: '21', day: 'tuesday', period: 2, clinicNumber: 1, doctorId: 'd4', doctorName: 'نورة', role: 'clinic', status: 'active' },
  { id: '22', day: 'tuesday', period: 2, clinicNumber: 0, doctorId: 'd8', doctorName: 'هند', role: 'clinic', status: 'permission' },
  { id: '23', day: 'tuesday', period: 3, clinicNumber: 1, doctorId: 'd4', doctorName: 'محمد', role: 'clinic', status: 'active' },

  // Wednesday
  { id: '24', day: 'wednesday', period: 1, clinicNumber: 1, doctorId: 'd5', doctorName: 'فهد', role: 'clinic', status: 'active' },
  { id: '25', day: 'wednesday', period: 1, clinicNumber: 2, doctorId: 'd8', doctorName: 'هند', role: 'clinic', status: 'active' },
  { id: '26', day: 'wednesday', period: 2, clinicNumber: 1, doctorId: 'd3', doctorName: 'خالد', role: 'clinic', status: 'active' },
  { id: '27', day: 'wednesday', period: 2, clinicNumber: 0, doctorId: 'd4', doctorName: 'محمد', role: 'delegator', status: 'active' },
  { id: '28', day: 'wednesday', period: 4, clinicNumber: 1, doctorId: 'd2', doctorName: 'سارة', role: 'clinic', status: 'active' },
  { id: '29', day: 'wednesday', period: 4, clinicNumber: 0, doctorId: 'd1', doctorName: 'أحمد', role: 'delegator', status: 'active' },

  // Thursday
  { id: '30', day: 'thursday', period: 1, clinicNumber: 1, doctorId: 'd9', doctorName: 'ريم', role: 'clinic', status: 'active' },
  { id: '31', day: 'thursday', period: 1, clinicNumber: 0, doctorId: 'd5', doctorName: 'فهد', role: 'clinic', status: 'sick_leave' },
  { id: '32', day: 'thursday', period: 3, clinicNumber: 1, doctorId: 'd1', doctorName: 'أحمد', role: 'clinic', status: 'active' },
  { id: '33', day: 'thursday', period: 3, clinicNumber: 0, doctorId: 'd4', doctorName: 'نورة', role: 'delegator', status: 'active' },
];
