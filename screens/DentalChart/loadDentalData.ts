import { Alert } from 'react-native';
import {
  getCompleteToothData,
  getEditingRecords,
  getPlanningRecords,
  getAllToothNotes,
  getReferrals,
  getScalingRecords,
} from '../../lib/database';
import {
  ToothSurfaceConditions,
  convertPalmerToNumber,
  formatTimestamp,
  getSurfaceNameMap,
  getConditionFromDetails,
} from './dentalHelpers';
import type { ToothNumber, ToothCondition } from '../../types';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ToothRecord {
  type: 'editing' | 'planning';
  treatment?: string;
  details?: string;
  action?: 'diagnosed' | 'canceled';
  condition?: string;
  surfaces: string[];
  timestamp: string;
  timestampNum: number;
  doctorName: string;
  isChange?: boolean;
  previousCondition?: string;
}

export interface ToothNote {
  text: string;
  timestamp: string;
  doctorName: string;
}

export interface ScalingRecordData {
  id: string;
  timestamp: string;
  doctorName: string;
  timestampNum: number;
}

export interface PlanningRecordGlobal {
  toothNumber: number;
  action: 'diagnosed' | 'canceled';
  condition: string;
  surfaces: string[];
  timestamp: string;
  timestampNum: number;
  doctorName: string;
  isChange?: boolean;
  previousCondition?: string;
}

export interface ReferralRecordData {
  departmentKey: string;
  departmentName: string;
  teeth: number[];
  timestamp: string;
  timestampNum: number;
  doctorName: string;
}

export interface LoadedDentalData {
  toothConditions: Record<number, ToothSurfaceConditions>;
  toothBorderColors: Record<number, ToothCondition>;
  toothRecords: Record<number, ToothRecord[]>;
  toothNotes: Record<number, ToothNote[]>;
  allPlanningRecordsGlobal: PlanningRecordGlobal[];
  selectedReferralFor: Record<number, string[]>;
  referrals: Record<string, boolean>;
  referralStatus: Record<string, 'not_given' | 'given'>;
  referralRecords: ReferralRecordData[];
  scalingRecords: ScalingRecordData[];
}

// ═══════════════════════════════════════════════════════════════
// Referral Type Mapping
// ═══════════════════════════════════════════════════════════════

const REFERRAL_TYPE_TO_KEY_MAP: Record<string, string> = {
  'Endodontics': 'endodontics',
  'Oral Surgery': 'oralSurgery',
  'Orthodontics': 'orthodontics',
  'Prosthodontics': 'prosthodontics',
  'Periodontics': 'periodontics',
  'Pediatric Dentistry': 'pediatricDentistry',
};

// ═══════════════════════════════════════════════════════════════
// Data Processing Functions
// ═══════════════════════════════════════════════════════════════

function processToothData(toothData: any[]): Record<number, ToothSurfaceConditions> {
  const conditions: Record<number, ToothSurfaceConditions> = {};

  toothData.forEach((tooth) => {
    const toothNumber = convertPalmerToNumber(tooth.tooth_number as ToothNumber);
    if (toothNumber) {
      conditions[toothNumber] = {
        top: tooth.surfaces.top || null,
        bottom: tooth.surfaces.bottom || null,
        left: tooth.surfaces.left || null,
        right: tooth.surfaces.right || null,
        center: tooth.surfaces.center || null,
      };
    }
  });

  return conditions;
}

