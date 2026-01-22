// ===============================================================
// Database Types - Complete Schema
// ===============================================================

// ---------------------------------------------------------------
// Basic Types
// ---------------------------------------------------------------

export type ClinicType = 'CL 1' | 'CL 2' | 'CL 3' | 'CL 4' | 'CL 5';
export type ConditionType = 'Pain' | 'Checkup' | 'PT TX' | 'Broken Tooth' | 'Others';
export type TreatmentType = 'Scaling' | 'Filling' | 'Extraction' | 'Pulpectomy' | 'Medication' | 'Cementation' | 'Referral' | 'Suture Removal';

// ---------------------------------------------------------------
// Palmer Notation - Tooth Numbers
// ---------------------------------------------------------------
// UR = Upper Right, UL = Upper Left, LR = Lower Right, LL = Lower Left
// Each quadrant has 8 teeth (1-8)

export type ToothQuadrant = 'UR' | 'UL' | 'LR' | 'LL';
export type ToothPosition = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';

export type ToothNumber =
  // Upper Right (UR)
  | 'UR1' | 'UR2' | 'UR3' | 'UR4' | 'UR5' | 'UR6' | 'UR7' | 'UR8'
  // Upper Left (UL)
  | 'UL1' | 'UL2' | 'UL3' | 'UL4' | 'UL5' | 'UL6' | 'UL7' | 'UL8'
  // Lower Right (LR)
  | 'LR1' | 'LR2' | 'LR3' | 'LR4' | 'LR5' | 'LR6' | 'LR7' | 'LR8'
  // Lower Left (LL)
  | 'LL1' | 'LL2' | 'LL3' | 'LL4' | 'LL5' | 'LL6' | 'LL7' | 'LL8';

// ---------------------------------------------------------------
// Tooth Surfaces and Conditions
// ---------------------------------------------------------------

// Tooth surfaces using dental terminology
export type ToothSurface = 'mesial' | 'distal' | 'buccal' | 'lingual' | 'occlusal';

export type ToothCondition =
  | 'caries'                    // تسوس
  | 'broken'                    // مكسور
  | 'pulpectomy'                // علاج عصب
  | 'extraction'                // خلع
  | 'follow_up'                 // متابعة
  | 'missing'                   // مفقود
  | 'filling_replacement'       // استبدال حشوة
  | 'permanent_filling'         // حشوة دائمة
  | 'treated'                   // تم العلاج
  | 'needs_diagnosis'           // يحتاج تشخيص
  | 'direct_pulp_capping'       // تغطية لب مباشرة
  | 'indirect_pulp_capping'     // تغطية لب غير مباشرة
  | 'gi'                        // GI
  | null;

// ---------------------------------------------------------------
// Clinic & Doctor
// ---------------------------------------------------------------

export interface Clinic {
  id: string;
  name: string;
  created_at: string;
}

export interface Doctor {
  id: string;
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'doctor' | 'receptionist';
  clinic_id: string;
  created_at: string;
}

// ---------------------------------------------------------------
// Permanent Patient (Permanent File)
// ---------------------------------------------------------------

export interface PermanentPatient {
  id: string;
  file_number_encrypted: string;  // Encrypted file number
  name_encrypted: string;          // Encrypted name
  notes?: string;
  consent?: boolean;               // Patient consent status
  clinic_id: string;
  created_at: string;
  updated_at: string;
}

// Decrypted version for application use
export interface PermanentPatientDecrypted {
  id: string;
  file_number: string;             // Decrypted file number
  name: string;                    // Decrypted name
  notes?: string;
  consent?: boolean;               // Patient consent status
  clinic_id: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------
// Daily Patient Visit (Partitioned by year)
// ---------------------------------------------------------------

export interface Patient {
  id: string;
  queue_number: number;
  name?: string;                   // For walk-in patients (مرضى عابرين)

  // -------------------------------------------------------------
  // Permanent Patient Linking (NEW - January 2026)
  // -------------------------------------------------------------
  permanent_patient_id?: string;   // Foreign key to permanent_patients
  file_number?: string;            // File number for display (unencrypted)
  patient_type?: 'walk-in' | 'permanent'; // Patient type

