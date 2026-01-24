// ===============================================================
// Department Selection Modal Component
// ===============================================================
// Handles referral department selection and tooth mapping

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';
import { supabase } from '../../lib/supabase';
import { createReferral } from '../../lib/database';
import { convertNumberToPalmer, convertPalmerToNumber } from './dentalHelpers';
import type { ToothNumber } from '../../types';

// ---------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------

export interface ReferralsState {
  endodontics: boolean;
  oralSurgery: boolean;
  orthodontics: boolean;
  periodontics: boolean;
  prosthodontics: boolean;
  oralMedicine: boolean;
}

export interface ReferralStatusState {
  endodontics: string;
  oralSurgery: string;
  orthodontics: string;
  periodontics: string;
  prosthodontics: string;
  oralMedicine: string;
}

export interface DepartmentModalProps {
  visible: boolean;
  mode: 'new' | 'edit';
  permanentPatientId: string | null;
  userName: string | undefined;

  // State values
  referrals: ReferralsState;
  tempReferrals: ReferralsState;
  selectedReferralFor: Record<number | string, string[]>;
  tempSelectedReferralFor: Record<number, string[]>;
  expandedDepartment: string | null;
  savedReferralsState: ReferralsState | null;
  savedSelectedReferralFor: Record<number | string, string[]> | null;

  // State setters
  setReferrals: React.Dispatch<React.SetStateAction<ReferralsState>>;
  setTempReferrals: React.Dispatch<React.SetStateAction<ReferralsState>>;
  setSelectedReferralFor: React.Dispatch<React.SetStateAction<Record<number | string, string[]>>>;
  setTempSelectedReferralFor: React.Dispatch<React.SetStateAction<Record<number, string[]>>>;
  setExpandedDepartment: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedReferral: React.Dispatch<React.SetStateAction<string | null>>;
  setReferralStatus: React.Dispatch<React.SetStateAction<ReferralStatusState>>;
  setSavedReferralsState: React.Dispatch<React.SetStateAction<ReferralsState | null>>;
  setSavedSelectedReferralFor: React.Dispatch<React.SetStateAction<Record<number | string, string[]> | null>>;

  // Callbacks
  onClose: () => void;
  loadPatientDentalData: () => Promise<void>;
}

// ---------------------------------------------------------------
// Department Configuration
// ---------------------------------------------------------------

const DEPARTMENTS = [
  { key: 'endodontics', name: 'Endodontics', displayName: '1- Endodontics' },
  { key: 'oralSurgery', name: 'Oral Surgery', displayName: '2- Oral Surgery' },
  { key: 'orthodontics', name: 'Orthodontics', displayName: '3- Orthodontics' },
  { key: 'periodontics', name: 'Periodontics', displayName: '4- Periodontics' },
  { key: 'prosthodontics', name: 'Prosthodontics', displayName: '5- Prosthodontics' },
  { key: 'oralMedicine', name: 'Oral Medicine', displayName: '6- Oral Medicine' },
] as const;

type DepartmentKey = typeof DEPARTMENTS[number]['key'];

const QUADRANTS = ['UL', 'UR', 'LR', 'LL'] as const;

// ---------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------

interface ToothButtonProps {
  num: number;
  quadrant: string;
  departmentKey: string;
  isSelected: boolean;
  onPress: () => void;
}

const ToothButton: React.FC<ToothButtonProps> = ({
  num,
  isSelected,
  onPress,
}) => (
  <TouchableOpacity
    style={{
      width: 32,
      height: 32,
      borderRadius: 6,
      backgroundColor: isSelected ? '#0284C7' : 'rgba(255, 255, 255, 0.8)',
      borderWidth: 1.5,
      borderColor: isSelected ? '#0284C7' : 'rgba(186, 230, 253, 0.6)',
      justifyContent: 'center',
      alignItems: 'center',
    }}
    onPress={onPress}
  >
    <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>
      {num}
    </Text>
  </TouchableOpacity>
);

interface QuadrantTeethSelectionProps {
  quadrant: typeof QUADRANTS[number];
  departmentKey: string;
  departmentName: string;
  mode: 'new' | 'edit';
  tempSelectedReferralFor: Record<number, string[]>;
  selectedReferralFor: Record<number | string, string[]>;
  permanentPatientId: string | null;
  userName: string | undefined;
  setTempSelectedReferralFor: React.Dispatch<React.SetStateAction<Record<number, string[]>>>;
  setSelectedReferralFor: React.Dispatch<React.SetStateAction<Record<number | string, string[]>>>;
  loadPatientDentalData: () => Promise<void>;
}

