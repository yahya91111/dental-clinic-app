// ===============================================================
// Tooth Details Modal Component
// ===============================================================
// Modal for viewing and editing tooth details, records, notes, and referrals

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { ToothNumber, ToothSurface, ToothCondition } from '../../types';
import { styles } from './styles';
import {
  ToothSurfaceConditions,
  getToothQuadrant,
  getToothPositionNumber,
  getToothName,
  getAllSurfaces,
  getSurfaceMap,
  convertNumberToPalmer,
  formatTimestamp,
  getConditionFromDetails,
} from './dentalHelpers';
import {
  treatmentOptions,
  detailsOptions,
  referralOptions,
} from './constants';
import {
  createToothNote,
  createReferral,
  createEditingRecord,
  saveToothSurfaceCondition,
} from '../../lib/database';

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

export type EditingRecord = {
  type: 'editing';
  treatment: string;
  details: string;
  surfaces: string[];
  timestamp: string;
  timestampNum: number;
  doctorName: string;
};

export type PlanningRecord = {
  type: 'planning';
  action: 'diagnosed' | 'canceled';
  condition: string;
  surfaces: string[];
  timestamp: string;
  timestampNum: number;
  doctorName: string;
  isChange?: boolean;
  previousCondition?: string;
};

export type ToothRecord = EditingRecord | PlanningRecord;

export interface ToothNote {
  text: string;
  timestamp: string;
  doctorName: string;
}

// ---------------------------------------------------------------
// Props Interface
// ---------------------------------------------------------------

export interface ToothDetailsModalProps {
  visible: boolean;
  selectedToothForDetails: number | null;
  toothConditions: Record<number | string, ToothSurfaceConditions>;
  selectedTreatments: Record<number | string, string>;
  selectedDetails: Record<number | string, string>;
  selectedSurfaces: Record<number | string, string[]>;
  originalValues: { treatment?: string; details?: string; surfaces?: string[] };
  hasModalChanges: boolean;
  showNotesSection: boolean;
  showReferralSection: boolean;
  showDetailsSection: boolean;
  showRecordsSection: boolean;
  isEditMode: boolean;
  currentNote: string;
  showSurfaceOptions: boolean;
  showTreatmentOptions: boolean;
  showDetailsOptions: boolean;
  showReferralOptions: boolean;
  recordsType: 'editing' | 'planning';
  unreadNotes: Record<number | string, number>;
  toothNotes: Record<number | string, ToothNote[]>;
  toothRecords: Record<number | string, ToothRecord[]>;
  selectedReferralFor: Record<number | string, string[]>;
  referrals: Record<string, boolean>;
  toothBorderColors: Record<number | string, ToothCondition>;
  permanentPatientId: string | undefined;
  userName: string | undefined;
  skipPlanningRecordRef: React.MutableRefObject<boolean>;

