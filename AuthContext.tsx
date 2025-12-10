import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, UserRole, getPermissions, PermissionCheck } from './permissions';
import { supabase } from './lib/supabase';

// Clinics mapping with UUID
const CLINICS = [
  { id: '10000000-0000-0000-0000-000000000001', name: 'Mushref Clinic', nameAr: 'مركز مشرف الصحي' },
  { id: '10000000-0000-0000-0000-000000000002', name: 'Hitteen Clinic', nameAr: 'مركز حطين الصحي' },
  { id: '10000000-0000-0000-0000-000000000003', name: 'Bayan Clinic', nameAr: 'مركز بيان الصحي' },
  { id: '10000000-0000-0000-0000-000000000004', name: 'Zahra Clinic', nameAr: 'مركز الزهرة الصحي' },
];

interface AuthContextType {
  user: User | null;
  permissions: PermissionCheck | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateUser: (updatedUser: User) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = '@dental_auth_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<PermissionCheck | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from storage on app start
  useEffect(() => {
    loadUser();
  }, []);

  // Update permissions when user changes
  useEffect(() => {
    if (user) {
      setPermissions(getPermissions(user.role));
    } else {
      setPermissions(null);
    }
  }, [user]);

  const loadUser = async () => {
    try {
      const storedUser = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error('Failed to load user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      // Step 1: Search in pending_doctors first (virtual/unassigned doctors)
      const { data: pendingData, error: pendingError } = await supabase
        .from('pending_doctors')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .maybeSingle();

      if (pendingError) {
        console.error('Pending doctors query error:', pendingError);
      }

      // If found in pending_doctors, use that
      if (pendingData) {
        const clinic = CLINICS.find(c => c.id === pendingData.clinic_id);
        const userData: User = {
          id: pendingData.id,
          name: pendingData.name,
          email: pendingData.email,
          password: pendingData.password,
          role: pendingData.role as UserRole,
          clinicId: pendingData.clinic_id || null,
          clinicName: clinic?.nameAr || 'Unknown Clinic',
          isApproved: pendingData.is_approved !== false,
          virtualCenterId: pendingData.virtual_center_id || null,
          virtualCenterName: pendingData.virtual_center_name || null,
        };

        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userData));
        setUser(userData);
        return true;
      }

      // Step 2: Search in doctors table (assigned doctors)
      const { data: doctorData, error: doctorError } = await supabase
        .from('doctors')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .maybeSingle();

      if (doctorError) {
        console.error('Doctors query error:', doctorError);
      }

      // If found in doctors, use that
      if (doctorData) {
        const clinic = CLINICS.find(c => c.id === doctorData.clinic_id);
        const userData: User = {
          id: doctorData.id,
          name: doctorData.name,
          email: doctorData.email,
          password: doctorData.password,
          role: doctorData.role as UserRole,
          clinicId: doctorData.clinic_id || null,
          clinicName: clinic?.nameAr || 'Unknown Clinic',
          isApproved: doctorData.is_approved !== false,
          virtualCenterId: doctorData.virtual_center_id || null,
          virtualCenterName: doctorData.virtual_center_name || null,
        };

        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userData));
        setUser(userData);
        return true;
      }

      // Step 3: Not found in either table - this is a deleted doctor or invalid credentials
      // Clear old cached data first to ensure fresh start
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);

      // Check if this email exists in doctors table (deleted doctor)
      const { data: deletedDoctor } = await supabase
        .from('doctors')
        .select('email')
        .eq('email', email)
        .maybeSingle();

      // If email exists but password doesn't match, it's invalid credentials
      if (deletedDoctor) {
        console.error('Login failed: Invalid password');
        return false;
      }

      // Email doesn't exist anywhere - invalid credentials
      console.error('Login failed: Invalid email or password');
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const updateUser = async (updatedUser: User) => {
    try {
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedUser));
      setUser(updatedUser);
    } catch (error) {
      console.error('Update user failed:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        permissions,
        isLoading,
        login,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
