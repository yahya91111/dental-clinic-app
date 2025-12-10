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
      };
      
    case 'team_leader':
      return {
        // Profile
        canViewDentalDepartments: false,
        canViewDoctors: true,
        canViewMyStatistics: true,
        canViewTimeline: true,
        
        // Doctor management
        canAddDoctor: false,
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
      };
  }
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
 * Check if user can delete a specific doctor
 */
export function canDeleteUser(
  currentUser: User,
  targetUser: User
): boolean {
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