function processEditingRecords(editingData: any[]): {
  records: Record<number, ToothRecord[]>;
  borderColors: Record<number, ToothCondition>;
  conditions: Record<number, ToothSurfaceConditions>;
} {
  const records: Record<number, ToothRecord[]> = {};
  const borderColors: Record<number, ToothCondition> = {};
  const conditions: Record<number, ToothSurfaceConditions> = {};

  editingData.forEach((record) => {
    const toothNumber = convertPalmerToNumber(record.tooth_number as ToothNumber);
    if (!toothNumber) return;

    const parsedSurfaces = typeof record.surfaces === 'string'
      ? JSON.parse(record.surfaces)
      : record.surfaces;

    if (!records[toothNumber]) {
      records[toothNumber] = [];
    }

    records[toothNumber].push({
      type: 'editing',
      treatment: record.treatment,
      details: record.details || '',
      surfaces: parsedSurfaces,
      timestamp: formatTimestamp(new Date(record.timestamp)),
      timestampNum: record.timestamp_num || Date.now(),
      doctorName: record.doctor_name,
    });

    // Border colors from Pulpectomy
    if (record.treatment === 'Pulpectomy') {
      borderColors[toothNumber] = 'pulpectomy';
    }

    // Conditions from Extraction
    if (record.treatment === 'Extraction') {
      conditions[toothNumber] = {
        top: 'missing',
        bottom: 'missing',
        left: 'missing',
        right: 'missing',
        center: 'missing',
      };
    } else if (record.details && Array.isArray(parsedSurfaces)) {
      const surfaceNameMap = getSurfaceNameMap(toothNumber);
      const conditionColor = getConditionFromDetails(record.details);

      if (conditionColor && conditionColor !== 'treated' && Array.isArray(parsedSurfaces)) {
        if (!conditions[toothNumber]) {
          conditions[toothNumber] = {
            top: null,
            bottom: null,
            left: null,
            right: null,
            center: null,
          };
        }

        parsedSurfaces.forEach((surfaceName: string) => {
          const surfaceKey = surfaceNameMap[surfaceName];
          if (surfaceKey) {
            conditions[toothNumber][surfaceKey] = conditionColor;
          }
        });
      }
    }
  });

  return { records, borderColors, conditions };
}

function processPlanningRecords(planningData: any[]): {
  globalRecords: PlanningRecordGlobal[];
  toothRecords: Record<number, ToothRecord[]>;
  borderColors: Record<number, ToothCondition>;
} {
  const globalRecords: PlanningRecordGlobal[] = [];
  const toothRecords: Record<number, ToothRecord[]> = {};
  const borderColors: Record<number, ToothCondition> = {};

  planningData.forEach((record) => {
    const toothNumber = convertPalmerToNumber(record.tooth_number as ToothNumber);
    if (!toothNumber) return;

    const surfaces = typeof record.surfaces === 'string'
      ? JSON.parse(record.surfaces)
      : record.surfaces;

    const planningRecord: PlanningRecordGlobal = {
      toothNumber,
      action: record.action,
      condition: record.condition,
      surfaces,
      timestamp: formatTimestamp(new Date(record.timestamp)),
      timestampNum: record.timestamp_num || Date.now(),
      doctorName: record.doctor_name,
      isChange: record.is_change,
      previousCondition: record.previous_condition,
    };

    globalRecords.push(planningRecord);

    // Add to tooth records
    if (!toothRecords[toothNumber]) {
      toothRecords[toothNumber] = [];
    }

    toothRecords[toothNumber].push({
      type: 'planning',
      action: record.action,
      condition: record.condition,
      surfaces,
      timestamp: planningRecord.timestamp,
      timestampNum: planningRecord.timestampNum,
      doctorName: record.doctor_name,
      isChange: record.is_change,
      previousCondition: record.previous_condition,
    });

    // Root Canal Treated detection
    if (surfaces.includes('Root Canal Treated')) {
      borderColors[toothNumber] = 'treated';
    }
  });

  return { globalRecords, toothRecords, borderColors };
}

function processToothNotes(notesData: any[]): Record<number, ToothNote[]> {
  const notes: Record<number, ToothNote[]> = {};

  notesData.forEach((note) => {
    const toothNumber = convertPalmerToNumber(note.tooth_number as ToothNumber);
    if (!toothNumber) return;

    if (!notes[toothNumber]) {
      notes[toothNumber] = [];
    }

    notes[toothNumber].push({
      text: note.note,
      timestamp: formatTimestamp(new Date(note.timestamp)),
      doctorName: note.doctor_name,
    });
  });

  return notes;
}