const QuadrantTeethSelection: React.FC<QuadrantTeethSelectionProps> = ({
  quadrant,
  departmentKey,
  departmentName,
  mode,
  tempSelectedReferralFor,
  selectedReferralFor,
  permanentPatientId,
  userName,
  setTempSelectedReferralFor,
  setSelectedReferralFor,
  loadPatientDentalData,
}) => {
  const handleToothPress = async (num: number) => {
    const toothNumber = `${quadrant}${num}`;
    const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
    if (!toothNum) return;

    // في وضع "new": استخدام الحالات المؤقتة فقط
    if (mode === 'new') {
      const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes(departmentKey);
      if (!isCurrentlySelected) {
        setTempSelectedReferralFor(prev => ({
          ...prev,
          [toothNum]: [...(prev[toothNum] || []), departmentKey]
        }));
      } else {
        setTempSelectedReferralFor(prev => ({
          ...prev,
          [toothNum]: (prev[toothNum] || []).filter(r => r !== departmentKey)
        }));
      }
      return;
    }

    // في وضع "edit": الحفظ الفوري كالمعتاد
    if (toothNum && permanentPatientId && userName) {
      const isCurrentlySelected = selectedReferralFor[toothNum]?.includes(departmentKey);

      if (!isCurrentlySelected) {
        // Adding tooth - delete general referral first
        await supabase
          .from('referrals')
          .delete()
          .eq('permanent_patient_id', permanentPatientId)
          .eq('referral_type', departmentName)
          .is('tooth_number', null)
          .eq('status', 'not_given');

        // Save tooth-specific referral
        const { error } = await createReferral(
          permanentPatientId,
          toothNumber as ToothNumber,
          departmentName,
          userName
        );

        if (!error) {
          setSelectedReferralFor(prev => ({
            ...prev,
            [toothNum]: [...(prev[toothNum] || []), departmentKey]
          }));
          await loadPatientDentalData();
        }
      } else {
        // Removing tooth
        await supabase
          .from('referrals')
          .delete()
          .eq('permanent_patient_id', permanentPatientId)
          .eq('referral_type', departmentName)
          .eq('tooth_number', toothNumber)
          .eq('status', 'not_given');

        setSelectedReferralFor(prev => ({
          ...prev,
          [toothNum]: (prev[toothNum] || []).filter(r => r !== departmentKey)
        }));

        // Check if no teeth left, create general referral
        const hasOtherTeeth = Object.values(selectedReferralFor).some(refs =>
          refs.includes(departmentKey) && refs.length > 0
        );

        if (!hasOtherTeeth) {
          await createReferral(permanentPatientId, null, departmentName, userName);
        }

        await loadPatientDentalData();
      }
    }
  };

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>{quadrant}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
          const toothNumber = `${quadrant}${num}`;
          const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
          const isSelected = mode === 'new'
            ? (toothNum && tempSelectedReferralFor[toothNum]?.includes(departmentKey))
            : (toothNum && selectedReferralFor[toothNum]?.includes(departmentKey));

          return (
            <ToothButton
              key={num}
              num={num}
              quadrant={quadrant}
              departmentKey={departmentKey}
              isSelected={!!isSelected}
              onPress={() => handleToothPress(num)}
            />
          );
        })}
      </View>
    </View>
  );
};

// ---------------------------------------------------------------
// Department Section Component
// ---------------------------------------------------------------

interface DepartmentSectionProps {
  department: typeof DEPARTMENTS[number];
  index: number;
  mode: 'new' | 'edit';
  referrals: ReferralsState;
  tempReferrals: ReferralsState;
  selectedReferralFor: Record<number | string, string[]>;
  tempSelectedReferralFor: Record<number, string[]>;
  expandedDepartment: string | null;
  permanentPatientId: string | null;
  userName: string | undefined;
  setReferrals: React.Dispatch<React.SetStateAction<ReferralsState>>;
  setTempReferrals: React.Dispatch<React.SetStateAction<ReferralsState>>;
  setSelectedReferralFor: React.Dispatch<React.SetStateAction<Record<number | string, string[]>>>;
  setTempSelectedReferralFor: React.Dispatch<React.SetStateAction<Record<number, string[]>>>;
  setExpandedDepartment: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedReferral: React.Dispatch<React.SetStateAction<string | null>>;
  setReferralStatus: React.Dispatch<React.SetStateAction<ReferralStatusState>>;
  loadPatientDentalData: () => Promise<void>;
}

