import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Keyboard, TouchableWithoutFeedback, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Patient, TimelineEvent, CLINICS, CONDITIONS, TREATMENTS, arabicToEnglish } from './constants';
import { styles } from './styles';
import { shadows } from '../../theme';
import ToothDetailsModal from '../../components/ToothDetailsModal';
import { generateDentalSummary } from './dentalHelpers';
import { getCompleteDentalChart, getReferrals, getAllToothNotes } from '../../lib/database';
import { DentalSummary, Referral, ToothNote } from '../../types';

interface AppModalsProps {
  // Add Patient Modal
  showAddModal: boolean;
  setShowAddModal: (show: boolean) => void;
  isPatientEditMode: boolean;
  setIsPatientEditMode: (mode: boolean) => void;
  isModalExpanded: boolean;
  setIsModalExpanded: (expanded: boolean) => void;
  patientMode: 'search' | 'walk-in' | 'new-profile';
  setPatientMode: (mode: 'search' | 'walk-in' | 'new-profile') => void;
  newPatientName: string;
  setNewPatientName: (name: string) => void;
  newPatientFileNumber: string;
  setNewPatientFileNumber: (num: string) => void;
  newPatientQueueNumber: string;
  setNewPatientQueueNumber: (num: string) => void;
  newPatientCondition: string;
  setNewPatientCondition: (condition: string) => void;
  newPatientTreatment: string;
  setNewPatientTreatment: (treatment: string) => void;
  isElderly: boolean;
  setIsElderly: (elderly: boolean) => void;
  newPatientNote: string;
  setNewPatientNote: (note: string) => void;
  permanentPatientSearchResults: any[];
  setPermanentPatientSearchResults: (results: any[]) => void;
  selectedPermanentPatientId: string | null;
  setSelectedPermanentPatientId: (id: string | null) => void;
  showPatientSuggestions: boolean;
  setShowPatientSuggestions: (show: boolean) => void;
  showFileNumberSuggestions: boolean;
  setShowFileNumberSuggestions: (show: boolean) => void;
  fileNumberSearchResults: any[];
  setFileNumberSearchResults: (results: any[]) => void;
  modalEditingPatientId: string | null;
  setModalEditingPatientId: (id: string | null) => void;
  handleAddPatient: () => void;
  handleFileNumberSearch: (fileNumber: string) => void;
  handlePatientNameSearch: (name: string) => void;
  patients: Patient[];

  // Menu Modal
  showMenuForPatient: string | null;
  setShowMenuForPatient: (id: string | null) => void;
  handleMenuAction: (patientId: string, action: string) => void;

  // Note Modal
  showNoteModal: boolean;
  setShowNoteModal: (show: boolean) => void;
  currentNote: string;
  setCurrentNote: (note: string) => void;
  handleSaveNote: () => void;

  // View Note Modal
  showViewNoteModal: boolean;
  setShowViewNoteModal: (show: boolean) => void;
  viewNoteContent: string;
  setViewNoteContent: (content: string) => void;
  notePatientId: string | null;
  handleDeleteNote: () => void;

  // Convert Modal
  showConvertModal: boolean;
  setShowConvertModal: (show: boolean) => void;
  convertFileNumber: string;
  setConvertFileNumber: (num: string) => void;
  convertToPermanentPatient: () => void;

  // Treatment Done Modal
  showTreatmentDoneModal: boolean;
  setShowTreatmentDoneModal: (show: boolean) => void;
  clinicDoctors: {id: string, name: string}[];
  doctorSearchQuery: string;
  setDoctorSearchQuery: (query: string) => void;
  handleTreatmentDoneByDoctor: (doctorId: string | null, doctorName: string | null) => void;

  // Dropdown Modals
  showClinicDropdown: boolean;
  setShowClinicDropdown: (show: boolean) => void;
  showConditionDropdown: boolean;
  setShowConditionDropdown: (show: boolean) => void;
  showTreatmentDropdown: boolean;
  setShowTreatmentDropdown: (show: boolean) => void;
  editingPatientId: string | null;
  handleUpdateField: (patientId: string, field: 'clinic' | 'condition' | 'treatment', value: string) => void;

  // Timeline Modal
  showTimelineModal: boolean;
  setShowTimelineModal: (show: boolean) => void;
  selectedPatient: Patient | null;
  timeline: TimelineEvent[];
  treatmentNote: string;
  setTreatmentNote: (note: string) => void;
  markTreatmentDone: () => void;