  // Setters
  setSelectedTreatments: React.Dispatch<React.SetStateAction<Record<number | string, string>>>;
  setSelectedDetails: React.Dispatch<React.SetStateAction<Record<number | string, string>>>;
  setSelectedSurfaces: React.Dispatch<React.SetStateAction<Record<number | string, string[]>>>;
  setOriginalValues: React.Dispatch<React.SetStateAction<{ treatment?: string; details?: string; surfaces?: string[] }>>;
  setHasModalChanges: React.Dispatch<React.SetStateAction<boolean>>;
  setShowNotesSection: React.Dispatch<React.SetStateAction<boolean>>;
  setShowReferralSection: React.Dispatch<React.SetStateAction<boolean>>;
  setShowDetailsSection: React.Dispatch<React.SetStateAction<boolean>>;
  setShowRecordsSection: React.Dispatch<React.SetStateAction<boolean>>;
  setIsEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentNote: React.Dispatch<React.SetStateAction<string>>;
  setShowSurfaceOptions: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTreatmentOptions: React.Dispatch<React.SetStateAction<boolean>>;
  setShowDetailsOptions: React.Dispatch<React.SetStateAction<boolean>>;
  setShowReferralOptions: React.Dispatch<React.SetStateAction<boolean>>;
  setRecordsType: React.Dispatch<React.SetStateAction<'editing' | 'planning'>>;
  setUnreadNotes: React.Dispatch<React.SetStateAction<Record<number | string, number>>>;
  setToothNotes: React.Dispatch<React.SetStateAction<Record<number | string, ToothNote[]>>>;
  setToothRecords: React.Dispatch<React.SetStateAction<Record<number | string, ToothRecord[]>>>;
  setSelectedReferralFor: React.Dispatch<React.SetStateAction<Record<number | string, string[]>>>;
  setReferrals: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setReferralStatus: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setToothBorderColors: React.Dispatch<React.SetStateAction<Record<number | string, ToothCondition>>>;
  setToothConditions: React.Dispatch<React.SetStateAction<Record<number | string, ToothSurfaceConditions>>>;
  onClose: () => void;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ToothDetailsModal: React.FC<ToothDetailsModalProps> = ({
  visible,
  selectedToothForDetails,
  toothConditions,
  selectedTreatments,
  selectedDetails,
  selectedSurfaces,
  originalValues,
  hasModalChanges,
  showNotesSection,
  showReferralSection,
  showDetailsSection,
  showRecordsSection,
  isEditMode,
  currentNote,
  showSurfaceOptions,
  showTreatmentOptions,
  showDetailsOptions,
  showReferralOptions,
  recordsType,
  unreadNotes,
  toothNotes,
  toothRecords,
  selectedReferralFor,
  referrals,
  toothBorderColors,
  permanentPatientId,
  userName,
  skipPlanningRecordRef,
  setSelectedTreatments,
  setSelectedDetails,
  setSelectedSurfaces,
  setOriginalValues,
  setHasModalChanges,
  setShowNotesSection,
  setShowReferralSection,
  setShowDetailsSection,
  setShowRecordsSection,
  setIsEditMode,
  setCurrentNote,
  setShowSurfaceOptions,
  setShowTreatmentOptions,
  setShowDetailsOptions,
  setShowReferralOptions,
  setRecordsType,
  setUnreadNotes,
  setToothNotes,
  setToothRecords,
  setSelectedReferralFor,
  setReferrals,
  setReferralStatus,
  setToothBorderColors,
  setToothConditions,
  onClose,
}) => {
  // ---------------------------------------------------------------
  // Helper: Reset and close modal
  // ---------------------------------------------------------------
  const handleClose = () => {
    // استعادة القيم الأصلية أو حذف القيم الجديدة عند الإغلاق دون Submit
    if (selectedToothForDetails) {
      // استعادة أو حذف Treatment
      setSelectedTreatments(prev => {
        const newState = { ...prev };
        if (originalValues.treatment) {
          newState[selectedToothForDetails] = originalValues.treatment;
        } else {
          delete newState[selectedToothForDetails];
        }
        return newState;
      });

      // استعادة أو حذف Details
      setSelectedDetails(prev => {
        const newState = { ...prev };
        if (originalValues.details) {
          newState[selectedToothForDetails] = originalValues.details;
        } else {
          delete newState[selectedToothForDetails];
        }
        return newState;
      });

      // استعادة أو حذف Surfaces
      setSelectedSurfaces(prev => {
        const newState = { ...prev };
        if (originalValues.surfaces && originalValues.surfaces.length > 0) {
          newState[selectedToothForDetails] = [...originalValues.surfaces];
        } else {
          delete newState[selectedToothForDetails];
        }
        return newState;
      });
    }

    setHasModalChanges(false);
    setShowNotesSection(false);
    setShowReferralSection(false);
    setIsEditMode(false);
    setCurrentNote('');
    setOriginalValues({});
    onClose();
  };

  // ---------------------------------------------------------------
  // Helper: Check if tooth is missing or extraction
  // ---------------------------------------------------------------
  const isMissingOrExtraction = () => {
    if (!selectedToothForDetails) return false;
    const conditions = toothConditions[selectedToothForDetails];
    const isMissingTooth = conditions && Object.values(conditions).every(condition => condition === 'missing');
    const isExtractionTooth = conditions && Object.values(conditions).some(condition => condition === 'extraction');
    return isMissingTooth || isExtractionTooth;
  };

  // ---------------------------------------------------------------
  // Helper: Should show surfaces/details section
  // ---------------------------------------------------------------
  const shouldShowSurfacesSection = () => {
    if (!selectedToothForDetails) return false;
    return selectedTreatments[selectedToothForDetails] !== 'extraction' && !isMissingOrExtraction();
  };

  // ---------------------------------------------------------------
  // Handle Submit
  // ---------------------------------------------------------------
  const handleSubmit = async () => {
    if (!hasModalChanges || !selectedToothForDetails) return;

    // Save note if there's text
    if (currentNote.trim()) {
      const now = new Date();
      const timestamp = formatTimestamp(now);

      const existingNotes = toothNotes[selectedToothForDetails] || [];
      setToothNotes(prev => ({
        ...prev,
        [selectedToothForDetails]: [
          ...existingNotes,
          { text: currentNote.trim(), timestamp, doctorName: userName || 'Dr. Unknown' }
        ]
      }));

      // Save tooth note to database
      if (permanentPatientId && userName && typeof selectedToothForDetails === 'number') {
        const palmerNotation = convertNumberToPalmer(selectedToothForDetails);
        if (palmerNotation) {
          const { error: noteError } = await createToothNote(
            permanentPatientId,
            palmerNotation,
            currentNote.trim(),
            userName
          );

          if (noteError) {
            console.error(' Error saving tooth note:', noteError);
          } else {
            console.log(' Saved tooth note to database');
          }
        }
      }

      // Set unread badge for this tooth
      setUnreadNotes(prev => ({
        ...prev,
        [selectedToothForDetails]: (prev[selectedToothForDetails] || 0) + 1
      }));

      setCurrentNote('');
    }

    // Save referrals if selected (multiple) - Show in Department tab, not Records yet
    const selectedReferrals = selectedReferralFor[selectedToothForDetails] || [];
    if (selectedReferrals.length > 0) {
      // Update referrals state to show all referral cards in Department tab
      const newReferralsState: Record<string, boolean> = {};
      const newReferralStatuses: Record<string, 'not_given' | 'given'> = {};

      selectedReferrals.forEach(referralKey => {
        newReferralsState[referralKey] = true;
        newReferralStatuses[referralKey] = 'not_given';
      });

      setReferrals(prev => ({
        ...prev,
        ...newReferralsState
      }));

      setReferralStatus(prev => ({
        ...prev,
        ...newReferralStatuses
      }));

      // Save all referrals to database immediately to persist after logout
      if (permanentPatientId && userName && typeof selectedToothForDetails === 'number') {
        const palmerNotation = convertNumberToPalmer(selectedToothForDetails);
        if (palmerNotation) {
          const referralTypeMap: Record<string, string> = {
            'endodontics': 'Endodontics',
            'oralSurgery': 'Oral Surgery',
            'orthodontics': 'Orthodontics',
            'prosthodontics': 'Prosthodontics',
            'periodontics': 'Periodontics',
            'pediatricDentistry': 'Pediatric Dentistry',
          };

          // Save each referral separately
          for (const referralKey of selectedReferrals) {
            const referralName = referralTypeMap[referralKey] || referralKey;

            const { error: referralError } = await createReferral(
              permanentPatientId,
              palmerNotation,
              referralName,
              userName
            );

            if (referralError) {
              console.error(` Error saving referral ${referralName}:`, referralError);
            } else {
              console.log(` Saved referral ${referralName} to database`);
            }
          }
        }
      }
    }

    // Save record ONLY if Edit mode is active AND (treatment or details were selected)
    if (isEditMode) {
      const treatment = selectedTreatments[selectedToothForDetails];
      const details = selectedDetails[selectedToothForDetails];

      if (treatment || details) {
        const now = new Date();
        const timestamp = formatTimestamp(now);

        const treatmentLabel = treatment ? treatmentOptions.find(opt => opt.key === treatment)?.label || treatment : 'N/A';
        const detailsLabel = details ? detailsOptions.find(opt => opt.key === details)?.label || details : 'N/A';

        // الحصول على أسماء الأسطح المحددة
        const selectedSurfacesForTooth = selectedSurfaces[selectedToothForDetails] || [];
        const surfaceNames = selectedSurfacesForTooth.map(surfaceKey => {
          const surfaceOptions = getAllSurfaces(selectedToothForDetails);
          const surface = surfaceOptions.find(opt => opt.key === surfaceKey);
          return surface?.label || surfaceKey;
        });

        const existingRecords = toothRecords[selectedToothForDetails] || [];
        setToothRecords(prev => ({
          ...prev,
          [selectedToothForDetails]: [
            ...existingRecords,
            {
              treatment: treatmentLabel,
              details: detailsLabel,
              surfaces: surfaceNames,
              timestamp,
              timestampNum: now.getTime(),
              doctorName: userName || 'Dr. Unknown',
              type: 'editing'
            }
          ]
        }));

        // Save editing record to database
        if (permanentPatientId && userName && typeof selectedToothForDetails === 'number') {
          const palmerNotation = convertNumberToPalmer(selectedToothForDetails);
          if (palmerNotation) {
            // Map UI surface keys to database surface names
            const surfaceMap = getSurfaceMap(selectedToothForDetails);

            const dbSurfaces = selectedSurfacesForTooth
              .map(key => surfaceMap[key as keyof ToothSurfaceConditions])
              .filter((s): s is ToothSurface => s !== undefined);

            // Save editing record to database
            const { error: editingError } = await createEditingRecord(
              permanentPatientId,
              palmerNotation,
              treatmentLabel,
              dbSurfaces,
              userName,
              detailsLabel
            );

            if (editingError) {
              console.error(' Error saving editing record:', editingError);
            } else {
              console.log(' Saved editing record to database');
            }

            // Save surface colors for Filling and Pulpectomy (if Details selected)
            if (selectedSurfacesForTooth.length > 0 && details && (treatment === 'filling' || treatment === 'pulpectomy')) {
              const conditionColor = getConditionFromDetails(details);

              try {
                const surfacePromises = dbSurfaces.map(dbSurface =>
                  saveToothSurfaceCondition(permanentPatientId, palmerNotation, dbSurface, conditionColor)
                );

                await Promise.all(surfacePromises);
                console.log(` Saved ${dbSurfaces.length} surface colors (${conditionColor}) to database`);
              } catch (error) {
                console.error(' Error saving surface conditions:', error);
              }
            }
          }
        }

        // تحويل لون الأسطح المحددة بناءً على نوع الحشوة المختار (UI only)
        if (selectedSurfacesForTooth.length > 0) {
          skipPlanningRecordRef.current = true;

          setToothConditions(prev => {
            const existingConditions = prev[selectedToothForDetails] || {};
            const updatedConditions: ToothSurfaceConditions = { ...existingConditions };

            const conditionColor = getConditionFromDetails(details);

            selectedSurfacesForTooth.forEach((surfaceKey) => {
              const key = surfaceKey as keyof ToothSurfaceConditions;
              updatedConditions[key] = conditionColor;
            });

            return {
              ...prev,
              [selectedToothForDetails]: updatedConditions
            };
          });
        }

        // تغيير لون حدود السن إلى عنابي إذا كان العلاج pulpectomy
        if (treatment === 'pulpectomy') {
          skipPlanningRecordRef.current = true;

          setToothBorderColors(prev => ({
            ...prev,
            [selectedToothForDetails]: 'pulpectomy'
          }));

          console.log(` Set border color for tooth ${selectedToothForDetails} to 'pulpectomy' (border only, no surface colors)`);
        }

        // إذا كان العلاج extraction، جعل السن missing (علامة X)
        if (treatment === 'extraction') {
          skipPlanningRecordRef.current = true;

          setToothConditions(prev => ({
            ...prev,
            [selectedToothForDetails]: {
              top: 'missing',
              bottom: 'missing',
              left: 'missing',
              right: 'missing',
              center: 'missing',
            }
          }));

          // Save extraction to tooth_surface_conditions (all surfaces)
          if (permanentPatientId && typeof selectedToothForDetails === 'number') {
            const palmerNotation = convertNumberToPalmer(selectedToothForDetails);
            if (palmerNotation) {
              try {
                const allSurfaces: ToothSurface[] = ['mesial', 'distal', 'buccal', 'lingual', 'occlusal'];
                const extractionPromises = allSurfaces.map(surface =>
                  saveToothSurfaceCondition(permanentPatientId, palmerNotation, surface, 'missing')
                );
                await Promise.all(extractionPromises);
                console.log(' Saved extraction (missing) to all tooth surfaces');
              } catch (error) {
                console.error(' Error saving extraction:', error);
              }
            }
          }
        }
      }
    }

    // Close modal and reset
    setHasModalChanges(false);
    setShowNotesSection(false);
    setShowReferralSection(false);
    setIsEditMode(false);
    setOriginalValues({});
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={{ width: '95%', height: '75%', borderRadius: 24, overflow: 'hidden' }}>
          <BlurView intensity={90} tint="light" style={styles.newModalContainer}>
            <View style={{ backgroundColor: 'rgba(240, 249, 255, 0.95)', flex: 1 }}>
              {/* Header */}
              <View style={styles.newModalHeader}>
                <View style={[
                  styles.toothNumberBox,
                  selectedToothForDetails && getToothQuadrant(selectedToothForDetails) === 'UL' && { borderLeftWidth: 2, borderBottomWidth: 2, borderLeftColor: '#1E3A8A', borderBottomColor: '#1E3A8A' },
                  selectedToothForDetails && getToothQuadrant(selectedToothForDetails) === 'UR' && { borderRightWidth: 2, borderBottomWidth: 2, borderRightColor: '#1E3A8A', borderBottomColor: '#1E3A8A' },
                  selectedToothForDetails && getToothQuadrant(selectedToothForDetails) === 'LL' && { borderLeftWidth: 2, borderTopWidth: 2, borderLeftColor: '#1E3A8A', borderTopColor: '#1E3A8A' },
                  selectedToothForDetails && getToothQuadrant(selectedToothForDetails) === 'LR' && { borderRightWidth: 2, borderTopWidth: 2, borderRightColor: '#1E3A8A', borderTopColor: '#1E3A8A' },
                ]}>
                  <Text style={styles.modalToothNumberText}>
                    {selectedToothForDetails ? getToothPositionNumber(selectedToothForDetails) : ''}
                  </Text>
                </View>
                <Text style={styles.modalToothNameText}>
                  {selectedToothForDetails ? getToothName(selectedToothForDetails).english : ''}
                </Text>
                <View style={styles.headerButtons}>
                  <TouchableOpacity
                    style={[styles.editButton, isEditMode && styles.editButtonActive]}
                    onPress={() => {
                      setIsEditMode(!isEditMode);
                      if (isEditMode) {
                        setHasModalChanges(false);
                      }
                    }}
                  >
                    <Ionicons name="create-outline" size={24} color={isEditMode ? "#FFFFFF" : "#1E3A8A"} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                    <Ionicons name="close" size={24} color="#1E3A8A" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Header Divider */}
              <View style={styles.headerDivider} />

              {/* Tab Buttons */}
              <View style={styles.tabButtons}>
                <TouchableOpacity
                  style={[styles.tabBtn, showRecordsSection && styles.tabBtnActive]}
                  onPress={() => {
                    setShowRecordsSection(true);
                    setShowDetailsSection(false);
                    setShowNotesSection(false);
                    setShowReferralSection(false);
                  }}
                >
                  <Ionicons name="document-text-outline" size={22} color={showRecordsSection ? "#FFFFFF" : "#64748B"} />
                  <Text style={[styles.tabBtnText, showRecordsSection && styles.tabBtnTextActive]}>Records</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabBtn, showDetailsSection && styles.tabBtnActive]}
                  onPress={() => {
                    setShowDetailsSection(true);
                    setShowNotesSection(false);
                    setShowRecordsSection(false);
                    setShowReferralSection(false);
                  }}
                >
                  <Ionicons name="information-circle-outline" size={22} color={showDetailsSection ? "#FFFFFF" : "#64748B"} />
                  <Text style={[styles.tabBtnText, showDetailsSection && styles.tabBtnTextActive]}>Details</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabBtn, showNotesSection && styles.tabBtnActive]}
                  onPress={() => {
                    setShowNotesSection(true);
                    setShowDetailsSection(false);
                    setShowRecordsSection(false);
                    setShowReferralSection(false);
                    if (selectedToothForDetails) {
                      setUnreadNotes(prev => ({
                        ...prev,
                        [selectedToothForDetails]: 0
                      }));
                    }
                  }}
                >
                  <View>
                    <Ionicons name="create-outline" size={22} color={showNotesSection ? "#FFFFFF" : "#64748B"} />
                    {selectedToothForDetails && unreadNotes[selectedToothForDetails] > 0 && (
                      <View style={styles.notificationBadge}>
                        <Text style={styles.notificationBadgeText}>
                          {unreadNotes[selectedToothForDetails]}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.tabBtnText, showNotesSection && styles.tabBtnTextActive]}>Notes</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabBtn, showReferralSection && styles.tabBtnActive]}
                  onPress={() => {
                    setShowReferralSection(true);
                    setShowDetailsSection(false);
                    setShowNotesSection(false);
                    setShowRecordsSection(false);
                  }}
                >
                  <Ionicons name="arrow-redo-outline" size={22} color={showReferralSection ? "#FFFFFF" : "#64748B"} />
                  <Text style={[styles.tabBtnText, showReferralSection && styles.tabBtnTextActive]}>Referral</Text>
                </TouchableOpacity>
              </View>

              {/* Content Sections */}
              <View style={{ flex: 1 }}>
                <ScrollView
                  style={styles.modalContent}
                  contentContainerStyle={{ paddingBottom: 8 }}
                  showsVerticalScrollIndicator={true}
                >
                  {/* Main Container for All Sections */}
                  {!showRecordsSection && (
                    <View style={styles.mainSectionsContainer}>
                      {/* Details Section - Surfaces, Treatment, Details */}
                      {showDetailsSection && (
                        <>
                          {/* Surfaces Section */}
                          {shouldShowSurfacesSection() && (
                            <>
                              <View style={styles.sectionRow}>
                                <View style={styles.sectionLabelContainer}>
                                  <Ionicons name="layers-outline" size={20} color="#1E293B" />
                                  <Text style={styles.sectionTitle}>Surfaces</Text>
                                </View>
                                <TouchableOpacity
                                  style={[styles.dropdownInput, isEditMode && styles.dropdownInputActive]}
                                  onPress={() => isEditMode && setShowSurfaceOptions(!showSurfaceOptions)}
                                  disabled={!isEditMode}
                                >
                                  <Ionicons name={showSurfaceOptions ? "chevron-up" : "chevron-down"} size={20} color="#64748B" />
                                  <Text style={styles.dropdownText}>
                                    {(() => {
                                      if (!selectedToothForDetails) return 'Select';
                                      const allSurfaces = selectedSurfaces[selectedToothForDetails] || [];
                                      const conditions = toothConditions[selectedToothForDetails] || {};
                                      const toothSurfaces = allSurfaces.filter(surface => {
                                        const condition = conditions[surface as keyof ToothSurfaceConditions];
                                        return condition !== 'treated' && condition !== 'permanent_filling' && condition !== 'follow_up';
                                      });
                                      if (toothSurfaces.length === 0) return 'Select';
                                      const surfaceOptions = getAllSurfaces(selectedToothForDetails);
                                      const labels = toothSurfaces.map(s => surfaceOptions.find(opt => opt.key === s)?.label).filter(Boolean);
                                      return labels.join(', ') || 'Select';
                                    })()}
                                  </Text>
                                </TouchableOpacity>
                              </View>

                              {/* Surface Options Modal */}
                              <Modal
                                visible={showSurfaceOptions && !!selectedToothForDetails}
                                transparent={true}
                                animationType="fade"
                                onRequestClose={() => setShowSurfaceOptions(false)}
                              >
                                <TouchableOpacity
                                  style={styles.dropdownModalOverlay}
                                  activeOpacity={1}
                                  onPress={() => setShowSurfaceOptions(false)}
                                >
                                  <TouchableOpacity
                                    activeOpacity={1}
                                    onPress={(e) => e.stopPropagation()}
                                    style={{ width: '85%' }}
                                  >
                                    <View style={styles.dropdownModalContent}>
                                      <Text style={styles.dropdownModalTitle}>Select Surfaces</Text>
                                      <ScrollView
                                        style={styles.dropdownModalList}
                                        showsVerticalScrollIndicator={true}
                                      >
                                        {selectedToothForDetails && getAllSurfaces(selectedToothForDetails).map((surface) => {
                                          const toothSurfaces = selectedSurfaces[selectedToothForDetails] || [];
                                          const conditions = toothConditions[selectedToothForDetails] || {};
                                          const surfaceCondition = conditions[surface.key as keyof ToothSurfaceConditions];
                                          const isSelected = toothSurfaces.includes(surface.key) &&
                                            surfaceCondition !== 'treated' &&
                                            surfaceCondition !== 'permanent_filling' &&
                                            surfaceCondition !== 'follow_up';

                                          return (
                                            <TouchableOpacity
                                              key={surface.key}
                                              style={styles.dropdownModalOption}
                                              onPress={() => {
                                                if (!isEditMode || !selectedToothForDetails) return;

                                                const currentSurfaces = selectedSurfaces[selectedToothForDetails] || [];
                                                const newSurfaces = isSelected
                                                  ? currentSurfaces.filter(s => s !== surface.key)
                                                  : [...currentSurfaces, surface.key];

                                                setSelectedSurfaces(prev => ({
                                                  ...prev,
                                                  [selectedToothForDetails]: newSurfaces
                                                }));

                                                // Update toothConditions
                                                const existingConditions = toothConditions[selectedToothForDetails] || {};
                                                const updatedConditions: ToothSurfaceConditions = {
                                                  top: null,
                                                  bottom: null,
                                                  left: null,
                                                  right: null,
                                                  center: null,
                                                };

                                                newSurfaces.forEach((surfaceKey) => {
                                                  const key = surfaceKey as keyof ToothSurfaceConditions;
                                                  updatedConditions[key] = existingConditions[key] || 'caries';
                                                });

                                                setToothConditions(prev => ({
                                                  ...prev,
                                                  [selectedToothForDetails]: updatedConditions
                                                }));

                                                setHasModalChanges(true);
                                              }}
                                            >
                                              <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                                {isSelected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                                              </View>
                                              <Text style={styles.optionText}>{surface.label}</Text>
                                            </TouchableOpacity>
                                          );
                                        })}
                                      </ScrollView>
                                    </View>
                                  </TouchableOpacity>
                                </TouchableOpacity>
                              </Modal>

                              <View style={styles.sectionDivider} />
                            </>
                          )}

                          {/* Treatment Section */}
                          <View style={styles.sectionRow}>
                            <View style={styles.sectionLabelContainer}>
                              <Ionicons name="medical-outline" size={20} color="#1E293B" />
                              <Text style={styles.sectionTitle}>Treatment</Text>
                            </View>
                            <TouchableOpacity
                              style={[styles.dropdownInput, isEditMode && styles.dropdownInputActive]}
                              onPress={() => isEditMode && setShowTreatmentOptions(!showTreatmentOptions)}
                              disabled={!isEditMode}
                            >
                              <Ionicons name={showTreatmentOptions ? "chevron-up" : "chevron-down"} size={20} color="#64748B" />
                              <Text style={styles.dropdownText}>
                                {selectedToothForDetails && selectedTreatments[selectedToothForDetails]
                                  ? treatmentOptions.find(opt => opt.key === selectedTreatments[selectedToothForDetails])?.label || 'Select'
                                  : 'Select'}
                              </Text>
                            </TouchableOpacity>
                          </View>

                          {/* Treatment Options Modal */}
                          <Modal
                            visible={showTreatmentOptions && !!selectedToothForDetails}
                            transparent={true}
                            animationType="fade"
                            onRequestClose={() => setShowTreatmentOptions(false)}
                          >
                            <TouchableOpacity
                              style={styles.dropdownModalOverlay}
                              activeOpacity={1}
                              onPress={() => setShowTreatmentOptions(false)}
                            >
                              <TouchableOpacity
                                activeOpacity={1}
                                onPress={(e) => e.stopPropagation()}
                                style={{ width: '85%' }}
                              >
                                <View style={styles.dropdownModalContent}>
                                  <Text style={styles.dropdownModalTitle}>Select Treatment</Text>
                                  <ScrollView
                                    style={styles.dropdownModalList}
                                    showsVerticalScrollIndicator={true}
                                  >
                                    {treatmentOptions.map((treatment) => {
                                      const isSelected = selectedToothForDetails && selectedTreatments[selectedToothForDetails] === treatment.key;

                                      return (
                                        <TouchableOpacity
                                          key={treatment.key}
                                          style={styles.dropdownModalOption}
                                          onPress={() => {
                                            if (!isEditMode || !selectedToothForDetails) return;

                                            setSelectedTreatments(prev => ({
                                              ...prev,
                                              [selectedToothForDetails]: treatment.key
                                            }));
                                            setShowTreatmentOptions(false);
                                            setHasModalChanges(true);
                                          }}
                                        >
                                          <View style={[styles.radioButton, isSelected && styles.radioButtonSelected]}>
                                            {isSelected && <View style={styles.radioButtonInner} />}
                                          </View>
                                          <Text style={styles.optionText}>{treatment.label}</Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </ScrollView>
                                </View>
                              </TouchableOpacity>
                            </TouchableOpacity>
                          </Modal>

                          <View style={styles.sectionDivider} />

                          {/* Details Section */}
                          {shouldShowSurfacesSection() && (
                            <>
                              <View style={styles.sectionRow}>
                                <View style={styles.sectionLabelContainer}>
                                  <Ionicons name="list-outline" size={20} color="#1E293B" />
                                  <Text style={styles.sectionTitle}>Details</Text>
                                </View>
                                <TouchableOpacity
                                  style={[styles.dropdownInput, isEditMode && styles.dropdownInputActive]}
                                  onPress={() => isEditMode && setShowDetailsOptions(!showDetailsOptions)}
                                  disabled={!isEditMode}
                                >
                                  <Ionicons name={showDetailsOptions ? "chevron-up" : "chevron-down"} size={20} color="#64748B" />
                                  <Text style={styles.dropdownText}>
                                    {selectedToothForDetails && selectedDetails[selectedToothForDetails]
                                      ? detailsOptions.find(opt => opt.key === selectedDetails[selectedToothForDetails])?.label || 'Select'
                                      : 'Select'}
                                  </Text>
                                </TouchableOpacity>
                              </View>

                              {/* Details Options Modal */}
                              <Modal
                                visible={showDetailsOptions && !!selectedToothForDetails}
                                transparent={true}
                                animationType="fade"
                                onRequestClose={() => setShowDetailsOptions(false)}
                              >
                                <TouchableOpacity
                                  style={styles.dropdownModalOverlay}
                                  activeOpacity={1}
                                  onPress={() => setShowDetailsOptions(false)}
                                >
                                  <TouchableOpacity
                                    activeOpacity={1}
                                    onPress={(e) => e.stopPropagation()}
                                    style={{ width: '85%' }}
                                  >
                                    <View style={styles.dropdownModalContent}>
                                      <Text style={styles.dropdownModalTitle}>Select Details</Text>
                                      <ScrollView
                                        style={styles.dropdownModalList}
                                        showsVerticalScrollIndicator={true}
                                      >
                                        {detailsOptions.map((detail) => {
                                          const isSelected = selectedToothForDetails && selectedDetails[selectedToothForDetails] === detail.key;

                                          return (
                                            <TouchableOpacity
                                              key={detail.key}
                                              style={styles.dropdownModalOption}
                                              onPress={() => {
                                                if (!isEditMode || !selectedToothForDetails) return;

                                                setSelectedDetails(prev => ({
                                                  ...prev,
                                                  [selectedToothForDetails]: detail.key
                                                }));
                                                setShowDetailsOptions(false);
                                                setHasModalChanges(true);
                                              }}
                                            >
                                              <View style={[styles.radioButton, isSelected && styles.radioButtonSelected]}>
                                                {isSelected && <View style={styles.radioButtonInner} />}
                                              </View>
                                              <Text style={styles.optionText}>{detail.label}</Text>
                                            </TouchableOpacity>
                                          );
                                        })}
                                      </ScrollView>
                                    </View>
                                  </TouchableOpacity>
                                </TouchableOpacity>
                              </Modal>
                            </>
                          )}
                        </>
                      )}

                      {/* Notes Section */}
                      {showNotesSection && (
                        <View style={styles.notesSection}>
                          {/* New Note Input - Fixed at Top */}
                          <View style={styles.newNoteContainer}>
                            <TextInput
                              style={styles.noteInput}
                              placeholder="Write a note..."
                              placeholderTextColor="rgba(30, 58, 138, 0.5)"
                              multiline
                              numberOfLines={3}
                              value={currentNote}
                              onChangeText={(text) => {
                                setCurrentNote(text);
                                if (text.trim()) {
                                  setHasModalChanges(true);
                                }
                              }}
                            />
                          </View>

                          {/* Saved Notes - Scrollable */}
                          {selectedToothForDetails && toothNotes[selectedToothForDetails]?.length > 0 && (
                            <ScrollView
                              style={{ maxHeight: 230 }}
                              showsVerticalScrollIndicator={true}
                              nestedScrollEnabled={true}
                            >
                              {toothNotes[selectedToothForDetails].slice().reverse().map((note, index) => (
                                <View key={index} style={[styles.noteCard, { marginBottom: 12 }]}>
                                  <View style={styles.noteHeader}>
                                    <Text style={styles.noteDoctorName}>{note.doctorName || 'Dr. Ahmed'}</Text>
                                    <Text style={styles.noteTimestamp}>{note.timestamp}</Text>
                                  </View>
                                  <Text style={styles.noteText}>{note.text}</Text>
                                </View>
                              ))}
                            </ScrollView>
                          )}
                        </View>
                      )}

                      {/* Referral Section */}
                      {showReferralSection && (
                        <>
                          {/* Need Referral Section */}
                          <View style={styles.sectionRow}>
                            <View style={styles.sectionLabelContainer}>
                              <Ionicons name="share-outline" size={18} color="#1E293B" />
                              <Text style={[styles.sectionTitle, { fontSize: 14 }]}>Need Referral</Text>
                            </View>
                            <TouchableOpacity
                              style={[styles.dropdownInput, styles.dropdownInputActive]}
                              onPress={() => setShowReferralOptions(!showReferralOptions)}
                            >
                              <Ionicons name={showReferralOptions ? "chevron-up" : "chevron-down"} size={20} color="#64748B" />
                              <Text style={styles.dropdownText}>
                                {(() => {
                                  if (!selectedToothForDetails) return 'Select';
                                  const selectedReferrals = selectedReferralFor[selectedToothForDetails] || [];
                                  if (selectedReferrals.length === 0) return 'Select';
                                  const labels = selectedReferrals
                                    .map(key => referralOptions.find(opt => opt.key === key)?.label)
                                    .filter(Boolean);
                                  return labels.join(', ') || 'Select';
                                })()}
                              </Text>
                            </TouchableOpacity>
                          </View>

                          {/* Referral Options Modal */}
                          <Modal
                            visible={showReferralOptions && !!selectedToothForDetails}
                            transparent={true}
                            animationType="fade"
                            onRequestClose={() => setShowReferralOptions(false)}
                          >
                            <TouchableOpacity
                              style={styles.dropdownModalOverlay}
                              activeOpacity={1}
                              onPress={() => setShowReferralOptions(false)}
                            >
                              <TouchableOpacity
                                activeOpacity={1}
                                onPress={(e) => e.stopPropagation()}
                                style={{ width: '85%' }}
                              >
                                <View style={styles.dropdownModalContent}>
                                  <Text style={styles.dropdownModalTitle}>Select Referral</Text>
                                  <ScrollView
                                    style={styles.dropdownModalList}
                                    showsVerticalScrollIndicator={true}
                                  >
                                    {referralOptions.map((referral) => {
                                      const selectedReferrals = selectedReferralFor[selectedToothForDetails!] || [];
                                      const isSelected = selectedReferrals.includes(referral.key);

                                      return (
                                        <TouchableOpacity
                                          key={referral.key}
                                          style={styles.dropdownModalOption}
                                          onPress={() => {
                                            if (!selectedToothForDetails) return;

                                            setSelectedReferralFor(prev => {
                                              const currentReferrals = prev[selectedToothForDetails] || [];
                                              const newReferrals = isSelected
                                                ? currentReferrals.filter(r => r !== referral.key)
                                                : [...currentReferrals, referral.key];

                                              return {
                                                ...prev,
                                                [selectedToothForDetails]: newReferrals
                                              };
                                            });
                                            setHasModalChanges(true);
                                          }}
                                        >
                                          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                            {isSelected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                                          </View>
                                          <Text style={styles.optionText}>{referral.label}</Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </ScrollView>
                                </View>
                              </TouchableOpacity>
                            </TouchableOpacity>
                          </Modal>
                        </>
                      )}
                    </View>
                  )}

                  {/* Records Section - Single White Container */}
                  {showRecordsSection && (
                    <View style={styles.recordsMainContainer}>
                      {/* Records Type Buttons - Fixed at Top */}
                      <View style={styles.recordsTypeButtons}>
                        <TouchableOpacity
                          style={[
                            styles.recordsTypeBtn,
                            recordsType === 'editing' && styles.recordsTypeBtnActive
                          ]}
                          onPress={() => setRecordsType('editing')}
                        >
                          <Text style={[
                            styles.recordsTypeBtnText,
                            recordsType === 'editing' && styles.recordsTypeBtnTextActive
                          ]}>Editing Records</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.recordsTypeBtn,
                            recordsType === 'planning' && styles.recordsTypeBtnActive
                          ]}
                          onPress={() => setRecordsType('planning')}
                        >
                          <Text style={[
                            styles.recordsTypeBtnText,
                            recordsType === 'planning' && styles.recordsTypeBtnTextActive
                          ]}>Planning Records</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Saved Records - Scrollable */}
                      <ScrollView
                        style={{ maxHeight: 350 }}
                        showsVerticalScrollIndicator={true}
                        nestedScrollEnabled={true}
                      >
                        {selectedToothForDetails && toothRecords[selectedToothForDetails]?.filter(r => r.type === recordsType).length > 0 ? (
                          <>
                            {renderRecords()}
                          </>
                        ) : (
                          <View style={styles.noRecordsContainer}>
                            <Ionicons name="document-text-outline" size={48} color="rgba(255, 255, 255, 0.3)" />
                            <Text style={styles.noRecordsText}>
                              {recordsType === 'editing' ? 'No editing records yet' : 'No planning records yet'}
                            </Text>
                          </View>
                        )}
                      </ScrollView>
                    </View>
                  )}
                </ScrollView>
              </View>

              {/* Submit Button */}
              <View style={styles.submitButtonContainer}>
                <TouchableOpacity
                  style={[styles.submitButton, hasModalChanges && styles.submitButtonActive]}
                  disabled={!hasModalChanges}
                  onPress={handleSubmit}
                >
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={22}
                    color={hasModalChanges ? "#FFFFFF" : "#1E3A8A"}
                  />
                  <Text style={[styles.submitButtonText, hasModalChanges && { color: '#FFFFFF' }]}>
                    Submit
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </BlurView>
        </View>
      </View>
    </Modal>
  );

  // ---------------------------------------------------------------
  // Render Records Helper
  // ---------------------------------------------------------------
  function renderRecords() {
    if (!selectedToothForDetails) return null;

    const filteredRecords = toothRecords[selectedToothForDetails].filter(r => r.type === recordsType);
    const sortedRecords = [...filteredRecords].sort((a, b) => b.timestampNum - a.timestampNum);

    if (recordsType === 'editing') {
      return sortedRecords.map((record, index) => (
        <View
          key={index}
          style={{
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
            borderRadius: 18,
            padding: 20,
            marginBottom: 16,
            borderWidth: 2,
            borderColor: 'rgba(37, 99, 235, 0.35)',
            overflow: 'hidden',
          }}
        >
          {/* Treatment Details */}
          <View style={{ gap: 8, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row' }}>
              <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                Treatment:
              </Text>
              {(record as EditingRecord).treatment === 'Extraction' || (record as EditingRecord).treatment === 'Filling' || (record as EditingRecord).treatment === 'Pulpectomy' ? (
                <View style={{
                  backgroundColor:
                    (record as EditingRecord).treatment === 'Extraction'
                      ? 'rgba(156, 163, 175, 0.15)'
                      : (record as EditingRecord).treatment === 'Filling'
                        ? 'rgba(16, 185, 129, 0.15)'
                        : 'rgba(139, 92, 246, 0.15)',
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 8,
                  alignSelf: 'flex-start',
                }}>
                  <Text style={{
                    fontSize: 14,
                    color: (record as EditingRecord).treatment === 'Extraction'
                      ? '#4B5563'
                      : (record as EditingRecord).treatment === 'Filling'
                        ? '#047857'
                        : '#7C3AED',
                    fontWeight: '600'
                  }}>
                    {(record as EditingRecord).treatment}
                  </Text>
                </View>
              ) : (
                <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                  {(record as EditingRecord).treatment}
                </Text>
              )}
            </View>

            {(record as EditingRecord).details && (
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                  Details:
                </Text>
                <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                  {(record as EditingRecord).details}
                </Text>
              </View>
            )}

            <View style={{ flexDirection: 'row' }}>
              <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                Surfaces:
              </Text>
              <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                {(record as EditingRecord).treatment === 'Extraction'
                  ? 'N/A'
                  : (record.surfaces && record.surfaces.length > 0
                    ? record.surfaces.join(', ')
                    : '-'
                  )
                }
              </Text>
            </View>
          </View>

          {/* Footer Info */}
          <View style={{
            borderTopWidth: 1,
            borderTopColor: 'rgba(37, 99, 235, 0.2)',
            paddingTop: 12,
            gap: 6,
          }}>
            <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '500' }}>
              {record.timestamp}
            </Text>
            <Text style={{ fontSize: 13, color: '#2563EB', fontWeight: '600' }}>
              Dr. {record.doctorName}
            </Text>
          </View>
        </View>
      ));
    }

    // Planning records with grouping logic
    type PlanningRecordType = Extract<ToothRecord, { type: 'planning' }>;
    const planningRecords = sortedRecords as PlanningRecordType[];

    type RecordGroup = {
      doctorName: string;
      action: 'diagnosed' | 'canceled';
      records: PlanningRecordType[];
    };

    const groupedRecords: RecordGroup[] = [];

    planningRecords.forEach((record) => {
      const lastGroup = groupedRecords[groupedRecords.length - 1];

      const shouldStartNewGroup =
        !lastGroup ||
        lastGroup.action !== record.action;

      if (shouldStartNewGroup) {
        groupedRecords.push({
          doctorName: record.doctorName,
          action: record.action,
          records: [record]
        });
      } else {
        lastGroup.records.push(record);
      }
    });

    return groupedRecords.map((group, groupIndex) => {
      const allSurfaces: string[] = [];
      const allConditions: string[] = [];
      const changedSurfaces: string[] = [];

      group.records.forEach(rec => {
        if (rec.condition && !allConditions.includes(rec.condition)) {
          allConditions.push(rec.condition);
        }
        if (rec.surfaces) {
          rec.surfaces.forEach(surf => {
            if (!allSurfaces.includes(surf)) {
              allSurfaces.push(surf);
            }
          });
        }
        if (rec.isChange && rec.surfaces) {
          rec.surfaces.forEach(surf => {
            if (!changedSurfaces.includes(surf)) {
              changedSurfaces.push(surf);
            }
          });
        }
      });

      const firstRecord = group.records[0];

      return (
        <View
          key={groupIndex}
          style={{
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
            borderRadius: 18,
            padding: 20,
            marginBottom: 16,
            borderWidth: 2,
            borderColor: 'rgba(37, 99, 235, 0.35)',
            overflow: 'hidden',
          }}
        >
          {/* Diagnosed/Canceled Badge */}
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 8,
              backgroundColor: group.action === 'diagnosed' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(156, 163, 175, 0.15)',
              alignSelf: 'flex-start',
              marginBottom: 14,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: group.action === 'diagnosed' ? '#D97706' : '#6B7280' }}>
              {group.action === 'diagnosed' ? 'Diagnosed' : 'Canceled'}
            </Text>
          </View>

          {/* Change message if applicable */}
          {firstRecord.isChange && (
            <View style={{
              backgroundColor: 'rgba(251, 146, 60, 0.1)',
              borderWidth: 2,
              borderColor: 'rgba(251, 146, 60, 0.3)',
              padding: 16,
              borderRadius: 12,
              marginBottom: 12
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 18, marginRight: 8 }}>🔄</Text>
                <Text style={{ fontSize: 15, color: '#EA580C', fontWeight: '700', letterSpacing: 0.3 }}>
                  Condition Changed
                </Text>
              </View>

              <View style={{ gap: 6, marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, color: '#DC2626', fontWeight: '600', marginRight: 6 }}>−</Text>
                  <Text style={{ fontSize: 14, color: '#DC2626', fontWeight: '500', textDecorationLine: 'line-through' }}>
                    {firstRecord.previousCondition}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, color: '#059669', fontWeight: '600', marginRight: 6 }}>+</Text>
                  <Text style={{ fontSize: 14, color: '#059669', fontWeight: '600' }}>
                    {firstRecord.condition}
                  </Text>
                </View>
              </View>

              {changedSurfaces.length > 0 && (
                <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, color: '#EA580C', fontWeight: '600', minWidth: 70 }}>
                    Surfaces:
                  </Text>
                  <Text style={{ fontSize: 13, color: '#9A3412', fontWeight: '500', flex: 1 }}>
                    {changedSurfaces.join(', ')}
                  </Text>
                </View>
              )}

              <View style={{
                borderTopWidth: 1,
                borderTopColor: 'rgba(251, 146, 60, 0.2)',
                paddingTop: 8,
                marginTop: 4
              }}>
                <Text style={{ fontSize: 13, color: '#9A3412', fontWeight: '600' }}>
                  Modified by: Dr. {group.doctorName}
                </Text>
              </View>
            </View>
          )}

          {/* Planning Details */}
          <View style={{ gap: 8, marginBottom: 12 }}>
            {!firstRecord.isChange && allConditions.length > 0 && (() => {
              const hasRootCanalTreated = allSurfaces.some(s => s === 'Root Canal Treated');

              if (hasRootCanalTreated) {
                const otherSurfaces = allSurfaces.filter(s => s !== 'Root Canal Treated');

                return (
                  <>
                    <View style={{ flexDirection: 'row' }}>
                      <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                        Condition:
                      </Text>
                      <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                        Root Canal Treated
                      </Text>
                    </View>

                    {otherSurfaces.length > 0 && (
                      <View style={{ flexDirection: 'row' }}>
                        <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                          Surfaces:
                        </Text>
                        <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                          {otherSurfaces.join(', ')}
                        </Text>
                      </View>
                    )}
                  </>
                );
              } else {
                return (
                  <View style={{ flexDirection: 'row' }}>
                    <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                      Condition:
                    </Text>
                    <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                      {allConditions.join(', ')}
                    </Text>
                  </View>
                );
              }
            })()}

            {!firstRecord.isChange && allSurfaces.length > 0 && !allConditions.includes('Extraction') && !allSurfaces.some(s => s === 'Root Canal Treated') && (
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                  Surfaces:
                </Text>
                <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                  {allSurfaces.join(', ')}
                </Text>
              </View>
            )}
          </View>

          {/* Footer Info */}
          <View style={{
            borderTopWidth: 1,
            borderTopColor: 'rgba(37, 99, 235, 0.2)',
            paddingTop: 12,
            gap: 6,
          }}>
            <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '500' }}>
              {firstRecord.timestamp}
            </Text>
            <Text style={{ fontSize: 13, color: '#2563EB', fontWeight: '600' }}>
              Dr. {group.doctorName}
            </Text>
          </View>
        </View>
      );
    });
  }
};