const DepartmentSection: React.FC<DepartmentSectionProps> = ({
  department,
  mode,
  referrals,
  tempReferrals,
  selectedReferralFor,
  tempSelectedReferralFor,
  expandedDepartment,
  permanentPatientId,
  userName,
  setReferrals,
  setTempReferrals,
  setSelectedReferralFor,
  setTempSelectedReferralFor,
  setExpandedDepartment,
  setSelectedReferral,
  setReferralStatus,
  loadPatientDentalData,
}) => {
  const { key, name, displayName } = department;
  const isChecked = mode === 'new' ? tempReferrals[key as DepartmentKey] : referrals[key as DepartmentKey];
  const isExpanded = expandedDepartment === key;
  const shouldShow = mode === 'new' || (mode === 'edit' && referrals[key as DepartmentKey]);

  if (!shouldShow) return null;

  const handleDepartmentPress = async () => {
    // في وضع "new": استخدام الحالات المؤقتة دون حفظ
    if (mode === 'new') {
      const currentlySelected = tempReferrals[key as DepartmentKey];
      setSelectedReferral(key);

      if (!currentlySelected) {
        // غير محدد: تحديده + فتح الأسنان
        setTempReferrals(prev => ({ ...prev, [key]: true }));
        setExpandedDepartment(key);
      } else {
        // محدد بالفعل: فقط toggle الـ expansion
        if (expandedDepartment === key) {
          setExpandedDepartment(null);
        } else {
          setExpandedDepartment(key);
        }
      }
      return;
    }

    // في وضع "edit": الحفظ الفوري كالمعتاد
    const newValue = !referrals[key as DepartmentKey];
    setSelectedReferral(key);

    setReferrals(prev => {
      if (newValue) {
        setReferralStatus(prevStatus => ({ ...prevStatus, [key]: 'not_given' }));
      }
      return { ...prev, [key]: newValue };
    });

    // Toggle expansion
    if (expandedDepartment === key) {
      setExpandedDepartment(null);
    } else {
      setExpandedDepartment(key);
    }

    // Save/Delete based on newValue
    if (newValue && permanentPatientId && userName) {
      // Save as general referral
      const { error: referralError } = await createReferral(
        permanentPatientId,
        null,
        name,
        userName
      );

      if (referralError) {
        console.error(`❌ Error saving general referral ${name}:`, referralError);
      } else {
        console.log(`✅ Saved general referral ${name} to database`);
        await loadPatientDentalData();
      }
    } else if (!newValue && permanentPatientId) {
      // Delete all referrals for this department
      const { error: deleteError } = await supabase
        .from('referrals')
        .delete()
        .eq('permanent_patient_id', permanentPatientId)
        .eq('referral_type', name)
        .eq('status', 'not_given');

      if (deleteError) {
        console.error(`❌ Error deleting referrals ${name}:`, deleteError);
      } else {
        console.log(`✅ Deleted all referrals ${name} from database`);
        await loadPatientDentalData();
      }

      // Clear selected teeth
      setSelectedReferralFor(prev => {
        const newState = { ...prev };
        Object.keys(newState).forEach(tooth => {
          newState[tooth] = newState[tooth].filter(r => r !== key);
        });
        return newState;
      });
    }
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <TouchableOpacity
        disabled={mode === 'edit'}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 14,
          paddingHorizontal: 18,
          borderRadius: 14,
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          borderWidth: 1.5,
          borderColor: isChecked ? 'rgba(125, 211, 252, 0.8)' : 'rgba(186, 230, 253, 0.4)',
        }}
        onPress={handleDepartmentPress}
      >
        <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
          {isChecked && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.referralText}>{displayName}</Text>
        <View style={{ flex: 1 }} />
        <Ionicons
          name={isExpanded ? "chevron-up" : "chevron-down"}
          size={20}
          color="#0284C7"
        />
      </TouchableOpacity>

      {/* Teeth Selection */}
      {isExpanded && isChecked && (
        <View style={{
          backgroundColor: 'rgba(224, 242, 254, 0.5)',
          borderRadius: 12,
          padding: 12,
          marginTop: 8,
          borderWidth: 1,
          borderColor: 'rgba(186, 230, 253, 0.4)',
        }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#0284C7', marginBottom: 8 }}>
            Select specific teeth (optional):
          </Text>

          {QUADRANTS.map(quadrant => (
            <QuadrantTeethSelection
              key={quadrant}
              quadrant={quadrant}
              departmentKey={key}
              departmentName={name}
              mode={mode}
              tempSelectedReferralFor={tempSelectedReferralFor}
              selectedReferralFor={selectedReferralFor}
              permanentPatientId={permanentPatientId}
              userName={userName}
              setTempSelectedReferralFor={setTempSelectedReferralFor}
              setSelectedReferralFor={setSelectedReferralFor}
              loadPatientDentalData={loadPatientDentalData}
            />
          ))}
        </View>
      )}
    </View>
  );
};

