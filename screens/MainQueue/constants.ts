import { createClient } from '@supabase/supabase-js';

// Supabase setup
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
export const supabase = createClient(supabaseUrl, supabaseKey);

export const CLINICS = [
  { name: 'Clinic', id: 0, color: '#E5E7EB' },
  { name: 'Clinic 1', id: 1, color: '#C8F5E0' },
  { name: 'Clinic 2', id: 2, color: '#C4D9F5' },
  { name: 'Clinic 3', id: 3, color: '#E8D4F5' },
  { name: 'Clinic 4', id: 4, color: '#FFD9C4' },
  { name: 'Clinic 5', id: 5, color: '#FFC4E0' },
];

export const CONDITIONS = [
  { name: 'Condition', color: '#E5E7EB' },
  { name: 'Checkup', color: '#6EE7B7' },
  { name: 'Pain', color: '#6EE7B7' },
  { name: 'Broken Tooth', color: '#6EE7B7' },
  { name: 'Follow-up', color: '#6EE7B7' },
  { name: 'Others', color: '#6EE7B7' },
];

export const TREATMENTS = [
  { name: 'Treatment', color: '#E5E7EB' },
  { name: 'Examination', color: '#A7F3D0' },
  { name: 'Scaling', color: '#A7F3D0' },
  { name: 'Filling', color: '#A7F3D0' },
  { name: 'Extraction', color: '#A7F3D0' },
  { name: 'Pulpectomy', color: '#A7F3D0' },
  { name: 'Medication', color: '#A7F3D0' },
  { name: 'Suture Removal', color: '#A7F3D0' },
  { name: 'Cementation', color: '#A7F3D0' },
  { name: 'Referral', color: '#A7F3D0' },
];

export const CONDITION_COLORS: { [key: string]: string } = {
  'Checkup': '#6EE7B7',
  'Pain': '#6EE7B7',
  'Broken Tooth': '#6EE7B7',
  'Follow-up': '#6EE7B7',
  'Others': '#6EE7B7',
};

export const TREATMENT_COLORS: { [key: string]: string } = {
  'Scaling': '#A7F3D0',
  'Filling': '#A7F3D0',
  'Pulpectomy': '#A7F3D0',
  'Extraction': '#A7F3D0',
  'Medication': '#A7F3D0',
  'Referral': '#A7F3D0',
  'Suture Removal': '#A7F3D0',
  'Cementation': '#A7F3D0',
};

export const REFERRAL_OPTIONS = [
  { key: 'endodontics', label: 'Endodontics' },
  { key: 'oralSurgery', label: 'Oral Surgery' },
  { key: 'orthodontics', label: 'Orthodontics' },
  { key: 'periodontics', label: 'Periodontics' },
  { key: 'prosthodontics', label: 'Prosthodontics' },
  { key: 'oralMedicine', label: 'Oral Medicine' },
];

export interface Patient {
  id: string;
  queue_number: number;
  name: string;
  age: number;
  clinic_id?: string;
  clinic?: string;
  condition?: string;
  treatment?: string;
  timestamp: Date;
  note?: string;
  status?: 'normal' | 'na' | 'elderly' | 'complete';
  isElderly?: boolean;
  isSpecialNeeds?: boolean;
  registered_at?: Date;
  clinic_entry_at?: Date;
  completed_at?: Date;
  doctor_name?: string;
  assigned_by_doctor_name?: string;
  permanent_patient_id?: string;
  file_number?: string;
  patient_type?: 'walk-in' | 'permanent';
}

export type TimelineEvent = {
  id: string;
  patient_id: string;
  event_type: string;
  event_details: string;
  timestamp: string;
  doctor_name?: string;
  assigned_by_doctor_name?: string;
};

export const getArabicClinicName = (englishName: string): string => {
  const clinicNames: { [key: string]: string } = {
    'Mushrif Health Center': 'مركز مشرف الصحي',
    'Hittin Health Center': 'مركز حطين الصحي',
    'Bayan Health Center': 'مركز بيان الصحي',
    'Al-Zahra Health Center': 'مركز الزهرة الصحي',
    'Al-Noor Health Center': 'مركز النور الصحي',
  };
  return clinicNames[englishName] || englishName;
};

// Convert Arabic numerals to English
export const arabicToEnglish = (str: string) => {
  if (!str) return '';
  const arabicNumerals = ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', '\u0665', '\u0666', '\u0667', '\u0668', '\u0669'];
  const cleanStr = str.replace(/\x00/g, '').replace(/\u0000/g, '').trim();
  return cleanStr.split('').map(char => {
    const index = arabicNumerals.indexOf(char);
    return index !== -1 ? index.toString() : char;
  }).join('');
};
