import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  StatusBar,
  Animated,
  ScrollView,
  Modal,
  Dimensions,
  TextInput,
  Alert,
  LogBox,
  Platform,
} from 'react-native';
import { styles, SCREEN_WIDTH, SCREEN_HEIGHT } from './screens/DentalChart/styles';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line, Rect, Defs, ClipPath, G, Polygon } from 'react-native-svg';
import { useAuth } from './AuthContext';
import { supabase } from './lib/supabase';
import {
  getCompleteToothData,
  saveToothSurfaceCondition,
  deleteToothSurfaceCondition,
  createEditingRecord,
  createPlanningRecord,
  createPlanningBatch,
  getEditingRecords,
  getPlanningRecords,
  createToothNote,
  createReferral,
  getAllToothNotes,
  getReferrals,
  createScalingRecord,
  getScalingRecords,
  deleteScalingRecord,
} from './lib/database';
import type { ToothNumber, ToothSurface, ToothCondition } from './types';

// Import constants and helpers from extracted files
import {
  CONDITION_COLORS,
  CONDITION_NAMES,
  REFERRAL_HEADER_HEIGHT,
  REFERRAL_CONTENT_MIN,
  REFERRAL_CONTENT_MAX,
  CONTAINER_SPACING,
  TREATMENT_PLANNING_SPACING,
  treatmentOptions,
  detailsOptions,
  referralOptions,
  conditionsList,
  toothStatusList,
} from './screens/DentalChart/constants';
import {
  ToothSurfaceConditions,
  getSurfaceName,
  getArabicSurfaceName,
  getToothPosition,
  getQuadrantToothNumber,
  getToothDisplayName,
  palmerToNumber,
  getToothPositionNumber,
  getToothQuadrant,
  getToothName,
  getQuadrant,
  getConditionName,
  getReferralName,
  getToothAngle,
  getToothSVGCoordinates,
  getAllSurfaces,
  getSurfaceMap,
  getSurfaceNameMap,
} from './screens/DentalChart/dentalHelpers';
import {
  ToothWithSections,
  ToothWithSectionsSquare,
  ToothWithSectionsSquareTiny,
  ToothWithSectionsSquareMedium,
  ToothWithSectionsCanineSmall,
  ToothWithSectionsIncisorSmall,
  ToothWithSectionsPremolar,
  ToothWithSectionsCanine,
  ToothWithSectionsIncisor,
  ToothWithSectionsIncisorNoCenter,
  ToothWithSectionsCanineNoCenter,
  ToothWithSectionsProps,
} from './screens/DentalChart/ToothShapes';

// Ø¥Ø®ÙØ§Ø¡ Ø§Ù„ØªØ­Ø°ÙŠØ±Ø§Øª ØºÙŠØ± Ø§Ù„Ù…Ù‡Ù…Ø©
LogBox.ignoreLogs([
  "Style property 'height' is not supported by native animated module",
  "Style property 'width' is not supported by native animated module",
]);

interface DentalChartScreenProps {
  onBack: () => void;
  permanentPatientId?: string; // ID Ø§Ù„Ù…Ø±ÙŠØ¶ Ø§Ù„Ø¯Ø§Ø¦Ù… Ù…Ù† permanent_patients
}

// Component Ù„Ø¹Ø±Ø¶ Ø±Ù‚Ù… Ø§Ù„Ø³Ù† Ù…Ø¹ Ø§Ù„Ø­Ø¯ÙˆØ¯ (uses imported helper functions)
const ToothNumberBadge: React.FC<{ toothNumber: number }> = ({ toothNumber }) => {
  const quadrant = getToothQuadrant(toothNumber);
  const displayNumber = getToothPositionNumber(toothNumber);

  const borderStyles = {
    'UL': { borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderLeftColor: '#2563EB', borderBottomColor: '#2563EB' },
    'UR': { borderRightWidth: 2.5, borderBottomWidth: 2.5, borderRightColor: '#2563EB', borderBottomColor: '#2563EB' },
    'LL': { borderLeftWidth: 2.5, borderTopWidth: 2.5, borderLeftColor: '#2563EB', borderTopColor: '#2563EB' },
    'LR': { borderRightWidth: 2.5, borderTopWidth: 2.5, borderRightColor: '#2563EB', borderTopColor: '#2563EB' },
  };

  return (
    <View style={[
      {
        backgroundColor: 'rgba(37, 99, 235, 0.12)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        minWidth: 40,
        alignItems: 'center',
        justifyContent: 'center',
      },
      borderStyles[quadrant]
    ]}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E40AF', letterSpacing: 0.3 }}>
        {displayNumber}
      </Text>
    </View>
  );
};

// Ù…ÙƒÙˆÙ† Ù‚Ø§Ø¦Ù…Ø© Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ø­Ø§Ù„Ø©
interface ConditionMenuProps {
  visible: boolean;
  onSelect: (condition: ToothCondition) => void;
  onClose: () => void;
  selectedSurface: keyof ToothSurfaceConditions | null;
  selectedTooth: number | null;
}

// ConditionMenu component interface
interface ConditionMenuProps {
  visible: boolean;
  onSelect: (condition: ToothCondition) => void;
  onClose: () => void;
  selectedSurface: keyof ToothSurfaceConditions | null;
  selectedTooth: number | null;
}

// ConditionMenu component - uses imported conditionsList and toothStatusList from constants
const ConditionMenu: React.FC<ConditionMenuProps> = ({ visible, onSelect, onClose, selectedSurface, selectedTooth }) => {
  const [activeTab, setActiveTab] = useState<'condition' | 'toothStatus'>('condition');

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.conditionMenuOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableWithoutFeedback>
          <View style={{ width: '85%', borderRadius: 24, overflow: 'hidden' }}>
            <BlurView intensity={90} tint="light" style={styles.conditionMenuContainer}>
              <View style={{ backgroundColor: 'rgba(240, 249, 255, 0.95)' }}>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18 }}>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={styles.conditionMenuTitle}>{getSurfaceName(selectedSurface, selectedTooth || undefined)}</Text>
                    <Text style={styles.conditionMenuSubtitle}>{getToothPosition(selectedTooth || 0)}</Text>
                  </View>
                  <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
                    <Ionicons name="close" size={24} color="#1E3A8A" />
                  </TouchableOpacity>
                </View>

                <View style={styles.conditionMenuDivider} />

                {/* Tab Buttons */}
                <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginTop: 12, marginBottom: 12 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: activeTab === 'condition' ? '#3B82F6' : 'rgba(255, 255, 255, 0.9)',
                      paddingVertical: 12,
                      paddingHorizontal: 18,
                      borderRadius: 12,
                      alignItems: 'center',
                      borderWidth: activeTab === 'condition' ? 0 : 1.5,
                      borderColor: 'rgba(203, 213, 225, 0.5)',
                      shadowColor: activeTab === 'condition' ? '#3B82F6' : '#000',
                      shadowOffset: {
                        width: 0,
                        height: activeTab === 'condition' ? 4 : 2,
                      },
                      shadowOpacity: activeTab === 'condition' ? 0.3 : 0.08,
                      shadowRadius: activeTab === 'condition' ? 8 : 4,
                      elevation: activeTab === 'condition' ? 6 : 2,
                    }}
                    onPress={() => setActiveTab('condition')}
                  >
                    <Text style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: activeTab === 'condition' ? '#FFFFFF' : '#475569',
                      letterSpacing: 0.3,
                    }}>Condition</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: activeTab === 'toothStatus' ? '#3B82F6' : 'rgba(255, 255, 255, 0.9)',
                      paddingVertical: 12,
                      paddingHorizontal: 18,
                      borderRadius: 12,
                      alignItems: 'center',
                      borderWidth: activeTab === 'toothStatus' ? 0 : 1.5,
                      borderColor: 'rgba(203, 213, 225, 0.5)',
                      shadowColor: activeTab === 'toothStatus' ? '#3B82F6' : '#000',
                      shadowOffset: {
                        width: 0,
                        height: activeTab === 'toothStatus' ? 4 : 2,
                      },
                      shadowOpacity: activeTab === 'toothStatus' ? 0.3 : 0.08,
                      shadowRadius: activeTab === 'toothStatus' ? 8 : 4,
                      elevation: activeTab === 'toothStatus' ? 6 : 2,
                    }}
                    onPress={() => setActiveTab('toothStatus')}
                  >
                    <Text style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: activeTab === 'toothStatus' ? '#FFFFFF' : '#475569',
                      letterSpacing: 0.3,
                    }}>Tooth Status</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.conditionMenuScroll}>
                  {activeTab === 'condition' ? (
                    <>
                      {conditionsList.map((condition) => (
                        <TouchableOpacity
                          key={condition.key}
                          style={styles.conditionMenuItem}
                          onPress={() => onSelect(condition.key)}
                        >
                          <View
                            style={[
                              styles.conditionColorBox,
                              { backgroundColor: condition.color }
                            ]}
                          />
                          <Text style={styles.conditionMenuItemText}>{condition.name}</Text>
                        </TouchableOpacity>
                      ))}

                      {/* Ø®ÙŠØ§Ø± Ø¥Ø²Ø§Ù„Ø© Ø§Ù„Ø­Ø§Ù„Ø© */}
                      <TouchableOpacity
                        style={styles.conditionMenuItem}
                        onPress={() => onSelect(null)}
                      >
                        <Ionicons name="close-circle" size={24} color="#FF5252" />
                        <Text style={[styles.conditionMenuItemText, { color: '#FF5252', marginLeft: 12 }]}>Clear Condition</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      {toothStatusList.map((status) => (
                        <TouchableOpacity
                          key={status.key}
                          style={styles.conditionMenuItem}
                          onPress={() => onSelect(status.key)}
                        >
                          <View
                            style={[
                              styles.conditionColorBox,
                              {
                                backgroundColor: status.color,
                                borderWidth: status.key === 'treated' ? 2 : 0,
                                borderColor: status.key === 'treated' ? '#800000' : 'transparent'
                              }
                            ]}
                          />
                          <Text style={styles.conditionMenuItemText}>{status.name}</Text>
                        </TouchableOpacity>
                      ))}

                      {/* Ø®ÙŠØ§Ø± Ø¥Ø²Ø§Ù„Ø© Ø§Ù„Ø­Ø§Ù„Ø© */}
                      <TouchableOpacity
                        style={styles.conditionMenuItem}
                        onPress={() => onSelect('CLEAR_TOOTH_STATUS' as any)}
                      >
                        <Ionicons name="close-circle" size={24} color="#FF5252" />
                        <Text style={[styles.conditionMenuItemText, { color: '#FF5252', marginLeft: 12 }]}>Clear Condition</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </ScrollView>
              </View>
            </BlurView>
          </View>
        </TouchableWithoutFeedback>
      </TouchableOpacity>
    </Modal>
  );
};

// treatmentOptions, detailsOptions, getAllSurfaces, getSurfaceMap, getSurfaceNameMap
// are now imported from ./screens/DentalChart/constants and ./screens/DentalChart/dentalHelpers

export default function DentalChartScreen({
  onBack,
  permanentPatientId,
}: DentalChartScreenProps) {
  // Get user context for doctor name
  const { user } = useAuth();

  // Animated Blobs - Same as PatientProfileScreen
  const blob1Anim = useState(new Animated.Value(0))[0];
  const blob2Anim = useState(new Animated.Value(0))[0];
  const blob3Anim = useState(new Animated.Value(0))[0];
  const blob4Anim = useState(new Animated.Value(0))[0];
  const blob5Anim = useState(new Animated.Value(0))[0];
  const blob6Anim = useState(new Animated.Value(0))[0];

  // State Management Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„Ø£Ø³Ù†Ø§Ù†
  const [toothConditions, setToothConditions] = useState<Record<number | string, ToothSurfaceConditions>>({});
  const [toothBorderColors, setToothBorderColors] = useState<Record<number | string, ToothCondition>>({});
  const [selectedTooth, setSelectedTooth] = useState<number | string | null>(null);
  const [selectedSurface, setSelectedSurface] = useState<keyof ToothSurfaceConditions | null>(null);
  const [showConditionMenu, setShowConditionMenu] = useState(false);
  const [isClosing, setIsClosing] = useState(false); // Ù„ØªØªØ¨Ø¹ Ø­Ø§Ù„Ø© Ø§Ù„Ø¥ØºÙ„Ø§Ù‚
  const [isEditModeActive, setIsEditModeActive] = useState(false); // Ù„ØªØªØ¨Ø¹ Ø­Ø§Ù„Ø© Edit Mode
  const [showToothDetailsModal, setShowToothDetailsModal] = useState(false); // Ù„Ø¹Ø±Ø¶ ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ø³Ù† ÙÙŠ Edit Mode
  const [isViewModeActive, setIsViewModeActive] = useState(false); // Ù„ØªØªØ¨Ø¹ Ø­Ø§Ù„Ø© View Mode
  const [selectedToothForDetails, setSelectedToothForDetails] = useState<number | null>(null); // Ø§Ù„Ø³Ù† Ø§Ù„Ù…Ø­Ø¯Ø¯ Ù„Ù„ØªÙØ§ØµÙŠÙ„
  const [showSurfaceOptions, setShowSurfaceOptions] = useState(false); // Ù„Ø¹Ø±Ø¶ Ø®ÙŠØ§Ø±Ø§Øª Ø§Ù„Ø£Ø³Ø·Ø­
  const [showTreatmentOptions, setShowTreatmentOptions] = useState(false); // Ù„Ø¹Ø±Ø¶ Ø®ÙŠØ§Ø±Ø§Øª Ø§Ù„Ø¹Ù„Ø§Ø¬
  const [showDetailsOptions, setShowDetailsOptions] = useState(false); // Ù„Ø¹Ø±Ø¶ Ø®ÙŠØ§Ø±Ø§Øª Ø§Ù„ØªÙØ§ØµÙŠÙ„
  const [showReferralOptions, setShowReferralOptions] = useState(false); // Ù„Ø¹Ø±Ø¶ Ø®ÙŠØ§Ø±Ø§Øª Ø§Ù„ØªØ­ÙˆÙŠÙ„
  const [hasModalChanges, setHasModalChanges] = useState(false); // Ù„ØªØªØ¨Ø¹ Ø§Ù„ØªØºÙŠÙŠØ±Ø§Øª ÙÙŠ Ø§Ù„Ù…ÙˆØ¯Ø§Ù„
  const [isEditMode, setIsEditMode] = useState(false); // ÙˆØ¶Ø¹ Ø§Ù„ØªØ¹Ø¯ÙŠÙ„
  const [showNotesSection, setShowNotesSection] = useState(false); // Ù„Ø¹Ø±Ø¶ Ù‚Ø³Ù… Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª
  const [showDetailsSection, setShowDetailsSection] = useState(true); // Ù„Ø¹Ø±Ø¶ Ù‚Ø³Ù… Ø§Ù„Ø¨Ù†ÙˆØ¯ (Surfaces, Treatment, Details)
  const [showRecordsSection, setShowRecordsSection] = useState(false); // Ù„Ø¹Ø±Ø¶ Ù‚Ø³Ù… Ø§Ù„Ø³Ø¬Ù„Ø§Øª
  const [showReferralSection, setShowReferralSection] = useState(false); // Ù„Ø¹Ø±Ø¶ Ù‚Ø³Ù… Ø§Ù„ØªØ­ÙˆÙŠÙ„Ø§Øª
  const [recordsType, setRecordsType] = useState<'editing' | 'planning'>('editing'); // Ù†ÙˆØ¹ Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ù…Ø¹Ø±ÙˆØ¶Ø©
  const [currentNote, setCurrentNote] = useState(''); // Ù„Ù„Ù…Ù„Ø§Ø­Ø¸Ø© Ø§Ù„Ø­Ø§Ù„ÙŠØ©
  const [unreadNotes, setUnreadNotes] = useState<Record<number | string, number>>({}); // Ø¹Ø¯Ø¯ Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª ØºÙŠØ± Ø§Ù„Ù…Ù‚Ø±ÙˆØ¡Ø© Ù„ÙƒÙ„ Ø³Ù†

  // Referral state
  const [referrals, setReferrals] = useState({
    endodontics: false,
    oralSurgery: false,
    orthodontics: false,
    periodontics: false,
    prosthodontics: false,
    oralMedicine: false,
  });
  const [referralStatus, setReferralStatus] = useState({
    endodontics: 'not_given', // 'given' Ø£Ùˆ 'not_given'
    oralSurgery: 'not_given',
    orthodontics: 'not_given',
    periodontics: 'not_given',
    prosthodontics: 'not_given',
    oralMedicine: 'not_given',
  });
  const [selectedReferral, setSelectedReferral] = useState<string | null>(null); // Ù„Ù„ØªÙ…ÙŠÙŠØ² Ø§Ù„Ø¨ØµØ±ÙŠ
  const [isReferralExpanded, setIsReferralExpanded] = useState(false); // Ù„ØªØªØ¨Ø¹ Ø­Ø§Ù„Ø© ÙØªØ­/Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„Ø£Ù‚Ø³Ø§Ù… (Ù…ØºÙ„Ù‚Ø© Ø§ÙØªØ±Ø§Ø¶ÙŠØ§Ù‹)
  const [showDepartmentModal, setShowDepartmentModal] = useState(false); // Ù„Ù„ØªØ­ÙƒÙ… ÙÙŠ ÙØªØ­/Ø¥ØºÙ„Ø§Ù‚ Modal Ø§Ù„Ø£Ù‚Ø³Ø§Ù…
  const [departmentModalMode, setDepartmentModalMode] = useState<'new' | 'edit'>('new'); // ÙˆØ¶Ø¹ Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„: Ø¬Ø¯ÙŠØ¯ Ø£Ùˆ ØªØ¹Ø¯ÙŠÙ„
  const [savedReferralsState, setSavedReferralsState] = useState<any>(null); // Ù„Ø­ÙØ¸ Ø­Ø§Ù„Ø© referrals Ù…Ø¤Ù‚ØªØ§Ù‹
  const [savedSelectedReferralFor, setSavedSelectedReferralFor] = useState<any>(null); // Ù„Ø­ÙØ¸ Ø­Ø§Ù„Ø© selectedReferralFor Ù…Ø¤Ù‚ØªØ§Ù‹
  const [expandedDepartment, setExpandedDepartment] = useState<string | null>(null); // Ù„Ù„ØªØ­ÙƒÙ… ÙÙŠ Ø¹Ø±Ø¶ Ø§Ù„Ø£Ø³Ù†Ø§Ù† ØªØ­Øª Ø§Ù„Ù‚Ø³Ù…
  // Temporary states for "new" mode - not saved to database until Save is clicked
  const [tempReferrals, setTempReferrals] = useState<typeof referrals>({
    endodontics: false,
    oralSurgery: false,
    orthodontics: false,
    periodontics: false,
    prosthodontics: false,
    oralMedicine: false,
  });
  const [tempSelectedReferralFor, setTempSelectedReferralFor] = useState<Record<number, string[]>>({});
  const [referralTab, setReferralTab] = useState<'department' | 'records'>('department'); // Ù„Ù„ØªØ¨Ø¯ÙŠÙ„ Ø¨ÙŠÙ† Department Ùˆ Referral Records
  const [referralRecords, setReferralRecords] = useState<Array<{
    departmentKey: string;
    departmentName: string;
    teeth: number[];
    timestamp: string;
    doctorName: string;
    timestampNum: number
  }>>([]); // Ø³Ø¬Ù„Ø§Øª Ø§Ù„ØªØ­ÙˆÙŠÙ„Ø§Øª

  // Oral Hygiene (Scaling) state
  const [isOralHygieneExpanded, setIsOralHygieneExpanded] = useState(false); // Ù„ØªØªØ¨Ø¹ Ø­Ø§Ù„Ø© ØªÙˆØ³Ø¹ Ø­Ø§ÙˆÙŠØ© Oral Hygiene
  const oralHygieneExpandAnim = useRef(new Animated.Value(0)).current; // Ø£Ù†ÙŠÙ…ÙŠØ´Ù† Ø§Ù„ØªÙˆØ³Ø¹
  const [scalingRecords, setScalingRecords] = useState<Array<{ id: string; timestamp: string; doctorName: string; timestampNum: number }>>([]);

  // Total Treatment Record state
  const [isTreatmentRecordExpanded, setIsTreatmentRecordExpanded] = useState(false); // Ù„ØªØªØ¨Ø¹ Ø­Ø§Ù„Ø© ØªÙˆØ³Ø¹ Total Treatment Record
  const treatmentRecordExpandAnim = useRef(new Animated.Value(0)).current; // Ø£Ù†ÙŠÙ…ÙŠØ´Ù† Ø§Ù„ØªÙˆØ³Ø¹

  // Total Planning Record state
  const [isPlanningRecordExpanded, setIsPlanningRecordExpanded] = useState(false); // Ù„ØªØªØ¨Ø¹ Ø­Ø§Ù„Ø© ØªÙˆØ³Ø¹ Total Planning Record
  const planningRecordExpandAnim = useRef(new Animated.Value(0)).current; // Ø£Ù†ÙŠÙ…ÙŠØ´Ù† Ø§Ù„ØªÙˆØ³Ø¹

  // Ø­ÙØ¸ Ø§Ù„Ù‚ÙŠÙ… Ø§Ù„Ø£ØµÙ„ÙŠØ© Ù‚Ø¨Ù„ Ø§Ù„ØªØ¹Ø¯ÙŠÙ„
  const [originalValues, setOriginalValues] = useState<{
    treatment?: string;
    details?: string;
    surfaces?: string[];
  }>({});

  // Ref Ù„ØªØ¹Ø·ÙŠÙ„ Planning Record Ø¹Ù†Ø¯ Ø§Ù„Ø¹Ù…Ù„ Ù…Ù† Tooth Details Modal
  const skipPlanningRecordRef = useRef(false);

  // Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø£Ø³Ù†Ø§Ù† Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø©
  const [selectedTreatments, setSelectedTreatments] = useState<Record<number | string, string>>({});
  const [selectedDetails, setSelectedDetails] = useState<Record<number | string, string>>({});
  const [selectedReferralFor, setSelectedReferralFor] = useState<Record<number | string, string[]>>({});  // Changed to array for multiple referrals
  const [selectedSurfaces, setSelectedSurfaces] = useState<Record<number | string, string[]>>({});
  const [openReferralMenu, setOpenReferralMenu] = useState<string | null>(null); // Track which referral card menu is open
  const [toothNotes, setToothNotes] = useState<Record<number | string, Array<{ text: string; timestamp: string; doctorName: string }>>>({});
  // Types for tooth records
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
    isChange?: boolean; // Ù‡Ù„ Ù‡Ø°Ø§ ØªØºÙŠÙŠØ± Ù„Ø­Ø§Ù„Ø© Ù…ÙˆØ¬ÙˆØ¯Ø©ØŸ
    previousCondition?: string; // Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ø³Ø§Ø¨Ù‚Ø©
  };

  type ToothRecord = EditingRecord | PlanningRecord;

  const [toothRecords, setToothRecords] = useState<Record<number | string, ToothRecord[]>>({});

  // Ù‚Ø§Ø¦Ù…Ø© Ø¹Ø§Ù…Ø© Ù„ÙƒÙ„ planning records Ø¨ØªØ±ØªÙŠØ¨ Ø§Ù„Ø¥Ø¶Ø§ÙØ© Ø§Ù„ÙØ¹Ù„ÙŠ
  const [allPlanningRecordsGlobal, setAllPlanningRecordsGlobal] = useState<Array<{
    toothNumber: number;
    action: 'diagnosed' | 'canceled';
    condition: string;
    surfaces: string[];
    timestamp: string;
    timestampNum: number;
    doctorName: string;
    isChange?: boolean;
    previousCondition?: string;
  }>>([]);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Pending Planning Records State (Before Submit)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const [pendingPlanningRecords, setPendingPlanningRecords] = useState<Array<{
    toothNumber: number;
    action: 'diagnosed' | 'canceled';
    condition: string;
    surfaces: string[];
    timestamp: string;
    timestampNum: number;
    doctorName: string;
    isChange?: boolean;
    previousCondition?: string;
  }>>([]);

  // Treatment and Details Options
  const treatmentOptions = [
    { key: 'filling', label: 'Filling' },
    { key: 'pulpectomy', label: 'Pulpectomy' },
    { key: 'extraction', label: 'Extraction' },
  ];

  const detailsOptions = [
    { key: 'permanent_filling', label: 'Permanent Filling' },
    { key: 'direct_pulp_capping', label: 'Direct Pulp Capping' },
    { key: 'indirect_pulp_capping', label: 'Indirect Pulp Capping' },
    { key: 'gi_filling', label: 'GI Filling' },
    { key: 'temporary_filling', label: 'Temporary Filling' },
  ];

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Realtime Subscription References
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const realtimeChannelRef = useRef<any>(null);

  const referralOptions = [
    { key: 'endodontics', label: 'Endodontics' },
    { key: 'oralSurgery', label: 'Oral Surgery' },
    { key: 'orthodontics', label: 'Orthodontics' },
    { key: 'periodontics', label: 'Periodontics' },
    { key: 'prosthodontics', label: 'Prosthodontics' },
    { key: 'oralMedicine', label: 'Oral Medicine' },
  ];

  // Animated Values Ù„Ù„Ø£Ù†ÙŠÙ…ÙŠØ´Ù† - Ù‚ÙŠÙ… Ù…Ù†ÙØµÙ„Ø© Ù„ÙƒÙ„ Ø³Ù†
  // Ø§Ù„Ø³Ù† 6
  const tooth6Scale = React.useRef(new Animated.Value(1)).current;
  const tooth6Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth6TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth6TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 7
  const tooth7Scale = React.useRef(new Animated.Value(1)).current;
  const tooth7Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth7TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth7TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 8
  const tooth8Scale = React.useRef(new Animated.Value(1)).current;
  const tooth8Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth8TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth8TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 5
  const tooth5Scale = React.useRef(new Animated.Value(1)).current;
  const tooth5Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth5TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth5TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 4
  const tooth4Scale = React.useRef(new Animated.Value(1)).current;
  const tooth4Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth4TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth4TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 3
  const tooth3Scale = React.useRef(new Animated.Value(1)).current;
  const tooth3Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth3TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth3TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 2
  const tooth2Scale = React.useRef(new Animated.Value(1)).current;
  const tooth2Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth2TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth2TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 1
  const tooth1Scale = React.useRef(new Animated.Value(1)).current;
  const tooth1Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth1TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth1TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 32 (Ø§Ù„Ø³ÙÙ„ÙŠØ© ÙŠØ³Ø§Ø± #8)
  const tooth32Scale = React.useRef(new Animated.Value(1)).current;
  const tooth32Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth32TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth32TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 31 (Ø§Ù„Ø³ÙÙ„ÙŠØ© ÙŠØ³Ø§Ø± #7)
  const tooth31Scale = React.useRef(new Animated.Value(1)).current;
  const tooth31Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth31TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth31TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 30 (Ø§Ù„Ø³ÙÙ„ÙŠØ© ÙŠØ³Ø§Ø± #6)
  const tooth30Scale = React.useRef(new Animated.Value(1)).current;
  const tooth30Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth30TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth30TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 29 (Ø§Ù„Ø³ÙÙ„ÙŠØ© ÙŠØ³Ø§Ø± #5)
  const tooth29Scale = React.useRef(new Animated.Value(1)).current;
  const tooth29Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth29TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth29TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 28 (Ø§Ù„Ø³ÙÙ„ÙŠØ© ÙŠØ³Ø§Ø± #4)
  const tooth28Scale = React.useRef(new Animated.Value(1)).current;
  const tooth28Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth28TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth28TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 27 (Ø§Ù„Ø³ÙÙ„ÙŠØ© ÙŠØ³Ø§Ø± #3)
  const tooth27Scale = React.useRef(new Animated.Value(1)).current;
  const tooth27Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth27TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth27TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 26 (Ø§Ù„Ø³ÙÙ„ÙŠØ© ÙŠØ³Ø§Ø± #2)
  const tooth26Scale = React.useRef(new Animated.Value(1)).current;
  const tooth26Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth26TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth26TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 25 (Ø§Ù„Ø³ÙÙ„ÙŠØ© ÙŠØ³Ø§Ø± #1)
  const tooth25Scale = React.useRef(new Animated.Value(1)).current;
  const tooth25Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth25TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth25TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 9 (Ø§Ù„Ø¹Ù„ÙˆÙŠØ© ÙŠØ³Ø§Ø± #1)
  const tooth9Scale = React.useRef(new Animated.Value(1)).current;
  const tooth9Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth9TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth9TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 10 (Ø§Ù„Ø¹Ù„ÙˆÙŠØ© ÙŠØ³Ø§Ø± #2)
  const tooth10Scale = React.useRef(new Animated.Value(1)).current;
  const tooth10Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth10TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth10TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 11 (Ø§Ù„Ø¹Ù„ÙˆÙŠØ© ÙŠØ³Ø§Ø± #3)
  const tooth11Scale = React.useRef(new Animated.Value(1)).current;
  const tooth11Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth11TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth11TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 12 (Ø§Ù„Ø¹Ù„ÙˆÙŠØ© ÙŠØ³Ø§Ø± #4)
  const tooth12Scale = React.useRef(new Animated.Value(1)).current;
  const tooth12Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth12TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth12TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 13 (Ø§Ù„Ø¹Ù„ÙˆÙŠØ© ÙŠØ³Ø§Ø± #5)
  const tooth13Scale = React.useRef(new Animated.Value(1)).current;
  const tooth13Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth13TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth13TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 14 (Ø§Ù„Ø¹Ù„ÙˆÙŠØ© ÙŠØ³Ø§Ø± #6)
  const tooth14Scale = React.useRef(new Animated.Value(1)).current;
  const tooth14Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth14TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth14TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 15 (Ø§Ù„Ø¹Ù„ÙˆÙŠØ© ÙŠØ³Ø§Ø± #7)
  const tooth15Scale = React.useRef(new Animated.Value(1)).current;
  const tooth15Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth15TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth15TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 16 (Ø§Ù„Ø¹Ù„ÙˆÙŠØ© ÙŠØ³Ø§Ø± #8)
  const tooth16Scale = React.useRef(new Animated.Value(1)).current;
  const tooth16Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth16TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth16TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 17 (Ø§Ù„Ø³ÙÙ„ÙŠØ© ÙŠÙ…ÙŠÙ† #8)
  const tooth17Scale = React.useRef(new Animated.Value(1)).current;
  const tooth17Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth17TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth17TranslateY = React.useRef(new Animated.Value(0)).current;

  // Animated Values Ù„Ù„Ù€ View Mode - Ø¥Ø²Ø§Ø­Ø© Ø§Ù„Ø£Ø³Ù†Ø§Ù† ÙˆØ²Ø± Edit
  const rightTeethSlide = React.useRef(new Animated.Value(0)).current; // Ø£Ø³Ù†Ø§Ù† Ø§Ù„ÙŠÙ…ÙŠÙ† (1-8 Ùˆ 17-24)
  const leftTeethSlide = React.useRef(new Animated.Value(0)).current; // Ø£Ø³Ù†Ø§Ù† Ø§Ù„ÙŠØ³Ø§Ø± (9-16 Ùˆ 25-32)
  const editButtonSlide = React.useRef(new Animated.Value(0)).current; // Ø²Ø± Edit
  const verticalTopLineSlide = React.useRef(new Animated.Value(0)).current; // Ø§Ù„Ø®Ø· Ø§Ù„Ø¹Ù…ÙˆØ¯ÙŠ Ø§Ù„Ø¹Ù„ÙˆÙŠ (Ù„Ù„Ø£Ø¹Ù„Ù‰)
  const verticalBottomLineSlide = React.useRef(new Animated.Value(0)).current; // Ø§Ù„Ø®Ø· Ø§Ù„Ø¹Ù…ÙˆØ¯ÙŠ Ø§Ù„Ø³ÙÙ„ÙŠ (Ù„Ù„Ø£Ø³ÙÙ„)
  const horizontalRightLineSlide = React.useRef(new Animated.Value(0)).current; // Ø§Ù„Ø®Ø· Ø§Ù„Ø£ÙÙ‚ÙŠ Ø§Ù„Ø£ÙŠÙ…Ù† (Ù„Ù„ÙŠÙ…ÙŠÙ†)
  const horizontalLeftLineSlide = React.useRef(new Animated.Value(0)).current; // Ø§Ù„Ø®Ø· Ø§Ù„Ø£ÙÙ‚ÙŠ Ø§Ù„Ø£ÙŠØ³Ø± (Ù„Ù„ÙŠØ³Ø§Ø±)
  const rightNumbersSlide = React.useRef(new Animated.Value(0)).current; // Ø£Ø±Ù‚Ø§Ù… Ø§Ù„Ø£Ø³Ù†Ø§Ù† Ø§Ù„ÙŠÙ…Ù†Ù‰
  const leftNumbersSlide = React.useRef(new Animated.Value(0)).current; // Ø£Ø±Ù‚Ø§Ù… Ø§Ù„Ø£Ø³Ù†Ø§Ù† Ø§Ù„ÙŠØ³Ø±Ù‰
  const oralHygieneOpacity = React.useRef(new Animated.Value(1)).current; // Ø´ÙØ§ÙÙŠØ© Ø­Ø§ÙˆÙŠØ© Oral Hygiene
  const viewButtonPositionAnim = React.useRef(new Animated.Value(0)).current; // Ø£Ù†ÙŠÙ…ÙŠØ´Ù† Ù…ÙˆÙ‚Ø¹ Ø²Ø± View (0 = Ù…ÙˆÙ‚Ø¹ Ø£ØµÙ„ÙŠ, 1 = Ø£Ø¹Ù„Ù‰ ÙŠÙ…ÙŠÙ†)
  const buttonsOpacity = React.useRef(new Animated.Value(1)).current; // Ø´ÙØ§ÙÙŠØ© Ø§Ù„Ø£Ø²Ø±Ø§Ø± (Edit, View, Oral Hygiene) - ØªØ®ØªÙÙŠ Ø¹Ù†Ø¯ ÙØªØ­ Ø§Ù„Ø³Ù†
  const referralContainerSlide = React.useRef(new Animated.Value(1000)).current; // Ø­Ø§ÙˆÙŠØ© Referral (ØªØ¨Ø¯Ø£ Ø®Ø§Ø±Ø¬ Ø§Ù„Ø´Ø§Ø´Ø© Ù…Ù† Ø§Ù„ÙŠÙ…ÙŠÙ†)
  const referralSectionsHeight = React.useRef(new Animated.Value(0)).current; // Ù„ÙØªØ­/Ø¥ØºÙ„Ø§Ù‚ Ø£Ù‚Ø³Ø§Ù… Referral (0 = Ù…ØºÙ„Ù‚, 1 = Ù…ÙØªÙˆØ­) - ØªØ¨Ø¯Ø£ Ù…ØºÙ„Ù‚Ø©
  const treatmentRecordSlide = React.useRef(new Animated.Value(-1000)).current; // Ø­Ø§ÙˆÙŠØ© Treatment Record (ØªØ¨Ø¯Ø£ Ø®Ø§Ø±Ø¬ Ø§Ù„Ø´Ø§Ø´Ø© Ù…Ù† Ø§Ù„ÙŠØ³Ø§Ø±)
  const planningRecordSlide = React.useRef(new Animated.Value(1000)).current; // Ø­Ø§ÙˆÙŠØ© Planning Record (ØªØ¨Ø¯Ø£ Ø®Ø§Ø±Ø¬ Ø§Ù„Ø´Ø§Ø´Ø© Ù…Ù† Ø§Ù„ÙŠÙ…ÙŠÙ†)
  const treatmentRecordPushDown = React.useRef(new Animated.Value(0)).current; // ØªØ­Ø±ÙŠÙƒ Treatment Record Ù„Ù„Ø£Ø³ÙÙ„ Ø¹Ù†Ø¯ ÙØªØ­ Referral (0 = Ø¹Ø§Ø¯ÙŠ, 400 = Ù…Ø¯ÙÙˆØ¹ Ù„Ù„Ø£Ø³ÙÙ„)
  const planningRecordPushDown = React.useRef(new Animated.Value(0)).current; // ØªØ­Ø±ÙŠÙƒ Planning Record Ù„Ù„Ø£Ø³ÙÙ„ Ø¹Ù†Ø¯ ÙØªØ­ Referral (0 = Ø¹Ø§Ø¯ÙŠ, 400 = Ù…Ø¯ÙÙˆØ¹ Ù„Ù„Ø£Ø³ÙÙ„)

  // Ø§Ù„Ø­Ø§ÙˆÙŠØ§Øª ÙÙŠ Ù…ÙˆÙ‚Ø¹ Ø«Ø§Ø¨Øª - Ù„Ø§ Ø­Ø§Ø¬Ø© Ù„ØªØ­Ø±ÙŠÙƒÙ‡Ø§
  React.useEffect(() => {
    // Ù‚ÙŠÙ…Ø© 0 ØªØ¹Ù†ÙŠ Ø£Ù† Ø§Ù„Ø­Ø§ÙˆÙŠØ§Øª ÙÙŠ Ù…ÙˆÙ‚Ø¹Ù‡Ø§ Ø§Ù„Ø·Ø¨ÙŠØ¹ÙŠ Ø§Ù„Ø«Ø§Ø¨Øª
    treatmentRecordPushDown.setValue(0);
    planningRecordPushDown.setValue(0);
  }, []);

  // Ø£Ù†ÙŠÙ…ÙŠØ´Ù† ØªÙˆØ³Ø¹ Ø­Ø§ÙˆÙŠØ© Oral Hygiene
  useEffect(() => {
    Animated.timing(oralHygieneExpandAnim, {
      toValue: isOralHygieneExpanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isOralHygieneExpanded]);

  // Ø¯Ø§Ù„Ø© Ù„Ù„Ù†Ù‚Ø± Ø¹Ù„Ù‰ Ø­Ø§ÙˆÙŠØ© Oral Hygiene
  const handleOralHygienePress = () => {
    setIsOralHygieneExpanded(!isOralHygieneExpanded);
  };

  // Ø¯Ø§Ù„Ø© Ù„Ø¥Ø¶Ø§ÙØ© Ø³Ø¬Ù„ Scaling Ø¬Ø¯ÙŠØ¯
  const handleAddScaling = async () => {
    if (!permanentPatientId) {
      Alert.alert('Error', 'No patient selected');
      return;
    }

    const now = new Date();
    const timestamp = now.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Ø­ÙØ¸ ÙÙŠ Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
    const { data, error } = await createScalingRecord(
      permanentPatientId,
      user?.name || 'Dr. Unknown'
    );

    if (error) {
      Alert.alert('Error', 'Failed to save scaling record');
      console.error('Error saving scaling record:', error);
      return;
    }

    // Ø¥Ø¶Ø§ÙØ© Ù„Ù„Ù€ state
    if (data) {
      setScalingRecords(prev => [
        {
          id: data.id,
          timestamp,
          doctorName: user?.name || 'Dr. Unknown',
          timestampNum: now.getTime()
        },
        ...prev
      ]);
    }

    // Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„Ø­Ø§ÙˆÙŠØ© Ø¨Ø¹Ø¯ Ø§Ù„Ø¥Ø¶Ø§ÙØ©
    setIsOralHygieneExpanded(false);
  };

  // Ø§Ù„Ø³Ù† 18 (Ø§Ù„Ø³ÙÙ„ÙŠØ© ÙŠÙ…ÙŠÙ† #7)
  const tooth18Scale = React.useRef(new Animated.Value(1)).current;
  const tooth18Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth18TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth18TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 19 (Ø§Ù„Ø³ÙÙ„ÙŠØ© ÙŠÙ…ÙŠÙ† #6)
  const tooth19Scale = React.useRef(new Animated.Value(1)).current;
  const tooth19Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth19TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth19TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 20 (Ø§Ù„Ø³ÙÙ„ÙŠØ© ÙŠÙ…ÙŠÙ† #5)
  const tooth20Scale = React.useRef(new Animated.Value(1)).current;
  const tooth20Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth20TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth20TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 21 (Ø§Ù„Ø³ÙÙ„ÙŠØ© ÙŠÙ…ÙŠÙ† #4)
  const tooth21Scale = React.useRef(new Animated.Value(1)).current;
  const tooth21Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth21TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth21TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 22 (Ø§Ù„Ø³ÙÙ„ÙŠØ© ÙŠÙ…ÙŠÙ† #3)
  const tooth22Scale = React.useRef(new Animated.Value(1)).current;
  const tooth22Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth22TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth22TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 23 (Ø§Ù„Ø³ÙÙ„ÙŠØ© ÙŠÙ…ÙŠÙ† #2)
  const tooth23Scale = React.useRef(new Animated.Value(1)).current;
  const tooth23Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth23TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth23TranslateY = React.useRef(new Animated.Value(0)).current;

  // Ø§Ù„Ø³Ù† 24 (Ø§Ù„Ø³ÙÙ„ÙŠØ© ÙŠÙ…ÙŠÙ† #1)
  const tooth24Scale = React.useRef(new Animated.Value(1)).current;
  const tooth24Rotation = React.useRef(new Animated.Value(0)).current;
  const tooth24TranslateX = React.useRef(new Animated.Value(0)).current;
  const tooth24TranslateY = React.useRef(new Animated.Value(0)).current;

  // Function Ù„Ø¥ÙŠÙ‚Ø§Ù Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø£Ù†ÙŠÙ…ÙŠØ´Ù†Ø§Øª Ù„Ø³Ù† Ù…Ø¹ÙŠÙ†
  const stopToothAnimations = (toothNumber: number) => {
    if (toothNumber === 6) {
      tooth6Scale.stopAnimation();
      tooth6Rotation.stopAnimation();
      tooth6TranslateX.stopAnimation();
      tooth6TranslateY.stopAnimation();
      // Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ù‚ÙŠÙ… Ù„Ù„ÙˆØ¶Ø¹ Ø§Ù„Ø·Ø¨ÙŠØ¹ÙŠ
      tooth6Scale.setValue(1);
      tooth6Rotation.setValue(0);
      tooth6TranslateX.setValue(0);
      tooth6TranslateY.setValue(0);
    } else if (toothNumber === 7) {
      tooth7Scale.stopAnimation();
      tooth7Rotation.stopAnimation();
      tooth7TranslateX.stopAnimation();
      tooth7TranslateY.stopAnimation();
      tooth7Scale.setValue(1);
      tooth7Rotation.setValue(0);
      tooth7TranslateX.setValue(0);
      tooth7TranslateY.setValue(0);
    } else if (toothNumber === 8) {
      tooth8Scale.stopAnimation();
      tooth8Rotation.stopAnimation();
      tooth8TranslateX.stopAnimation();
      tooth8TranslateY.stopAnimation();
      tooth8Scale.setValue(1);
      tooth8Rotation.setValue(0);
      tooth8TranslateX.setValue(0);
      tooth8TranslateY.setValue(0);
    } else if (toothNumber === 5) {
      tooth5Scale.stopAnimation();
      tooth5Rotation.stopAnimation();
      tooth5TranslateX.stopAnimation();
      tooth5TranslateY.stopAnimation();
      tooth5Scale.setValue(1);
      tooth5Rotation.setValue(0);
      tooth5TranslateX.setValue(0);
      tooth5TranslateY.setValue(0);
    } else if (toothNumber === 4) {
      tooth4Scale.stopAnimation();
      tooth4Rotation.stopAnimation();
      tooth4TranslateX.stopAnimation();
      tooth4TranslateY.stopAnimation();
      tooth4Scale.setValue(1);
      tooth4Rotation.setValue(0);
      tooth4TranslateX.setValue(0);
      tooth4TranslateY.setValue(0);
    } else if (toothNumber === 3) {
      tooth3Scale.stopAnimation();
      tooth3Rotation.stopAnimation();
      tooth3TranslateX.stopAnimation();
      tooth3TranslateY.stopAnimation();
      tooth3Scale.setValue(1);
      tooth3Rotation.setValue(0);
      tooth3TranslateX.setValue(0);
      tooth3TranslateY.setValue(0);
    } else if (toothNumber === 2) {
      tooth2Scale.stopAnimation();
      tooth2Rotation.stopAnimation();
      tooth2TranslateX.stopAnimation();
      tooth2TranslateY.stopAnimation();
      tooth2Scale.setValue(1);
      tooth2Rotation.setValue(0);
      tooth2TranslateX.setValue(0);
      tooth2TranslateY.setValue(0);
    } else if (toothNumber === 1) {
      tooth1Scale.stopAnimation();
      tooth1Rotation.stopAnimation();
      tooth1TranslateX.stopAnimation();
      tooth1TranslateY.stopAnimation();
      tooth1Scale.setValue(1);
      tooth1Rotation.setValue(0);
      tooth1TranslateX.setValue(0);
      tooth1TranslateY.setValue(0);
    } else if (toothNumber === 32) {
      tooth32Scale.stopAnimation();
      tooth32Rotation.stopAnimation();
      tooth32TranslateX.stopAnimation();
      tooth32TranslateY.stopAnimation();
      tooth32Scale.setValue(1);
      tooth32Rotation.setValue(0);
      tooth32TranslateX.setValue(0);
      tooth32TranslateY.setValue(0);
    } else if (toothNumber === 31) {
      tooth31Scale.stopAnimation();
      tooth31Rotation.stopAnimation();
      tooth31TranslateX.stopAnimation();
      tooth31TranslateY.stopAnimation();
      tooth31Scale.setValue(1);
      tooth31Rotation.setValue(0);
      tooth31TranslateX.setValue(0);
      tooth31TranslateY.setValue(0);
    } else if (toothNumber === 30) {
      tooth30Scale.stopAnimation();
      tooth30Rotation.stopAnimation();
      tooth30TranslateX.stopAnimation();
      tooth30TranslateY.stopAnimation();
      tooth30Scale.setValue(1);
      tooth30Rotation.setValue(0);
      tooth30TranslateX.setValue(0);
      tooth30TranslateY.setValue(0);
    } else if (toothNumber === 29) {
      tooth29Scale.stopAnimation();
      tooth29Rotation.stopAnimation();
      tooth29TranslateX.stopAnimation();
      tooth29TranslateY.stopAnimation();
      tooth29Scale.setValue(1);
      tooth29Rotation.setValue(0);
      tooth29TranslateX.setValue(0);
      tooth29TranslateY.setValue(0);
    } else if (toothNumber === 28) {
      tooth28Scale.stopAnimation();
      tooth28Rotation.stopAnimation();
      tooth28TranslateX.stopAnimation();
      tooth28TranslateY.stopAnimation();
      tooth28Scale.setValue(1);
      tooth28Rotation.setValue(0);
      tooth28TranslateX.setValue(0);
      tooth28TranslateY.setValue(0);
    } else if (toothNumber === 27) {
      tooth27Scale.stopAnimation();
      tooth27Rotation.stopAnimation();
      tooth27TranslateX.stopAnimation();
      tooth27TranslateY.stopAnimation();
      tooth27Scale.setValue(1);
      tooth27Rotation.setValue(0);
      tooth27TranslateX.setValue(0);
      tooth27TranslateY.setValue(0);
    } else if (toothNumber === 26) {
      tooth26Scale.stopAnimation();
      tooth26Rotation.stopAnimation();
      tooth26TranslateX.stopAnimation();
      tooth26TranslateY.stopAnimation();
      tooth26Scale.setValue(1);
      tooth26Rotation.setValue(0);
      tooth26TranslateX.setValue(0);
      tooth26TranslateY.setValue(0);
    } else if (toothNumber === 25) {
      tooth25Scale.stopAnimation();
      tooth25Rotation.stopAnimation();
      tooth25TranslateX.stopAnimation();
      tooth25TranslateY.stopAnimation();
      tooth25Scale.setValue(1);
      tooth25Rotation.setValue(0);
      tooth25TranslateX.setValue(0);
      tooth25TranslateY.setValue(0);
    } else if (toothNumber === 9) {
      tooth9Scale.stopAnimation();
      tooth9Rotation.stopAnimation();
      tooth9TranslateX.stopAnimation();
      tooth9TranslateY.stopAnimation();
      tooth9Scale.setValue(1);
      tooth9Rotation.setValue(0);
      tooth9TranslateX.setValue(0);
      tooth9TranslateY.setValue(0);
    } else if (toothNumber === 10) {
      tooth10Scale.stopAnimation();
      tooth10Rotation.stopAnimation();
      tooth10TranslateX.stopAnimation();
      tooth10TranslateY.stopAnimation();
      tooth10Scale.setValue(1);
      tooth10Rotation.setValue(0);
      tooth10TranslateX.setValue(0);
      tooth10TranslateY.setValue(0);
    } else if (toothNumber === 11) {
      tooth11Scale.stopAnimation();
      tooth11Rotation.stopAnimation();
      tooth11TranslateX.stopAnimation();
      tooth11TranslateY.stopAnimation();
      tooth11Scale.setValue(1);
      tooth11Rotation.setValue(0);
      tooth11TranslateX.setValue(0);
      tooth11TranslateY.setValue(0);
    } else if (toothNumber === 12) {
      tooth12Scale.stopAnimation();
      tooth12Rotation.stopAnimation();
      tooth12TranslateX.stopAnimation();
      tooth12TranslateY.stopAnimation();
      tooth12Scale.setValue(1);
      tooth12Rotation.setValue(0);
      tooth12TranslateX.setValue(0);
      tooth12TranslateY.setValue(0);
    } else if (toothNumber === 13) {
      tooth13Scale.stopAnimation();
      tooth13Rotation.stopAnimation();
      tooth13TranslateX.stopAnimation();
      tooth13TranslateY.stopAnimation();
      tooth13Scale.setValue(1);
      tooth13Rotation.setValue(0);
      tooth13TranslateX.setValue(0);
      tooth13TranslateY.setValue(0);
    } else if (toothNumber === 14) {
      tooth14Scale.stopAnimation();
      tooth14Rotation.stopAnimation();
      tooth14TranslateX.stopAnimation();
      tooth14TranslateY.stopAnimation();
      tooth14Scale.setValue(1);
      tooth14Rotation.setValue(0);
      tooth14TranslateX.setValue(0);
      tooth14TranslateY.setValue(0);
    } else if (toothNumber === 15) {
      tooth15Scale.stopAnimation();
      tooth15Rotation.stopAnimation();
      tooth15TranslateX.stopAnimation();
      tooth15TranslateY.stopAnimation();
      tooth15Scale.setValue(1);
      tooth15Rotation.setValue(0);
      tooth15TranslateX.setValue(0);
      tooth15TranslateY.setValue(0);
    } else if (toothNumber === 16) {
      tooth16Scale.stopAnimation();
      tooth16Rotation.stopAnimation();
      tooth16TranslateX.stopAnimation();
      tooth16TranslateY.stopAnimation();
      tooth16Scale.setValue(1);
      tooth16Rotation.setValue(0);
      tooth16TranslateX.setValue(0);
      tooth16TranslateY.setValue(0);
    } else if (toothNumber === 17) {
      tooth17Scale.stopAnimation();
      tooth17Rotation.stopAnimation();
      tooth17TranslateX.stopAnimation();
      tooth17TranslateY.stopAnimation();
      tooth17Scale.setValue(1);
      tooth17Rotation.setValue(0);
      tooth17TranslateX.setValue(0);
      tooth17TranslateY.setValue(0);
    } else if (toothNumber === 18) {
      tooth18Scale.stopAnimation();
      tooth18Rotation.stopAnimation();
      tooth18TranslateX.stopAnimation();
      tooth18TranslateY.stopAnimation();
      tooth18Scale.setValue(1);
      tooth18Rotation.setValue(0);
      tooth18TranslateX.setValue(0);
      tooth18TranslateY.setValue(0);
    } else if (toothNumber === 19) {
      tooth19Scale.stopAnimation();
      tooth19Rotation.stopAnimation();
      tooth19TranslateX.stopAnimation();
      tooth19TranslateY.stopAnimation();
      tooth19Scale.setValue(1);
      tooth19Rotation.setValue(0);
      tooth19TranslateX.setValue(0);
      tooth19TranslateY.setValue(0);
    } else if (toothNumber === 20) {
      tooth20Scale.stopAnimation();
      tooth20Rotation.stopAnimation();
      tooth20TranslateX.stopAnimation();
      tooth20TranslateY.stopAnimation();
      tooth20Scale.setValue(1);
      tooth20Rotation.setValue(0);
      tooth20TranslateX.setValue(0);
      tooth20TranslateY.setValue(0);
    } else if (toothNumber === 21) {
      tooth21Scale.stopAnimation();
      tooth21Rotation.stopAnimation();
      tooth21TranslateX.stopAnimation();
      tooth21TranslateY.stopAnimation();
      tooth21Scale.setValue(1);
      tooth21Rotation.setValue(0);
      tooth21TranslateX.setValue(0);
      tooth21TranslateY.setValue(0);
    } else if (toothNumber === 22) {
      tooth22Scale.stopAnimation();
      tooth22Rotation.stopAnimation();
      tooth22TranslateX.stopAnimation();
      tooth22TranslateY.stopAnimation();
      tooth22Scale.setValue(1);
      tooth22Rotation.setValue(0);
      tooth22TranslateX.setValue(0);
      tooth22TranslateY.setValue(0);
    } else if (toothNumber === 23) {
      tooth23Scale.stopAnimation();
      tooth23Rotation.stopAnimation();
      tooth23TranslateX.stopAnimation();
      tooth23TranslateY.stopAnimation();
      tooth23Scale.setValue(1);
      tooth23Rotation.setValue(0);
      tooth23TranslateX.setValue(0);
      tooth23TranslateY.setValue(0);
    } else if (toothNumber === 24) {
      tooth24Scale.stopAnimation();
      tooth24Rotation.stopAnimation();
      tooth24TranslateX.stopAnimation();
      tooth24TranslateY.stopAnimation();
      tooth24Scale.setValue(1);
      tooth24Rotation.setValue(0);
      tooth24TranslateX.setValue(0);
      tooth24TranslateY.setValue(0);
    }
  };

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Database Integration Functions
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /**
   * Convert tooth number (1-32) to Palmer Notation (UR1-UR8, UL1-UL8, LR1-LR8, LL1-LL8)
   */
  const convertNumberToPalmer = (toothNumber: number): ToothNumber | null => {
    // Upper Left (1-8 â†’ UL1-UL8)
    if (toothNumber >= 1 && toothNumber <= 8) {
      return `UL${toothNumber}` as ToothNumber;
    }
    // Upper Right (9-16 â†’ UR8-UR1)
    if (toothNumber >= 9 && toothNumber <= 16) {
      const position = 17 - toothNumber;
      return `UR${position}` as ToothNumber;
    }
    // Lower Left (17-24 â†’ LL1-LL8)
    if (toothNumber >= 17 && toothNumber <= 24) {
      const position = toothNumber - 16;
      return `LL${position}` as ToothNumber;
    }
    // Lower Right (25-32 â†’ LR8-LR1)
    if (toothNumber >= 25 && toothNumber <= 32) {
      const position = 33 - toothNumber;
      return `LR${position}` as ToothNumber;
    }
    return null;
  };

  /**
   * Convert Palmer Notation to tooth number (1-32)
   */
  const convertPalmerToNumber = (palmer: ToothNumber): number | null => {
    const quadrant = palmer.substring(0, 2); // UR, UL, LR, LL
    const position = parseInt(palmer.substring(2)); // 1-8

    if (quadrant === 'UL') {
      return position; // UL1â†’1, UL2â†’2, ..., UL8â†’8
    }
    if (quadrant === 'UR') {
      return 17 - position; // UR1â†’16, UR2â†’15, ..., UR8â†’9
    }
    if (quadrant === 'LL') {
      return 16 + position; // LL1â†’17, LL2â†’18, ..., LL8â†’24
    }
    if (quadrant === 'LR') {
      return 33 - position; // LR1â†’32, LR2â†’31, ..., LR8â†’25
    }
    return null;
  };

  /**
   * Load all dental data for the patient from database
   */
  const loadPatientDentalData = async () => {
    if (!permanentPatientId) {
      console.log('No permanent patient ID, skipping data load');
      return;
    }

    try {
      console.log('ðŸš€ Loading dental data for patient (PARALLEL):', permanentPatientId);
      const startTime = performance.now();

      // âš¡ Load ALL data in PARALLEL (much faster!)
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
      console.log(` All data loaded in ${loadTime.toFixed(0)}ms`);

      // Process tooth surface conditions
      const { data: toothData, error: toothError } = toothDataResult;

      if (toothError) {
        console.error('Error loading tooth data:', toothError);
        Alert.alert('Ø®Ø·Ø£', 'ÙØ´Ù„ ØªØ­Ù…ÙŠÙ„ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø£Ø³Ù†Ø§Ù†');
        return;
      }

      if (toothData && toothData.length > 0) {
        const newConditions: Record<number, ToothSurfaceConditions> = {};

        // Convert Palmer notation to numbers and build conditions object
        toothData.forEach((tooth) => {
          const toothNumber = convertPalmerToNumber(tooth.tooth_number as ToothNumber);
          if (toothNumber) {
            newConditions[toothNumber] = {
              top: tooth.surfaces.top || null,
              bottom: tooth.surfaces.bottom || null,
              left: tooth.surfaces.left || null,
              right: tooth.surfaces.right || null,
              center: tooth.surfaces.center || null,
            };
          }
        });

        setToothConditions(newConditions);
        console.log('Loaded tooth conditions for', Object.keys(newConditions).length, 'teeth');
        // Border colors come from editing_records and planning_records only
      }

      // Process editing records (treatments) - already loaded
      const { data: editingData, error: editingError } = editingDataResult;

      if (editingError) {
        console.error('Error loading editing records:', editingError);
      } else if (editingData && editingData.length > 0) {
        const newRecords: Record<number, ToothRecord[]> = {};
        const borderColorsFromEditing: Record<number, ToothCondition> = {};
        const conditionsFromEditing: Record<number, ToothSurfaceConditions> = {};

        editingData.forEach((record) => {
          const toothNumber = convertPalmerToNumber(record.tooth_number as ToothNumber);
          if (toothNumber) {
            // Parse surfaces once at the beginning
            const parsedSurfaces = typeof record.surfaces === 'string' ? JSON.parse(record.surfaces) : record.surfaces;

            if (!newRecords[toothNumber]) {
              newRecords[toothNumber] = [];
            }

            newRecords[toothNumber].push({
              type: 'editing',
              treatment: record.treatment,
              details: record.details || '',
              surfaces: parsedSurfaces,
              timestamp: new Date(record.timestamp).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }),
              timestampNum: record.timestamp_num || Date.now(),
              doctorName: record.doctor_name,
            });

            // Rebuild toothBorderColors from editing records
            if (record.treatment === 'Pulpectomy') {
              borderColorsFromEditing[toothNumber] = 'pulpectomy';
            }

            // Rebuild toothConditions from editing records
            if (record.treatment === 'Extraction') {
              conditionsFromEditing[toothNumber] = {
                top: 'missing',
                bottom: 'missing',
                left: 'missing',
                right: 'missing',
                center: 'missing',
              };
            } else if (record.details && Array.isArray(parsedSurfaces)) {
              console.log(`ðŸ” Processing tooth ${toothNumber}: details="${record.details}", surfaces=`, parsedSurfaces);

              // Map surface names to keys (database uses lowercase)
              // Use helper function to get correct mapping for lower teeth
              const surfaceNameMap = getSurfaceNameMap(toothNumber);

              // Determine color based on details
              let conditionColor: ToothCondition | null = null;
              if (record.details === 'Temporary Filling') {
                conditionColor = 'filling_replacement';  // Ø±Ù…Ø§Ø¯ÙŠ
              } else if (record.details === 'Permanent Filling') {
                conditionColor = 'permanent_filling';    // Ø£Ø®Ø¶Ø±
              } else if (record.details === 'GI Filling') {
                conditionColor = 'gi';                   // Ø£Ø®Ø¶Ø±
              } else if (record.details === 'Direct Pulp Capping') {
                conditionColor = 'direct_pulp_capping';  // Ø£Ø®Ø¶Ø±
              } else if (record.details === 'Indirect Pulp Capping') {
                conditionColor = 'indirect_pulp_capping'; // Ø£Ø®Ø¶Ø±
              }

              console.log(`   â†’ Mapped to color: ${conditionColor}`);

              if (conditionColor && Array.isArray(parsedSurfaces)) {
                if (!conditionsFromEditing[toothNumber]) {
                  conditionsFromEditing[toothNumber] = {
                    top: null,
                    bottom: null,
                    left: null,
                    right: null,
                    center: null,
                  };
                }

                // Apply color to specified surfaces
                parsedSurfaces.forEach((surfaceName: string) => {
                  const surfaceKey = surfaceNameMap[surfaceName];
                  if (surfaceKey) {
                    conditionsFromEditing[toothNumber][surfaceKey] = conditionColor;
                  }
                });
              }
            }
          }
        });

        setToothRecords(prev => ({ ...prev, ...newRecords }));
        console.log(' Loaded editing records for', Object.keys(newRecords).length, 'teeth');

        // Apply border colors from editing records (Pulpectomy)
        if (Object.keys(borderColorsFromEditing).length > 0) {
          setToothBorderColors(prev => {
            const updated = { ...prev, ...borderColorsFromEditing };
            console.log(' Applying border colors from editing records:', borderColorsFromEditing);
            console.log('   Previous border colors:', prev);
            console.log('   Updated border colors:', updated);
            return updated;
          });
        }

        // Editing records are for display only in Modal (history)
        // Colors come ONLY from tooth_surface_conditions table
      }

      // Process planning records (diagnoses) - already loaded
      const { data: planningData, error: planningError } = planningDataResult;

      if (planningError) {
        console.error('Error loading planning records:', planningError);
      } else if (planningData && planningData.length > 0) {
        const newPlanningRecords: Array<{
          toothNumber: number;
          action: 'diagnosed' | 'canceled';
          condition: string;
          surfaces: string[];
          timestamp: string;
          timestampNum: number;
          doctorName: string;
          isChange?: boolean;
          previousCondition?: string;
        }> = [];

        planningData.forEach((record) => {
          const toothNumber = convertPalmerToNumber(record.tooth_number as ToothNumber);
          if (toothNumber) {
            newPlanningRecords.push({
              toothNumber,
              action: record.action,
              condition: record.condition,
              surfaces: typeof record.surfaces === 'string' ? JSON.parse(record.surfaces) : record.surfaces,
              timestamp: new Date(record.timestamp).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }),
              timestampNum: record.timestamp_num || Date.now(),
              doctorName: record.doctor_name,
              isChange: record.is_change,
              previousCondition: record.previous_condition,
            });
          }
        });

        setAllPlanningRecordsGlobal(newPlanningRecords);
        console.log('Loaded', newPlanningRecords.length, 'planning records');

        const planningRecordsForTeeth: Record<number, ToothRecord[]> = {};

        newPlanningRecords.forEach((record) => {
          const toothNumber = record.toothNumber;

          // Add to toothRecords
          if (!planningRecordsForTeeth[toothNumber]) {
            planningRecordsForTeeth[toothNumber] = [];
          }

          planningRecordsForTeeth[toothNumber].push({
            type: 'planning',
            action: record.action,
            condition: record.condition,
            surfaces: record.surfaces,
            timestamp: record.timestamp,
            timestampNum: record.timestampNum,
            doctorName: record.doctorName,
            isChange: record.isChange,
            previousCondition: record.previousCondition,
          });
        });

        // Add planning records to toothRecords
        if (Object.keys(planningRecordsForTeeth).length > 0) {
          setToothRecords(prev => {
            const updated = { ...prev };

            // First, remove all old planning records to prevent duplicates
            Object.keys(updated).forEach((toothKey) => {
              const toothNum = parseInt(toothKey);
              updated[toothNum] = updated[toothNum].filter(record => record.type !== 'planning');
            });

            // Then add the fresh planning records from database
            Object.keys(planningRecordsForTeeth).forEach((toothKey) => {
              const toothNum = parseInt(toothKey);
              updated[toothNum] = [
                ...(updated[toothNum] || []),
                ...planningRecordsForTeeth[toothNum]
              ];
            });
            return updated;
          });
        }

        // Detect Root Canal Treated from planning records and set border colors
        const borderColorsFromPlanning: Record<number, ToothCondition> = {};
        newPlanningRecords.forEach((record) => {
          console.log(`ðŸ” Planning record - Tooth ${record.toothNumber}: condition="${record.condition}", surfaces=`, record.surfaces);
          if (record.surfaces.includes('Root Canal Treated')) {
            borderColorsFromPlanning[record.toothNumber] = 'treated';
            console.log(`ðŸ¦· Tooth ${record.toothNumber}: Root Canal Treated detected â†’ setting border color to 'treated'`);
          }
        });

        if (Object.keys(borderColorsFromPlanning).length > 0) {
          setToothBorderColors(prev => {
            const updated = { ...prev, ...borderColorsFromPlanning };
            console.log(' Applying border colors from planning records:', borderColorsFromPlanning);
            console.log('   Previous border colors:', prev);
            console.log('   Updated border colors:', updated);
            return updated;
          });
        }

        // Planning records are for display only in Modal (history)
        // Colors come ONLY from tooth_surface_conditions table
      }

      // Process tooth notes - already loaded
      const { data: notesData, error: notesError } = notesDataResult;

      if (notesError) {
        console.error('Error loading tooth notes:', notesError);
      } else if (notesData && notesData.length > 0) {
        const newNotes: Record<number, Array<{ text: string; timestamp: string; doctorName: string }>> = {};

        notesData.forEach((note) => {
          const toothNumber = convertPalmerToNumber(note.tooth_number as ToothNumber);
          if (toothNumber) {
            if (!newNotes[toothNumber]) {
              newNotes[toothNumber] = [];
            }

            newNotes[toothNumber].push({
              text: note.note,
              timestamp: new Date(note.timestamp).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }),
              doctorName: note.doctor_name,
            });
          }
        });

        setToothNotes(newNotes);
        console.log('Loaded notes for', Object.keys(newNotes).length, 'teeth');
      }

      // Process referrals - already loaded
      const { data: referralsData, error: referralsError } = referralsDataResult;

      if (referralsError) {
        console.error('Error loading referrals:', referralsError);
      } else if (referralsData && referralsData.length > 0) {
        console.log(' Loaded', referralsData.length, 'referrals');

        // Map referral types from database to UI keys
        const referralTypeToKeyMap: Record<string, string> = {
          'Endodontics': 'endodontics',
          'Oral Surgery': 'oralSurgery',
          'Orthodontics': 'orthodontics',
          'Prosthodontics': 'prosthodontics',
          'Periodontics': 'periodontics',
          'Pediatric Dentistry': 'pediatricDentistry',
        };

        // ÙØµÙ„ Ø§Ù„ØªØ­ÙˆÙŠÙ„Ø§Øª Ø­Ø³Ø¨ Ø§Ù„Ø­Ø§Ù„Ø©
        const notGivenReferrals = referralsData.filter(r => r.status === 'not_given' || !r.status);
        const givenReferrals = referralsData.filter(r => r.status === 'given');

        // Group referrals by tooth (ÙÙ‚Ø· Not Given) - Multiple referrals per tooth
        const referralsByTooth: Record<number, string[]> = {};

        notGivenReferrals.forEach((referral) => {
          // Skip general referrals (tooth_number is null)
          if (!referral.tooth_number) return;

          const toothNumber = convertPalmerToNumber(referral.tooth_number as ToothNumber);
          if (toothNumber) {
            // Map referral type to key
            const referralKey = referralTypeToKeyMap[referral.referral_type] || referral.referral_type;

            // Add to array (multiple referrals per tooth)
            if (!referralsByTooth[toothNumber]) {
              referralsByTooth[toothNumber] = [];
            }
            if (!referralsByTooth[toothNumber].includes(referralKey)) {
              referralsByTooth[toothNumber].push(referralKey);
            }
          }
        });

        // Rebuild referrals state for Department tab (Not Given referrals ÙÙ‚Ø·)
        const departmentsWithReferrals: Record<string, boolean> = {};
        const departmentStatuses: Record<string, 'not_given' | 'given'> = {};

        notGivenReferrals.forEach((referral) => {
          const referralKey = referralTypeToKeyMap[referral.referral_type] || referral.referral_type;

          // Mark department as having referrals (show in Department tab)
          departmentsWithReferrals[referralKey] = true;
          // Set status to "not_given" (will show in Department tab)
          departmentStatuses[referralKey] = 'not_given';
        });

        // Build Referral Records from Given referrals
        const givenReferralRecords: Array<{
          departmentKey: string;
          departmentName: string;
          teeth: number[];
          timestamp: string;
          timestampNum: number;
          doctorName: string;
        }> = [];

        // Group Given referrals by department AND given_at time (to separate batches)
        const givenByDept = new Map<string, typeof givenReferralRecords[0]>();

        givenReferrals.forEach((referral) => {
          const referralKey = referralTypeToKeyMap[referral.referral_type] || referral.referral_type;
          const givenTime = new Date(referral.given_at || referral.created_at);
          const roundedTime = new Date(givenTime.getFullYear(), givenTime.getMonth(), givenTime.getDate(), givenTime.getHours(), givenTime.getMinutes());
          const batchKey = `${referralKey}-${roundedTime.getTime()}`;

          // Handle general referrals (tooth_number is null)
          if (!referral.tooth_number) {
            // Create record for general referral with empty teeth array
            const existingRecord = givenByDept.get(batchKey);

            if (!existingRecord) {
              givenByDept.set(batchKey, {
                departmentKey: referralKey,
                departmentName: referral.referral_type,
                teeth: [], // Empty array for general referrals
                timestamp: givenTime.toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                }),
                timestampNum: givenTime.getTime(),
                doctorName: referral.doctor_name || 'Dr. Unknown'
              });
            }
            return; // Skip tooth number processing for general referrals
          }

          // Handle tooth-specific referrals
          const toothNumber = convertPalmerToNumber(referral.tooth_number as ToothNumber);

          if (toothNumber) {
            const existingRecord = givenByDept.get(batchKey);

            if (existingRecord) {
              // Add tooth to existing batch (if not already included)
              if (!existingRecord.teeth.includes(toothNumber)) {
                existingRecord.teeth.push(toothNumber);
              }
            } else {
              // Create new batch record
              givenByDept.set(batchKey, {
                departmentKey: referralKey,
                departmentName: referral.referral_type,
                teeth: [toothNumber],
                timestamp: givenTime.toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                }),
                timestampNum: givenTime.getTime(),
                doctorName: referral.doctor_name || 'Dr. Unknown'
              });
            }
          }
        });

        givenReferralRecords.push(...Array.from(givenByDept.values()));

        // Update states
        setSelectedReferralFor(prev => ({ ...prev, ...referralsByTooth }));

        // Update Department tab states
        setReferrals(prev => ({ ...prev, ...departmentsWithReferrals }));
        setReferralStatus(prev => ({ ...prev, ...departmentStatuses }));

        // Update Referral Records
        setReferralRecords(givenReferralRecords);

        console.log(' Applied referrals to', Object.keys(referralsByTooth).length, 'teeth');
        console.log(' Loaded departments for view:', departmentsWithReferrals);
        console.log(' Loaded Given referral records:', givenReferralRecords.length);
      }

      // Process scaling records (Oral Hygiene) - already loaded
      const { data: scalingData, error: scalingError } = scalingDataResult;

      if (scalingError) {
        console.error('Error loading scaling records:', scalingError);
      } else if (scalingData && scalingData.length > 0) {
        const newScalingRecords = scalingData.map((record) => ({
          id: record.id,
          timestamp: new Date(record.timestamp).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          doctorName: record.doctor_name,
          timestampNum: new Date(record.timestamp).getTime(),
        }));

        setScalingRecords(newScalingRecords);
        console.log(' Loaded', newScalingRecords.length, 'scaling records');
      }

      console.log('Dental data loading complete');
    } catch (error) {
      console.error('Error in loadPatientDentalData:', error);
      Alert.alert('Ø®Ø·Ø£', 'Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª');
    }
  };

  // Load data when component mounts or permanentPatientId changes + Setup Realtime
  useEffect(() => {
    if (!permanentPatientId) return;

    // Initial load
    loadPatientDentalData();

    // Cleanup previous subscription
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    // âŒ Real-time DISABLED for Dental Chart
    // Reason: Manual refresh is preferred to avoid constant reloads
    /*
    // Setup Realtime subscription for dental data tables
    // Listen to changes on all tables related to this patient
    const dentalChannel = supabase
      .channel(`dental-chart-${Date.now()}`)
      // tooth_surface_conditions table
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tooth_surface_conditions',
          filter: `permanent_patient_id=eq.${permanentPatientId}`
        },
        (payload) => {
          console.log('ðŸ”„ Real-time: tooth_surface_conditions changed:', payload);
          loadPatientDentalData(); // Silent refresh
        }
      )
      // editing_records table
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'editing_records',
          filter: `permanent_patient_id=eq.${permanentPatientId}`
        },
        (payload) => {
          console.log('ðŸ”„ Real-time: editing_records changed:', payload);
          loadPatientDentalData();
        }
      )
      // planning_records table
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'planning_records',
          filter: `permanent_patient_id=eq.${permanentPatientId}`
        },
        (payload) => {
          console.log('ðŸ”„ Real-time: planning_records changed:', payload);
          loadPatientDentalData();
        }
      )
      // tooth_notes table
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tooth_notes',
          filter: `permanent_patient_id=eq.${permanentPatientId}`
        },
        (payload) => {
          console.log('ðŸ”„ Real-time: tooth_notes changed:', payload);
          loadPatientDentalData();
        }
      )
      // referrals table
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'referrals',
          filter: `permanent_patient_id=eq.${permanentPatientId}`
        },
        (payload) => {
          console.log('ðŸ”„ Real-time: referrals changed:', payload);
          loadPatientDentalData();
        }
      )
      // scaling_records table
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scaling_records',
          filter: `permanent_patient_id=eq.${permanentPatientId}`
        },
        (payload) => {
          console.log('ðŸ”„ Real-time: scaling_records changed:', payload);
          loadPatientDentalData();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('âœ… Real-time: Subscribed to dental chart updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('âŒ Real-time: Channel error, retrying...');
          setTimeout(() => {
            loadPatientDentalData();
          }, 3000);
        }
      });

    realtimeChannelRef.current = dentalChannel;
    */

    // Cleanup on unmount or when permanentPatientId changes
    return () => {
      if (realtimeChannelRef.current) {
        console.log('ðŸ§¹ Cleaning up dental chart real-time subscription');
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [permanentPatientId]);

  /**
   * Save tooth surface condition to database
   */
  const saveToothConditionToDatabase = async (
    toothNumber: number,
    surface: keyof ToothSurfaceConditions,
    condition: ToothCondition
  ) => {
    if (!permanentPatientId || !user?.name) {
      console.log('Cannot save: missing permanentPatientId or user name');
      return;
    }

    const palmerNotation = convertNumberToPalmer(toothNumber);
    if (!palmerNotation) {
      console.error('Invalid tooth number:', toothNumber);
      return;
    }

    // Map UI surface names to database field names
    // Use helper function to get correct mapping for lower teeth
    const surfaceMap = getSurfaceMap(toothNumber);

    const dbSurface = surfaceMap[surface];

    try {
      const { error } = await saveToothSurfaceCondition(
        permanentPatientId,
        palmerNotation,
        dbSurface,
        condition
      );

      if (error) {
        console.error('Error saving tooth condition:', error);
        // Don't show alert - just log the error and continue
        // User can still work offline
      } else {
        console.log(`Saved ${surface} (${dbSurface}) of tooth ${toothNumber} (${palmerNotation}): ${condition}`);
      }
    } catch (error) {
      console.error('Exception saving tooth condition:', error);
    }
  };

  /**
   * Save planning record to database
   */
  const savePlanningRecordToDatabase = async (
    toothNumber: number,
    action: 'diagnosed' | 'canceled',
    condition: string,
    surfaces: string[]
  ) => {
    if (!permanentPatientId || !user?.name) {
      console.log('Cannot save planning record: missing permanentPatientId or user name');
      return;
    }

    const palmerNotation = convertNumberToPalmer(toothNumber);
    if (!palmerNotation) {
      console.error('Invalid tooth number:', toothNumber);
      return;
    }

    try {
      const surfaceArray = surfaces.map(s => s.toLowerCase()) as ToothSurface[];

      const { error } = await createPlanningRecord(
        permanentPatientId,
        palmerNotation,
        action,
        condition,
        surfaceArray,
        user.name
      );

      if (error) {
        console.error('Error saving planning record:', error);
      } else {
        console.log(`Saved planning record for tooth ${toothNumber} (${palmerNotation}): ${action} - ${condition}`);
      }
    } catch (error) {
      console.error('Exception saving planning record:', error);
    }
  };

  /**
   * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   * Handle Planning Submit - Save all pending planning records as batch
   * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   */
  const handlePlanningSubmit = async () => {
    if (!permanentPatientId || !user?.name || pendingPlanningRecords.length === 0) {
      console.log('Cannot submit planning: missing data or no pending records');
      return;
    }

    try {
      console.log('ðŸ”µ Submitting planning batch with', pendingPlanningRecords.length, 'records');

      // Step 1: Create a new planning batch
      const { data: batchData, error: batchError } = await createPlanningBatch(
        permanentPatientId,
        user.name
      );

      if (batchError || !batchData) {
        console.error(' Error creating planning batch:', batchError);
        Alert.alert('Ø®Ø·Ø£', 'ÙØ´Ù„ Ø­ÙØ¸ Ø§Ù„ØªØ®Ø·ÙŠØ·. Ø­Ø§ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.');
        return;
      }

      const batchId = batchData.id;
      console.log(' Created planning batch:', batchId);

      // Step 2: Save all pending planning records with batch_id
      const savePromises = pendingPlanningRecords.map(async (record) => {
        const palmerNotation = convertNumberToPalmer(record.toothNumber);
        if (!palmerNotation) {
          console.error('Invalid tooth number:', record.toothNumber);
          return null;
        }

        // Don't lowercase special tooth status values (Root Canal Treated, Missing Tooth)
        // Only lowercase actual surface names (Mesial, Distal, etc.)
        const surfaceArray = record.surfaces.map(s => {
          if (s === 'Root Canal Treated' || s === 'Missing Tooth') {
            return s; // Keep as-is
          }
          return s.toLowerCase(); // Convert surface names to lowercase
        }) as ToothSurface[];

        console.log(`ðŸ’¾ Saving planning record - Tooth ${record.toothNumber}: condition="${record.condition}", surfaces=`, surfaceArray);

        return createPlanningRecord(
          permanentPatientId,
          palmerNotation,
          record.action,
          record.condition,
          surfaceArray,
          user.name,
          record.isChange,
          record.previousCondition,
          batchId  // â† Include batch_id
        );
      });

      const results = await Promise.all(savePromises);
      const errors = results.filter(r => r?.error);

      if (errors.length > 0) {
        console.error(' Some planning records failed to save:', errors);
        Alert.alert('ØªØ­Ø°ÙŠØ±', 'ØªÙ… Ø­ÙØ¸ Ø¨Ø¹Ø¶ Ø§Ù„Ø³Ø¬Ù„Ø§Øª ÙÙ‚Ø·. ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª.');
      } else {
        console.log(' All planning records saved successfully with batch_id:', batchId);
      }

      // Step 2.5: Save/Delete tooth surface conditions from pendingPlanningRecords
      console.log('ðŸ”µ Saving tooth surface conditions from pending records...');

      // Helper function to extract surface name from strings like "Caries (Mesial)" or "Mesial"
      const extractSurfaceName = (surfaceLabel: string): string => {
        if (surfaceLabel.includes('(')) {
          // Extract from "Caries (Mesial)" â†’ "Mesial"
          const match = surfaceLabel.match(/\(([^)]+)\)/);
          return match ? match[1].trim() : surfaceLabel;
        }
        return surfaceLabel; // Already just "Mesial"
      };

      const conditionColorMap: Record<string, ToothCondition> = {
        // Condition options (surface-specific)
        'Caries': 'caries',                                    // Ø£Ø­Ù…Ø±
        'Broken/Inappropriate Filling': 'broken',              // ÙˆØ±Ø¯ÙŠ
        'Pulpectomy': 'pulpectomy',                            // Ø¹Ù†Ø§Ø¨ÙŠ (Ø§Ù„Ø³Ø·Ø­ Ø§Ù„Ù…Ø®ØªØ§Ø± ÙÙ‚Ø·)
        'Follow-up': 'follow_up',                              // Ø£Ø²Ø±Ù‚
        'Needs More Diagnosis': 'needs_diagnosis',             // Ø¨Ø±ØªÙ‚Ø§Ù„ÙŠ
        'Temporary Filling': 'filling_replacement',            // Ø±Ù…Ø§Ø¯ÙŠ (Ø§Ù„Ø³Ø·Ø­ Ø§Ù„Ù…Ø®ØªØ§Ø± ÙÙ‚Ø·)
        'Permanent Filling': 'permanent_filling',              // Ø£Ø®Ø¶Ø± (Ø§Ù„Ø³Ø·Ø­ Ø§Ù„Ù…Ø®ØªØ§Ø± ÙÙ‚Ø·)
        'Fracture': 'fracture',
        'Restoration to Replace': 'filling_replacement',
        'Impacted': 'impacted',
      };

      // IMPORTANT: Separate delete and save operations to execute them sequentially
      // Delete operations MUST complete BEFORE save operations to prevent race conditions
      const deleteOperationPromises = [];
      const saveOperationPromises = [];

      // Process each pending planning record
      for (const record of pendingPlanningRecords) {
        const palmerNotation = convertNumberToPalmer(record.toothNumber);
        if (!palmerNotation) continue;

        console.log(`ðŸ” Processing record: ${record.condition}, surfaces:`, record.surfaces);

        // Get correct surface mapping for this tooth
        const surfaceMap = getSurfaceMap(record.toothNumber);

        // Map surface names directly to database surface names (no UI key conversion needed)
        const surfaceNameToDbSurface: Record<string, ToothSurface> = {
          'mesial': 'mesial',
          'distal': 'distal',
          'buccal': 'buccal',
          'lingual': 'lingual',
          'palatal': 'lingual',
          'occlusal': 'occlusal',
        };

        // Ø¥Ø°Ø§ ÙƒØ§Ù† ØªØºÙŠÙŠØ± Ù…Ù† Extraction Ø¥Ù„Ù‰ Ø´ÙŠØ¡ Ø¢Ø®Ø±ØŒ Ø§Ø­Ø°Ù "extraction" Ù…Ù† ÙƒÙ„ Ø§Ù„Ø£Ø³Ø·Ø­ Ø£ÙˆÙ„Ø§Ù‹
        if (record.isChange && record.previousCondition === 'Extraction') {
          console.log(`   Changing from Extraction â†’ clearing all surfaces first`);
          for (const surfaceKey of Object.keys(surfaceMap) as Array<keyof ToothSurfaceConditions>) {
            const dbSurface = surfaceMap[surfaceKey];
            deleteOperationPromises.push(
              deleteToothSurfaceCondition(permanentPatientId, palmerNotation, dbSurface)
            );
          }
        }

        // Handle Clear Condition (canceled)
        if (record.action === 'canceled') {
          // Delete colors for specified surfaces
          record.surfaces.forEach(surfaceLabel => {
            const surfaceName = extractSurfaceName(surfaceLabel);
            const dbSurface = surfaceNameToDbSurface[surfaceName.toLowerCase()];
            console.log(`  â†’ Clear: "${surfaceLabel}" â†’ surface:"${surfaceName}" â†’ dbSurface:"${dbSurface}"`);
            if (dbSurface) {
              deleteOperationPromises.push(
                deleteToothSurfaceCondition(permanentPatientId, palmerNotation, dbSurface)
              );
            }
          });
        }
        // Handle surface-specific diagnoses (Caries, Fracture, etc.)
        else if (record.condition && conditionColorMap[record.condition]) {
          const color = conditionColorMap[record.condition];
          record.surfaces.forEach(surfaceLabel => {
            const surfaceName = extractSurfaceName(surfaceLabel);
            const dbSurface = surfaceNameToDbSurface[surfaceName.toLowerCase()];
            console.log(`  â†’ ${record.condition}: "${surfaceLabel}" â†’ surface:"${surfaceName}" â†’ dbSurface:"${dbSurface}" â†’ color:"${color}"`);
            if (dbSurface) {
              saveOperationPromises.push(
                saveToothSurfaceCondition(permanentPatientId, palmerNotation, dbSurface, color)
              );
            }
          });
        }
        // Handle Extraction (Condition)
        else if (record.condition === 'Extraction') {
          console.log('  â†’ Extraction: saving "extraction" to all surfaces');
          for (const surfaceKey of Object.keys(surfaceMap) as Array<keyof ToothSurfaceConditions>) {
            const dbSurface = surfaceMap[surfaceKey];
            saveOperationPromises.push(
              saveToothSurfaceCondition(permanentPatientId, palmerNotation, dbSurface, 'extraction')
            );
          }
        }
        // Handle Missing Tooth (Tooth Status)
        else if (record.surfaces.includes('Missing Tooth')) {
          console.log('  â†’ Missing Tooth: saving "missing" to all surfaces');
          for (const surfaceKey of Object.keys(surfaceMap) as Array<keyof ToothSurfaceConditions>) {
            const dbSurface = surfaceMap[surfaceKey];
            saveOperationPromises.push(
              saveToothSurfaceCondition(permanentPatientId, palmerNotation, dbSurface, 'missing')
            );
          }
        }
        // Root Canal Treated: border color only, NO surface colors saved
        else if (record.surfaces.includes('Root Canal Treated')) {
          console.log('  â†’ Root Canal Treated: border color only (no surface colors saved)');
          // Do NOT save any surface conditions
          // Border color will be detected from planning_records on reload
        }
      }

      // STEP 1: Execute DELETE operations FIRST and wait for completion
      if (deleteOperationPromises.length > 0) {
        console.log(`ðŸ—‘ï¸ Executing ${deleteOperationPromises.length} delete operations...`);
        const deleteResults = await Promise.all(deleteOperationPromises);

        const deleteErrors = deleteResults.filter(r => r?.error);
        if (deleteErrors.length > 0) {
          console.error(' Some delete operations failed:', deleteErrors);
        } else {
          console.log(` All ${deleteOperationPromises.length} delete operations completed successfully`);
        }
      }

      // STEP 2: Execute SAVE operations AFTER deletes are complete
      if (saveOperationPromises.length > 0) {
        console.log(`ðŸ’¾ Executing ${saveOperationPromises.length} save operations...`);
        const saveResults = await Promise.all(saveOperationPromises);

        const saveErrors = saveResults.filter(r => r?.error);
        if (saveErrors.length > 0) {
          console.error(' Some save operations failed:', saveErrors);
        } else {
          console.log(` All ${saveOperationPromises.length} save operations completed successfully`);
        }
      }

      if (deleteOperationPromises.length === 0 && saveOperationPromises.length === 0) {
        console.log(' No surface conditions to save/delete');
      }

      // Step 3: Move pending records to allPlanningRecordsGlobal
      setAllPlanningRecordsGlobal(prev => [...prev, ...pendingPlanningRecords]);

      // Step 4: Clear pending records
      setPendingPlanningRecords([]);

      // Step 5: Show success message
      Alert.alert(' Ù†Ø¬Ø­', 'ØªÙ… Ø­ÙØ¸ Ø§Ù„ØªØ®Ø·ÙŠØ· Ø¨Ù†Ø¬Ø§Ø­!');

      // Step 6: Reload data to show updated Planning Records
      await loadPatientDentalData();

    } catch (error) {
      console.error(' Exception in handlePlanningSubmit:', error);
      Alert.alert('Ø®Ø·Ø£', 'Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø­ÙØ¸ Ø§Ù„ØªØ®Ø·ÙŠØ·.');
    }
  };

  /**
   * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   * Handle Planning Cancel - Discard all pending planning records
   * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   */
  const handlePlanningCancel = () => {
    if (pendingPlanningRecords.length === 0) {
      return;
    }

    Alert.alert(
      'Ø¥Ù„ØºØ§Ø¡ Ø§Ù„ØªØ®Ø·ÙŠØ·',
      'Ù‡Ù„ ØªØ±ÙŠØ¯ Ø¥Ù„ØºØ§Ø¡ ÙƒÙ„ Ø§Ù„ØªØ®Ø·ÙŠØ·Ø§Øª Ø§Ù„Ù…Ø¹Ù„Ù‚Ø©ØŸ',
      [
        { text: 'Ù„Ø§', style: 'cancel' },
        {
          text: 'Ù†Ø¹Ù…',
          style: 'destructive',
          onPress: async () => {
            console.log('ðŸ”´ Canceling planning session - clearing', pendingPlanningRecords.length, 'pending records');

            // Step 1: Remove pending planning records from toothRecords
            // (they were added locally but not saved to database)
            setToothRecords(prev => {
              const updated = { ...prev };

              // For each pending record, remove it from toothRecords
              pendingPlanningRecords.forEach(pendingRecord => {
                const toothNum = pendingRecord.toothNumber;
                if (updated[toothNum]) {
                  // Filter out records that match this pending record
                  updated[toothNum] = updated[toothNum].filter(record => {
                    if (record.type !== 'planning') return true;

                    // Remove if it matches the pending record
                    return !(
                      record.condition === pendingRecord.condition &&
                      record.timestampNum === pendingRecord.timestampNum
                    );
                  });

                  // If no records left for this tooth, remove the key
                  if (updated[toothNum].length === 0) {
                    delete updated[toothNum];
                  }
                }
              });

              return updated;
            });

            // Step 2: Clear pending records (this hides buttons)
            setPendingPlanningRecords([]);

            // Step 3: Clear selected surfaces
            setSelectedSurfaces({});

            // Step 4: Reload from database to restore saved state
            // This will replace toothConditions with saved data only
            await loadPatientDentalData();

            console.log(' Planning canceled - restored to saved state');
          }
        }
      ]
    );
  };

  /**
   * Handle closing condition menu - just close without removing anything
   */
  const handleConditionMenuClose = () => {
    // Just close the menu without removing anything
    // User didn't make any changes, so keep existing state
    setShowConditionMenu(false);
    setSelectedSurface(null);
  };

  // Function Ù„Ù„Ø­ØµÙˆÙ„ Ø¹Ù„Ù‰ ØªØ³Ù…ÙŠØ© Ø§Ù„Ø³Ù†
  const getToothLabel = (toothNumber: number): string => {
    if (toothNumber >= 25 && toothNumber <= 32) {
      const position = 33 - toothNumber; // 25â†’8, 26â†’7, 27â†’6, etc.
      return `lower right ${position}`;
    }
    if (toothNumber >= 17 && toothNumber <= 24) {
      const position = toothNumber - 16; // 17â†’1, 18â†’2, 19â†’3, etc.
      return `lower left ${position}`;
    }
    return `Ø§Ù„Ø³Ù† #${toothNumber}`;
  };

  // Function Ù„Ù„Ù†Ù‚Ø± Ø¹Ù„Ù‰ Ø§Ù„Ø³Ù† - ØªÙƒØ¨ÙŠØ±Ù‡ ÙˆØªØ¯ÙˆÙŠØ±Ù‡
  const handleToothPress = (toothNumber: number | string) => {
    // Ø§Ù„Ø³ÙŠÙ†Ø§Ø±ÙŠÙˆ Ø§Ù„Ø«Ø§Ù†ÙŠ: Ø¥Ø°Ø§ ÙƒØ§Ù† Edit Mode Ù†Ø´Ø·ØŒ Ù†Ø¹Ø±Ø¶ modal Ø§Ù„ØªÙØ§ØµÙŠÙ„ Ø¨Ø¯Ù„Ø§Ù‹ Ù…Ù† Ø§Ù„Ø§Ù†ÙŠÙ…ÙŠØ´Ù†
    console.log('handleToothPress - toothNumber:', toothNumber, 'isEditModeActive:', isEditModeActive);
    if (isEditModeActive) {
      console.log('Opening tooth details modal for tooth:', toothNumber);
      setSelectedToothForDetails(toothNumber);

      // Ø­ÙØ¸ Ø§Ù„Ù‚ÙŠÙ… Ø§Ù„Ø£ØµÙ„ÙŠØ© Ù‚Ø¨Ù„ ÙØªØ­ Ø§Ù„Ù…ÙˆØ¯Ø§Ù„
      setOriginalValues({
        treatment: selectedTreatments[toothNumber],
        details: selectedDetails[toothNumber],
        surfaces: selectedSurfaces[toothNumber] ? [...selectedSurfaces[toothNumber]] : []
      });

      setShowToothDetailsModal(true);
      setHasModalChanges(false); // Reset changes flag when opening modal
      setIsEditMode(false); // ØªØ¹Ø·ÙŠÙ„ ÙˆØ¶Ø¹ Ø§Ù„ØªØ¹Ø¯ÙŠÙ„ Ø¹Ù†Ø¯ Ø§Ù„ÙØªØ­
      setShowNotesSection(false); // Hide notes section by default
      setShowDetailsSection(true); // Show details section by default
      setShowRecordsSection(false); // Hide records section by default
      setRecordsType('editing'); // Reset records type to editing
      setCurrentNote(''); // Clear current note input

      // Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Treatment Ùˆ Details Ùˆ Referral Ø¥Ù„Ù‰ Select Ø¹Ù†Ø¯ ÙØªØ­ Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„
      setSelectedTreatments(prev => ({ ...prev, [toothNumber]: '' }));
      setSelectedDetails(prev => ({ ...prev, [toothNumber]: '' }));
      setSelectedReferralFor(prev => ({ ...prev, [toothNumber]: [] }));  // Empty array for multiple referrals
      return;
    }

    // Ø§Ù„Ø³ÙŠÙ†Ø§Ø±ÙŠÙˆ Ø§Ù„Ø£ÙˆÙ„: Ø§Ù„ÙˆØ¶Ø¹ Ø§Ù„Ø¹Ø§Ø¯ÙŠ (Ø§Ù†ÙŠÙ…ÙŠØ´Ù†)
    // Ø¥Ø°Ø§ ØªÙ… Ø§Ù„Ù†Ù‚Ø± Ø¹Ù„Ù‰ Ù†ÙØ³ Ø§Ù„Ø³Ù† Ø§Ù„Ù…ÙØªÙˆØ­ ÙˆÙ„ÙŠØ³ ÙÙŠ Ø­Ø§Ù„Ø© Ø¥ØºÙ„Ø§Ù‚ØŒ Ù†ØªØ¬Ø§Ù‡Ù„ (Ø§Ù„Ø³Ù† Ù…ÙØªÙˆØ­ Ø¨Ø§Ù„ÙØ¹Ù„)
    if (selectedTooth === toothNumber && !isClosing) return;

    // Ø¥Ø°Ø§ ØªÙ… Ø§Ù„Ù†Ù‚Ø± Ø¹Ù„Ù‰ Ù†ÙØ³ Ø§Ù„Ø³Ù† Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ø¥ØºÙ„Ø§Ù‚ØŒ Ù†ÙˆÙ‚Ù Ø§Ù„Ø¥ØºÙ„Ø§Ù‚ ÙˆÙ†ÙØªØ­Ù‡ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰
    if (selectedTooth === toothNumber && isClosing && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].includes(toothNumber)) {
      // Ø¥ÙŠÙ‚Ø§Ù Ø£Ù†ÙŠÙ…ÙŠØ´Ù† Ø§Ù„Ø¥ØºÙ„Ø§Ù‚ ÙÙˆØ±Ø§Ù‹
      stopToothAnimations(toothNumber);
      // Ø¥Ù„ØºØ§Ø¡ Ø­Ø§Ù„Ø© Ø§Ù„Ø¥ØºÙ„Ø§Ù‚
      setIsClosing(false);
      // ÙØªØ­ Ø§Ù„Ø³Ù† Ù…Ø±Ø© Ø£Ø®Ø±Ù‰
      openTooth(toothNumber);
      return;
    }

    // Ø¥Ø°Ø§ ÙƒØ§Ù† Ù‡Ù†Ø§Ùƒ Ø³Ù† Ø¢Ø®Ø± Ù…ÙØªÙˆØ­ (Ù…Ù† 1-32)
    if (selectedTooth && selectedTooth !== toothNumber && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].includes(selectedTooth)) {
      // Ø¥ÙŠÙ‚Ø§Ù Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø£Ù†ÙŠÙ…ÙŠØ´Ù†Ø§Øª Ù„Ù„Ø³Ù† Ø§Ù„Ù‚Ø¯ÙŠÙ… ÙÙˆØ±Ø§Ù‹
      stopToothAnimations(selectedTooth);
      // Ø¥Ù„ØºØ§Ø¡ Ø­Ø§Ù„Ø© Ø§Ù„Ø¥ØºÙ„Ø§Ù‚
      setIsClosing(false);
      // ÙØªØ­ Ø§Ù„Ø³Ù† Ø§Ù„Ø¬Ø¯ÙŠØ¯ Ù…Ø¨Ø§Ø´Ø±Ø©
      openTooth(toothNumber);
      return;
    }

    // ÙØªØ­ Ø§Ù„Ø³Ù† Ù…Ø¨Ø§Ø´Ø±Ø©
    openTooth(toothNumber);
  };

  // Function Ù„ÙØªØ­ Ø§Ù„Ø³Ù†
  const openTooth = (toothNumber: number) => {
    setSelectedTooth(toothNumber);
    setSelectedSurface(null);
    setShowConditionMenu(false);
    setIsClosing(false);

    // Ø¥Ø®ÙØ§Ø¡ Ø§Ù„Ø£Ø²Ø±Ø§Ø± (Edit, View, Oral Hygiene) ØªØ¯Ø±ÙŠØ¬ÙŠØ§Ù‹ Ø¹Ù†Ø¯ ÙØªØ­ Ø§Ù„Ø³Ù†
    Animated.timing(buttonsOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Animation: ØªÙƒØ¨ÙŠØ± Ø§Ù„Ø³Ù† ÙˆØªØ¯ÙˆÙŠØ±Ù‡ ÙˆÙ†Ù‚Ù„Ù‡ Ù„Ù„Ù…Ù†ØªØµÙ (Ù„Ù„Ø£Ø³Ù†Ø§Ù† 6 Ùˆ 7 Ùˆ 8)
    if (toothNumber === 6) {
      // Ø¥ÙŠÙ‚Ø§Ù Ø£ÙŠ Ø£Ù†ÙŠÙ…ÙŠØ´Ù†Ø§Øª Ù„Ù„Ø³Ù† 6
      tooth6Scale.stopAnimation();
      tooth6Rotation.stopAnimation();
      tooth6TranslateX.stopAnimation();
      tooth6TranslateY.stopAnimation();

      // Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ù‚ÙŠÙ…
      tooth6Scale.setValue(1);
      tooth6Rotation.setValue(0);
      tooth6TranslateX.setValue(0);
      tooth6TranslateY.setValue(0);

      // Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ÙˆØ¶Ø¹
      const pos = { right: 45, top: '30%', width: 37, height: 47 };
      const topPercent = parseFloat(pos.top) / 100;
      const toothCenterX = SCREEN_WIDTH - pos.right - pos.width/2;
      const toothCenterY = SCREEN_HEIGHT * topPercent + pos.height/2;
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX + 20;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth6Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth6Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth6TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth6TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 7) {
      // Ø¥ÙŠÙ‚Ø§Ù Ø£ÙŠ Ø£Ù†ÙŠÙ…ÙŠØ´Ù†Ø§Øª Ù„Ù„Ø³Ù† 7
      tooth7Scale.stopAnimation();
      tooth7Rotation.stopAnimation();
      tooth7TranslateX.stopAnimation();
      tooth7TranslateY.stopAnimation();

      // Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ù‚ÙŠÙ…
      tooth7Scale.setValue(1);
      tooth7Rotation.setValue(0);
      tooth7TranslateX.setValue(0);
      tooth7TranslateY.setValue(0);

      // Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ÙˆØ¶Ø¹
      const pos = { right: 45, top: '36%', width: 37, height: 47 };
      const topPercent = parseFloat(pos.top) / 100;
      const toothCenterX = SCREEN_WIDTH - pos.right - pos.width/2;
      const toothCenterY = SCREEN_HEIGHT * topPercent + pos.height/2;
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX + 20;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth7Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth7Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth7TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth7TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 8) {
      // Ø¥ÙŠÙ‚Ø§Ù Ø£ÙŠ Ø£Ù†ÙŠÙ…ÙŠØ´Ù†Ø§Øª Ù„Ù„Ø³Ù† 8
      tooth8Scale.stopAnimation();
      tooth8Rotation.stopAnimation();
      tooth8TranslateX.stopAnimation();
      tooth8TranslateY.stopAnimation();

      // Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ù‚ÙŠÙ…
      tooth8Scale.setValue(1);
      tooth8Rotation.setValue(0);
      tooth8TranslateX.setValue(0);
      tooth8TranslateY.setValue(0);

      // Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ÙˆØ¶Ø¹
      const pos = { right: 45, top: '42%', width: 37, height: 47 };
      const topPercent = parseFloat(pos.top) / 100;
      const toothCenterX = SCREEN_WIDTH - pos.right - pos.width/2;
      const toothCenterY = SCREEN_HEIGHT * topPercent + pos.height/2;
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX + 20;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth8Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth8Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth8TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth8TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 5) {
      // Ø¥ÙŠÙ‚Ø§Ù Ø£ÙŠ Ø£Ù†ÙŠÙ…ÙŠØ´Ù†Ø§Øª Ù„Ù„Ø³Ù† 5
      tooth5Scale.stopAnimation();
      tooth5Rotation.stopAnimation();
      tooth5TranslateX.stopAnimation();
      tooth5TranslateY.stopAnimation();

      // Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ù‚ÙŠÙ…
      tooth5Scale.setValue(1);
      tooth5Rotation.setValue(0);
      tooth5TranslateX.setValue(0);
      tooth5TranslateY.setValue(0);

      // Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ÙˆØ¶Ø¹
      const pos = { right: 55, top: '24%', width: 33, height: 42 };
      const topPercent = parseFloat(pos.top) / 100;
      const toothCenterX = SCREEN_WIDTH - pos.right - pos.width/2;
      const toothCenterY = SCREEN_HEIGHT * topPercent + pos.height/2;
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX + 20;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth5Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth5Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }), // 1 = interpolate to -90deg from -15deg
        Animated.spring(tooth5TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth5TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 4) {
      // Ø¥ÙŠÙ‚Ø§Ù Ø£ÙŠ Ø£Ù†ÙŠÙ…ÙŠØ´Ù†Ø§Øª Ù„Ù„Ø³Ù† 4
      tooth4Scale.stopAnimation();
      tooth4Rotation.stopAnimation();
      tooth4TranslateX.stopAnimation();
      tooth4TranslateY.stopAnimation();

      // Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ù‚ÙŠÙ…
      tooth4Scale.setValue(1);
      tooth4Rotation.setValue(0);
      tooth4TranslateX.setValue(0);
      tooth4TranslateY.setValue(0);

      // Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ÙˆØ¶Ø¹
      const pos = { right: 67, top: '18.5%', width: 33, height: 42 };
      const topPercent = parseFloat(pos.top) / 100;
      const toothCenterX = SCREEN_WIDTH - pos.right - pos.width/2;
      const toothCenterY = SCREEN_HEIGHT * topPercent + pos.height/2;
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX + 20;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth4Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth4Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }), // 1 = interpolate to -90deg from -20deg
        Animated.spring(tooth4TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth4TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 3) {
      // Ø¥ÙŠÙ‚Ø§Ù Ø£ÙŠ Ø£Ù†ÙŠÙ…ÙŠØ´Ù†Ø§Øª Ù„Ù„Ø³Ù† 3
      tooth3Scale.stopAnimation();
      tooth3Rotation.stopAnimation();
      tooth3TranslateX.stopAnimation();
      tooth3TranslateY.stopAnimation();

      // Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ù‚ÙŠÙ…
      tooth3Scale.setValue(1);
      tooth3Rotation.setValue(0);
      tooth3TranslateX.setValue(0);
      tooth3TranslateY.setValue(0);

      // Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ÙˆØ¶Ø¹
      const pos = { right: 90, top: '14%', width: 33, height: 42 };
      const topPercent = parseFloat(pos.top) / 100;
      const toothCenterX = SCREEN_WIDTH - pos.right - pos.width/2;
      const toothCenterY = SCREEN_HEIGHT * topPercent + pos.height/2;
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX + 20;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth3Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth3Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }), // 1 = interpolate to -90deg from -35deg
        Animated.spring(tooth3TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth3TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 2) {
      // Ø¥ÙŠÙ‚Ø§Ù Ø£ÙŠ Ø£Ù†ÙŠÙ…ÙŠØ´Ù†Ø§Øª Ù„Ù„Ø³Ù† 2
      tooth2Scale.stopAnimation();
      tooth2Rotation.stopAnimation();
      tooth2TranslateX.stopAnimation();
      tooth2TranslateY.stopAnimation();

      // Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ù‚ÙŠÙ…
      tooth2Scale.setValue(1);
      tooth2Rotation.setValue(0);
      tooth2TranslateX.setValue(0);
      tooth2TranslateY.setValue(0);

      // Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ÙˆØ¶Ø¹
      const pos = { right: 120, top: '10%', width: 33, height: 42 };
      const topPercent = parseFloat(pos.top) / 100;
      const toothCenterX = SCREEN_WIDTH - pos.right - pos.width/2;
      const toothCenterY = SCREEN_HEIGHT * topPercent + pos.height/2;
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX + 20;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth2Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth2Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }), // 1 = interpolate to -90deg from -60deg
        Animated.spring(tooth2TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth2TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 1) {
      // Ø¥ÙŠÙ‚Ø§Ù Ø£ÙŠ Ø£Ù†ÙŠÙ…ÙŠØ´Ù†Ø§Øª Ù„Ù„Ø³Ù† 1
      tooth1Scale.stopAnimation();
      tooth1Rotation.stopAnimation();
      tooth1TranslateX.stopAnimation();
      tooth1TranslateY.stopAnimation();

      // Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ù‚ÙŠÙ…
      tooth1Scale.setValue(1);
      tooth1Rotation.setValue(0);
      tooth1TranslateX.setValue(0);
      tooth1TranslateY.setValue(0);

      // Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ÙˆØ¶Ø¹
      const pos = { right: 160, top: '7.5%', width: 33, height: 42 };
      const topPercent = parseFloat(pos.top) / 100;
      const toothCenterX = SCREEN_WIDTH - pos.right - pos.width/2;
      const toothCenterY = SCREEN_HEIGHT * topPercent + pos.height/2;
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX + 20;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth1Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth1Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }), // 1 = interpolate to -90deg from -80deg
        Animated.spring(tooth1TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth1TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 32) {
      tooth32Scale.stopAnimation();
      tooth32Rotation.stopAnimation();
      tooth32TranslateX.stopAnimation();
      tooth32TranslateY.stopAnimation();

      tooth32Scale.setValue(1);
      tooth32Rotation.setValue(0);
      tooth32TranslateX.setValue(0);
      tooth32TranslateY.setValue(0);

      const pos = { left: 160, bottom: '7.5%', width: 33, height: 42 };
      const bottomPercent = parseFloat(pos.bottom) / 100;
      const toothCenterX = pos.left + pos.width/2;
      const toothCenterY = SCREEN_HEIGHT - (SCREEN_HEIGHT * bottomPercent + pos.height/2);
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth32Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth32Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth32TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth32TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 31) {
      tooth31Scale.stopAnimation();
      tooth31Rotation.stopAnimation();
      tooth31TranslateX.stopAnimation();
      tooth31TranslateY.stopAnimation();

      tooth31Scale.setValue(1);
      tooth31Rotation.setValue(0);
      tooth31TranslateX.setValue(0);
      tooth31TranslateY.setValue(0);

      const pos = { left: 120, bottom: '10%', width: 33, height: 42 };
      const bottomPercent = parseFloat(pos.bottom) / 100;
      const toothCenterX = pos.left + pos.width/2;
      const toothCenterY = SCREEN_HEIGHT - (SCREEN_HEIGHT * bottomPercent + pos.height/2);
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth31Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth31Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth31TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth31TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 30) {
      tooth30Scale.stopAnimation();
      tooth30Rotation.stopAnimation();
      tooth30TranslateX.stopAnimation();
      tooth30TranslateY.stopAnimation();

      tooth30Scale.setValue(1);
      tooth30Rotation.setValue(0);
      tooth30TranslateX.setValue(0);
      tooth30TranslateY.setValue(0);

      const pos = { left: 90, bottom: '14%', width: 33, height: 42 };
      const bottomPercent = parseFloat(pos.bottom) / 100;
      const toothCenterX = pos.left + pos.width/2;
      const toothCenterY = SCREEN_HEIGHT - (SCREEN_HEIGHT * bottomPercent + pos.height/2);
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth30Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth30Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth30TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth30TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 29) {
      tooth29Scale.stopAnimation();
      tooth29Rotation.stopAnimation();
      tooth29TranslateX.stopAnimation();
      tooth29TranslateY.stopAnimation();

      tooth29Scale.setValue(1);
      tooth29Rotation.setValue(0);
      tooth29TranslateX.setValue(0);
      tooth29TranslateY.setValue(0);

      const pos = { left: 67, bottom: '18.5%', width: 33, height: 42 };
      const bottomPercent = parseFloat(pos.bottom) / 100;
      const toothCenterX = pos.left + pos.width/2;
      const toothCenterY = SCREEN_HEIGHT - (SCREEN_HEIGHT * bottomPercent + pos.height/2);
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth29Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth29Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth29TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth29TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 28) {
      tooth28Scale.stopAnimation();
      tooth28Rotation.stopAnimation();
      tooth28TranslateX.stopAnimation();
      tooth28TranslateY.stopAnimation();

      tooth28Scale.setValue(1);
      tooth28Rotation.setValue(0);
      tooth28TranslateX.setValue(0);
      tooth28TranslateY.setValue(0);

      const pos = { left: 55, bottom: '24%', width: 33, height: 42 };
      const bottomPercent = parseFloat(pos.bottom) / 100;
      const toothCenterX = pos.left + pos.width/2;
      const toothCenterY = SCREEN_HEIGHT - (SCREEN_HEIGHT * bottomPercent + pos.height/2);
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth28Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth28Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth28TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth28TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 27) {
      tooth27Scale.stopAnimation();
      tooth27Rotation.stopAnimation();
      tooth27TranslateX.stopAnimation();
      tooth27TranslateY.stopAnimation();

      tooth27Scale.setValue(1);
      tooth27Rotation.setValue(0);
      tooth27TranslateX.setValue(0);
      tooth27TranslateY.setValue(0);

      const pos = { left: 45, bottom: '30%', width: 37, height: 47 };
      const bottomPercent = parseFloat(pos.bottom) / 100;
      const toothCenterX = pos.left + pos.width/2;
      const toothCenterY = SCREEN_HEIGHT - (SCREEN_HEIGHT * bottomPercent + pos.height/2);
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth27Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth27Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth27TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth27TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 26) {
      tooth26Scale.stopAnimation();
      tooth26Rotation.stopAnimation();
      tooth26TranslateX.stopAnimation();
      tooth26TranslateY.stopAnimation();

      tooth26Scale.setValue(1);
      tooth26Rotation.setValue(0);
      tooth26TranslateX.setValue(0);
      tooth26TranslateY.setValue(0);

      const pos = { left: 45, bottom: '36%', width: 37, height: 47 };
      const bottomPercent = parseFloat(pos.bottom) / 100;
      const toothCenterX = pos.left + pos.width/2;
      const toothCenterY = SCREEN_HEIGHT - (SCREEN_HEIGHT * bottomPercent + pos.height/2);
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth26Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth26Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth26TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth26TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 25) {
      tooth25Scale.stopAnimation();
      tooth25Rotation.stopAnimation();
      tooth25TranslateX.stopAnimation();
      tooth25TranslateY.stopAnimation();

      tooth25Scale.setValue(1);
      tooth25Rotation.setValue(0);
      tooth25TranslateX.setValue(0);
      tooth25TranslateY.setValue(0);

      const pos = { left: 45, bottom: '42%', width: 37, height: 47 };
      const bottomPercent = parseFloat(pos.bottom) / 100;
      const toothCenterX = pos.left + pos.width/2;
      const toothCenterY = SCREEN_HEIGHT - (SCREEN_HEIGHT * bottomPercent + pos.height/2);
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth25Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth25Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth25TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth25TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 9) {
      tooth9Scale.stopAnimation();
      tooth9Rotation.stopAnimation();
      tooth9TranslateX.stopAnimation();
      tooth9TranslateY.stopAnimation();

      tooth9Scale.setValue(1);
      tooth9Rotation.setValue(0);
      tooth9TranslateX.setValue(0);
      tooth9TranslateY.setValue(0);

      const pos = { left: 45, top: '42%', width: 37, height: 47 };
      const topPercent = parseFloat(pos.top) / 100;
      const toothCenterX = pos.left + pos.width/2;
      const toothCenterY = SCREEN_HEIGHT * topPercent + pos.height/2;
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth9Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth9Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth9TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth9TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 10) {
      tooth10Scale.stopAnimation();
      tooth10Rotation.stopAnimation();
      tooth10TranslateX.stopAnimation();
      tooth10TranslateY.stopAnimation();

      tooth10Scale.setValue(1);
      tooth10Rotation.setValue(0);
      tooth10TranslateX.setValue(0);
      tooth10TranslateY.setValue(0);

      const pos = { left: 45, top: '36%', width: 37, height: 47 };
      const topPercent = parseFloat(pos.top) / 100;
      const toothCenterX = pos.left + pos.width/2;
      const toothCenterY = SCREEN_HEIGHT * topPercent + pos.height/2;
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth10Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth10Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth10TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth10TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 11) {
      tooth11Scale.stopAnimation();
      tooth11Rotation.stopAnimation();
      tooth11TranslateX.stopAnimation();
      tooth11TranslateY.stopAnimation();

      tooth11Scale.setValue(1);
      tooth11Rotation.setValue(0);
      tooth11TranslateX.setValue(0);
      tooth11TranslateY.setValue(0);

      const pos = { left: 45, top: '30%', width: 37, height: 47 };
      const topPercent = parseFloat(pos.top) / 100;
      const toothCenterX = pos.left + pos.width/2;
      const toothCenterY = SCREEN_HEIGHT * topPercent + pos.height/2;
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth11Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth11Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth11TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth11TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 12) {
      tooth12Scale.stopAnimation();
      tooth12Rotation.stopAnimation();
      tooth12TranslateX.stopAnimation();
      tooth12TranslateY.stopAnimation();

      tooth12Scale.setValue(1);
      tooth12Rotation.setValue(0);
      tooth12TranslateX.setValue(0);
      tooth12TranslateY.setValue(0);

      const pos = { left: 55, top: '24%', width: 33, height: 42 };
      const topPercent = parseFloat(pos.top) / 100;
      const toothCenterX = pos.left + pos.width/2;
      const toothCenterY = SCREEN_HEIGHT * topPercent + pos.height/2;
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth12Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth12Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth12TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth12TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 13) {
      tooth13Scale.stopAnimation();
      tooth13Rotation.stopAnimation();
      tooth13TranslateX.stopAnimation();
      tooth13TranslateY.stopAnimation();

      tooth13Scale.setValue(1);
      tooth13Rotation.setValue(0);
      tooth13TranslateX.setValue(0);
      tooth13TranslateY.setValue(0);

      const pos = { left: 67, top: '18.5%', width: 33, height: 42 };
      const topPercent = parseFloat(pos.top) / 100;
      const toothCenterX = pos.left + pos.width/2;
      const toothCenterY = SCREEN_HEIGHT * topPercent + pos.height/2;
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth13Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth13Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth13TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth13TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 14) {
      tooth14Scale.stopAnimation();
      tooth14Rotation.stopAnimation();
      tooth14TranslateX.stopAnimation();
      tooth14TranslateY.stopAnimation();

      tooth14Scale.setValue(1);
      tooth14Rotation.setValue(0);
      tooth14TranslateX.setValue(0);
      tooth14TranslateY.setValue(0);

      const pos = { left: 90, top: '14%', width: 33, height: 42 };
      const topPercent = parseFloat(pos.top) / 100;
      const toothCenterX = pos.left + pos.width/2;
      const toothCenterY = SCREEN_HEIGHT * topPercent + pos.height/2;
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth14Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth14Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth14TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth14TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 15) {
      tooth15Scale.stopAnimation();
      tooth15Rotation.stopAnimation();
      tooth15TranslateX.stopAnimation();
      tooth15TranslateY.stopAnimation();

      tooth15Scale.setValue(1);
      tooth15Rotation.setValue(0);
      tooth15TranslateX.setValue(0);
      tooth15TranslateY.setValue(0);

      const pos = { left: 120, top: '10%', width: 33, height: 42 };
      const topPercent = parseFloat(pos.top) / 100;
      const toothCenterX = pos.left + pos.width/2;
      const toothCenterY = SCREEN_HEIGHT * topPercent + pos.height/2;
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth15Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth15Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth15TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth15TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 16) {
      tooth16Scale.stopAnimation();
      tooth16Rotation.stopAnimation();
      tooth16TranslateX.stopAnimation();
      tooth16TranslateY.stopAnimation();

      tooth16Scale.setValue(1);
      tooth16Rotation.setValue(0);
      tooth16TranslateX.setValue(0);
      tooth16TranslateY.setValue(0);

      const pos = { left: 160, top: '7.5%', width: 33, height: 42 };
      const topPercent = parseFloat(pos.top) / 100;
      const toothCenterX = pos.left + pos.width/2;
      const toothCenterY = SCREEN_HEIGHT * topPercent + pos.height/2;
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth16Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth16Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth16TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth16TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 17) {
      tooth17Scale.stopAnimation();
      tooth17Rotation.stopAnimation();
      tooth17TranslateX.stopAnimation();
      tooth17TranslateY.stopAnimation();

      tooth17Scale.setValue(1);
      tooth17Rotation.setValue(0);
      tooth17TranslateX.setValue(0);
      tooth17TranslateY.setValue(0);

      const pos = { right: 160, bottom: '7.5%', width: 33, height: 42 };
      const bottomPercent = parseFloat(pos.bottom) / 100;
      const toothCenterX = SCREEN_WIDTH - (pos.right + pos.width/2);
      const toothCenterY = SCREEN_HEIGHT - (SCREEN_HEIGHT * bottomPercent + pos.height/2);
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX + 20;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth17Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth17Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth17TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth17TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 18) {
      tooth18Scale.stopAnimation();
      tooth18Rotation.stopAnimation();
      tooth18TranslateX.stopAnimation();
      tooth18TranslateY.stopAnimation();

      tooth18Scale.setValue(1);
      tooth18Rotation.setValue(0);
      tooth18TranslateX.setValue(0);
      tooth18TranslateY.setValue(0);

      const pos = { right: 120, bottom: '10%', width: 33, height: 42 };
      const bottomPercent = parseFloat(pos.bottom) / 100;
      const toothCenterX = SCREEN_WIDTH - (pos.right + pos.width/2);
      const toothCenterY = SCREEN_HEIGHT - (SCREEN_HEIGHT * bottomPercent + pos.height/2);
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX + 20;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth18Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth18Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth18TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth18TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 19) {
      tooth19Scale.stopAnimation();
      tooth19Rotation.stopAnimation();
      tooth19TranslateX.stopAnimation();
      tooth19TranslateY.stopAnimation();

      tooth19Scale.setValue(1);
      tooth19Rotation.setValue(0);
      tooth19TranslateX.setValue(0);
      tooth19TranslateY.setValue(0);

      const pos = { right: 90, bottom: '14%', width: 33, height: 42 };
      const bottomPercent = parseFloat(pos.bottom) / 100;
      const toothCenterX = SCREEN_WIDTH - (pos.right + pos.width/2);
      const toothCenterY = SCREEN_HEIGHT - (SCREEN_HEIGHT * bottomPercent + pos.height/2);
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX + 20;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth19Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth19Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth19TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth19TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 20) {
      tooth20Scale.stopAnimation();
      tooth20Rotation.stopAnimation();
      tooth20TranslateX.stopAnimation();
      tooth20TranslateY.stopAnimation();

      tooth20Scale.setValue(1);
      tooth20Rotation.setValue(0);
      tooth20TranslateX.setValue(0);
      tooth20TranslateY.setValue(0);

      const pos = { right: 67, bottom: '18.5%', width: 33, height: 42 };
      const bottomPercent = parseFloat(pos.bottom) / 100;
      const toothCenterX = SCREEN_WIDTH - (pos.right + pos.width/2);
      const toothCenterY = SCREEN_HEIGHT - (SCREEN_HEIGHT * bottomPercent + pos.height/2);
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX + 20;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth20Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth20Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth20TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth20TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 21) {
      tooth21Scale.stopAnimation();
      tooth21Rotation.stopAnimation();
      tooth21TranslateX.stopAnimation();
      tooth21TranslateY.stopAnimation();

      tooth21Scale.setValue(1);
      tooth21Rotation.setValue(0);
      tooth21TranslateX.setValue(0);
      tooth21TranslateY.setValue(0);

      const pos = { right: 55, bottom: '24%', width: 33, height: 42 };
      const bottomPercent = parseFloat(pos.bottom) / 100;
      const toothCenterX = SCREEN_WIDTH - (pos.right + pos.width/2);
      const toothCenterY = SCREEN_HEIGHT - (SCREEN_HEIGHT * bottomPercent + pos.height/2);
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX + 20;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth21Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth21Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth21TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth21TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 22) {
      tooth22Scale.stopAnimation();
      tooth22Rotation.stopAnimation();
      tooth22TranslateX.stopAnimation();
      tooth22TranslateY.stopAnimation();

      tooth22Scale.setValue(1);
      tooth22Rotation.setValue(0);
      tooth22TranslateX.setValue(0);
      tooth22TranslateY.setValue(0);

      const pos = { right: 45, bottom: '30%', width: 37, height: 47 };
      const bottomPercent = parseFloat(pos.bottom) / 100;
      const toothCenterX = SCREEN_WIDTH - (pos.right + pos.width/2);
      const toothCenterY = SCREEN_HEIGHT - (SCREEN_HEIGHT * bottomPercent + pos.height/2);
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX + 20;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth22Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth22Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth22TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth22TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 23) {
      tooth23Scale.stopAnimation();
      tooth23Rotation.stopAnimation();
      tooth23TranslateX.stopAnimation();
      tooth23TranslateY.stopAnimation();

      tooth23Scale.setValue(1);
      tooth23Rotation.setValue(0);
      tooth23TranslateX.setValue(0);
      tooth23TranslateY.setValue(0);

      const pos = { right: 45, bottom: '36%', width: 37, height: 47 };
      const bottomPercent = parseFloat(pos.bottom) / 100;
      const toothCenterX = SCREEN_WIDTH - (pos.right + pos.width/2);
      const toothCenterY = SCREEN_HEIGHT - (SCREEN_HEIGHT * bottomPercent + pos.height/2);
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX + 20;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth23Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth23Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth23TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth23TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    } else if (toothNumber === 24) {
      tooth24Scale.stopAnimation();
      tooth24Rotation.stopAnimation();
      tooth24TranslateX.stopAnimation();
      tooth24TranslateY.stopAnimation();

      tooth24Scale.setValue(1);
      tooth24Rotation.setValue(0);
      tooth24TranslateX.setValue(0);
      tooth24TranslateY.setValue(0);

      const pos = { right: 45, bottom: '42%', width: 37, height: 47 };
      const bottomPercent = parseFloat(pos.bottom) / 100;
      const toothCenterX = SCREEN_WIDTH - (pos.right + pos.width/2);
      const toothCenterY = SCREEN_HEIGHT - (SCREEN_HEIGHT * bottomPercent + pos.height/2);
      const screenCenterX = SCREEN_WIDTH / 2;
      const screenCenterY = SCREEN_HEIGHT / 2;
      const moveX = screenCenterX - toothCenterX + 20;
      const moveY = screenCenterY - toothCenterY;

      Animated.parallel([
        Animated.spring(tooth24Scale, { toValue: 8, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth24Rotation, { toValue: 1, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth24TranslateX, { toValue: moveX, useNativeDriver: true, friction: 8, tension: 40 }),
        Animated.spring(tooth24TranslateY, { toValue: moveY, useNativeDriver: true, friction: 8, tension: 40 }),
      ]).start();
    }
  };

  // Function Ù„Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„Ø³Ù† Ø§Ù„Ù…ÙƒØ¨Ø±
  const handleCloseTooth = () => {
    if (!selectedTooth) return;

    setIsClosing(true);

    // Ø¥Ø¸Ù‡Ø§Ø± Ø§Ù„Ø£Ø²Ø±Ø§Ø± (Edit, View, Oral Hygiene) Ù…Ø¨Ø§Ø´Ø±Ø© Ø¹Ù†Ø¯ Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„Ø³Ù†
    Animated.timing(buttonsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();

    // Ø§Ù„Ø¹ÙˆØ¯Ø© Ø¥Ù„Ù‰ Ø§Ù„Ø­Ø¬Ù… ÙˆØ§Ù„Ø²Ø§ÙˆÙŠØ© ÙˆØ§Ù„Ù…ÙˆØ¶Ø¹ Ø§Ù„Ø£ØµÙ„ÙŠ Ø­Ø³Ø¨ Ø§Ù„Ø³Ù†
    if (selectedTooth === 6) {
      Animated.parallel([
        Animated.spring(tooth6Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth6Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth6TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth6TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 7) {
      Animated.parallel([
        Animated.spring(tooth7Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth7Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth7TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth7TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 8) {
      Animated.parallel([
        Animated.spring(tooth8Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth8Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth8TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth8TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 5) {
      Animated.parallel([
        Animated.spring(tooth5Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth5Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth5TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth5TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 4) {
      Animated.parallel([
        Animated.spring(tooth4Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth4Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth4TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth4TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 3) {
      Animated.parallel([
        Animated.spring(tooth3Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth3Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth3TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth3TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 2) {
      Animated.parallel([
        Animated.spring(tooth2Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth2Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth2TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth2TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 1) {
      Animated.parallel([
        Animated.spring(tooth1Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth1Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth1TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth1TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 32) {
      Animated.parallel([
        Animated.spring(tooth32Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth32Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth32TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth32TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 31) {
      Animated.parallel([
        Animated.spring(tooth31Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth31Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth31TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth31TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 30) {
      Animated.parallel([
        Animated.spring(tooth30Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth30Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth30TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth30TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 29) {
      Animated.parallel([
        Animated.spring(tooth29Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth29Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth29TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth29TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 28) {
      Animated.parallel([
        Animated.spring(tooth28Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth28Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth28TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth28TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 27) {
      Animated.parallel([
        Animated.spring(tooth27Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth27Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth27TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth27TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 26) {
      Animated.parallel([
        Animated.spring(tooth26Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth26Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth26TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth26TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 25) {
      Animated.parallel([
        Animated.spring(tooth25Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth25Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth25TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth25TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 9) {
      Animated.parallel([
        Animated.spring(tooth9Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth9Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth9TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth9TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 10) {
      Animated.parallel([
        Animated.spring(tooth10Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth10Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth10TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth10TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 11) {
      Animated.parallel([
        Animated.spring(tooth11Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth11Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth11TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth11TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 12) {
      Animated.parallel([
        Animated.spring(tooth12Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth12Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth12TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth12TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 13) {
      Animated.parallel([
        Animated.spring(tooth13Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth13Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth13TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth13TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 14) {
      Animated.parallel([
        Animated.spring(tooth14Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth14Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth14TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth14TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 15) {
      Animated.parallel([
        Animated.spring(tooth15Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth15Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth15TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth15TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 16) {
      Animated.parallel([
        Animated.spring(tooth16Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth16Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth16TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth16TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 17) {
      Animated.parallel([
        Animated.spring(tooth17Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth17Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth17TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth17TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 18) {
      Animated.parallel([
        Animated.spring(tooth18Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth18Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth18TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth18TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 19) {
      Animated.parallel([
        Animated.spring(tooth19Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth19Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth19TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth19TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 20) {
      Animated.parallel([
        Animated.spring(tooth20Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth20Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth20TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth20TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 21) {
      Animated.parallel([
        Animated.spring(tooth21Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth21Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth21TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth21TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 22) {
      Animated.parallel([
        Animated.spring(tooth22Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth22Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth22TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth22TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 23) {
      Animated.parallel([
        Animated.spring(tooth23Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth23Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth23TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth23TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else if (selectedTooth === 24) {
      Animated.parallel([
        Animated.spring(tooth24Scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth24Rotation, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth24TranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(tooth24TranslateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start(() => {
        setSelectedTooth(null);
        setSelectedSurface(null);
        setShowConditionMenu(false);
        setIsClosing(false);
      });
    } else {
      // Ù„Ø¨Ø§Ù‚ÙŠ Ø§Ù„Ø£Ø³Ù†Ø§Ù† (Modal system)
      setSelectedTooth(null);
      setSelectedSurface(null);
      setShowConditionMenu(false);
      setIsClosing(false);
    }
  };

  // Function Ù„Ù„Ù†Ù‚Ø± Ø¹Ù„Ù‰ Ø³Ø·Ø­ Ø§Ù„Ø³Ù†
  const handleSurfacePress = (surface: keyof ToothSurfaceConditions) => {
    setSelectedSurface(surface);
    setShowConditionMenu(true);
  };

  // Ø¯Ø§Ù„Ø© Ù„Ø­ÙØ¸/ØªØ­Ø¯ÙŠØ« Tooth Status Record ÙˆØ§Ø­Ø¯ Ù„Ø¬Ù…ÙŠØ¹ Ø­Ø§Ù„Ø§Øª Ø§Ù„Ø³Ù†
  const updateToothStatusRecord = (toothNumber: number) => {
    // ØªÙ… ØªØ¹Ø·ÙŠÙ„ Ù‡Ø°Ù‡ Ø§Ù„Ø¯Ø§Ù„Ø© Ù„Ø£Ù† Ø§Ù„Ø³Ø¬Ù„Ø§Øª ØªÙØ¶Ø§Ù Ø§Ù„Ø¢Ù† Ù…Ø¨Ø§Ø´Ø±Ø©Ù‹ ÙÙŠ handleConditionSelect
    // Ù‡Ø°Ø§ ÙŠÙ…Ù†Ø¹ Ø­Ø°Ù Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø© Ø¹Ù†Ø¯ Ø¥Ø¶Ø§ÙØ© Ø³Ø¬Ù„Ø§Øª Ø¬Ø¯ÙŠØ¯Ø©
  };

  // Ø¯Ø§Ù„Ø© Ù„Ø­ÙØ¸/ØªØ­Ø¯ÙŠØ« Diagnosed Conditions Record ÙˆØ§Ø­Ø¯ Ù„Ø¬Ù…ÙŠØ¹ Ø­Ø§Ù„Ø§Øª Ø§Ù„Ø³Ù†
  const updateDiagnosedConditionsRecord = (toothNumber: number) => {
    // ØªÙ… ØªØ¹Ø·ÙŠÙ„ Ù‡Ø°Ù‡ Ø§Ù„Ø¯Ø§Ù„Ø© Ù„Ø£Ù† Ø§Ù„Ø³Ø¬Ù„Ø§Øª ØªÙØ¶Ø§Ù Ø§Ù„Ø¢Ù† Ù…Ø¨Ø§Ø´Ø±Ø©Ù‹ ÙÙŠ handleConditionSelect
    // Ù‡Ø°Ø§ ÙŠÙ…Ù†Ø¹ Ø­Ø°Ù Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø© Ø¹Ù†Ø¯ Ø¥Ø¶Ø§ÙØ© Ø³Ø¬Ù„Ø§Øª Ø¬Ø¯ÙŠØ¯Ø©
  };

  // Function Ù„Ø§Ø®ØªÙŠØ§Ø± Ø­Ø§Ù„Ø© Ù„Ù„Ø³Ø·Ø­
  const handleConditionSelect = (condition: ToothCondition) => {
    if (selectedTooth && selectedSurface) {
      // Ø¥Ø°Ø§ ÙƒØ§Ù†Øª Ø§Ù„Ø­Ø§Ù„Ø© treatedØŒ Ù‚Ù… Ø¨ØªÙ„ÙˆÙŠÙ† Ø§Ù„Ø­Ø¯ÙˆØ¯ ÙÙ‚Ø·
      if (condition === 'treated') {
        console.log(`ðŸ¦· Setting border color for tooth ${selectedTooth} to 'treated' (Root Canal Treated)`);
        setToothBorderColors(prev => ({
          ...prev,
          [selectedTooth]: 'treated',
        }));

        // Ø¥Ø¶Ø§ÙØ© Ø³Ø¬Ù„ Ù„Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ø¹Ù„Ù‚Ø© (Pending) Ùˆ toothRecords
        const now = new Date();
        const timestamp = now.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        const timestampNum = now.getTime() + Math.random() * 0.999;

        const newRecord = {
          type: 'planning' as const,
          action: 'diagnosed' as const,
          condition: 'Tooth Status',
          surfaces: ['Root Canal Treated'],
          timestamp,
          timestampNum,
          doctorName: user?.name || 'Dr. Unknown',
          isChange: undefined,
          previousCondition: undefined
        };

        // Ø§Ø³ØªØ¨Ø¯Ø§Ù„ Ø§Ù„Ø³Ø¬Ù„ Ø§Ù„Ø³Ø§Ø¨Ù‚ (Whole tooth status)
        setPendingPlanningRecords(prev => {
          // Remove any existing Tooth Status record for this tooth
          const filtered = prev.filter(record =>
            record.toothNumber !== selectedTooth ||
            record.condition !== 'Tooth Status'
          );

          return [
            ...filtered,
            {
              toothNumber: selectedTooth,
              ...newRecord
            }
          ];
        });

        // Ø§Ø³ØªØ¨Ø¯Ø§Ù„ ÙÙŠ toothRecords Ø£ÙŠØ¶Ø§Ù‹
        setToothRecords(prev => {
          const existingRecords = prev[selectedTooth] || [];
          const filtered = existingRecords.filter(record =>
            record.type !== 'planning' ||
            record.condition !== 'Tooth Status'
          );

          return {
            ...prev,
            [selectedTooth]: [
              ...filtered,
              newRecord
            ]
          };
        });

        setHasModalChanges(true);
        setShowConditionMenu(false);
        return;
      }

      // Ø¥Ø°Ø§ ÙƒØ§Ù†Øª Ø§Ù„Ø­Ø§Ù„Ø© missingØŒ Ù‚Ù… Ø¨ØªÙ„ÙˆÙŠÙ† Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø£Ø³Ø·Ø­
      if (condition === 'missing') {
        setToothConditions(prev => ({
          ...prev,
          [selectedTooth]: {
            top: condition,
            bottom: condition,
            left: condition,
            right: condition,
            center: condition,
          },
        }));

        // Ø¥Ø¶Ø§ÙØ© Ø³Ø¬Ù„ Ù„Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ø¹Ù„Ù‚Ø© (Pending) Ùˆ toothRecords
        const now = new Date();
        const timestamp = now.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        const timestampNum = now.getTime() + Math.random() * 0.999;

        const newRecord = {
          type: 'planning' as const,
          action: 'diagnosed' as const,
          condition: 'Tooth Status',
          surfaces: ['Missing Tooth'],
          timestamp,
          timestampNum,
          doctorName: user?.name || 'Dr. Unknown',
          isChange: undefined,
          previousCondition: undefined
        };

        // Ø§Ø³ØªØ¨Ø¯Ø§Ù„ Ø§Ù„Ø³Ø¬Ù„ Ø§Ù„Ø³Ø§Ø¨Ù‚ (Whole tooth status)
        setPendingPlanningRecords(prev => {
          const filtered = prev.filter(record =>
            record.toothNumber !== selectedTooth ||
            record.condition !== 'Tooth Status'
          );

          return [
            ...filtered,
            {
              toothNumber: selectedTooth,
              ...newRecord
            }
          ];
        });

        // Ø§Ø³ØªØ¨Ø¯Ø§Ù„ ÙÙŠ toothRecords Ø£ÙŠØ¶Ø§Ù‹
        setToothRecords(prev => {
          const existingRecords = prev[selectedTooth] || [];
          const filtered = existingRecords.filter(record =>
            record.type !== 'planning' ||
            record.condition !== 'Tooth Status'
          );

          return {
            ...prev,
            [selectedTooth]: [
              ...filtered,
              newRecord
            ]
          };
        });

        setHasModalChanges(true);
      }
      // Ø¥Ø°Ø§ ÙƒØ§Ù†Øª Ø§Ù„Ø­Ø§Ù„Ø© extraction (Condition - ÙŠØ­ÙØ¸ Record ÙÙˆØ±Ø§Ù‹)
      else if (condition === 'extraction') {
        setToothConditions(prev => ({
          ...prev,
          [selectedTooth]: {
            top: condition,
            bottom: condition,
            left: condition,
            right: condition,
            center: condition,
          },
        }));

        // Ø­ÙØ¸ planning record Ù„Ù€ Extraction
        const now = new Date();
        const timestamp = now.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const conditionName = getConditionName(condition);
        const timestampNum = now.getTime() + Math.random() * 0.999;

        const newRecord = {
          type: 'planning' as const,
          action: 'diagnosed' as const,
          condition: conditionName.english,
          surfaces: ['All surfaces'],
          timestamp,
          timestampNum,
          doctorName: user?.name || 'Dr. Unknown',
          isChange: undefined,
          previousCondition: undefined
        };

        // Ø§Ø³ØªØ¨Ø¯Ø§Ù„ Ø§Ù„Ø³Ø¬Ù„ Ø§Ù„Ø³Ø§Ø¨Ù‚ (Whole tooth - Extraction)
        setToothRecords(prev => {
          const existingRecords = prev[selectedTooth] || [];
          const filtered = existingRecords.filter(record =>
            record.type !== 'planning' ||
            record.condition !== conditionName.english
          );

          return {
            ...prev,
            [selectedTooth]: [
              ...filtered,
              newRecord
            ]
          };
        });

        // Ø§Ø³ØªØ¨Ø¯Ø§Ù„ ÙÙŠ pendingPlanningRecords Ø£ÙŠØ¶Ø§Ù‹
        setPendingPlanningRecords(prev => {
          const filtered = prev.filter(record =>
            record.toothNumber !== selectedTooth ||
            record.condition !== conditionName.english
          );

          return [
            ...filtered,
            {
              toothNumber: selectedTooth,
              ...newRecord
            }
          ];
        });

      } else if (condition === 'CLEAR_TOOTH_STATUS' as any) {
        // Ø¥Ø°Ø§ ÙƒØ§Ù† Clear Condition Ù…Ù† Ù‚Ø§Ø¦Ù…Ø© Tooth Status - Ø§Ø­Ø°Ù border + ÙƒÙ„ Ø§Ù„Ø£Ø³Ø·Ø­
        if (!selectedTooth) {
          console.error(' Invalid tooth number:', selectedTooth);
          return;
        }

        console.log('ðŸ§¹ Clear Tooth Status: Clearing border + all surfaces for tooth', selectedTooth);

        // Ø¥Ø²Ø§Ù„Ø© Ù„ÙˆÙ† Ø§Ù„Ø­Ø¯ÙˆØ¯
        setToothBorderColors(prev => {
          const newBorderColors = { ...prev };
          delete newBorderColors[selectedTooth];
          return newBorderColors;
        });

        // Ø¥Ø²Ø§Ù„Ø© Ø§Ù„Ù„ÙˆÙ† Ù…Ù† Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø£Ø³Ø·Ø­
        setToothConditions(prev => ({
          ...prev,
          [selectedTooth]: {
            top: null,
            bottom: null,
            left: null,
            right: null,
            center: null,
          },
        }));

        // Ø­ÙØ¸ planning record Ø¹Ù†Ø¯ Ø¥Ù„ØºØ§Ø¡ Ø§Ù„Ø­Ø§Ù„Ø©
        const now = new Date();
        const timestamp = now.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const surfaceOptions = getAllSurfaces(selectedTooth);
        const surface = surfaceOptions.find(opt => opt.key === selectedSurface);
        const surfaceLabel = surface?.label || selectedSurface;
        const timestampNum = now.getTime() + Math.random() * 0.999;

        const newRecord = {
          type: 'planning' as const,
          action: 'canceled' as const,
          condition: '',
          surfaces: [surfaceLabel],
          timestamp,
          timestampNum,
          toothNumber: selectedTooth,
          doctorName: user?.name || 'Dr. Unknown',
          isChange: undefined,
          previousCondition: undefined
        };

        setToothRecords(prev => {
          const existingRecords = prev[selectedTooth] || [];
          const filtered = existingRecords.filter(record => {
            if (record.type !== 'planning') return true;
            const recordSurface = record.surfaces.find(s => s.includes(`(${surfaceLabel})`));
            return !recordSurface;
          });

          return {
            ...prev,
            [selectedTooth]: [
              ...filtered,
              newRecord
            ]
          };
        });

        setPendingPlanningRecords(prev => [...prev, newRecord]);

        setShowConditionMenu(false);
        setSelectedTooth(null);
        setSelectedSurface('center');

      } else if (condition === null) {
        // Ø¥Ø°Ø§ ÙƒØ§Ù† Clear Condition Ù…Ù† Ù‚Ø§Ø¦Ù…Ø© Condition Ø§Ù„Ø¹Ø§Ø¯ÙŠØ©
        const currentConditions = toothConditions[selectedTooth];

        // Ø¥Ø²Ø§Ù„Ø© Ù„ÙˆÙ† Ø§Ù„Ø­Ø¯ÙˆØ¯
        setToothBorderColors(prev => {
          const newBorderColors = { ...prev };
          delete newBorderColors[selectedTooth];
          return newBorderColors;
        });

        // ØªØ­Ù‚Ù‚ Ø¥Ø°Ø§ ÙƒØ§Ù†Øª Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø£Ø³Ø·Ø­ extraction Ø£Ùˆ missing
        if (currentConditions) {
          const allSame =
            currentConditions.top === currentConditions.bottom &&
            currentConditions.bottom === currentConditions.left &&
            currentConditions.left === currentConditions.right &&
            currentConditions.right === currentConditions.center &&
            (currentConditions.top === 'extraction' || currentConditions.top === 'missing');

          if (allSame) {
            // Ø¥Ø²Ø§Ù„Ø© Ø§Ù„Ù„ÙˆÙ† Ù…Ù† Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø£Ø³Ø·Ø­
            setToothConditions(prev => ({
              ...prev,
              [selectedTooth]: {
                top: null,
                bottom: null,
                left: null,
                right: null,
                center: null,
              },
            }));
          } else {
            // Ø¥Ø²Ø§Ù„Ø© Ø§Ù„Ù„ÙˆÙ† Ù…Ù† Ø§Ù„Ø³Ø·Ø­ Ø§Ù„Ù…Ø­Ø¯Ø¯ ÙÙ‚Ø·
            setToothConditions(prev => ({
              ...prev,
              [selectedTooth]: {
                ...(prev[selectedTooth] || {
                  top: null,
                  bottom: null,
                  left: null,
                  right: null,
                  center: null,
                }),
                [selectedSurface]: null,
              },
            }));
          }

          // Ø­ÙØ¸ planning record Ø¹Ù†Ø¯ Ø¥Ù„ØºØ§Ø¡ Ø§Ù„Ø­Ø§Ù„Ø©
          const now = new Date();
          const timestamp = now.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          const surfaceOptions = getAllSurfaces(selectedTooth);
          const surface = surfaceOptions.find(opt => opt.key === selectedSurface);
          const surfaceLabel = surface?.label || selectedSurface;
          const timestampNum = now.getTime() + Math.random() * 0.999;

          // Clear Condition: Ø¥Ø¶Ø§ÙØ© Ø³Ø¬Ù„ canceled (Ø§Ø³ØªØ¨Ø¯Ø§Ù„ Ø§Ù„Ø³Ø¬Ù„ Ø§Ù„Ø³Ø§Ø¨Ù‚)
          const newRecord = {
            type: 'planning' as const,
            action: 'canceled' as const,
            condition: '',
            surfaces: [surfaceLabel],
            timestamp,
            timestampNum,
            doctorName: user?.name || 'Dr. Unknown',
            isChange: undefined,
            previousCondition: undefined
          };

          // Ø§Ø³ØªØ¨Ø¯Ø§Ù„ Ø§Ù„Ø³Ø¬Ù„ Ø§Ù„Ø³Ø§Ø¨Ù‚ ÙÙŠ toothRecords
          setToothRecords(prev => {
            const existingRecords = prev[selectedTooth] || [];
            const filtered = existingRecords.filter(record => {
              if (record.type !== 'planning') return true;

              // Remove old record for this surface
              const recordSurface = record.surfaces.find(s => s.includes(`(${surfaceLabel})`));
              return !recordSurface;
            });

            return {
              ...prev,
              [selectedTooth]: [
                ...filtered,
                newRecord
              ]
            };
          });

          // Ø§Ø³ØªØ¨Ø¯Ø§Ù„ Ø§Ù„Ø³Ø¬Ù„ Ø§Ù„Ø³Ø§Ø¨Ù‚ ÙÙŠ pendingPlanningRecords
          setPendingPlanningRecords(prev => {
            const filtered = prev.filter(record => {
              if (record.toothNumber !== selectedTooth) return true;

              // Remove old record for this surface
              const recordSurface = record.surfaces.find(s => s.includes(`(${surfaceLabel})`));
              return !recordSurface;
            });

            return [
              ...filtered,
              {
                toothNumber: selectedTooth,
                ...newRecord
              }
            ];
          });
        }
      } else {
        // ØªÙ„ÙˆÙŠÙ† Ø§Ù„Ø³Ø·Ø­ Ø§Ù„Ù…Ø­Ø¯Ø¯ ÙÙ‚Ø·
        setToothConditions(prev => ({
          ...prev,
          [selectedTooth]: {
            ...(prev[selectedTooth] || {
              top: null,
              bottom: null,
              left: null,
              right: null,
              center: null,
            }),
            [selectedSurface]: condition,
          },
        }));

        // Ø¥Ø¶Ø§ÙØ© Ø³Ø¬Ù„ Ù„Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¹Ø§Ù…Ø© Ùˆ toothRecords Ù…Ø¨Ø§Ø´Ø±Ø©Ù‹
        const now = new Date();
        const timestamp = now.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const conditionName = getConditionName(condition);
        const surfaceOptions = getAllSurfaces(selectedTooth);
        const surface = surfaceOptions.find(opt => opt.key === selectedSurface);
        const surfaceLabel = surface?.label || selectedSurface;
        const timestampNum = now.getTime() + Math.random() * 0.999;

        // ÙƒØ´Ù Ø§Ù„ØªØºÙŠÙŠØ±: Ø§Ù„Ø¨Ø­Ø« Ø¹Ù† Ø¢Ø®Ø± Ø³Ø¬Ù„ Ù„Ù†ÙØ³ Ø§Ù„Ø³Ø·Ø­ Ø¨Ø­Ø§Ù„Ø© Ù…Ø®ØªÙ„ÙØ©
        // Ø£ÙˆÙ„ÙˆÙŠØ© Ø§Ù„Ø¨Ø­Ø«:
        // 1. editing_records (Ø§Ù„Ø¹Ù„Ø§Ø¬Ø§Øª Ø§Ù„Ù…Ù†ÙØ°Ø© - Ø§Ù„Ø£Ø³Ø·Ø­ Ø§Ù„Ø®Ø¶Ø±Ø§Ø¡)
        // 2. planning_records (Ø§Ù„ØªØ®Ø·ÙŠØ·Ø§Øª)

        let isChange = false;
        let previousCondition = '';

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // STEP 1: Ø§Ù„Ø¨Ø­Ø« ÙÙŠ editing_records Ø£ÙˆÙ„Ø§Ù‹ (Ø§Ù„Ø¹Ù„Ø§Ø¬Ø§Øª Ø§Ù„Ù…Ù†ÙØ°Ø©)
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const editingRecordsForTooth = toothRecords[selectedTooth] || [];
        const sortedEditingRecords = [...editingRecordsForTooth].sort((a, b) => b.timestampNum - a.timestampNum);

        console.log(`ðŸ” Searching in editing_records for tooth ${selectedTooth}, surface ${surfaceLabel}:`, {
          editingRecordsCount: editingRecordsForTooth.length,
          records: editingRecordsForTooth.map(r => ({ details: r.details, surfaces: r.surfaces }))
        });

        // Ø§Ù„Ø¨Ø­Ø« Ø¹Ù† Ø¢Ø®Ø± Ø¹Ù„Ø§Ø¬ Ù„Ù†ÙØ³ Ø§Ù„Ø³Ø·Ø­
        // ÙÙŠ editing_records: surfaces = ['mesial', 'distal'], details = 'Permanent Filling'
        const lastTreatmentForSurface = sortedEditingRecords.find(r =>
          r.surfaces && Array.isArray(r.surfaces) && r.surfaces.some(s => s.toLowerCase() === surfaceLabel.toLowerCase())
        );

        if (lastTreatmentForSurface && lastTreatmentForSurface.details) {
          // ÙˆØ¬Ø¯Ù†Ø§ Ø¹Ù„Ø§Ø¬ Ø³Ø§Ø¨Ù‚ (Ø§Ù„Ø³Ø·Ø­ Ø£Ø®Ø¶Ø±) - Ø§Ø³ØªØ®Ø¯Ù… details Ù…Ù† editing_records
          const previousConditionName = lastTreatmentForSurface.details;

          console.log(` Found treatment record: ${previousConditionName} on ${surfaceLabel}`);

          // Ø§Ù„ØªØ­Ù‚Ù‚ Ø¥Ø°Ø§ ÙƒØ§Ù†Øª Ø§Ù„Ø­Ø§Ù„Ø© Ù…Ø®ØªÙ„ÙØ©
          if (previousConditionName.toLowerCase() !== conditionName.english.toLowerCase()) {
            isChange = true;
            previousCondition = previousConditionName;
            console.log(`ðŸ”„ CHANGE DETECTED (from Treatment): ${previousConditionName} â†’ ${conditionName.english} on ${surfaceLabel}`);
          } else {
            console.log(` Same condition (Treatment): ${conditionName.english} on ${surfaceLabel}`);
          }
        } else {
          console.log(` No treatment found in editing_records, searching in planning_records...`);
          // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          // STEP 2: Ù„Ù… Ù†Ø¬Ø¯ Ø¹Ù„Ø§Ø¬ - Ø§Ø¨Ø­Ø« ÙÙŠ planning_records (Ø§Ù„ØªØ®Ø·ÙŠØ·Ø§Øª)
          // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          const globalRecordsForTooth = allPlanningRecordsGlobal.filter(r => r.toothNumber === selectedTooth);
          const pendingRecordsForTooth = pendingPlanningRecords.filter(r => r.toothNumber === selectedTooth);
          const allRecordsForTooth = [...globalRecordsForTooth, ...pendingRecordsForTooth];

          const sortedRecordsForTooth = allRecordsForTooth.sort((a, b) => b.timestampNum - a.timestampNum);

          // Ø£ÙˆÙ„Ø§Ù‹: Ø§Ø¨Ø­Ø« Ø¹Ù† Extraction
          let lastDiagnosedForSurface = sortedRecordsForTooth.find(
            r => r.action === 'diagnosed' && r.condition === 'Extraction'
          );

          // Ø¥Ø°Ø§ Ù„Ù… Ù†Ø¬Ø¯ ExtractionØŒ Ø§Ø¨Ø­Ø« Ø¹Ù† Ø³Ø¬Ù„ Ù„Ù†ÙØ³ Ø§Ù„Ø³Ø·Ø­
          if (!lastDiagnosedForSurface) {
            lastDiagnosedForSurface = sortedRecordsForTooth.find(r =>
              r.action === 'diagnosed' &&
              r.surfaces.some(s => s.toLowerCase().includes(`(${surfaceLabel.toLowerCase()})`))
            );
          }

          if (lastDiagnosedForSurface) {
            // Ø­Ø§Ù„Ø© Ø®Ø§ØµØ©: Ø§Ù„ØªØºÙŠÙŠØ± Ù…Ù† Extraction
            if (lastDiagnosedForSurface.condition === 'Extraction') {
              if (conditionName.english !== 'Extraction') {
                isChange = true;
                previousCondition = 'Extraction';
                console.log(`ðŸ”„ CHANGE DETECTED (from Planning): Extraction â†’ ${conditionName.english} on ${surfaceLabel}`);
              } else {
                console.log(` Same condition (Planning): Extraction`);
              }
            } else {
              // Ø§Ø³ØªØ®Ø±Ø§Ø¬ Ø§Ø³Ù… Ø§Ù„Ø­Ø§Ù„Ø© Ù…Ù† Ø§Ù„Ø³Ø¬Ù„ Ø§Ù„Ø³Ø§Ø¨Ù‚
              const previousSurfaceText = lastDiagnosedForSurface.surfaces.find(s => s.toLowerCase().includes(`(${surfaceLabel.toLowerCase()})`));
              if (previousSurfaceText) {
                const previousConditionMatch = previousSurfaceText.match(/^(.+?)\s*\(/);
                const previousConditionName = previousConditionMatch ? previousConditionMatch[1].trim() : previousSurfaceText;

                // Ø§Ù„ØªØ­Ù‚Ù‚ Ø¥Ø°Ø§ ÙƒØ§Ù†Øª Ø§Ù„Ø­Ø§Ù„Ø© Ù…Ø®ØªÙ„ÙØ©
                if (previousConditionName.toLowerCase() !== conditionName.english.toLowerCase()) {
                  isChange = true;
                  previousCondition = previousConditionName;
                  console.log(`ðŸ”„ CHANGE DETECTED (from Planning): ${previousConditionName} â†’ ${conditionName.english} on ${surfaceLabel}`);
                } else {
                  console.log(` Same condition (Planning): ${conditionName.english} on ${surfaceLabel}`);
                }
              }
            }
          } else {
            console.log(`âž• NEW diagnosis: ${conditionName.english} on ${surfaceLabel}`);
          }
        }

        const newRecord = {
          type: 'planning' as const,
          action: 'diagnosed' as const,
          condition: conditionName.english, // Use actual condition name (Caries, Follow-up, etc.)
          surfaces: [`${conditionName.english} (${surfaceLabel})`],
          timestamp,
          timestampNum,
          doctorName: user?.name || 'Dr. Unknown',
          isChange: isChange, // Track if this is a change from previous condition
          previousCondition: isChange ? previousCondition : undefined
        };

        // Ø§Ø³ØªØ¨Ø¯Ø§Ù„ Ø§Ù„Ø³Ø¬Ù„ Ø§Ù„Ø³Ø§Ø¨Ù‚ Ø¨Ø¯Ù„Ø§Ù‹ Ù…Ù† Ø§Ù„Ø¥Ø¶Ø§ÙØ© (Ù„Ù†ÙØ³ Ø§Ù„Ø³Ù† ÙˆÙ†ÙØ³ Ø§Ù„Ø³Ø·Ø­)
        setPendingPlanningRecords(prev => {
          // Remove any existing record for this tooth + surface
          const filtered = prev.filter(record => {
            if (record.toothNumber !== selectedTooth) return true;

            // Check if this record is for the same surface
            const recordSurface = record.surfaces.find(s => s.includes(`(${surfaceLabel})`));
            return !recordSurface; // Keep only if different surface
          });

          // Add the new record
          return [
            ...filtered,
            {
              toothNumber: selectedTooth,
              ...newRecord
            }
          ];
        });

        // Ø§Ø³ØªØ¨Ø¯Ø§Ù„ Ø§Ù„Ø³Ø¬Ù„ ÙÙŠ toothRecords Ø£ÙŠØ¶Ø§Ù‹
        setToothRecords(prev => {
          const existingRecordsForTooth = prev[selectedTooth] || [];

          // Remove any existing planning record for this surface
          const filtered = existingRecordsForTooth.filter(record => {
            if (record.type !== 'planning') return true; // Keep non-planning records

            // Check if this record is for the same surface
            const recordSurface = record.surfaces.find(s => s.includes(`(${surfaceLabel})`));
            return !recordSurface; // Keep only if different surface
          });

          return {
            ...prev,
            [selectedTooth]: [
              ...filtered,
              newRecord
            ]
          };
        });

        // Ø¥Ø°Ø§ ÙƒØ§Ù† ØªØºÙŠÙŠØ± Ù…Ù† ExtractionØŒ Ø§Ø­Ø°Ù Ø§Ù„Ù„ÙˆÙ† Ø§Ù„Ø£Ø³ÙˆØ¯ Ù…Ù† ÙƒÙ„ Ø§Ù„Ø£Ø³Ø·Ø­ ÙÙˆØ±Ø§Ù‹
        if (isChange && previousCondition === 'Extraction') {
          console.log('ðŸ”„ Clearing extraction color from all surfaces immediately');

          // Ø§Ø­Ø°Ù ÙƒÙ„ Ø§Ù„Ø£Ù„ÙˆØ§Ù† Ø£ÙˆÙ„Ø§Ù‹
          const clearedConditions = {
            top: null,
            bottom: null,
            left: null,
            right: null,
            center: null,
          };

          // Mapping Ù„Ù„Ø£Ø³Ø·Ø­ (use helper to get correct mapping for lower teeth)
          const surfaceNameToKey = getSurfaceNameMap(selectedTooth);

          // Mapping Ù„Ù„Ø£Ù„ÙˆØ§Ù†
          const conditionColorMap: Record<string, ToothCondition> = {
            'Caries': 'caries',
            'Broken/Inappropriate Filling': 'broken',
            'Pulpectomy': 'pulpectomy',
            'Follow-up': 'follow_up',
            'Needs More Diagnosis': 'needs_diagnosis',
            'Temporary Filling': 'filling_replacement',
            'Permanent Filling': 'permanent_filling',
            'Fracture': 'fracture',
            'Restoration to Replace': 'filling_replacement',
            'Impacted': 'impacted',
          };

          // Ø£Ø¶Ù Ø§Ù„Ù„ÙˆÙ† Ø§Ù„Ø¬Ø¯ÙŠØ¯ Ù„Ù„Ø³Ø·Ø­ Ø§Ù„Ù…Ø­Ø¯Ø¯ ÙÙ‚Ø· (Ø¥Ø°Ø§ ÙƒØ§Ù† Ù„Ù‡ Ù„ÙˆÙ†)
          if (conditionColorMap[conditionName.english]) {
            const surfaceKey = surfaceNameToKey[surfaceLabel.toLowerCase()];
            console.log(`  â†’ Adding new color: condition="${conditionName.english}", surface="${surfaceLabel}", surfaceKey="${surfaceKey}", color="${conditionColorMap[conditionName.english]}"`);
            if (surfaceKey) {
              clearedConditions[surfaceKey] = conditionColorMap[conditionName.english];
              console.log(`   clearedConditions after adding:`, clearedConditions);
            } else {
              console.log(`   surfaceKey is null for "${surfaceLabel}"`);
            }
          } else {
            console.log(`   No color mapping for condition "${conditionName.english}"`);
          }

          console.log(`  ðŸŽ¨ Final clearedConditions:`, clearedConditions);
          setToothConditions(prev => ({
            ...prev,
            [selectedTooth]: clearedConditions
          }));
        }

      }
      setShowConditionMenu(false);
      setSelectedSurface(null);
    }
  };

  useEffect(() => {
    // Blob animations
    const animateBlob = (anim: Animated.Value, duration: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: duration,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: duration,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    animateBlob(blob1Anim, 6000);
    animateBlob(blob2Anim, 7000);
    animateBlob(blob3Anim, 8000);
    animateBlob(blob4Anim, 6500);
    animateBlob(blob5Anim, 7500);
    animateBlob(blob6Anim, 6800);
  }, []);

  // DISABLED: ØªØ­Ø¯ÙŠØ« Tooth Status Record ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¹Ù†Ø¯ ØªØºÙŠÙŠØ± toothConditions Ø£Ùˆ toothBorderColors
  // This useEffect has been disabled to prevent automatic saving
  // All changes now only save when Submit button is pressed
  // useEffect(() => {
  //   ... disabled code ...
  // }, [toothConditions, toothBorderColors]);

  // Sync selectedSurfaces with toothConditions when modal opens
  // Exclude surfaces with "follow-up" since they don't need treatment (just monitoring)
  useEffect(() => {
    if (showToothDetailsModal && selectedToothForDetails) {
      const toothCondition = toothConditions[selectedToothForDetails];
      if (toothCondition) {
        const activeSurfaces: string[] = [];
        (Object.keys(toothCondition) as Array<keyof ToothSurfaceConditions>).forEach((surface) => {
          // Only add surfaces that are not null AND not "follow-up"
          if (toothCondition[surface] !== null && toothCondition[surface] !== 'follow-up') {
            activeSurfaces.push(surface);
          }
        });

        if (activeSurfaces.length > 0 || selectedSurfaces[selectedToothForDetails]) {
          setSelectedSurfaces(prev => ({
            ...prev,
            [selectedToothForDetails]: activeSurfaces
          }));
        }
      }
    }
  }, [showToothDetailsModal, selectedToothForDetails, toothConditions]);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar translucent={true} backgroundColor="transparent" barStyle="light-content" />

      {/* Gradient Mesh Background - Same as PatientProfileScreen */}
      <LinearGradient
        colors={['#F0F4F8', '#E8EDF3', '#F5F0F8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.container}>
        <View style={styles.gradient}>
          {/* Animated Blobs */}
          <Animated.View
            style={[
              styles.timelineBlob,
              {
                top: '3%',
                left: '5%',
                width: 180,
                height: 180,
                backgroundColor: 'rgba(91, 159, 237, 0.15)',
                transform: [
                  {
                    translateX: blob1Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 30],
                    }),
                  },
                  {
                    translateY: blob1Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -20],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.timelineBlob,
              {
                top: '15%',
                right: '10%',
                width: 220,
                height: 220,
                backgroundColor: 'rgba(251, 191, 36, 0.12)',
                transform: [
                  {
                    translateX: blob2Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -25],
                    }),
                  },
                  {
                    translateY: blob2Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 35],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.timelineBlob,
              {
                bottom: '5%',
                left: '55%',
                marginLeft: -100,
                width: 200,
                height: 200,
                backgroundColor: 'rgba(91, 159, 237, 0.15)',
                transform: [
                  {
                    translateX: blob3Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 20],
                    }),
                  },
                  {
                    translateY: blob3Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -30],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.timelineBlob,
              {
                top: '35%',
                left: '75%',
                width: 160,
                height: 160,
                backgroundColor: 'rgba(251, 191, 36, 0.12)',
                transform: [
                  {
                    translateX: blob4Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -20],
                    }),
                  },
                  {
                    translateY: blob4Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 25],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.timelineBlob,
              {
                top: '20%',
                right: '25%',
                width: 170,
                height: 170,
                backgroundColor: 'rgba(91, 159, 237, 0.15)',
                transform: [
                  {
                    translateX: blob5Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 28],
                    }),
                  },
                  {
                    translateY: blob5Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -32],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.timelineBlob,
              {
                bottom: '30%',
                left: '15%',
                width: 150,
                height: 150,
                backgroundColor: 'rgba(251, 191, 36, 0.12)',
                transform: [
                  {
                    translateX: blob6Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -18],
                    }),
                  },
                  {
                    translateY: blob6Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 22],
                    }),
                  },
                ],
              },
            ]}
          />

          {/* Header with Back Button */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Dental Chart</Text>

            <View style={{ width: 40 }} />
          </View>

          {/* Planning Submit/Cancel Buttons - Floating */}
          {!isEditModeActive && pendingPlanningRecords.length > 0 && (
            <>
              {/* Cancel Button (Left) */}
              <TouchableOpacity
                style={styles.planningCancelButton}
                onPress={handlePlanningCancel}
                activeOpacity={0.8}
              >
                <Text style={styles.planningCancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              {/* Submit Button (Right) */}
              <TouchableOpacity
                style={styles.planningSubmitButton}
                onPress={handlePlanningSubmit}
                activeOpacity={0.8}
              >
                <Text style={styles.planningSubmitButtonText}>Submit</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Content */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
                {/* Edit Mode Button */}
                <Animated.View
                  style={[
                    styles.editButtonContainer,
                    {
                      transform: [{ translateX: editButtonSlide }],
                      opacity: isOralHygieneExpanded ? 0 : buttonsOpacity,
                      zIndex: isOralHygieneExpanded ? 700 : (selectedTooth ? 900 : 9999),
                      elevation: isOralHygieneExpanded ? 700 : (selectedTooth ? 900 : 9999),
                    }
                  ]}
                  pointerEvents={selectedTooth ? "none" : "box-none"}
                >
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      const newState = !isEditModeActive;
                      console.log('âœ“ Edit Button Pressed! New state:', newState);
                      setIsEditModeActive(newState);
                    }}
                    style={[
                      styles.editModeButton,
                      isEditModeActive ? styles.editModeButtonActive : styles.editModeButtonInactive,
                    ]}
                  >
                    <Text style={[
                      styles.editModeButtonText,
                      isEditModeActive && styles.editModeButtonTextActive
                    ]}>
                      Edit
                    </Text>
                  </TouchableOpacity>
                </Animated.View>

                {/* View Mode Button */}
                <Animated.View style={[styles.viewButtonContainer, {
                  opacity: isOralHygieneExpanded ? 0 : buttonsOpacity,
                  zIndex: isOralHygieneExpanded ? 700 : ((isTreatmentRecordExpanded || isPlanningRecordExpanded || isReferralExpanded) ? 9998 : (isViewModeActive ? 10020 : (selectedTooth ? 900 : 9999))),
                  elevation: isOralHygieneExpanded ? 700 : ((isTreatmentRecordExpanded || isPlanningRecordExpanded || isReferralExpanded) ? 9998 : (isViewModeActive ? 10020 : (selectedTooth ? 900 : 9999))),
                  transform: [
                    { translateX: -50 },
                    {
                      translateY: viewButtonPositionAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -(SCREEN_HEIGHT * 0.41 - 100)] // Ù…Ù† 41% Ø¥Ù„Ù‰ 100 Ø¨ÙƒØ³Ù„ Ù…Ù† Ø§Ù„Ø£Ø¹Ù„Ù‰
                      })
                    }
                  ]
                }]} pointerEvents={selectedTooth ? "none" : "box-none"}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      const newState = !isViewModeActive;
                      console.log('âœ“ View Button Pressed! Current state:', isViewModeActive, 'â†’ New state:', newState);
                      setIsViewModeActive(newState);

                      if (newState) {
                        console.log('ðŸ”µ Showing referral container - hiding teeth');
                        // Ø¥Ø®ÙØ§Ø¡ Ø§Ù„Ø£Ø³Ù†Ø§Ù† ÙˆØ²Ø± Edit ÙˆØ§Ù„Ø®Ø·ÙˆØ· ÙˆØ£Ø±Ù‚Ø§Ù… Ø§Ù„Ø£Ø³Ù†Ø§Ù†
                        Animated.parallel([
                          Animated.timing(rightTeethSlide, {
                            toValue: 500, // Ø¥Ø²Ø§Ø­Ø© Ù„Ù„ÙŠÙ…ÙŠÙ† Ø®Ø§Ø±Ø¬ Ø§Ù„Ø´Ø§Ø´Ø©
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(leftTeethSlide, {
                            toValue: -500, // Ø¥Ø²Ø§Ø­Ø© Ù„Ù„ÙŠØ³Ø§Ø± Ø®Ø§Ø±Ø¬ Ø§Ù„Ø´Ø§Ø´Ø©
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(editButtonSlide, {
                            toValue: -300, // Ø¥Ø²Ø§Ø­Ø© Ø²Ø± Edit Ù„Ù„ÙŠØ³Ø§Ø±
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(verticalTopLineSlide, {
                            toValue: -200, // Ø¥Ø²Ø§Ø­Ø© Ø§Ù„Ø®Ø· Ø§Ù„Ø¹Ù…ÙˆØ¯ÙŠ Ø§Ù„Ø¹Ù„ÙˆÙŠ Ù„Ù„Ø£Ø¹Ù„Ù‰
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(verticalBottomLineSlide, {
                            toValue: 200, // Ø¥Ø²Ø§Ø­Ø© Ø§Ù„Ø®Ø· Ø§Ù„Ø¹Ù…ÙˆØ¯ÙŠ Ø§Ù„Ø³ÙÙ„ÙŠ Ù„Ù„Ø£Ø³ÙÙ„
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(horizontalRightLineSlide, {
                            toValue: 500, // Ø¥Ø²Ø§Ø­Ø© Ø§Ù„Ø®Ø· Ø§Ù„Ø£ÙÙ‚ÙŠ Ø§Ù„Ø£ÙŠÙ…Ù† Ù„Ù„ÙŠÙ…ÙŠÙ†
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(horizontalLeftLineSlide, {
                            toValue: -500, // Ø¥Ø²Ø§Ø­Ø© Ø§Ù„Ø®Ø· Ø§Ù„Ø£ÙÙ‚ÙŠ Ø§Ù„Ø£ÙŠØ³Ø± Ù„Ù„ÙŠØ³Ø§Ø±
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(rightNumbersSlide, {
                            toValue: 500, // Ø¥Ø²Ø§Ø­Ø© Ø£Ø±Ù‚Ø§Ù… Ø§Ù„Ø£Ø³Ù†Ø§Ù† Ø§Ù„ÙŠÙ…Ù†Ù‰ Ù„Ù„ÙŠÙ…ÙŠÙ†
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(leftNumbersSlide, {
                            toValue: -500, // Ø¥Ø²Ø§Ø­Ø© Ø£Ø±Ù‚Ø§Ù… Ø§Ù„Ø£Ø³Ù†Ø§Ù† Ø§Ù„ÙŠØ³Ø±Ù‰ Ù„Ù„ÙŠØ³Ø§Ø±
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(oralHygieneOpacity, {
                            toValue: 0, // Ø¥Ø®ÙØ§Ø¡ Ø­Ø§ÙˆÙŠØ© Oral Hygiene
                            duration: 400,
                            useNativeDriver: true,
                          }),
                          Animated.timing(viewButtonPositionAnim, {
                            toValue: 1, // ØªØ­Ø±ÙŠÙƒ Ø²Ø± View Ø¥Ù„Ù‰ Ø£Ø¹Ù„Ù‰ ÙŠÙ…ÙŠÙ†
                            duration: 400,
                            useNativeDriver: true,
                          }),
                        ]).start(() => {
                          console.log('ðŸŸ¢ Teeth hidden - now showing containers');
                          // Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ø­Ø§ÙˆÙŠØ© Ù„Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ù…ØºÙ„Ù‚Ø©
                          setIsReferralExpanded(false);
                          referralSectionsHeight.setValue(0);
                          // Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† pushDown Ù„Ù„Ø­Ø§ÙˆÙŠØ§Øª Ø§Ù„Ø£Ø®Ø±Ù‰
                          treatmentRecordPushDown.setValue(0);
                          planningRecordPushDown.setValue(0);
                          // Ø¨Ø¹Ø¯ Ø§Ù†ØªÙ‡Ø§Ø¡ Ø§Ø®ØªÙØ§Ø¡ Ø§Ù„Ø£Ø³Ù†Ø§Ù†ØŒ Ø¥Ø¸Ù‡Ø§Ø± Ø§Ù„Ø­Ø§ÙˆÙŠØ§Øª Ø¨Ø§Ù„ØªØ³Ù„Ø³Ù„
                          // 1. Referral Ù…Ù† Ø§Ù„ÙŠÙ…ÙŠÙ†
                          Animated.timing(referralContainerSlide, {
                            toValue: 0,
                            duration: 150,
                            useNativeDriver: true,
                          }).start(() => {
                            console.log(' Referral container visible');
                            // 2. Treatment Record Ù…Ù† Ø§Ù„ÙŠØ³Ø§Ø±
                            Animated.timing(treatmentRecordSlide, {
                              toValue: 0,
                              duration: 150,
                              useNativeDriver: true,
                            }).start(() => {
                              console.log(' Treatment Record visible');
                              // 3. Planning Record Ù…Ù† Ø§Ù„ÙŠÙ…ÙŠÙ†
                              Animated.timing(planningRecordSlide, {
                                toValue: 0,
                                duration: 150,
                                useNativeDriver: true,
                              }).start(() => {
                                console.log(' All containers visible');
                                // Ø§Ù„Ø­Ø§ÙˆÙŠØ§Øª ÙÙŠ Ù…ÙˆÙ‚Ø¹ Ø«Ø§Ø¨Øª - Ù„Ø§ Ø­Ø§Ø¬Ø© Ù„ØªØ­Ø±ÙŠÙƒÙ‡Ø§
                              });
                            });
                          });
                        });
                      } else {
                        console.log('ðŸ”´ Hiding containers - returning teeth');
                        // Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ø­Ø§ÙˆÙŠØ© Ù„Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ù…ØºÙ„Ù‚Ø©
                        setIsReferralExpanded(false);
                        referralSectionsHeight.setValue(0);
                        treatmentRecordPushDown.setValue(0);
                        planningRecordPushDown.setValue(0);
                        // Ø¥Ø®ÙØ§Ø¡ Ø§Ù„Ø­Ø§ÙˆÙŠØ§Øª Ø¨Ø§Ù„ØªØ³Ù„Ø³Ù„ Ø§Ù„Ø¹ÙƒØ³ÙŠ
                        // 1. Planning Record (ÙŠÙ…ÙŠÙ†)
                        Animated.timing(planningRecordSlide, {
                          toValue: 1000,
                          duration: 100,
                          useNativeDriver: true,
                        }).start(() => {
                          console.log('ðŸŸ¡ Planning Record hidden');
                          // 2. Treatment Record (ÙŠØ³Ø§Ø±)
                          Animated.timing(treatmentRecordSlide, {
                            toValue: -1000,
                            duration: 100,
                            useNativeDriver: true,
                          }).start(() => {
                            console.log('ðŸŸ¡ Treatment Record hidden');
                            // 3. Referral (ÙŠÙ…ÙŠÙ†)
                            Animated.timing(referralContainerSlide, {
                              toValue: 1000,
                              duration: 100,
                              useNativeDriver: true,
                            }).start(() => {
                              console.log('ðŸŸ¡ All containers hidden - now returning teeth');
                          // Ø«Ù… Ø¥Ø±Ø¬Ø§Ø¹ Ø§Ù„Ø£Ø³Ù†Ø§Ù† ÙˆØ²Ø± Edit ÙˆØ§Ù„Ø®Ø·ÙˆØ· ÙˆØ£Ø±Ù‚Ø§Ù… Ø§Ù„Ø£Ø³Ù†Ø§Ù† Ù„Ø£Ù…Ø§ÙƒÙ†Ù‡Ø§
                          Animated.parallel([
                          Animated.timing(rightTeethSlide, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(leftTeethSlide, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(editButtonSlide, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(verticalTopLineSlide, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(verticalBottomLineSlide, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(horizontalRightLineSlide, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(horizontalLeftLineSlide, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(rightNumbersSlide, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(leftNumbersSlide, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(oralHygieneOpacity, {
                            toValue: 1, // Ø¥Ø¹Ø§Ø¯Ø© Ø¥Ø¸Ù‡Ø§Ø± Ø­Ø§ÙˆÙŠØ© Oral Hygiene
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(viewButtonPositionAnim, {
                            toValue: 0, // Ø¥Ø¹Ø§Ø¯Ø© Ø²Ø± View Ø¥Ù„Ù‰ Ù…ÙˆÙ‚Ø¹Ù‡ Ø§Ù„Ø£ØµÙ„ÙŠ
                            duration: 300,
                            useNativeDriver: true,
                          }),
                        ]).start(() => {
                          console.log(' Teeth returned to original position');
                        });
                            });
                          });
                        });
                      }
                    }}
                    style={[
                      styles.viewModeButton,
                      isViewModeActive ? styles.viewModeButtonActive : styles.viewModeButtonInactive,
                    ]}
                  >
                    <Text style={[
                      styles.viewModeButtonText,
                      isViewModeActive && styles.viewModeButtonTextActive
                    ]}>
                      View
                    </Text>
                  </TouchableOpacity>
                </Animated.View>

                {/* Teeth Container */}
                <View style={styles.crossContainer}>
                  {/* Ø®Ø·ÙˆØ· ÙØ§ØµÙ„Ø© Ø£ØµÙØ± ÙÙŠ Ø§Ù„Ù…Ù†ØªØµÙ */}
                  {/* Ø§Ù„Ø®Ø· Ø§Ù„Ø¹Ù…ÙˆØ¯ÙŠ Ø§Ù„Ø¹Ù„ÙˆÙŠ */}
                  <Animated.View style={[styles.centerDivider, { transform: [{ translateY: verticalTopLineSlide }] }]} pointerEvents="none">
                    <Svg width="100%" height="100%" viewBox="0 0 100 100">
                      {/* Ø§Ù„Ø®Ø· Ø§Ù„Ø¹Ù…ÙˆØ¯ÙŠ Ø§Ù„Ø£ØµÙØ± Ø§Ù„ØµØºÙŠØ± ÙÙŠ Ø§Ù„Ø£Ø¹Ù„Ù‰ Ø¨ÙŠÙ† Ø±Ù‚Ù… 1 Ùˆ1 */}
                      <Line
                        x1="50"
                        y1="-30"
                        x2="50"
                        y2="-10"
                        stroke="rgba(251, 191, 36, 0.3)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </Svg>
                  </Animated.View>

                  {/* Ø§Ù„Ø®Ø· Ø§Ù„Ø¹Ù…ÙˆØ¯ÙŠ Ø§Ù„Ø³ÙÙ„ÙŠ */}
                  <Animated.View style={[styles.centerDivider, { transform: [{ translateY: verticalBottomLineSlide }] }]} pointerEvents="none">
                    <Svg width="100%" height="100%" viewBox="0 0 100 100">
                      {/* Ø§Ù„Ø®Ø· Ø§Ù„Ø¹Ù…ÙˆØ¯ÙŠ Ø§Ù„Ø£ØµÙØ± Ø§Ù„ØµØºÙŠØ± ÙÙŠ Ø§Ù„Ø£Ø³ÙÙ„ Ø¨ÙŠÙ† Ø±Ù‚Ù… 1 Ùˆ1 Ù„Ù„ÙÙƒ Ø§Ù„Ø³ÙÙ„ÙŠ */}
                      <Line
                        x1="50"
                        y1="110"
                        x2="50"
                        y2="130"
                        stroke="rgba(251, 191, 36, 0.3)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </Svg>
                  </Animated.View>

                  {/* Ø§Ù„Ø®Ø· Ø§Ù„Ø£ÙÙ‚ÙŠ Ø§Ù„Ø£ÙŠØ³Ø± */}
                  <Animated.View style={[styles.centerDivider, { transform: [{ translateX: horizontalLeftLineSlide }] }]} pointerEvents="none">
                    <Svg width="100%" height="100%" viewBox="0 0 100 100">
                      {/* Ø§Ù„Ø®Ø· Ø§Ù„Ø£ÙÙ‚ÙŠ Ø§Ù„Ø£ØµÙØ± Ø§Ù„ØµØºÙŠØ± Ø¨ÙŠÙ† 8 Ùˆ 8 Ø¹Ù„Ù‰ Ø§Ù„ÙŠØ³Ø§Ø± */}
                      <Line
                        x1="10"
                        y1="50"
                        x2="30"
                        y2="50"
                        stroke="rgba(251, 191, 36, 0.3)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </Svg>
                  </Animated.View>

                  {/* Ø§Ù„Ø®Ø· Ø§Ù„Ø£ÙÙ‚ÙŠ Ø§Ù„Ø£ÙŠÙ…Ù† */}
                  <Animated.View style={[styles.centerDivider, { transform: [{ translateX: horizontalRightLineSlide }] }]} pointerEvents="none">
                    <Svg width="100%" height="100%" viewBox="0 0 100 100">
                      {/* Ø§Ù„Ø®Ø· Ø§Ù„Ø£ÙÙ‚ÙŠ Ø§Ù„Ø£ØµÙØ± Ø§Ù„ØµØºÙŠØ± Ø¨ÙŠÙ† 8 Ùˆ 8 Ø¹Ù„Ù‰ Ø§Ù„ÙŠÙ…ÙŠÙ† */}
                      <Line
                        x1="70"
                        y1="50"
                        x2="90"
                        y2="50"
                        stroke="rgba(251, 191, 36, 0.3)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </Svg>
                  </Animated.View>

                  {/* Oral Hygiene Container - Ø­Ø§ÙˆÙŠØ© ÙÙŠ Ø§Ù„Ù…Ù†ØªØµÙ */}
                  <Animated.View style={[
                    {
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      zIndex: isOralHygieneExpanded ? 10001 : 800,
                      elevation: isOralHygieneExpanded ? 10001 : 800,
                      opacity: Animated.multiply(buttonsOpacity, oralHygieneOpacity),
                    }
                  ]} pointerEvents={selectedTooth ? "none" : "auto"}>
                    <Animated.View
                      style={[
                        {
                          paddingHorizontal: 16,
                          paddingVertical: 4,
                          borderRadius: 16,
                          borderWidth: 1.5,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.1,
                          shadowRadius: 12,
                        },
                        {
                          width: oralHygieneExpandAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [140, SCREEN_WIDTH * 0.75]
                          }),
                          height: oralHygieneExpandAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [38, 320]
                          }),
                          backgroundColor: isOralHygieneExpanded ? 'rgba(254, 215, 170, 0.2)' : 'rgba(251, 191, 36, 0.1)',
                          borderColor: isOralHygieneExpanded ? 'rgba(254, 215, 170, 0.5)' : 'rgba(255, 255, 255, 0.5)',
                          transform: [
                            {
                              translateX: oralHygieneExpandAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [-70, -(SCREEN_WIDTH * 0.75) / 2]
                              })
                            },
                            {
                              translateY: oralHygieneExpandAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [-19, -160]
                              })
                            }
                          ],
                          overflow: 'hidden',
                        }
                      ]}
                    >
                    <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill}>
                      <View style={{ flex: 1, backgroundColor: isOralHygieneExpanded ? 'rgba(254, 215, 170, 0.3)' : 'rgba(251, 191, 36, 0.15)' }}>
                        <TouchableOpacity
                          onPress={handleOralHygienePress}
                          activeOpacity={0.8}
                          style={{ width: '100%' }}
                        >
                          <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingVertical: isOralHygieneExpanded ? 14 : 8,
                            width: '100%',
                            gap: 10
                          }}>
                            {isOralHygieneExpanded && (
                              <Ionicons name="fitness-outline" size={24} color="#92400E" />
                            )}
                            <Text style={[
                              styles.oralHygieneText,
                              isOralHygieneExpanded && { fontSize: 20, fontWeight: '800', letterSpacing: 0.8 }
                            ]}>Oral Hygiene</Text>
                            {isOralHygieneExpanded && (
                              <Ionicons name="chevron-up" size={20} color="#92400E" />
                            )}
                          </View>
                          {isOralHygieneExpanded && (
                            <View style={{
                              width: '85%',
                              height: 2.5,
                              backgroundColor: '#92400E',
                              borderRadius: 2,
                              alignSelf: 'center',
                              marginTop: 8
                            }} />
                          )}
                        </TouchableOpacity>

                    {isOralHygieneExpanded && (
                      <ScrollView style={{ flex: 1, padding: 16, paddingTop: 20 }} showsVerticalScrollIndicator={false}>
                        {/* Ø²Ø± Scaling Done */}
                        <TouchableOpacity
                          style={[styles.scalingButton, {
                            overflow: 'hidden',
                            ...Platform.select({
                              ios: {
                                shadowColor: '#059669',
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.25,
                                shadowRadius: 8,
                              }
                            })
                          }]}
                          onPress={handleAddScaling}
                          activeOpacity={0.7}
                        >
                          <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill}>
                            <View style={{
                              flex: 1,
                              backgroundColor: 'rgba(16, 185, 129, 0.25)',
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 10
                            }}>
                              <Ionicons name="checkmark-circle" size={22} color="#059669" />
                              <Text style={[styles.scalingButtonText, { fontSize: 16, fontWeight: '700', letterSpacing: 0.5 }]}>Scaling Done</Text>
                            </View>
                          </BlurView>
                        </TouchableOpacity>

                        {/* Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ù€ Scaling */}
                        {scalingRecords.length > 0 && (
                          <View style={[styles.scalingRecordsContainer, {
                            backgroundColor: 'rgba(255, 255, 255, 0.6)',
                            borderRadius: 16,
                            padding: 16,
                            marginTop: 4,
                            ...Platform.select({
                              ios: {
                                shadowColor: '#92400E',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.1,
                                shadowRadius: 6,
                              }
                            })
                          }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                              <Ionicons name="file-tray-full" size={20} color="#92400E" />
                              <Text style={[styles.scalingRecordsTitle, { fontSize: 15, fontWeight: '700', marginBottom: 0 }]}>Scaling Records</Text>
                            </View>
                            {scalingRecords.map((record, index) => (
                              <View key={index} style={[styles.scalingRecordItem, {
                                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                padding: 14,
                                borderRadius: 12,
                                marginBottom: index === scalingRecords.length - 1 ? 0 : 10,
                                borderWidth: 1,
                                borderColor: 'rgba(254, 215, 170, 0.4)',
                                ...Platform.select({
                                  ios: {
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 1 },
                                    shadowOpacity: 0.06,
                                    shadowRadius: 3,
                                  }
                                })
                              }]}>
                                <View style={[styles.scalingRecordIcon, {
                                  width: 38,
                                  height: 38,
                                  borderRadius: 10,
                                  backgroundColor: 'rgba(254, 215, 170, 0.3)',
                                  borderWidth: 1.5,
                                  borderColor: 'rgba(254, 215, 170, 0.6)'
                                }]}>
                                  <Ionicons name="medical" size={18} color="#92400E" />
                                </View>
                                <View style={[styles.scalingRecordInfo, { marginLeft: 12 }]}>
                                  <Text style={[styles.scalingRecordDoctor, { fontSize: 14, fontWeight: '600' }]}>{record.doctorName}</Text>
                                  <Text style={[styles.scalingRecordTime, { fontSize: 12, marginTop: 2 }]}>{record.timestamp}</Text>
                                </View>
                                <TouchableOpacity
                                  onPress={() => {
                                    Alert.alert(
                                      'Delete Record',
                                      'Are you sure you want to delete this scaling record?',
                                      [
                                        {
                                          text: 'Cancel',
                                          style: 'cancel'
                                        },
                                        {
                                          text: 'Delete',
                                          style: 'destructive',
                                          onPress: async () => {
                                            // Ø­Ø°Ù Ù…Ù† Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
                                            const { error } = await deleteScalingRecord(record.id);

                                            if (error) {
                                              Alert.alert('Error', 'Failed to delete scaling record');
                                              console.error('Error deleting scaling record:', error);
                                              return;
                                            }

                                            // Ø­Ø°Ù Ù…Ù† Ø§Ù„Ù€ state
                                            setScalingRecords(prev => prev.filter((_, i) => i !== index));
                                          }
                                        }
                                      ]
                                    );
                                  }}
                                  style={[styles.deleteRecordButton, {
                                    padding: 8,
                                    borderRadius: 8,
                                    backgroundColor: 'rgba(239, 68, 68, 0.08)'
                                  }]}
                                  activeOpacity={0.7}
                                >
                                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        )}
                      </ScrollView>
                    )}
                      </View>
                    </BlurView>
                    </Animated.View>
                  </Animated.View>

                  {/* Tooth #8 - Upper Left (Ø£Ù‚ØµÙ‰ ÙŠÙ…ÙŠÙ† Ø§Ù„ØµÙØ­Ø© ÙÙˆÙ‚ Ø§Ù„Ù…Ù†ØªØµÙ) */}
                  <Animated.View
                    style={[
                      styles.tooth8,
                      {
                        zIndex: selectedTooth === 8 ? 1001 : 999, // Ø¯Ø§Ø¦Ù…Ø§Ù‹ ÙÙˆÙ‚ Ø§Ù„Ø·Ø¨Ù‚Ø© Ø§Ù„Ø´ÙØ§ÙØ©
                        elevation: selectedTooth === 8 ? 1001 : 999, // Ù„Ù„Ø£Ù†Ø¯Ø±ÙˆÙŠØ¯
                      },
                      {
                        transform: [
                          { translateX: Animated.add(selectedTooth === 8 ? tooth8TranslateX : 0, rightTeethSlide) },
                          { translateY: selectedTooth === 8 ? tooth8TranslateY : 0 },
                          { scale: selectedTooth === 8 ? tooth8Scale : 1 },
                          { rotate: selectedTooth === 8 ? tooth8Rotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '-90deg'],
                          }) : '0deg' },
                        ],
                      },
                      isEditModeActive && styles.toothGlowEffect,
                    ]}
                  >
                    <ToothWithSectionsSquareTiny
                      colors={toothConditions[8]}
                      onToothPress={() => handleToothPress(8)}
                      onSurfacePress={selectedTooth === 8 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                      borderColor={toothBorderColors[8] ? CONDITION_COLORS[toothBorderColors[8]] : undefined}
                    />

                    {/* Surface labels */}
                    {selectedTooth === 8 && !isClosing && (
                      <>
                        <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>P</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                      </>
                    )}
                  </Animated.View>

                  {/* Tooth #7 */}
                  <Animated.View
                    style={[
                      styles.tooth7,
                      {
                        zIndex: selectedTooth === 7 ? 1001 : 999,
                        elevation: selectedTooth === 7 ? 1001 : 999,
                      },
                      {
                        transform: [
                          { translateX: Animated.add(selectedTooth === 7 ? tooth7TranslateX : 0, rightTeethSlide) },
                          { translateY: selectedTooth === 7 ? tooth7TranslateY : 0 },
                          { scale: selectedTooth === 7 ? tooth7Scale : 1 },
                          { rotate: selectedTooth === 7 ? tooth7Rotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '-90deg'],
                          }) : '0deg' },
                        ],
                      },
                      isEditModeActive && styles.toothGlowEffect,
                    ]}
                  >
                    <ToothWithSectionsSquareTiny
                      colors={toothConditions[7]}
                      onToothPress={() => handleToothPress(7)}
                      onSurfacePress={selectedTooth === 7 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                      borderColor={toothBorderColors[7] ? CONDITION_COLORS[toothBorderColors[7]] : undefined}
                    />


                    {/* Surface labels */}
                    {selectedTooth === 7 && !isClosing && (
                      <>
                        <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>P</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                      </>
                    )}
                  </Animated.View>

                  {/* Tooth #6 */}
                  <Animated.View
                    style={[
                      styles.tooth6,
                      {
                        zIndex: selectedTooth === 6 ? 1001 : 999,
                        elevation: selectedTooth === 6 ? 1001 : 999,
                      },
                      {
                        transform: [
                          { translateX: Animated.add(selectedTooth === 6 ? tooth6TranslateX : 0, rightTeethSlide) },
                          { translateY: selectedTooth === 6 ? tooth6TranslateY : 0 },
                          { scale: selectedTooth === 6 ? tooth6Scale : 1 },
                          { rotate: selectedTooth === 6 ? tooth6Rotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '-90deg'],
                          }) : '0deg' },
                        ],
                      },
                      isEditModeActive && styles.toothGlowEffect,
                    ]}
                  >
                    <ToothWithSectionsSquareTiny
                      colors={toothConditions[6]}
                      onToothPress={() => handleToothPress(6)}
                      onSurfacePress={selectedTooth === 6 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                    borderColor={toothBorderColors[6] ? CONDITION_COLORS[toothBorderColors[6]] : undefined}
                    />


                    {/* Surface labels */}
                    {selectedTooth === 6 && !isClosing && (
                      <>
                        <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>P</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                      </>
                    )}
                  </Animated.View>

                  {/* Tooth #5 */}
                  <Animated.View
                    style={[
                      styles.tooth5,
                      {
                        zIndex: selectedTooth === 5 ? 1001 : 999,
                        elevation: selectedTooth === 5 ? 1001 : 999,
                      },
                      {
                        transform: [
                          { translateX: Animated.add(selectedTooth === 5 ? tooth5TranslateX : 0, rightTeethSlide) },
                          { translateY: selectedTooth === 5 ? tooth5TranslateY : 0 },
                          { scale: selectedTooth === 5 ? tooth5Scale : 1 },
                          { rotate: selectedTooth === 5 ? tooth5Rotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['-15deg', '-90deg'],
                          }) : '-15deg' },
                        ],
                      },
                      isEditModeActive && styles.toothGlowEffect,
                    ]}
                  >
                    <ToothWithSectionsSquareMedium
                      colors={toothConditions[5]}
                      onToothPress={() => handleToothPress(5)}
                      onSurfacePress={selectedTooth === 5 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                    borderColor={toothBorderColors[5] ? CONDITION_COLORS[toothBorderColors[5]] : undefined}
                    />


                    {/* Surface labels */}
                    {selectedTooth === 5 && !isClosing && (
                      <>
                        <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>P</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                      </>
                    )}
                  </Animated.View>

                  {/* Tooth #4 */}
                  <Animated.View
                    style={[
                      styles.tooth4,
                      {
                        zIndex: selectedTooth === 4 ? 1001 : (selectedTooth && [5,6,7,8].includes(selectedTooth) ? 998 : 1000),
                        elevation: selectedTooth === 4 ? 1001 : (selectedTooth && [5,6,7,8].includes(selectedTooth) ? 998 : 1000),
                      },
                      {
                        transform: [
                          { translateX: Animated.add(selectedTooth === 4 ? tooth4TranslateX : 0, rightTeethSlide) },
                          { translateY: selectedTooth === 4 ? tooth4TranslateY : 0 },
                          { scale: selectedTooth === 4 ? tooth4Scale : 1 },
                          { rotate: selectedTooth === 4 ? tooth4Rotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['-20deg', '-90deg'],
                          }) : '-20deg' },
                        ],
                      },
                      isEditModeActive && styles.toothGlowEffect,
                    ]}
                  >
                    <ToothWithSectionsSquareMedium
                      colors={toothConditions[4]}
                      onToothPress={() => handleToothPress(4)}
                      onSurfacePress={selectedTooth === 4 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                    borderColor={toothBorderColors[4] ? CONDITION_COLORS[toothBorderColors[4]] : undefined}
                    />


                    {/* Surface labels */}
                    {selectedTooth === 4 && !isClosing && (
                      <>
                        <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>P</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                      </>
                    )}
                  </Animated.View>

                  {/* Tooth #3 */}
                  <Animated.View
                    style={[
                      styles.tooth3,
                      {
                        zIndex: selectedTooth === 3 ? 1001 : (selectedTooth && [5,6,7,8].includes(selectedTooth) ? 998 : 1000),
                        elevation: selectedTooth === 3 ? 1001 : (selectedTooth && [5,6,7,8].includes(selectedTooth) ? 998 : 1000),
                      },
                      {
                        transform: [
                          { translateX: Animated.add(selectedTooth === 3 ? tooth3TranslateX : 0, rightTeethSlide) },
                          { translateY: selectedTooth === 3 ? tooth3TranslateY : 0 },
                          { scale: selectedTooth === 3 ? tooth3Scale : 1 },
                          { rotate: selectedTooth === 3 ? tooth3Rotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['-35deg', '-90deg'],
                          }) : '-35deg' },
                        ],
                      },
                      isEditModeActive && styles.toothGlowEffect,
                    ]}
                  >
                    <ToothWithSectionsSquareMedium
                      colors={toothConditions[3]}
                      onToothPress={() => handleToothPress(3)}
                      onSurfacePress={selectedTooth === 3 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                    borderColor={toothBorderColors[3] ? CONDITION_COLORS[toothBorderColors[3]] : undefined}
                    />


                    {/* Surface labels */}
                    {selectedTooth === 3 && !isClosing && (
                      <>
                        <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>P</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                      </>
                    )}
                  </Animated.View>

                  {/* Tooth #2 */}
                  <Animated.View
                    style={[
                      styles.tooth2,
                      {
                        zIndex: selectedTooth === 2 ? 1001 : (selectedTooth && [5,6,7,8].includes(selectedTooth) ? 998 : 1000),
                        elevation: selectedTooth === 2 ? 1001 : (selectedTooth && [5,6,7,8].includes(selectedTooth) ? 998 : 1000),
                      },
                      {
                        transform: [
                          { translateX: Animated.add(selectedTooth === 2 ? tooth2TranslateX : 0, rightTeethSlide) },
                          { translateY: selectedTooth === 2 ? tooth2TranslateY : 0 },
                          { scale: selectedTooth === 2 ? tooth2Scale : 1 },
                          { rotate: selectedTooth === 2 ? tooth2Rotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['-60deg', '-90deg'],
                          }) : '-60deg' },
                        ],
                      },
                      isEditModeActive && styles.toothGlowEffect,
                    ]}
                  >
                    <ToothWithSectionsSquareMedium
                      colors={toothConditions[2]}
                      onToothPress={() => handleToothPress(2)}
                      onSurfacePress={selectedTooth === 2 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                    borderColor={toothBorderColors[2] ? CONDITION_COLORS[toothBorderColors[2]] : undefined}
                    />


                    {/* Surface labels */}
                    {selectedTooth === 2 && !isClosing && (
                      <>
                        <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>P</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                      </>
                    )}
                  </Animated.View>

                  {/* Tooth #1 - UL 1 */}
                  <Animated.View
                    style={[
                      styles.tooth1,
                      {
                        zIndex: selectedTooth === 1 ? 1001 : (selectedTooth && [5,6,7,8].includes(selectedTooth as number) ? 998 : 1000),
                        elevation: selectedTooth === 1 ? 1001 : (selectedTooth && [5,6,7,8].includes(selectedTooth as number) ? 998 : 1000),
                      },
                      {
                        transform: [
                          { translateX: Animated.add(selectedTooth === 1 ? tooth1TranslateX : 0, rightTeethSlide) },
                          { translateY: selectedTooth === 1 ? tooth1TranslateY : 0 },
                          { scale: selectedTooth === 1 ? tooth1Scale : 1 },
                          { rotate: selectedTooth === 1 ? tooth1Rotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['-80deg', '-90deg'],
                          }) : '-80deg' },
                        ],
                      },
                      isEditModeActive && styles.toothGlowEffect,
                    ]}
                  >
                    <ToothWithSectionsSquareMedium
                      colors={toothConditions[1]}
                      onToothPress={() => handleToothPress(1)}
                      onSurfacePress={selectedTooth === 1 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                    borderColor={toothBorderColors[1] ? CONDITION_COLORS[toothBorderColors[1]] : undefined}
                    />


                    {/* Surface labels */}
                    {selectedTooth === 1 && !isClosing && (
                      <>
                        <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>P</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                      </>
                    )}
                  </Animated.View>
              <Animated.View style={[styles.toothNumber1, { transform: [{ translateX: rightNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>1</Text>
              </Animated.View>

              {/* Tooth #2 Number */}
              <Animated.View style={[styles.toothNumber2, { transform: [{ translateX: rightNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>2</Text>
              </Animated.View>

              {/* Tooth #3 Number */}
              <Animated.View style={[styles.toothNumber3, { transform: [{ translateX: rightNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>3</Text>
              </Animated.View>

              {/* Tooth #4 Number */}
              <Animated.View style={[styles.toothNumber4, { transform: [{ translateX: rightNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>4</Text>
              </Animated.View>

              {/* Tooth #5 Number */}
              <Animated.View style={[styles.toothNumber5, { transform: [{ translateX: rightNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>5</Text>
              </Animated.View>

              {/* Tooth #6 Number */}
              <Animated.View style={[styles.toothNumber6, { transform: [{ translateX: rightNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>6</Text>
              </Animated.View>

              {/* Tooth #7 Number */}
              <Animated.View style={[styles.toothNumber7, { transform: [{ translateX: rightNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>7</Text>
              </Animated.View>

              {/* Tooth #8 Number */}
              <Animated.View style={[styles.toothNumber8, { transform: [{ translateX: rightNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>8</Text>
              </Animated.View>

              {/* Ø§Ù„Ù†Ø§Ø­ÙŠØ© Ø§Ù„ÙŠØ³Ø±Ù‰ - Ø§Ù„Ø£Ø³Ù†Ø§Ù† 9-16 (Ù…Ø±Ø¢Ø© Ù„Ù„Ù†Ø§Ø­ÙŠØ© Ø§Ù„ÙŠÙ…Ù†Ù‰) */}

                  {/* Tooth #9 - ÙŠØ³Ø§Ø± (Ù…Ø«Ù„ 8) */}
                  <Animated.View
                    style={[
                      styles.tooth9,
                      {
                        zIndex: selectedTooth === 9 ? 1001 : (selectedTooth && [9,10,11].includes(selectedTooth) ? 998 : 1000),
                        elevation: selectedTooth === 9 ? 1001 : (selectedTooth && [9,10,11].includes(selectedTooth) ? 998 : 1000),
                      },
                      {
                        transform: [
                          { translateX: Animated.add(selectedTooth === 9 ? tooth9TranslateX : 0, leftTeethSlide) },
                          { translateY: selectedTooth === 9 ? tooth9TranslateY : 0 },
                          { scale: selectedTooth === 9 ? tooth9Scale : 1 },
                          { rotate: selectedTooth === 9 ? tooth9Rotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '90deg'],
                          }) : '0deg' },
                        ],
                      },
                      isEditModeActive && styles.toothGlowEffect,
                    ]}
                  >
                    <ToothWithSectionsSquareTiny
                      colors={toothConditions[9]}
                      onToothPress={() => handleToothPress(9)}
                      onSurfacePress={selectedTooth === 9 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                      rotation={90}
                      borderColor={toothBorderColors[9] ? CONDITION_COLORS[toothBorderColors[9]] : undefined}
                    />

                    {/* Surface labels - Ø®Ø§Ø±Ø¬ Ø­ÙˆØ§Ù Ø§Ù„Ø³Ù† */}
                    {selectedTooth === 9 && !isClosing && (
                      <>
                        {/* Mesial - Ø®Ø§Ø±Ø¬ Ø§Ù„Ø³Ø·Ø­ Ø§Ù„Ø¹Ù„ÙˆÙŠ */}
                        <Text pointerEvents="none" style={{
                          position: 'absolute',
                          top: -4,
                          left: '50%',
                          transform: [{ translateX: -2 }],
                          fontSize: 4,
                          fontWeight: 'bold',
                          color: 'rgba(135, 206, 250, 0.95)',
                        }}>M</Text>

                        {/* Distal - Ø®Ø§Ø±Ø¬ Ø§Ù„Ø³Ø·Ø­ Ø§Ù„Ø³ÙÙ„ÙŠ */}
                        <Text pointerEvents="none" style={{
                          position: 'absolute',
                          bottom: -4,
                          left: '50%',
                          transform: [{ translateX: -2 }],
                          fontSize: 4,
                          fontWeight: 'bold',
                          color: 'rgba(135, 206, 250, 0.95)',
                        }}>D</Text>

                        {/* Buccal - Ø®Ø§Ø±Ø¬ Ø§Ù„Ø³Ø·Ø­ Ø§Ù„Ø£ÙŠØ³Ø± */}
                        <Text pointerEvents="none" style={{
                          position: 'absolute',
                          left: -4,
                          top: '50%',
                          transform: [{ translateY: -0.5 }],
                          fontSize: 4,
                          fontWeight: 'bold',
                          color: 'rgba(135, 206, 250, 0.95)',
                        }}>B</Text>

                        {/* Palatal - Ø®Ø§Ø±Ø¬ Ø§Ù„Ø³Ø·Ø­ Ø§Ù„Ø£ÙŠÙ…Ù† */}
                        <Text pointerEvents="none" style={{
                          position: 'absolute',
                          right: -4,
                          top: '50%',
                          transform: [{ translateY: -0.5 }],
                          fontSize: 4,
                          fontWeight: 'bold',
                          color: 'rgba(135, 206, 250, 0.95)',
                        }}>P</Text>
                      </>
                    )}
                  </Animated.View>

                  {/* Tooth #10 - ÙŠØ³Ø§Ø± (Ù…Ø«Ù„ 7) */}
                  <Animated.View
                    style={[
                      styles.tooth10,
                      {
                        zIndex: selectedTooth === 10 ? 1001 : (selectedTooth && [9,10,11].includes(selectedTooth) ? 998 : 1000),
                        elevation: selectedTooth === 10 ? 1001 : (selectedTooth && [9,10,11].includes(selectedTooth) ? 998 : 1000),
                      },
                      {
                        transform: [
                          { translateX: Animated.add(selectedTooth === 10 ? tooth10TranslateX : 0, leftTeethSlide) },
                          { translateY: selectedTooth === 10 ? tooth10TranslateY : 0 },
                          { scale: selectedTooth === 10 ? tooth10Scale : 1 },
                          { rotate: selectedTooth === 10 ? tooth10Rotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '90deg'],
                          }) : '0deg' },
                        ],
                      },
                      isEditModeActive && styles.toothGlowEffect,
                    ]}
                  >
                    <ToothWithSectionsSquareTiny
                      colors={toothConditions[10]}
                      onToothPress={() => handleToothPress(10)}
                      onSurfacePress={selectedTooth === 10 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                      rotation={90}
                      borderColor={toothBorderColors[10] ? CONDITION_COLORS[toothBorderColors[10]] : undefined}
                    />


                    {/* Surface labels */}
                    {selectedTooth === 10 && !isClosing && (
                      <>
                        <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>P</Text>
                      </>
                    )}
                  </Animated.View>

                  {/* Tooth #11 - ÙŠØ³Ø§Ø± (Ù…Ø«Ù„ 6) */}
                  <Animated.View
                    style={[
                      styles.tooth11,
                      {
                        zIndex: selectedTooth === 11 ? 1001 : (selectedTooth && [9,10,11].includes(selectedTooth) ? 998 : 1000),
                        elevation: selectedTooth === 11 ? 1001 : (selectedTooth && [9,10,11].includes(selectedTooth) ? 998 : 1000),
                      },
                      {
                        transform: [
                          { translateX: Animated.add(selectedTooth === 11 ? tooth11TranslateX : 0, leftTeethSlide) },
                          { translateY: selectedTooth === 11 ? tooth11TranslateY : 0 },
                          { scale: selectedTooth === 11 ? tooth11Scale : 1 },
                          { rotate: selectedTooth === 11 ? tooth11Rotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '90deg'],
                          }) : '0deg' },
                        ],
                      },
                      isEditModeActive && styles.toothGlowEffect,
                    ]}
                  >
                    <ToothWithSectionsSquareTiny
                      colors={toothConditions[11]}
                      onToothPress={() => handleToothPress(11)}
                      onSurfacePress={selectedTooth === 11 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                      rotation={90}
                      borderColor={toothBorderColors[11] ? CONDITION_COLORS[toothBorderColors[11]] : undefined}
                    />


                    {/* Surface labels */}
                    {selectedTooth === 11 && !isClosing && (
                      <>
                        <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>P</Text>
                      </>
                    )}
                  </Animated.View>

                  {/* Tooth #12 - ÙŠØ³Ø§Ø± (Ù…Ø«Ù„ 5) */}
                  <Animated.View
                    style={[
                      styles.tooth12,
                      {
                        zIndex: selectedTooth === 12 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth) ? 998 : 1000),
                        elevation: selectedTooth === 12 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth) ? 998 : 1000),
                      },
                      {
                        transform: [
                          { translateX: Animated.add(selectedTooth === 12 ? tooth12TranslateX : 0, leftTeethSlide) },
                          { translateY: selectedTooth === 12 ? tooth12TranslateY : 0 },
                          { scale: selectedTooth === 12 ? tooth12Scale : 1 },
                          { rotate: selectedTooth === 12 ? tooth12Rotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['15deg', '90deg'],
                          }) : '15deg' },
                        ],
                      },
                      isEditModeActive && styles.toothGlowEffect,
                    ]}
                  >
                    <ToothWithSectionsSquareMedium
                      colors={toothConditions[12]}
                      onToothPress={() => handleToothPress(12)}
                      onSurfacePress={selectedTooth === 12 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                      rotation={90}
                      borderColor={toothBorderColors[12] ? CONDITION_COLORS[toothBorderColors[12]] : undefined}
                    />


                    {/* Surface labels */}
                    {selectedTooth === 12 && !isClosing && (
                      <>
                        <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                        <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>P</Text>
                      </>
                    )}
                  </Animated.View>

              {/* Tooth #13 - ÙŠØ³Ø§Ø± (Ù…Ø«Ù„ 4) */}
              <Animated.View
                style={[
                  styles.tooth13,
                  {
                    zIndex: selectedTooth === 13 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 13 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 13 ? tooth13TranslateX : 0, leftTeethSlide) },
                      { translateY: selectedTooth === 13 ? tooth13TranslateY : 0 },
                      { scale: selectedTooth === 13 ? tooth13Scale : 1 },
                      { rotate: selectedTooth === 13 ? tooth13Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['20deg', '90deg'],
                      }) : '20deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareMedium
                  colors={toothConditions[13]}
                  onToothPress={() => handleToothPress(13)}
                  onSurfacePress={selectedTooth === 13 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                  rotation={90}
                  borderColor={toothBorderColors[13] ? CONDITION_COLORS[toothBorderColors[13]] : undefined}
                />


                {/* Surface labels */}
                {selectedTooth === 13 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>P</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth #14 - ÙŠØ³Ø§Ø± (Ù…Ø«Ù„ 3) */}
              <Animated.View
                style={[
                  styles.tooth14,
                  {
                    zIndex: selectedTooth === 14 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 14 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 14 ? tooth14TranslateX : 0, leftTeethSlide) },
                      { translateY: selectedTooth === 14 ? tooth14TranslateY : 0 },
                      { scale: selectedTooth === 14 ? tooth14Scale : 1 },
                      { rotate: selectedTooth === 14 ? tooth14Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['35deg', '90deg'],
                      }) : '35deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareMedium
                  colors={toothConditions[14]}
                  onToothPress={() => handleToothPress(14)}
                  onSurfacePress={selectedTooth === 14 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                  rotation={90}
                  borderColor={toothBorderColors[14] ? CONDITION_COLORS[toothBorderColors[14]] : undefined}
                />


                {/* Surface labels */}
                {selectedTooth === 14 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>P</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth #15 - ÙŠØ³Ø§Ø± (Ù…Ø«Ù„ 2) */}
              <Animated.View
                style={[
                  styles.tooth15,
                  {
                    zIndex: selectedTooth === 15 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 15 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 15 ? tooth15TranslateX : 0, leftTeethSlide) },
                      { translateY: selectedTooth === 15 ? tooth15TranslateY : 0 },
                      { scale: selectedTooth === 15 ? tooth15Scale : 1 },
                      { rotate: selectedTooth === 15 ? tooth15Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['60deg', '90deg'],
                      }) : '60deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareMedium
                  colors={toothConditions[15]}
                  onToothPress={() => handleToothPress(15)}
                  onSurfacePress={selectedTooth === 15 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                  rotation={90}
                  borderColor={toothBorderColors[15] ? CONDITION_COLORS[toothBorderColors[15]] : undefined}
                />


                {/* Surface labels */}
                {selectedTooth === 15 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>P</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth #16 - ÙŠØ³Ø§Ø± (Ù…Ø«Ù„ 1) */}
              <Animated.View
                style={[
                  styles.tooth16,
                  {
                    zIndex: selectedTooth === 16 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 16 ? 1001 : (selectedTooth && [12,13,14,15,16].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 16 ? tooth16TranslateX : 0, leftTeethSlide) },
                      { translateY: selectedTooth === 16 ? tooth16TranslateY : 0 },
                      { scale: selectedTooth === 16 ? tooth16Scale : 1 },
                      { rotate: selectedTooth === 16 ? tooth16Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['80deg', '90deg'],
                      }) : '80deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareMedium
                  colors={toothConditions[16]}
                  onToothPress={() => handleToothPress(16)}
                  onSurfacePress={selectedTooth === 16 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                  rotation={90}
                  borderColor={toothBorderColors[16] ? CONDITION_COLORS[toothBorderColors[16]] : undefined}
                />


                {/* Surface labels */}
                {selectedTooth === 16 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>P</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth Numbers for Upper Left Quadrant (9-16) */}
              <Animated.View style={[styles.toothNumber9, { transform: [{ translateX: leftNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>1</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber10, { transform: [{ translateX: leftNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>2</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber11, { transform: [{ translateX: leftNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>3</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber12, { transform: [{ translateX: leftNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>4</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber13, { transform: [{ translateX: leftNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>5</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber14, { transform: [{ translateX: leftNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>6</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber15, { transform: [{ translateX: leftNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>7</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber16, { transform: [{ translateX: leftNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>8</Text>
              </Animated.View>

              {/* Ø§Ù„Ø£Ø³Ù†Ø§Ù† Ø§Ù„Ø³ÙÙ„ÙŠØ© - Ø§Ù„Ø¬Ø§Ù†Ø¨ Ø§Ù„Ø£ÙŠÙ…Ù† (17-24) */}

              {/* Tooth #17 - Ø§Ù„Ø³ÙÙ„ÙŠ ÙŠÙ…ÙŠÙ† (Ø£Ø³ÙÙ„ Ù†Ù‚Ø·Ø©) */}
              <Animated.View
                style={[
                  styles.tooth17,
                  {
                    zIndex: selectedTooth === 17 ? 1001 : (selectedTooth && [17,18,19,20,21].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 17 ? 1001 : (selectedTooth && [17,18,19,20,21].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 17 ? tooth17TranslateX : 0, rightTeethSlide) },
                      { translateY: selectedTooth === 17 ? tooth17TranslateY : 0 },
                      { scale: selectedTooth === 17 ? tooth17Scale : 1 },
                      { rotate: selectedTooth === 17 ? tooth17Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['80deg', '90deg'],
                      }) : '80deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareMedium
                  colors={toothConditions[17]}
                  onToothPress={() => handleToothPress(17)}
                  onSurfacePress={selectedTooth === 17 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                borderColor={toothBorderColors[17] ? CONDITION_COLORS[toothBorderColors[17]] : undefined}
                    />


                {/* Surface labels */}
                {selectedTooth === 17 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>L</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth #18 - Ø§Ù„Ø³ÙÙ„ÙŠ ÙŠÙ…ÙŠÙ† */}
              <Animated.View
                style={[
                  styles.tooth18,
                  {
                    zIndex: selectedTooth === 18 ? 1001 : (selectedTooth && [17,18,19,20,21].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 18 ? 1001 : (selectedTooth && [17,18,19,20,21].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 18 ? tooth18TranslateX : 0, rightTeethSlide) },
                      { translateY: selectedTooth === 18 ? tooth18TranslateY : 0 },
                      { scale: selectedTooth === 18 ? tooth18Scale : 1 },
                      { rotate: selectedTooth === 18 ? tooth18Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['60deg', '90deg'],
                      }) : '60deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareMedium
                  colors={toothConditions[18]}
                  onToothPress={() => handleToothPress(18)}
                  onSurfacePress={selectedTooth === 18 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                borderColor={toothBorderColors[18] ? CONDITION_COLORS[toothBorderColors[18]] : undefined}
                    />


                {/* Surface labels */}
                {selectedTooth === 18 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>L</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth #19 - Ø§Ù„Ø³ÙÙ„ÙŠ ÙŠÙ…ÙŠÙ† */}
              <Animated.View
                style={[
                  styles.tooth19,
                  {
                    zIndex: selectedTooth === 19 ? 1001 : (selectedTooth && [17,18,19,20,21].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 19 ? 1001 : (selectedTooth && [17,18,19,20,21].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 19 ? tooth19TranslateX : 0, rightTeethSlide) },
                      { translateY: selectedTooth === 19 ? tooth19TranslateY : 0 },
                      { scale: selectedTooth === 19 ? tooth19Scale : 1 },
                      { rotate: selectedTooth === 19 ? tooth19Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['35deg', '90deg'],
                      }) : '35deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareMedium
                  colors={toothConditions[19]}
                  onToothPress={() => handleToothPress(19)}
                  onSurfacePress={selectedTooth === 19 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                borderColor={toothBorderColors[19] ? CONDITION_COLORS[toothBorderColors[19]] : undefined}
                    />


                {/* Surface labels */}
                {selectedTooth === 19 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>L</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth #20 - Ø§Ù„Ø³ÙÙ„ÙŠ ÙŠÙ…ÙŠÙ† */}
              <Animated.View
                style={[
                  styles.tooth20,
                  {
                    zIndex: selectedTooth === 20 ? 1001 : (selectedTooth && [17,18,19,20,21].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 20 ? 1001 : (selectedTooth && [17,18,19,20,21].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 20 ? tooth20TranslateX : 0, rightTeethSlide) },
                      { translateY: selectedTooth === 20 ? tooth20TranslateY : 0 },
                      { scale: selectedTooth === 20 ? tooth20Scale : 1 },
                      { rotate: selectedTooth === 20 ? tooth20Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['20deg', '90deg'],
                      }) : '20deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareMedium
                  colors={toothConditions[20]}
                  onToothPress={() => handleToothPress(20)}
                  onSurfacePress={selectedTooth === 20 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                borderColor={toothBorderColors[20] ? CONDITION_COLORS[toothBorderColors[20]] : undefined}
                    />


                {/* Surface labels */}
                {selectedTooth === 20 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>L</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth #21 - Ø§Ù„Ø³ÙÙ„ÙŠ ÙŠÙ…ÙŠÙ† */}
              <Animated.View
                style={[
                  styles.tooth21,
                  {
                    zIndex: selectedTooth === 21 ? 1001 : (selectedTooth && [17,18,19,20,21].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 21 ? 1001 : (selectedTooth && [17,18,19,20,21].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 21 ? tooth21TranslateX : 0, rightTeethSlide) },
                      { translateY: selectedTooth === 21 ? tooth21TranslateY : 0 },
                      { scale: selectedTooth === 21 ? tooth21Scale : 1 },
                      { rotate: selectedTooth === 21 ? tooth21Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['15deg', '90deg'],
                      }) : '15deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareMedium
                  colors={toothConditions[21]}
                  onToothPress={() => handleToothPress(21)}
                  onSurfacePress={selectedTooth === 21 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                borderColor={toothBorderColors[21] ? CONDITION_COLORS[toothBorderColors[21]] : undefined}
                    />


                {/* Surface labels */}
                {selectedTooth === 21 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>L</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth #22 - Ø§Ù„Ø³ÙÙ„ÙŠ ÙŠÙ…ÙŠÙ† */}
              <Animated.View
                style={[
                  styles.tooth22,
                  {
                    zIndex: selectedTooth === 22 ? 1001 : (selectedTooth && [22,23,24].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 22 ? 1001 : (selectedTooth && [22,23,24].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 22 ? tooth22TranslateX : 0, rightTeethSlide) },
                      { translateY: selectedTooth === 22 ? tooth22TranslateY : 0 },
                      { scale: selectedTooth === 22 ? tooth22Scale : 1 },
                      { rotate: selectedTooth === 22 ? tooth22Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '90deg'],
                      }) : '0deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareTiny
                  colors={toothConditions[22]}
                  onToothPress={() => handleToothPress(22)}
                  onSurfacePress={selectedTooth === 22 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                borderColor={toothBorderColors[22] ? CONDITION_COLORS[toothBorderColors[22]] : undefined}
                    />


                {/* Surface labels */}
                {selectedTooth === 22 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>L</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth #23 - Ø§Ù„Ø³ÙÙ„ÙŠ ÙŠÙ…ÙŠÙ† */}
              <Animated.View
                style={[
                  styles.tooth23,
                  {
                    zIndex: selectedTooth === 23 ? 1001 : (selectedTooth && [22,23,24].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 23 ? 1001 : (selectedTooth && [22,23,24].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 23 ? tooth23TranslateX : 0, rightTeethSlide) },
                      { translateY: selectedTooth === 23 ? tooth23TranslateY : 0 },
                      { scale: selectedTooth === 23 ? tooth23Scale : 1 },
                      { rotate: selectedTooth === 23 ? tooth23Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '90deg'],
                      }) : '0deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareTiny
                  colors={toothConditions[23]}
                  onToothPress={() => handleToothPress(23)}
                  onSurfacePress={selectedTooth === 23 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                borderColor={toothBorderColors[23] ? CONDITION_COLORS[toothBorderColors[23]] : undefined}
                    />


                {/* Surface labels */}
                {selectedTooth === 23 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>L</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth #24 - Ø§Ù„Ø³ÙÙ„ÙŠ ÙŠÙ…ÙŠÙ† (Ù‚Ø±Ø¨ Ø§Ù„Ø®Ø· Ø§Ù„Ø£ÙÙ‚ÙŠ) */}
              <Animated.View
                style={[
                  styles.tooth24,
                  {
                    zIndex: selectedTooth === 24 ? 1001 : (selectedTooth && [22,23,24].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 24 ? 1001 : (selectedTooth && [22,23,24].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 24 ? tooth24TranslateX : 0, rightTeethSlide) },
                      { translateY: selectedTooth === 24 ? tooth24TranslateY : 0 },
                      { scale: selectedTooth === 24 ? tooth24Scale : 1 },
                      { rotate: selectedTooth === 24 ? tooth24Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '90deg'],
                      }) : '0deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareTiny
                  colors={toothConditions[24]}
                  onToothPress={() => handleToothPress(24)}
                  onSurfacePress={selectedTooth === 24 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                borderColor={toothBorderColors[24] ? CONDITION_COLORS[toothBorderColors[24]] : undefined}
                    />


                {/* Surface labels */}
                {selectedTooth === 24 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>L</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth Numbers for Lower Right Quadrant (17-24) */}
              <Animated.View style={[styles.toothNumber17, { transform: [{ translateX: rightNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>1</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber18, { transform: [{ translateX: rightNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>2</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber19, { transform: [{ translateX: rightNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>3</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber20, { transform: [{ translateX: rightNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>4</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber21, { transform: [{ translateX: rightNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>5</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber22, { transform: [{ translateX: rightNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>6</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber23, { transform: [{ translateX: rightNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>7</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber24, { transform: [{ translateX: rightNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>8</Text>
              </Animated.View>

              {/* Ø§Ù„Ø£Ø³Ù†Ø§Ù† Ø§Ù„Ø³ÙÙ„ÙŠØ© - Ø§Ù„Ø¬Ø§Ù†Ø¨ Ø§Ù„Ø£ÙŠØ³Ø± (25-32) */}

              {/* Tooth #25 - Ø§Ù„Ø³ÙÙ„ÙŠ ÙŠØ³Ø§Ø± */}
              <Animated.View
                style={[
                  styles.tooth25,
                  {
                    zIndex: selectedTooth === 25 ? 1001 : 1000,
                    elevation: selectedTooth === 25 ? 1001 : 1000,
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 25 ? tooth25TranslateX : 0, leftTeethSlide) },
                      { translateY: selectedTooth === 25 ? tooth25TranslateY : 0 },
                      { scale: selectedTooth === 25 ? tooth25Scale : 1 },
                      { rotate: selectedTooth === 25 ? tooth25Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '-90deg'],
                      }) : '0deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareTiny
                  colors={toothConditions[25]}
                  onToothPress={() => handleToothPress(25)}
                  onSurfacePress={selectedTooth === 25 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                borderColor={toothBorderColors[25] ? CONDITION_COLORS[toothBorderColors[25]] : undefined}
                    />


                {/* Surface labels */}
                {selectedTooth === 25 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>L</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth #26 - Ø§Ù„Ø³ÙÙ„ÙŠ ÙŠØ³Ø§Ø± */}
              <Animated.View
                style={[
                  styles.tooth26,
                  {
                    zIndex: selectedTooth === 26 ? 1001 : (selectedTooth && [25].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 26 ? 1001 : (selectedTooth && [25].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 26 ? tooth26TranslateX : 0, leftTeethSlide) },
                      { translateY: selectedTooth === 26 ? tooth26TranslateY : 0 },
                      { scale: selectedTooth === 26 ? tooth26Scale : 1 },
                      { rotate: selectedTooth === 26 ? tooth26Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '-90deg'],
                      }) : '0deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareTiny
                  colors={toothConditions[26]}
                  onToothPress={() => handleToothPress(26)}
                  onSurfacePress={selectedTooth === 26 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                borderColor={toothBorderColors[26] ? CONDITION_COLORS[toothBorderColors[26]] : undefined}
                    />


                {/* Surface labels */}
                {selectedTooth === 26 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>L</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth #27 - Ø§Ù„Ø³ÙÙ„ÙŠ ÙŠØ³Ø§Ø± */}
              <Animated.View
                style={[
                  styles.tooth27,
                  {
                    zIndex: selectedTooth === 27 ? 1001 : (selectedTooth && [25,26].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 27 ? 1001 : (selectedTooth && [25,26].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 27 ? tooth27TranslateX : 0, leftTeethSlide) },
                      { translateY: selectedTooth === 27 ? tooth27TranslateY : 0 },
                      { scale: selectedTooth === 27 ? tooth27Scale : 1 },
                      { rotate: selectedTooth === 27 ? tooth27Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '-90deg'],
                      }) : '0deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareTiny
                  colors={toothConditions[27]}
                  onToothPress={() => handleToothPress(27)}
                  onSurfacePress={selectedTooth === 27 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                borderColor={toothBorderColors[27] ? CONDITION_COLORS[toothBorderColors[27]] : undefined}
                    />


                {/* Surface labels */}
                {selectedTooth === 27 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>L</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth #28 - Ø§Ù„Ø³ÙÙ„ÙŠ ÙŠØ³Ø§Ø± */}
              <Animated.View
                style={[
                  styles.tooth28,
                  {
                    zIndex: selectedTooth === 28 ? 1001 : (selectedTooth && [25,26,27].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 28 ? 1001 : (selectedTooth && [25,26,27].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 28 ? tooth28TranslateX : 0, leftTeethSlide) },
                      { translateY: selectedTooth === 28 ? tooth28TranslateY : 0 },
                      { scale: selectedTooth === 28 ? tooth28Scale : 1 },
                      { rotate: selectedTooth === 28 ? tooth28Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['-15deg', '-90deg'],
                      }) : '-15deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareMedium
                  colors={toothConditions[28]}
                  onToothPress={() => handleToothPress(28)}
                  onSurfacePress={selectedTooth === 28 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                borderColor={toothBorderColors[28] ? CONDITION_COLORS[toothBorderColors[28]] : undefined}
                    />


                {/* Surface labels */}
                {selectedTooth === 28 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>L</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth #29 - Ø§Ù„Ø³ÙÙ„ÙŠ ÙŠØ³Ø§Ø± */}
              <Animated.View
                style={[
                  styles.tooth29,
                  {
                    zIndex: selectedTooth === 29 ? 1001 : (selectedTooth && [25,26,27,28].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 29 ? 1001 : (selectedTooth && [25,26,27,28].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 29 ? tooth29TranslateX : 0, leftTeethSlide) },
                      { translateY: selectedTooth === 29 ? tooth29TranslateY : 0 },
                      { scale: selectedTooth === 29 ? tooth29Scale : 1 },
                      { rotate: selectedTooth === 29 ? tooth29Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['-20deg', '-90deg'],
                      }) : '-20deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareMedium
                  colors={toothConditions[29]}
                  onToothPress={() => handleToothPress(29)}
                  onSurfacePress={selectedTooth === 29 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                borderColor={toothBorderColors[29] ? CONDITION_COLORS[toothBorderColors[29]] : undefined}
                    />


                {/* Surface labels */}
                {selectedTooth === 29 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>L</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth #30 - Ø§Ù„Ø³ÙÙ„ÙŠ ÙŠØ³Ø§Ø± */}
              <Animated.View
                style={[
                  styles.tooth30,
                  {
                    zIndex: selectedTooth === 30 ? 1001 : (selectedTooth && [25,26,27,28].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 30 ? 1001 : (selectedTooth && [25,26,27,28].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 30 ? tooth30TranslateX : 0, leftTeethSlide) },
                      { translateY: selectedTooth === 30 ? tooth30TranslateY : 0 },
                      { scale: selectedTooth === 30 ? tooth30Scale : 1 },
                      { rotate: selectedTooth === 30 ? tooth30Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['-35deg', '-90deg'],
                      }) : '-35deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareMedium
                  colors={toothConditions[30]}
                  onToothPress={() => handleToothPress(30)}
                  onSurfacePress={selectedTooth === 30 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                borderColor={toothBorderColors[30] ? CONDITION_COLORS[toothBorderColors[30]] : undefined}
                    />


                {/* Surface labels */}
                {selectedTooth === 30 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>L</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth #31 - Ø§Ù„Ø³ÙÙ„ÙŠ ÙŠØ³Ø§Ø± */}
              <Animated.View
                style={[
                  styles.tooth31,
                  {
                    zIndex: selectedTooth === 31 ? 1001 : (selectedTooth && [25,26,27,28].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 31 ? 1001 : (selectedTooth && [25,26,27,28].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 31 ? tooth31TranslateX : 0, leftTeethSlide) },
                      { translateY: selectedTooth === 31 ? tooth31TranslateY : 0 },
                      { scale: selectedTooth === 31 ? tooth31Scale : 1 },
                      { rotate: selectedTooth === 31 ? tooth31Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['-60deg', '-90deg'],
                      }) : '-60deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareMedium
                  colors={toothConditions[31]}
                  onToothPress={() => handleToothPress(31)}
                  onSurfacePress={selectedTooth === 31 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                borderColor={toothBorderColors[31] ? CONDITION_COLORS[toothBorderColors[31]] : undefined}
                    />


                {/* Surface labels */}
                {selectedTooth === 31 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>L</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth #32 - Ø§Ù„Ø³ÙÙ„ÙŠ ÙŠØ³Ø§Ø± (Ø£Ø³ÙÙ„ Ù†Ù‚Ø·Ø©) */}
              <Animated.View
                style={[
                  styles.tooth32,
                  {
                    zIndex: selectedTooth === 32 ? 1001 : (selectedTooth && [25,26,27,28].includes(selectedTooth) ? 998 : 1000),
                    elevation: selectedTooth === 32 ? 1001 : (selectedTooth && [25,26,27,28].includes(selectedTooth) ? 998 : 1000),
                  },
                  {
                    transform: [
                      { translateX: Animated.add(selectedTooth === 32 ? tooth32TranslateX : 0, leftTeethSlide) },
                      { translateY: selectedTooth === 32 ? tooth32TranslateY : 0 },
                      { scale: selectedTooth === 32 ? tooth32Scale : 1 },
                      { rotate: selectedTooth === 32 ? tooth32Rotation.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['-80deg', '-90deg'],
                      }) : '-80deg' },
                    ],
                  },
                  isEditModeActive && styles.toothGlowEffect,
                ]}
              >
                <ToothWithSectionsSquareMedium
                  colors={toothConditions[32]}
                  onToothPress={() => handleToothPress(32)}
                  onSurfacePress={selectedTooth === 32 && !isClosing ? (surface) => handleSurfacePress(surface) : undefined}
                borderColor={toothBorderColors[32] ? CONDITION_COLORS[toothBorderColors[32]] : undefined}
                    />


                {/* Surface labels */}
                {selectedTooth === 32 && !isClosing && (
                  <>
                    <Text pointerEvents="none" style={{position: 'absolute', top: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>D</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', bottom: -4, left: '50%', transform: [{ translateX: -2 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>M</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', left: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>B</Text>
                    <Text pointerEvents="none" style={{position: 'absolute', right: -4, top: '50%', transform: [{ translateY: -0.5 }], fontSize: 4, fontWeight: 'bold', color: 'rgba(135, 206, 250, 0.95)'}}>L</Text>
                  </>
                )}
              </Animated.View>

              {/* Tooth Numbers for Lower Left Quadrant (25-32) */}
              <Animated.View style={[styles.toothNumber25, { transform: [{ translateX: leftNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>1</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber26, { transform: [{ translateX: leftNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>2</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber27, { transform: [{ translateX: leftNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>3</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber28, { transform: [{ translateX: leftNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>4</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber29, { transform: [{ translateX: leftNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>5</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber30, { transform: [{ translateX: leftNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>6</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber31, { transform: [{ translateX: leftNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>7</Text>
              </Animated.View>
              <Animated.View style={[styles.toothNumber32, { transform: [{ translateX: leftNumbersSlide }] }]}>
                <Text style={styles.toothNumberText}>8</Text>
              </Animated.View>
              </View>

            {/* Referral Container */}
            <Animated.View
              style={[
                styles.referralContainer,
                {
                  transform: [{ translateX: referralContainerSlide }],
                  opacity: (isTreatmentRecordExpanded || isPlanningRecordExpanded) ? 0 : 1,
                  zIndex: isReferralExpanded ? 10010 : 10003,
                  elevation: isReferralExpanded ? 10010 : 10003,
                }
              ]}
              pointerEvents={isViewModeActive ? 'auto' : 'none'}
            >
              <View
                style={styles.referralTouchable}
                pointerEvents={isViewModeActive ? 'auto' : 'none'}
              >
                <BlurView
                  intensity={80}
                  tint="light"
                  style={styles.referralContent}
                >
                  <View style={styles.referralHeader}>
                    <Text style={styles.referralTitle}>
                      Need Referral For {Object.values(referrals).filter(val => val === true).length > 0 && `(${Object.values(referrals).filter(val => val === true).length})`}
                    </Text>
                  </View>

                  {/* Tab Buttons */}
                  <View style={{
                    flexDirection: 'row',
                    gap: 10,
                    paddingHorizontal: 16,
                    paddingTop: 12,
                    paddingBottom: 8,
                  }}>
                    <TouchableOpacity
                      onPress={() => setReferralTab('department')}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: 10,
                        backgroundColor: referralTab === 'department' ? '#0284C7' : 'rgba(186, 230, 253, 0.3)',
                        borderWidth: 1.5,
                        borderColor: referralTab === 'department' ? '#0284C7' : 'rgba(186, 230, 253, 0.6)',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{
                        fontSize: 14,
                        fontWeight: '700',
                        color: referralTab === 'department' ? '#FFFFFF' : '#0284C7',
                      }}>
                        Department
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setReferralTab('records')}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        paddingHorizontal: 8,
                        borderRadius: 10,
                        backgroundColor: referralTab === 'records' ? '#0284C7' : 'rgba(186, 230, 253, 0.3)',
                        borderWidth: 1.5,
                        borderColor: referralTab === 'records' ? '#0284C7' : 'rgba(186, 230, 253, 0.6)',
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: referralTab === 'records' ? '#FFFFFF' : '#0284C7',
                        }}
                      >
                        Referral Records
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Content Container - Always Visible - Dynamic Height */}
                  <View style={{
                    height: (
                      (referralTab === 'department' && Object.entries(referrals).some(([key, checked]) =>
                        checked && referralStatus[key as keyof typeof referralStatus] === 'not_given'
                      )) ||
                      (referralTab === 'records' && referralRecords.length > 0)
                    ) ? 320 : 70,
                    paddingHorizontal: 16,
                    paddingBottom: 8
                  }}>
                    {/* Department Tab Content */}
                    {referralTab === 'department' && (
                      <>
                        {/* Select Department */}
                        <TouchableOpacity
                          onPress={() => {
                            // ÙØªØ­ ÙÙŠ ÙˆØ¶Ø¹ New - Ù†Ø¸ÙŠÙ Ø¨Ø¯ÙˆÙ† ØªØ­Ø¯ÙŠØ¯Ø§Øª Ø³Ø§Ø¨Ù‚Ø©
                            setDepartmentModalMode('new');
                            // Ø­ÙØ¸ Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ø­Ø§Ù„ÙŠØ© (Ù„Ù„Ø§Ø­ØªÙØ§Ø¸ Ø¨Ù‡Ø§ ÙÙŠ Ø­Ø§Ù„ Cancel)
                            setSavedReferralsState(referrals);
                            setSavedSelectedReferralFor(selectedReferralFor);
                            // ØªÙ‡ÙŠØ¦Ø© Ø§Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„Ù…Ø¤Ù‚ØªØ© - Ù†Ø¸ÙŠÙØ© ØªÙ…Ø§Ù…Ø§Ù‹
                            setTempReferrals({
                              endodontics: false,
                              oralSurgery: false,
                              orthodontics: false,
                              periodontics: false,
                              prosthodontics: false,
                              oralMedicine: false,
                            });
                            setTempSelectedReferralFor({});
                            setShowDepartmentModal(true);
                          }}
                          style={{
                            marginTop: 4,
                            backgroundColor: 'rgba(255, 255, 255, 0.8)',
                            borderWidth: 1.5,
                            borderColor: 'rgba(186, 230, 253, 0.6)',
                            borderRadius: 12,
                            paddingVertical: 12,
                            paddingHorizontal: 16,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <Text style={{ fontSize: 15, fontWeight: '600', color: '#0284C7' }}>
                            Select Department
                          </Text>
                          <Ionicons name="chevron-forward" size={20} color="#7DD3FC" />
                        </TouchableOpacity>

                        {/* Selected Departments Display - Below Input with ScrollView */}
                        {Object.entries(referrals).some(([_, checked]) => checked) && (
                          <View>
                              <ScrollView
                                style={{ marginTop: 10, maxHeight: 242 }}
                                contentContainerStyle={{ paddingBottom: 100 }}
                                showsVerticalScrollIndicator={true}
                                nestedScrollEnabled={true}
                                scrollEnabled={true}
                                onScrollBeginDrag={() => {
                                  // Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø¹Ù†Ø¯ Ø¨Ø¯Ø¡ Ø§Ù„Ø³ÙƒØ±ÙˆÙ„
                                  if (openReferralMenu !== null) {
                                    setOpenReferralMenu(null);
                                  }
                                }}
                              >
                                {Object.entries(referrals).map(([key, checked]) => {
                              if (!checked) return null;
                              // Ø¥Ø®ÙØ§Ø¡ Ø§Ù„Ù‚Ø³Ù… Ø¥Ø°Ø§ ÙƒØ§Ù†Øª Ø­Ø§Ù„ØªÙ‡ "given"
                              if (referralStatus[key as keyof typeof referralStatus] === 'given') return null;

                              // Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ø§Ù„Ø£Ø³Ù†Ø§Ù† Ø§Ù„Ù…Ø­Ø§Ù„Ø© Ù„Ù‡Ø°Ø§ Ø§Ù„Ù‚Ø³Ù…
                              const referredTeeth = Object.entries(selectedReferralFor)
                                .filter(([_, referralKeys]) => referralKeys?.includes(key))
                                .map(([toothNumber, _]) => Number(toothNumber));

                              return (
                                <View
                                  key={key}
                                  style={{
                                    backgroundColor: 'rgba(224, 242, 254, 0.95)',
                                    borderWidth: 2,
                                    borderColor: 'rgba(56, 189, 248, 0.5)',
                                    borderRadius: 14,
                                    padding: 16,
                                    marginBottom: 12,
                                    shadowColor: '#0284C7',
                                    shadowOffset: { width: 0, height: 2 },
                                    shadowOpacity: 0.1,
                                    shadowRadius: 4,
                                    elevation: openReferralMenu === key ? 1000 : 3,
                                    zIndex: openReferralMenu === key ? 1000 : 1,
                                  }}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: referredTeeth.length > 0 ? 8 : 0 }}>
                                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#0284C7' }}>
                                      {getReferralName(key)}
                                    </Text>

                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                      {/* Three-dot menu button */}
                                      <TouchableOpacity
                                        onPress={() => setOpenReferralMenu(openReferralMenu === key ? null : key)}
                                        style={{
                                          padding: 6,
                                          borderRadius: 6,
                                          backgroundColor: 'rgba(148, 163, 184, 0.1)',
                                        }}
                                      >
                                        <Ionicons name="ellipsis-horizontal" size={18} color="#64748B" />
                                      </TouchableOpacity>

                                      {/* Not Given / Given button */}
                                      <TouchableOpacity
                                      onPress={(e) => {
                                        e.stopPropagation();
                                        const currentStatus = referralStatus[key as keyof typeof referralStatus];

                                        if (currentStatus === 'not_given') {
                                          //  ØªØ­Ø¯ÙŠØ« Ø­Ø§Ù„Ø© Ø§Ù„ØªØ­ÙˆÙŠÙ„Ø§Øª ÙÙŠ Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø¥Ù„Ù‰ given
                                          if (permanentPatientId) {
                                            const referralTypeMap: Record<string, string> = {
                                              'endodontics': 'Endodontics',
                                              'oralSurgery': 'Oral Surgery',
                                              'orthodontics': 'Orthodontics',
                                              'prosthodontics': 'Prosthodontics',
                                              'periodontics': 'Periodontics',
                                              'pediatricDentistry': 'Pediatric Dentistry',
                                            };

                                            const referralName = referralTypeMap[key] || key;

                                            // ØªØ­Ø¯ÙŠØ« Ø­Ø§Ù„Ø© Ø¬Ù…ÙŠØ¹ Ø§Ù„ØªØ­ÙˆÙŠÙ„Ø§Øª Ù…Ù† Ù‡Ø°Ø§ Ø§Ù„Ù†ÙˆØ¹ Ø¥Ù„Ù‰ given
                                            supabase
                                              .from('referrals')
                                              .update({
                                                status: 'given',
                                                given_at: new Date().toISOString()
                                              })
                                              .eq('permanent_patient_id', permanentPatientId)
                                              .eq('referral_type', referralName)
                                              .eq('status', 'not_given')
                                              .then(({ error }) => {
                                                if (error) {
                                                  console.error(' Error updating referral status:', error);
                                                } else {
                                                  console.log(' Referrals marked as given in database:', referralName);
                                                  // Ø¥Ø¹Ø§Ø¯Ø© ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ù„ØªØ­Ø¯ÙŠØ« Referral Records
                                                  loadPatientDentalData();
                                                }
                                              });
                                          }

                                          // Ø¥Ù„ØºØ§Ø¡ ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ù‚Ø³Ù… Ø¨Ø¹Ø¯ given (Ø³ÙŠØ®ØªÙÙŠ Ù…Ù† Department tab)
                                          setReferrals(prev => ({ ...prev, [key]: false }));
                                          // Ù…Ø³Ø­ Ø§Ù„Ø£Ø³Ù†Ø§Ù† Ø§Ù„Ù…Ø­Ø§Ù„Ø© Ù„Ù‡Ø°Ø§ Ø§Ù„Ù‚Ø³Ù…
                                          setSelectedReferralFor(prev => {
                                            const newReferrals = { ...prev };
                                            Object.keys(newReferrals).forEach(toothNumber => {
                                              const referralKeys = newReferrals[toothNumber];
                                              if (referralKeys?.includes(key)) {
                                                // Remove this key from the array
                                                const updatedKeys = referralKeys.filter(k => k !== key);
                                                if (updatedKeys.length === 0) {
                                                  delete newReferrals[toothNumber];
                                                } else {
                                                  newReferrals[toothNumber] = updatedKeys;
                                                }
                                              }
                                            });
                                            return newReferrals;
                                          });
                                        }

                                        setReferralStatus(prev => ({
                                          ...prev,
                                          [key]: currentStatus === 'given' ? 'not_given' : 'given'
                                        }));
                                      }}
                                      style={{
                                        backgroundColor: referralStatus[key as keyof typeof referralStatus] === 'given'
                                          ? 'rgba(34, 197, 94, 0.15)'
                                          : 'rgba(156, 163, 175, 0.2)',
                                        paddingVertical: 6,
                                        paddingHorizontal: 12,
                                        borderRadius: 8,
                                        borderWidth: 1,
                                        borderColor: referralStatus[key as keyof typeof referralStatus] === 'given'
                                          ? 'rgba(34, 197, 94, 0.3)'
                                          : 'rgba(156, 163, 175, 0.4)',
                                      }}
                                    >
                                      <Text style={{
                                        fontSize: 13,
                                        fontWeight: '600',
                                        color: referralStatus[key as keyof typeof referralStatus] === 'given'
                                          ? '#16A34A'
                                          : '#6B7280',
                                      }}>
                                        {referralStatus[key as keyof typeof referralStatus] === 'given' ? 'Given' : 'Not Given'}
                                      </Text>
                                    </TouchableOpacity>
                                    </View>
                                  </View>

                                  {/* Ø¹Ø±Ø¶ Ø§Ù„Ø£Ø³Ù†Ø§Ù† Ø§Ù„Ù…Ø­Ø§Ù„Ø© - Ø¯Ø§Ø¦Ù…Ø§Ù‹ */}
                                  {referredTeeth.length > 0 && (
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                                      {referredTeeth.map(toothNumber => (
                                        <ToothNumberBadge key={`${key}-${toothNumber}`} toothNumber={toothNumber} />
                                      ))}
                                    </View>
                                  )}

                                  {/* Three-dot Menu Modal */}
                                  {openReferralMenu === key && (
                                    <View style={{
                                      position: 'absolute',
                                      top: 40,
                                      right: 10,
                                      backgroundColor: 'rgba(224, 242, 254, 0.95)',
                                      borderRadius: 12,
                                      padding: 8,
                                      shadowColor: '#000',
                                      shadowOffset: { width: 0, height: 4 },
                                      shadowOpacity: 0.15,
                                      shadowRadius: 12,
                                      elevation: 1001,
                                      borderWidth: 1,
                                      borderColor: 'rgba(148, 163, 184, 0.2)',
                                      minWidth: 140,
                                      zIndex: 1001,
                                    }}>
                                      {/* Edit Button */}
                                      <TouchableOpacity
                                        onPress={() => {
                                          setOpenReferralMenu(null);
                                          // ÙØªØ­ ÙÙŠ ÙˆØ¶Ø¹ Edit - Ù…Ø¹ Ø§Ù„ØªØ­Ø¯ÙŠØ¯Ø§Øª Ø§Ù„Ø­Ø§Ù„ÙŠØ©
                                          setDepartmentModalMode('edit');
                                          // ÙØªØ­ Ø§Ù„Ù‚Ø³Ù… Ø§Ù„Ù…Ø­Ø¯Ø¯ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ù„ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø£Ø³Ù†Ø§Ù†
                                          setExpandedDepartment(key);
                                          setShowDepartmentModal(true);
                                        }}
                                        style={{
                                          flexDirection: 'row',
                                          alignItems: 'center',
                                          paddingVertical: 10,
                                          paddingHorizontal: 12,
                                          borderRadius: 8,
                                          backgroundColor: 'transparent',
                                        }}
                                      >
                                        <Ionicons name="create-outline" size={18} color="#3B82F6" />
                                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#3B82F6', marginLeft: 10 }}>Edit</Text>
                                      </TouchableOpacity>

                                      {/* Divider */}
                                      <View style={{ height: 1, backgroundColor: 'rgba(148, 163, 184, 0.15)', marginVertical: 4 }} />

                                      {/* Delete Button */}
                                      <TouchableOpacity
                                        onPress={async () => {
                                          setOpenReferralMenu(null);

                                          // Show confirmation alert
                                          Alert.alert(
                                            'Delete Referral',
                                            'Are you sure you want to delete this referral?',
                                            [
                                              {
                                                text: 'Cancel',
                                                style: 'cancel'
                                              },
                                              {
                                                text: 'Delete',
                                                style: 'destructive',
                                                onPress: async () => {
                                                  if (permanentPatientId) {
                                                    const referralTypeMap: Record<string, string> = {
                                                      'endodontics': 'Endodontics',
                                                      'oralSurgery': 'Oral Surgery',
                                                      'orthodontics': 'Orthodontics',
                                                      'prosthodontics': 'Prosthodontics',
                                                      'periodontics': 'Periodontics',
                                                      'oralMedicine': 'Oral Medicine',
                                                    };

                                                    const referralName = referralTypeMap[key] || key;

                                                    // Delete all referrals of this type for this patient
                                                    const { error } = await supabase
                                                      .from('referrals')
                                                      .delete()
                                                      .eq('permanent_patient_id', permanentPatientId)
                                                      .eq('referral_type', referralName)
                                                      .eq('status', 'not_given');

                                                    if (error) {
                                                      console.error('Error deleting referral:', error);
                                                      Alert.alert('Error', 'Failed to delete referral');
                                                    } else {
                                                      // Update UI
                                                      setReferrals(prev => ({ ...prev, [key]: false }));
                                                      setSelectedReferralFor(prev => {
                                                        const newReferrals = { ...prev };
                                                        Object.keys(newReferrals).forEach(toothNumber => {
                                                          const referralKeys = newReferrals[toothNumber];
                                                          if (referralKeys?.includes(key)) {
                                                            const updatedKeys = referralKeys.filter(k => k !== key);
                                                            if (updatedKeys.length === 0) {
                                                              delete newReferrals[toothNumber];
                                                            } else {
                                                              newReferrals[toothNumber] = updatedKeys;
                                                            }
                                                          }
                                                        });
                                                        return newReferrals;
                                                      });
                                                      // Reload patient data
                                                      loadPatientDentalData();
                                                    }
                                                  }
                                                }
                                              }
                                            ]
                                          );
                                        }}
                                        style={{
                                          flexDirection: 'row',
                                          alignItems: 'center',
                                          paddingVertical: 10,
                                          paddingHorizontal: 12,
                                          borderRadius: 8,
                                          backgroundColor: 'transparent',
                                        }}
                                      >
                                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#EF4444', marginLeft: 10 }}>Delete</Text>
                                      </TouchableOpacity>
                                    </View>
                                  )}
                                </View>
                              );
                            })}
                          </ScrollView>
                          </View>
                        )}
                      </>
                    )}

                    {/* Referral Records Tab Content */}
                    {referralTab === 'records' && (
                      <ScrollView
                        style={{ marginTop: 4, maxHeight: 290 }}
                        showsVerticalScrollIndicator={true}
                      >
                        {referralRecords.length === 0 ? (
                          <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 20 }}>
                            No referral records yet
                          </Text>
                        ) : (
                          referralRecords
                            .sort((a, b) => b.timestampNum - a.timestampNum)
                            .map((record, index) => (
                              <View
                                key={index}
                                style={{
                                  backgroundColor: 'rgba(224, 242, 254, 0.95)',
                                  borderWidth: 2,
                                  borderColor: 'rgba(56, 189, 248, 0.5)',
                                  borderRadius: 14,
                                  padding: 16,
                                  marginBottom: 12,
                                  shadowColor: '#0284C7',
                                  shadowOffset: { width: 0, height: 2 },
                                  shadowOpacity: 0.1,
                                  shadowRadius: 4,
                                  elevation: 3,
                                }}
                              >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#0284C7' }}>
                                    {record.departmentName}
                                  </Text>
                                  <View
                                    style={{
                                      backgroundColor: 'rgba(34, 197, 94, 0.15)',
                                      paddingVertical: 4,
                                      paddingHorizontal: 10,
                                      borderRadius: 8,
                                      borderWidth: 1,
                                      borderColor: 'rgba(34, 197, 94, 0.3)',
                                    }}
                                  >
                                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#16A34A' }}>
                                      Given
                                    </Text>
                                  </View>
                                </View>

                                {record.teeth.length > 0 && (
                                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                    {record.teeth.map((toothNumber, idx) => (
                                      <ToothNumberBadge key={`${record.id}-${toothNumber}-${idx}`} toothNumber={toothNumber} />
                                    ))}
                                  </View>
                                )}

                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                                  <Text style={{ fontSize: 12, color: '#64748B' }}>
                                    {record.doctorName}
                                  </Text>
                                  <Text style={{ fontSize: 12, color: '#64748B' }}>
                                    {record.timestamp}
                                  </Text>
                                </View>
                              </View>
                            ))
                        )}
                      </ScrollView>
                    )}
                  </View>
                </BlurView>
              </View>
            </Animated.View>

            {/* Total Treatment Record Container */}
            <Animated.View
              style={[
                styles.treatmentRecordContainer,
                {
                  transform: [
                    { translateX: treatmentRecordSlide },
                    { translateY: treatmentRecordPushDown }
                  ],
                  paddingTop: isTreatmentRecordExpanded ? 20 : (
                    REFERRAL_HEADER_HEIGHT +
                    ((
                      (referralTab === 'department' && Object.entries(referrals).some(([key, checked]) =>
                        checked && referralStatus[key as keyof typeof referralStatus] === 'not_given'
                      )) ||
                      (referralTab === 'records' && referralRecords.length > 0)
                    ) ? REFERRAL_CONTENT_MAX : REFERRAL_CONTENT_MIN) +
                    CONTAINER_SPACING
                  ),
                  paddingHorizontal: isTreatmentRecordExpanded ? 0 : 20,
                  zIndex: isTreatmentRecordExpanded ? 10005 : 10002,
                  elevation: isTreatmentRecordExpanded ? 10005 : 10002,
                  opacity: isPlanningRecordExpanded ? 0 : 1
                }
              ]}
              pointerEvents={isViewModeActive ? 'auto' : 'none'}
            >
                {isTreatmentRecordExpanded ? (
                  <View
                    style={{
                      width: SCREEN_WIDTH * 0.85,
                      height: SCREEN_HEIGHT * 0.75,
                    }}
                  >
                    <BlurView
                      intensity={80}
                      tint="light"
                      style={[styles.additionalContent, {
                        width: '100%',
                        height: '100%',
                      }]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <Text style={styles.additionalTitle}>Total Treatment Record</Text>
                        <TouchableOpacity
                          onPress={() => {
                            setIsTreatmentRecordExpanded(false);
                            Animated.spring(treatmentRecordExpandAnim, {
                              toValue: 0,
                              useNativeDriver: false,
                              friction: 8,
                              tension: 40,
                            }).start();
                          }}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            backgroundColor: 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ fontSize: 22, fontWeight: '700', color: '#9CA3AF' }}>âœ•</Text>
                        </TouchableOpacity>
                      </View>

                  {/* Ù…Ø­ØªÙˆÙ‰ Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ø¹Ù„Ø§Ø¬ÙŠØ© */}
                  {isTreatmentRecordExpanded && (
                    <ScrollView style={{ flex: 1, width: '100%', marginTop: 16, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
                      {(() => {
                        // Ø¬Ù…Ø¹ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ø¹Ù„Ø§Ø¬ÙŠØ©
                        const allRecords: Array<{
                          type: 'treatment' | 'scaling';
                          toothNumber?: number;
                          treatment?: string;
                          details?: string;
                          surfaces?: string[];
                          timestamp: string;
                          timestampNum?: number;
                          doctorName: string;
                        }> = [];

                        // Ø¥Ø¶Ø§ÙØ© Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ø£Ø³Ù†Ø§Ù† (editing records ÙÙ‚Ø·)
                        Object.entries(toothRecords).forEach(([toothNum, records]) => {
                          records.forEach((record) => {
                            if (record.type === 'editing') {
                              allRecords.push({
                                type: 'treatment',
                                toothNumber: parseInt(toothNum),
                                treatment: record.treatment,
                                details: record.details,
                                surfaces: record.surfaces,
                                timestamp: record.timestamp,
                                timestampNum: record.timestampNum,
                                doctorName: record.doctorName,
                              });
                            }
                          });
                        });

                        // Ø¥Ø¶Ø§ÙØ© Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ø³ÙƒÙŠÙ„Ù†Ø¬
                        scalingRecords.forEach((record) => {
                          allRecords.push({
                            type: 'scaling',
                            timestamp: record.timestamp,
                            timestampNum: record.timestampNum,
                            doctorName: record.doctorName,
                          });
                        });

                        // ØªØ±ØªÙŠØ¨ Ù…Ù† Ø§Ù„Ø£Ø­Ø¯Ø« Ù„Ù„Ø£Ù‚Ø¯Ù… - Ø¢Ø®Ø± Ø¥Ø¬Ø±Ø§Ø¡ ÙÙŠ Ø§Ù„Ø£Ø¹Ù„Ù‰
                        allRecords.sort((a, b) => {
                          // Ø§Ù„ØªØ£ÙƒØ¯ Ù…Ù† ÙˆØ¬ÙˆØ¯ timestampNum ØµØ§Ù„Ø­
                          let timeA = 0;
                          let timeB = 0;

                          if (a.timestampNum && !isNaN(a.timestampNum)) {
                            timeA = a.timestampNum;
                          } else {
                            const dateA = new Date(a.timestamp);
                            timeA = !isNaN(dateA.getTime()) ? dateA.getTime() : 0;
                          }

                          if (b.timestampNum && !isNaN(b.timestampNum)) {
                            timeB = b.timestampNum;
                          } else {
                            const dateB = new Date(b.timestamp);
                            timeB = !isNaN(dateB.getTime()) ? dateB.getTime() : 0;
                          }

                          return timeB - timeA; // Ø§Ù„Ø£Ø­Ø¯Ø« (Ø§Ù„Ø£ÙƒØ¨Ø±) ÙÙŠ Ø§Ù„Ø£Ø¹Ù„Ù‰
                        });

                        if (allRecords.length === 0) {
                          return (
                            <Text style={{ color: '#666', textAlign: 'center', paddingVertical: 20 }}>
                              No treatment records yet
                            </Text>
                          );
                        }

                        return allRecords.map((record, index) => (
                          <View
                            key={index}
                            style={{
                              backgroundColor: record.type === 'scaling'
                                ? 'rgba(16, 185, 129, 0.08)'
                                : 'rgba(37, 99, 235, 0.08)',
                              borderRadius: 18,
                              padding: 20,
                              marginBottom: 16,
                              borderWidth: 2,
                              borderColor: record.type === 'scaling'
                                ? 'rgba(16, 185, 129, 0.35)'
                                : 'rgba(37, 99, 235, 0.35)',
                              overflow: 'hidden',
                            }}
                          >
                            {record.type === 'scaling' ? (
                              <>
                                {/* Scaling Title with Badge */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                  <View style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 5,
                                    backgroundColor: '#047857',
                                    marginRight: 10,
                                    shadowColor: '#047857',
                                    shadowOffset: { width: 0, height: 0 },
                                    shadowOpacity: 0.3,
                                    shadowRadius: 4,
                                  }} />
                                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#047857', letterSpacing: 0.3 }}>
                                    Scaling Done
                                  </Text>
                                </View>

                                {/* Footer Info */}
                                <View style={{
                                  borderTopWidth: 1,
                                  borderTopColor: 'rgba(16, 185, 129, 0.2)',
                                  paddingTop: 12,
                                  marginTop: 8,
                                  gap: 6,
                                }}>
                                  <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '500' }}>
                                    {record.timestamp}
                                  </Text>
                                  <Text style={{ fontSize: 13, color: '#047857', fontWeight: '600' }}>
                                    Dr. {record.doctorName}
                                  </Text>
                                </View>
                              </>
                            ) : (
                              <>
                                {/* Tooth Info Header */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 }}>
                                  <ToothNumberBadge toothNumber={record.toothNumber} />
                                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#4B5563', letterSpacing: 0.2 }}>
                                    {getToothName(record.toothNumber).english}
                                  </Text>
                                </View>

                                {/* Treatment Details */}
                                <View style={{ gap: 8, marginBottom: 12 }}>
                                  <View style={{ flexDirection: 'row' }}>
                                    <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                      Treatment:
                                    </Text>
                                    {record.treatment === 'Extraction' || record.treatment === 'Filling' || record.treatment === 'Pulpectomy' ? (
                                      <View style={{
                                        backgroundColor:
                                          record.treatment === 'Extraction'
                                            ? 'rgba(156, 163, 175, 0.15)'
                                            : record.treatment === 'Filling'
                                              ? 'rgba(16, 185, 129, 0.15)'
                                              : 'rgba(139, 92, 246, 0.15)',
                                        paddingHorizontal: 10,
                                        paddingVertical: 4,
                                        borderRadius: 8,
                                        alignSelf: 'flex-start',
                                      }}>
                                        <Text style={{
                                          fontSize: 14,
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
                                      <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                        {record.treatment}
                                      </Text>
                                    )}
                                  </View>

                                  {record.details && (
                                    <View style={{ flexDirection: 'row' }}>
                                      <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                        Details:
                                      </Text>
                                      <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                        {record.details}
                                      </Text>
                                    </View>
                                  )}

                                  <View style={{ flexDirection: 'row' }}>
                                    <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                      Surfaces:
                                    </Text>
                                    <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                      {record.treatment === 'Extraction'
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
                              </>
                            )}
                          </View>
                        ));
                      })()}
                    </ScrollView>
                  )}
                    </BlurView>
                  </View>
                ) : (
                  <View style={styles.referralTouchable}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        console.log('ðŸŽ¯ Total Treatment Record clicked!');
                        setIsTreatmentRecordExpanded(true);
                        Animated.spring(treatmentRecordExpandAnim, {
                          toValue: 1,
                          useNativeDriver: false,
                          friction: 8,
                          tension: 40,
                        }).start();
                      }}
                    >
                      <BlurView
                        intensity={80}
                        tint="light"
                        style={styles.additionalContent}
                      >
                        <Text style={styles.additionalTitle}>Total Treatment Record</Text>
                      </BlurView>
                    </TouchableOpacity>
                  </View>
                )}
            </Animated.View>

            {/* Total Planning Record Container */}
            <Animated.View
              style={[
                styles.planningRecordContainer,
                {
                  transform: [
                    { translateX: planningRecordSlide },
                    { translateY: planningRecordPushDown }
                  ],
                  paddingTop: isPlanningRecordExpanded ? 20 : (
                    REFERRAL_HEADER_HEIGHT +
                    ((
                      (referralTab === 'department' && Object.entries(referrals).some(([key, checked]) =>
                        checked && referralStatus[key as keyof typeof referralStatus] === 'not_given'
                      )) ||
                      (referralTab === 'records' && referralRecords.length > 0)
                    ) ? REFERRAL_CONTENT_MAX : REFERRAL_CONTENT_MIN) +
                    CONTAINER_SPACING +
                    TREATMENT_PLANNING_SPACING
                  ),
                  paddingHorizontal: isPlanningRecordExpanded ? 0 : 20,
                  zIndex: isPlanningRecordExpanded ? 10006 : 10001,
                  elevation: isPlanningRecordExpanded ? 10006 : 10001,
                  opacity: isTreatmentRecordExpanded ? 0 : 1
                }
              ]}
              pointerEvents={isViewModeActive ? 'auto' : 'none'}
            >
              {isPlanningRecordExpanded ? (
                // Expanded state - full view with scrollable records
                <View style={{ width: SCREEN_WIDTH * 0.85, height: SCREEN_HEIGHT * 0.75 }}>
                  <BlurView intensity={80} tint="light" style={[styles.additionalContent, { width: '100%', height: '100%' }]}>
                    {/* Header with title and close button */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <Text style={styles.additionalTitle}>Total Planning Record</Text>
                      <TouchableOpacity
                        onPress={() => {
                          setIsPlanningRecordExpanded(false);
                          Animated.spring(planningRecordExpandAnim, {
                            toValue: 0,
                            useNativeDriver: false,
                            friction: 8,
                            tension: 40,
                          }).start();
                        }}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 22, fontWeight: '700', color: '#9CA3AF' }}>âœ•</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Scrollable planning records list */}
                    <ScrollView style={{ flex: 1, width: '100%', marginTop: 16, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
                      {(() => {
                        // Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¹Ø§Ù…Ø© ÙˆØªØ±ØªÙŠØ¨Ù‡Ø§ Ø­Ø³Ø¨ timestampNum (Ø§Ù„Ø£Ø­Ø¯Ø« Ø£ÙˆÙ„Ø§Ù‹)
                        const sortedRecords = [...allPlanningRecordsGlobal].sort((a, b) => b.timestampNum - a.timestampNum);

                        if (sortedRecords.length === 0) {
                          return (
                            <Text style={{ color: '#666', textAlign: 'center', paddingVertical: 20 }}>
                              No planning records yet
                            </Text>
                          );
                        }

                        // ÙÙ„ØªØ±Ø©: Ø¥Ø®ÙØ§Ø¡ Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø© Ø§Ù„ØªÙŠ ØªÙ… Ø§Ø³ØªØ¨Ø¯Ø§Ù„Ù‡Ø§ Ø¨Ø³Ø¬Ù„Ø§Øª Ø¬Ø¯ÙŠØ¯Ø© (isChange: true)
                        const visibleRecords = sortedRecords.filter((record) => {
                          // Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ø³Ø¬Ù„ ØªØºÙŠÙŠØ± (isChange: true)ØŒ Ù†Ø¹Ø±Ø¶Ù‡ Ø¯Ø§Ø¦Ù…Ø§Ù‹
                          if (record.isChange) {
                            return true;
                          }

                          // Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ø³Ø¬Ù„ Ø¹Ø§Ø¯ÙŠ (isChange: false)ØŒ Ù†ØªØ­Ù‚Ù‚ Ø¥Ø°Ø§ ØªÙ… Ø§Ø³ØªØ¨Ø¯Ø§Ù„Ù‡
                          // Ù†Ø¨Ø­Ø« Ø¹Ù† Ø³Ø¬Ù„ Ø£Ø­Ø¯Ø« (timestampNum Ø£ÙƒØ¨Ø±) Ù„Ù†ÙØ³ Ø§Ù„Ø³Ù† Ù…Ø¹ isChange: true
                          const hasBeenReplaced = sortedRecords.some(r => {
                            if (r.toothNumber !== record.toothNumber) return false;
                            if (r.timestampNum <= record.timestampNum) return false; // ÙŠØ¬Ø¨ Ø£Ù† ÙŠÙƒÙˆÙ† Ø£Ø­Ø¯Ø«
                            if (r.isChange !== true) return false;
                            if (r.previousCondition?.toLowerCase() !== record.condition?.toLowerCase()) return false;

                            // Ø­Ø§Ù„Ø© Ø®Ø§ØµØ©: Extraction ÙŠÙØ³ØªØ¨Ø¯Ù„ Ø¨Ø£ÙŠ Ø­Ø§Ù„Ø© Ø¬Ø¯ÙŠØ¯Ø© Ø¹Ù„Ù‰ Ù†ÙØ³ Ø§Ù„Ø³Ù†
                            if (record.condition === 'Extraction') {
                              return true; // Ø¥Ø®ÙØ§Ø¡ Extraction Ø§Ù„Ù‚Ø¯ÙŠÙ…
                            }

                            // Ù„Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„Ø£Ø®Ø±Ù‰: Ù†ØªØ­Ù‚Ù‚ Ù…Ù† ØªØ·Ø§Ø¨Ù‚ Ø§Ù„Ø³Ø·Ø­
                            return r.surfaces.some(newSurf => {
                              const newSurfName = newSurf.match(/\(([^)]+)\)/)?.[1]?.toLowerCase();
                              return record.surfaces.some(oldSurf => {
                                const oldSurfName = oldSurf.match(/\(([^)]+)\)/)?.[1]?.toLowerCase();
                                return newSurfName === oldSurfName;
                              });
                            });
                          });

                          // Ø¥Ø°Ø§ ØªÙ… Ø§Ø³ØªØ¨Ø¯Ø§Ù„Ù‡ØŒ Ù†Ø®ÙÙŠÙ‡
                          if (hasBeenReplaced) {
                            console.log(`ðŸš« Hiding replaced record: ${record.condition} on tooth ${record.toothNumber}`);
                            return false;
                          }

                          // ÙˆØ¥Ù„Ø§ Ù†Ø¹Ø±Ø¶Ù‡
                          return true;
                        });

                        // ØªØ¬Ù…ÙŠØ¹ Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø­Ø³Ø¨ Ø§Ù„Ù‚ÙˆØ§Ø¹Ø¯ Ø§Ù„ØªØ§Ù„ÙŠØ©:
                        // 1. Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ù…Ù† Ù†ÙØ³ Ø§Ù„Ø³Ù† + Ù†ÙØ³ Ø§Ù„Ù†ÙˆØ¹ (diagnosed Ø£Ùˆ canceled) ØªÙØ¬Ù…Ø¹ Ù…Ø¹Ù‹Ø§ ÙÙŠ ÙƒØ±Øª ÙˆØ§Ø­Ø¯
                        // 2. Ø§Ù„ØªØºÙŠÙŠØ±Ø§Øª (isChange) ØªØ¸Ù‡Ø± ÙÙŠ Ù†ÙØ³ Ø§Ù„ÙƒØ±Øª Ø­ØªÙ‰ Ù„Ùˆ Ù…Ù† Ø·Ø¨ÙŠØ¨ Ù…Ø®ØªÙ„Ù
                        // 3. Ø¥Ø°Ø§ ØªØºÙŠØ± Ø§Ù„Ù†ÙˆØ¹ (Ù…Ù† diagnosed Ø¥Ù„Ù‰ canceled Ø£Ùˆ Ø§Ù„Ø¹ÙƒØ³)ØŒ ÙƒØ±Øª Ø¬Ø¯ÙŠØ¯
                        type RecordGroup = {
                          toothNumber: number;
                          doctorName: string;
                          action: 'diagnosed' | 'canceled';
                          records: typeof visibleRecords;
                        };

                        const groupedRecords: RecordGroup[] = [];

                        visibleRecords.forEach((record) => {
                          const lastGroup = groupedRecords[groupedRecords.length - 1];

                          // Ø´Ø±ÙˆØ· Ø¨Ø¯Ø¡ Ù…Ø¬Ù…ÙˆØ¹Ø© Ø¬Ø¯ÙŠØ¯Ø©:
                          const shouldStartNewGroup =
                            !lastGroup ||
                            lastGroup.toothNumber !== record.toothNumber || // Ø³Ù† Ù…Ø®ØªÙ„Ù
                            lastGroup.action !== record.action; // Ù†ÙˆØ¹ Ù…Ø®ØªÙ„Ù (diagnosed â‰  canceled)

                          if (shouldStartNewGroup) {
                            groupedRecords.push({
                              toothNumber: record.toothNumber,
                              doctorName: record.doctorName,
                              action: record.action,
                              records: [record]
                            });
                          } else {
                            lastGroup.records.push(record);
                          }
                        });

                        // Ø¹Ø±Ø¶ ÙƒÙ„ Ù…Ø¬Ù…ÙˆØ¹Ø© ÙÙŠ ÙƒØ±Øª ÙˆØ§Ø­Ø¯
                        return groupedRecords.map((group, groupIndex) => {
                          // Ø¬Ù…Ø¹ ÙƒÙ„ Ø§Ù„Ù€ surfaces ÙˆØ§Ù„Ù€ conditions Ù…Ù† Ø§Ù„Ø³Ø¬Ù„Ø§Øª ÙÙŠ Ø§Ù„Ù…Ø¬Ù…ÙˆØ¹Ø©
                          const allSurfaces: string[] = [];
                          const allConditions: string[] = [];

                          // Ø¬Ù…Ø¹ surfaces Ù…Ù† Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© (isChange: true) ÙÙ‚Ø·
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
                            // Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ø³Ø¬Ù„ ØªØºÙŠÙŠØ±ØŒ Ø£Ø¶Ù Ø£Ø³Ø·Ø­Ù‡ Ù„Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ù†ÙØµÙ„Ø©
                            if (rec.isChange && rec.surfaces) {
                              rec.surfaces.forEach(surf => {
                                if (!changedSurfaces.includes(surf)) {
                                  changedSurfaces.push(surf);
                                }
                              });
                            }
                          });

                          // Ø§Ø³ØªØ®Ø¯Ø§Ù… timestamp Ø£ÙˆÙ„ Ø³Ø¬Ù„ ÙÙŠ Ø§Ù„Ù…Ø¬Ù…ÙˆØ¹Ø© (Ø§Ù„Ø£Ø­Ø¯Ø«)
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
                              {/* Tooth Info Header */}
                              <View style={{ marginBottom: 14 }}>
                                {/* Row 1: Tooth Badge + Name */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                  <ToothNumberBadge toothNumber={group.toothNumber} />
                                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#4B5563', letterSpacing: 0.2 }}>
                                    {getToothName(group.toothNumber).english}
                                  </Text>
                                </View>

                                {/* Row 2: Diagnosed/Canceled Badge */}
                                <View
                                  style={{
                                    paddingHorizontal: 10,
                                    paddingVertical: 4,
                                    borderRadius: 8,
                                    backgroundColor: group.action === 'diagnosed' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(156, 163, 175, 0.15)',
                                    alignSelf: 'flex-start',
                                  }}
                                >
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: group.action === 'diagnosed' ? '#D97706' : '#6B7280' }}>
                                    {group.action === 'diagnosed' ? 'Diagnosed' : 'Canceled'}
                                  </Text>
                                </View>
                              </View>

                              {/* Ø¹Ø±Ø¶ Ø±Ø³Ø§Ù„Ø© Ø§Ù„ØªØºÙŠÙŠØ± Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ø³Ø¬Ù„ ØªØºÙŠÙŠØ±Ø§Ù‹ */}
                              {(() => {
                                console.log('ðŸ” Planning Record Debug:', {
                                  toothNumber: group.toothNumber,
                                  condition: firstRecord.condition,
                                  isChange: firstRecord.isChange,
                                  previousCondition: firstRecord.previousCondition,
                                  doctorName: group.doctorName
                                });
                                return null;
                              })()}
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
                                    <Text style={{ fontSize: 18, marginRight: 8 }}>ðŸ”„</Text>
                                    <Text style={{ fontSize: 15, color: '#EA580C', fontWeight: '700', letterSpacing: 0.3 }}>
                                      Condition Changed
                                    </Text>
                                  </View>

                                  <View style={{ gap: 6, marginBottom: 10 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                      <Text style={{ fontSize: 16, color: '#DC2626', fontWeight: '600', marginRight: 6 }}>âˆ’</Text>
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
                                  // Ø­Ø§Ù„Ø© Ø®Ø§ØµØ©: Root Canal Treated
                                  // Root Canal Treated ÙŠÙØ­ÙØ¸ ÙƒÙ€ condition="Tooth Status", surfaces=['Root Canal Treated']
                                  const hasRootCanalTreated = allSurfaces.some(s => s === 'Root Canal Treated');

                                  console.log('ðŸ” Planning Details Debug:', {
                                    toothNumber: group.toothNumber,
                                    allConditions,
                                    allSurfaces,
                                    hasRootCanalTreated,
                                    recordsCount: group.records.length,
                                    records: group.records.map(r => ({ condition: r.condition, surfaces: r.surfaces }))
                                  });

                                  if (hasRootCanalTreated) {
                                    console.log(' Root Canal Treated detected! Special rendering...');

                                    // ÙØµÙ„ Root Canal Treated Ø¹Ù† Ø¨Ø§Ù‚ÙŠ Ø§Ù„Ø£Ø³Ø·Ø­
                                    const otherSurfaces = allSurfaces.filter(s => s !== 'Root Canal Treated');

                                    return (
                                      <>
                                        {/* Ø¹Ø±Ø¶ Root Canal Treated ÙƒÙ€ Condition Ø±Ø¦ÙŠØ³ÙŠ */}
                                        <View style={{ flexDirection: 'row' }}>
                                          <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                            Condition:
                                          </Text>
                                          <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                            Root Canal Treated
                                          </Text>
                                        </View>

                                        {/* Ø¹Ø±Ø¶ Ø¨Ø§Ù‚ÙŠ Ø§Ù„Ø£Ø³Ø·Ø­ ØªØ­Øª Surfaces */}
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
                                    // Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ø¹Ø§Ø¯ÙŠØ©: Ø¹Ø±Ø¶ ÙƒÙ„ Ø§Ù„Ù€ conditions Ø¨Ø¯ÙˆÙ† Ù…Ø¹Ø§Ù„Ø¬Ø© Ø®Ø§ØµØ©
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

                              {/* Ø¹Ø±Ø¶ Ù…Ø¤Ù‚Øª Ù„Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„ØªØ±ØªÙŠØ¨ */}
                              <Text style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
                                Group #{groupIndex + 1} - {group.records.length} record(s)
                              </Text>
                            </View>
                          );
                        });
                      })()}
                    </ScrollView>
                  </BlurView>
                </View>
              ) : (
                // Collapsed state - small card
                <View style={styles.referralTouchable}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      console.log('ðŸŽ¯ Total Planning Record clicked!');
                      setIsPlanningRecordExpanded(true);
                      Animated.spring(planningRecordExpandAnim, {
                        toValue: 1,
                        useNativeDriver: false,
                        friction: 8,
                        tension: 40,
                      }).start();
                    }}
                  >
                    <BlurView intensity={80} tint="light" style={styles.additionalContent}>
                      <Text style={styles.additionalTitle}>Total Planning Record</Text>
                    </BlurView>
                  </TouchableOpacity>
                </View>
              )}
            </Animated.View>
          </ScrollView>

        {/* Ø·Ø¨Ù‚Ø© Ø´ÙØ§ÙØ© Ù„Ù„Ù†Ù‚Ø± Ø¹Ù„ÙŠÙ‡Ø§ Ù„Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„Ø£Ø³Ù†Ø§Ù† 1-32 - ØªØºØ·ÙŠ ÙƒÙ„ Ø§Ù„Ø´Ø§Ø´Ø© Ù…Ø§Ø¹Ø¯Ø§ Ù…Ù†Ø·Ù‚Ø© Ø§Ù„Ø³Ù† */}
      {selectedTooth && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].includes(selectedTooth) && !showConditionMenu && !isClosing && (() => {
        // Ø­Ø³Ø§Ø¨ Ø­Ø¯ÙˆØ¯ Ø§Ù„Ø³Ù† Ø§Ù„Ù…ÙƒØ¨Ø±
        // Tiny teeth (6,7,8,9,10,11,22,23,24,25,26,27): 37x47ØŒ Medium teeth (1-5,12-21,28-32): 33x42
        const isTinyTooth = [6, 7, 8, 9, 10, 11, 22, 23, 24, 25, 26, 27].includes(selectedTooth);
        const originalWidth = isTinyTooth ? 37 : 33;
        const originalHeight = isTinyTooth ? 47 : 42;
        // Ù„Ù„Ø£Ø³Ù†Ø§Ù† Ø§Ù„Ù…Ø¯ÙˆØ±Ø© Â±90 Ø¯Ø±Ø¬Ø© (1-32)ØŒ Ù†Ø¹ÙƒØ³ Ø§Ù„Ø£Ø¨Ø¹Ø§Ø¯
        const isRotatedTooth = selectedTooth >= 1 && selectedTooth <= 32;
        let toothWidth = (isRotatedTooth ? originalHeight : originalWidth) * 8;
        let toothHeight = (isRotatedTooth ? originalWidth : originalHeight) * 8;

        let centerX = SCREEN_WIDTH / 2 - 20;
        let centerY = SCREEN_HEIGHT / 2;

        // Ø­Ø³Ø§Ø¨ ÙŠØ¯ÙˆÙŠ Ù…Ø³ØªÙ‚Ù„ Ù„Ù„Ø£Ø³Ù†Ø§Ù† 6, 7, 8, 9, 10, 11 (8, 7, 6 ÙŠÙ…ÙŠÙ† ÙˆÙŠØ³Ø§Ø± ÙÙˆÙ‚)
        if (selectedTooth === 6 || selectedTooth === 7 || selectedTooth === 8 || selectedTooth === 9 || selectedTooth === 10 || selectedTooth === 11) {
          // Ù‚ÙŠÙ… ÙŠØ¯ÙˆÙŠØ© Ù„Ù„Ø·Ø¨Ù‚Ø© Ø§Ù„Ø´ÙØ§ÙØ©
          const originalToothWidth = 37; // tiny tooth
          const originalToothHeight = 47; // tiny tooth

          centerX = SCREEN_WIDTH / 2 - 20; // Ù…Ø±ÙƒØ² Ø§Ù„Ø´Ø§Ø´Ø© Ø£ÙÙ‚ÙŠØ§Ù‹ - Ø²ÙŠØ­ Ù„Ù„ÙŠØ³Ø§Ø±
          centerY = SCREEN_HEIGHT / 2 + 69; // ØªÙ†Ø²ÙŠÙ„ Ù„Ù„Ø£Ø³ÙÙ„ - Ø±ÙØ¹ Ù†Ù‚Ø·Ø©
          toothWidth = originalToothHeight * 8; // 47 * 8 = 376 (Ø¨Ø¹Ø¯ Ø§Ù„Ø¯ÙˆØ±Ø§Ù†)
          toothHeight = originalToothWidth * 8; // 37 * 8 = 296 (Ø¨Ø¹Ø¯ Ø§Ù„Ø¯ÙˆØ±Ø§Ù†)
        }

        // Ø­Ø³Ø§Ø¨ ÙŠØ¯ÙˆÙŠ Ù…Ø³ØªÙ‚Ù„ Ù„Ù„Ø£Ø³Ù†Ø§Ù† 25, 26, 27 (8, 7, 6 ØªØ­Øª ÙŠØ³Ø§Ø±) - Ù†ÙØ³ Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª 8, 7, 6 ÙÙˆÙ‚
        if (selectedTooth === 25 || selectedTooth === 26 || selectedTooth === 27) {
          // Ù‚ÙŠÙ… ÙŠØ¯ÙˆÙŠØ© Ù„Ù„Ø·Ø¨Ù‚Ø© Ø§Ù„Ø´ÙØ§ÙØ©
          const originalToothWidth = 37; // tiny tooth
          const originalToothHeight = 47; // tiny tooth

          centerX = SCREEN_WIDTH / 2 + 30; // Ø¥Ù„Ù‰ Ø§Ù„ÙŠÙ…ÙŠÙ†
          centerY = SCREEN_HEIGHT / 2 + 50; // Ø±ÙØ¹ Ù‚Ù„ÙŠÙ„Ø§Ù‹
          toothWidth = originalToothHeight * 8; // 47 * 8 = 376 (Ø¨Ø¹Ø¯ Ø§Ù„Ø¯ÙˆØ±Ø§Ù†)
          toothHeight = originalToothWidth * 8; // 37 * 8 = 296 (Ø¨Ø¹Ø¯ Ø§Ù„Ø¯ÙˆØ±Ø§Ù†)
        }

        // Ø­Ø³Ø§Ø¨ ÙŠØ¯ÙˆÙŠ Ù…Ø³ØªÙ‚Ù„ Ù„Ù„Ø£Ø³Ù†Ø§Ù† 22, 23, 24 (3, 2, 1 ØªØ­Øª ÙŠÙ…ÙŠÙ†) - Ø­Ø¬Ù… Ø£ÙƒØ¨Ø±
        if (selectedTooth === 22 || selectedTooth === 23 || selectedTooth === 24) {
          const originalToothWidth = 37; // tiny tooth
          const originalToothHeight = 47; // tiny tooth

          centerX = SCREEN_WIDTH / 2 + 10; // ØªØ­Ø±ÙŠÙƒ Ø¥Ù„Ù‰ Ø§Ù„ÙŠØ³Ø§Ø±
          centerY = SCREEN_HEIGHT / 2 + 30; // ØªÙ†Ø²ÙŠÙ„ Ù„Ù„Ø£Ø³ÙÙ„ 20 Ø¨ÙƒØ³Ù„
          toothWidth = originalToothHeight * 8; // 47 * 8 = 376 (Ø­Ø¬Ù… Ø£ÙƒØ¨Ø±)
          toothHeight = originalToothWidth * 8; // 37 * 8 = 296 (Ø­Ø¬Ù… Ø£ÙƒØ¨Ø±)
        }

        // Ø­Ø³Ø§Ø¨ ÙŠØ¯ÙˆÙŠ Ù…Ø³ØªÙ‚Ù„ Ù„Ù„Ø£Ø³Ù†Ø§Ù† 17-21 (8-4 ØªØ­Øª ÙŠÙ…ÙŠÙ†) - Ø­Ø¬Ù… Ø¹Ø§Ø¯ÙŠ
        if (selectedTooth >= 17 && selectedTooth <= 21) {
          const originalToothWidth = 37; // tiny tooth
          const originalToothHeight = 47; // tiny tooth

          centerX = SCREEN_WIDTH / 2 + 10; // ØªØ­Ø±ÙŠÙƒ Ø¥Ù„Ù‰ Ø§Ù„ÙŠØ³Ø§Ø±
          centerY = SCREEN_HEIGHT / 2 + 10; // Ø±ÙØ¹ Ù„Ù„Ø£Ø¹Ù„Ù‰ 40 Ø¨ÙƒØ³Ù„
          toothWidth = originalToothHeight * 7; // 47 * 7 = 329
          toothHeight = originalToothWidth * 7; // 37 * 7 = 259
        }

        // Ø­Ø³Ø§Ø¨ ÙŠØ¯ÙˆÙŠ Ù…Ø³ØªÙ‚Ù„ Ù„Ù„Ø£Ø³Ù†Ø§Ù† 4, 5, 12, 13 (5, 4 ÙŠÙ…ÙŠÙ† ÙˆÙŠØ³Ø§Ø± ÙÙˆÙ‚)
        if (selectedTooth === 4 || selectedTooth === 5 || selectedTooth === 12 || selectedTooth === 13) {
          // Ù‚ÙŠÙ… ÙŠØ¯ÙˆÙŠØ© Ù„Ù„Ø·Ø¨Ù‚Ø© Ø§Ù„Ø´ÙØ§ÙØ©
          const originalToothWidth = 37; // tiny tooth
          const originalToothHeight = 47; // tiny tooth

          centerX = SCREEN_WIDTH / 2; // Ù…Ø±ÙƒØ² Ø§Ù„Ø´Ø§Ø´Ø© Ø£ÙÙ‚ÙŠØ§Ù‹
          centerY = SCREEN_HEIGHT / 2 + 90; // ØªÙ†Ø²ÙŠÙ„ Ù„Ù„Ø£Ø³ÙÙ„ Ø£ÙƒØ«Ø±
          toothWidth = originalToothHeight * 7; // 47 * 7 = 329 (Ø¨Ø¹Ø¯ Ø§Ù„Ø¯ÙˆØ±Ø§Ù† - Ø£ØµØºØ±)
          toothHeight = originalToothWidth * 7; // 37 * 7 = 259 (Ø¨Ø¹Ø¯ Ø§Ù„Ø¯ÙˆØ±Ø§Ù† - Ø£ØµØºØ±)
        }

        // Ø­Ø³Ø§Ø¨ ÙŠØ¯ÙˆÙŠ Ù…Ø³ØªÙ‚Ù„ Ù„Ù„Ø£Ø³Ù†Ø§Ù† 1, 2, 3, 14, 15, 16 (3, 2, 1 ÙŠÙ…ÙŠÙ† ÙˆÙŠØ³Ø§Ø± ÙÙˆÙ‚)
        if (selectedTooth === 1 || selectedTooth === 2 || selectedTooth === 3 || selectedTooth === 14 || selectedTooth === 15 || selectedTooth === 16) {
          // Ù‚ÙŠÙ… ÙŠØ¯ÙˆÙŠØ© Ù„Ù„Ø·Ø¨Ù‚Ø© Ø§Ù„Ø´ÙØ§ÙØ© - Ù†ÙØ³ Ø­Ø¬Ù… Ø§Ù„Ø£Ø³Ù†Ø§Ù† 4ØŒ 5
          centerX = SCREEN_WIDTH / 2; // Ù…Ø±ÙƒØ² Ø§Ù„Ø´Ø§Ø´Ø© Ø£ÙÙ‚ÙŠØ§Ù‹
          centerY = SCREEN_HEIGHT / 2 + 110; // ØªÙ†Ø²ÙŠÙ„ Ù„Ù„Ø£Ø³ÙÙ„ Ø£ÙƒØ«Ø±
          toothWidth = 329; // Ù†ÙØ³ Ø­Ø¬Ù… Ø§Ù„Ø£Ø³Ù†Ø§Ù† 4ØŒ 5
          toothHeight = 259; // Ù†ÙØ³ Ø­Ø¬Ù… Ø§Ù„Ø£Ø³Ù†Ø§Ù† 4ØŒ 5
        }

        // Ø­Ø³Ø§Ø¨ ÙŠØ¯ÙˆÙŠ Ù…Ø³ØªÙ‚Ù„ Ù„Ù„Ø£Ø³Ù†Ø§Ù† 28-32 (8-4 ØªØ­Øª ÙŠØ³Ø§Ø±)
        if (selectedTooth >= 28 && selectedTooth <= 32) {
          const originalToothWidth = 33; // medium tooth
          const originalToothHeight = 42; // medium tooth

          centerX = SCREEN_WIDTH / 2 + 10; // ØªØ­Ø±ÙŠÙƒ 30 Ø¨ÙƒØ³Ù„ Ø¥Ù„Ù‰ Ø§Ù„ÙŠÙ…ÙŠÙ† Ù…Ù† Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ (-20 + 30 = +10)
          centerY = SCREEN_HEIGHT / 2;
          toothWidth = originalToothHeight * 8; // 42 * 8 = 336 (Ø¨Ø¹Ø¯ Ø§Ù„Ø¯ÙˆØ±Ø§Ù†)
          toothHeight = originalToothWidth * 8; // 33 * 8 = 264 (Ø¨Ø¹Ø¯ Ø§Ù„Ø¯ÙˆØ±Ø§Ù†)
        }

        const toothTop = centerY - toothHeight / 2; // Ø§Ù„Ø­Ø¯ Ø§Ù„Ø¹Ù„ÙˆÙŠ Ù„Ù„Ø³Ù†
        const toothBottom = centerY + toothHeight / 2; // Ø§Ù„Ø­Ø¯ Ø§Ù„Ø³ÙÙ„ÙŠ Ù„Ù„Ø³Ù†
        const toothLeft = centerX - toothWidth / 2; // Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£ÙŠØ³Ø± Ù„Ù„Ø³Ù†
        const toothRight = centerX + toothWidth / 2; // Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£ÙŠÙ…Ù† Ù„Ù„Ø³Ù†

        return (
          <>
            {/* Ø§Ù„Ù…Ù†Ø·Ù‚Ø© Ø§Ù„Ø¹Ù„ÙˆÙŠØ© - Ù…Ù† Ø£Ø¹Ù„Ù‰ Ø§Ù„Ø´Ø§Ø´Ø© Ø­ØªÙ‰ Ø§Ù„Ø­Ø¯ Ø§Ù„Ø¹Ù„ÙˆÙŠ Ù„Ù„Ø³Ù† */}
            <TouchableWithoutFeedback onPress={handleCloseTooth}>
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: SCREEN_WIDTH,
                  height: toothTop,
                  zIndex: 998,
                  backgroundColor: 'transparent',
                }}
              />
            </TouchableWithoutFeedback>

            {/* Ø§Ù„Ù…Ù†Ø·Ù‚Ø© Ø§Ù„Ø³ÙÙ„ÙŠØ© - Ù…Ù† Ø§Ù„Ø­Ø¯ Ø§Ù„Ø³ÙÙ„ÙŠ Ù„Ù„Ø³Ù† Ø­ØªÙ‰ Ø£Ø³ÙÙ„ Ø§Ù„Ø´Ø§Ø´Ø© */}
            <TouchableWithoutFeedback onPress={handleCloseTooth}>
              <View
                style={{
                  position: 'absolute',
                  top: toothBottom,
                  left: 0,
                  width: SCREEN_WIDTH,
                  height: SCREEN_HEIGHT - toothBottom,
                  zIndex: 998,
                  backgroundColor: 'transparent',
                }}
              />
            </TouchableWithoutFeedback>

            {/* Ø§Ù„Ù…Ù†Ø·Ù‚Ø© Ø§Ù„ÙŠØ³Ø±Ù‰ - Ù…Ù† ÙŠØ³Ø§Ø± Ø§Ù„Ø´Ø§Ø´Ø© Ø­ØªÙ‰ Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£ÙŠØ³Ø± Ù„Ù„Ø³Ù† */}
            <TouchableWithoutFeedback onPress={handleCloseTooth}>
              <View
                style={{
                  position: 'absolute',
                  top: toothTop,
                  left: 0,
                  width: toothLeft,
                  height: toothHeight,
                  zIndex: 998,
                  backgroundColor: 'transparent',
                }}
              />
            </TouchableWithoutFeedback>

            {/* Ø§Ù„Ù…Ù†Ø·Ù‚Ø© Ø§Ù„ÙŠÙ…Ù†Ù‰ - Ù…Ù† Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£ÙŠÙ…Ù† Ù„Ù„Ø³Ù† Ø­ØªÙ‰ ÙŠÙ…ÙŠÙ† Ø§Ù„Ø´Ø§Ø´Ø© */}
            <TouchableWithoutFeedback onPress={handleCloseTooth}>
              <View
                style={{
                  position: 'absolute',
                  top: toothTop,
                  left: toothRight,
                  width: SCREEN_WIDTH - toothRight,
                  height: toothHeight,
                  zIndex: 998,
                  backgroundColor: 'transparent',
                }}
              />
            </TouchableWithoutFeedback>
          </>
        );
      })()}

      {/* Enlarged Tooth Overlay - Ù„Ø¨Ø§Ù‚ÙŠ Ø§Ù„Ø£Ø³Ù†Ø§Ù† ÙÙ‚Ø· (Ù„ÙŠØ³ Ø§Ù„Ø£Ø³Ù†Ø§Ù† 1-8 Ùˆ 25-32) */}
      {selectedTooth && ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].includes(selectedTooth) && (
        <Modal
          transparent
          visible={!!selectedTooth}
          animationType="fade"
          onRequestClose={handleCloseTooth}
        >
          <View style={styles.enlargedToothOverlay}>
            {/* Background dimmer */}
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={handleCloseTooth}
            />

            {/* Close button */}
            <TouchableOpacity
              style={styles.enlargedToothCloseButton}
              onPress={handleCloseTooth}
            >
              <Ionicons name="close-circle" size={50} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Enlarged tooth container */}
            <View style={styles.enlargedToothContainer}>
              {/* Render the enlarged tooth based on tooth number */}
              {[6, 7, 8, 9, 10, 11, 22, 23, 24, 25, 26, 27].includes(selectedTooth) ? (
                <ToothWithSectionsSquareTiny
                  colors={toothConditions[selectedTooth]}
                  onSurfacePress={(surface) => handleSurfacePress(surface)}
                  swapSides={selectedTooth >= 17 && selectedTooth <= 32}
                />
              ) : (
                <ToothWithSectionsSquareMedium
                  colors={toothConditions[selectedTooth]}
                  onSurfacePress={(surface) => handleSurfacePress(surface)}
                  swapSides={selectedTooth >= 17 && selectedTooth <= 32}
                />
              )}

              {/* Tooth number display */}
              <View style={styles.enlargedToothNumberBadge}>
                <Text style={styles.enlargedToothNumberText}>{getToothLabel(selectedTooth)}</Text>
              </View>
            </View>
          </View>
        </Modal>
      )}

        {/* Condition Menu */}
        <ConditionMenu
          visible={showConditionMenu}
          onSelect={handleConditionSelect}
          onClose={handleConditionMenuClose}
          selectedSurface={selectedSurface}
          selectedTooth={selectedTooth}
        />

        {/* Tooth Details Modal - Edit Mode */}
        <Modal
          visible={showToothDetailsModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => {
            // Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø§Ù„Ù‚ÙŠÙ… Ø§Ù„Ø£ØµÙ„ÙŠØ© Ø£Ùˆ Ø­Ø°Ù Ø§Ù„Ù‚ÙŠÙ… Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© Ø¹Ù†Ø¯ Ø§Ù„Ø¥ØºÙ„Ø§Ù‚ Ø¯ÙˆÙ† Submit
            if (selectedToothForDetails) {
              // Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø£Ùˆ Ø­Ø°Ù Treatment
              setSelectedTreatments(prev => {
                const newState = { ...prev };
                if (originalValues.treatment) {
                  newState[selectedToothForDetails] = originalValues.treatment;
                } else {
                  delete newState[selectedToothForDetails];
                }
                return newState;
              });

              // Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø£Ùˆ Ø­Ø°Ù Details
              setSelectedDetails(prev => {
                const newState = { ...prev };
                if (originalValues.details) {
                  newState[selectedToothForDetails] = originalValues.details;
                } else {
                  delete newState[selectedToothForDetails];
                }
                return newState;
              });

              // Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø£Ùˆ Ø­Ø°Ù Surfaces
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

            setShowToothDetailsModal(false);
            setHasModalChanges(false);
            setShowNotesSection(false);
            setShowReferralSection(false);
            setIsEditMode(false);
            setCurrentNote('');
            setOriginalValues({});
          }}
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
                        // Ø¹Ù†Ø¯ Ø¥Ù„ØºØ§Ø¡ Edit modeØŒ Ø¥Ù„ØºØ§Ø¡ Ø£ÙŠ ØªØºÙŠÙŠØ±Ø§Øª
                        if (isEditMode) {
                          setHasModalChanges(false);
                        }
                      }}
                    >
                      <Ionicons name="create-outline" size={24} color={isEditMode ? "#FFFFFF" : "#1E3A8A"} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        // Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø§Ù„Ù‚ÙŠÙ… Ø§Ù„Ø£ØµÙ„ÙŠØ© Ø£Ùˆ Ø­Ø°Ù Ø§Ù„Ù‚ÙŠÙ… Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© Ø¹Ù†Ø¯ Ø§Ù„Ø¥ØºÙ„Ø§Ù‚ Ø¯ÙˆÙ† Submit
                        if (selectedToothForDetails) {
                          // Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø£Ùˆ Ø­Ø°Ù Treatment
                          setSelectedTreatments(prev => {
                            const newState = { ...prev };
                            if (originalValues.treatment) {
                              newState[selectedToothForDetails] = originalValues.treatment;
                            } else {
                              delete newState[selectedToothForDetails];
                            }
                            return newState;
                          });

                          // Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø£Ùˆ Ø­Ø°Ù Details
                          setSelectedDetails(prev => {
                            const newState = { ...prev };
                            if (originalValues.details) {
                              newState[selectedToothForDetails] = originalValues.details;
                            } else {
                              delete newState[selectedToothForDetails];
                            }
                            return newState;
                          });

                          // Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø£Ùˆ Ø­Ø°Ù Surfaces
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

                        setShowToothDetailsModal(false);
                        setHasModalChanges(false);
                        setShowNotesSection(false);
                        setShowReferralSection(false);
                        setIsEditMode(false);
                        setCurrentNote('');
                        setOriginalValues({});
                      }}
                      style={styles.closeButton}
                    >
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
                      // Clear unread notes badge when opening notes
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
                    {/* Surfaces Section - Ù…Ø®ÙÙŠ Ø¹Ù†Ø¯ Ø§Ø®ØªÙŠØ§Ø± Extraction Ø£Ùˆ Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ø³Ù† Missing Ø£Ùˆ Extraction */}
                    {selectedToothForDetails && (() => {
                      const conditions = toothConditions[selectedToothForDetails];
                      const isMissingTooth = conditions && Object.values(conditions).every(condition => condition === 'missing');
                      const isExtractionTooth = conditions && Object.values(conditions).some(condition => condition === 'extraction');
                      return selectedTreatments[selectedToothForDetails] !== 'extraction' && !isMissingTooth && !isExtractionTooth;
                    })() && (
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
                          // ÙÙ„ØªØ±Ø© Ø§Ù„Ø£Ø³Ø·Ø­ Ø§Ù„Ù…Ø¹Ø§Ù„Ø¬Ø© ÙˆØ§Ù„Ù…ØªØ§Ø¨Ø¹Ø© - Ø¹Ø±Ø¶ Ø§Ù„Ù…Ø´Ø§ÙƒÙ„ ÙÙ‚Ø·
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
                            // Ø¥Ø®ÙØ§Ø¡ Ø§Ù„Ø£Ø³Ø·Ø­ Ø§Ù„Ù…Ø¹Ø§Ù„Ø¬Ø© ÙˆØ§Ù„Ù…ØªØ§Ø¨Ø¹Ø© Ù…Ù† Ø§Ù„Ø§Ø®ØªÙŠØ§Ø±
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

                                  // Mark that changes have been made
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

                  {/* Details Section - Ù…Ø®ÙÙŠ Ø¹Ù†Ø¯ Ø§Ø®ØªÙŠØ§Ø± Extraction Ø£Ùˆ Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ø³Ù† Missing Ø£Ùˆ Extraction */}
                  {selectedToothForDetails && (() => {
                    const conditions = toothConditions[selectedToothForDetails];
                    const isMissingTooth = conditions && Object.values(conditions).every(condition => condition === 'missing');
                    const isExtractionTooth = conditions && Object.values(conditions).some(condition => condition === 'extraction');
                    return selectedTreatments[selectedToothForDetails] !== 'extraction' && !isMissingTooth && !isExtractionTooth;
                  })() && (
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
                                  const selectedReferrals = selectedReferralFor[selectedToothForDetails] || [];
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
                                            ? currentReferrals.filter(r => r !== referral.key)  // Remove if already selected
                                            : [...currentReferrals, referral.key];  // Add if not selected

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
                            {(() => {
                              // ÙÙ„ØªØ±Ø© Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø­Ø³Ø¨ Ø§Ù„Ù†ÙˆØ¹ (planning Ø£Ùˆ editing)
                              const filteredRecords = toothRecords[selectedToothForDetails].filter(r => r.type === recordsType);

                              // ØªØ±ØªÙŠØ¨ Ø­Ø³Ø¨ timestampNum (Ø§Ù„Ø£Ø­Ø¯Ø« Ø£ÙˆÙ„Ø§Ù‹)
                              const sortedRecords = [...filteredRecords].sort((a, b) => b.timestampNum - a.timestampNum);

                              // Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ù†ÙˆØ¹ Ù‡Ùˆ editingØŒ Ù†Ø¹Ø±Ø¶ ÙƒÙ„ Ø³Ø¬Ù„ Ø¨Ø´ÙƒÙ„ Ù…Ù†ÙØµÙ„ (ÙƒÙ…Ø§ Ù‡Ùˆ)
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
                                        {record.treatment === 'Extraction' || record.treatment === 'Filling' || record.treatment === 'Pulpectomy' ? (
                                          <View style={{
                                            backgroundColor:
                                              record.treatment === 'Extraction'
                                                ? 'rgba(156, 163, 175, 0.15)'
                                                : record.treatment === 'Filling'
                                                  ? 'rgba(16, 185, 129, 0.15)'
                                                  : 'rgba(139, 92, 246, 0.15)',
                                            paddingHorizontal: 10,
                                            paddingVertical: 4,
                                            borderRadius: 8,
                                            alignSelf: 'flex-start',
                                          }}>
                                            <Text style={{
                                              fontSize: 14,
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
                                          <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                            {record.treatment}
                                          </Text>
                                        )}
                                      </View>

                                      {record.details && (
                                        <View style={{ flexDirection: 'row' }}>
                                          <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                            Details:
                                          </Text>
                                          <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                            {record.details}
                                          </Text>
                                        </View>
                                      )}

                                      <View style={{ flexDirection: 'row' }}>
                                        <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                          Surfaces:
                                        </Text>
                                        <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                          {record.treatment === 'Extraction'
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

                              // Ø£Ù…Ø§ planning recordsØŒ Ù†Ø·Ø¨Ù‚ Ù…Ù†Ø·Ù‚ Ø§Ù„ØªØ¬Ù…ÙŠØ¹:
                              // 1. ÙƒÙ„ Ø·Ø¨ÙŠØ¨ Ù…Ø®ØªÙ„Ù ÙÙŠ ÙƒØ±Øª Ù…Ù†ÙØµÙ„
                              // 2. Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ù…ØªØªØ§Ù„ÙŠØ© Ù…Ù† Ù†ÙØ³ Ø§Ù„Ø·Ø¨ÙŠØ¨ + Ù†ÙØ³ Ø§Ù„Ù†ÙˆØ¹ (diagnosed Ø£Ùˆ canceled) ØªÙØ¬Ù…Ø¹ Ù…Ø¹Ù‹Ø§
                              // 3. Ø¥Ø°Ø§ ØªØºÙŠØ± Ø§Ù„Ù†ÙˆØ¹ (Ù…Ù† diagnosed Ø¥Ù„Ù‰ canceled Ø£Ùˆ Ø§Ù„Ø¹ÙƒØ³)ØŒ ÙƒØ±Øª Ø¬Ø¯ÙŠØ¯

                              // Ø§Ù„ØªØ£ÙƒØ¯ Ù…Ù† Ø£Ù†Ù†Ø§ Ù†Ø¹Ù…Ù„ ÙÙ‚Ø· Ø¹Ù„Ù‰ planning records
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
                                  lastGroup.action !== record.action; // Ù†ÙˆØ¹ Ù…Ø®ØªÙ„Ù ÙÙ‚Ø· (diagnosed â‰  canceled)

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
                                // Ø¬Ù…Ø¹ ÙƒÙ„ Ø§Ù„Ù€ surfaces ÙˆØ§Ù„Ù€ conditions Ù…Ù† Ø§Ù„Ø³Ø¬Ù„Ø§Øª ÙÙŠ Ø§Ù„Ù…Ø¬Ù…ÙˆØ¹Ø©
                                const allSurfaces: string[] = [];
                                const allConditions: string[] = [];

                                // Ø¬Ù…Ø¹ surfaces Ù…Ù† Ø§Ù„Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø© (isChange: true) ÙÙ‚Ø·
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
                                  // Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ø³Ø¬Ù„ ØªØºÙŠÙŠØ±ØŒ Ø£Ø¶Ù Ø£Ø³Ø·Ø­Ù‡ Ù„Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ù†ÙØµÙ„Ø©
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

                                    {/* Ø¹Ø±Ø¶ Ø±Ø³Ø§Ù„Ø© Ø§Ù„ØªØºÙŠÙŠØ± Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ø³Ø¬Ù„ ØªØºÙŠÙŠØ±Ø§Ù‹ */}
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
                                          <Text style={{ fontSize: 18, marginRight: 8 }}>ðŸ”„</Text>
                                          <Text style={{ fontSize: 15, color: '#EA580C', fontWeight: '700', letterSpacing: 0.3 }}>
                                            Condition Changed
                                          </Text>
                                        </View>

                                        <View style={{ gap: 6, marginBottom: 10 }}>
                                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Text style={{ fontSize: 16, color: '#DC2626', fontWeight: '600', marginRight: 6 }}>âˆ’</Text>
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
                                        // Ø­Ø§Ù„Ø© Ø®Ø§ØµØ©: Root Canal Treated
                                        // Root Canal Treated ÙŠÙØ­ÙØ¸ ÙƒÙ€ condition="Tooth Status", surfaces=['Root Canal Treated']
                                        const hasRootCanalTreated = allSurfaces.some(s => s === 'Root Canal Treated');

                                        if (hasRootCanalTreated) {
                                          // ÙØµÙ„ Root Canal Treated Ø¹Ù† Ø¨Ø§Ù‚ÙŠ Ø§Ù„Ø£Ø³Ø·Ø­
                                          const otherSurfaces = allSurfaces.filter(s => s !== 'Root Canal Treated');

                                          return (
                                            <>
                                              {/* Ø¹Ø±Ø¶ Root Canal Treated ÙƒÙ€ Condition Ø±Ø¦ÙŠØ³ÙŠ */}
                                              <View style={{ flexDirection: 'row' }}>
                                                <Text style={{ fontSize: 14, color: '#2563EB', fontWeight: '600', minWidth: 90 }}>
                                                  Condition:
                                                </Text>
                                                <Text style={{ fontSize: 14, color: '#1F2937', fontWeight: '500', flex: 1 }}>
                                                  Root Canal Treated
                                                </Text>
                                              </View>

                                              {/* Ø¹Ø±Ø¶ Ø¨Ø§Ù‚ÙŠ Ø§Ù„Ø£Ø³Ø·Ø­ ØªØ­Øª Surfaces */}
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
                                          // Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ø¹Ø§Ø¯ÙŠØ©: Ø¹Ø±Ø¶ ÙƒÙ„ Ø§Ù„Ù€ conditions Ø¨Ø¯ÙˆÙ† Ù…Ø¹Ø§Ù„Ø¬Ø© Ø®Ø§ØµØ©
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
                            })()}
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
                    onPress={async () => {
                      if (!hasModalChanges || !selectedToothForDetails) return;

                      // Save note if there's text
                      if (currentNote.trim()) {
                        const now = new Date();
                        const timestamp = now.toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        });

                        const existingNotes = toothNotes[selectedToothForDetails] || [];
                        setToothNotes(prev => ({
                          ...prev,
                          [selectedToothForDetails]: [
                            ...existingNotes,
                            { text: currentNote.trim(), timestamp, doctorName: user?.name || 'Dr. Unknown' }
                          ]
                        }));

                        // Save tooth note to database
                        if (permanentPatientId && user?.name && typeof selectedToothForDetails === 'number') {
                          const palmerNotation = convertNumberToPalmer(selectedToothForDetails);
                          if (palmerNotation) {
                            const { error: noteError } = await createToothNote(
                              permanentPatientId,
                              palmerNotation,
                              currentNote.trim(),
                              user.name
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
                        if (permanentPatientId && user?.name && typeof selectedToothForDetails === 'number') {
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
                                user.name
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
                          const timestamp = now.toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          });

                          const treatmentLabel = treatment ? treatmentOptions.find(opt => opt.key === treatment)?.label || treatment : 'N/A';
                          const detailsLabel = details ? detailsOptions.find(opt => opt.key === details)?.label || details : 'N/A';

                          // Ø§Ù„Ø­ØµÙˆÙ„ Ø¹Ù„Ù‰ Ø£Ø³Ù…Ø§Ø¡ Ø§Ù„Ø£Ø³Ø·Ø­ Ø§Ù„Ù…Ø­Ø¯Ø¯Ø©
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
                                doctorName: user?.name || 'Dr. Unknown',
                                type: 'editing'
                              }
                            ]
                          }));

                          // Save editing record to database
                          if (permanentPatientId && user?.name && typeof selectedToothForDetails === 'number') {
                            const palmerNotation = convertNumberToPalmer(selectedToothForDetails);
                            if (palmerNotation) {
                              // Map UI surface keys to database surface names
                              // Use helper function to get correct mapping for lower teeth
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
                                user.name,
                                detailsLabel
                              );

                              if (editingError) {
                                console.error(' Error saving editing record:', editingError);
                              } else {
                                console.log(' Saved editing record to database');
                              }

                              // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                              // IMPORTANT: Also save colors to tooth_surface_conditions
                              // This ensures colors persist after reload
                              // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                              // Save surface colors for Filling and Pulpectomy (if Details selected)
                              if (selectedSurfacesForTooth.length > 0 && details && (treatment === 'filling' || treatment === 'pulpectomy')) {
                                // Determine color based on details
                                let conditionColor: ToothCondition;
                                if (details === 'temporary_filling') {
                                  conditionColor = 'filling_replacement';  // Ø±Ù…Ø§Ø¯ÙŠ
                                } else if (details === 'permanent_filling') {
                                  conditionColor = 'permanent_filling';    // Ø£Ø®Ø¶Ø±
                                } else if (details === 'gi_filling') {
                                  conditionColor = 'gi';                   // Ø£Ø®Ø¶Ø±
                                } else if (details === 'direct_pulp_capping') {
                                  conditionColor = 'direct_pulp_capping';  // Ø£Ø®Ø¶Ø±
                                } else if (details === 'indirect_pulp_capping') {
                                  conditionColor = 'indirect_pulp_capping'; // Ø£Ø®Ø¶Ø±
                                } else {
                                  conditionColor = 'treated';              // fallback
                                }

                                // Save to tooth_surface_conditions for each selected surface
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

                          // ØªØ­ÙˆÙŠÙ„ Ù„ÙˆÙ† Ø§Ù„Ø£Ø³Ø·Ø­ Ø§Ù„Ù…Ø­Ø¯Ø¯Ø© Ø¨Ù†Ø§Ø¡Ù‹ Ø¹Ù„Ù‰ Ù†ÙˆØ¹ Ø§Ù„Ø­Ø´ÙˆØ© Ø§Ù„Ù…Ø®ØªØ§Ø± (UI only)
                          if (selectedSurfacesForTooth.length > 0) {
                            // ØªØ¹Ø·ÙŠÙ„ Planning Record Ù„Ø£Ù† Ù‡Ø°Ø§ Editing Record
                            skipPlanningRecordRef.current = true;

                            setToothConditions(prev => {
                              const existingConditions = prev[selectedToothForDetails] || {};
                              const updatedConditions: ToothSurfaceConditions = { ...existingConditions };

                              // ØªØ­Ø¯ÙŠØ¯ Ø§Ù„Ù„ÙˆÙ† Ø¨Ù†Ø§Ø¡Ù‹ Ø¹Ù„Ù‰ Ù†ÙˆØ¹ Ø§Ù„Ø­Ø´ÙˆØ©
                              let conditionColor: ToothCondition;
                              if (details === 'temporary_filling') {
                                conditionColor = 'filling_replacement';  // Ø±Ù…Ø§Ø¯ÙŠ #808080
                              } else if (details === 'permanent_filling') {
                                conditionColor = 'permanent_filling';    // Ø£Ø®Ø¶Ø± #10B981
                              } else if (details === 'gi_filling') {
                                conditionColor = 'gi';                   // Ø£Ø®Ø¶Ø± #10B981
                              } else if (details === 'direct_pulp_capping') {
                                conditionColor = 'direct_pulp_capping';  // Ø£Ø®Ø¶Ø± #10B981
                              } else if (details === 'indirect_pulp_capping') {
                                conditionColor = 'indirect_pulp_capping'; // Ø£Ø®Ø¶Ø± #10B981
                              } else {
                                conditionColor = 'treated';              // Ø¹Ù†Ø§Ø¨ÙŠ Ù„Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„Ø£Ø®Ø±Ù‰
                              }

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

                          // ØªØºÙŠÙŠØ± Ù„ÙˆÙ† Ø­Ø¯ÙˆØ¯ Ø§Ù„Ø³Ù† Ø¥Ù„Ù‰ Ø¹Ù†Ø§Ø¨ÙŠ Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ø¹Ù„Ø§Ø¬ pulpectomy
                          if (treatment === 'pulpectomy') {
                            // ØªØ¹Ø·ÙŠÙ„ Planning Record Ù„Ø£Ù† Ù‡Ø°Ø§ Editing Record
                            skipPlanningRecordRef.current = true;

                            setToothBorderColors(prev => ({
                              ...prev,
                              [selectedToothForDetails]: 'pulpectomy'
                            }));

                            console.log(` Set border color for tooth ${selectedToothForDetails} to 'pulpectomy' (border only, no surface colors)`);
                            // Border color will be detected from editing_records on reload
                            // Do NOT save any surface conditions
                          }

                          // Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„Ø¹Ù„Ø§Ø¬ extractionØŒ Ø¬Ø¹Ù„ Ø§Ù„Ø³Ù† missing (Ø¹Ù„Ø§Ù…Ø© X)
                          if (treatment === 'extraction') {
                            // ØªØ¹Ø·ÙŠÙ„ Planning Record Ù„Ø£Ù† Ù‡Ø°Ø§ Editing Record
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
                      setShowToothDetailsModal(false);
                      setHasModalChanges(false);
                      setShowNotesSection(false);
                      setShowReferralSection(false);
                      setIsEditMode(false);
                      setOriginalValues({}); // Ù…Ø³Ø­ Ø§Ù„Ù‚ÙŠÙ… Ø§Ù„Ø£ØµÙ„ÙŠØ© Ø¨Ø¹Ø¯ Ø§Ù„Ø­ÙØ¸
                    }}
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

        {/* Department Selection Modal */}
        <Modal
          transparent
          visible={showDepartmentModal}
          animationType="fade"
          onRequestClose={() => {
            // Ø¥Ø°Ø§ ÙƒÙ†Ø§ ÙÙŠ ÙˆØ¶Ø¹ New ÙˆØ§Ø³ØªØ¹Ø§Ø¯Ø© Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø©
            if (departmentModalMode === 'new' && savedReferralsState && savedSelectedReferralFor) {
              setReferrals(savedReferralsState);
              setSelectedReferralFor(savedSelectedReferralFor);
              setSavedReferralsState(null);
              setSavedSelectedReferralFor(null);
            }
            setShowDepartmentModal(false);
          }}
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
                  {departmentModalMode === 'edit'
                    ? `Edit ${(() => {
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
                          return names[selectedDept[0]] || 'Referral';
                        }
                        return 'Referral';
                      })()}`
                    : 'Select Departments'
                  }
                </Text>
              </View>

              {/* Departments List */}
              <ScrollView style={{ maxHeight: 500, padding: 20 }} showsVerticalScrollIndicator={false}>
                {/* Endodontics */}
                {(departmentModalMode === 'new' || (departmentModalMode === 'edit' && referrals.endodontics)) && (
                <View style={{ marginBottom: 12 }}>
                  <TouchableOpacity
                    disabled={departmentModalMode === 'edit'}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 18,
                      borderRadius: 14,
                      backgroundColor: 'rgba(255, 255, 255, 0.8)',
                      borderWidth: 1.5,
                      borderColor: (departmentModalMode === 'new' ? tempReferrals.endodontics : referrals.endodontics) ? 'rgba(125, 211, 252, 0.8)' : 'rgba(186, 230, 253, 0.4)',
                    }}
                    onPress={async () => {
                      // ÙÙŠ ÙˆØ¶Ø¹ "new": Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„Ù…Ø¤Ù‚ØªØ© Ø¯ÙˆÙ† Ø­ÙØ¸
                      if (departmentModalMode === 'new') {
                        const currentlySelected = tempReferrals.endodontics;
                        setSelectedReferral('endodontics');

                        if (!currentlySelected) {
                          // ØºÙŠØ± Ù…Ø­Ø¯Ø¯: ØªØ­Ø¯ÙŠØ¯Ù‡ + ÙØªØ­ Ø§Ù„Ø£Ø³Ù†Ø§Ù†
                          setTempReferrals(prev => ({ ...prev, endodontics: true }));
                          setExpandedDepartment('endodontics');
                        } else {
                          // Ù…Ø­Ø¯Ø¯ Ø¨Ø§Ù„ÙØ¹Ù„: ÙÙ‚Ø· toggle Ø§Ù„Ù€ expansion
                          if (expandedDepartment === 'endodontics') {
                            setExpandedDepartment(null);
                          } else {
                            setExpandedDepartment('endodontics');
                          }
                        }
                        return;
                      }

                      // ÙÙŠ ÙˆØ¶Ø¹ "edit": Ø§Ù„Ø­ÙØ¸ Ø§Ù„ÙÙˆØ±ÙŠ ÙƒØ§Ù„Ù…Ø¹ØªØ§Ø¯
                      const newValue = !referrals.endodontics;
                      setSelectedReferral('endodontics');

                      setReferrals(prev => {
                        if (newValue) {
                          setReferralStatus(prevStatus => ({ ...prevStatus, endodontics: 'not_given' }));
                        }
                        return { ...prev, endodontics: newValue };
                      });

                      // Toggle expansion
                      if (expandedDepartment === 'endodontics') {
                        setExpandedDepartment(null);
                      } else {
                        setExpandedDepartment('endodontics');
                      }

                      // Save/Delete based on newValue
                      if (newValue && permanentPatientId && user?.name) {
                        // Save as general referral
                        const { error: referralError } = await createReferral(
                          permanentPatientId,
                          null,
                          'Endodontics',
                          user.name
                        );

                        if (referralError) {
                          console.error('âŒ Error saving general referral Endodontics:', referralError);
                        } else {
                          console.log('âœ… Saved general referral Endodontics to database');
                          await loadPatientDentalData();
                        }
                      } else if (!newValue && permanentPatientId) {
                        // Delete all referrals for this department
                        const { error: deleteError } = await supabase
                          .from('referrals')
                          .delete()
                          .eq('permanent_patient_id', permanentPatientId)
                          .eq('referral_type', 'Endodontics')
                          .eq('status', 'not_given');

                        if (deleteError) {
                          console.error('âŒ Error deleting referrals Endodontics:', deleteError);
                        } else {
                          console.log('âœ… Deleted all referrals Endodontics from database');
                          await loadPatientDentalData();
                        }

                        // Clear selected teeth
                        setSelectedReferralFor(prev => {
                          const newState = { ...prev };
                          Object.keys(newState).forEach(tooth => {
                            newState[tooth] = newState[tooth].filter(r => r !== 'endodontics');
                          });
                          return newState;
                        });
                      }
                    }}
                  >
                    <View style={[styles.checkbox, (departmentModalMode === 'new' ? tempReferrals.endodontics : referrals.endodontics) && styles.checkboxChecked]}>
                      {(departmentModalMode === 'new' ? tempReferrals.endodontics : referrals.endodontics) && <Text style={styles.checkmark}>âœ“</Text>}
                    </View>
                    <Text style={styles.referralText}>1- Endodontics</Text>
                    <View style={{ flex: 1 }} />
                    <Ionicons
                      name={expandedDepartment === 'endodontics' ? "chevron-up" : "chevron-down"}
                      size={20}
                      color="#0284C7"
                    />
                  </TouchableOpacity>

                  {/* Teeth Selection */}
                  {expandedDepartment === 'endodontics' && (departmentModalMode === 'new' ? tempReferrals.endodontics : referrals.endodontics) && (
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

                      {/* UL Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>UL</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `UL${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = departmentModalMode === 'new'
                              ? (toothNum && tempSelectedReferralFor[toothNum]?.includes('endodontics'))
                              : (toothNum && selectedReferralFor[toothNum]?.includes('endodontics'));
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  // ÙÙŠ ÙˆØ¶Ø¹ "new": Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„Ù…Ø¤Ù‚ØªØ© ÙÙ‚Ø·
                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('endodontics');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'endodontics']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'endodontics')
                                      }));
                                    }
                                    return;
                                  }

                                  // ÙÙŠ ÙˆØ¶Ø¹ "edit": Ø§Ù„Ø­ÙØ¸ Ø§Ù„ÙÙˆØ±ÙŠ ÙƒØ§Ù„Ù…Ø¹ØªØ§Ø¯
                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('endodontics');

                                    if (!isCurrentlySelected) {
                                      // Adding tooth - delete general referral first
                                      await supabase
                                        .from('referrals')
                                        .delete()
                                        .eq('permanent_patient_id', permanentPatientId)
                                        .eq('referral_type', 'Endodontics')
                                        .is('tooth_number', null)
                                        .eq('status', 'not_given');

                                      // Save tooth-specific referral
                                      const { error } = await createReferral(
                                        permanentPatientId,
                                        toothNumber,
                                        'Endodontics',
                                        user.name
                                      );

                                      if (!error) {
                                        setSelectedReferralFor(prev => ({
                                          ...prev,
                                          [toothNum]: [...(prev[toothNum] || []), 'endodontics']
                                        }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      // Removing tooth
                                      await supabase
                                        .from('referrals')
                                        .delete()
                                        .eq('permanent_patient_id', permanentPatientId)
                                        .eq('referral_type', 'Endodontics')
                                        .eq('tooth_number', toothNumber)
                                        .eq('status', 'not_given');

                                      setSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'endodontics')
                                      }));

                                      // Check if no teeth left, create general referral
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs =>
                                        refs.includes('endodontics') && refs.length > 0
                                      );

                                      if (!hasOtherTeeth) {
                                        await createReferral(permanentPatientId, null, 'Endodontics', user.name);
                                      }

                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>
                                  {num}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* UR Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>UR</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `UR${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = departmentModalMode === 'new'
                              ? (toothNum && tempSelectedReferralFor[toothNum]?.includes('endodontics'))
                              : (toothNum && selectedReferralFor[toothNum]?.includes('endodontics'));
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  // ÙÙŠ ÙˆØ¶Ø¹ "new": Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„Ù…Ø¤Ù‚ØªØ© ÙÙ‚Ø·
                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('endodontics');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'endodontics']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'endodontics')
                                      }));
                                    }
                                    return;
                                  }

                                  // ÙÙŠ ÙˆØ¶Ø¹ "edit": Ø§Ù„Ø­ÙØ¸ Ø§Ù„ÙÙˆØ±ÙŠ ÙƒØ§Ù„Ù…Ø¹ØªØ§Ø¯
                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('endodontics');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Endodontics').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Endodontics', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'endodontics'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Endodontics').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'endodontics') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('endodontics') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Endodontics', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>{num}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* LR Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>LR</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `LR${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = departmentModalMode === 'new'
                              ? (toothNum && tempSelectedReferralFor[toothNum]?.includes('endodontics'))
                              : (toothNum && selectedReferralFor[toothNum]?.includes('endodontics'));
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('endodontics');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'endodontics']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'endodontics')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('endodontics');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Endodontics').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Endodontics', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'endodontics'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Endodontics').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'endodontics') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('endodontics') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Endodontics', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>{num}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* LL Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>LL</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `LL${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = departmentModalMode === 'new'
                              ? (toothNum && tempSelectedReferralFor[toothNum]?.includes('endodontics'))
                              : (toothNum && selectedReferralFor[toothNum]?.includes('endodontics'));
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('endodontics');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'endodontics']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'endodontics')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('endodontics');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Endodontics').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Endodontics', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'endodontics'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Endodontics').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'endodontics') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('endodontics') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Endodontics', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>{num}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  )}
                </View>
                )}

                {/* Oral Surgery */}
                {(departmentModalMode === 'new' || (departmentModalMode === 'edit' && referrals.oralSurgery)) && (
                <View style={{ marginBottom: 12 }}>
                  <TouchableOpacity
                    disabled={departmentModalMode === 'edit'}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 18,
                      borderRadius: 14,
                      backgroundColor: 'rgba(255, 255, 255, 0.8)',
                      borderWidth: 1.5,
                      borderColor: referrals.oralSurgery ? 'rgba(125, 211, 252, 0.8)' : 'rgba(186, 230, 253, 0.4)',
                    }}
                    onPress={async () => {
                      // ÙÙŠ ÙˆØ¶Ø¹ "new": Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„Ù…Ø¤Ù‚ØªØ© Ø¯ÙˆÙ† Ø­ÙØ¸
                      if (departmentModalMode === 'new') {
                        const currentlySelected = tempReferrals.oralSurgery;
                        setSelectedReferral('oralSurgery');

                        if (!currentlySelected) {
                          // ØºÙŠØ± Ù…Ø­Ø¯Ø¯: ØªØ­Ø¯ÙŠØ¯Ù‡ + ÙØªØ­ Ø§Ù„Ø£Ø³Ù†Ø§Ù†
                          setTempReferrals(prev => ({ ...prev, oralSurgery: true }));
                          setExpandedDepartment('oralSurgery');
                        } else {
                          // Ù…Ø­Ø¯Ø¯ Ø¨Ø§Ù„ÙØ¹Ù„: ÙÙ‚Ø· toggle Ø§Ù„Ù€ expansion
                          if (expandedDepartment === 'oralSurgery') {
                            setExpandedDepartment(null);
                          } else {
                            setExpandedDepartment('oralSurgery');
                          }
                        }
                        return;
                      }

                      // ÙÙŠ ÙˆØ¶Ø¹ "edit": Ø§Ù„Ø­ÙØ¸ Ø§Ù„ÙÙˆØ±ÙŠ ÙƒØ§Ù„Ù…Ø¹ØªØ§Ø¯
                      const newValue = !referrals.oralSurgery;
                      setSelectedReferral('oralSurgery');

                      setReferrals(prev => {
                        if (newValue) {
                          setReferralStatus(prevStatus => ({ ...prevStatus, oralSurgery: 'not_given' }));
                        }
                        return { ...prev, oralSurgery: newValue };
                      });

                      // Toggle expansion
                      if (expandedDepartment === 'oralSurgery') {
                        setExpandedDepartment(null);
                      } else {
                        setExpandedDepartment('oralSurgery');
                      }

                      // Save/Delete based on newValue
                      if (newValue && permanentPatientId && user?.name) {
                        // Save as general referral
                        const { error: referralError } = await createReferral(
                          permanentPatientId,
                          null,
                          'Oral Surgery',
                          user.name
                        );

                        if (referralError) {
                          console.error('âŒ Error saving general referral Oral Surgery:', referralError);
                        } else {
                          console.log('âœ… Saved general referral Oral Surgery to database');
                          await loadPatientDentalData();
                        }
                      } else if (!newValue && permanentPatientId) {
                        // Delete all referrals for this department
                        const { error: deleteError } = await supabase
                          .from('referrals')
                          .delete()
                          .eq('permanent_patient_id', permanentPatientId)
                          .eq('referral_type', 'Oral Surgery')
                          .eq('status', 'not_given');

                        if (deleteError) {
                          console.error('âŒ Error deleting referrals Oral Surgery:', deleteError);
                        } else {
                          console.log('âœ… Deleted all referrals Oral Surgery from database');
                          await loadPatientDentalData();
                        }

                        // Clear selected teeth
                        setSelectedReferralFor(prev => {
                          const newState = { ...prev };
                          Object.keys(newState).forEach(tooth => {
                            newState[tooth] = newState[tooth].filter(r => r !== 'oralSurgery');
                          });
                          return newState;
                        });
                      }
                    }}
                  >
                    <View style={[styles.checkbox, (departmentModalMode === 'new' ? tempReferrals.oralSurgery : referrals.oralSurgery) && styles.checkboxChecked]}>
                      {(departmentModalMode === 'new' ? tempReferrals.oralSurgery : referrals.oralSurgery) && <Text style={styles.checkmark}>âœ“</Text>}
                    </View>
                    <Text style={styles.referralText}>2- Oral Surgery</Text>
                    <View style={{ flex: 1 }} />
                    <Ionicons
                      name={expandedDepartment === 'oralSurgery' ? "chevron-up" : "chevron-down"}
                      size={20}
                      color="#0284C7"
                    />
                  </TouchableOpacity>

                  {/* Teeth Selection */}
                  {expandedDepartment === 'oralSurgery' && (departmentModalMode === 'new' ? tempReferrals.oralSurgery : referrals.oralSurgery) && (
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

                      {/* UL Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>UL (Upper Left)</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `UL${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = departmentModalMode === 'new'
                              ? (toothNum && tempSelectedReferralFor[toothNum]?.includes('oralSurgery'))
                              : (toothNum && selectedReferralFor[toothNum]?.includes('oralSurgery'));
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('oralSurgery');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'oralSurgery']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'oralSurgery')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('oralSurgery');

                                    if (!isCurrentlySelected) {
                                      // Adding tooth - delete general referral first
                                      await supabase
                                        .from('referrals')
                                        .delete()
                                        .eq('permanent_patient_id', permanentPatientId)
                                        .eq('referral_type', 'Oral Surgery')
                                        .is('tooth_number', null)
                                        .eq('status', 'not_given');

                                      // Save tooth-specific referral
                                      const { error } = await createReferral(
                                        permanentPatientId,
                                        toothNumber,
                                        'Oral Surgery',
                                        user.name
                                      );

                                      if (!error) {
                                        setSelectedReferralFor(prev => ({
                                          ...prev,
                                          [toothNum]: [...(prev[toothNum] || []), 'oralSurgery']
                                        }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      // Removing tooth
                                      await supabase
                                        .from('referrals')
                                        .delete()
                                        .eq('permanent_patient_id', permanentPatientId)
                                        .eq('referral_type', 'Oral Surgery')
                                        .eq('tooth_number', toothNumber)
                                        .eq('status', 'not_given');

                                      setSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'oralSurgery')
                                      }));

                                      // Check if no teeth left, create general referral
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs =>
                                        refs.includes('oralSurgery') && refs.length > 0
                                      );

                                      if (!hasOtherTeeth) {
                                        await createReferral(permanentPatientId, null, 'Oral Surgery', user.name);
                                      }

                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>
                                  {num}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* UR Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>UR</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `UR${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = departmentModalMode === 'new'
                              ? (toothNum && tempSelectedReferralFor[toothNum]?.includes('oralSurgery'))
                              : (toothNum && selectedReferralFor[toothNum]?.includes('oralSurgery'));
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('oralSurgery');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'oralSurgery']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'oralSurgery')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('oralSurgery');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Oral Surgery').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Oral Surgery', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'oralSurgery'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Oral Surgery').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'oralSurgery') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('oralSurgery') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Oral Surgery', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>{num}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* LR Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>LR</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `LR${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = departmentModalMode === 'new'
                              ? (toothNum && tempSelectedReferralFor[toothNum]?.includes('oralSurgery'))
                              : (toothNum && selectedReferralFor[toothNum]?.includes('oralSurgery'));
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('oralSurgery');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'oralSurgery']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'oralSurgery')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('oralSurgery');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Oral Surgery').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Oral Surgery', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'oralSurgery'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Oral Surgery').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'oralSurgery') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('oralSurgery') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Oral Surgery', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>{num}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* LL Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>LL</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `LL${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = departmentModalMode === 'new'
                              ? (toothNum && tempSelectedReferralFor[toothNum]?.includes('oralSurgery'))
                              : (toothNum && selectedReferralFor[toothNum]?.includes('oralSurgery'));
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('oralSurgery');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'oralSurgery']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'oralSurgery')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('oralSurgery');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Oral Surgery').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Oral Surgery', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'oralSurgery'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Oral Surgery').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'oralSurgery') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('oralSurgery') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Oral Surgery', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>{num}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  )}
                </View>
                )}

                {/* Orthodontics */}
                {(departmentModalMode === 'new' || (departmentModalMode === 'edit' && referrals.orthodontics)) && (
                <View style={{ marginBottom: 12 }}>
                  <TouchableOpacity
                    disabled={departmentModalMode === 'edit'}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 18,
                      borderRadius: 14,
                      backgroundColor: 'rgba(255, 255, 255, 0.8)',
                      borderWidth: 1.5,
                      borderColor: referrals.orthodontics ? 'rgba(125, 211, 252, 0.8)' : 'rgba(186, 230, 253, 0.4)',
                    }}
                    onPress={async () => {
                      // ÙÙŠ ÙˆØ¶Ø¹ "new": Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„Ù…Ø¤Ù‚ØªØ© Ø¯ÙˆÙ† Ø­ÙØ¸
                      if (departmentModalMode === 'new') {
                        const currentlySelected = tempReferrals.orthodontics;
                        setSelectedReferral('orthodontics');

                        if (!currentlySelected) {
                          // ØºÙŠØ± Ù…Ø­Ø¯Ø¯: ØªØ­Ø¯ÙŠØ¯Ù‡ + ÙØªØ­ Ø§Ù„Ø£Ø³Ù†Ø§Ù†
                          setTempReferrals(prev => ({ ...prev, orthodontics: true }));
                          setExpandedDepartment('orthodontics');
                        } else {
                          // Ù…Ø­Ø¯Ø¯ Ø¨Ø§Ù„ÙØ¹Ù„: ÙÙ‚Ø· toggle Ø§Ù„Ù€ expansion
                          if (expandedDepartment === 'orthodontics') {
                            setExpandedDepartment(null);
                          } else {
                            setExpandedDepartment('orthodontics');
                          }
                        }
                        return;
                      }

                      // ÙÙŠ ÙˆØ¶Ø¹ "edit": Ø§Ù„Ø­ÙØ¸ Ø§Ù„ÙÙˆØ±ÙŠ ÙƒØ§Ù„Ù…Ø¹ØªØ§Ø¯
                      const newValue = !referrals.orthodontics;
                      setSelectedReferral('orthodontics');

                      setReferrals(prev => {
                        if (newValue) {
                          setReferralStatus(prevStatus => ({ ...prevStatus, orthodontics: 'not_given' }));
                        }
                        return { ...prev, orthodontics: newValue };
                      });

                      // Toggle expansion
                      if (expandedDepartment === 'orthodontics') {
                        setExpandedDepartment(null);
                      } else {
                        setExpandedDepartment('orthodontics');
                      }

                      // Save/Delete based on newValue
                      if (newValue && permanentPatientId && user?.name) {
                        // Save as general referral
                        const { error: referralError } = await createReferral(
                          permanentPatientId,
                          null,
                          'Orthodontics',
                          user.name
                        );

                        if (referralError) {
                          console.error('âŒ Error saving general referral Orthodontics:', referralError);
                        } else {
                          console.log('âœ… Saved general referral Orthodontics to database');
                          await loadPatientDentalData();
                        }
                      } else if (!newValue && permanentPatientId) {
                        // Delete all referrals for this department
                        const { error: deleteError } = await supabase
                          .from('referrals')
                          .delete()
                          .eq('permanent_patient_id', permanentPatientId)
                          .eq('referral_type', 'Orthodontics')
                          .eq('status', 'not_given');

                        if (deleteError) {
                          console.error('âŒ Error deleting referrals Orthodontics:', deleteError);
                        } else {
                          console.log('âœ… Deleted all referrals Orthodontics from database');
                          await loadPatientDentalData();
                        }

                        // Clear selected teeth
                        setSelectedReferralFor(prev => {
                          const newState = { ...prev };
                          Object.keys(newState).forEach(tooth => {
                            newState[tooth] = newState[tooth].filter(r => r !== 'orthodontics');
                          });
                          return newState;
                        });
                      }
                    }}
                  >
                    <View style={[styles.checkbox, (departmentModalMode === 'new' ? tempReferrals.orthodontics : referrals.orthodontics) && styles.checkboxChecked]}>
                      {(departmentModalMode === 'new' ? tempReferrals.orthodontics : referrals.orthodontics) && <Text style={styles.checkmark}>âœ“</Text>}
                    </View>
                    <Text style={styles.referralText}>3- Orthodontics</Text>
                    <View style={{ flex: 1 }} />
                    <Ionicons
                      name={expandedDepartment === 'orthodontics' ? "chevron-up" : "chevron-down"}
                      size={20}
                      color="#0284C7"
                    />
                  </TouchableOpacity>

                  {/* Teeth Selection */}
                  {expandedDepartment === 'orthodontics' && (departmentModalMode === 'new' ? tempReferrals.orthodontics : referrals.orthodontics) && (
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

                      {/* UL Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>UL (Upper Left)</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `UL${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = departmentModalMode === 'new'
                              ? (toothNum && tempSelectedReferralFor[toothNum]?.includes('orthodontics'))
                              : (toothNum && selectedReferralFor[toothNum]?.includes('orthodontics'));
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('orthodontics');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'orthodontics']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'orthodontics')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('orthodontics');

                                    if (!isCurrentlySelected) {
                                      // Adding tooth - delete general referral first
                                      await supabase
                                        .from('referrals')
                                        .delete()
                                        .eq('permanent_patient_id', permanentPatientId)
                                        .eq('referral_type', 'Orthodontics')
                                        .is('tooth_number', null)
                                        .eq('status', 'not_given');

                                      // Save tooth-specific referral
                                      const { error } = await createReferral(
                                        permanentPatientId,
                                        toothNumber,
                                        'Orthodontics',
                                        user.name
                                      );

                                      if (!error) {
                                        setSelectedReferralFor(prev => ({
                                          ...prev,
                                          [toothNum]: [...(prev[toothNum] || []), 'orthodontics']
                                        }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      // Removing tooth
                                      await supabase
                                        .from('referrals')
                                        .delete()
                                        .eq('permanent_patient_id', permanentPatientId)
                                        .eq('referral_type', 'Orthodontics')
                                        .eq('tooth_number', toothNumber)
                                        .eq('status', 'not_given');

                                      setSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'orthodontics')
                                      }));

                                      // Check if no teeth left, create general referral
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs =>
                                        refs.includes('orthodontics') && refs.length > 0
                                      );

                                      if (!hasOtherTeeth) {
                                        await createReferral(permanentPatientId, null, 'Orthodontics', user.name);
                                      }

                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>
                                  {num}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* UR Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>UR</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `UR${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = departmentModalMode === 'new'
                              ? (toothNum && tempSelectedReferralFor[toothNum]?.includes('orthodontics'))
                              : (toothNum && selectedReferralFor[toothNum]?.includes('orthodontics'));
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('orthodontics');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'orthodontics']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'orthodontics')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('orthodontics');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Orthodontics').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Orthodontics', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'orthodontics'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Orthodontics').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'orthodontics') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('orthodontics') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Orthodontics', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>{num}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* LR Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>LR</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `LR${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = departmentModalMode === 'new'
                              ? (toothNum && tempSelectedReferralFor[toothNum]?.includes('orthodontics'))
                              : (toothNum && selectedReferralFor[toothNum]?.includes('orthodontics'));
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('orthodontics');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'orthodontics']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'orthodontics')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('orthodontics');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Orthodontics').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Orthodontics', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'orthodontics'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Orthodontics').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'orthodontics') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('orthodontics') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Orthodontics', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>{num}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* LL Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>LL</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `LL${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = departmentModalMode === 'new'
                              ? (toothNum && tempSelectedReferralFor[toothNum]?.includes('orthodontics'))
                              : (toothNum && selectedReferralFor[toothNum]?.includes('orthodontics'));
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('orthodontics');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'orthodontics']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'orthodontics')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('orthodontics');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Orthodontics').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Orthodontics', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'orthodontics'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Orthodontics').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'orthodontics') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('orthodontics') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Orthodontics', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>{num}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  )}
                </View>
                )}

                {/* Periodontics */}
                {(departmentModalMode === 'new' || (departmentModalMode === 'edit' && referrals.periodontics)) && (
                <View style={{ marginBottom: 12 }}>
                  <TouchableOpacity
                    disabled={departmentModalMode === 'edit'}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 18,
                      borderRadius: 14,
                      backgroundColor: 'rgba(255, 255, 255, 0.8)',
                      borderWidth: 1.5,
                      borderColor: referrals.periodontics ? 'rgba(125, 211, 252, 0.8)' : 'rgba(186, 230, 253, 0.4)',
                    }}
                    onPress={async () => {
                      // ÙÙŠ ÙˆØ¶Ø¹ "new": Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„Ù…Ø¤Ù‚ØªØ© Ø¯ÙˆÙ† Ø­ÙØ¸
                      if (departmentModalMode === 'new') {
                        const currentlySelected = tempReferrals.periodontics;
                        setSelectedReferral('periodontics');

                        if (!currentlySelected) {
                          // ØºÙŠØ± Ù…Ø­Ø¯Ø¯: ØªØ­Ø¯ÙŠØ¯Ù‡ + ÙØªØ­ Ø§Ù„Ø£Ø³Ù†Ø§Ù†
                          setTempReferrals(prev => ({ ...prev, periodontics: true }));
                          setExpandedDepartment('periodontics');
                        } else {
                          // Ù…Ø­Ø¯Ø¯ Ø¨Ø§Ù„ÙØ¹Ù„: ÙÙ‚Ø· toggle Ø§Ù„Ù€ expansion
                          if (expandedDepartment === 'periodontics') {
                            setExpandedDepartment(null);
                          } else {
                            setExpandedDepartment('periodontics');
                          }
                        }
                        return;
                      }

                      // ÙÙŠ ÙˆØ¶Ø¹ "edit": Ø§Ù„Ø­ÙØ¸ Ø§Ù„ÙÙˆØ±ÙŠ ÙƒØ§Ù„Ù…Ø¹ØªØ§Ø¯
                      const newValue = !referrals.periodontics;
                      setSelectedReferral('periodontics');

                      setReferrals(prev => {
                        if (newValue) {
                          setReferralStatus(prevStatus => ({ ...prevStatus, periodontics: 'not_given' }));
                        }
                        return { ...prev, periodontics: newValue };
                      });

                      // Toggle expansion
                      if (expandedDepartment === 'periodontics') {
                        setExpandedDepartment(null);
                      } else {
                        setExpandedDepartment('periodontics');
                      }

                      // Save/Delete based on newValue
                      if (newValue && permanentPatientId && user?.name) {
                        // Save as general referral
                        const { error: referralError } = await createReferral(
                          permanentPatientId,
                          null,
                          'Periodontics',
                          user.name
                        );

                        if (referralError) {
                          console.error('âŒ Error saving general referral Periodontics:', referralError);
                        } else {
                          console.log('âœ… Saved general referral Periodontics to database');
                          await loadPatientDentalData();
                        }
                      } else if (!newValue && permanentPatientId) {
                        // Delete all referrals for this department
                        const { error: deleteError } = await supabase
                          .from('referrals')
                          .delete()
                          .eq('permanent_patient_id', permanentPatientId)
                          .eq('referral_type', 'Periodontics')
                          .eq('status', 'not_given');

                        if (deleteError) {
                          console.error('âŒ Error deleting referrals Periodontics:', deleteError);
                        } else {
                          console.log('âœ… Deleted all referrals Periodontics from database');
                          await loadPatientDentalData();
                        }

                        // Clear selected teeth
                        setSelectedReferralFor(prev => {
                          const newState = { ...prev };
                          Object.keys(newState).forEach(tooth => {
                            newState[tooth] = newState[tooth].filter(r => r !== 'periodontics');
                          });
                          return newState;
                        });
                      }
                    }}
                  >
                    <View style={[styles.checkbox, referrals.periodontics && styles.checkboxChecked]}>
                      {referrals.periodontics && <Text style={styles.checkmark}>âœ“</Text>}
                    </View>
                    <Text style={styles.referralText}>4- Periodontics</Text>
                    <View style={{ flex: 1 }} />
                    <Ionicons
                      name={expandedDepartment === 'periodontics' ? "chevron-up" : "chevron-down"}
                      size={20}
                      color="#0284C7"
                    />
                  </TouchableOpacity>

                  {/* Teeth Selection */}
                  {expandedDepartment === 'periodontics' && referrals.periodontics && (
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

                      {/* UL Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>UL (Upper Left)</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `UL${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = toothNum && selectedReferralFor[toothNum]?.includes('periodontics');
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('periodontics');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'periodontics']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'periodontics')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('periodontics');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Periodontics').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Periodontics', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'periodontics'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Periodontics').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'periodontics') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('periodontics') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Periodontics', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>
                                  {num}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* UR Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>UR</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `UR${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = toothNum && selectedReferralFor[toothNum]?.includes('periodontics');
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('periodontics');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'periodontics']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'periodontics')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('periodontics');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Periodontics').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Periodontics', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'periodontics'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Periodontics').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'periodontics') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('periodontics') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Periodontics', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>
                                  {num}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* LR Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>LR</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `LR${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = toothNum && selectedReferralFor[toothNum]?.includes('periodontics');
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('periodontics');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'periodontics']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'periodontics')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('periodontics');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Periodontics').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Periodontics', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'periodontics'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Periodontics').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'periodontics') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('periodontics') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Periodontics', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>
                                  {num}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* LL Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>LL</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `LL${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = toothNum && selectedReferralFor[toothNum]?.includes('periodontics');
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('periodontics');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'periodontics']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'periodontics')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('periodontics');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Periodontics').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Periodontics', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'periodontics'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Periodontics').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'periodontics') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('periodontics') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Periodontics', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>
                                  {num}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  )}
                </View>
                )}

                {/* Prosthodontics */}
                {(departmentModalMode === 'new' || (departmentModalMode === 'edit' && referrals.prosthodontics)) && (
                <View style={{ marginBottom: 12 }}>
                  <TouchableOpacity
                    disabled={departmentModalMode === 'edit'}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 18,
                      borderRadius: 14,
                      backgroundColor: 'rgba(255, 255, 255, 0.8)',
                      borderWidth: 1.5,
                      borderColor: referrals.prosthodontics ? 'rgba(125, 211, 252, 0.8)' : 'rgba(186, 230, 253, 0.4)',
                    }}
                    onPress={async () => {
                      // ÙÙŠ ÙˆØ¶Ø¹ "new": Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„Ù…Ø¤Ù‚ØªØ© Ø¯ÙˆÙ† Ø­ÙØ¸
                      if (departmentModalMode === 'new') {
                        const currentlySelected = tempReferrals.prosthodontics;
                        setSelectedReferral('prosthodontics');

                        if (!currentlySelected) {
                          // ØºÙŠØ± Ù…Ø­Ø¯Ø¯: ØªØ­Ø¯ÙŠØ¯Ù‡ + ÙØªØ­ Ø§Ù„Ø£Ø³Ù†Ø§Ù†
                          setTempReferrals(prev => ({ ...prev, prosthodontics: true }));
                          setExpandedDepartment('prosthodontics');
                        } else {
                          // Ù…Ø­Ø¯Ø¯ Ø¨Ø§Ù„ÙØ¹Ù„: ÙÙ‚Ø· toggle Ø§Ù„Ù€ expansion
                          if (expandedDepartment === 'prosthodontics') {
                            setExpandedDepartment(null);
                          } else {
                            setExpandedDepartment('prosthodontics');
                          }
                        }
                        return;
                      }

                      // ÙÙŠ ÙˆØ¶Ø¹ "edit": Ø§Ù„Ø­ÙØ¸ Ø§Ù„ÙÙˆØ±ÙŠ ÙƒØ§Ù„Ù…Ø¹ØªØ§Ø¯
                      const newValue = !referrals.prosthodontics;
                      setSelectedReferral('prosthodontics');

                      setReferrals(prev => {
                        if (newValue) {
                          setReferralStatus(prevStatus => ({ ...prevStatus, prosthodontics: 'not_given' }));
                        }
                        return { ...prev, prosthodontics: newValue };
                      });

                      // Toggle expansion
                      if (expandedDepartment === 'prosthodontics') {
                        setExpandedDepartment(null);
                      } else {
                        setExpandedDepartment('prosthodontics');
                      }

                      // Save/Delete based on newValue
                      if (newValue && permanentPatientId && user?.name) {
                        // Save as general referral
                        const { error: referralError } = await createReferral(
                          permanentPatientId,
                          null,
                          'Prosthodontics',
                          user.name
                        );

                        if (referralError) {
                          console.error('âŒ Error saving general referral Prosthodontics:', referralError);
                        } else {
                          console.log('âœ… Saved general referral Prosthodontics to database');
                          await loadPatientDentalData();
                        }
                      } else if (!newValue && permanentPatientId) {
                        // Delete all referrals for this department
                        const { error: deleteError } = await supabase
                          .from('referrals')
                          .delete()
                          .eq('permanent_patient_id', permanentPatientId)
                          .eq('referral_type', 'Prosthodontics')
                          .eq('status', 'not_given');

                        if (deleteError) {
                          console.error('âŒ Error deleting referrals Prosthodontics:', deleteError);
                        } else {
                          console.log('âœ… Deleted all referrals Prosthodontics from database');
                          await loadPatientDentalData();
                        }

                        // Clear selected teeth
                        setSelectedReferralFor(prev => {
                          const newState = { ...prev };
                          Object.keys(newState).forEach(tooth => {
                            newState[tooth] = newState[tooth].filter(r => r !== 'prosthodontics');
                          });
                          return newState;
                        });
                      }
                    }}
                  >
                    <View style={[styles.checkbox, referrals.prosthodontics && styles.checkboxChecked]}>
                      {referrals.prosthodontics && <Text style={styles.checkmark}>âœ“</Text>}
                    </View>
                    <Text style={styles.referralText}>5- Prosthodontics</Text>
                    <View style={{ flex: 1 }} />
                    <Ionicons
                      name={expandedDepartment === 'prosthodontics' ? "chevron-up" : "chevron-down"}
                      size={20}
                      color="#0284C7"
                    />
                  </TouchableOpacity>

                  {/* Teeth Selection */}
                  {expandedDepartment === 'prosthodontics' && referrals.prosthodontics && (
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

                      {/* UL Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>UL (Upper Left)</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `UL${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = toothNum && selectedReferralFor[toothNum]?.includes('prosthodontics');
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('prosthodontics');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'prosthodontics']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'prosthodontics')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('prosthodontics');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Prosthodontics').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Prosthodontics', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'prosthodontics'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Prosthodontics').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'prosthodontics') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('prosthodontics') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Prosthodontics', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>
                                  {num}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* UR Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>UR</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `UR${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = toothNum && selectedReferralFor[toothNum]?.includes('prosthodontics');
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('prosthodontics');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'prosthodontics']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'prosthodontics')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('prosthodontics');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Prosthodontics').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Prosthodontics', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'prosthodontics'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Prosthodontics').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'prosthodontics') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('prosthodontics') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Prosthodontics', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>
                                  {num}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* LR Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>LR</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `LR${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = toothNum && selectedReferralFor[toothNum]?.includes('prosthodontics');
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('prosthodontics');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'prosthodontics']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'prosthodontics')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('prosthodontics');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Prosthodontics').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Prosthodontics', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'prosthodontics'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Prosthodontics').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'prosthodontics') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('prosthodontics') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Prosthodontics', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>
                                  {num}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* LL Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>LL</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `LL${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = toothNum && selectedReferralFor[toothNum]?.includes('prosthodontics');
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('prosthodontics');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'prosthodontics']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'prosthodontics')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('prosthodontics');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Prosthodontics').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Prosthodontics', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'prosthodontics'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Prosthodontics').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'prosthodontics') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('prosthodontics') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Prosthodontics', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>
                                  {num}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  )}
                </View>
                )}

                {/* Oral Medicine */}
                {(departmentModalMode === 'new' || (departmentModalMode === 'edit' && referrals.oralMedicine)) && (
                <View style={{ marginBottom: 12 }}>
                  <TouchableOpacity
                    disabled={departmentModalMode === 'edit'}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 18,
                      borderRadius: 14,
                      backgroundColor: 'rgba(255, 255, 255, 0.8)',
                      borderWidth: 1.5,
                      borderColor: referrals.oralMedicine ? 'rgba(125, 211, 252, 0.8)' : 'rgba(186, 230, 253, 0.4)',
                    }}
                    onPress={async () => {
                      // ÙÙŠ ÙˆØ¶Ø¹ "new": Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„Ù…Ø¤Ù‚ØªØ© Ø¯ÙˆÙ† Ø­ÙØ¸
                      if (departmentModalMode === 'new') {
                        const currentlySelected = tempReferrals.oralMedicine;
                        setSelectedReferral('oralMedicine');

                        if (!currentlySelected) {
                          // ØºÙŠØ± Ù…Ø­Ø¯Ø¯: ØªØ­Ø¯ÙŠØ¯Ù‡ + ÙØªØ­ Ø§Ù„Ø£Ø³Ù†Ø§Ù†
                          setTempReferrals(prev => ({ ...prev, oralMedicine: true }));
                          setExpandedDepartment('oralMedicine');
                        } else {
                          // Ù…Ø­Ø¯Ø¯ Ø¨Ø§Ù„ÙØ¹Ù„: ÙÙ‚Ø· toggle Ø§Ù„Ù€ expansion
                          if (expandedDepartment === 'oralMedicine') {
                            setExpandedDepartment(null);
                          } else {
                            setExpandedDepartment('oralMedicine');
                          }
                        }
                        return;
                      }

                      // ÙÙŠ ÙˆØ¶Ø¹ "edit": Ø§Ù„Ø­ÙØ¸ Ø§Ù„ÙÙˆØ±ÙŠ ÙƒØ§Ù„Ù…Ø¹ØªØ§Ø¯
                      const newValue = !referrals.oralMedicine;
                      setSelectedReferral('oralMedicine');

                      setReferrals(prev => {
                        if (newValue) {
                          setReferralStatus(prevStatus => ({ ...prevStatus, oralMedicine: 'not_given' }));
                        }
                        return { ...prev, oralMedicine: newValue };
                      });

                      // Toggle expansion
                      if (expandedDepartment === 'oralMedicine') {
                        setExpandedDepartment(null);
                      } else {
                        setExpandedDepartment('oralMedicine');
                      }

                      // Save/Delete based on newValue
                      if (newValue && permanentPatientId && user?.name) {
                        // Save as general referral
                        const { error: referralError } = await createReferral(
                          permanentPatientId,
                          null,
                          'Oral Medicine',
                          user.name
                        );

                        if (referralError) {
                          console.error('âŒ Error saving general referral Oral Medicine:', referralError);
                        } else {
                          console.log('âœ… Saved general referral Oral Medicine to database');
                          await loadPatientDentalData();
                        }
                      } else if (!newValue && permanentPatientId) {
                        // Delete all referrals for this department
                        const { error: deleteError } = await supabase
                          .from('referrals')
                          .delete()
                          .eq('permanent_patient_id', permanentPatientId)
                          .eq('referral_type', 'Oral Medicine')
                          .eq('status', 'not_given');

                        if (deleteError) {
                          console.error('âŒ Error deleting referrals Oral Medicine:', deleteError);
                        } else {
                          console.log('âœ… Deleted all referrals Oral Medicine from database');
                          await loadPatientDentalData();
                        }

                        // Clear selected teeth
                        setSelectedReferralFor(prev => {
                          const newState = { ...prev };
                          Object.keys(newState).forEach(tooth => {
                            newState[tooth] = newState[tooth].filter(r => r !== 'oralMedicine');
                          });
                          return newState;
                        });
                      }
                    }}
                  >
                    <View style={[styles.checkbox, referrals.oralMedicine && styles.checkboxChecked]}>
                      {referrals.oralMedicine && <Text style={styles.checkmark}>âœ“</Text>}
                    </View>
                    <Text style={styles.referralText}>6- Oral Medicine</Text>
                    <View style={{ flex: 1 }} />
                    <Ionicons
                      name={expandedDepartment === 'oralMedicine' ? "chevron-up" : "chevron-down"}
                      size={20}
                      color="#0284C7"
                    />
                  </TouchableOpacity>

                  {/* Teeth Selection */}
                  {expandedDepartment === 'oralMedicine' && referrals.oralMedicine && (
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

                      {/* UL Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>UL (Upper Left)</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `UL${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = toothNum && selectedReferralFor[toothNum]?.includes('oralMedicine');
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('oralMedicine');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'oralMedicine']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'oralMedicine')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('oralMedicine');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Oral Medicine').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Oral Medicine', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'oralMedicine'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Oral Medicine').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'oralMedicine') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('oralMedicine') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Oral Medicine', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>
                                  {num}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* UR Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>UR</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `UR${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = toothNum && selectedReferralFor[toothNum]?.includes('oralMedicine');
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('oralMedicine');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'oralMedicine']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'oralMedicine')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('oralMedicine');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Oral Medicine').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Oral Medicine', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'oralMedicine'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Oral Medicine').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'oralMedicine') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('oralMedicine') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Oral Medicine', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>
                                  {num}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* LR Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>LR</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `LR${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = toothNum && selectedReferralFor[toothNum]?.includes('oralMedicine');
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('oralMedicine');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'oralMedicine']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'oralMedicine')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('oralMedicine');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Oral Medicine').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Oral Medicine', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'oralMedicine'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Oral Medicine').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'oralMedicine') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('oralMedicine') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Oral Medicine', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>
                                  {num}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* LL Quadrant */}
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>LL</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4 }}>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                            const toothNumber = `LL${num}`;
                            const toothNum = convertPalmerToNumber(toothNumber as ToothNumber);
                            const isSelected = toothNum && selectedReferralFor[toothNum]?.includes('oralMedicine');
                            return (
                              <TouchableOpacity
                                key={num}
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
                                onPress={async () => {
                                  if (!toothNum) return;

                                  if (departmentModalMode === 'new') {
                                    const isCurrentlySelected = tempSelectedReferralFor[toothNum]?.includes('oralMedicine');
                                    if (!isCurrentlySelected) {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: [...(prev[toothNum] || []), 'oralMedicine']
                                      }));
                                    } else {
                                      setTempSelectedReferralFor(prev => ({
                                        ...prev,
                                        [toothNum]: (prev[toothNum] || []).filter(r => r !== 'oralMedicine')
                                      }));
                                    }
                                    return;
                                  }

                                  if (toothNum && permanentPatientId && user?.name) {
                                    const isCurrentlySelected = selectedReferralFor[toothNum]?.includes('oralMedicine');

                                    if (!isCurrentlySelected) {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Oral Medicine').is('tooth_number', null).eq('status', 'not_given');
                                      const { error } = await createReferral(permanentPatientId, toothNumber, 'Oral Medicine', user.name);
                                      if (!error) {
                                        setSelectedReferralFor(prev => ({ ...prev, [toothNum]: [...(prev[toothNum] || []), 'oralMedicine'] }));
                                        await loadPatientDentalData();
                                      }
                                    } else {
                                      await supabase.from('referrals').delete().eq('permanent_patient_id', permanentPatientId).eq('referral_type', 'Oral Medicine').eq('tooth_number', toothNumber).eq('status', 'not_given');
                                      setSelectedReferralFor(prev => ({ ...prev, [toothNum]: (prev[toothNum] || []).filter(r => r !== 'oralMedicine') }));
                                      const hasOtherTeeth = Object.values(selectedReferralFor).some(refs => refs.includes('oralMedicine') && refs.length > 0);
                                      if (!hasOtherTeeth) await createReferral(permanentPatientId, null, 'Oral Medicine', user.name);
                                      await loadPatientDentalData();
                                    }
                                  }
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFFFFF' : '#0284C7' }}>
                                  {num}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  )}
                </View>
                )}
              </ScrollView>

              {/* Save and Cancel Buttons */}
              <View style={{ padding: 20, paddingTop: 12, flexDirection: 'row', gap: 12 }}>
                {/* Cancel Button */}
                <TouchableOpacity
                  onPress={() => {
                    // Ø¥Ø°Ø§ ÙƒÙ†Ø§ ÙÙŠ ÙˆØ¶Ø¹ NewØŒ Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø§Ù„Ø­Ø§Ù„Ø© Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø© ÙˆØ¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„Ù…Ø¤Ù‚ØªØ©
                    if (departmentModalMode === 'new') {
                      if (savedReferralsState && savedSelectedReferralFor) {
                        setReferrals(savedReferralsState);
                        setSelectedReferralFor(savedSelectedReferralFor);
                        setSavedReferralsState(null);
                        setSavedSelectedReferralFor(null);
                      }
                      // Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Ø§Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„Ù…Ø¤Ù‚ØªØ©
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
                    setShowDepartmentModal(false);
                  }}
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
                  disabled={departmentModalMode === 'new'
                    ? !Object.values(tempReferrals).some(val => val === true)
                    : !Object.values(referrals).some(val => val === true)}
                  onPress={async () => {
                    // ÙÙŠ ÙˆØ¶Ø¹ "new": Ø­ÙØ¸ Ø¬Ù…ÙŠØ¹ Ø§Ù„ØªØ­ÙˆÙŠÙ„Ø§Øª Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø©
                    if (departmentModalMode === 'new' && permanentPatientId && user?.name) {
                      const departmentMap: Record<string, string> = {
                        endodontics: 'Endodontics',
                        oralSurgery: 'Oral Surgery',
                        orthodontics: 'Orthodontics',
                        periodontics: 'Periodontics',
                        prosthodontics: 'Prosthodontics',
                        oralMedicine: 'Oral Medicine',
                      };

                      // Ø­ÙØ¸ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø£Ù‚Ø³Ø§Ù… Ø§Ù„Ù…Ø®ØªØ§Ø±Ø©
                      for (const [key, isSelected] of Object.entries(tempReferrals)) {
                        if (isSelected) {
                          const departmentName = departmentMap[key] || key;

                          // Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† ÙˆØ¬ÙˆØ¯ Ø£Ø³Ù†Ø§Ù† Ù…Ø­Ø¯Ø¯Ø© Ù„Ù‡Ø°Ø§ Ø§Ù„Ù‚Ø³Ù…
                          const teethForDept = Object.entries(tempSelectedReferralFor)
                            .filter(([_, depts]) => depts.includes(key))
                            .map(([toothNum, _]) => parseInt(toothNum));

                          if (teethForDept.length > 0) {
                            // Ø­Ø°Ù Ø§Ù„ØªØ­ÙˆÙŠÙ„ Ø§Ù„Ø¹Ø§Ù… Ø£ÙˆÙ„Ø§Ù‹ (Ø¥Ù† ÙˆØ¬Ø¯) Ù‚Ø¨Ù„ Ø­ÙØ¸ Ø§Ù„Ø£Ø³Ù†Ø§Ù† Ø§Ù„Ù…Ø­Ø¯Ø¯Ø©
                            await supabase
                              .from('referrals')
                              .delete()
                              .eq('permanent_patient_id', permanentPatientId)
                              .eq('referral_type', departmentName)
                              .is('tooth_number', null)
                              .eq('status', 'not_given');

                            // Ø­ÙØ¸ ÙƒÙ„ Ø³Ù† Ø¹Ù„Ù‰ Ø­Ø¯Ø©
                            for (const toothNum of teethForDept) {
                              const palmerNotation = convertNumberToPalmer(toothNum);
                              await createReferral(permanentPatientId, palmerNotation, departmentName, user.name);
                            }
                          } else {
                            // Ø­ÙØ¸ ØªØ­ÙˆÙŠÙ„ Ø¹Ø§Ù… (Ø¨Ø¯ÙˆÙ† Ø£Ø³Ù†Ø§Ù†)
                            await createReferral(permanentPatientId, null, departmentName, user.name);
                          }
                        }
                      }

                      // Ù†Ø³Ø® Ø§Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„Ù…Ø¤Ù‚ØªØ© Ø¥Ù„Ù‰ Ø§Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„Ø£Ø³Ø§Ø³ÙŠØ©
                      setReferrals(prev => ({ ...prev, ...tempReferrals }));
                      setSelectedReferralFor(prev => ({ ...prev, ...tempSelectedReferralFor }));

                      // Ø¥Ø¹Ø§Ø¯Ø© ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
                      await loadPatientDentalData();
                    }

                    // Ø­Ø°Ù Ø§Ù„Ø­Ø§Ù„Ø§Øª Ø§Ù„Ù…Ø­ÙÙˆØ¸Ø©
                    setSavedReferralsState(null);
                    setSavedSelectedReferralFor(null);
                    setShowDepartmentModal(false);
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: (departmentModalMode === 'new'
                      ? Object.values(tempReferrals).some(val => val === true)
                      : Object.values(referrals).some(val => val === true)) ? '#0284C7' : 'rgba(148, 163, 184, 0.3)',
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
                  <Text style={{ fontSize: 17, fontWeight: '700', color: (departmentModalMode === 'new'
                    ? Object.values(tempReferrals).some(val => val === true)
                    : Object.values(referrals).some(val => val === true)) ? '#FFFFFF' : '#9CA3AF', letterSpacing: 0.5 }}>
                    Save
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </View>
    </View>
  );
}