  clinic_id: string;
  doctor_id?: string;
  condition?: string;
  treatment?: string;
  status: 'waiting' | 'in-treatment' | 'completed';
  visit_date: string;              // Date (YYYY-MM-DD)
  archive_date?: string;           // Timestamp when archived
  isElderly?: boolean;             // Is patient elderly
  isSpecialNeeds?: boolean;        // Has special needs
  note?: string;                   // Patient notes
  created_at: string;
  updated_at: string;
}

// Patient with decrypted permanent patient data
export interface PatientWithDetails extends Patient {
  permanent_patient?: PermanentPatientDecrypted;
  doctor?: Doctor;
}

// ---------------------------------------------------------------
// Tooth Surface Conditions
// ---------------------------------------------------------------

export interface ToothSurfaceCondition {
  id: string;
  permanent_patient_id: string;
  tooth_number: ToothNumber;
  surface: ToothSurface;
  condition: ToothCondition;
  updated_at: string;
}

// Complete tooth data with all 5 surfaces
export interface ToothData {
  tooth_number: ToothNumber;
  surfaces: {
    top: ToothCondition;
    bottom: ToothCondition;
    left: ToothCondition;
    right: ToothCondition;
    center: ToothCondition;
  };
}

// ---------------------------------------------------------------
// Editing Records (Treatments performed)
// ---------------------------------------------------------------

export interface EditingRecord {
  id: string;
  permanent_patient_id: string;
  tooth_number: ToothNumber;
  treatment: string;
  details?: string;
  surfaces: ToothSurface[];        // Array of treated surfaces
  doctor_name: string;
  timestamp: string;               // ISO timestamp
  timestamp_num: number;           // Unix timestamp in milliseconds
  created_at: string;
}

// ---------------------------------------------------------------
// Planning Records (Diagnoses and treatment plans)
// ---------------------------------------------------------------

export type PlanningAction = 'diagnosed' | 'canceled';

export interface PlanningRecord {
  id: string;
  permanent_patient_id: string;
  tooth_number: ToothNumber;
  action: PlanningAction;
  condition: string;
  surfaces: ToothSurface[];
  is_change: boolean;
  previous_condition?: string;
  doctor_name: string;
  timestamp: string;
  timestamp_num: number;
  created_at: string;
}

// ---------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------

export interface Referral {
  id: string;
  permanent_patient_id: string;
  tooth_number: ToothNumber | null;  // Allow null for general referrals without specific tooth
  referral_type: string;
  notes?: string;
  doctor_name: string;
  timestamp: string;
  created_at: string;
  status: 'not_given' | 'given';
}

// ---------------------------------------------------------------
// Tooth Notes
// ---------------------------------------------------------------

export interface ToothNote {
  id: string;
  permanent_patient_id: string;
  tooth_number: ToothNumber;
  note: string;
  doctor_name: string;
  timestamp: string;
  created_at: string;
}

// ---------------------------------------------------------------
// Scaling Records
// ---------------------------------------------------------------

export interface ScalingRecord {
  id: string;
  permanent_patient_id: string;
  doctor_name: string;
  timestamp: string;
  created_at: string;
}

// ---------------------------------------------------------------
// Missing Teeth
// ---------------------------------------------------------------

export interface MissingTooth {
  id: string;
  permanent_patient_id: string;
  tooth_number: ToothNumber;
  reason?: string;                 // e.g., 'extracted', 'congenitally_missing'
  lost_date?: string;              // Date (YYYY-MM-DD)
  created_at: string;
}

// ---------------------------------------------------------------
// Extracted Teeth
// ---------------------------------------------------------------

export interface ExtractedTooth {
  id: string;
  permanent_patient_id: string;
  tooth_number: ToothNumber;
  reason?: string;
  doctor_name: string;
  extraction_date: string;         // Date (YYYY-MM-DD)
  timestamp: string;
  created_at: string;
}

// ---------------------------------------------------------------
// Follow-up Teeth
// ---------------------------------------------------------------

export type FollowupStatus = 'pending' | 'completed' | 'canceled';

export interface FollowupTooth {
  id: string;
  permanent_patient_id: string;
  tooth_number: ToothNumber;
  reason?: string;
  followup_date?: string;          // Date (YYYY-MM-DD)
  status: FollowupStatus;
  doctor_name: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------
// Treatment History (Complete history)
// ---------------------------------------------------------------

export type TreatmentRecordType =
  | 'editing'
  | 'planning'
  | 'referral'
  | 'note'
  | 'scaling'
  | 'extraction'
  | 'followup';

export interface TreatmentHistory {
  id: string;
  permanent_patient_id: string;
  record_type: TreatmentRecordType;
  tooth_number?: ToothNumber;      // Optional for general records like scaling
  data: any;                       // JSONB data - flexible structure
  doctor_name: string;
  timestamp: string;
  created_at: string;
}

// ---------------------------------------------------------------
// Timeline Events (existing)
// ---------------------------------------------------------------

export interface TimelineEvent {
  id: string;
  patient_id: string;
  event_type: string;
  event_details?: string;
  doctor_name?: string;
  timestamp: string;
}

// ---------------------------------------------------------------
// Patients Archive
// ---------------------------------------------------------------

export interface PatientArchive extends Patient {
  archived_on: string;             // Timestamp when moved to archive
}

// ===============================================================
// Helper Types
// ===============================================================

// Complete dental chart for a patient
export interface DentalChart {
  patient: PermanentPatientDecrypted;
  teeth: ToothData[];
  editingRecords: EditingRecord[];
  planningRecords: PlanningRecord[];
  referrals: Referral[];
  notes: ToothNote[];
  scalingRecords: ScalingRecord[];
  missingTeeth: MissingTooth[];
  extractedTeeth: ExtractedTooth[];
  followupTeeth: FollowupTooth[];
  treatmentHistory: TreatmentHistory[];
}

// ---------------------------------------------------------------
// Dental Summary (NEW - January 2026)
// ---------------------------------------------------------------
// Quick summary of dental conditions for a patient
// Used to display in Timeline patient cards

export interface DentalSummary {
  caries_count: number;              // Number of teeth with caries
  caries_teeth: ToothNumber[];       // Which teeth have caries

  rct_needed_count: number;          // Number of teeth needing RCT
  rct_needed_teeth: ToothNumber[];   // Which teeth need RCT

  extraction_needed_count: number;   // Number of teeth for extraction
  extraction_needed_teeth: ToothNumber[]; // Which teeth for extraction

  filling_done_count: number;        // Number of teeth with fillings
  filling_done_teeth: ToothNumber[]; // Which teeth have fillings

  broken_teeth_count: number;        // Number of broken teeth
  broken_teeth: ToothNumber[];       // Which teeth are broken

  total_issues: number;              // Total number of teeth with issues
}

// Database response types
export interface DatabaseResponse<T> {
  data: T | null;
  error: Error | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
