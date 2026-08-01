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
// لماذا فشل؟
// ═══════════════════════════════════════════════════════════════
// أخطاءُ Supabase كائناتٌ عاديّةٌ لا استثناءات، وLogBox يطبعُ عنوانَ السطرِ
// ويبتلعُ الكائن — فيقرأُ المطوّرُ «Error saving day chart:» ولا شيءَ بعدَها.
// فنُسطِّحُها إلى نصٍّ يُطبَع: الرسالةُ ورمزُ Postgres والتفصيل.
// وفشلُ الشبكةِ استثناءٌ حقيقيٌّ رسالتُه «Network request failed» — فيُميَّزُ الاثنان.
export const dbWhy = (e: any): string => {
  if (!e) return 'unknown';
  if (typeof e === 'string') return e;
  const parts = [e.message, e.code ? `code=${e.code}` : null, e.details, e.hint].filter(Boolean);
  return parts.length ? parts.join(' · ') : JSON.stringify(e);
};

// ═══════════════════════════════════════════════════════════════
// Who is acting
// ═══════════════════════════════════════════════════════════════
// A treatment record has to say which doctor did it, by id — this
// province has repeated names, so a name cannot attribute the work.
// The source tables only ever carried the name, so the id is stamped
// here instead of being threaded through a dozen call sites. Set once
// from AuthContext whenever the signed-in doctor changes.

type ActingDoctor = { id: string; name: string; clinicId: string | null };
let acting: ActingDoctor | null = null;

export function setActingDoctor(
  doctor: { id: string; name: string; clinicId?: string | number | null } | null
) {
  acting = doctor
    ? {
        id: doctor.id,
        name: doctor.name,
        clinicId: doctor.clinicId == null ? null : String(doctor.clinicId),
      }
    : null;
}

// stamped onto every source record so its trigger can attribute the event
const actingStamp = () => ({
  doctor_id: acting?.id ?? null,
  clinic_id: acting?.clinicId ?? null,
});

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
        ...actingStamp(),
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
        ...actingStamp(),
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
    // a referral counts when it is HANDED OVER, which can be another
    // doctor on another day than the one who wrote it — so the handover
    // is stamped separately, and cleared if it is taken back
    const given = status === 'given';
    const { data, error } = await supabase
      .from('referrals')
      .update({
        status,
        given_at: given ? new Date().toISOString() : null,
        given_by_id: given ? acting?.id ?? null : null,
        given_by_name: given ? acting?.name ?? null : null,
      })
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
        ...actingStamp(),
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
 * What has actually been done to this patient — the same sources the "Total
 * Treatment Record" in the patient's file reads: the per-tooth editing records
 * and the scaling records, plus any referral that was actually handed over.
 * Not the queue's `treatment` field, which is what a visit was FOR, not what
 * was carried out.
 */
export type PreviousTreatment = {
  id: string;
  kind: 'chart' | 'scaling' | 'referral';
  raw_id: string;
  treatment: string;
  tooth?: number | string | null;
  doctor_id?: string | null;
  doctor_name?: string;
  timestamp: string;
};

