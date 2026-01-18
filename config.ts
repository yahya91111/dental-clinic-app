/**
 * Application Configuration
 * Feature flags and global settings
 */

// ================================================================
// FEATURE FLAGS
// ================================================================
// Control which features are enabled/disabled
// Use these flags to safely roll out new features in production
// ================================================================

export const FEATURE_FLAGS = {
  /**
   * Link Timeline patients to Permanent Patient files
   *
   * When enabled:
   * - Doctors can create permanent patient files
   * - Timeline patients can link to dental chart
   * - Dental summary shows in patient cards
   *
   * When disabled:
   * - App works exactly as before (walk-in patients only)
   * - No UI changes
   * - Backwards compatible
   *
   * IMPORTANT: Keep this FALSE until feature is fully tested!
   */
  ENABLE_PERMANENT_PATIENT_LINKING: false, // Disabled by default

  /**
   * Mini Dental Chart (Quick Edit from Timeline)
   *
   * When enabled:
   * - Doctors can quickly edit teeth from Timeline
   * - Bottom sheet with simplified tooth diagram
   * - Fast workflow
   *
   * Prerequisites:
   * - ENABLE_PERMANENT_PATIENT_LINKING must be true
   *
   * Status: NOT IMPLEMENTED YET (future feature)
   */
  ENABLE_MINI_DENTAL_CHART: false, // Future feature

  /**
   * Search existing permanent patients
   *
   * When enabled:
   * - Search by file number when adding patient
   * - Prevents duplicate permanent files
   * - Shows patient history
   *
   * Prerequisites:
   * - ENABLE_PERMANENT_PATIENT_LINKING must be true
   *
   * Status: NOT IMPLEMENTED YET (future feature)
   */
  ENABLE_PERMANENT_PATIENT_SEARCH: false, // Future feature
};

// ================================================================
// GRADUAL ROLLOUT CONFIGURATION
// ================================================================
// Test new features with specific doctors before full rollout
// ================================================================

/**
 * Allowed doctors for beta features
 *
 * How to use:
 * 1. Add doctor emails to the array
 * 2. Those doctors can test new features
 * 3. Other doctors see the old version
 *
 * Example:
 * ```typescript
 * BETA_TESTERS: {
 *   permanentPatientLinking: [
 *     'admin@dental.com',
 *     'test.doctor@dental.com',
 *   ]
 * }
 * ```
 */
export const BETA_TESTERS = {
  // Permanent patient linking beta testers
  permanentPatientLinking: [
    // Add doctor emails here when ready for beta testing
    // 'admin@dental.com',
  ],

  // Mini dental chart beta testers
  miniDentalChart: [
    // Add doctor emails here when ready for beta testing
  ],
};

/**
 * Check if a user is allowed to use a beta feature
 *
 * @param featureName - Name of the beta feature
 * @param userEmail - Email of the current user
 * @returns true if user can access the feature
 *
 * @example
 * ```typescript
 * const canUsePermanentPatients = isBetaTester(
 *   'permanentPatientLinking',
 *   user.email
 * );
 * ```
 */
export function isBetaTester(
  featureName: keyof typeof BETA_TESTERS,
  userEmail: string
): boolean {
  const allowedUsers = BETA_TESTERS[featureName];
  return allowedUsers.includes(userEmail);
}

/**
 * Check if permanent patient linking is enabled for a user
 *
 * @param userEmail - Email of the current user
 * @returns true if feature is enabled globally OR user is beta tester
 *
 * @example
 * ```typescript
 * const user = useAuth();
 * const canLinkPermanentPatients = isPermanentPatientLinkingEnabled(user.email);
 *
 * if (canLinkPermanentPatients) {
 *   // Show new UI
 * } else {
 *   // Show old UI
 * }
 * ```
 */
export function isPermanentPatientLinkingEnabled(userEmail: string): boolean {
  // Global flag check
  if (FEATURE_FLAGS.ENABLE_PERMANENT_PATIENT_LINKING) {
    return true;
  }

  // Beta tester check
  return isBetaTester('permanentPatientLinking', userEmail);
}

// ================================================================
// APP CONFIGURATION
// ================================================================

export const APP_CONFIG = {
  /**
   * App version
   */
  VERSION: '1.0.6',

  /**
   * Enable debug logging
   */
  DEBUG_MODE: process.env.NODE_ENV !== 'production',

  /**
   * Supabase configuration
   * Note: Actual values come from environment variables
   */
  SUPABASE: {
    URL: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
    ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
  },
};

// ================================================================
// EXPORT DEFAULT CONFIG
// ================================================================

export default {
  FEATURE_FLAGS,
  BETA_TESTERS,
  APP_CONFIG,

  // Helper functions
  isBetaTester,
  isPermanentPatientLinkingEnabled,
};
