// ===============================================================
// ToothDetailsModal - Standalone Reusable Component
// ===============================================================
// Complete tooth details modal extracted from DentalChartScreen
// Can be used in both DentalChartScreen and Timeline (App.tsx)

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, Platform, Keyboard, Animated } from 'react-native';
import { scaledStyleSheet, scale } from '../lib/scale';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

// Database functions
import {
  getEditingRecords,
  getPlanningRecords,
  getAllToothNotes,
  getReferrals,
  createToothNote,
  createReferral,
  createEditingRecord,
  saveToothSurfaceCondition,
  deleteToothSurfaceCondition,
  getCompleteToothData,
} from '../lib/database';

// Types
import type { ToothNumber, ToothSurface, ToothCondition } from '../types';

// Helper functions
import {
  getToothQuadrant,
  getToothPositionNumber,
  getToothName,
  treatmentOptions,
  detailsOptions,
} from '../toothHelpers';

// ===============================================================
// TYPES & INTERFACES
// ===============================================================

interface ToothSurfaceConditions {
  top: ToothCondition | null;
  bottom: ToothCondition | null;
  left: ToothCondition | null;
  right: ToothCondition | null;
  center: ToothCondition | null;
}

type EditingRecord = {
  type: 'editing';
  treatment: string;
  details: string;
  surfaces: string[];
  timestamp: string;
  timestampNum: number;
  doctorName: string;
};

type PlanningRecord = {
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

type ToothRecord = EditingRecord | PlanningRecord;

export interface ToothDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  permanentPatientId: string;
  toothNumber: number | string; // Can be Palmer notation (UL1) or number (1-32)
  currentDoctorName: string;
  onToothDataUpdated?: () => void; // Callback after save
}

// Referral options
const referralOptions = [
  { key: 'endodontics', label: 'Endodontics' },
  { key: 'oralSurgery', label: 'Oral Surgery' },
  { key: 'orthodontics', label: 'Orthodontics' },
  { key: 'periodontics', label: 'Periodontics' },
  { key: 'prosthodontics', label: 'Prosthodontics' },
  { key: 'oralMedicine', label: 'Oral Medicine' },
];

// ===============================================================
// HELPER FUNCTIONS
// ===============================================================

// Convert tooth number (1-32) to Palmer notation (UL1, UR1, etc.)
const convertNumberToPalmer = (toothNumber: number): ToothNumber | null => {
  // Upper Left (1-8 → UL1-UL8) - Swapped!
  if (toothNumber >= 1 && toothNumber <= 8) {
    const position = toothNumber; // 1→UL1, 2→UL2, ..., 8→UL8
    return `UL${position}` as ToothNumber;
  }
  // Upper Right (9-16 → UR8-UR1) - Swapped!
  if (toothNumber >= 9 && toothNumber <= 16) {
    const position = 17 - toothNumber; // 9→UR8, 10→UR7, ..., 16→UR1
    return `UR${position}` as ToothNumber;
  }
  // Lower Left (17-24 → LL1-LL8)
  if (toothNumber >= 17 && toothNumber <= 24) {
    const position = toothNumber - 16; // 17→LL1, 18→LL2, ..., 24→LL8
    return `LL${position}` as ToothNumber;
  }
  // Lower Right (25-32 → LR8-LR1)
  if (toothNumber >= 25 && toothNumber <= 32) {
    const position = 33 - toothNumber; // 25→LR8, 26→LR7, ..., 32→LR1
    return `LR${position}` as ToothNumber;
  }
  return null;
};

// Convert Palmer notation to number (1-32)
const convertPalmerToNumber = (palmerNotation: ToothNumber): number => {
  const quadrant = palmerNotation.substring(0, 2);
  const position = parseInt(palmerNotation.substring(2), 10);

  if (quadrant === 'UL') return position;          // UL1→1, UL2→2, ..., UL8→8 - Swapped!
  if (quadrant === 'UR') return 17 - position;     // UR1→16, UR2→15, ..., UR8→9 - Swapped!
  if (quadrant === 'LL') return 16 + position;     // LL1→17, LL2→18, ..., LL8→24
  if (quadrant === 'LR') return 33 - position;     // LR1→32, LR2→31, ..., LR8→25

  return 0; // Invalid
};

// Get surface mapping for database operations
// Lower teeth (17-32) have swapped mesial/distal positions on screen
const getSurfaceMap = (toothNumber: number): Record<keyof ToothSurfaceConditions, ToothSurface> => {
  const isLowerTooth = toothNumber >= 17 && toothNumber <= 32;

  return {
    top: isLowerTooth ? 'distal' : 'mesial', // Swap for lower teeth
    bottom: isLowerTooth ? 'mesial' : 'distal', // Swap for lower teeth
    left: 'lingual',
    right: 'buccal',
    center: 'occlusal',
  };
};

// Get all surfaces for a tooth (with proper labels)
const getAllSurfaces = (toothNumber: number): Array<{ key: string; label: string }> => {
  const isLowerTooth = toothNumber >= 17 && toothNumber <= 32;
  const swapMesialDistal = isLowerTooth;
  const palatalOrLingual = isLowerTooth ? 'Lingual' : 'Palatal';

  return [
    { key: 'top', label: swapMesialDistal ? 'Distal' : 'Mesial' },
    { key: 'bottom', label: swapMesialDistal ? 'Mesial' : 'Distal' },
    { key: 'left', label: palatalOrLingual },
    { key: 'right', label: 'Buccal' },
    { key: 'center', label: 'Occlusal' },
  ];
};

// ===============================================================
// MAIN COMPONENT
// ===============================================================

