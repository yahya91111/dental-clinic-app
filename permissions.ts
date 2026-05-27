/**
 * Permissions System
 * Defines roles and their permissions
 */

export type UserRole = 'super_admin' | 'coordinator' | 'team_leader' | 'doctor';

export interface User {
  id: string; // UUID
  name: string;
  email: string;
  password: string;
  role: UserRole;
  clinicId: string | null; // UUID or null for pending doctors
  clinicName?: string;
  // My Practice fields
  isApproved?: boolean;
  virtualCenterId?: string | null; // UUID or null
  virtualCenterName?: string | null;
}

export interface PermissionCheck {
  // Profile permissions
  canViewDentalDepartments: boolean;
  canViewDoctors: boolean;
  canViewMyStatistics: boolean;
  canViewTimeline: boolean;

  // Doctor management
  canAddDoctor: boolean;
  canAddTeamLeader: boolean;
  canAddCoordinator: boolean;
  canDeleteDoctor: boolean;
  canDeleteTeamLeader: boolean;
  canDeleteCoordinator: boolean;
  canPromoteToTeamLeader: boolean;
  canPromoteToCoordinator: boolean;
  canDemoteTeamLeader: boolean;
  canMoveDoctor: boolean;
  canViewAllDoctors: boolean;
  canViewClinicDoctors: boolean;
  canViewDoctorProfile: boolean;

  // Edit permissions
  canEditOwnProfile: boolean;
  canEditAnyProfile: boolean;
  canResetPassword: boolean;

  // Data permissions
  canViewAllClinics: boolean;
  canViewOwnClinic: boolean;
  canManagePatients: boolean;
  canViewArchive: boolean;

  // Schedule permissions
  canViewSchedule: boolean;
  canCreateWeeklySchedule: boolean;
  canEditScheduleSlot: boolean;
  canCopyScheduleDay: boolean;
  canPublishSchedule: boolean;

  // EX (reserve) permissions
  canUseExSlot: boolean;
  canAssignExToOther: boolean;
  canRemoveEx: boolean;

  // Group permissions
  canCreateGroup: boolean;
  canDeleteGroup: boolean;
  canAddDoctorToGroup: boolean;
  canMoveDoctorBetweenGroups: boolean;

  // Swap permissions
  canRequestSwap: boolean;
  canSwapOnBehalfOfOthers: boolean;
  canAcceptOwnSwapRequest: boolean;
  canCancelOwnSwapRequest: boolean;

  // Absence permissions
  canSubmitOwnAbsence: boolean;
  canMarkOtherDoctorAbsence: boolean;

  // Coverage permissions
  canAssignCoverage: boolean;

  // Notification permissions
  canReceiveNotifications: boolean;
  canSendAnnouncement: boolean;
  canChooseNotifyRecipients: boolean;

  // Clinic preferences permissions
  canEditClinicPreferences: boolean;

  // AI permissions
  canUseAI: boolean;
}

/**
 * Get permissions for a specific role
 */
