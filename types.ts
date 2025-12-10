export interface Patient {
  id: string;
  queue_number: number;
  name: string;
  clinic?: string;
  condition?: string;
  treatment?: string;
  status: 'normal' | 'done' | 'elderly' | 'not_available';
  note?: string;
  created_at: string;
}

export interface TimelineEvent {
  id: string;
  patient_id: string;
  event: string;
  timestamp: string;
}

export type ClinicType = 'CL 1' | 'CL 2' | 'CL 3' | 'CL 4' | 'CL 5';
export type ConditionType = 'Pain' | 'Checkup' | 'PT TX' | 'Broken Tooth' | 'Others';
export type TreatmentType = 'Scaling' | 'Filling' | 'Extraction' | 'Pulpectomy' | 'Medication' | 'Cementation' | 'Referral' | 'Suture Removal';