export default function ToothDetailsModal({
  visible,
  onClose,
  permanentPatientId,
  toothNumber,
  currentDoctorName,
  onToothDataUpdated,
}: ToothDetailsModalProps) {
  // ───────────────────────────────────────────────────────────
  // STATE VARIABLES
  // ───────────────────────────────────────────────────────────

  // Convert tooth number to numeric format if it's Palmer notation
  const toothNumberNumeric =
    typeof toothNumber === 'string' ? convertPalmerToNumber(toothNumber as ToothNumber) : toothNumber;

  // Dropdown visibility
  const [showSurfaceOptions, setShowSurfaceOptions] = useState(false);
  const [showTreatmentOptions, setShowTreatmentOptions] = useState(false);
  const [showDetailsOptions, setShowDetailsOptions] = useState(false);
  const [showReferralOptions, setShowReferralOptions] = useState(false);

  // Modal state
  const [hasModalChanges, setHasModalChanges] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // أنيميشن نبض لزر Edit
  const editPulseAnim = React.useRef(new Animated.Value(1)).current;
  const pulseAnimRef = React.useRef<Animated.CompositeAnimation | null>(null);
  React.useEffect(() => {
    if (!isEditMode) {
      editPulseAnim.setValue(1);
      pulseAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(editPulseAnim, { toValue: 1.15, duration: 900, useNativeDriver: true }),
          Animated.timing(editPulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      );
      pulseAnimRef.current.start();
    } else {
      if (pulseAnimRef.current) {
        pulseAnimRef.current.stop();
        pulseAnimRef.current = null;
      }
      editPulseAnim.setValue(1);
    }
    return () => {
      if (pulseAnimRef.current) {
        pulseAnimRef.current.stop();
      }
    };
  }, [isEditMode, toothNumberNumeric]);

  // Section visibility
  const [showNotesSection, setShowNotesSection] = useState(false);
  const [showDetailsSection, setShowDetailsSection] = useState(true);
  const [showRecordsSection, setShowRecordsSection] = useState(false);
  const [showReferralSection, setShowReferralSection] = useState(false);

  // Records type
  const [recordsType, setRecordsType] = useState<'editing' | 'planning'>('editing');

  // Notes state
  const [currentNote, setCurrentNote] = useState('');
  const [unreadNotes, setUnreadNotes] = useState<Record<number | string, number>>({});
  const [viewedNotesTooths, setViewedNotesTooths] = useState<Record<number | string, boolean>>({});

  // Original values for rollback
  const [originalValues, setOriginalValues] = useState<{
    treatment?: string;
    details?: string;
    surfaces?: string[];
  }>({});

  // Tooth data state
  const [toothConditions, setToothConditions] = useState<Record<number | string, ToothSurfaceConditions>>({});
  const [selectedTreatments, setSelectedTreatments] = useState<Record<number | string, string>>({});
  const [selectedDetails, setSelectedDetails] = useState<Record<number | string, string>>({});
  const [selectedReferralFor, setSelectedReferralFor] = useState<Record<number | string, string[]>>({});
  const [selectedSurfaces, setSelectedSurfaces] = useState<Record<number | string, string[]>>({});
  const [toothNotes, setToothNotes] = useState<
    Record<number | string, Array<{ text: string; timestamp: string; doctorName: string }>>
  >({});
  const [toothRecords, setToothRecords] = useState<Record<number | string, ToothRecord[]>>({});

  // Refs
  const skipPlanningRecordRef = useRef(false);

  // ───────────────────────────────────────────────────────────
  // EFFECTS
  // ───────────────────────────────────────────────────────────

  // Load tooth data when modal opens
  useEffect(() => {
    if (visible && toothNumberNumeric && permanentPatientId) {
      loadToothData();
    }
  }, [visible, toothNumberNumeric, permanentPatientId]);

  // Sync selectedSurfaces with toothConditions when modal opens
  // استثناء: الأسطح التي condition = 'permanent_filling' أو 'follow_up' لا تظهر تلقائيًا
  useEffect(() => {
    if (visible && toothNumberNumeric && toothConditions[toothNumberNumeric]) {
      const toothCondition = toothConditions[toothNumberNumeric];
      const activeSurfaces: string[] = [];

      // Add surfaces that have conditions (excluding 'follow_up' and 'permanent_filling')
      Object.entries(toothCondition).forEach(([surface, condition]) => {
        if (condition && condition !== 'follow_up' && condition !== 'permanent_filling') {
          activeSurfaces.push(surface);
        }
      });

      setSelectedSurfaces((prev) => ({
        ...prev,
        [toothNumberNumeric]: activeSurfaces,
      }));
    }
  }, [visible, toothNumberNumeric, toothConditions]);

  // ───────────────────────────────────────────────────────────
  // DATA LOADING
  // ───────────────────────────────────────────────────────────

  const loadToothData = async () => {
    try {
      const palmerNotation = convertNumberToPalmer(toothNumberNumeric);
      if (!palmerNotation) return;

      // Load tooth surface conditions
      const { data: allTeethData } = await getCompleteToothData(permanentPatientId);
      if (allTeethData && allTeethData.length > 0) {
        // Find the specific tooth
        const toothData = allTeethData.find((t) => t.tooth_number === palmerNotation);

        if (toothData && toothData.surfaces) {
          setToothConditions({ [toothNumberNumeric]: toothData.surfaces });
        }
      }

      // Load editing records
      const { data: editingRecords } = await getEditingRecords(permanentPatientId);

      // Load planning records
      const { data: planningRecords } = await getPlanningRecords(permanentPatientId);

      // Load notes
      const { data: allNotes } = await getAllToothNotes(permanentPatientId);

      // Load referrals
      const { data: allReferrals } = await getReferrals(permanentPatientId);

      // Transform editing records
      if (editingRecords) {
        const recordsByTooth: Record<number | string, ToothRecord[]> = {};

        editingRecords.forEach((record) => {
          const toothNum = convertPalmerToNumber(record.tooth_number);
          if (!recordsByTooth[toothNum]) {
            recordsByTooth[toothNum] = [];
          }

          recordsByTooth[toothNum].push({
            type: 'editing',
            treatment: record.treatment,
            details: record.details || '',
            surfaces: record.surfaces,
            timestamp: new Date(record.timestamp).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }),
            timestampNum: record.timestamp_num,
            doctorName: record.doctor_name,
          });
        });

        // Replace old records instead of appending
        setToothRecords(recordsByTooth);
      }

      // Transform planning records
      if (planningRecords) {
        const recordsByTooth: Record<number | string, ToothRecord[]> = {};

        planningRecords.forEach((record) => {
          const toothNum = convertPalmerToNumber(record.tooth_number);
          if (!recordsByTooth[toothNum]) {
            recordsByTooth[toothNum] = [];
          }

          recordsByTooth[toothNum].push({
            type: 'planning',
            action: record.action,
            condition: record.condition,
            surfaces: record.surfaces,
            timestamp: new Date(record.timestamp).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }),
            timestampNum: record.timestamp_num,
            doctorName: record.doctor_name,
            isChange: record.is_change,
            previousCondition: record.previous_condition,
          });
        });

        // Merge planning records with editing records (don't use prev to avoid duplicates)
        setToothRecords((current) => {
          const merged = { ...current };
          Object.keys(recordsByTooth).forEach((toothNum) => {
            if (merged[toothNum]) {
              // Combine editing and planning records for this tooth
              merged[toothNum] = [...merged[toothNum], ...recordsByTooth[toothNum]];
            } else {
              merged[toothNum] = recordsByTooth[toothNum];
            }
          });
          return merged;
        });
      }

      // Transform notes
      if (allNotes) {
        const notesByTooth: Record<number | string, Array<{ text: string; timestamp: string; doctorName: string }>> =
          {};

        allNotes.forEach((note) => {
          const toothNum = convertPalmerToNumber(note.tooth_number);
          if (!notesByTooth[toothNum]) {
            notesByTooth[toothNum] = [];
          }

          notesByTooth[toothNum].push({
            text: note.note,
            timestamp: new Date(note.timestamp).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }),
            doctorName: note.doctor_name,
          });
        });

        setToothNotes(notesByTooth);

        // Set unread badge count based on existing notes
        const noteCounts: Record<number | string, number> = {};
        Object.keys(notesByTooth).forEach((toothNum) => {
          noteCounts[toothNum] = notesByTooth[toothNum].length;
        });
        setUnreadNotes(noteCounts);
      }
    } catch (error) {
      console.error('Error loading tooth data:', error);
    }
  };

  // ───────────────────────────────────────────────────────────
  // EVENT HANDLERS
  // ───────────────────────────────────────────────────────────

  const handleClose = () => {
    // Restore original values or delete new values on close without Submit
    if (toothNumberNumeric) {
      // Restore or delete Treatment
      setSelectedTreatments((prev) => {
        const newState = { ...prev };
        if (originalValues.treatment) {
          newState[toothNumberNumeric] = originalValues.treatment;
        } else {
          delete newState[toothNumberNumeric];
        }
        return newState;
      });

      // Restore or delete Details
      setSelectedDetails((prev) => {
        const newState = { ...prev };
        if (originalValues.details) {
          newState[toothNumberNumeric] = originalValues.details;
        } else {
          delete newState[toothNumberNumeric];
        }
        return newState;
      });

      // Restore or delete Surfaces
      setSelectedSurfaces((prev) => {
        const newState = { ...prev };
        if (originalValues.surfaces && originalValues.surfaces.length > 0) {
          newState[toothNumberNumeric] = [...originalValues.surfaces];
        } else {
          delete newState[toothNumberNumeric];
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

  const handleSubmitChanges = async () => {
    if (!hasModalChanges || !toothNumberNumeric) return;

    // ════════════════════════════════════════════════════════════
    // SECTION 1: Save Note
    // ════════════════════════════════════════════════════════════
    if (currentNote.trim()) {
      const now = new Date();
      const timestamp = now.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const existingNotes = toothNotes[toothNumberNumeric] || [];
      setToothNotes((prev) => ({
        ...prev,
        [toothNumberNumeric]: [
          ...existingNotes,
          { text: currentNote.trim(), timestamp, doctorName: currentDoctorName },
        ],
      }));

      // Save tooth note to database
      if (permanentPatientId && currentDoctorName) {
        const palmerNotation = convertNumberToPalmer(toothNumberNumeric);
        if (palmerNotation) {
          const { error: noteError } = await createToothNote(
            permanentPatientId,
            palmerNotation,
            currentNote.trim(),
            currentDoctorName
          );

          if (noteError) {
            console.error('Error saving tooth note:', noteError);
          } else {
            console.log('Saved tooth note to database');
          }
        }
      }

      // Set unread badge for this tooth
      setUnreadNotes((prev) => ({
        ...prev,
        [toothNumberNumeric]: (prev[toothNumberNumeric] || 0) + 1,
      }));

      setCurrentNote('');
    }

    // ════════════════════════════════════════════════════════════
    // SECTION 2: Save Referrals
    // ════════════════════════════════════════════════════════════
    const selectedReferrals = selectedReferralFor[toothNumberNumeric] || [];
    if (selectedReferrals.length > 0) {
      // Save all referrals to database immediately to persist after logout
      if (permanentPatientId && currentDoctorName) {
        const palmerNotation = convertNumberToPalmer(toothNumberNumeric);
        if (palmerNotation) {
          const referralTypeMap: Record<string, string> = {
            endodontics: 'Endodontics',
            oralSurgery: 'Oral Surgery',
            orthodontics: 'Orthodontics',
            prosthodontics: 'Prosthodontics',
            periodontics: 'Periodontics',
            oralMedicine: 'Oral Medicine',
          };

          // Save each referral separately
          for (const referralKey of selectedReferrals) {
            const referralName = referralTypeMap[referralKey] || referralKey;

            const { error: referralError } = await createReferral(
              permanentPatientId,
              palmerNotation,
              referralName,
              currentDoctorName
            );

            if (referralError) {
              console.error(`Error saving referral ${referralName}:`, referralError);
            } else {
              console.log(`Saved referral ${referralName} to database`);
            }
          }
        }
      }
    }

    // ════════════════════════════════════════════════════════════
    // SECTION 3: Save Editing Record (Only if Edit mode is active)
    // ════════════════════════════════════════════════════════════
    if (isEditMode) {
      const treatment = selectedTreatments[toothNumberNumeric];
      const details = selectedDetails[toothNumberNumeric];

      if (treatment || details) {
        const now = new Date();
        const timestamp = now.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        const treatmentLabel = treatment ? treatmentOptions.find((opt) => opt.key === treatment)?.label || treatment : 'N/A';
        const detailsLabel = details ? detailsOptions.find((opt) => opt.key === details)?.label || details : 'N/A';

        // Get selected surface names
        const selectedSurfacesForTooth = selectedSurfaces[toothNumberNumeric] || [];
        const surfaceNames = selectedSurfacesForTooth.map((surfaceKey) => {
          const surfaceOptions = getAllSurfaces(toothNumberNumeric);
          const surface = surfaceOptions.find((opt) => opt.key === surfaceKey);
          return surface?.label || surfaceKey;
        });

        const existingRecords = toothRecords[toothNumberNumeric] || [];
        setToothRecords((prev) => ({
          ...prev,
          [toothNumberNumeric]: [
            ...existingRecords,
            {
              treatment: treatmentLabel,
              details: detailsLabel,
              surfaces: surfaceNames,
              timestamp,
              timestampNum: now.getTime(),
              doctorName: currentDoctorName,
              type: 'editing',
            },
          ],
        }));

        // Save editing record to database
        if (permanentPatientId && currentDoctorName) {
          const palmerNotation = convertNumberToPalmer(toothNumberNumeric);
          if (palmerNotation) {
            // Map UI surface keys to database surface names
            const surfaceMap = getSurfaceMap(toothNumberNumeric);
            const dbSurfaces = selectedSurfacesForTooth
              .map((key) => surfaceMap[key as keyof ToothSurfaceConditions])
              .filter((s): s is ToothSurface => s !== undefined);

            // Save editing record to database
            const { error: editingError } = await createEditingRecord(
              permanentPatientId,
              palmerNotation,
              treatmentLabel,
              dbSurfaces,
              currentDoctorName,
              detailsLabel
            );

            if (editingError) {
              console.error('Error saving editing record:', editingError);
            } else {
              console.log('Saved editing record to database');
            }

            // Handle Filling and Pulpectomy
            if (treatment === 'filling' || treatment === 'pulpectomy') {
              // ALWAYS delete all existing surface conditions first
              // This removes old extraction ('missing') conditions from all surfaces
              try {
                const allSurfaces: ToothSurface[] = ['mesial', 'distal', 'buccal', 'lingual', 'occlusal'];
                const deletePromises = allSurfaces.map((surface) =>
                  deleteToothSurfaceCondition(permanentPatientId, palmerNotation, surface)
                );
                await Promise.all(deletePromises);
                console.log(`✅ Deleted all existing surface conditions for tooth ${palmerNotation}`);
              } catch (error) {
                console.error('Error deleting old surface conditions:', error);
              }

              // Save surface colors ONLY if Details and Surfaces are selected
              if (selectedSurfacesForTooth.length > 0 && details) {
                // Determine color based on details
                let conditionColor: ToothCondition;
                if (details === 'temporary_filling') {
                  conditionColor = 'filling_replacement'; // Gray
                } else if (details === 'permanent_filling') {
                  conditionColor = 'permanent_filling'; // Green
                } else if (details === 'gi_filling') {
                  conditionColor = 'gi'; // Green
                } else if (details === 'direct_pulp_capping') {
                  conditionColor = 'direct_pulp_capping'; // Green
                } else if (details === 'indirect_pulp_capping') {
                  conditionColor = 'indirect_pulp_capping'; // Green
                } else {
                  conditionColor = 'treated'; // Fallback
                }

                // Save to tooth_surface_conditions for each selected surface
                try {
                  const surfacePromises = dbSurfaces.map((dbSurface) =>
                    saveToothSurfaceCondition(permanentPatientId, palmerNotation, dbSurface, conditionColor)
                  );

                  await Promise.all(surfacePromises);
                  console.log(`✅ Saved ${dbSurfaces.length} surface colors (${conditionColor}) on selected surfaces`);
                  console.log(`✅ Other surfaces are now healthy (white)`);
                } catch (error) {
                  console.error('Error saving surface conditions:', error);
                }
              } else {
                console.log(`✅ All surfaces are now healthy (white) - no Details selected`);
              }
            }

            // Handle Extraction (Missing Tooth)
            if (treatment === 'extraction') {
              try {
                const allSurfaces: ToothSurface[] = ['mesial', 'distal', 'buccal', 'lingual', 'occlusal'];
                const extractionPromises = allSurfaces.map((surface) =>
                  saveToothSurfaceCondition(permanentPatientId, palmerNotation, surface, 'missing')
                );
                await Promise.all(extractionPromises);
                console.log('Saved extraction (missing) to all tooth surfaces');
              } catch (error) {
                console.error('Error saving extraction:', error);
              }
            }
          }
        }
      }
    }

    // ════════════════════════════════════════════════════════════
    // SECTION 4: Close Modal and Reset
    // ════════════════════════════════════════════════════════════
    setHasModalChanges(false);
    setShowNotesSection(false);
    setShowReferralSection(false);
    setIsEditMode(false);
    setOriginalValues({});

    // Call the callback to refresh parent component and WAIT for it
    if (onToothDataUpdated) {
      await onToothDataUpdated();
    }

    onClose();
  };

  // ───────────────────────────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────────────────────────

  if (!visible || !toothNumberNumeric) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={{ width: '95%', height: '75%', borderRadius: scale(24), overflow: 'hidden' }}>
          <BlurView intensity={90} tint="light" style={styles.newModalContainer}>
            <View style={{ backgroundColor: 'rgba(240, 249, 255, 0.95)', flex: 1 }}>
                  {/* ════════════════════════════════════════════ */}
                  {/* HEADER SECTION */}
                  {/* ════════════════════════════════════════════ */}
                  <View style={styles.newModalHeader}>
                    <View
                      style={[
                        styles.toothNumberBox,
                        convertNumberToPalmer(toothNumberNumeric) &&
                          getToothQuadrant(convertNumberToPalmer(toothNumberNumeric)!) === 'UL' && {
                            borderLeftWidth: scale(2),
                            borderBottomWidth: scale(2),
                            borderLeftColor: '#1E3A8A',
                            borderBottomColor: '#1E3A8A',
                          },
                        convertNumberToPalmer(toothNumberNumeric) &&
                          getToothQuadrant(convertNumberToPalmer(toothNumberNumeric)!) === 'UR' && {
                            borderRightWidth: scale(2),
                            borderBottomWidth: scale(2),
                            borderRightColor: '#1E3A8A',
                            borderBottomColor: '#1E3A8A',
                          },
                        convertNumberToPalmer(toothNumberNumeric) &&
                          getToothQuadrant(convertNumberToPalmer(toothNumberNumeric)!) === 'LL' && {
                            borderLeftWidth: scale(2),
                            borderTopWidth: scale(2),
                            borderLeftColor: '#1E3A8A',
                            borderTopColor: '#1E3A8A',
                          },
                        convertNumberToPalmer(toothNumberNumeric) &&
                          getToothQuadrant(convertNumberToPalmer(toothNumberNumeric)!) === 'LR' && {
                            borderRightWidth: scale(2),
                            borderTopWidth: scale(2),
                            borderRightColor: '#1E3A8A',
                            borderTopColor: '#1E3A8A',
                          },
                      ]}
                    >
                      <Text style={styles.modalToothNumberText}>
                        {convertNumberToPalmer(toothNumberNumeric)
                          ? getToothPositionNumber(convertNumberToPalmer(toothNumberNumeric)!)
                          : toothNumberNumeric}
                      </Text>
                    </View>
                    <Text style={styles.modalToothNameText}>
                      {convertNumberToPalmer(toothNumberNumeric)
                        ? getToothName(convertNumberToPalmer(toothNumberNumeric)!).english
                        : 'Tooth'}
                    </Text>
                    <View style={styles.headerButtons}>
                      <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                        <Ionicons name="close" size={scale(24)} color="#1E3A8A" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Header Divider */}
                  <View style={styles.headerDivider} />

                  {/* ════════════════════════════════════════════ */}
                  {/* TAB BUTTONS (Records, Details, Notes, Referral) */}
                  {/* ════════════════════════════════════════════ */}
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
                      <Ionicons name="document-text-outline" size={scale(22)} color={showRecordsSection ? '#FFFFFF' : '#64748B'} />
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
                      <Ionicons name="information-circle-outline" size={scale(22)} color={showDetailsSection ? '#FFFFFF' : '#64748B'} />
                      <Text style={[styles.tabBtnText, showDetailsSection && styles.tabBtnTextActive]}>Details</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.tabBtn, showNotesSection && styles.tabBtnActive]}
                      onPress={() => {
                        setShowNotesSection(true);
                        setShowDetailsSection(false);
                        setShowRecordsSection(false);
                        setShowReferralSection(false);
                        // Clear unread notes badge when opening notes
                        setUnreadNotes((prev) => ({
                          ...prev,
                          [toothNumberNumeric]: 0,
                        }));
                        // Mark this tooth's notes as viewed permanently
                        setViewedNotesTooths((prev) => ({
                          ...prev,
                          [toothNumberNumeric]: true,
                        }));
                      }}
                    >
                      <View>
                        <Ionicons name="create-outline" size={scale(22)} color={showNotesSection ? '#FFFFFF' : '#64748B'} />
                        {unreadNotes[toothNumberNumeric] > 0 && !viewedNotesTooths[toothNumberNumeric] && (
                          <View style={styles.notificationBadge}>
                            <Text style={styles.notificationBadgeText}>{unreadNotes[toothNumberNumeric]}</Text>
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
                      <Ionicons name="arrow-redo-outline" size={scale(22)} color={showReferralSection ? '#FFFFFF' : '#64748B'} />
                      <Text style={[styles.tabBtnText, showReferralSection && styles.tabBtnTextActive]}>Referral</Text>
                    </TouchableOpacity>
                  </View>

                  {/* ════════════════════════════════════════════ */}
                  {/* CONTENT SECTIONS */}
                  {/* ════════════════════════════════════════════ */}
                  <View style={{ flex: 1, paddingHorizontal: scale(16), paddingTop: scale(16) }}>
                      {/* DETAILS SECTION */}
                      {!showRecordsSection && showDetailsSection && (
                        <ScrollView
                          style={{ flex: 1 }}
                          contentContainerStyle={{ paddingBottom: 20, paddingTop: 20 }}
                          showsVerticalScrollIndicator={true}
                        >
                        {/* Edit Badge - باج نبضي فوق الكرت */}
                        <View style={{ position: 'relative' }}>
                          <TouchableOpacity
                            onPress={() => {
                              setIsEditMode(!isEditMode);
                              if (isEditMode) {
                                setHasModalChanges(false);
                              }
                            }}
                            style={{ position: 'absolute', top: scale(-18), right: scale(8), zIndex: 20 }}
                          >
                            <Animated.View style={{
                              transform: [{ scale: isEditMode ? 1 : editPulseAnim }],
                              backgroundColor: isEditMode ? '#3B82F6' : '#60A5FA',
                              width: scale(40),
                              height: scale(40),
                              borderRadius: scale(20),
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderWidth: scale(3),
                              borderColor: '#FFFFFF',
                            }}>
                              <Ionicons name="create-outline" size={scale(20)} color="#FFFFFF" />
                            </Animated.View>
                          </TouchableOpacity>

                        <View style={styles.mainSectionsContainer}>
                          {/* Treatment Section */}
                          <View style={styles.sectionRow}>
                            <View style={styles.sectionLabelContainer}>
                              <Ionicons name="medical-outline" size={scale(20)} color="#1E293B" />
                              <Text style={styles.sectionTitle}>Treatment</Text>
                            </View>
                            <TouchableOpacity
                              style={[styles.dropdownInput, isEditMode && styles.dropdownInputActive]}
                              onPress={() => isEditMode && setShowTreatmentOptions(!showTreatmentOptions)}
                              disabled={!isEditMode}
                            >
                              <Ionicons name={showTreatmentOptions ? 'chevron-up' : 'chevron-down'} size={scale(20)} color="#64748B" />
                              <Text style={styles.dropdownText}>
                                {selectedTreatments[toothNumberNumeric]
                                  ? treatmentOptions.find((opt) => opt.key === selectedTreatments[toothNumberNumeric])?.label || 'Select'
                                  : 'Select'}
                              </Text>
                            </TouchableOpacity>
                          </View>

                          {/* Treatment Options Modal */}
                          <Modal visible={showTreatmentOptions} transparent={true} animationType="fade" onRequestClose={() => setShowTreatmentOptions(false)}>
                            <TouchableOpacity style={styles.dropdownModalOverlay} activeOpacity={1} onPress={() => setShowTreatmentOptions(false)}>
                              <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ width: '85%' }}>
                                <View style={styles.dropdownModalContent}>
                                  <Text style={styles.dropdownModalTitle}>Select Treatment</Text>
                                  <ScrollView style={styles.dropdownModalList} showsVerticalScrollIndicator={true}>
                                    {treatmentOptions.map((treatment) => {
                                      const isSelected = selectedTreatments[toothNumberNumeric] === treatment.key;

                                      return (
                                        <TouchableOpacity
                                          key={treatment.key}
                                          style={styles.dropdownModalOption}
                                          onPress={() => {
                                            if (!isEditMode) return;

                                            setSelectedTreatments((prev) => ({
                                              ...prev,
                                              [toothNumberNumeric]: treatment.key,
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
                          {selectedTreatments[toothNumberNumeric] !== 'extraction' && (
                            <>
                              <View style={styles.sectionRow}>
                                <View style={styles.sectionLabelContainer}>
                                  <Ionicons name="list-outline" size={scale(20)} color="#1E293B" />
                                  <Text style={styles.sectionTitle}>Details</Text>
                                </View>
                                <TouchableOpacity
                                  style={[styles.dropdownInput, isEditMode && styles.dropdownInputActive]}
                                  onPress={() => isEditMode && setShowDetailsOptions(!showDetailsOptions)}
                                  disabled={!isEditMode}
                                >
                                  <Ionicons name={showDetailsOptions ? 'chevron-up' : 'chevron-down'} size={scale(20)} color="#64748B" />
                                  <Text style={styles.dropdownText}>
                                    {selectedDetails[toothNumberNumeric]
                                      ? detailsOptions.find((opt) => opt.key === selectedDetails[toothNumberNumeric])?.label || 'Select'
                                      : 'Select'}
                                  </Text>
                                </TouchableOpacity>
                              </View>

                              {/* Details Options Modal */}
                              <Modal visible={showDetailsOptions} transparent={true} animationType="fade" onRequestClose={() => setShowDetailsOptions(false)}>
                                <TouchableOpacity style={styles.dropdownModalOverlay} activeOpacity={1} onPress={() => setShowDetailsOptions(false)}>
                                  <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ width: '85%' }}>
                                    <View style={styles.dropdownModalContent}>
                                      <Text style={styles.dropdownModalTitle}>Select Details</Text>
                                      <ScrollView style={styles.dropdownModalList} showsVerticalScrollIndicator={true}>
                                        {detailsOptions.map((detail) => {
                                          const isSelected = selectedDetails[toothNumberNumeric] === detail.key;

                                          return (
                                            <TouchableOpacity
                                              key={detail.key}
                                              style={styles.dropdownModalOption}
                                              onPress={() => {
                                                if (!isEditMode) return;

                                                setSelectedDetails((prev) => ({
                                                  ...prev,
                                                  [toothNumberNumeric]: detail.key,
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

                              {/* Hide Surfaces Section if Extraction is selected */}
                              {(() => {
                                const currentTreatment = selectedTreatments[toothNumberNumeric];
                                const isExtraction = currentTreatment === 'extraction';
                                console.log(`🔍 Treatment for tooth ${toothNumberNumeric}:`, currentTreatment);
                                console.log(`🔍 Is Extraction?`, isExtraction);
                                console.log(`🔍 Should show Surfaces?`, !isExtraction);
                                // Show Surfaces only if NOT extraction (or if no treatment selected yet)
                                return !isExtraction;
                              })() && (
                                <>
                                  <View style={styles.sectionDivider} />

                                  {/* Surfaces Section */}
                                  <View style={styles.sectionRow}>
                                    <View style={styles.sectionLabelContainer}>
                                      <Ionicons name="layers-outline" size={scale(20)} color="#1E293B" />
                                      <Text style={styles.sectionTitle}>Surfaces</Text>
                                    </View>
                                    <TouchableOpacity
                                      style={[styles.dropdownInput, isEditMode && styles.dropdownInputActive]}
                                      onPress={() => isEditMode && setShowSurfaceOptions(!showSurfaceOptions)}
                                      disabled={!isEditMode}
                                    >
                                      <Ionicons name={showSurfaceOptions ? 'chevron-up' : 'chevron-down'} size={scale(20)} color="#64748B" />
                                      <Text style={styles.dropdownText}>
                                        {(() => {
                                          const allSurfaces = selectedSurfaces[toothNumberNumeric] || [];
                                          if (allSurfaces.length === 0) return 'Select';
                                          const surfaceOptions = getAllSurfaces(toothNumberNumeric);
                                          const labels = allSurfaces.map((s) => surfaceOptions.find((opt) => opt.key === s)?.label).filter(Boolean);
                                          return labels.join(', ') || 'Select';
                                        })()}
                                      </Text>
                                    </TouchableOpacity>
                                  </View>
                                </>
                              )}

                              {/* Surface Options Modal */}
                              <Modal visible={showSurfaceOptions} transparent={true} animationType="fade" onRequestClose={() => setShowSurfaceOptions(false)}>
                                <TouchableOpacity style={styles.dropdownModalOverlay} activeOpacity={1} onPress={() => setShowSurfaceOptions(false)}>
                                  <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ width: '85%' }}>
                                    <View style={styles.dropdownModalContent}>
                                      <Text style={styles.dropdownModalTitle}>Select Surfaces (Multiple)</Text>
                                      <ScrollView style={styles.dropdownModalList} showsVerticalScrollIndicator={true}>
                                        {getAllSurfaces(toothNumberNumeric).map((surface) => {
                                          const toothSurfaces = selectedSurfaces[toothNumberNumeric] || [];
                                          const isSelected = toothSurfaces.includes(surface.key);

                                          return (
                                            <TouchableOpacity
                                              key={surface.key}
                                              style={styles.dropdownModalOption}
                                              onPress={() => {
                                                if (!isEditMode) return;

                                                const currentSurfaces = selectedSurfaces[toothNumberNumeric] || [];
                                                const newSurfaces = isSelected ? currentSurfaces.filter((s) => s !== surface.key) : [...currentSurfaces, surface.key];

                                                setSelectedSurfaces((prev) => ({
                                                  ...prev,
                                                  [toothNumberNumeric]: newSurfaces,
                                                }));

                                                setHasModalChanges(true);
                                              }}
                                            >
                                              <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                                {isSelected && <Ionicons name="checkmark" size={scale(14)} color="#FFFFFF" />}
                                              </View>
                                              <Text style={styles.optionText}>{surface.label}</Text>
                                            </TouchableOpacity>
                                          );
                                        })}
                                      </ScrollView>

                                      {/* Done Button */}
                                      <TouchableOpacity
                                        style={{
                                          backgroundColor: '#2563EB',
                                          paddingVertical: scale(12),
                                          borderRadius: scale(8),
                                          marginTop: scale(12),
                                          alignItems: 'center',
                                        }}
                                        onPress={() => setShowSurfaceOptions(false)}
                                      >
                                        <Text style={{ color: '#FFFFFF', fontSize: scale(16), fontWeight: '600' }}>Done</Text>
                                      </TouchableOpacity>
                                    </View>
                                  </TouchableOpacity>
                                </TouchableOpacity>
                              </Modal>
                            </>
                          )}
                        </View>
                        </View>
                        </ScrollView>
                      )}

                      {/* NOTES SECTION */}
                      {showNotesSection && (
                        <View style={[styles.notesSection, { flex: 1 }]}>
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
                              returnKeyType="done"
                              blurOnSubmit={true}
                              onSubmitEditing={Keyboard.dismiss}
                            />
                          </View>

                          {/* Saved Notes - Scrollable */}
                          {toothNotes[toothNumberNumeric]?.length > 0 && (
                            <ScrollView
                              style={{ flex: 1 }}
                              contentContainerStyle={{ paddingBottom: 20 }}
                              showsVerticalScrollIndicator={true}
                            >
                              {toothNotes[toothNumberNumeric]
                                .slice()
                                .reverse()
                                .map((note, index) => (
                                  <View key={index} style={[styles.noteCard, { marginBottom: scale(12) }]}>
                                    <View style={styles.noteHeader}>
                                      <Text style={styles.noteDoctorName}>{note.doctorName || 'Dr. Unknown'}</Text>
                                      <Text style={styles.noteTimestamp}>{note.timestamp}</Text>
                                    </View>
                                    <Text style={styles.noteText}>{note.text}</Text>
                                  </View>
                                ))}
                            </ScrollView>
                          )}
                        </View>
                      )}

                      {/* REFERRAL SECTION */}
                      {showReferralSection && (
                        <>
                          <View style={styles.sectionRow}>
                            <View style={styles.sectionLabelContainer}>
                              <Ionicons name="share-outline" size={scale(18)} color="#1E293B" />
                              <Text style={[styles.sectionTitle, { fontSize: scale(14) }]}>Need Referral</Text>
                            </View>
                            <TouchableOpacity
                              style={[styles.dropdownInput, styles.dropdownInputActive]}
                              onPress={() => setShowReferralOptions(!showReferralOptions)}
                            >
                              <Ionicons name={showReferralOptions ? 'chevron-up' : 'chevron-down'} size={scale(20)} color="#64748B" />
                              <Text style={styles.dropdownText}>
                                {(() => {
                                  const selectedReferrals = selectedReferralFor[toothNumberNumeric] || [];
                                  if (selectedReferrals.length === 0) return 'Select';
                                  const labels = selectedReferrals
                                    .map((key) => referralOptions.find((opt) => opt.key === key)?.label)
                                    .filter(Boolean);
                                  return labels.join(', ') || 'Select';
                                })()}
                              </Text>
                            </TouchableOpacity>
                          </View>

                          {/* Referral Options Modal */}
                          <Modal visible={showReferralOptions} transparent={true} animationType="fade" onRequestClose={() => setShowReferralOptions(false)}>
                            <TouchableOpacity style={styles.dropdownModalOverlay} activeOpacity={1} onPress={() => setShowReferralOptions(false)}>
                              <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ width: '85%' }}>
                                <View style={styles.dropdownModalContent}>
                                  <Text style={styles.dropdownModalTitle}>Select Referral</Text>
                                  <ScrollView style={styles.dropdownModalList} showsVerticalScrollIndicator={true}>
                                    {referralOptions.map((referral) => {
                                      const selectedReferrals = selectedReferralFor[toothNumberNumeric] || [];
                                      const isSelected = selectedReferrals.includes(referral.key);

                                      return (
                                        <TouchableOpacity
                                          key={referral.key}
                                          style={styles.dropdownModalOption}
                                          onPress={() => {
                                            setSelectedReferralFor((prev) => {
                                              const currentReferrals = prev[toothNumberNumeric] || [];
                                              const newReferrals = isSelected
                                                ? currentReferrals.filter((r) => r !== referral.key) // Remove if already selected
                                                : [...currentReferrals, referral.key]; // Add if not selected

                                              return {
                                                ...prev,
                                                [toothNumberNumeric]: newReferrals,
                                              };
                                            });
                                            setHasModalChanges(true);
                                          }}
                                        >
                                          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                            {isSelected && <Ionicons name="checkmark" size={scale(16)} color="#FFFFFF" />}
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

                      {/* RECORDS SECTION */}
                      {showRecordsSection && (
                        <View style={[styles.recordsMainContainer, { flex: 1 }]}>
                          {/* Records Type Buttons */}
                          <View style={styles.recordsTypeButtons}>
                            <TouchableOpacity
                              style={[styles.recordsTypeBtn, recordsType === 'editing' && styles.recordsTypeBtnActive]}
                              onPress={() => setRecordsType('editing')}
                            >
                              <Text style={[styles.recordsTypeBtnText, recordsType === 'editing' && styles.recordsTypeBtnTextActive]}>
                                Editing Records
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.recordsTypeBtn, recordsType === 'planning' && styles.recordsTypeBtnActive]}
                              onPress={() => setRecordsType('planning')}
                            >
                              <Text style={[styles.recordsTypeBtnText, recordsType === 'planning' && styles.recordsTypeBtnTextActive]}>
                                Planning Records
                              </Text>
                            </TouchableOpacity>
                          </View>

                          {/* Records List */}
                          <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{ paddingBottom: 20 }}
                            showsVerticalScrollIndicator={true}
                          >
                            {toothRecords[toothNumberNumeric]?.filter((r) => r.type === recordsType).length > 0 ? (
                              <>
                                {(() => {
                                  const filteredRecords = toothRecords[toothNumberNumeric].filter((r) => r.type === recordsType);
                                  const sortedRecords = [...filteredRecords].sort((a, b) => b.timestampNum - a.timestampNum);

                                  // For Planning Records: Group by doctor to show multiple conditions in one card
                                  if (recordsType === 'planning') {
                                    type RecordGroup = {
                                      doctorName: string;
                                      action: 'diagnosed' | 'canceled';
                                      records: typeof sortedRecords;
                                    };

                                    const groupedRecords: RecordGroup[] = [];

                                    sortedRecords.forEach((record) => {
                                      const lastGroup = groupedRecords[groupedRecords.length - 1];

                                      // Start new group if different doctor or different action
                                      const shouldStartNewGroup =
                                        !lastGroup ||
                                        lastGroup.doctorName !== record.doctorName ||
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

                                    // Render grouped planning records
                                    return groupedRecords.map((group, groupIndex) => {
                                      // Collect all conditions and surfaces from the group
                                      const allConditions: string[] = [];
                                      const allSurfaces: string[] = [];

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
                                      });

                                      const firstRecord = group.records[0];

                                      // For isChange records: show only the modified surfaces from the first record
                                      // (not all surfaces from all records in the group)
                                      const changedSurfaces = firstRecord.isChange && firstRecord.surfaces ? firstRecord.surfaces : [];

                                      return (
                                        <View
                                          key={groupIndex}
                                          style={{
                                            backgroundColor: 'rgba(37, 99, 235, 0.08)',
                                            borderRadius: scale(18),
                                            padding: scale(20),
                                            marginBottom: scale(16),
                                            borderWidth: scale(2),
                                            borderColor: 'rgba(37, 99, 235, 0.35)',
                                          }}
                                        >
                                          {/* Diagnosed/Canceled Badge */}
                                          <View style={{ marginBottom: scale(14) }}>
                                            <View
                                              style={{
                                                paddingHorizontal: scale(10),
                                                paddingVertical: scale(4),
                                                borderRadius: scale(8),
                                                backgroundColor: group.action === 'diagnosed' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(156, 163, 175, 0.15)',
                                                alignSelf: 'flex-start',
                                              }}
                                            >
                                              <Text style={{ fontSize: scale(12), fontWeight: '600', color: group.action === 'diagnosed' ? '#D97706' : '#6B7280' }}>
                                                {group.action === 'diagnosed' ? 'Diagnosed' : 'Canceled'}
                                              </Text>
                                            </View>
                                          </View>

                                          {/* Condition Changed Box (if isChange) */}
                                          {firstRecord.isChange && (
                                            <View style={{
                                              backgroundColor: 'rgba(251, 146, 60, 0.1)',
                                              borderWidth: scale(2),
                                              borderColor: 'rgba(251, 146, 60, 0.3)',
                                              padding: scale(16),
                                              borderRadius: scale(12),
                                              marginBottom: scale(12)
                                            }}>
                                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: scale(10) }}>
                                                <Text style={{ fontSize: scale(18), marginRight: scale(8) }}>🔄</Text>
                                                <Text style={{ fontSize: scale(15), color: '#EA580C', fontWeight: '700', letterSpacing: scale(0.3) }}>
                                                  Condition Changed
                                                </Text>
                                              </View>

                                              <View style={{ gap: scale(6), marginBottom: scale(10) }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                  <Text style={{ fontSize: scale(16), color: '#DC2626', fontWeight: '600', marginRight: scale(6) }}>−</Text>
                                                  <Text style={{ fontSize: scale(14), color: '#DC2626', fontWeight: '500', textDecorationLine: 'line-through' }}>
                                                    {firstRecord.previousCondition}
                                                  </Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                  <Text style={{ fontSize: scale(16), color: '#059669', fontWeight: '600', marginRight: scale(6) }}>+</Text>
                                                  <Text style={{ fontSize: scale(14), color: '#059669', fontWeight: '600' }}>
                                                    {firstRecord.condition}
                                                  </Text>
                                                </View>
                                              </View>

                                              {changedSurfaces.length > 0 && (
                                                <View style={{ flexDirection: 'row', marginBottom: scale(8) }}>
                                                  <Text style={{ fontSize: scale(13), color: '#EA580C', fontWeight: '600', minWidth: scale(70) }}>
                                                    Surfaces:
                                                  </Text>
                                                  <Text style={{ fontSize: scale(13), color: '#9A3412', fontWeight: '500', flex: 1 }}>
                                                    {changedSurfaces.join(', ')}
                                                  </Text>
                                                </View>
                                              )}

                                              <View style={{
                                                borderTopWidth: scale(1),
                                                borderTopColor: 'rgba(251, 146, 60, 0.2)',
                                                paddingTop: scale(8),
                                                marginTop: scale(4)
                                              }}>
                                                <Text style={{ fontSize: scale(13), color: '#9A3412', fontWeight: '600' }}>
                                                  Modified by: Dr. {group.doctorName}
                                                </Text>
                                              </View>
                                            </View>
                                          )}

                                          {/* Planning Details (only if NOT isChange) */}
                                          <View style={{ gap: scale(8), marginBottom: scale(12) }}>
                                            {!firstRecord.isChange && allConditions.length > 0 && (() => {
                                              // حالة خاصة: Root Canal Treated
                                              // Root Canal Treated يُحفظ كـ condition="Tooth Status", surfaces=['Root Canal Treated']
                                              const hasRootCanalTreated = allSurfaces.some(s => s === 'Root Canal Treated');

                                              if (hasRootCanalTreated) {
                                                // فصل Root Canal Treated عن باقي الأسطح
                                                const otherSurfaces = allSurfaces.filter(s => s !== 'Root Canal Treated');

                                                return (
                                                  <>
                                                    {/* عرض Root Canal Treated كـ Condition رئيسي */}
                                                    <View style={{ flexDirection: 'row' }}>
                                                      <Text style={{ fontSize: scale(14), color: '#2563EB', fontWeight: '600', minWidth: scale(90) }}>
                                                        Condition:
                                                      </Text>
                                                      <Text style={{ fontSize: scale(14), color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                                        Root Canal Treated
                                                      </Text>
                                                    </View>

                                                    {/* عرض باقي الأسطح تحت Surfaces */}
                                                    {otherSurfaces.length > 0 && (
                                                      <View style={{ flexDirection: 'row' }}>
                                                        <Text style={{ fontSize: scale(14), color: '#2563EB', fontWeight: '600', minWidth: scale(90) }}>
                                                          Surfaces:
                                                        </Text>
                                                        <Text style={{ fontSize: scale(14), color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                                          {otherSurfaces.join(', ')}
                                                        </Text>
                                                      </View>
                                                    )}
                                                  </>
                                                );
                                              } else {
                                                // الحالة العادية: عرض كل الـ conditions بدون معالجة خاصة
                                                return (
                                                  <View style={{ flexDirection: 'row' }}>
                                                    <Text style={{ fontSize: scale(14), color: '#2563EB', fontWeight: '600', minWidth: scale(90) }}>
                                                      Condition:
                                                    </Text>
                                                    <Text style={{ fontSize: scale(14), color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                                      {allConditions.join(', ')}
                                                    </Text>
                                                  </View>
                                                );
                                              }
                                            })()}

                                            {!firstRecord.isChange && allSurfaces.length > 0 && !allConditions.includes('Extraction') && !allSurfaces.some(s => s === 'Root Canal Treated') && (
                                              <View style={{ flexDirection: 'row' }}>
                                                <Text style={{ fontSize: scale(14), color: '#2563EB', fontWeight: '600', minWidth: scale(90) }}>
                                                  Surfaces:
                                                </Text>
                                                <Text style={{ fontSize: scale(14), color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                                  {allSurfaces.join(', ')}
                                                </Text>
                                              </View>
                                            )}
                                          </View>

                                          {/* Footer Info */}
                                          <View
                                            style={{
                                              borderTopWidth: scale(1),
                                              borderTopColor: 'rgba(37, 99, 235, 0.2)',
                                              paddingTop: scale(12),
                                              gap: scale(6),
                                            }}
                                          >
                                            <Text style={{ fontSize: scale(13), color: '#6B7280', fontWeight: '500' }}>{firstRecord.timestamp}</Text>
                                            <Text style={{ fontSize: scale(13), color: '#2563EB', fontWeight: '600' }}>Dr. {group.doctorName}</Text>
                                          </View>
                                        </View>
                                      );
                                    });
                                  }

                                  // For Editing Records: Show individually (already has colored badges)
                                  return sortedRecords.map((record, index) => (
                                    <View
                                      key={index}
                                      style={{
                                        backgroundColor: 'rgba(37, 99, 235, 0.08)',
                                        borderRadius: scale(18),
                                        padding: scale(20),
                                        marginBottom: scale(16),
                                        borderWidth: scale(2),
                                        borderColor: 'rgba(37, 99, 235, 0.35)',
                                      }}
                                    >
                                      {/* Treatment Details */}
                                      <View style={{ gap: scale(8), marginBottom: scale(12) }}>
                                        <View style={{ flexDirection: 'row' }}>
                                          <Text style={{ fontSize: scale(14), color: '#2563EB', fontWeight: '600', minWidth: scale(90) }}>Treatment:</Text>
                                          {record.treatment === 'Extraction' || record.treatment === 'Filling' || record.treatment === 'Pulpectomy' ? (
                                            <View style={{
                                              backgroundColor:
                                                record.treatment === 'Extraction'
                                                  ? 'rgba(156, 163, 175, 0.15)'
                                                  : record.treatment === 'Filling'
                                                    ? 'rgba(16, 185, 129, 0.15)'
                                                    : 'rgba(139, 92, 246, 0.15)',
                                              paddingHorizontal: scale(10),
                                              paddingVertical: scale(4),
                                              borderRadius: scale(8),
                                              alignSelf: 'flex-start',
                                            }}>
                                              <Text style={{
                                                fontSize: scale(14),
                                                color: record.treatment === 'Extraction'
                                                  ? '#4B5563'
                                                  : record.treatment === 'Filling'
                                                    ? '#047857'
                                                    : '#7C3AED',
                                                fontWeight: '600'
                                              }}>
                                                {record.treatment}
                                              </Text>
                                            </View>
                                          ) : (
                                            <Text style={{ fontSize: scale(14), color: '#1F2937', fontWeight: '500', flex: 1 }}>{record.treatment}</Text>
                                          )}
                                        </View>

                                        {record.details && (
                                          <View style={{ flexDirection: 'row' }}>
                                            <Text style={{ fontSize: scale(14), color: '#2563EB', fontWeight: '600', minWidth: scale(90) }}>Details:</Text>
                                            <Text style={{ fontSize: scale(14), color: '#1F2937', fontWeight: '500', flex: 1 }}>{record.details}</Text>
                                          </View>
                                        )}

                                        {/* Hide Surfaces row if Extraction */}
                                        {record.treatment !== 'Extraction' && (
                                          <View style={{ flexDirection: 'row' }}>
                                            <Text style={{ fontSize: scale(14), color: '#2563EB', fontWeight: '600', minWidth: scale(90) }}>Surfaces:</Text>
                                            <Text style={{ fontSize: scale(14), color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                              {record.surfaces && record.surfaces.length > 0 ? record.surfaces.join(', ') : '-'}
                                            </Text>
                                          </View>
                                        )}
                                      </View>

                                      {/* Footer Info */}
                                      <View
                                        style={{
                                          borderTopWidth: scale(1),
                                          borderTopColor: 'rgba(37, 99, 235, 0.2)',
                                          paddingTop: scale(12),
                                          gap: scale(6),
                                        }}
                                      >
                                        <Text style={{ fontSize: scale(13), color: '#6B7280', fontWeight: '500' }}>{record.timestamp}</Text>
                                        <Text style={{ fontSize: scale(13), color: '#2563EB', fontWeight: '600' }}>Dr. {record.doctorName}</Text>
                                      </View>
                                    </View>
                                  ));
                                })()}
                              </>
                            ) : (
                              <View style={styles.noRecordsContainer}>
                                <Ionicons name="document-text-outline" size={scale(48)} color="rgba(100, 116, 139, 0.3)" />
                                <Text style={{ fontSize: scale(14), color: '#64748B', fontWeight: '500' }}>
                                  {recordsType === 'editing' ? 'No editing records yet' : 'No planning records yet'}
                                </Text>
                              </View>
                            )}
                          </ScrollView>
                        </View>
                      )}
                  </View>

                  {/* ════════════════════════════════════════════ */}
                  {/* SUBMIT BUTTON */}
                  {/* ════════════════════════════════════════════ */}
                  <View style={styles.submitButtonContainer}>
                    <TouchableOpacity
                      style={[styles.submitButton, hasModalChanges && styles.submitButtonActive]}
                      disabled={!hasModalChanges}
                      onPress={handleSubmitChanges}
                    >
                      <Ionicons name="checkmark-circle-outline" size={scale(22)} color={hasModalChanges ? '#FFFFFF' : '#64748B'} />
                      <Text style={[styles.submitButtonText, hasModalChanges && { color: '#FFFFFF' }]}>Submit</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </BlurView>
            </View>
          </View>
        </Modal>
  );
}

// ===============================================================
// STYLES
// ===============================================================

const styles = scaledStyleSheet({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  newModalContainer: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    overflow: 'hidden',
    elevation: 8,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#3B82F6',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.15,
          shadowRadius: 24,
        }
      : {}),
  },
  newModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  toothNumberBox: {
    backgroundColor: 'rgba(96, 165, 250, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    elevation: 2,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#3B82F6',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        }
      : {}),
  },
  modalToothNumberText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E3A8A',
  },
  modalToothNameText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  editButton: {
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(148, 163, 184, 0.5)',
  },
  editButtonActive: {
    backgroundColor: '#60A5FA',
    borderColor: '#3B82F6',
    borderWidth: 2,
    elevation: 3,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#3B82F6',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
        }
      : {}),
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  closeButton: {
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(148, 163, 184, 0.5)',
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: 16,
  },
  tabButtons: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
    borderRadius: 16,
    marginHorizontal: 4,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.6)',
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    gap: 6,
    borderWidth: 2,
    borderColor: 'rgba(203, 213, 225, 0.6)',
    elevation: 1,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
        }
      : {}),
  },
  tabBtnActive: {
    backgroundColor: '#3B82F6',
    borderWidth: 2,
    borderColor: '#2563EB',
    elevation: 4,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#3B82F6',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
        }
      : {}),
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  tabBtnTextActive: {
    color: '#FFFFFF',
  },
  modalContent: {
    flexGrow: 0,
    flexShrink: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  mainSectionsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.25)',
    elevation: 3,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#3B82F6',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        }
      : {}),
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  sectionLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginVertical: 8,
  },
  dropdownInput: {
    width: 170,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: 'rgba(203, 213, 225, 0.5)',
  },
  dropdownInputActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    elevation: 2,
  },
  dropdownText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'center',
  },
  dropdownModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 5,
  },
  dropdownModalContent: {
    backgroundColor: 'rgba(240, 249, 255, 0.98)',
    borderRadius: 24,
    padding: 22,
    width: '100%',
    maxHeight: '92%',
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    elevation: 5,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#3B82F6',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 12,
        }
      : {}),
  },
  dropdownModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E3A8A',
    marginBottom: 18,
    textAlign: 'center',
  },
  dropdownModalList: {
    maxHeight: 800,
  },
  dropdownModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(203, 213, 225, 0.4)',
    marginBottom: 12,
    elevation: 1,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
        }
      : {}),
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#94A3B8',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  radioButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#94A3B8',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  radioButtonSelected: {
    borderColor: '#60A5FA',
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#60A5FA',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  notesSection: {
    gap: 14,
  },
  newNoteContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.35)',
  },
  noteInput: {
    fontSize: 14,
    color: '#1E293B',
    minHeight: 70,
    textAlignVertical: 'top',
    fontWeight: '500',
  },
  noteCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    borderWidth: 1.5,
    borderColor: 'rgba(203, 213, 225, 0.5)',
    elevation: 2,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#3B82F6',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
        }
      : {}),
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  noteDoctorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  noteTimestamp: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  noteText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  recordsMainContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.25)',
    elevation: 3,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#3B82F6',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        }
      : {}),
    padding: 16,
    gap: 12,
  },
  recordsTypeButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
    justifyContent: 'center',
  },
  recordsTypeBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(203, 213, 225, 0.6)',
  },
  recordsTypeBtnActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#2563EB',
    borderWidth: 2,
    elevation: 3,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#3B82F6',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
        }
      : {}),
  },
  recordsTypeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.2,
  },
  recordsTypeBtnTextActive: {
    color: '#FFFFFF',
  },
  noRecordsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  submitButtonContainer: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: 'rgba(248, 250, 252, 0.7)',
    borderTopWidth: 2,
    borderTopColor: 'rgba(203, 213, 225, 0.6)',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(226, 232, 240, 0.7)',
    gap: 10,
    borderWidth: 2,
    borderColor: 'rgba(148, 163, 184, 0.5)',
  },
  submitButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#059669',
    borderWidth: 2,
    elevation: 6,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#10B981',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
        }
      : {}),
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
});
