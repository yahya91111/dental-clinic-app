// ═══════════════════════════════════════════════════════════════
// Database Service Layer - Complete CRUD Operations
// ═══════════════════════════════════════════════════════════════
// Handles all database operations with encryption/decryption

import { supabase } from './supabase';
import {
  encryptData,
  decryptData,
  encryptPatientName,
  decryptPatientName,
  encryptFileNumber,
  decryptFileNumber,
} from './encryption';
import {
  PermanentPatient,
  PermanentPatientDecrypted,
  Patient,
  PatientWithDetails,
  ToothSurfaceCondition,
  EditingRecord,
  PlanningRecord,
  Referral,
  ToothNote,
  ScalingRecord,
  MissingTooth,
  ExtractedTooth,
  FollowupTooth,
  TreatmentHistory,
  DentalChart,
  ToothData,
  ToothNumber,
  ToothSurface,
  ToothCondition,
  DatabaseResponse,
} from '../types';

// ═══════════════════════════════════════════════════════════════
// Permanent Patients
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new permanent patient with encrypted data
 */
export async function createPermanentPatient(
  fileNumber: string,
  name: string,
  clinicId: string,
  notes?: string
): Promise<DatabaseResponse<PermanentPatientDecrypted>> {
  try {
    const { data, error } = await supabase
      .from('permanent_patients')
      .insert({
        file_number_encrypted: encryptFileNumber(fileNumber), //  Encrypt file number
        name_encrypted: encryptPatientName(name), //  Encrypt name
        clinic_id: clinicId,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Decrypt both file number and name
    const decryptedData: PermanentPatientDecrypted = {
      id: data.id,
      file_number: decryptFileNumber(data.file_number_encrypted), //  Decrypt file number
      name: decryptPatientName(data.name_encrypted), //  Decrypt name
      notes: data.notes,
      consent: data.consent,
      clinic_id: data.clinic_id,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    return { data: decryptedData, error: null };
  } catch (error) {
    console.error('Error creating permanent patient:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Search permanent patient by file number (returns ALL patients with this file number)
 */
export async function searchPermanentPatientsByFileNumber(
  fileNumber: string,
  clinicId: string
): Promise<DatabaseResponse<PermanentPatientDecrypted[]>> {
  try {
    const { data, error } = await supabase
      .from('permanent_patients')
      .select('*')
      .eq('file_number_encrypted', encryptFileNumber(fileNumber))
      .eq('clinic_id', clinicId);

    if (error) throw error;

    if (!data || data.length === 0) {
      return { data: [], error: null };
    }

    // Decrypt all patients
    const decryptedData: PermanentPatientDecrypted[] = data.map(patient => ({
      id: patient.id,
      file_number: decryptFileNumber(patient.file_number_encrypted),
      name: decryptPatientName(patient.name_encrypted),
      notes: patient.notes,
      clinic_id: patient.clinic_id,
      created_at: patient.created_at,
      updated_at: patient.updated_at,
    }));

    return { data: decryptedData, error: null };
  } catch (error) {
    console.error('Error searching permanent patients:', error);
    return { data: [], error: error as Error };
  }
}

/**
 * Search permanent patient by file number AND name (returns single patient or null)
 */
export async function searchPermanentPatientByFileNumberAndName(
  fileNumber: string,
  name: string,
  clinicId: string
): Promise<DatabaseResponse<PermanentPatientDecrypted>> {
  try {
    const { data, error } = await supabase
      .from('permanent_patients')
      .select('*')
      .eq('file_number_encrypted', encryptFileNumber(fileNumber))
      .eq('name_encrypted', encryptPatientName(name))
      .eq('clinic_id', clinicId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return { data: null, error: null };
      }
      throw error;
    }

    // Decrypt both file number and name
    const decryptedData: PermanentPatientDecrypted = {
      id: data.id,
      file_number: decryptFileNumber(data.file_number_encrypted),
      name: decryptPatientName(data.name_encrypted),
      notes: data.notes,
      clinic_id: data.clinic_id,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    return { data: decryptedData, error: null };
  } catch (error) {
    console.error('Error searching permanent patient:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Search patients by file number OR name (intelligent search)
 * This function searches all patients in the clinic and filters by query
 */
export async function searchPermanentPatients(
  query: string,
  clinicId: string
): Promise<DatabaseResponse<PermanentPatientDecrypted[]>> {
  try {
    // Get all patients for this clinic
    const { data, error } = await supabase
      .from('permanent_patients')
      .select('*')
      .eq('clinic_id', clinicId);

    if (error) throw error;

    if (!data || data.length === 0) {
      return { data: [], error: null };
    }

    // Decrypt all patients
    const decryptedPatients: PermanentPatientDecrypted[] = data.map(patient => ({
      id: patient.id,
      file_number: decryptFileNumber(patient.file_number_encrypted),
      name: decryptPatientName(patient.name_encrypted),
      notes: patient.notes,
      clinic_id: patient.clinic_id,
      created_at: patient.created_at,
      updated_at: patient.updated_at,
    }));

    // Filter by query (search in both file number and name)
    const queryLower = query.toLowerCase().trim();
    const filteredPatients = decryptedPatients.filter(patient => {
      const fileNumberMatch = patient.file_number.toLowerCase().includes(queryLower);
      const nameMatch = patient.name.toLowerCase().includes(queryLower);
      return fileNumberMatch || nameMatch;
    });

    return { data: filteredPatients, error: null };
  } catch (error) {
    console.error('Error searching permanent patients:', error);
    return { data: [], error: error as Error };
  }
}

/**
 * @deprecated Use searchPermanentPatientsByFileNumber instead
 * Search permanent patient by file number (OLD - returns single patient)
 */
export async function searchPermanentPatientByFileNumber(
  fileNumber: string,
  clinicId: string
): Promise<DatabaseResponse<PermanentPatientDecrypted>> {
  try {
    const { data, error } = await supabase
      .from('permanent_patients')
      .select('*')
      .eq('file_number_encrypted', encryptFileNumber(fileNumber)) //  Encrypt file number before search
      .eq('clinic_id', clinicId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return { data: null, error: null };
      }
      throw error;
    }

    // Decrypt both file number and name
    const decryptedData: PermanentPatientDecrypted = {
      id: data.id,
      file_number: decryptFileNumber(data.file_number_encrypted), //  Decrypt file number
      name: decryptPatientName(data.name_encrypted), //  Decrypt name
      notes: data.notes,
      consent: data.consent,
      clinic_id: data.clinic_id,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    return { data: decryptedData, error: null };
  } catch (error) {
    console.error('Error searching permanent patient:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get permanent patient by ID
 */
export async function getPermanentPatientById(
  id: string
): Promise<DatabaseResponse<PermanentPatientDecrypted>> {
  try {
    const { data, error } = await supabase
      .from('permanent_patients')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    const decryptedData: PermanentPatientDecrypted = {
      id: data.id,
      file_number: decryptFileNumber(data.file_number_encrypted), //  Decrypt file number
      name: decryptPatientName(data.name_encrypted), //  Decrypt name
      notes: data.notes,
      consent: data.consent,
      clinic_id: data.clinic_id,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    return { data: decryptedData, error: null };
  } catch (error) {
    console.error('Error getting permanent patient:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Update permanent patient notes
 */
export async function updatePermanentPatientNotes(
  id: string,
  notes: string
): Promise<DatabaseResponse<boolean>> {
  try {
    const { error } = await supabase
      .from('permanent_patients')
      .update({ notes })
      .eq('id', id);

    if (error) throw error;

    return { data: true, error: null };
  } catch (error) {
    console.error('Error updating permanent patient notes:', error);
    return { data: false, error: error as Error };
  }
}

/**
 * Update permanent patient consent status
 */
export async function updatePermanentPatientConsent(
  id: string,
  consent: boolean
): Promise<DatabaseResponse<boolean>> {
  try {
    const { error } = await supabase
      .from('permanent_patients')
      .update({ consent })
      .eq('id', id);

    if (error) throw error;

    return { data: true, error: null };
  } catch (error) {
    console.error('Error updating permanent patient consent:', error);
    return { data: false, error: error as Error };
  }
}

/**
 * Delete a permanent patient and all related data
 * WARNING: This will permanently delete:
 * - The patient record
 * - All tooth surface conditions
 * - All planning records (diagnoses)
 * - All editing records (treatments)
 * - All referrals
 * - All tooth notes
 * - All planning batches
 *
 * This action CANNOT be undone!
 */
export async function deletePermanentPatient(
  id: string
): Promise<DatabaseResponse<boolean>> {
  try {
    // With CASCADE enabled in database, this will automatically delete all related records
    const { error } = await supabase
      .from('permanent_patients')
      .delete()
      .eq('id', id);

    if (error) throw error;

    console.log(' Permanent patient deleted successfully:', id);
    return { data: true, error: null };
  } catch (error) {
    console.error(' Error deleting permanent patient:', error);
    return { data: false, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// Daily Patients (Visits)
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new daily visit for a patient
 */
export async function createDailyVisit(
  queueNumber: number,
  clinicId: string,
  permanentPatientId?: string,
  walkInName?: string,
  doctorId?: string,
  condition?: string,
  treatment?: string,
  visitDate?: string
): Promise<DatabaseResponse<Patient>> {
  try {
    const { data, error } = await supabase
      .from('patients')
      .insert({
        queue_number: queueNumber,
        clinic_id: clinicId,
        permanent_patient_id: permanentPatientId || null,
        name: walkInName || null,
        doctor_id: doctorId || null,
        condition: condition || null,
        treatment: treatment || null,
        status: 'waiting',
        visit_date: visitDate || new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error creating daily visit:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get today's patients for a clinic (not archived)
 */
export async function getTodaysPatients(
  clinicId: string
): Promise<DatabaseResponse<PatientWithDetails[]>> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('patients')
      .select('*, doctors(*)')
      .eq('clinic_id', clinicId)
      .eq('visit_date', today)
      .is('archive_date', null)
      .order('queue_number', { ascending: true });

    if (error) throw error;

    // Fetch and decrypt permanent patient data for each visit
    const patientsWithDetails: PatientWithDetails[] = await Promise.all(
      data.map(async (patient) => {
        let permanentPatient: PermanentPatientDecrypted | undefined;

        if (patient.permanent_patient_id) {
          const { data: ppData } = await getPermanentPatientById(
            patient.permanent_patient_id
          );
          if (ppData) permanentPatient = ppData;
        }

        return {
          ...patient,
          permanent_patient: permanentPatient,
          doctor: patient.doctors,
        };
      })
    );

    return { data: patientsWithDetails, error: null };
  } catch (error) {
    console.error('Error getting today\'s patients:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Update patient status
 */
export async function updatePatientStatus(
  patientId: string,
  status: 'waiting' | 'in-treatment' | 'completed'
): Promise<DatabaseResponse<boolean>> {
  try {
    const { error } = await supabase
      .from('patients')
      .update({ status })
      .eq('id', patientId);

    if (error) throw error;

    return { data: true, error: null };
  } catch (error) {
    console.error('Error updating patient status:', error);
    return { data: false, error: error as Error };
  }
}

/**
 * Archive a patient visit (set archive_date)
 */
export async function archivePatientVisit(
  patientId: string
): Promise<DatabaseResponse<boolean>> {
  try {
    const { error } = await supabase
      .from('patients')
      .update({ archive_date: new Date().toISOString() })
      .eq('id', patientId);

    if (error) throw error;

    return { data: true, error: null };
  } catch (error) {
    console.error('Error archiving patient visit:', error);
    return { data: false, error: error as Error };
  }
}

/**
 * Archive all today's patients for a clinic (end of day)
 */
export async function archiveAllTodaysPatients(
  clinicId: string
): Promise<DatabaseResponse<number>> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('patients')
      .update({ archive_date: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .eq('visit_date', today)
      .is('archive_date', null)
      .select();

    if (error) throw error;

    return { data: data.length, error: null };
  } catch (error) {
    console.error('Error archiving all today\'s patients:', error);
    return { data: null, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// Tooth Surface Conditions
// ═══════════════════════════════════════════════════════════════

/**
 * Save or update tooth surface condition
 */
export async function saveToothSurfaceCondition(
  permanentPatientId: string,
  toothNumber: ToothNumber,
  surface: ToothSurface,
  condition: ToothCondition
): Promise<DatabaseResponse<ToothSurfaceCondition>> {
  try {
    const { data, error } = await supabase
      .from('tooth_surface_conditions')
      .upsert(
        {
          permanent_patient_id: permanentPatientId,
          tooth_number: toothNumber,
          surface: surface,
          condition: condition,
        },
        {
          onConflict: 'permanent_patient_id,tooth_number,surface',
        }
      )
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error saving tooth surface condition:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Delete tooth surface condition (when clearing a surface)
 */
export async function deleteToothSurfaceCondition(
  permanentPatientId: string,
  toothNumber: ToothNumber,
  surface: ToothSurface
): Promise<DatabaseResponse<null>> {
  try {
    const { error } = await supabase
      .from('tooth_surface_conditions')
      .delete()
      .eq('permanent_patient_id', permanentPatientId)
      .eq('tooth_number', toothNumber)
      .eq('surface', surface);

    if (error) throw error;

    return { data: null, error: null };
  } catch (error) {
    console.error('Error deleting tooth surface condition:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get all tooth surface conditions for a patient
 */
export async function getToothSurfaceConditions(
  permanentPatientId: string
): Promise<DatabaseResponse<ToothSurfaceCondition[]>> {
  try {
    const { data, error } = await supabase
      .from('tooth_surface_conditions')
      .select('*')
      .eq('permanent_patient_id', permanentPatientId)
      .order('tooth_number', { ascending: true });

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error getting tooth surface conditions:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get complete tooth data (all surfaces) for a patient
 */
export async function getCompleteToothData(
  permanentPatientId: string
): Promise<DatabaseResponse<ToothData[]>> {
  try {
    const { data, error } = await getToothSurfaceConditions(permanentPatientId);

    if (error) throw error;

    // Group by tooth number
    const toothMap = new Map<ToothNumber, ToothData>();

    // Initialize all 32 teeth with null conditions
    const allTeeth: ToothNumber[] = [];
    const quadrants = ['UR', 'UL', 'LR', 'LL'];
    for (const quadrant of quadrants) {
      for (let i = 1; i <= 8; i++) {
        const toothNum = `${quadrant}${i}` as ToothNumber;
        allTeeth.push(toothNum);
        toothMap.set(toothNum, {
          tooth_number: toothNum,
          surfaces: {
            top: null,
            bottom: null,
            left: null,
            right: null,
            center: null,
          },
        });
      }
    }

    // Helper function to convert Palmer notation to number
    const convertPalmerToNumber = (palmer: ToothNumber): number | null => {
      const palmerToNumber: Record<string, number> = {
        'UR1': 1, 'UR2': 2, 'UR3': 3, 'UR4': 4, 'UR5': 5, 'UR6': 6, 'UR7': 7, 'UR8': 8,
        'UL1': 9, 'UL2': 10, 'UL3': 11, 'UL4': 12, 'UL5': 13, 'UL6': 14, 'UL7': 15, 'UL8': 16,
        'LL1': 17, 'LL2': 18, 'LL3': 19, 'LL4': 20, 'LL5': 21, 'LL6': 22, 'LL7': 23, 'LL8': 24,
        'LR1': 25, 'LR2': 26, 'LR3': 27, 'LR4': 28, 'LR5': 29, 'LR6': 30, 'LR7': 31, 'LR8': 32,
      };
      return palmerToNumber[palmer] || null;
    };

    // Helper function to get surface mapping for a tooth number
    // Lower teeth (17-32) have swapped mesial/distal positions
    const getSurfaceMap = (toothNumber: number): Record<ToothSurface, keyof ToothData['surfaces']> => {
      const isLowerTooth = toothNumber >= 17 && toothNumber <= 32;

      return {
        'mesial': isLowerTooth ? 'bottom' : 'top',
        'distal': isLowerTooth ? 'top' : 'bottom',
        'buccal': 'right',
        'lingual': 'left',
        'occlusal': 'center',
      };
    };

    // Fill in actual conditions from database
    if (data) {
      data.forEach((condition) => {
        const tooth = toothMap.get(condition.tooth_number);
        if (tooth) {
          // Get correct mapping for this tooth
          const toothNumber = convertPalmerToNumber(condition.tooth_number);
          if (toothNumber) {
            const surfaceMap = getSurfaceMap(toothNumber);
            const uiSurface = surfaceMap[condition.surface];
            tooth.surfaces[uiSurface] = condition.condition;
          }
        }
      });
    }

    return { data: Array.from(toothMap.values()), error: null };
  } catch (error) {
    console.error('Error getting complete tooth data:', error);
    return { data: null, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// Editing Records (Treatment Records)
// ═══════════════════════════════════════════════════════════════

/**
 * Create editing record (treatment performed)
 */
export async function createEditingRecord(
  permanentPatientId: string,
  toothNumber: ToothNumber,
  treatment: string,
  surfaces: ToothSurface[],
  doctorName: string,
  details?: string
): Promise<DatabaseResponse<EditingRecord>> {
  try {
    const timestamp = new Date().toISOString();
    const timestampNum = Date.now();

    const { data, error } = await supabase
      .from('editing_records')
      .insert({
        permanent_patient_id: permanentPatientId,
        tooth_number: toothNumber,
        treatment,
        details: details || null,
        surfaces: JSON.stringify(surfaces),
        doctor_name: doctorName,
        timestamp,
        timestamp_num: timestampNum,
      })
      .select()
      .single();

    if (error) throw error;

    // Parse surfaces back to array
    return { data: { ...data, surfaces: JSON.parse(data.surfaces) }, error: null };
  } catch (error) {
    console.error('Error creating editing record:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get all editing records for a patient
 */
export async function getEditingRecords(
  permanentPatientId: string
): Promise<DatabaseResponse<EditingRecord[]>> {
  try {
    const { data, error } = await supabase
      .from('editing_records')
      .select('*')
      .eq('permanent_patient_id', permanentPatientId)
      .order('timestamp', { ascending: false });

    if (error) throw error;

    // Parse surfaces from JSON
    const records = data?.map((record) => ({
      ...record,
      surfaces: JSON.parse(record.surfaces),
    }));

    return { data: records || [], error: null };
  } catch (error) {
    console.error('Error getting editing records:', error);
    return { data: null, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// Planning Records (Diagnoses)
// ═══════════════════════════════════════════════════════════════

/**
 * Create planning batch (group of planning records submitted together)
 */
export async function createPlanningBatch(
  permanentPatientId: string,
  doctorName: string
): Promise<DatabaseResponse<{ id: string }>> {
  try {
    console.log('🔵 Attempting to create planning batch...');
    console.log('Patient ID:', permanentPatientId);
    console.log('Doctor Name:', doctorName);

    const { data, error } = await supabase
      .from('planning_batches')
      .insert({
        permanent_patient_id: permanentPatientId,
        doctor_name: doctorName,
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error(' Supabase error:', error);
      throw error;
    }

    console.log(' Planning batch created successfully:', data);
    return { data, error: null };
  } catch (error) {
    console.error(' Error creating planning batch:', error);

    // Provide more detailed error information
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error name:', error.name);

      // Check if it's a network error
      if (error.message.includes('Network request failed')) {
        console.error('🔴 NETWORK ERROR: Cannot connect to Supabase');
        console.error('Please check:');
        console.error('1. Internet connection is active');
        console.error('2. Supabase URL is correct in .env file');
        console.error('3. App has been restarted after .env changes');
      }
    }

    return { data: null, error: error as Error };
  }
}

/**
 * Create planning record (diagnosis)
 */
export async function createPlanningRecord(
  permanentPatientId: string,
  toothNumber: ToothNumber,
  action: 'diagnosed' | 'canceled',
  condition: string,
  surfaces: ToothSurface[],
  doctorName: string,
  isChange?: boolean,
  previousCondition?: string,
  batchId?: string
): Promise<DatabaseResponse<PlanningRecord>> {
  try {
    const timestamp = new Date().toISOString();
    const timestampNum = Date.now();

    const { data, error } = await supabase
      .from('planning_records')
      .insert({
        permanent_patient_id: permanentPatientId,
        tooth_number: toothNumber,
        action,
        condition,
        surfaces: JSON.stringify(surfaces),
        is_change: isChange || false,
        previous_condition: previousCondition || null,
        doctor_name: doctorName,
        timestamp,
        timestamp_num: timestampNum,
        batch_id: batchId || null,
      })
      .select()
      .single();

    if (error) throw error;

    return { data: { ...data, surfaces: JSON.parse(data.surfaces) }, error: null };
  } catch (error) {
    console.error('Error creating planning record:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get all planning records for a patient
 */
export async function getPlanningRecords(
  permanentPatientId: string
): Promise<DatabaseResponse<PlanningRecord[]>> {
  try {
    const { data, error } = await supabase
      .from('planning_records')
      .select('*')
      .eq('permanent_patient_id', permanentPatientId)
      .order('timestamp', { ascending: false });

    if (error) throw error;

    const records = data?.map((record) => ({
      ...record,
      surfaces: JSON.parse(record.surfaces),
    }));

    return { data: records || [], error: null };
  } catch (error) {
    console.error('Error getting planning records:', error);
    return { data: null, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// Referrals
// ═══════════════════════════════════════════════════════════════

/**
 * Create referral
 */
export async function createReferral(
  permanentPatientId: string,
  toothNumber: ToothNumber | null,  // Allow null for general referrals
  referralType: string,
  doctorName: string,
  notes?: string
): Promise<DatabaseResponse<Referral>> {
  try {
    const { data, error } = await supabase
      .from('referrals')
      .insert({
        permanent_patient_id: permanentPatientId,
        tooth_number: toothNumber,  // Can be null
        referral_type: referralType,
        notes: notes || null,
        doctor_name: doctorName,
        timestamp: new Date().toISOString(),
        status: 'not_given',
      })
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error creating referral:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get all referrals for a patient
 */
export async function getReferrals(
  permanentPatientId: string
): Promise<DatabaseResponse<Referral[]>> {
  try {
    const { data, error } = await supabase
      .from('referrals')
      .select('*')
      .eq('permanent_patient_id', permanentPatientId)
      .order('timestamp', { ascending: false });

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error getting referrals:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Update referral status (not_given → given)
 */
export async function updateReferralStatus(
  referralId: string,
  status: 'not_given' | 'given'
): Promise<DatabaseResponse<Referral>> {
  try {
    const { data, error } = await supabase
      .from('referrals')
      .update({ status })
      .eq('id', referralId)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error updating referral status:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Delete referral by tooth and type
 */
export async function deleteReferral(
  permanentPatientId: string,
  toothNumber: ToothNumber,
  referralType: string
): Promise<DatabaseResponse<null>> {
  try {
    const { error } = await supabase
      .from('referrals')
      .delete()
      .eq('permanent_patient_id', permanentPatientId)
      .eq('tooth_number', toothNumber)
      .eq('referral_type', referralType)
      .eq('status', 'not_given'); // Only delete not_given referrals

    if (error) throw error;

    return { data: null, error: null };
  } catch (error) {
    console.error('Error deleting referral:', error);
    return { data: null, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// Tooth Notes
// ═══════════════════════════════════════════════════════════════

/**
 * Create tooth note
 */
export async function createToothNote(
  permanentPatientId: string,
  toothNumber: ToothNumber,
  note: string,
  doctorName: string
): Promise<DatabaseResponse<ToothNote>> {
  try {
    const { data, error } = await supabase
      .from('tooth_notes')
      .insert({
        permanent_patient_id: permanentPatientId,
        tooth_number: toothNumber,
        note,
        doctor_name: doctorName,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error creating tooth note:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get all notes for a specific tooth
 */
export async function getToothNotes(
  permanentPatientId: string,
  toothNumber: ToothNumber
): Promise<DatabaseResponse<ToothNote[]>> {
  try {
    const { data, error } = await supabase
      .from('tooth_notes')
      .select('*')
      .eq('permanent_patient_id', permanentPatientId)
      .eq('tooth_number', toothNumber)
      .order('timestamp', { ascending: false });

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error getting tooth notes:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get all notes for a patient (all teeth)
 */
export async function getAllToothNotes(
  permanentPatientId: string
): Promise<DatabaseResponse<ToothNote[]>> {
  try {
    const { data, error } = await supabase
      .from('tooth_notes')
      .select('*')
      .eq('permanent_patient_id', permanentPatientId)
      .order('timestamp', { ascending: false });

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error getting all tooth notes:', error);
    return { data: null, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// Complete Dental Chart
// ═══════════════════════════════════════════════════════════════

/**
 * Get complete dental chart for a patient (all data)
 */
export async function getCompleteDentalChart(
  permanentPatientId: string
): Promise<DatabaseResponse<DentalChart>> {
  try {
    // Fetch all data in parallel
    const [
      patientResult,
      teethResult,
      editingResult,
      planningResult,
      referralsResult,
    ] = await Promise.all([
      getPermanentPatientById(permanentPatientId),
      getCompleteToothData(permanentPatientId),
      getEditingRecords(permanentPatientId),
      getPlanningRecords(permanentPatientId),
      getReferrals(permanentPatientId),
    ]);

    // Check for errors
    if (patientResult.error) throw patientResult.error;
    if (teethResult.error) throw teethResult.error;
    if (editingResult.error) throw editingResult.error;
    if (planningResult.error) throw planningResult.error;
    if (referralsResult.error) throw referralsResult.error;

    const dentalChart: DentalChart = {
      patient: patientResult.data!,
      teeth: teethResult.data!,
      editingRecords: editingResult.data!,
      planningRecords: planningResult.data!,
      referrals: referralsResult.data!,
      notes: [],
      scalingRecords: [],
      missingTeeth: [],
      extractedTeeth: [],
      followupTeeth: [],
      treatmentHistory: [],
    };

    return { data: dentalChart, error: null };
  } catch (error) {
    console.error('Error getting complete dental chart:', error);
    return { data: null, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// Scaling Records (Oral Hygiene)
// ═══════════════════════════════════════════════════════════════

/**
 * Create scaling record (oral hygiene - full mouth scaling)
 */
export async function createScalingRecord(
  permanentPatientId: string,
  doctorName: string,
  customDate?: Date
): Promise<DatabaseResponse<ScalingRecord>> {
  try {
    const timestamp = customDate ? customDate.toISOString() : new Date().toISOString();

    const { data, error } = await supabase
      .from('scaling_records')
      .insert({
        permanent_patient_id: permanentPatientId,
        doctor_name: doctorName,
        timestamp,
      })
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error creating scaling record:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Get all scaling records for a patient
 */
export async function getScalingRecords(
  permanentPatientId: string
): Promise<DatabaseResponse<ScalingRecord[]>> {
  try {
    const { data, error } = await supabase
      .from('scaling_records')
      .select('*')
      .eq('permanent_patient_id', permanentPatientId)
      .order('timestamp', { ascending: false });

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error getting scaling records:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Delete scaling record
 */
export async function deleteScalingRecord(
  id: string
): Promise<DatabaseResponse<boolean>> {
  try {
    const { error } = await supabase
      .from('scaling_records')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return { data: true, error: null };
  } catch (error) {
    console.error('Error deleting scaling record:', error);
    return { data: false, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Get next queue number for today
 */
export async function getNextQueueNumber(
  clinicId: string
): Promise<DatabaseResponse<number>> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('patients')
      .select('queue_number')
      .eq('clinic_id', clinicId)
      .eq('visit_date', today)
      .order('queue_number', { ascending: false })
      .limit(1);

    if (error) throw error;

    const nextNumber = data && data.length > 0 ? data[0].queue_number + 1 : 1;

    return { data: nextNumber, error: null };
  } catch (error) {
    console.error('Error getting next queue number:', error);
    return { data: null, error: error as Error };
  }
}

// ---------------------------------------------------------------
// General Notes
// ---------------------------------------------------------------

export async function getGeneralNotes(
  permanentPatientId: string
): Promise<DatabaseResponse<any[]>> {
  try {
    const { data, error } = await supabase
      .from('general_notes')
      .select('*')
      .eq('permanent_patient_id', permanentPatientId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error getting general notes:', error);
    return { data: null, error: error as Error };
  }
}

export async function createGeneralNote(
  permanentPatientId: string,
  note: string,
  doctorName: string
): Promise<DatabaseResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('general_notes')
      .insert({
        permanent_patient_id: permanentPatientId,
        note,
        doctor_name: doctorName,
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating general note:', error);
    return { data: null, error: error as Error };
  }
}

export async function deleteGeneralNote(
  noteId: string
): Promise<DatabaseResponse<null>> {
  try {
    const { error } = await supabase
      .from('general_notes')
      .delete()
      .eq('id', noteId);

    if (error) throw error;
    return { data: null, error: null };
  } catch (error) {
    console.error('Error deleting general note:', error);
    return { data: null, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// Schedule - Doctor Groups
// ═══════════════════════════════════════════════════════════════

export async function getDoctorGroups(clinicId: string): Promise<DatabaseResponse<any[]>> {
  try {
    const { data, error } = await supabase
      .from('doctor_groups')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('sort_order');

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching doctor groups:', error);
    return { data: null, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// Schedule - Doctor Group Members
// ═══════════════════════════════════════════════════════════════

export async function getGroupMembers(groupId: string): Promise<DatabaseResponse<any[]>> {
  try {
    const { data, error } = await supabase
      .from('doctor_group_members')
      .select('*')
      .eq('group_id', groupId)
      .order('doctor_name');

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching group members:', error);
    return { data: null, error: error as Error };
  }
}

export async function getAllGroupMembers(clinicId: string): Promise<DatabaseResponse<any[]>> {
  try {
    const { data, error } = await supabase
      .from('doctor_group_members')
      .select('*, doctor_groups!inner(clinic_id)')
      .eq('doctor_groups.clinic_id', clinicId);

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching all group members:', error);
    return { data: null, error: error as Error };
  }
}

export async function addDoctorToGroup(
  groupId: string,
  doctorId: string,
  doctorName: string,
  workStatus: string = 'active'
): Promise<DatabaseResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('doctor_group_members')
      .insert({ group_id: groupId, doctor_id: doctorId, doctor_name: doctorName, work_status: workStatus })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error adding doctor to group:', error);
    return { data: null, error: error as Error };
  }
}

export async function removeDoctorFromGroup(
  groupId: string,
  doctorId: string
): Promise<DatabaseResponse<null>> {
  try {
    const { error } = await supabase
      .from('doctor_group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('doctor_id', doctorId);

    if (error) throw error;
    return { data: null, error: null };
  } catch (error) {
    console.error('Error removing doctor from group:', error);
    return { data: null, error: error as Error };
  }
}

export async function moveDoctorBetweenGroups(
  doctorId: string,
  fromGroupId: string | null,
  toGroupId: string | null,
  doctorName: string
): Promise<DatabaseResponse<null>> {
  try {
    // Remove from old group
    if (fromGroupId) {
      await supabase
        .from('doctor_group_members')
        .delete()
        .eq('group_id', fromGroupId)
        .eq('doctor_id', doctorId);
    }
    // Add to new group
    if (toGroupId) {
      await supabase
        .from('doctor_group_members')
        .insert({ group_id: toGroupId, doctor_id: doctorId, doctor_name: doctorName });
    }
    return { data: null, error: null };
  } catch (error) {
    console.error('Error moving doctor between groups:', error);
    return { data: null, error: error as Error };
  }
}

export async function updateDoctorWorkStatus(
  groupId: string,
  doctorId: string,
  workStatus: string,
  supervisorDoctorId?: string | null,
): Promise<DatabaseResponse<null>> {
  try {
    // عندما الحالة ليست trainee، نمسح ربط المدرّب تلقائياً.
    // عندما تكون trainee، نحفظ معرّف المدرّب (إن وُجد).
    const updates: Record<string, unknown> = {
      work_status: workStatus,
      updated_at: new Date().toISOString(),
      supervisor_doctor_id: workStatus === 'trainee' ? (supervisorDoctorId ?? null) : null,
    };

    const { error } = await supabase
      .from('doctor_group_members')
      .update(updates)
      .eq('group_id', groupId)
      .eq('doctor_id', doctorId);

    if (error) throw error;
    return { data: null, error: null };
  } catch (error) {
    console.error('Error updating doctor work status:', error);
    return { data: null, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// Schedule - Weekly Slots
// ═══════════════════════════════════════════════════════════════

export async function getWeeklySchedule(
  clinicId: string,
  weekStart: string
): Promise<DatabaseResponse<any[]>> {
  try {
    const { data, error } = await supabase
      .from('schedule_slots')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('week_start', weekStart)
      .order('day_of_week')
      .order('period')
      .order('clinic_number');

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching weekly schedule:', error);
    return { data: null, error: error as Error };
  }
}

export async function upsertScheduleSlot(
  clinicId: string,
  weekStart: string,
  dayOfWeek: string,
  period: number,
  clinicNumber: number,
  doctorId: string,
  doctorName: string,
  role: string,
  status: string = 'active'
): Promise<DatabaseResponse<any>> {
  try {
    // For delegator: replace existing (only one delegator per period)
    if (role === 'delegator') {
      const { data: existing } = await supabase
        .from('schedule_slots')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('week_start', weekStart)
        .eq('day_of_week', dayOfWeek)
        .eq('period', period)
        .eq('role', 'delegator')
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from('schedule_slots')
          .update({ doctor_id: doctorId, doctor_name: doctorName, status, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return { data, error: null };
      }
    }

    // For clinic: allow multiple doctors per clinic number (just insert)
    {
      const { data, error } = await supabase
        .from('schedule_slots')
        .insert({
          clinic_id: clinicId,
          week_start: weekStart,
          day_of_week: dayOfWeek,
          period,
          clinic_number: clinicNumber,
          doctor_id: doctorId,
          doctor_name: doctorName,
          role,
          status,
        })
        .select()
        .single();
      if (error) throw error;
      return { data, error: null };
    }
  } catch (error) {
    console.error('Error upserting schedule slot:', error);
    return { data: null, error: error as Error };
  }
}

export async function deleteScheduleSlot(slotId: string): Promise<DatabaseResponse<null>> {
  try {
    const { error } = await supabase
      .from('schedule_slots')
      .delete()
      .eq('id', slotId);

    if (error) throw error;
    return { data: null, error: null };
  } catch (error) {
    console.error('Error deleting schedule slot:', error);
    return { data: null, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// Schedule - Settings
// ═══════════════════════════════════════════════════════════════

export async function getScheduleSettings(clinicId: string): Promise<DatabaseResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('schedule_settings')
      .select('*')
      .eq('clinic_id', clinicId)
      .maybeSingle();

    if (error) throw error;
    return { data: data || { clinic_count: 2 }, error: null };
  } catch (error) {
    console.error('Error fetching schedule settings:', error);
    return { data: null, error: error as Error };
  }
}

export async function updateScheduleSettings(
  clinicId: string,
  clinicCount: number
): Promise<DatabaseResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('schedule_settings')
      .upsert(
        { clinic_id: clinicId, clinic_count: clinicCount, updated_at: new Date().toISOString() },
        { onConflict: 'clinic_id' }
      )
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating schedule settings:', error);
    return { data: null, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// AI Prompt Templates
// ═══════════════════════════════════════════════════════════════

export async function getPromptTemplates(clinicId: string): Promise<DatabaseResponse<any[]>> {
  try {
    const { data, error } = await supabase
      .from('ai_prompt_templates')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at');
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching prompt templates:', error);
    return { data: null, error: error as Error };
  }
}

export async function createPromptTemplate(
  clinicId: string, name: string, prompt: string, createdBy?: string
): Promise<DatabaseResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('ai_prompt_templates')
      .insert({ clinic_id: clinicId, name, prompt, created_by: createdBy })
      .select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating prompt template:', error);
    return { data: null, error: error as Error };
  }
}

export async function updatePromptTemplate(
  id: string, name: string, prompt: string
): Promise<DatabaseResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('ai_prompt_templates')
      .update({ name, prompt, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating prompt template:', error);
    return { data: null, error: error as Error };
  }
}

export async function deletePromptTemplate(id: string): Promise<DatabaseResponse<null>> {
  try {
    const { error } = await supabase
      .from('ai_prompt_templates')
      .delete().eq('id', id);
    if (error) throw error;
    return { data: null, error: null };
  } catch (error) {
    console.error('Error deleting prompt template:', error);
    return { data: null, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

export async function getNotifications(recipientId: string, limit = 50): Promise<DatabaseResponse<any[]>> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', recipientId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error loading notifications:', error);
    return { data: null, error: error as Error };
  }
}

export async function getUnreadCount(recipientId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', recipientId)
      .eq('is_read', false);
    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }
}

export async function createNotification(notification: {
  clinic_id?: string;
  recipient_id: string;
  sender_id?: string;
  sender_name?: string;
  type: string;
  title: string;
  body: string;
  data?: any;
  action_type?: string;
  action_status?: string;
}): Promise<DatabaseResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .insert(notification)
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating notification:', error);
    return { data: null, error: error as Error };
  }
}

export async function markAsRead(notificationId: string): Promise<DatabaseResponse<null>> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
    if (error) throw error;
    return { data: null, error: null };
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return { data: null, error: error as Error };
  }
}

export async function markAllAsRead(recipientId: string): Promise<DatabaseResponse<null>> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', recipientId)
      .eq('is_read', false);
    if (error) throw error;
    return { data: null, error: null };
  } catch (error) {
    console.error('Error marking all as read:', error);
    return { data: null, error: error as Error };
  }
}

export async function updateNotificationAction(notificationId: string, actionStatus: 'accepted' | 'rejected'): Promise<DatabaseResponse<null>> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ action_status: actionStatus, is_read: true })
      .eq('id', notificationId);
    if (error) throw error;
    return { data: null, error: null };
  } catch (error) {
    console.error('Error updating notification action:', error);
    return { data: null, error: error as Error };
  }
}

export async function deleteNotification(notificationId: string): Promise<DatabaseResponse<null>> {
  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);
    if (error) throw error;
    return { data: null, error: null };
  } catch (error) {
    console.error('Error deleting notification:', error);
    return { data: null, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// PUSH TOKENS
// ═══════════════════════════════════════════════════════════════

export async function savePushToken(userId: string, clinicId: string, token: string, platform: string): Promise<DatabaseResponse<null>> {
  try {
    const { error } = await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, clinic_id: clinicId, token, platform }, { onConflict: 'user_id,token' });
    if (error) throw error;
    return { data: null, error: null };
  } catch (error) {
    console.error('Error saving push token:', error);
    return { data: null, error: error as Error };
  }
}

export async function getPushTokens(userId: string): Promise<DatabaseResponse<any[]>> {
  try {
    const { data, error } = await supabase
      .from('push_tokens')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error getting push tokens:', error);
    return { data: null, error: error as Error };
  }
}

export async function removePushToken(token: string): Promise<DatabaseResponse<null>> {
  try {
    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .eq('token', token);
    if (error) throw error;
    return { data: null, error: null };
  } catch (error) {
    console.error('Error removing push token:', error);
    return { data: null, error: error as Error };
  }
}