export async function getPreviousTreatments(
  permanentPatientId: string
): Promise<DatabaseResponse<PreviousTreatment[]>> {
  try {
    const [edits, scalings, referrals] = await Promise.all([
      getEditingRecords(permanentPatientId),
      getScalingRecords(permanentPatientId),
      getReferrals(permanentPatientId),
    ]);

    // kind + raw_id so this list can also be the place a mistake is taken back
    const out: PreviousTreatment[] = [
      ...(edits.data || []).map((r: any) => ({
        id: `e-${r.id}`,
        kind: 'chart' as const,
        raw_id: r.id,
        treatment: r.treatment,
        tooth: r.tooth_number,
        doctor_id: r.doctor_id ?? null,
        doctor_name: r.doctor_name,
        timestamp: r.timestamp,
      })),
      ...(scalings.data || []).map((r: any) => ({
        id: `s-${r.id}`,
        kind: 'scaling' as const,
        raw_id: r.id,
        treatment: 'Scaling',
        tooth: null,
        doctor_id: r.doctor_id ?? null,
        doctor_name: r.doctor_name,
        timestamp: r.timestamp,
      })),
      // a referral only counts as done to the patient once it was handed over
      ...(referrals.data || [])
        .filter((r: any) => r.status === 'given')
        .map((r: any) => ({
          id: `r-${r.id}`,
          kind: 'referral' as const,
          raw_id: r.id,
          treatment: `Referral · ${r.department || r.referral_type || 'Department'}`,
          tooth: r.tooth_number ?? null,
          // the handover is the act, so it is the handover that is credited
          doctor_id: r.given_by_id ?? r.doctor_id ?? null,
          doctor_name: r.given_by_name || r.doctor_name,
          timestamp: r.given_at || r.timestamp || r.created_at,
        })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return { data: out, error: null };
  } catch (error) {
    console.error('Error getting previous treatments:', error);
    return { data: null, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// Undoing one treatment
// ═══════════════════════════════════════════════════════════════
// A wrong tooth is a wrong tooth: the record has to go, and so does the
// colour it put on the chart — a tooth that was never filled must not
// keep reading as filled. The statistic follows on its own, because the
// event is bound to the record (see sql/treatment_events.sql).
//
// Writing a treatment onto a tooth always wipes that tooth's surfaces
// and rewrites them, so a tooth shows whatever its LATEST record says.
// Undoing one record is therefore: drop it, wipe the tooth, then re-lay
// whatever is now the latest — or, if nothing is left, put the tooth
// back to what it was diagnosed as.

const ALL_SURFACES: ToothSurface[] = ['mesial', 'distal', 'buccal', 'lingual', 'occlusal'];

// records store the label the doctor saw, not the internal key
const DETAIL_CONDITION: { [label: string]: ToothCondition } = {
  'Temporary Filling': 'filling_replacement',
  'Permanent Filling': 'permanent_filling',
  'GI Filling': 'gi',
  'Direct Pulp Capping': 'direct_pulp_capping',
  'Indirect Pulp Capping': 'indirect_pulp_capping',
};

const DIAGNOSIS_CONDITION: { [label: string]: ToothCondition } = {
  'Caries': 'caries',
  'Broken/Inappropriate Filling': 'broken',
  'Broken\\Inappropriate Filling': 'broken',
  'Pulpectomy': 'pulpectomy',
  'Follow-up': 'follow_up',
  'Needs More Diagnosis': 'needs_diagnosis',
  'Temporary Filling': 'filling_replacement',
  'Permanent Filling': 'permanent_filling',
  'Restoration to Replace': 'filling_replacement',
  // Fracture and Impacted have no surface colour in this chart, so they
  // restore to a clear tooth — which is what the chart showed anyway
  'Root Canal Treated': 'treated',
  'Direct Pulp Capping': 'direct_pulp_capping',
  'Indirect Pulp Capping': 'indirect_pulp_capping',
  'GI': 'gi',
};

const SURFACE_ALIAS: { [name: string]: ToothSurface } = {
  mesial: 'mesial', distal: 'distal', buccal: 'buccal',
  lingual: 'lingual', palatal: 'lingual', occlusal: 'occlusal',
};

// a diagnosis surface may read "caries (mesial)" or just "mesial"
const surfaceOf = (label: string): ToothSurface | null => {
  const inParens = label.match(/\(([^)]+)\)/);
  const name = (inParens ? inParens[1] : label).trim().toLowerCase();
  return SURFACE_ALIAS[name] || null;
};

const paintAll = async (pid: string, tooth: ToothNumber, condition: ToothCondition) => {
  for (const s of ALL_SURFACES) await saveToothSurfaceCondition(pid, tooth, s, condition);
};

/** Re-lay what one treatment record puts on its tooth. */
async function applyEditingRecord(pid: string, rec: any) {
  const tooth = rec.tooth_number as ToothNumber;

  if (/extract/i.test(rec.treatment || '')) {
    await paintAll(pid, tooth, 'missing');
    return;
  }

  const condition = DETAIL_CONDITION[rec.details];
  let surfaces: string[] = [];
  try { surfaces = JSON.parse(rec.surfaces || '[]'); } catch { surfaces = []; }

  // no detail or no surfaces chosen means the doctor left the tooth
  // reading healthy — which the wipe has already done
  if (!condition || !surfaces.length) return;

  for (const s of surfaces) {
    const surface = surfaceOf(s);
    if (surface) await saveToothSurfaceCondition(pid, tooth, surface, condition);
  }
}

/** Put a tooth back to what it was diagnosed as, before any treatment. */
async function restoreDiagnosis(pid: string, tooth: ToothNumber) {
  const { data } = await supabase
    .from('planning_records')
    .select('*')
    .eq('permanent_patient_id', pid)
    .eq('tooth_number', tooth)
    .eq('action', 'diagnosed')
    .order('timestamp_num', { ascending: true });

  for (const record of data || []) {
    let surfaces: string[] = [];
    try { surfaces = JSON.parse(record.surfaces || '[]'); } catch { surfaces = []; }
    const condition = DIAGNOSIS_CONDITION[record.condition];

    if (record.condition === 'Extraction' || surfaces.some((s) => /extraction/i.test(s))) {
      await paintAll(pid, tooth, 'extraction');
    } else if (surfaces.some((s) => /^missing tooth$/i.test(s))) {
      await paintAll(pid, tooth, 'missing');
    } else if (surfaces.some((s) => s === 'Root Canal Treated')) {
      // RCT is drawn as a border, not surface colour — nothing to restore
    } else if (condition && surfaces.some((s) => s.toLowerCase() === 'all surfaces')) {
      await paintAll(pid, tooth, condition);
    } else if (condition) {
      for (const s of surfaces) {
        const surface = surfaceOf(s);
        if (surface) await saveToothSurfaceCondition(pid, tooth, surface, condition);
      }
    }
  }
}

/**
 * Undo one treatment: the record, the chart, and the statistic.
 * Only the doctor who recorded it may take it back.
 */
export async function revertEditingRecord(recordId: string): Promise<DatabaseResponse<null>> {
  try {
    const { data: rec, error: readError } = await supabase
      .from('editing_records')
      .select('*')
      .eq('id', recordId)
      .single();

    if (readError || !rec) throw readError || new Error('Record not found');

    // a doctor corrects their own work; another doctor's numbers are not
    // theirs to change. Older records carry only a name, so fall back to it.
    const owned = rec.doctor_id
      ? rec.doctor_id === acting?.id
      : !!acting?.name && rec.doctor_name === acting.name;
    if (!owned) {
      return { data: null, error: new Error(`Only Dr. ${rec.doctor_name || 'the recording doctor'} can undo this`) };
    }

    const pid = rec.permanent_patient_id as string;
    const tooth = rec.tooth_number as ToothNumber;

    // the event goes with it, by trigger
    const { error: delError } = await supabase.from('editing_records').delete().eq('id', recordId);
    if (delError) throw delError;

    for (const s of ALL_SURFACES) await deleteToothSurfaceCondition(pid, tooth, s);

    const { data: rest } = await supabase
      .from('editing_records')
      .select('*')
      .eq('permanent_patient_id', pid)
      .eq('tooth_number', tooth)
      .order('timestamp_num', { ascending: false })
      .limit(1);

    if (rest && rest.length > 0) await applyEditingRecord(pid, rest[0]);
    else await restoreDiagnosis(pid, tooth);

    return { data: null, error: null };
  } catch (error) {
    console.error('Error reverting editing record:', error);
    return { data: null, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// Treatment statistics
// ═══════════════════════════════════════════════════════════════

export type TreatmentStats = { treatments: { [key: string]: number }; total: number };

/**
 * What was actually done, in a window of time.
 *
 * Reads the treatment_events log, which is written by the acts
 * themselves. Nothing is derived here and nothing is filtered out
 * afterwards: the query is bounded by date in the database, so it
 * stays the same size whether a doctor has worked a week or a decade.
 */
export async function getTreatmentStats(opts: {
  doctorId?: string | null;
  clinicId?: string | null;
  from: Date;
  to: Date;
}): Promise<DatabaseResponse<TreatmentStats>> {
  try {
    let query = supabase
      .from('treatment_events')
      .select('treatment')
      .gte('performed_at', opts.from.toISOString())
      .lte('performed_at', opts.to.toISOString());

    if (opts.doctorId) query = query.eq('doctor_id', opts.doctorId);
    if (opts.clinicId) query = query.eq('clinic_id', String(opts.clinicId));

    const { data, error } = await query;
    if (error) throw error;

    const treatments: { [key: string]: number } = {};
    (data || []).forEach((row: any) => {
      const name = row.treatment || 'Unknown';
      treatments[name] = (treatments[name] || 0) + 1;
    });

    return { data: { treatments, total: (data || []).length }, error: null };
  } catch (error) {
    console.error('Error getting treatment stats:', error);
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
    // scaling counts towards the day's work now, so the same rule holds
    // as for a treatment: a doctor takes back their own record, not
    // someone else's numbers
    const { data: rec } = await supabase
      .from('scaling_records')
      .select('doctor_id, doctor_name')
      .eq('id', id)
      .single();

    if (rec) {
      const owned = rec.doctor_id
        ? rec.doctor_id === acting?.id
        : !!acting?.name && rec.doctor_name === acting.name;
      if (!owned) {
        return { data: false, error: new Error(`Only Dr. ${rec.doctor_name || 'the recording doctor'} can delete this`) };
      }
    }

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

// حفظٌ موضعيٌّ للتبديلِ اليدويّ: يستبدلُ خاناتِ العيادة/الدليقيتر **النشطةَ فقط** ليومٍ واحد
// بالترتيبِ الجديد. لا يمسُّ الغيابَ (status≠active) ولا الاحتياطَ (EX/extra) ولا الصفوفَ
// الداخليّةَ (prev_placement/xday) — فيبقى سجلُّ التغطية/الإلغاءِ سليمًا (خلافًا لإعادةِ
// الكتابةِ الكاملةِ في saveSlots التي تحذفُ كلَّ النشط).
export async function replaceDayClinicSlots(
  clinicId: string,
  weekStart: string,
  dayOfWeek: string,
  rows: Array<{
    period: number;
    clinic_number: number;
    doctor_id: string;
    doctor_name: string;
    role: string;      // 'clinic' | 'delegator'
    source: string;    // 'ai' | 'shadow'
    status?: string;   // 'active' (افتراضيّ) | 'extra' للاحتياطيّ — يشملُه السواب
  }>,
): Promise<{ error: Error | null }> {
  try {
    // احذفِ الخاناتِ القابلةَ للتبديل لهذا اليوم: العيادة/الدليقيتر النشطة **والاحتياطيّ** (extra,
    // period=0). المتغيّبون (sick/vacation/permission) لا يُمَسّون. saveSwap يمرّرُ كلَّ هذه الخانات
    // (من swapEdit كاملًا) فتُعادُ كتابتُها كلُّها — فالتبديلُ العاديُّ للعيادةِ يُعيدُ الاحتياطَ كما هو.
    const { error: delErr } = await supabase
      .from('schedule_slots')
      .delete()
      .eq('clinic_id', clinicId)
      .eq('week_start', weekStart)
      .eq('day_of_week', dayOfWeek)
      .eq('status', 'active')
      .in('role', ['clinic', 'delegator']);
    if (delErr) throw delErr;
    const { error: delEx } = await supabase
      .from('schedule_slots')
      .delete()
      .eq('clinic_id', clinicId)
      .eq('week_start', weekStart)
      .eq('day_of_week', dayOfWeek)
      .eq('status', 'extra')
      .eq('period', 0);
    if (delEx) throw delEx;

    if (rows.length > 0) {
      const insertRows = rows.map((r) => ({
        clinic_id: clinicId,
        week_start: weekStart,
        day_of_week: dayOfWeek,
        period: r.period,
        clinic_number: r.clinic_number,
        doctor_id: r.doctor_id,
        doctor_name: r.doctor_name,
        role: r.role,
        status: r.status ?? 'active',
        source: r.source,
      }));
      const { error: insErr } = await supabase.from('schedule_slots').insert(insertRows);
      if (insErr) throw insErr;
    }
    return { error: null };
  } catch (error) {
    console.error('Error replacing day clinic slots:', error);
    return { error: error as Error };
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
    console.error('Error fetching schedule settings:', dbWhy(error), '· clinic', clinicId);
    return { data: null, error: error as Error };
  }
}

// المدّة المطلوبة للمريض في العيادة (دقائق) — يحدّدها الطبيب على الكرت. null = إلغاء.
export async function updatePatientExpectedMinutes(
  patientId: string,
  minutes: number | null
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('patients')
      .update({ expected_minutes: minutes })
      .eq('id', patientId);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error updating expected_minutes:', error);
    return { error: error as Error };
  }
}

// موعدُ الدخول المحجوز (دقائقُ من منتصف الليل)، أو null لإلغاءِ الحجزِ والعودةِ للدور.
export async function updatePatientAppointment(
  patientId: string,
  appointmentMin: number | null
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('patients')
      .update({ appointment_min: appointmentMin })
      .eq('id', patientId);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error updating appointment_min:', error);
    return { error: error as Error };
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

// أوقاتُ الاستراحة (بريك) لكلِّ العيادات — مصفوفة {start,end} بالدقائق من منتصف الليل. تُقرأ مع بقيّة الإعدادات.
export async function updateScheduleBreaks(
  clinicId: string,
  breaks: { start: number; end: number; fixed?: boolean }[]
): Promise<DatabaseResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('schedule_settings')
      .upsert(
        { clinic_id: clinicId, breaks, updated_at: new Date().toISOString() },
        { onConflict: 'clinic_id' }
      )
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating schedule breaks:', error);
    return { data: null, error: error as Error };
  }
}

// عددُ كراسي **مخطّطِ الدور** للمركز (sql/add_chart_chairs.sql). رقمُ المركزِ لا رقمُ الهاتف:
// مَن كتبَه رآه كلُّ مَن في المركز. وهو عمودٌ مستقلٌّ عن clinic_count — **لا يُغيّرُ جدولَ الدوام**
// ولا يُقرأُ عندَ بنائِه. الحمولةُ تحملُ chart_chairs وحدَه، فالأعمدةُ الأخرى لا تُمَسُّ في التحديث.
export async function updateChartChairs(
  clinicId: string,
  chairs: number | null
): Promise<DatabaseResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('schedule_settings')
      .upsert(
        { clinic_id: clinicId, chart_chairs: chairs, updated_at: new Date().toISOString() },
        { onConflict: 'clinic_id' }
      )
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating chart chairs:', error);
    return { data: null, error: error as Error };
  }
}

// ═══════════════════════════════════════════════════════════════
// Queue day charts — لقطةُ مخطّطِ الدورِ لكلِّ يوم (sql/queue_day_charts.sql)
// ═══════════════════════════════════════════════════════════════

// يومٌ واحدٌ لكلِّ مركز: الكتابةُ تُحدِّثُ اللقطةَ نفسَها فتبقى الأحدثُ هي المحفوظة.
export async function saveDayChart(
  clinicId: string, day: string, chart: any
): Promise<DatabaseResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('queue_day_charts')
      .upsert(
        { clinic_id: clinicId, day, chart, saved_at: new Date().toISOString() },
        { onConflict: 'clinic_id,day' }
      )
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error saving day chart:', dbWhy(error), '· clinic', clinicId, '· day', day);
    return { data: null, error: error as Error };
  }
}

export async function getDayChart(
  clinicId: string, day: string
): Promise<DatabaseResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('queue_day_charts')
      .select('chart, saved_at')
      .eq('clinic_id', clinicId)
      .eq('day', day)
      .maybeSingle();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error loading day chart:', dbWhy(error), '· clinic', clinicId, '· day', day);
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

/**
 * اشتراك فوريّ (Realtime) على إشعارات مستخدمٍ بعينه. يستدعي onChange فور
 * إدراج/تحديث أيّ إشعار له — فيصل الإشعار لحظيًّا والتطبيق مفتوح (يعمل في
 * Expo Go أيضًا). يُرجِع دالّة لإلغاء الاشتراك. يتطلّب تفعيل Realtime على
 * جدول notifications في لوحة Supabase.
 *
 * إضافةً للوصول اللحظيّ: يستدعي onChange مرّةً عند كلّ **اشتراكٍ ناجح** (status
 * = SUBSCRIBED) — أيْ عند الاتّصال الأوّل **وبعد كلّ إعادة اتّصالٍ** يُجريها العميل
 * تلقائيًّا بعد انقطاع. هذه المزامنةُ-عند-الاتّصال تلتقط ما فات أثناء الانقطاع
 * فتُغني عن الفحص الدوريّ (setInterval) الذي كان يُحدِث طلباتِ شبكةٍ متكرّرة.
 */
export function subscribeToNotifications(recipientId: string, onChange: () => void): () => void {
  if (!recipientId) return () => {};
  const channel = supabase
    .channel(`notifications:${recipientId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${recipientId}` },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${recipientId}` },
      () => onChange(),
    )
    .subscribe((status) => {
      // SUBSCRIBED يُطلَق عند الاتّصال الأوّل وبعد كلّ إعادة اتّصال → مزامنةٌ واحدة
      // تلتقط أيّ إشعارٍ وصل أثناء الانقطاع (بديلُ الفحص الدوريّ).
      if (status === 'SUBSCRIBED') onChange();
    });
  return () => { try { supabase.removeChannel(channel); } catch { /* تجاهل */ } };
}

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
  } catch (error: any) {
    const msg = error?.message || error?.code || '';
    if (!/network request failed|failed to fetch/i.test(String(msg))) {
      console.error('Error loading notifications:', error);
    }
    return { data: null, error: error as Error };
  }
}

export async function getUnreadCount(recipientId: string): Promise<number> {
  if (!recipientId) return 0; // أثناء تحميل المصادقة قد يكون المُعرّف فارغًا
  try {
    // استعلام select بسيط أوثق من head-count (الأخير يُرجِع خطأً فارغًا أحيانًا).
    // نستثني أنواع محادثة الذكاء (مكانها الجات لا الجرس). أمّا طلبُ التبديل فيُعَدّ هنا:
    // كرتُه في صفحة الإشعارات، ويبقى غيرَ مقروءٍ (is_read=false) حتى يُوافَق/يُرفَض
    // (المحرّك يضبط is_read=true عند المعالجة)، فيظلّ الباجُ على الجرس حتى معالجةِ الطلب —
    // ويصمد عبر إغلاقِ التطبيق وفتحِه لأنّ العدّ من قاعدةِ البيانات لا من الذاكرة.
    // طلبُ التبديلِ متعدّدُ الأيّام = صفٌّ لكلِّ يوم، لكنّه **طلبٌ واحد**: نعُدُّه ١ لكلِّ مجموعة
    // (swap_batch) لا لكلِّ يوم — يبقى ١ ما دام يومٌ واحدٌ معلّقًا، ويصفرُ حين تُعالَج كلُّ الأيّام.
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, data')
      .eq('recipient_id', recipientId)
      .eq('is_read', false)
      .not('type', 'in', '("gap_alert","request_result","seat_change")');
    if (error) throw error;
    let count = 0;
    const seenSwap = new Set<string>();
    for (const row of (data || []) as any[]) {
      if (row.type === 'swap_request') {
        const key = row.data?.swap_batch || row.id;
        if (!seenSwap.has(key)) { seenSwap.add(key); count += 1; }
      } else count += 1;
    }
    // eslint-disable-next-line no-console
    console.log(`[bell-count] recipient=${recipientId.slice(0, 8)} unread=${count}`);
    return count;
  } catch (error: any) {
    // فشل الشبكة عابر (انقطاع/خمول) — لا نُزعج بـERROR، نُرجِع 0 بهدوء
    const msg = error?.message || error?.code || '';
    if (!/network request failed|failed to fetch/i.test(String(msg))) {
      console.error('Error getting unread count:', msg || JSON.stringify(error));
    }
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
  is_read?: boolean;
}): Promise<DatabaseResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .insert(notification)
      .select()
      .single();
    if (error) throw error;
    // ملاحظة: الدفع (push) يُرسله مُحفِّز قاعدة البيانات
    // trigger_push_on_notification عند الإدراج — لا نُكرّره هنا في الـJS
    // (التكرار كان يسبّب رنّتين). صمت gap_alert يُدار في المُحفِّز.
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

// ignored/done: قرارا السحب اليدويّان على كرت التغطية (تجاهلٌ شخصيّ / حُلّت يدويًّا)
export async function updateNotificationAction(notificationId: string, actionStatus: 'accepted' | 'rejected' | 'ignored' | 'done'): Promise<DatabaseResponse<null>> {
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

/** يحدّث حقل data للإشعار (دمجٌ كامل — مرّر الكائن النهائيّ). يُستعمل لتخزين خيط
 *  محادثة كرت التغطية فلا يُعاد توليده عند كلّ فتح (توفير توكن). */
export async function updateNotificationData(
  notificationId: string,
  data: Record<string, unknown>,
): Promise<DatabaseResponse<null>> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ data })
      .eq('id', notificationId);
    if (error) throw error;
    return { data: null, error: null };
  } catch (error) {
    console.error('Error updating notification data:', error);
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
    // رمز واحد لكلّ مستخدم على نفس المنصّة: احذف رموزه القديمة المختلفة أولًا
    // (رموز Expo القديمة تبقى وتسبّب رنينًا مكرّرًا على نفس الجهاز).
    await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('platform', platform)
      .neq('token', token);
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
