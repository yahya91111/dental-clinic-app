// ===============================================================
// Dental Chart Constants
// ===============================================================
// Centralized constants for colors, options, and configuration

import type { ToothCondition } from '../../types';

// ---------------------------------------------------------------
// Container Heights and Spacing
// ---------------------------------------------------------------
export const REFERRAL_HEADER_HEIGHT = 130;
export const REFERRAL_CONTENT_MIN = 70;
export const REFERRAL_CONTENT_MAX = 320;
export const CONTAINER_SPACING = 170;
export const TREATMENT_PLANNING_SPACING = 100;

// ---------------------------------------------------------------
// Condition Colors
// ---------------------------------------------------------------
export const CONDITION_COLORS: Record<string, string> = {
  caries: '#FF0000',              // Red - Caries
  broken: '#FFC0CB',              // Pink - Broken/Inappropriate Filling
  pulpectomy: '#800000',          // Maroon - Root Canal
  extraction: '#000000',          // Black - Extraction
  follow_up: '#1E90FF',           // Blue - Follow-up
  filling_replacement: '#808080', // Gray - Temporary Filling
  missing: 'transparent',         // Transparent - Missing Tooth (X mark shown)
  permanent_filling: '#10B981',   // Green - Permanent Filling
  treated: '#800000',             // Maroon - Root Canal Treated (border only)
  needs_diagnosis: '#D97706',     // Orange - Needs More Diagnosis
  direct_pulp_capping: '#10B981', // Green - Direct Pulp Capping
  indirect_pulp_capping: '#10B981', // Green - Indirect Pulp Capping
  gi: '#10B981',                  // Green - GI (Glass Ionomer)
};

// ---------------------------------------------------------------
// Condition Names (Arabic)
// ---------------------------------------------------------------
export const CONDITION_NAMES: Record<string, string> = {
  caries: 'تسوس',
  broken: 'سن مكسور/حشوة غير مناسبة',
  pulpectomy: 'علاج جذور',
  extraction: 'خلع',
  follow_up: 'متابعة',
  missing: 'سن مفقود',
  filling_replacement: 'استبدال حشوة',
  permanent_filling: 'حشوة دائمة',
  treated: 'تم العلاج',
  needs_diagnosis: 'يحتاج لتشخيص أدق',
};

// ---------------------------------------------------------------
// Treatment Options
// ---------------------------------------------------------------
export const treatmentOptions = [
  { key: 'filling', label: 'Filling' },
  { key: 'pulpectomy', label: 'Pulpectomy' },
  { key: 'extraction', label: 'Extraction' },
];

// ---------------------------------------------------------------
// Details Options
// ---------------------------------------------------------------
export const detailsOptions = [
  { key: 'permanent_filling', label: 'Permanent Filling' },
  { key: 'direct_pulp_capping', label: 'Direct Pulp Capping' },
  { key: 'indirect_pulp_capping', label: 'Indirect Pulp Capping' },
  { key: 'gi_filling', label: 'GI Filling' },
  { key: 'temporary_filling', label: 'Temporary Filling' },
];

// ---------------------------------------------------------------
// Referral Options
// ---------------------------------------------------------------
export const referralOptions = [
  { key: 'endodontics', label: 'Endodontics' },
  { key: 'oralSurgery', label: 'Oral Surgery' },
  { key: 'orthodontics', label: 'Orthodontics' },
  { key: 'periodontics', label: 'Periodontics' },
  { key: 'prosthodontics', label: 'Prosthodontics' },
  { key: 'oralMedicine', label: 'Oral Medicine' },
];

// ---------------------------------------------------------------
// Conditions List (for Condition Menu)
// ---------------------------------------------------------------
export const conditionsList: Array<{ key: ToothCondition; name: string; color: string }> = [
  { key: 'caries', name: 'Caries', color: CONDITION_COLORS.caries },
  { key: 'broken', name: 'Broken/Inappropriate Filling', color: CONDITION_COLORS.broken },
  { key: 'pulpectomy', name: 'Pulpectomy', color: CONDITION_COLORS.pulpectomy },
  { key: 'extraction', name: 'Extraction', color: CONDITION_COLORS.extraction },
  { key: 'follow_up', name: 'Follow-up', color: CONDITION_COLORS.follow_up },
  { key: 'needs_diagnosis', name: 'Needs More Diagnosis', color: CONDITION_COLORS.needs_diagnosis },
];

// ---------------------------------------------------------------
// Tooth Status List (for Condition Menu)
// ---------------------------------------------------------------
export const toothStatusList: Array<{ key: ToothCondition; name: string; color: string }> = [
  { key: 'missing', name: 'Missing Tooth', color: CONDITION_COLORS.missing },
  { key: 'filling_replacement', name: 'Temporary Filling', color: CONDITION_COLORS.filling_replacement },
  { key: 'permanent_filling', name: 'Permanent Filling', color: CONDITION_COLORS.permanent_filling },
  { key: 'treated', name: 'Root Canal Treated', color: 'transparent' },
];

// ---------------------------------------------------------------
// Condition Name to Key Mapping
// ---------------------------------------------------------------
// Maps English condition names to ToothCondition keys
export const CONDITION_NAME_TO_KEY: Record<string, ToothCondition> = {
  'Caries': 'caries',
  'Broken/Inappropriate Filling': 'broken',
  'Pulpectomy': 'pulpectomy',
  'Follow-up': 'follow_up',
  'Needs More Diagnosis': 'needs_diagnosis',
  'Temporary Filling': 'filling_replacement',
  'Permanent Filling': 'permanent_filling',
  'Fracture': 'fracture' as ToothCondition,
  'Restoration to Replace': 'filling_replacement',
  'Impacted': 'impacted' as ToothCondition,
};