function processReferrals(referralsData: any[]): {
  selectedReferralFor: Record<number, string[]>;
  referrals: Record<string, boolean>;
  referralStatus: Record<string, 'not_given' | 'given'>;
  referralRecords: ReferralRecordData[];
} {
  const selectedReferralFor: Record<number, string[]> = {};
  const referrals: Record<string, boolean> = {};
  const referralStatus: Record<string, 'not_given' | 'given'> = {};
  const referralRecords: ReferralRecordData[] = [];

  // Separate by status
  const notGivenReferrals = referralsData.filter(r => r.status === 'not_given' || !r.status);
  const givenReferrals = referralsData.filter(r => r.status === 'given');

  // Process Not Given referrals
  notGivenReferrals.forEach((referral) => {
    const referralKey = REFERRAL_TYPE_TO_KEY_MAP[referral.referral_type] || referral.referral_type;

    // Mark department as having referrals
    referrals[referralKey] = true;
    referralStatus[referralKey] = 'not_given';

    // Skip general referrals (tooth_number is null)
    if (!referral.tooth_number) return;

    const toothNumber = convertPalmerToNumber(referral.tooth_number as ToothNumber);
    if (toothNumber) {
      if (!selectedReferralFor[toothNumber]) {
        selectedReferralFor[toothNumber] = [];
      }
      if (!selectedReferralFor[toothNumber].includes(referralKey)) {
        selectedReferralFor[toothNumber].push(referralKey);
      }
    }
  });

  // Process Given referrals
  const givenByDept = new Map<string, ReferralRecordData>();

  givenReferrals.forEach((referral) => {
    const referralKey = REFERRAL_TYPE_TO_KEY_MAP[referral.referral_type] || referral.referral_type;
    const givenTime = new Date(referral.given_at || referral.created_at);
    const roundedTime = new Date(
      givenTime.getFullYear(),
      givenTime.getMonth(),
      givenTime.getDate(),
      givenTime.getHours(),
      givenTime.getMinutes()
    );
    const batchKey = `${referralKey}-${roundedTime.getTime()}`;

    const formatTimestampForReferral = (date: Date) => date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Handle general referrals
    if (!referral.tooth_number) {
      if (!givenByDept.has(batchKey)) {
        givenByDept.set(batchKey, {
          departmentKey: referralKey,
          departmentName: referral.referral_type,
          teeth: [],
          timestamp: formatTimestampForReferral(givenTime),
          timestampNum: givenTime.getTime(),
          doctorName: referral.doctor_name || 'Dr. Unknown'
        });
      }
      return;
    }

    // Handle tooth-specific referrals
    const toothNumber = convertPalmerToNumber(referral.tooth_number as ToothNumber);
    if (toothNumber) {
      const existingRecord = givenByDept.get(batchKey);

      if (existingRecord) {
        if (!existingRecord.teeth.includes(toothNumber)) {
          existingRecord.teeth.push(toothNumber);
        }
      } else {
        givenByDept.set(batchKey, {
          departmentKey: referralKey,
          departmentName: referral.referral_type,
          teeth: [toothNumber],
          timestamp: formatTimestampForReferral(givenTime),
          timestampNum: givenTime.getTime(),
          doctorName: referral.doctor_name || 'Dr. Unknown'
        });
      }
    }
  });

  referralRecords.push(...Array.from(givenByDept.values()));

  return { selectedReferralFor, referrals, referralStatus, referralRecords };
}

function processScalingRecords(scalingData: any[]): ScalingRecordData[] {
  return scalingData.map((record) => ({
    id: record.id,
    timestamp: formatTimestamp(new Date(record.timestamp)),
    doctorName: record.doctor_name,
    timestampNum: new Date(record.timestamp).getTime(),
  }));
}

// ═══════════════════════════════════════════════════════════════
// Main Loading Function
// ═══════════════════════════════════════════════════════════════