export function getPermissions(role: UserRole): PermissionCheck {
  switch (role) {
    case 'super_admin':
      return {
        // Profile
        canViewDentalDepartments: true,
        canViewDoctors: true,
        canViewMyStatistics: true,
        canViewTimeline: false, // Super admin uses Dental Departments instead

        // Doctor management
        canAddDoctor: true,
        canAddTeamLeader: true,
        canAddCoordinator: true,
        canDeleteDoctor: true,
        canDeleteTeamLeader: true,
        canDeleteCoordinator: true,
        canPromoteToTeamLeader: true,
        canPromoteToCoordinator: true,
        canDemoteTeamLeader: true,
        canMoveDoctor: true,
        canViewAllDoctors: true,
        canViewClinicDoctors: true,
        canViewDoctorProfile: true,

        // Edit
        canEditOwnProfile: false, // Only super admin can edit
        canEditAnyProfile: true,
        canResetPassword: true,

        // Data
        canViewAllClinics: true,
        canViewOwnClinic: true,
        canManagePatients: true,
        canViewArchive: true,

        // Schedule
        canViewSchedule: true,
        canCreateWeeklySchedule: true,
        canEditScheduleSlot: true,
        canCopyScheduleDay: true,
        canPublishSchedule: true,

        // EX (reserve)
        canUseExSlot: true,
        canAssignExToOther: true,
        canRemoveEx: true,

        // Groups
        canCreateGroup: true,
        canDeleteGroup: true,
        canAddDoctorToGroup: true,
        canMoveDoctorBetweenGroups: true,

        // Swaps
        canRequestSwap: true,
        canSwapOnBehalfOfOthers: true,
        canAcceptOwnSwapRequest: true,
        canCancelOwnSwapRequest: true,

        // Absences
        canSubmitOwnAbsence: true,
        canMarkOtherDoctorAbsence: true,

        // Coverage
        canAssignCoverage: true,

        // Notifications
        canReceiveNotifications: true,
        canSendAnnouncement: true,
        canChooseNotifyRecipients: true,

        // Clinic preferences
        canEditClinicPreferences: true,

        // AI
        canUseAI: true,
      };
      
    case 'coordinator':
      return {
        // Profile
        canViewDentalDepartments: true,
        canViewDoctors: true,
        canViewMyStatistics: true,
        canViewTimeline: false, // Coordinator uses Dental Departments instead

        // Doctor management
        canAddDoctor: true,
        canAddTeamLeader: true,
        canAddCoordinator: false,
        canDeleteDoctor: true,
        canDeleteTeamLeader: true,
        canDeleteCoordinator: false,
        canPromoteToTeamLeader: true,
        canPromoteToCoordinator: false,
        canDemoteTeamLeader: true,
        canMoveDoctor: true,
        canViewAllDoctors: true,
        canViewClinicDoctors: true,
        canViewDoctorProfile: true,

        // Edit
        canEditOwnProfile: false,
        canEditAnyProfile: false,
        canResetPassword: false,

        // Data
        canViewAllClinics: true,
        canViewOwnClinic: true,
        canManagePatients: true,
        canViewArchive: true,

        // Schedule
        canViewSchedule: true,
        canCreateWeeklySchedule: true,
        canEditScheduleSlot: true,
        canCopyScheduleDay: true,
        canPublishSchedule: true,

        // EX (reserve)
        canUseExSlot: true,
        canAssignExToOther: true,
        canRemoveEx: true,

        // Groups
        canCreateGroup: true,
        canDeleteGroup: true,
        canAddDoctorToGroup: true,
        canMoveDoctorBetweenGroups: true,

        // Swaps
        canRequestSwap: true,
        canSwapOnBehalfOfOthers: true,
        canAcceptOwnSwapRequest: true,
        canCancelOwnSwapRequest: true,

        // Absences
        canSubmitOwnAbsence: true,
        canMarkOtherDoctorAbsence: true,

        // Coverage
        canAssignCoverage: true,

        // Notifications
        canReceiveNotifications: true,
        canSendAnnouncement: true,
        canChooseNotifyRecipients: true,

        // Clinic preferences
        canEditClinicPreferences: true,

        // AI
        canUseAI: true,
      };
      
    case 'team_leader':
      return {
        // Profile
        canViewDentalDepartments: false,
        canViewDoctors: true,
        canViewMyStatistics: true,
        canViewTimeline: true,

        // Doctor management
        // Note: gap 3 resolution — TL can add doctors only (not team_leader, not coordinator)
        canAddDoctor: true,
        canAddTeamLeader: false,
        canAddCoordinator: false,
        canDeleteDoctor: false,
        canDeleteTeamLeader: false,
        canDeleteCoordinator: false,
        canPromoteToTeamLeader: false,
        canPromoteToCoordinator: false,
        canDemoteTeamLeader: false,
        canMoveDoctor: false,
        canViewAllDoctors: false,
        canViewClinicDoctors: true,
        canViewDoctorProfile: true,

        // Edit
        canEditOwnProfile: false,
        canEditAnyProfile: false,
        canResetPassword: false,

        // Data
        canViewAllClinics: false,
        canViewOwnClinic: true,
        canManagePatients: true,
        canViewArchive: false,

        // Schedule (own clinic only — enforced via canActOnClinic)
        canViewSchedule: true,
        canCreateWeeklySchedule: true,
        canEditScheduleSlot: true,
        canCopyScheduleDay: true,
        canPublishSchedule: true,

        // EX (reserve)
        canUseExSlot: true,
        canAssignExToOther: true,
        canRemoveEx: true,

        // Groups
        canCreateGroup: true,
        canDeleteGroup: true,
        canAddDoctorToGroup: true,
        canMoveDoctorBetweenGroups: true,

        // Swaps
        canRequestSwap: true,
        canSwapOnBehalfOfOthers: true,
        canAcceptOwnSwapRequest: true,
        canCancelOwnSwapRequest: true,

        // Absences
        canSubmitOwnAbsence: true,
        canMarkOtherDoctorAbsence: true,

        // Coverage
        canAssignCoverage: true,

        // Notifications
        canReceiveNotifications: true,
        canSendAnnouncement: true,
        canChooseNotifyRecipients: true,

        // Clinic preferences (own clinic only — enforced via canActOnClinic)
        canEditClinicPreferences: true,

        // AI
        canUseAI: true,
      };
      
    case 'doctor':
      return {
        // Profile
        canViewDentalDepartments: false,
        canViewDoctors: true,
        canViewMyStatistics: true,
        canViewTimeline: true,

        // Doctor management
        canAddDoctor: false,
        canAddTeamLeader: false,
        canAddCoordinator: false,
        canDeleteDoctor: false,
        canDeleteTeamLeader: false,
        canDeleteCoordinator: false,
        canPromoteToTeamLeader: false,
        canPromoteToCoordinator: false,
        canDemoteTeamLeader: false,
        canMoveDoctor: false,
        canViewAllDoctors: false,
        canViewClinicDoctors: true,
        canViewDoctorProfile: false, // Can only view names

        // Edit
        canEditOwnProfile: false,
        canEditAnyProfile: false,
        canResetPassword: false,

        // Data
        canViewAllClinics: false,
        canViewOwnClinic: true,
        canManagePatients: true,
        canViewArchive: false,

        // Schedule — read only
        canViewSchedule: true,
        canCreateWeeklySchedule: false,
        canEditScheduleSlot: false,
        canCopyScheduleDay: false,
        canPublishSchedule: false,

        // EX (reserve) — can volunteer to take an EX slot, cannot assign others
        canUseExSlot: true,
        canAssignExToOther: false,
        canRemoveEx: false,

        // Groups — cannot manage at all
        canCreateGroup: false,
        canDeleteGroup: false,
        canAddDoctorToGroup: false,
        canMoveDoctorBetweenGroups: false,

        // Swaps — can request own and respond to incoming
        canRequestSwap: true,
        canSwapOnBehalfOfOthers: false,
        canAcceptOwnSwapRequest: true,
        canCancelOwnSwapRequest: true,

        // Absences — own only (enforced via canActOnSelfOnly)
        canSubmitOwnAbsence: true,
        canMarkOtherDoctorAbsence: false,

        // Coverage — cannot assign, only TL authority
        canAssignCoverage: false,

        // Notifications — receives, can pick recipients for own actions, cannot send free-form announcements
        canReceiveNotifications: true,
        canSendAnnouncement: false,
        canChooseNotifyRecipients: true,

        // Clinic preferences
        canEditClinicPreferences: false,

        // AI
        canUseAI: true,
      };
  }
}