  // Tooth Details Modal
  showToothModal: boolean;
  setShowToothModal: (show: boolean) => void;
  toothModalPatientId: string;
  selectedTooth: string;
  currentDoctorName: string;
  setDentalSummaries: React.Dispatch<React.SetStateAction<{ [key: string]: DentalSummary }>>;
  setPatientReferrals: React.Dispatch<React.SetStateAction<{ [key: string]: Referral[] }>>;
  setPatientToothNotes: React.Dispatch<React.SetStateAction<{ [key: string]: ToothNote[] }>>;
}

export function AppModals(props: AppModalsProps) {
  return (
    <>
      {/* Add Patient Modal */}
      <Modal visible={props.showAddModal} animationType="fade" transparent onRequestClose={() => {
        props.setShowAddModal(false);
        props.setIsModalExpanded(false);
      }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={[styles.modalContent, { minWidth: '90%', maxHeight: '80%', borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 24 }]}>
                {/* Glass Color Tint */}
                <LinearGradient
                  colors={[
                    'rgba(168, 85, 247, 0.15)',
                    'rgba(91, 159, 237, 0.15)',
                    'rgba(125, 211, 192, 0.15)',
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalGlassOverlay}
                />

                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{props.isPatientEditMode ? 'Edit Patient' : 'Add New Patient'}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      props.setShowAddModal(false);
                      props.setIsModalExpanded(false);
                      props.setPatientMode('search');

                      // Reset edit mode
                      props.setIsPatientEditMode(false);
                      props.setModalEditingPatientId(null);

                      props.setNewPatientName('');
                      props.setNewPatientFileNumber('');
                      props.setNewPatientQueueNumber('');
                      props.setNewPatientCondition(CONDITIONS[0].name);
                      props.setSelectedPermanentPatientId(null);
                      props.setShowFileNumberSuggestions(false);
                      props.setShowPatientSuggestions(false);
                      props.setShowConditionDropdown(false);
                    }}
                    style={styles.modalCloseButton}
                  >
                    <Ionicons name="close" size={24} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                {/* Mode Selection Buttons */}
                <View style={styles.modeButtonsContainer}>
                  <TouchableOpacity
                    style={[
                      styles.modeButton,
                      props.patientMode === 'walk-in' && styles.modeButtonActive
                    ]}
                    onPress={() => {
                      if (props.patientMode === 'walk-in') {
                        // Toggle off - return to search mode
                        props.setPatientMode('search');
                      } else {
                        // Toggle on - activate walk-in mode
                        props.setPatientMode('walk-in');
                        props.setNewPatientFileNumber('');
                        props.setSelectedPermanentPatientId(null);
                        props.setShowPatientSuggestions(false);
                        props.setShowFileNumberSuggestions(false);
                      }
                    }}
                  >
                    <Ionicons
                      name="walk"
                      size={18}
                      color={props.patientMode === 'walk-in' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)'}
                    />
                    <Text style={[
                      styles.modeButtonText,
                      props.patientMode === 'walk-in' && styles.modeButtonTextActive
                    ]}>Walk-in</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modeButton,
                      props.patientMode === 'new-profile' && styles.modeButtonActive
                    ]}
                    onPress={() => {
                      if (props.patientMode === 'new-profile') {
                        // Toggle off - return to search mode
                        props.setPatientMode('search');
                      } else {
                        // Toggle on - activate new-profile mode
                        props.setPatientMode('new-profile');
                        props.setShowPatientSuggestions(false);
                        props.setShowFileNumberSuggestions(false);
                      }
                    }}
                  >
                    <Ionicons
                      name="person-add"
                      size={18}
                      color={props.patientMode === 'new-profile' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)'}
                    />
                    <Text style={[
                      styles.modeButtonText,
                      props.patientMode === 'new-profile' && styles.modeButtonTextActive
                    ]}>New Profile</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={Platform.OS === 'android'}
                  nestedScrollEnabled
                >
                  <Text style={styles.inputLabel}>Patient Name:</Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={[
                        styles.textInput,
                        (() => {
                          const firstChar = props.newPatientName.trim()[0];
                          const isArabic = firstChar && /[\u0600-\u06FF]/.test(firstChar);
                          return {
                            textAlign: isArabic ? 'right' as const : 'left' as const,
                            paddingRight: isArabic ? 16 : 45,
                            paddingLeft: isArabic ? 45 : 16,
                          };
                        })()
                      ]}
                      placeholder="Patient Name"
                      value={props.newPatientName}
                      onChangeText={(text) => {
                        props.setNewPatientName(text);
                        // Only search if in 'search' mode
                        if (props.patientMode === 'search') {
                          props.handlePatientNameSearch(text);
                        }
                      }}
                      returnKeyType="done"
                    />
                    {props.newPatientName.length > 0 && (
                      <TouchableOpacity
                        style={[
                          styles.clearButton,
                          (() => {
                            const firstChar = props.newPatientName.trim()[0];
                            const isArabic = firstChar && /[\u0600-\u06FF]/.test(firstChar);
                            return isArabic ? { left: 12, right: undefined } : { right: 12, left: undefined };
                          })()
                        ]}
                        onPress={() => {
                          props.setNewPatientName('');
                          props.setNewPatientFileNumber('');
                          props.setShowFileNumberSuggestions(false);
                          props.setSelectedPermanentPatientId(null);
                        }}
                      >
                        <Ionicons name="close-circle" size={20} color="rgba(0, 0, 0, 0.5)" />
                      </TouchableOpacity>
                    )}
                  </View>
                  {/* Patient Name Search Results - Show File Numbers */}
                  {props.showFileNumberSuggestions && props.fileNumberSearchResults.length > 0 && (
                    <View style={styles.suggestionsContainer}>
                      <Text style={styles.suggestionsHeader}>
                        Found {props.fileNumberSearchResults.length} file(s):
                      </Text>
                      <ScrollView
                        style={styles.suggestionsList}
                        nestedScrollEnabled={true}
                        showsVerticalScrollIndicator={true}
                        persistentScrollbar={true}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{ paddingBottom: 8 }}
                      >
                        {props.fileNumberSearchResults.map((patient) => (
                          <TouchableOpacity
                            key={patient.id}
                            style={[
                              styles.suggestionItem,
                              props.selectedPermanentPatientId === patient.id && styles.suggestionItemSelected
                            ]}
                            onPress={() => {
                              // Convert Arabic numerals to English before setting
                              const englishFileNumber = arabicToEnglish(patient.file_number || '');

                              props.setNewPatientName(patient.name);
                              props.setNewPatientFileNumber(englishFileNumber);
                              props.setSelectedPermanentPatientId(patient.id);
                              props.setShowFileNumberSuggestions(false);
                            }}
                          >
                            <Text style={styles.suggestionItemText}>
                              {`File #${arabicToEnglish(patient.file_number || '')} - ${patient.name}`}
                            </Text>
                            {props.selectedPermanentPatientId === patient.id && (
                              <Ionicons name="checkmark-circle" size={20} color="#7DD3C0" />
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* File Number - Hidden in walk-in mode */}
                  {props.patientMode !== 'walk-in' && (
                    <>
                      <Text style={styles.inputLabel}>File Number (4 digits):</Text>
                      <View style={styles.inputContainer}>
                        <TextInput
                          style={styles.textInput}
                          placeholder="0000"
                          value={props.newPatientFileNumber}
                          onChangeText={(text) => {
                            // Allow English and Arabic numerals, max 4 digits
                            const numbersOnly = text.split('').filter(char =>
                              /[0-9\u0660-\u0669]/.test(char)
                            ).join('').slice(0, 4);

                            // Convert Arabic numerals to English
                            const englishNumbers = arabicToEnglish(numbersOnly);
                            props.setNewPatientFileNumber(englishNumbers);

                            // Only search if in 'search' mode
                            if (props.patientMode === 'search') {
                              props.handleFileNumberSearch(englishNumbers);
                            }
                          }}
                          keyboardType="numeric"
                          maxLength={4}
                          returnKeyType="done"
                        />
                        {props.newPatientFileNumber.length > 0 && (
                          <TouchableOpacity
                            style={styles.clearButton}
                            onPress={() => {
                              props.setNewPatientFileNumber('');
                              props.setNewPatientName('');
                              props.setShowPatientSuggestions(false);
                              props.setSelectedPermanentPatientId(null);
                            }}
                          >
                            <Ionicons name="close-circle" size={20} color="rgba(0, 0, 0, 0.5)" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </>
                  )}
                  {/* File Number Search Results */}
                  {props.showPatientSuggestions && props.permanentPatientSearchResults.length > 0 && (
                    <View style={styles.suggestionsContainer}>
                      <Text style={styles.suggestionsHeader}>
                        Found {props.permanentPatientSearchResults.length} patient(s):
                      </Text>
                      <ScrollView
                        style={styles.suggestionsList}
                        nestedScrollEnabled={true}
                        showsVerticalScrollIndicator={true}
                        persistentScrollbar={true}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{ paddingBottom: 8 }}
                      >
                        {props.permanentPatientSearchResults.map((patient) => (
                          <TouchableOpacity
                            key={patient.id}
                            style={[
                              styles.suggestionItem,
                              props.selectedPermanentPatientId === patient.id && styles.suggestionItemSelected
                            ]}
                            onPress={() => {
                              props.setNewPatientName(patient.name);
                              props.setSelectedPermanentPatientId(patient.id);
                              props.setShowPatientSuggestions(false);
                            }}
                          >
                            <Text style={styles.suggestionItemText}>
                              {patient.name}
                            </Text>
                            {props.selectedPermanentPatientId === patient.id && (
                              <Ionicons name="checkmark-circle" size={20} color="#7DD3C0" />
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  <Text style={styles.inputLabel}>Queue Number:</Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Queue Number"
                      value={props.newPatientQueueNumber}
                      onChangeText={props.setNewPatientQueueNumber}
                      keyboardType="numeric"
                      returnKeyType="done"
                    />
                    {props.newPatientQueueNumber.length > 0 && (
                      <TouchableOpacity
                        style={styles.clearButton}
                        onPress={() => props.setNewPatientQueueNumber('')}
                      >
                        <Ionicons name="close-circle" size={20} color="rgba(0, 0, 0, 0.5)" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Expand/Collapse Button */}
                  <TouchableOpacity
                    style={styles.expandButton}
                    onPress={() => props.setIsModalExpanded(!props.isModalExpanded)}
                  >
                    <Text style={styles.expandButtonText}>
                      {props.isModalExpanded ? 'Hide Additional Info' : 'Show Additional Info'}
                    </Text>
                    <Ionicons
                      name={props.isModalExpanded ? "chevron-up" : "chevron-down"}
                      size={20}
                      color="#FFFFFF"
                    />
                  </TouchableOpacity>

                  {/* Additional Fields - Shown when expanded */}
                  {props.isModalExpanded && (
                    <>
                      <Text style={styles.inputLabel}>Condition:</Text>
                  <TouchableOpacity
                    style={styles.textInput}
                    onPress={() => props.setShowConditionDropdown(!props.showConditionDropdown)}
                  >
                    <Text style={styles.dropdownButtonText}>{props.newPatientCondition}</Text>
                  </TouchableOpacity>
                  {props.showConditionDropdown && (
                    <View style={styles.dropdownList}>
                      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true}>
                        {CONDITIONS.map((condition, index) => (
                          <TouchableOpacity
                            key={condition.name}
                            style={[
                              styles.dropdownItem,
                              props.newPatientCondition === condition.name && styles.dropdownItemSelected
                            ]}
                            onPress={() => {
                              props.setNewPatientCondition(condition.name);
                              props.setShowConditionDropdown(false);
                            }}
                          >
                            <Text style={[
                              styles.dropdownItemText,
                              props.newPatientCondition === condition.name && styles.dropdownItemTextSelected
                            ]}>{condition.name}</Text>
                            {props.newPatientCondition === condition.name && (
                              <Ionicons name="checkmark" size={20} color="#7DD3C0" />
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  <Text style={styles.inputLabel}>Treatment:</Text>
                  <TouchableOpacity
                    style={styles.textInput}
                    onPress={() => props.setShowTreatmentDropdown(!props.showTreatmentDropdown)}
                  >
                    <Text style={styles.dropdownButtonText}>{props.newPatientTreatment}</Text>
                  </TouchableOpacity>
                  {props.showTreatmentDropdown && (
                    <View style={styles.dropdownList}>
                      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true}>
                        {TREATMENTS
                          .filter(treatment => {
                            // For permanent patients, exclude these treatments (they're counted from dental chart/referrals)
                            const isPermanent = props.selectedPermanentPatientId != null;
                            const excludedTreatments = ['Filling', 'Scaling', 'Pulpectomy', 'Extraction', 'Referral'];

                            if (isPermanent && excludedTreatments.includes(treatment.name)) {
                              return false; // Hide these options for permanent patients
                            }
                            return true;
                          })
                          .map((treatment, index) => (
                            <TouchableOpacity
                              key={treatment.name}
                              style={[
                                styles.dropdownItem,
                                props.newPatientTreatment === treatment.name && styles.dropdownItemSelected
                              ]}
                              onPress={() => {
                                props.setNewPatientTreatment(treatment.name);
                                props.setShowTreatmentDropdown(false);
                              }}
                            >
                              <Text style={[
                                styles.dropdownItemText,
                                props.newPatientTreatment === treatment.name && styles.dropdownItemTextSelected
                              ]}>{treatment.name}</Text>
                              {props.newPatientTreatment === treatment.name && (
                              <Ionicons name="checkmark" size={20} color="#7DD3C0" />
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => props.setIsElderly(!props.isElderly)}
                  >
                    <View style={[styles.checkbox, props.isElderly && styles.checkboxChecked]}>
                      {props.isElderly && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                    </View>
                    <Text style={styles.checkboxLabel}>Elderly</Text>
                  </TouchableOpacity>

                  <Text style={styles.inputLabel}>Notes (Optional):</Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={[styles.textInput, styles.textArea]}
                      placeholder="Add notes..."
                      value={props.newPatientNote}
                      onChangeText={props.setNewPatientNote}
                      multiline
                      numberOfLines={3}
                      returnKeyType="done"
                      blurOnSubmit
                    />
                    {props.newPatientNote.length > 0 && (
                      <TouchableOpacity
                        style={[styles.clearButton, styles.clearButtonTextArea]}
                        onPress={() => props.setNewPatientNote('')}
                      >
                        <Ionicons name="close-circle" size={20} color="rgba(0, 0, 0, 0.5)" />
                      </TouchableOpacity>
                    )}
                  </View>
                    </>
                  )}

                  <TouchableOpacity style={styles.addButton} onPress={props.handleAddPatient}>
                    <Text style={styles.addButtonText}>{props.isPatientEditMode ? 'Update Patient' : 'Add Patient'}</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Menu Modal */}
      {props.showMenuForPatient && (
        <Modal visible={true} animationType="fade" transparent onRequestClose={() => props.setShowMenuForPatient(null)}>
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => props.setShowMenuForPatient(null)}
          >
            <View style={styles.menuModal}>
              {/* Glass Color Tint */}
              <LinearGradient
                colors={[
                  'rgba(168, 85, 247, 0.15)',
                  'rgba(91, 159, 237, 0.15)',
                  'rgba(125, 211, 192, 0.15)',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalGlassOverlay}
              />

              <View style={{ padding: 8 }}>
                {/* الصف العلوي - الأزرار الأساسية */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
                  {[
                    { action: 'edit', icon: 'create-outline', color: '#8B5CF6', label: 'Edit' },
                    { action: 'note', icon: 'document-text', color: '#3B82F6', label: 'Note' },
                    { action: 'na', icon: 'person-remove', color: '#6B7280', label: 'N/A' },
                    { action: 'elderly', icon: 'man', color: '#F97316', label: 'Elderly' },
                    { action: 'special_needs', icon: 'accessibility', color: '#8B5CF6', label: 'Special' },
                    ...(!props.patients.find(p => p.id === props.showMenuForPatient)?.permanent_patient_id
                      ? [{ action: 'new_profile', icon: 'person-add', color: '#3B82F6', label: 'Profile' }]
                      : []),
                    { action: 'undo', icon: 'arrow-undo', color: '#D97706', label: 'Undo' },
                  ].map((item) => (
                    <TouchableOpacity
                      key={item.action}
                      style={{
                        width: 80,
                        height: 80,
                        backgroundColor: 'rgba(255, 255, 255, 0.3)',
                        borderRadius: 18,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1.5,
                        borderColor: 'rgba(255, 255, 255, 0.5)',
                      }}
                      onPress={() => props.handleMenuAction(props.showMenuForPatient!, item.action as any)}
                    >
                      <Ionicons name={item.icon as any} size={26} color={item.color} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#1E3A8A', marginTop: 6 }}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* الصف السفلي - Done و Delete فقط */}
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 12 }}>
                  <TouchableOpacity
                    style={{
                      width: 80,
                      height: 80,
                      backgroundColor: 'rgba(254, 226, 226, 0.4)',
                      borderRadius: 18,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1.5,
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                    }}
                    onPress={() => props.handleMenuAction(props.showMenuForPatient!, 'delete')}
                  >
                    <Ionicons name="trash-bin" size={26} color="#EF4444" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#EF4444', marginTop: 6 }}>Delete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      width: 80,
                      height: 80,
                      backgroundColor: 'rgba(220, 252, 231, 0.4)',
                      borderRadius: 18,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1.5,
                      borderColor: 'rgba(34, 197, 94, 0.4)',
                    }}
                    onPress={() => props.handleMenuAction(props.showMenuForPatient!, 'complete')}
                  >
                    <Ionicons name="checkmark-circle" size={26} color="#22C55E" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#22C55E', marginTop: 6 }}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Note Modal */}
      <Modal visible={props.showNoteModal} animationType="slide" transparent onRequestClose={() => props.setShowNoteModal(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalContent}>
                {/* Glass Color Tint */}
                <LinearGradient
                  colors={[
                    'rgba(168, 85, 247, 0.15)',
                    'rgba(91, 159, 237, 0.15)',
                    'rgba(125, 211, 192, 0.15)',
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalGlassOverlay}
                />

                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Patient Note</Text>
                  <TouchableOpacity
                    onPress={() => props.setShowNoteModal(false)}
                    style={styles.modalCloseButton}
                  >
                    <Ionicons name="close" size={24} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Enter note..."
                  value={props.currentNote}
                  onChangeText={props.setCurrentNote}
                  multiline
                  numberOfLines={5}
                  autoFocus
                />

                <TouchableOpacity style={styles.addButton} onPress={props.handleSaveNote}>
                  <Text style={styles.addButtonText}>Save Note</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* View Note Modal */}
      <Modal visible={props.showViewNoteModal} animationType="fade" transparent onRequestClose={() => {
        props.setShowViewNoteModal(false);
        props.setViewNoteContent('');
      }}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            props.setShowViewNoteModal(false);
            props.setViewNoteContent('');
          }}
        >
          <View style={styles.modalContent}>
            {/* Glass Color Tint */}
            <LinearGradient
              colors={[
                'rgba(168, 85, 247, 0.15)',
                'rgba(91, 159, 237, 0.15)',
                'rgba(125, 211, 192, 0.15)',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modalGlassOverlay}
            />

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Patient Note</Text>
              <TouchableOpacity
                onPress={() => {
                  props.setShowViewNoteModal(false);
                  props.setViewNoteContent('');
                }}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.noteText}>{props.viewNoteContent}</Text>

            <TouchableOpacity style={styles.deleteButton} onPress={props.handleDeleteNote}>
              <Text style={styles.deleteButtonText}>Delete Note</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Convert to Permanent Patient Modal */}
      <Modal visible={props.showConvertModal} animationType="slide" transparent onRequestClose={() => props.setShowConvertModal(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalContent}>
                {/* Glass Color Tint */}
                <LinearGradient
                  colors={[
                    'rgba(168, 85, 247, 0.15)',
                    'rgba(91, 159, 237, 0.15)',
                    'rgba(125, 211, 192, 0.15)',
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalGlassOverlay}
                />

                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>New Profile</Text>
                  <TouchableOpacity
                    onPress={() => {
                      props.setShowConvertModal(false);
                      props.setConvertFileNumber('');
                    }}
                    style={styles.modalCloseButton}
                  >
                    <Ionicons name="close" size={24} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                <Text style={{
                  fontSize: 14,
                  color: '#6B7280',
                  marginBottom: 16,
                  textAlign: 'center',
                }}>
                  Enter file number to convert this patient to a permanent profile
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder="File Number"
                  value={props.convertFileNumber}
                  onChangeText={props.setConvertFileNumber}
                  keyboardType="default"
                  autoFocus
                />

                <TouchableOpacity
                  style={[styles.button, { marginTop: 16 }]}
                  onPress={props.convertToPermanentPatient}
                >
                  <Text style={styles.buttonText}>Convert to Permanent</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Treatment Done Modal */}
      <Modal visible={props.showTreatmentDoneModal} animationType="slide" transparent onRequestClose={() => props.setShowTreatmentDoneModal(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalContent}>
                {/* Glass Color Tint - Darker */}
                <LinearGradient
                  colors={[
                    'rgba(168, 85, 247, 0.25)',
                    'rgba(91, 159, 237, 0.25)',
                    'rgba(125, 211, 192, 0.25)',
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalGlassOverlay}
                />

                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Treatment Done</Text>
                  <TouchableOpacity
                    onPress={() => {
                      props.setShowTreatmentDoneModal(false);
                      props.setDoctorSearchQuery('');
                    }}
                    style={styles.modalCloseButton}
                  >
                    <Ionicons name="close" size={24} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                {/* Done by Me Button */}
                <TouchableOpacity
                  style={styles.treatmentDoneByMeButton}
                  onPress={() => props.handleTreatmentDoneByDoctor(null, null)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(34, 197, 94, 0.2)', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
                    </View>
                    <Text style={styles.treatmentDoneByMeText}>Treatment Done by Me</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
                </TouchableOpacity>

                <View style={styles.orDivider}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>OR</Text>
                  <View style={styles.orLine} />
                </View>

                {/* Search Bar */}
                <View style={styles.searchContainer}>
                  <Ionicons name="search" size={20} color="#9CA3AF" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search doctor..."
                    placeholderTextColor="#9CA3AF"
                    value={props.doctorSearchQuery}
                    onChangeText={props.setDoctorSearchQuery}
                  />
                </View>

                {/* Doctors List */}
                <ScrollView style={styles.doctorsListContainer} showsVerticalScrollIndicator={false}>
                  {props.clinicDoctors
                    .filter(doctor => doctor.name.toLowerCase().includes(props.doctorSearchQuery.toLowerCase()))
                    .map((doctor) => (
                      <TouchableOpacity
                        key={doctor.id}
                        style={styles.doctorItem}
                        onPress={() => props.handleTreatmentDoneByDoctor(doctor.id, doctor.name)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(125, 211, 192, 0.2)', justifyContent: 'center', alignItems: 'center' }}>
                            <Ionicons name="person" size={24} color="#7DD3C0" />
                          </View>
                          <Text style={styles.doctorName}>{doctor.name}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
                      </TouchableOpacity>
                    ))}
                  {props.clinicDoctors.filter(doctor => doctor.name.toLowerCase().includes(props.doctorSearchQuery.toLowerCase())).length === 0 && (
                    <Text style={styles.noDoctorsText}>No doctors found</Text>
                  )}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Clinic Dropdown Modal */}
      <Modal visible={props.showClinicDropdown} animationType="fade" transparent onRequestClose={() => props.setShowClinicDropdown(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => props.setShowClinicDropdown(false)}
        >
          <View style={styles.beautifulModal}>
            {/* Glass Color Tint */}
            <LinearGradient
              colors={[
                'rgba(168, 85, 247, 0.15)',
                'rgba(91, 159, 237, 0.15)',
                'rgba(125, 211, 192, 0.15)',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modalGlassOverlay}
            />

            <Text style={styles.modalHeaderTitle}>Select Clinic</Text>
            <View style={styles.modalDivider} />
            <ScrollView style={styles.modalScrollView}>
              {CLINICS.map((clinic) => (
                <TouchableOpacity
                  key={clinic.id}
                  style={styles.beautifulDropdownItem}
                  onPress={() => props.editingPatientId && props.handleUpdateField(props.editingPatientId, 'clinic', clinic.name)}
                >
                  <View style={[styles.colorDot, { backgroundColor: '#D4B8E8' }]} />
                  <Text style={styles.beautifulDropdownText}>{clinic.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Condition Dropdown Modal */}
      <Modal visible={props.showConditionDropdown} animationType="fade" transparent onRequestClose={() => props.setShowConditionDropdown(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => props.setShowConditionDropdown(false)}
        >
          <View style={styles.beautifulModal}>
            {/* Glass Color Tint */}
            <LinearGradient
              colors={[
                'rgba(168, 85, 247, 0.15)',
                'rgba(91, 159, 237, 0.15)',
                'rgba(125, 211, 192, 0.15)',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modalGlassOverlay}
            />

            <Text style={styles.modalHeaderTitle}>Select Condition</Text>
            <View style={styles.modalDivider} />
            <ScrollView style={styles.modalScrollView}>
              {CONDITIONS.map((condition) => (
                <TouchableOpacity
                  key={condition.name}
                  style={styles.beautifulDropdownItem}
                  onPress={() => props.editingPatientId && props.handleUpdateField(props.editingPatientId, 'condition', condition.name)}
                >
                  <View style={[styles.colorDot, { backgroundColor: '#D4B8E8' }]} />
                  <Text style={styles.beautifulDropdownText}>{condition.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Treatment Dropdown Modal */}
      <Modal visible={props.showTreatmentDropdown} animationType="fade" transparent onRequestClose={() => props.setShowTreatmentDropdown(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => props.setShowTreatmentDropdown(false)}
        >
          <View style={styles.beautifulModal}>
            {/* Glass Color Tint */}
            <LinearGradient
              colors={[
                'rgba(168, 85, 247, 0.15)',
                'rgba(91, 159, 237, 0.15)',
                'rgba(125, 211, 192, 0.15)',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modalGlassOverlay}
            />

            <Text style={styles.modalHeaderTitle}>Select Treatment</Text>
            <View style={styles.modalDivider} />
            <ScrollView style={styles.modalScrollView}>
              {TREATMENTS
                .filter(treatment => {
                  // For permanent patients, exclude these treatments (they're counted from dental chart/referrals)
                  const editingPatient = props.patients.find(p => p.id === props.editingPatientId);
                  const isPermanent = editingPatient?.permanent_patient_id != null;
                  const excludedTreatments = ['Filling', 'Scaling', 'Pulpectomy', 'Extraction', 'Referral'];

                  if (isPermanent && excludedTreatments.includes(treatment.name)) {
                    return false; // Hide these options for permanent patients
                  }
                  return true;
                })
                .map((treatment) => (
                  <TouchableOpacity
                    key={treatment.name}
                    style={styles.beautifulDropdownItem}
                    onPress={() => props.editingPatientId && props.handleUpdateField(props.editingPatientId, 'treatment', treatment.name)}
                  >
                    <View style={[styles.colorDot, { backgroundColor: '#D4B8E8' }]} />
                    <Text style={styles.beautifulDropdownText}>{treatment.name}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Timeline Modal */}
      {props.showTimelineModal && props.selectedPatient && (
        <Modal visible={props.showTimelineModal} animationType="slide">
          <SafeAreaView style={styles.timelineScreenContainer}>
            <LinearGradient colors={['#E8F5F0', '#F0E8F5']} style={styles.gradient}>
              <View style={styles.timelineHeader}>
                <TouchableOpacity onPress={() => props.setShowTimelineModal(false)}>
                  <Ionicons name="arrow-back" size={28} color="#1F2937" />
                </TouchableOpacity>
                <Text style={styles.timelineTitle}>{props.selectedPatient.name}</Text>
                <View style={{ width: 28 }} />
              </View>

              <ScrollView style={styles.timelineContent}>
                {props.timeline.map((event) => (
                  <View key={event.id} style={[styles.timelineEvent, shadows.card]}>
                    <Text style={styles.eventType}>{event.event_type}</Text>
                    <Text style={styles.eventDetails}>{event.event_details}</Text>
                    {event.doctor_name && (
                      <Text style={styles.eventDoctor}>Done by Dr. {event.doctor_name}</Text>
                    )}
                    {event.assigned_by_doctor_name && (
                      <Text style={styles.eventAssignedBy}>Assigned by Dr. {event.assigned_by_doctor_name}</Text>
                    )}
                    <Text style={styles.eventTime}>
                      {new Date(event.timestamp).toLocaleString()}
                    </Text>
                  </View>
                ))}
              </ScrollView>

              <View style={[styles.treatmentSection, shadows.card]}>
                <TextInput
                  style={styles.treatmentInput}
                  placeholder="Treatment details..."
                  value={props.treatmentNote}
                  onChangeText={props.setTreatmentNote}
                  multiline
                />
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={props.markTreatmentDone}
                >
                  <LinearGradient
                    colors={['#10B981', '#059669']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.addButtonGradient}
                  >
                    <Text style={styles.addButtonText}>Mark as Done</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </SafeAreaView>
        </Modal>
      )}

      {/* Tooth Details Modal (Shared Component) */}
      <ToothDetailsModal
        visible={props.showToothModal}
        onClose={() => props.setShowToothModal(false)}
        permanentPatientId={props.toothModalPatientId}
        toothNumber={props.selectedTooth}
        currentDoctorName={props.currentDoctorName}
        onToothDataUpdated={async () => {
          // Refresh dental chart data after save
          if (props.toothModalPatientId) {
            // Find timeline patient that matches this permanent patient
            const timelinePatient = props.patients.find(p => p.permanent_patient_id === props.toothModalPatientId);

            if (timelinePatient) {
              // 1. Reload dental summary
              const { data: dentalChart } = await getCompleteDentalChart(props.toothModalPatientId);
              if (dentalChart) {
                const summary = generateDentalSummary(dentalChart.teeth);
                // Use timeline patient id as key (NOT permanent patient id)
                props.setDentalSummaries(prev => ({ ...prev, [timelinePatient.id]: summary }));
              }

              // 2. Reload referrals
              const referralsResult = await getReferrals(props.toothModalPatientId);
              if (referralsResult.data) {
                props.setPatientReferrals(prev => ({ ...prev, [props.toothModalPatientId]: referralsResult.data || [] }));
              }

              // 3. Reload tooth notes
              // Add small delay to ensure database is updated
              await new Promise(resolve => setTimeout(resolve, 150));
              const notesResult = await getAllToothNotes(props.toothModalPatientId);
              if (notesResult.data) {
                props.setPatientToothNotes(prev => ({ ...prev, [props.toothModalPatientId]: notesResult.data || [] }));
                console.log(`Reloaded ${notesResult.data.length} notes for patient ${props.toothModalPatientId}`);
              }
            }
          }
        }}
      />
    </>
  );
}
