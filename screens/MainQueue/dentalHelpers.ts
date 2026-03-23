import { ToothData, DentalSummary } from '../../types';
import { getEditingRecords, getReferrals } from '../../lib/database';
import { Patient } from './constants';

/**
 * Generate dental summary from tooth data
 */
export const generateDentalSummary = (teethData: ToothData[]): DentalSummary => {
  const summary: DentalSummary = {
    caries_count: 0,
    caries_teeth: [],
    rct_needed_count: 0,
    rct_needed_teeth: [],
    extraction_needed_count: 0,
    extraction_needed_teeth: [],
    filling_done_count: 0,
    filling_done_teeth: [],
    broken_teeth_count: 0,
    broken_teeth: [],
    total_issues: 0,
  };

  teethData.forEach((tooth) => {
    const { tooth_number, surfaces } = tooth;
    let hasCaries = false;
    let needsRCT = false;
    let needsExtraction = false;
    let hasFilling = false;
    let isBroken = false;

    // Check all surfaces for conditions
    Object.values(surfaces).forEach((condition) => {
      if (condition === 'caries') hasCaries = true;
      if (condition === 'pulpectomy') needsRCT = true;
      if (condition === 'extraction') needsExtraction = true;
      if (condition === 'filling_replacement') hasFilling = true;
      if (condition === 'broken') isBroken = true;
    });

    // Add to summary
    if (hasCaries) {
      summary.caries_count++;
      summary.caries_teeth.push(tooth_number);
    }
    if (needsRCT) {
      summary.rct_needed_count++;
      summary.rct_needed_teeth.push(tooth_number);
    }
    if (needsExtraction) {
      summary.extraction_needed_count++;
      summary.extraction_needed_teeth.push(tooth_number);
    }
    if (hasFilling) {
      summary.filling_done_count++;
      summary.filling_done_teeth.push(tooth_number);
    }
    if (isBroken) {
      summary.broken_teeth_count++;
      summary.broken_teeth.push(tooth_number);
    }
  });

  summary.total_issues =
    summary.caries_count +
    summary.rct_needed_count +
    summary.extraction_needed_count +
    summary.broken_teeth_count +
    summary.filling_done_count;

  return summary;
};

/**
 * Calculate treatments from dental chart editing records
 */
export const calculateDentalChartTreatments = async (permanentPatientId: string): Promise<{ [key: string]: number }> => {
  try {
    const { data, error } = await getEditingRecords(permanentPatientId);

    if (error || !data) {
      return {};
    }

    const treatments: { [key: string]: number } = {};

    // Count each treatment from editing records
    data.forEach((record) => {
      const treatment = record.treatment;

      // Only count Filling, Extraction, Pulpectomy, Scaling
      if (['Filling', 'Extraction', 'Pulpectomy', 'Scaling'].includes(treatment)) {
        treatments[treatment] = (treatments[treatment] || 0) + 1;
      }
    });

    return treatments;
  } catch (error) {
    console.error('Error calculating dental chart treatments:', error);
    return {};
  }
};

/**
 * Check if there are any given referrals
 * Returns 1 if at least one referral is given, 0 otherwise
 */
export const calculateGivenReferrals = async (permanentPatientId: string): Promise<number> => {
  try {
    const { data, error } = await getReferrals(permanentPatientId);

    if (error || !data) {
      return 0;
    }

    // Check if at least one referral has status 'given'
    const hasGivenReferral = data.some(referral => referral.status === 'given');

    return hasGivenReferral ? 1 : 0;
  } catch (error) {
    console.error('Error calculating given referrals:', error);
    return 0;
  }
};

/**
 * Check if scaling was done today
 * Returns 1 if scaling done today, 0 otherwise
 */
export const checkScalingDoneToday = (lastScalingDate: string | null): number => {
  try {
    if (!lastScalingDate) {
      return 0;
    }

    const scalingDate = new Date(lastScalingDate);
    const today = new Date();

    const isSameDay = scalingDate.getDate() === today.getDate() &&
                     scalingDate.getMonth() === today.getMonth() &&
                     scalingDate.getFullYear() === today.getFullYear();

    return isSameDay ? 1 : 0;
  } catch (error) {
    console.error('Error checking scaling done today:', error);
    return 0;
  }
};

/**
 * Get treatment from badge (for treatments like Medication, Cementation, Suture Removal)
 * These are counted from the patient's treatment field
 */
export const getTreatmentFromBadge = (patient: Patient): string | null => {
  // Only count these treatments from badge
  const directTreatments = ['Medication', 'Cementation', 'Suture Removal'];

  if (patient.treatment && directTreatments.includes(patient.treatment)) {
    return patient.treatment;
  }

  return null;
};