/**
 * Check if user can add another user with a specific role
 */
export function canAddUserWithRole(
  currentRole: UserRole,
  targetRole: UserRole
): boolean {
  const permissions = getPermissions(currentRole);

  if (targetRole === 'doctor') return permissions.canAddDoctor;
  if (targetRole === 'team_leader') return permissions.canAddTeamLeader;
  if (targetRole === 'coordinator') return permissions.canAddCoordinator;
  return false;
}

/**
 * Check if user can view a specific doctor's profile
 */
export function canViewDoctorProfile(
  currentUser: User,
  targetDoctor: User
): boolean {
  const permissions = getPermissions(currentUser.role);
  
  // Super admin and coordinator can view all
  if (permissions.canViewAllDoctors) {
    return true;
  }
  
  // Team leader can view doctors in same clinic
  if (currentUser.role === 'team_leader') {
    return currentUser.clinicId === targetDoctor.clinicId;
  }
  
  // Doctor cannot view other profiles
  return false;
}

/**
 * Check if user can delete a specific user.
 * Self-protection: a user can never delete themselves (gap 5).
 */
export function canDeleteUser(
  currentUser: User,
  targetUser: User
): boolean {
  // Self-protection — cannot delete yourself regardless of role.
  if (currentUser.id === targetUser.id) {
    return false;
  }

  const permissions = getPermissions(currentUser.role);

  // Check role-specific delete permissions
  if (targetUser.role === 'coordinator') {
    return permissions.canDeleteCoordinator;
  }

  if (targetUser.role === 'team_leader') {
    return permissions.canDeleteTeamLeader;
  }

  if (targetUser.role === 'doctor') {
    return permissions.canDeleteDoctor;
  }

  return false;
}