export async function loadPatientDentalData(
  permanentPatientId: string
): Promise<LoadedDentalData | null> {
  try {
    console.log('🚀 Loading dental data for patient (PARALLEL):', permanentPatientId);
    const startTime = performance.now();

    // Load ALL data in PARALLEL
    const [
      toothDataResult,
      editingDataResult,
      planningDataResult,
      notesDataResult,
      referralsDataResult,
      scalingDataResult
    ] = await Promise.all([
      getCompleteToothData(permanentPatientId),
      getEditingRecords(permanentPatientId),
      getPlanningRecords(permanentPatientId),
      getAllToothNotes(permanentPatientId),
      getReferrals(permanentPatientId),
      getScalingRecords(permanentPatientId)
    ]);

    const loadTime = performance.now() - startTime;
    console.log(`✅ All data loaded in ${loadTime.toFixed(0)}ms`);

    // Initialize result
    const result: LoadedDentalData = {
      toothConditions: {},
      toothBorderColors: {},
      toothRecords: {},
      toothNotes: {},
      allPlanningRecordsGlobal: [],
      selectedReferralFor: {},
      referrals: {},
      referralStatus: {},
      referralRecords: [],
      scalingRecords: [],
    };

    // Process tooth surface conditions
    const { data: toothData, error: toothError } = toothDataResult;
    if (toothError) {
      console.error('Error loading tooth data:', toothError);
      Alert.alert('خطأ', 'فشل تحميل بيانات الأسنان');
      return null;
    }

    if (toothData && toothData.length > 0) {
      result.toothConditions = processToothData(toothData);
      console.log('📦 Loaded tooth conditions for', Object.keys(result.toothConditions).length, 'teeth');
    }

    // Process editing records
    const { data: editingData, error: editingError } = editingDataResult;
    if (editingError) {
      console.error('Error loading editing records:', editingError);
    } else if (editingData && editingData.length > 0) {
      const editingResult = processEditingRecords(editingData);
      result.toothRecords = { ...result.toothRecords, ...editingResult.records };
      result.toothBorderColors = { ...result.toothBorderColors, ...editingResult.borderColors };
      // Note: editingResult.conditions is for display only, not applied to toothConditions
      console.log('📦 Loaded editing records for', Object.keys(editingResult.records).length, 'teeth');
    }

    // Process planning records
    const { data: planningData, error: planningError } = planningDataResult;
    if (planningError) {
      console.error('Error loading planning records:', planningError);
    } else if (planningData && planningData.length > 0) {
      const planningResult = processPlanningRecords(planningData);
      result.allPlanningRecordsGlobal = planningResult.globalRecords;
      result.toothBorderColors = { ...result.toothBorderColors, ...planningResult.borderColors };

      // Merge planning records with existing tooth records
      Object.keys(planningResult.toothRecords).forEach((toothKey) => {
        const toothNum = parseInt(toothKey);
        if (!result.toothRecords[toothNum]) {
          result.toothRecords[toothNum] = [];
        }
        result.toothRecords[toothNum].push(...planningResult.toothRecords[toothNum]);
      });

      console.log('📦 Loaded', planningResult.globalRecords.length, 'planning records');
    }

    // Process tooth notes
    const { data: notesData, error: notesError } = notesDataResult;
    if (notesError) {
      console.error('Error loading tooth notes:', notesError);
    } else if (notesData && notesData.length > 0) {
      result.toothNotes = processToothNotes(notesData);
      console.log('📦 Loaded notes for', Object.keys(result.toothNotes).length, 'teeth');
    }

    // Process referrals
    const { data: referralsData, error: referralsError } = referralsDataResult;
    if (referralsError) {
      console.error('Error loading referrals:', referralsError);
    } else if (referralsData && referralsData.length > 0) {
      const referralsResult = processReferrals(referralsData);
      result.selectedReferralFor = referralsResult.selectedReferralFor;
      result.referrals = referralsResult.referrals;
      result.referralStatus = referralsResult.referralStatus;
      result.referralRecords = referralsResult.referralRecords;
      console.log('📦 Loaded referrals for', Object.keys(referralsResult.selectedReferralFor).length, 'teeth');
    }

    // Process scaling records
    const { data: scalingData, error: scalingError } = scalingDataResult;
    if (scalingError) {
      console.error('Error loading scaling records:', scalingError);
    } else if (scalingData && scalingData.length > 0) {
      result.scalingRecords = processScalingRecords(scalingData);
      console.log('📦 Loaded', result.scalingRecords.length, 'scaling records');
    }

    console.log('✅ Dental data loading complete');
    return result;

  } catch (error) {
    console.error('Error in loadPatientDentalData:', error);
    Alert.alert('خطأ', 'حدث خطأ أثناء تحميل البيانات');
    return null;
  }
}