// ---------------------------------------------------------------
// Main DepartmentModal Component
// ---------------------------------------------------------------

export const DepartmentModal: React.FC<DepartmentModalProps> = ({
  visible,
  mode,
  permanentPatientId,
  userName,
  referrals,
  tempReferrals,
  selectedReferralFor,
  tempSelectedReferralFor,
  expandedDepartment,
  savedReferralsState,
  savedSelectedReferralFor,
  setReferrals,
  setTempReferrals,
  setSelectedReferralFor,
  setTempSelectedReferralFor,
  setExpandedDepartment,
  setSelectedReferral,
  setReferralStatus,
  setSavedReferralsState,
  setSavedSelectedReferralFor,
  onClose,
  loadPatientDentalData,
}) => {
  // Get modal title
  const getTitle = () => {
    if (mode === 'edit') {
      const selectedDept = Object.entries(referrals).find(([_, val]) => val === true);
      if (selectedDept) {
        const names: Record<string, string> = {
          'endodontics': 'Endodontics',
          'oralSurgery': 'Oral Surgery',
          'orthodontics': 'Orthodontics',
          'periodontics': 'Periodontics',
          'prosthodontics': 'Prosthodontics',
          'oralMedicine': 'Oral Medicine',
        };
        return `Edit ${names[selectedDept[0]] || 'Referral'}`;
      }
      return 'Edit Referral';
    }
    return 'Select Departments';
  };

  // Handle close
  const handleClose = () => {
    // إذا كنا في وضع New واستعادة الحالة المحفوظة
    if (mode === 'new' && savedReferralsState && savedSelectedReferralFor) {
      setReferrals(savedReferralsState);
      setSelectedReferralFor(savedSelectedReferralFor);
      setSavedReferralsState(null);
      setSavedSelectedReferralFor(null);
    }
    onClose();
  };

  // Handle cancel
  const handleCancel = () => {
    // إذا كنا في وضع New، استعادة الحالة المحفوظة وإعادة تعيين الحالات المؤقتة
    if (mode === 'new') {
      if (savedReferralsState && savedSelectedReferralFor) {
        setReferrals(savedReferralsState);
        setSelectedReferralFor(savedSelectedReferralFor);
        setSavedReferralsState(null);
        setSavedSelectedReferralFor(null);
      }
      // إعادة تعيين الحالات المؤقتة
      setTempReferrals({
        endodontics: false,
        oralSurgery: false,
        orthodontics: false,
        periodontics: false,
        prosthodontics: false,
        oralMedicine: false,
      });
      setTempSelectedReferralFor({});
    }
    onClose();
  };

  // Handle save
  const handleSave = async () => {
    // في وضع "new": حفظ جميع التحويلات الجديدة
    if (mode === 'new' && permanentPatientId && userName) {
      const departmentMap: Record<string, string> = {
        endodontics: 'Endodontics',
        oralSurgery: 'Oral Surgery',
        orthodontics: 'Orthodontics',
        periodontics: 'Periodontics',
        prosthodontics: 'Prosthodontics',
        oralMedicine: 'Oral Medicine',
      };

      // حفظ جميع الأقسام المختارة
      for (const [key, isSelected] of Object.entries(tempReferrals)) {
        if (isSelected) {
          const departmentName = departmentMap[key] || key;

          // التحقق من وجود أسنان محددة لهذا القسم
          const teethForDept = Object.entries(tempSelectedReferralFor)
            .filter(([_, depts]) => depts.includes(key))
            .map(([toothNum, _]) => parseInt(toothNum));

          if (teethForDept.length > 0) {
            // حذف التحويل العام أولاً (إن وجد) قبل حفظ الأسنان المحددة
            await supabase
              .from('referrals')
              .delete()
              .eq('permanent_patient_id', permanentPatientId)
              .eq('referral_type', departmentName)
              .is('tooth_number', null)
              .eq('status', 'not_given');

            // حفظ كل سن على حدة
            for (const toothNum of teethForDept) {
              const palmerNotation = convertNumberToPalmer(toothNum);
              await createReferral(permanentPatientId, palmerNotation, departmentName, userName);
            }
          } else {
            // حفظ تحويل عام (بدون أسنان)
            await createReferral(permanentPatientId, null, departmentName, userName);
          }
        }
      }

      // نسخ الحالات المؤقتة إلى الحالات الأساسية
      setReferrals(prev => ({ ...prev, ...tempReferrals }));
      setSelectedReferralFor(prev => ({ ...prev, ...tempSelectedReferralFor }));

      // إعادة تحميل البيانات
      await loadPatientDentalData();
    }

    // حذف الحالات المحفوظة
    setSavedReferralsState(null);
    setSavedSelectedReferralFor(null);
    onClose();
  };

  const isSaveDisabled = mode === 'new'
    ? !Object.values(tempReferrals).some(val => val === true)
    : !Object.values(referrals).some(val => val === true);

  const hasSomeSelected = mode === 'new'
    ? Object.values(tempReferrals).some(val => val === true)
    : Object.values(referrals).some(val => val === true);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={{
          width: '85%',
          maxWidth: 400,
          backgroundColor: 'rgba(240, 249, 255, 0.98)',
          borderRadius: 24,
          borderWidth: 2,
          borderColor: 'rgba(186, 230, 253, 0.6)',
          overflow: 'hidden',
          ...Platform.select({
            ios: {
              shadowColor: '#7DD3FC',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.4,
              shadowRadius: 20,
            }
          })
        }}>
          {/* Header */}
          <View style={{
            backgroundColor: 'rgba(186, 230, 253, 0.3)',
            paddingVertical: 20,
            paddingHorizontal: 24,
            borderBottomWidth: 2,
            borderBottomColor: 'rgba(186, 230, 253, 0.4)'
          }}>
            <Text style={{
              fontSize: 22,
              fontWeight: '700',
              color: '#0284C7',
              textAlign: 'center',
              letterSpacing: 0.5
            }}>
              {getTitle()}
            </Text>
          </View>

          {/* Departments List */}
          <ScrollView style={{ maxHeight: 500, padding: 20 }} showsVerticalScrollIndicator={false}>
            {DEPARTMENTS.map((department, index) => (
              <DepartmentSection
                key={department.key}
                department={department}
                index={index}
                mode={mode}
                referrals={referrals}
                tempReferrals={tempReferrals}
                selectedReferralFor={selectedReferralFor}
                tempSelectedReferralFor={tempSelectedReferralFor}
                expandedDepartment={expandedDepartment}
                permanentPatientId={permanentPatientId}
                userName={userName}
                setReferrals={setReferrals}
                setTempReferrals={setTempReferrals}
                setSelectedReferralFor={setSelectedReferralFor}
                setTempSelectedReferralFor={setTempSelectedReferralFor}
                setExpandedDepartment={setExpandedDepartment}
                setSelectedReferral={setSelectedReferral}
                setReferralStatus={setReferralStatus}
                loadPatientDentalData={loadPatientDentalData}
              />
            ))}
          </ScrollView>

          {/* Save and Cancel Buttons */}
          <View style={{ padding: 20, paddingTop: 12, flexDirection: 'row', gap: 12 }}>
            {/* Cancel Button */}
            <TouchableOpacity
              onPress={handleCancel}
              style={{
                flex: 1,
                backgroundColor: 'rgba(148, 163, 184, 0.2)',
                paddingVertical: 16,
                borderRadius: 16,
                alignItems: 'center',
                borderWidth: 1.5,
                borderColor: 'rgba(148, 163, 184, 0.4)',
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#64748B', letterSpacing: 0.5 }}>
                Cancel
              </Text>
            </TouchableOpacity>

            {/* Save Button */}
            <TouchableOpacity
              disabled={isSaveDisabled}
              onPress={handleSave}
              style={{
                flex: 1,
                backgroundColor: hasSomeSelected ? '#0284C7' : 'rgba(148, 163, 184, 0.3)',
                paddingVertical: 16,
                borderRadius: 16,
                alignItems: 'center',
                ...Platform.select({
                  ios: {
                    shadowColor: '#0284C7',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                  }
                })
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: '700', color: hasSomeSelected ? '#FFFFFF' : '#9CA3AF', letterSpacing: 0.5 }}>
                Save
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default DepartmentModal;