/**
 * Check if user can edit a specific profile
 */
export function canEditProfile(
  currentUser: User,
  targetUser: User
): boolean {
  const permissions = getPermissions(currentUser.role);
  
  // Only super admin can edit any profile
  return permissions.canEditAnyProfile;
}

/**
 * Check if user can reset password for a specific user
 */
export function canResetUserPassword(
  currentUser: User,
  targetUser: User
): boolean {
  const permissions = getPermissions(currentUser.role);

  // Only super admin can reset passwords
  return permissions.canResetPassword;
}

// ============================================================
// SCOPE HELPERS
// ============================================================
// These resolve the question: "the user has a permission flag,
// but on WHICH clinic / WHICH doctor are they allowed to act?"
//
// A boolean permission is necessary but not sufficient. Every
// write action must also pass the matching scope helper before
// touching the database.
// ============================================================

/**
 * Whether the user can act on a specific clinic.
 *
 * Rules:
 * - super_admin and coordinator can act on any clinic.
 * - team_leader and doctor can only act on their own clinic.
 *
 * Used by: schedule writes, group edits, clinic preferences,
 * coverage assignments, weekly schedule publish.
 */
export function canActOnClinic(user: User, clinicId: string): boolean {
  if (user.role === 'super_admin' || user.role === 'coordinator') {
    return true;
  }
  return user.clinicId === clinicId;
}

/**
 * Whether the user can act on a specific target user.
 *
 * Rules:
 * - doctor can only act on themselves.
 * - team_leader can act on any doctor in the same clinic
 *   (including themselves).
 * - super_admin and coordinator can act on any user, in any
 *   clinic.
 *
 * Used by: marking another doctor's absence, assigning
 * coverage to a specific doctor, viewing a doctor's slots in
 * detail.
 */
export function canActOnDoctor(currentUser: User, targetDoctor: User): boolean {
  if (currentUser.role === 'doctor') {
    return currentUser.id === targetDoctor.id;
  }
  if (currentUser.role === 'team_leader') {
    return currentUser.clinicId === targetDoctor.clinicId;
  }
  return true;
}

/**
 * Whether the user is acting on themselves only.
 *
 * Used by: submit own absence, request own swap, accept own
 * swap request — any action that must apply to the actor and
 * not to a third party.
 */
export function canActOnSelfOnly(user: User, targetUserId: string): boolean {
  return user.id === targetUserId;
}

/**
 * Whether the user can demote a target user (role change down).
 *
 * Rules:
 * - Self-protection: a user can never demote themselves
 *   (a coordinator cannot demote themselves to team_leader).
 * - Otherwise defers to canDemoteTeamLeader on the flag side.
 *
 * Note: moving doctors between clinics is a separate concern
 * handled by canMoveDoctor (the coordinator may freely move
 * any doctor, that is not a demotion).
 */
export function canDemoteUser(currentUser: User, targetUser: User): boolean {
  if (currentUser.id === targetUser.id) {
    return false;
  }
  const permissions = getPermissions(currentUser.role);
  if (targetUser.role === 'team_leader') {
    return permissions.canDemoteTeamLeader;
  }
  return false;
}

// ============================================================
// AI PERMISSION INHERITANCE
// ============================================================
// The AI runs under the signed-in user's account. Every tool
// call the AI issues is, from the database's point of view, an
// action by that user. Therefore:
//
// 1. The AI inherits exactly the user's permissions — never
//    more, never less.
// 2. There is no separate AI permission tier. A doctor's AI
//    cannot call assign_coverage even if the model asks for it,
//    because the doctor's account does not have
//    canAssignCoverage.
// 3. Every AI write must pass the same checks a button click
//    would: the boolean permission AND the scope helper above.
// 4. If a check fails, the AI must refuse and explain to the
//    user that the action is outside their permissions — never
//    silently skip or try a workaround.
// 5. This holds for both the user-initiated path (user asks AI
//    to do X) and the AI-initiated path (AI surfaces a manual
//    UI event and offers follow-up). Both are subject to the
//    same permission set.
//
// Implementation note: the AI's tool layer should wrap each
// tool with a check like:
//
//   if (!permissions[requiredFlag]) refuse();
//   if (clinicId && !canActOnClinic(user, clinicId)) refuse();
//   if (targetUserId && !canActOnDoctor(user, target)) refuse();
//
// This wrapper lives in the AI tool runtime (not in this file)
// and reuses the helpers defined here as the single source of
// truth.
// ============================================================
