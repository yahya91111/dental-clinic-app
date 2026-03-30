import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { supabase, Patient, TimelineEvent, arabicToEnglish } from './constants';
import { generateDentalSummary, calculateDentalChartTreatments, calculateGivenReferrals, checkScalingDoneToday, getTreatmentFromBadge } from './dentalHelpers';
import { DentalSummary, Referral, ToothNote } from '../../types';
import {
  searchPermanentPatientsByFileNumber,
  searchPermanentPatients,
  getCompleteDentalChart,
  getEditingRecords,
  createEditingRecord,
  createToothNote,
  createReferral,
  getReferrals,
  getPlanningRecords,
  getAllToothNotes,
  updateReferralStatus,
  getScalingRecords,
  createScalingRecord,
  updatePermanentPatientConsent,
  getPermanentPatientById,
  createPermanentPatient,
  saveToothSurfaceCondition,
} from '../../lib/database';

interface UsePatientHandlersParams {
  user: any;
  patients: Patient[];
  setPatients: React.Dispatch<React.SetStateAction<Patient[]>>;
  displayedPatients: Patient[];
  loadPatients: (silent?: boolean) => Promise<void>;
  selectedClinicId: string | null;
  userClinicId: number | null;
  selectedClinicName: string;

  // Add modal & form state
  setShowAddModal: React.Dispatch<React.SetStateAction<boolean>>;
  newPatientName: string;
  setNewPatientName: React.Dispatch<React.SetStateAction<string>>;
  newPatientFileNumber: string;
  setNewPatientFileNumber: React.Dispatch<React.SetStateAction<string>>;
  newPatientQueueNumber: string;
  setNewPatientQueueNumber: React.Dispatch<React.SetStateAction<string>>;
  newPatientCondition: string;
  setNewPatientCondition: React.Dispatch<React.SetStateAction<string>>;
  newPatientTreatment: string;
  setNewPatientTreatment: React.Dispatch<React.SetStateAction<string>>;
  isElderly: boolean;
  setIsElderly: React.Dispatch<React.SetStateAction<boolean>>;
  newPatientNote: string;
  setNewPatientNote: React.Dispatch<React.SetStateAction<string>>;

  // Patient mode
  patientMode: 'search' | 'walk-in' | 'new-profile';
  setPatientMode: React.Dispatch<React.SetStateAction<'search' | 'walk-in' | 'new-profile'>>;

  // Patient edit mode
  isPatientEditMode: boolean;
  setIsPatientEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  modalEditingPatientId: string | null;
  setModalEditingPatientId: React.Dispatch<React.SetStateAction<string | null>>;

  // Search results
  permanentPatientSearchResults: any[];
  setPermanentPatientSearchResults: React.Dispatch<React.SetStateAction<any[]>>;
  selectedPermanentPatientId: string | null;
  setSelectedPermanentPatientId: React.Dispatch<React.SetStateAction<string | null>>;
  showPatientSuggestions: boolean;
  setShowPatientSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  showFileNumberSuggestions: boolean;
  setShowFileNumberSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  fileNumberSearchResults: any[];
  setFileNumberSearchResults: React.Dispatch<React.SetStateAction<any[]>>;

  // Modal expansion
  setIsModalExpanded: React.Dispatch<React.SetStateAction<boolean>>;

  // Dropdown states
  setShowClinicDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  setShowConditionDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTreatmentDropdown: React.Dispatch<React.SetStateAction<boolean>>;

  // Editing field
  setEditingPatientId: React.Dispatch<React.SetStateAction<string | null>>;
  setEditingField: React.Dispatch<React.SetStateAction<'clinic' | 'condition' | 'treatment' | null>>;

  // Menu
  setShowMenuForPatient: React.Dispatch<React.SetStateAction<string | null>>;

  // Note modal
  setShowNoteModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowViewNoteModal: React.Dispatch<React.SetStateAction<boolean>>;
  currentNote: string;
  setCurrentNote: React.Dispatch<React.SetStateAction<string>>;
  setViewNoteContent: React.Dispatch<React.SetStateAction<string>>;
  notePatientId: string | null;
  setNotePatientId: React.Dispatch<React.SetStateAction<string | null>>;

  // Treatment done modal
  setShowTreatmentDoneModal: React.Dispatch<React.SetStateAction<boolean>>;
  treatmentDonePatientId: string | null;
  setTreatmentDonePatientId: React.Dispatch<React.SetStateAction<string | null>>;
  setClinicDoctors: React.Dispatch<React.SetStateAction<{id: string, name: string}[]>>;
  setDoctorSearchQuery: React.Dispatch<React.SetStateAction<string>>;

  // Animation
  animKey: number;
  setAnimKey: React.Dispatch<React.SetStateAction<number>>;

  // Expandable card
  expandedCardId: string | null;
  setExpandedCardId: React.Dispatch<React.SetStateAction<string | null>>;
  setCardTimelines: React.Dispatch<React.SetStateAction<{ [key: string]: TimelineEvent[] }>>;
  setShowTimelineTab: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>;

  // Permanent patient card expansion
  expandedPermanentCardId: string | null;
  setExpandedPermanentCardId: React.Dispatch<React.SetStateAction<string | null>>;
  dentalSummaries: { [key: string]: DentalSummary };
  setDentalSummaries: React.Dispatch<React.SetStateAction<{ [key: string]: DentalSummary }>>;
  setLoadingDentalData: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>;
  setPatientReferrals: React.Dispatch<React.SetStateAction<{ [key: string]: Referral[] }>>;
  setPatientToothNotes: React.Dispatch<React.SetStateAction<{ [key: string]: ToothNote[] }>>;
  lastScalingDates: { [key: string]: string | null };
  setLastScalingDates: React.Dispatch<React.SetStateAction<{ [key: string]: string | null }>>;
  patientConsents: { [key: string]: boolean };
  setPatientConsents: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>;

  // Header collapse
  isHeaderCollapsed: boolean;
  toggleHeaderCollapse: () => void;

  // Convert modal
  convertPatientId: string | null;
  setConvertPatientId: React.Dispatch<React.SetStateAction<string | null>>;
  convertFileNumber: string;
  setConvertFileNumber: React.Dispatch<React.SetStateAction<string>>;
  setShowConvertModal: React.Dispatch<React.SetStateAction<boolean>>;

  // Timeline modal
  selectedPatient: Patient | null;
  setSelectedPatient: React.Dispatch<React.SetStateAction<Patient | null>>;
  setShowTimelineModal: React.Dispatch<React.SetStateAction<boolean>>;
  treatmentNote: string;
  setTreatmentNote: React.Dispatch<React.SetStateAction<string>>;
  loadTimeline: (patientId: string) => void;
}

export function usePatientHandlers(params: UsePatientHandlersParams) {
  const {
    user,
    patients,
    setPatients,
    displayedPatients,
    loadPatients,
    selectedClinicId,
    userClinicId,
    selectedClinicName,
    setShowAddModal,
    newPatientName,
    setNewPatientName,
    newPatientFileNumber,
    setNewPatientFileNumber,
    newPatientQueueNumber,
    setNewPatientQueueNumber,
    newPatientCondition,
    setNewPatientCondition,
    newPatientTreatment,
    setNewPatientTreatment,
    isElderly,
    setIsElderly,
    newPatientNote,
    setNewPatientNote,
    patientMode,
    setPatientMode,
    isPatientEditMode,
    setIsPatientEditMode,
    modalEditingPatientId,
    setModalEditingPatientId,
    permanentPatientSearchResults,
    setPermanentPatientSearchResults,
    selectedPermanentPatientId,
    setSelectedPermanentPatientId,
    showPatientSuggestions,
    setShowPatientSuggestions,
    showFileNumberSuggestions,
    setShowFileNumberSuggestions,
    fileNumberSearchResults,
    setFileNumberSearchResults,
    setIsModalExpanded,
    setShowClinicDropdown,
    setShowConditionDropdown,
    setShowTreatmentDropdown,
    setEditingPatientId,
    setEditingField,
    setShowMenuForPatient,
    setShowNoteModal,
    setShowViewNoteModal,
    currentNote,
    setCurrentNote,
    setViewNoteContent,
    notePatientId,
    setNotePatientId,
    setShowTreatmentDoneModal,
    treatmentDonePatientId,
    setTreatmentDonePatientId,
    setClinicDoctors,
    setDoctorSearchQuery,
    animKey,
    setAnimKey,
    expandedCardId,
    setExpandedCardId,
    setCardTimelines,
    setShowTimelineTab,
    expandedPermanentCardId,
    setExpandedPermanentCardId,
    dentalSummaries,
    setDentalSummaries,
    setLoadingDentalData,
    setPatientReferrals,
    setPatientToothNotes,
    lastScalingDates,
    setLastScalingDates,
    patientConsents,
    setPatientConsents,
    isHeaderCollapsed,
    toggleHeaderCollapse,
    convertPatientId,
    setConvertPatientId,
    convertFileNumber,
    setConvertFileNumber,
    setShowConvertModal,
    selectedPatient,
    setSelectedPatient,
    setShowTimelineModal,
    treatmentNote,
    setTreatmentNote,
    loadTimeline,
  } = params;

  // Search permanent patient by file number
  const handleFileNumberSearch = async (fileNumber: string) => {
    const clinicId = selectedClinicId || userClinicId;
    if (fileNumber.length === 4 && clinicId) {
      try {
        const { data, error } = await searchPermanentPatientsByFileNumber(
          fileNumber,
          clinicId.toString()
        );

        if (error) {
          console.error('Error searching permanent patient:', error);
          setPermanentPatientSearchResults([]);
          return;
        }

        if (data && data.length > 0) {
          console.log('🔍 Search results:', data);
          console.log('🔍 First patient name:', data[0].name);
          console.log('🔍 First patient name type:', typeof data[0].name);

          setPermanentPatientSearchResults(data);
          setShowPatientSuggestions(true);

          // Auto-fill name if only one result
          if (data.length === 1) {
            setNewPatientName(data[0].name);
            setSelectedPermanentPatientId(data[0].id);
          }
        } else {
          setPermanentPatientSearchResults([]);
          setShowPatientSuggestions(false);
        }
      } catch (error) {
        console.error('Search error:', error);
        setPermanentPatientSearchResults([]);
      }
    } else {
      // Clear search if file number is incomplete
      setPermanentPatientSearchResults([]);
      setShowPatientSuggestions(false);
      setSelectedPermanentPatientId(null);
    }
  };

  const handlePatientNameSearch = async (name: string) => {
    // Only search if name has at least 3 characters
    const clinicId = selectedClinicId || userClinicId;
    if (name.length >= 3 && clinicId) {
      try {
        const { data, error } = await searchPermanentPatients(
          name,
          clinicId.toString()
        );

        if (error) {
          console.error('Error searching by name:', error);
          setFileNumberSearchResults([]);
          return;
        }

        if (data && data.length > 0) {
          // Filter to only show patients with matching names
          const matchingPatients = data.filter(patient =>
            patient.name.toLowerCase().includes(name.toLowerCase())
          );

          if (matchingPatients.length > 0) {
            setFileNumberSearchResults(matchingPatients);
            setShowFileNumberSuggestions(true);

            // Auto-fill file number if only one result
            if (matchingPatients.length === 1) {
              const englishFileNumber = arabicToEnglish(matchingPatients[0].file_number || '');
              setNewPatientFileNumber(englishFileNumber);
              setSelectedPermanentPatientId(matchingPatients[0].id);
            }
          } else {
            // No results found - clear file number and hide suggestions
            setFileNumberSearchResults([]);
            setShowFileNumberSuggestions(false);
            setNewPatientFileNumber(''); // Clear file number when no match
            setSelectedPermanentPatientId(null);
          }
        } else {
          // No data - clear file number
          setFileNumberSearchResults([]);
          setShowFileNumberSuggestions(false);
          setNewPatientFileNumber('');
          setSelectedPermanentPatientId(null);
        }
      } catch (error) {
        console.error('Name search error:', error);
        setFileNumberSearchResults([]);
        setNewPatientFileNumber(''); // Clear on error
        setSelectedPermanentPatientId(null);
      }
    } else {
      // Clear search if name is too short
      setFileNumberSearchResults([]);
      setShowFileNumberSuggestions(false);
      // Clear file number when name becomes too short (user is deleting)
      if (name.length < 3) {
        setNewPatientFileNumber('');
        setSelectedPermanentPatientId(null);
      }
    }
  };

  const handleAddPatient = async () => {
    if (!newPatientName.trim()) {
      Alert.alert('Error', 'Please enter patient name');
      return;
    }

    // Validate file number for new-profile mode
    if (patientMode === 'new-profile' && !newPatientFileNumber.trim()) {
      Alert.alert('Error', 'Please enter file number for new profile');
      return;
    }

    try {

      const englishQueueNumber = arabicToEnglish(newPatientQueueNumber);
      const queueNumber = parseInt(englishQueueNumber);

      if (isNaN(queueNumber) || queueNumber < 1) {
        Alert.alert('Error', 'Please enter valid number');
        return;
      }

      // Convert file number Arabic numerals to English
      const englishFileNumber = newPatientFileNumber.trim()
        ? arabicToEnglish(newPatientFileNumber.trim())
        : null;

      // ========== EDIT MODE: Update existing patient ==========
      if (isPatientEditMode && modalEditingPatientId) {
        let permanentPatientId = selectedPermanentPatientId;

        // If in 'new-profile' mode while editing, create/find permanent patient
        if (patientMode === 'new-profile' && englishFileNumber) {
          console.log('Converting to permanent patient:', {
            fileNumber: englishFileNumber,
            patientName: newPatientName
          });

          // ابحث عن permanent patient بنفس رقم الملف (قد يكون هناك عدة مرضى بنفس الملف)
          const searchResult = await searchPermanentPatientsByFileNumber(
            englishFileNumber,
            userClinicId || selectedClinicId
          );

          if (searchResult.data && searchResult.data.length > 0) {
            // وُجد ملف أو عدة ملفات بنفس الرقم - ابحث عن تطابق تام مع الاسم
            const exactMatch = searchResult.data.find(p =>
              p.name.toLowerCase().trim() === newPatientName.toLowerCase().trim()
            );

            if (exactMatch) {
              // DUPLICATE - same file number + same name already exists
              console.log('❌ Duplicate found in Edit Mode - cannot convert to permanent');
              Alert.alert(
                'Duplicate Patient',
                `Patient "${newPatientName}" is already registered with file number ${englishFileNumber}.\n\nCannot convert this patient to permanent. Please use a different name or file number.`,
                [{ text: 'OK' }]
              );
              return; // Stop execution - prevent duplicate
            } else {
              // رقم الملف موجود لكن الاسم مختلف = مريض جديد في ملف عائلي مشترك
              console.log('✅ File number exists, different name - creating new permanent patient (family file)');
              const createResult = await createPermanentPatient(
                englishFileNumber,
                newPatientName,
                userClinicId || selectedClinicId || ''
              );

              if (createResult.error || !createResult.data) {
                console.error('Failed to create permanent patient:', createResult.error);
                Alert.alert('خطأ', 'فشل إنشاء ملف المريض الدائم');
                return;
              }

              permanentPatientId = createResult.data.id;
              console.log('✅ Created new permanent patient in family file:', createResult.data);
            }
          } else {
            // Create new permanent patient - first time using this file number
            console.log('Creating new permanent patient - new file number');
            const createResult = await createPermanentPatient(
              englishFileNumber,
              newPatientName,
              userClinicId || selectedClinicId || ''
            );

            if (createResult.error || !createResult.data) {
              console.error('Failed to create permanent patient:', createResult.error);
              Alert.alert('خطأ', 'فشل إنشاء ملف المريض الدائم');
              return;
            }

            console.log('Created permanent patient:', createResult.data);
            permanentPatientId = createResult.data.id;
          }
        }

        // Update patient record
        const updateData: any = {
          name: newPatientName,
          queue_number: queueNumber,
          is_elderly: isElderly,
          status: isElderly ? 'elderly' : 'normal',
          note: newPatientNote.trim() || null,
          condition: newPatientCondition,
        };

        // If converting to permanent, update these fields
        if (patientMode === 'new-profile' && permanentPatientId) {
          updateData.file_number = englishFileNumber;
          updateData.permanent_patient_id = permanentPatientId;
          updateData.patient_type = 'permanent';
          console.log('Updating patient with permanent data:', {
            file_number: englishFileNumber,
            permanent_patient_id: permanentPatientId,
            patient_type: 'permanent'
          });
        }

        console.log('Final updateData before database update:', updateData);

        const { error } = await supabase
          .from('patients')
          .update(updateData)
          .eq('id', modalEditingPatientId);

        if (error) {
          console.error('Database update error:', error);
          throw error;
        }

        console.log('Database update successful');

        // If converted to permanent, load dental data
        if (patientMode === 'new-profile' && permanentPatientId) {
          console.log('Loading dental data for converted patient...');
          await loadDentalData(permanentPatientId, modalEditingPatientId, true);
        }

        // Update local state immediately
        setPatients(prev => prev.map(p =>
          p.id === modalEditingPatientId
            ? {
                ...p,
                ...updateData,
              }
            : p
        ));

        // Trigger animation refresh
        setAnimKey(prev => prev + 1);

        await loadPatients();
        setShowAddModal(false);

        // Reset all form fields
        setNewPatientName('');
        setNewPatientFileNumber('');
        setNewPatientQueueNumber('');
        setNewPatientCondition('Condition');
        setNewPatientTreatment('Treatment');
        setIsElderly(false);
        setNewPatientNote('');
        setShowConditionDropdown(false);
        setShowTreatmentDropdown(false);
        setPermanentPatientSearchResults([]);
        setFileNumberSearchResults([]);
        setSelectedPermanentPatientId(null);
        setShowPatientSuggestions(false);
        setShowFileNumberSuggestions(false);
        setIsModalExpanded(false);
        setPatientMode('search');

        // Reset edit mode
        setIsPatientEditMode(false);
        setModalEditingPatientId(null);

        Alert.alert('Success', patientMode === 'new-profile' && permanentPatientId
          ? 'Patient converted to permanent successfully'
          : 'Patient updated successfully');
        return;
      }

      // ========== ADD MODE: Create new patient ==========
      let permanentPatientId = selectedPermanentPatientId;

      // If in 'new-profile' mode, check for duplicates first
      if (patientMode === 'new-profile' && englishFileNumber) {
        console.log('Creating permanent patient:', {
          fileNumber: englishFileNumber,
          patientName: newPatientName
        });

        // Search for existing permanent patient with same file number
        const searchResult = await searchPermanentPatientsByFileNumber(
          englishFileNumber,
          userClinicId || selectedClinicId
        );

        if (searchResult.data && searchResult.data.length > 0) {
          // Found file(s) with same number - check for exact name match
          const exactMatch = searchResult.data.find(p =>
            p.name.toLowerCase().trim() === newPatientName.toLowerCase().trim()
          );

          if (exactMatch) {
            // DUPLICATE - same file number + same name
            Alert.alert(
              'Duplicate Patient',
              `Patient "${newPatientName}" is already registered with file number ${englishFileNumber}.\n\nPlease use a different name or file number.`,
              [{ text: 'OK' }]
            );
            return; // Stop execution
          } else {
            // Same file number, different name - create new (family file)
            console.log('✅ File number exists, different name - creating new permanent patient (family file)');
            const createResult = await createPermanentPatient(
              englishFileNumber,
              newPatientName,
              userClinicId || selectedClinicId || ''
            );

            if (createResult.error || !createResult.data) {
              console.error('Failed to create permanent patient:', createResult.error);
              Alert.alert('Error', 'Failed to create permanent patient profile');
              return;
            }

            permanentPatientId = createResult.data.id;
            console.log('✅ Created new permanent patient in family file:', createResult.data);
          }
        } else {
          // New file number - create new permanent patient
          console.log('Creating new permanent patient - new file number');
          const createResult = await createPermanentPatient(
            englishFileNumber,
            newPatientName,
            userClinicId || selectedClinicId || ''
          );

          if (createResult.error || !createResult.data) {
            console.error('Failed to create permanent patient:', createResult.error);
            Alert.alert('Error', 'Failed to create permanent patient profile');
            return;
          }

          console.log('Created permanent patient:', createResult.data);
          permanentPatientId = createResult.data.id;
        }
      }

      const now = new Date();

      const { data, error } = await supabase
        .from('patients')
        .insert([
          {
            name: newPatientName,
            queue_number: queueNumber,
            status: isElderly ? 'elderly' : 'normal',
            is_elderly: isElderly,
            note: newPatientNote.trim() || null,
            clinic: 'Clinic',
            clinic_id: selectedClinicId || userClinicId,
            condition: newPatientCondition,
            treatment: newPatientTreatment,
            // Permanent patient linking (Migration completed )
            file_number: englishFileNumber,
            permanent_patient_id: permanentPatientId || null,
            patient_type: permanentPatientId ? 'permanent' : 'walk-in',
            // Timeline fields
            registered_at: now.toISOString(),
          },
        ])
        .select();

      if (error) throw error;

      await loadPatients();
      setShowAddModal(false);
      setNewPatientName('');
      setNewPatientFileNumber('');
      setNewPatientQueueNumber('');
      setNewPatientCondition('Condition');
      setNewPatientTreatment('Treatment');
      setIsElderly(false);
      setNewPatientNote('');
      setShowConditionDropdown(false);
      setShowTreatmentDropdown(false);
      // Clear search states
      setPermanentPatientSearchResults([]);
      setFileNumberSearchResults([]);
      setSelectedPermanentPatientId(null);
      setShowPatientSuggestions(false);
      setShowFileNumberSuggestions(false);
      setIsModalExpanded(false);
      setPatientMode('search');
      Alert.alert('Success', 'Patient added successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Unknown error occurred');
    }
  };

  // دالة الأرشفة - نقل جميع المرضى للأرشيف
  const handleArchive = async () => {
    try {
      const clinicId = selectedClinicId || userClinicId;

      if (clinicId === null) {
        Alert.alert('Error', 'Please select a clinic first');
        return;
      }

      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // تحديث archive_date لجميع المرضى في المركز الحالي
      const { data, error } = await supabase
        .from('patients')
        .update({
          archive_date: today,
          status: 'complete' // تغيير الحالة إلى complete
        })
        .eq('clinic_id', clinicId) // عزل حسب المركز
        .is('archive_date', null); // فقط المرضى غير المؤرشفين

      if (error) throw error;

      // إعادة تحميل المرضى (سيكون فارغاً)
      await loadPatients();

      Alert.alert('Success', `All patients archived for clinic ${selectedClinicName} successfully`);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Archive failed');
    }
  };

  const handleMenuAction = async (patientId: string, action: string) => {
    setShowMenuForPatient(null);

    switch (action) {
      case 'edit':
        const editPatient = patients.find(p => p.id === patientId);
        if (editPatient) {
          console.log('Editing patient:', editPatient);
          console.log('Queue number:', editPatient.queue_number, 'Type:', typeof editPatient.queue_number);

          // Load patient data into modal fields
          setNewPatientName(editPatient.name);
          setNewPatientFileNumber(editPatient.file_number || '');
          const queueNumberString = editPatient.queue_number?.toString() || '';
          console.log('Setting queue number to:', queueNumberString);
          setNewPatientQueueNumber(queueNumberString);
          setNewPatientCondition(editPatient.condition || 'Condition');
          setIsElderly(editPatient.isElderly || false);
          setNewPatientNote(editPatient.note || '');

          // Set edit mode
          setIsPatientEditMode(true);
          setModalEditingPatientId(patientId);

          console.log('Edit mode set. Queue number should be:', queueNumberString);

          // Determine patient mode based on file_number
          if (!editPatient.file_number) {
            setPatientMode('walk-in');
          } else {
            setPatientMode('search');
            setSelectedPermanentPatientId(editPatient.permanent_patient_id || null);
          }

          // Open modal
          setShowAddModal(true);
          setIsModalExpanded(false);
        }
        break;
      case 'note':
        const patient = patients.find(p => p.id === patientId);
        setNotePatientId(patientId);
        setCurrentNote(patient?.note || '');
        setShowNoteModal(true);
        break;
      case 'na':
        try {
          const patient = patients.find(p => p.id === patientId);
          const newStatus = patient?.status === 'na' ? 'normal' : 'na';
          await supabase
            .from('patients')
            .update({ status: newStatus })
            .eq('id', patientId);
          await loadPatients();
        } catch (error: any) {
          Alert.alert('Error', error.message);
        }
        break;
      case 'elderly':
        try {
          const patient = patients.find(p => p.id === patientId);
          const newElderly = !patient?.isElderly;
          await supabase
            .from('patients')
            .update({ is_elderly: newElderly })
            .eq('id', patientId);
          await loadPatients();
        } catch (error: any) {
          Alert.alert('Error', error.message);
        }
        break;
      case 'special_needs':
        try {
          const patient = patients.find(p => p.id === patientId);
          const newSpecialNeeds = !patient?.isSpecialNeeds;
          await supabase
            .from('patients')
            .update({ is_special_needs: newSpecialNeeds })
            .eq('id', patientId);
          await loadPatients();
        } catch (error: any) {
          Alert.alert('Error', error.message);
        }
        break;
      case 'complete':
        // Check if patient is already completed
        const targetPatient = patients.find(p => p.id === patientId);

        if (targetPatient?.status === 'complete') {
          // Undo treatment done - revert to normal status
          try {
            await supabase
              .from('patients')
              .update({
                status: 'normal',
                completed_at: null,
                doctor_name: null,
                assigned_by_doctor_name: null
              })
              .eq('id', patientId);

            await loadPatients();
            Alert.alert('Done', 'Treatment unmarked as complete');
          } catch (error: any) {
            Alert.alert('Error', error.message);
          }
        } else {
          // Open treatment done modal
          setTreatmentDonePatientId(patientId);
          loadClinicDoctors();
          setShowTreatmentDoneModal(true);
        }
        break;
      case 'delete':
        try {
          await supabase
            .from('patients')
            .delete()
            .eq('id', patientId);
          await loadPatients();
        } catch (error: any) {
          Alert.alert('Error', error.message);
        }
        break;
      case 'new_profile':
        setConvertPatientId(patientId);
        setConvertFileNumber('');
        setShowConvertModal(true);
        break;
    }
  };

  const handleSaveNote = async () => {
    if (notePatientId) {
      try {
        await supabase
          .from('patients')
          .update({ note: currentNote })
          .eq('id', notePatientId);

        // Update patients array locally immediately
        setPatients(prev => prev.map(p =>
          p.id === notePatientId ? { ...p, note: currentNote } : p
        ));

        await loadPatients();
      } catch (error: any) {
        Alert.alert('Error', error.message);
      }
    }
    setShowNoteModal(false);
    setCurrentNote('');
    setNotePatientId(null);
  };

  const handleViewNote = (patientId: string) => {
    const patient = patients.find(p => p.id === patientId);
    if (patient?.note) {
      setNotePatientId(patientId);
      setViewNoteContent(patient.note);  // Use separate state for viewing
      setShowViewNoteModal(true);
    }
  };

  // Load doctors from same clinic
  const loadClinicDoctors = async () => {
    try {
      let clinicId = selectedClinicId || userClinicId;

      // If clinicId is not available, fetch it directly from doctors table
      if (clinicId === null && user?.id) {
        const { data: userData, error: userError } = await supabase
          .from('doctors')
          .select('clinic_id')
          .eq('id', user.id)
          .single();

        if (userError || !userData?.clinic_id) {
          Alert.alert('Error', 'Cannot find clinic ID');
          return;
        }

        clinicId = userData.clinic_id;
      }

      if (clinicId === null) {
        Alert.alert('Error', 'Cannot find clinic ID');
        return;
      }

      const { data, error } = await supabase
        .from('doctors')
        .select('id, name')
        .eq('clinic_id', clinicId)
        .neq('id', user?.id || ''); // Exclude current user

      if (error) {
        Alert.alert('Error', 'Failed to load doctors: ' + error.message);
        return;
      }

      if (data && data.length > 0) {
        setClinicDoctors(data);
      } else {
        setClinicDoctors([]);
        // Only show alert if query succeeded but no doctors found
        if (data) {
          Alert.alert('Warning', 'No other doctors in clinic ' + clinicId);
        }
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load doctors');
    }
  };

  // Handle treatment done by selected doctor
  const handleTreatmentDoneByDoctor = async (doctorId: string | null, doctorName: string | null) => {
    if (!treatmentDonePatientId) return;

    try {
      // Find the patient in the list
      const patient = patients.find(p => p.id === treatmentDonePatientId);

      if (!patient) {
        Alert.alert('Error', 'Patient not found');
        return;
      }

      const finalDoctorId = doctorId || user?.id;
      const finalDoctorName = doctorName || user?.name || user?.email || 'Unknown';
      const assignedByDoctorName = (doctorId && doctorName) ? (user?.name || user?.email || 'Unknown') : null;
      const today = new Date().toISOString().split('T')[0];
      const completedAt = new Date().toISOString();

      // Check if this is a permanent patient
      if (patient.permanent_patient_id) {
        // ═══════════════════════════════════════════════════════════════
        // PERMANENT PATIENT - Create separate records for each treatment
        // ═══════════════════════════════════════════════════════════════

        const treatmentsToInsert: any[] = [];

        // 1. Calculate treatments from Dental Chart (editing_records)
        const dentalChartTreatments = await calculateDentalChartTreatments(patient.permanent_patient_id);

        for (const [treatment, count] of Object.entries(dentalChartTreatments)) {
          for (let i = 0; i < count; i++) {
            treatmentsToInsert.push({
              permanent_patient_id: patient.permanent_patient_id,
              name: patient.name,
              file_number: patient.file_number,
              treatment: treatment,
              condition: patient.condition || 'Permanent Patient', // استخدام condition الأصلي
              clinic: patient.clinic || 'Clinic',
              status: 'complete',
              completed_at: completedAt,
              archive_date: null, // Will be archived at 12:59 AM
              doctor_id: finalDoctorId,
              doctor_name: finalDoctorName,
              assigned_by_doctor_name: assignedByDoctorName,
              clinic_id: patient.clinic_id,
              queue_number: -1, // Special marker: statistics record (hidden from timeline)
              patient_type: 'permanent',
            });
          }
        }

        // 2. Check for Referrals (only count once if at least one is given)
        const referralCount = await calculateGivenReferrals(patient.permanent_patient_id);
        if (referralCount > 0) {
          treatmentsToInsert.push({
            permanent_patient_id: patient.permanent_patient_id,
            name: patient.name,
            file_number: patient.file_number,
            treatment: 'Referral',
            condition: patient.condition || 'Permanent Patient', // استخدام condition الأصلي
            clinic: patient.clinic || 'Clinic',
            status: 'complete',
            completed_at: completedAt,
            archive_date: null, // Will be archived at 12:59 AM
            doctor_id: finalDoctorId,
            doctor_name: finalDoctorName,
            assigned_by_doctor_name: assignedByDoctorName,
            clinic_id: patient.clinic_id,
            queue_number: -1, // Special marker: statistics record (hidden from timeline)
            patient_type: 'permanent',
          });
        }

        // 3. Check for Scaling (only if done today)
        const scalingCount = await checkScalingDoneToday(lastScalingDates[patient.id]);
        if (scalingCount > 0) {
          treatmentsToInsert.push({
            permanent_patient_id: patient.permanent_patient_id,
            name: patient.name,
            file_number: patient.file_number,
            treatment: 'Scaling',
            condition: patient.condition || 'Permanent Patient', // استخدام condition الأصلي
            clinic: patient.clinic || 'Clinic',
            status: 'complete',
            completed_at: completedAt,
            archive_date: null, // Will be archived at 12:59 AM
            doctor_id: finalDoctorId,
            doctor_name: finalDoctorName,
            assigned_by_doctor_name: assignedByDoctorName,
            clinic_id: patient.clinic_id,
            queue_number: -1, // Special marker: statistics record (hidden from timeline)
            patient_type: 'permanent',
          });
        }

        // 4. Check for treatments from badge (Medication, Cementation, Suture Removal)
        const badgeTreatment = getTreatmentFromBadge(patient);
        if (badgeTreatment) {
          treatmentsToInsert.push({
            permanent_patient_id: patient.permanent_patient_id,
            name: patient.name,
            file_number: patient.file_number,
            treatment: badgeTreatment,
            condition: patient.condition || 'Permanent Patient', // استخدام condition الأصلي
            clinic: patient.clinic || 'Clinic',
            status: 'complete',
            completed_at: completedAt,
            archive_date: null, // Will be archived at 12:59 AM
            doctor_id: finalDoctorId,
            doctor_name: finalDoctorName,
            assigned_by_doctor_name: assignedByDoctorName,
            clinic_id: patient.clinic_id,
            queue_number: -1, // Special marker: statistics record (hidden from timeline)
            patient_type: 'permanent',
          });
        }

        // Get existing statistics records for this permanent patient today
        const { data: existingStats, error: fetchStatsError } = await supabase
          .from('patients')
          .select('id, treatment')
          .eq('permanent_patient_id', patient.permanent_patient_id)
          .eq('queue_number', -1) // Statistics records only
          .is('archive_date', null); // Only today's records (not archived)

        if (fetchStatsError) throw fetchStatsError;

        // Count existing treatments
        const existingTreatmentCounts: { [key: string]: number } = {};
        (existingStats || []).forEach((stat: any) => {
          const treatment = stat.treatment;
          existingTreatmentCounts[treatment] = (existingTreatmentCounts[treatment] || 0) + 1;
        });

        // Count desired treatments
        const desiredTreatmentCounts: { [key: string]: number } = {};
        treatmentsToInsert.forEach(t => {
          const treatment = t.treatment;
          desiredTreatmentCounts[treatment] = (desiredTreatmentCounts[treatment] || 0) + 1;
        });

        // Calculate what to add and what to remove
        const treatmentsToAdd: any[] = [];
        const treatmentIdsToDelete: string[] = [];

        // Check what to add (if desired > existing)
        for (const [treatment, desiredCount] of Object.entries(desiredTreatmentCounts)) {
          const existingCount = existingTreatmentCounts[treatment] || 0;
          const toAdd = desiredCount - existingCount;

          if (toAdd > 0) {
            // Add the missing treatments
            for (let i = 0; i < toAdd; i++) {
              const treatmentData = treatmentsToInsert.find(t => t.treatment === treatment);
              if (treatmentData) {
                treatmentsToAdd.push(treatmentData);
              }
            }
          }
        }

        // Check what to remove (if existing > desired)
        for (const [treatment, existingCount] of Object.entries(existingTreatmentCounts)) {
          const desiredCount = desiredTreatmentCounts[treatment] || 0;
          const toRemove = existingCount - desiredCount;

          if (toRemove > 0) {
            // Find records to delete
            const recordsToDelete = (existingStats || [])
              .filter((stat: any) => stat.treatment === treatment)
              .slice(0, toRemove)
              .map((stat: any) => stat.id);

            treatmentIdsToDelete.push(...recordsToDelete);
          }
        }

        // Delete excess treatments
        if (treatmentIdsToDelete.length > 0) {
          const { error: deleteError } = await supabase
            .from('patients')
            .delete()
            .in('id', treatmentIdsToDelete);

          if (deleteError) throw deleteError;
        }

        // Insert new treatments
        if (treatmentsToAdd.length > 0) {
          const { error: insertError } = await supabase
            .from('patients')
            .insert(treatmentsToAdd);

          if (insertError) throw insertError;
        }

        // Update the original timeline patient record to complete
        // Keep it visible in timeline until auto-archive at 12:59 AM
        const { error: updateError } = await supabase
          .from('patients')
          .update({
            status: 'complete',
            completed_at: completedAt,
            doctor_id: finalDoctorId,
            doctor_name: finalDoctorName,
            assigned_by_doctor_name: assignedByDoctorName,
          })
          .eq('id', treatmentDonePatientId);

        if (updateError) throw updateError;

      } else {
        // ═══════════════════════════════════════════════════════════════
        // REGULAR PATIENT - Update existing record
        // ═══════════════════════════════════════════════════════════════

        const updateData: any = {
          status: 'complete',
          completed_at: completedAt,
          doctor_id: finalDoctorId,
          doctor_name: finalDoctorName,
          assigned_by_doctor_name: assignedByDoctorName,
        };

        await supabase
          .from('patients')
          .update(updateData)
          .eq('id', treatmentDonePatientId);
      }

      await loadPatients();
      setShowTreatmentDoneModal(false);
      setTreatmentDonePatientId(null);
      setDoctorSearchQuery('');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleUpdateField = async (patientId: string, field: 'clinic' | 'condition' | 'treatment', value: string) => {
    try {
      const updateData: any = {};
      if (field === 'clinic') {
        updateData.clinic = value; // Update clinic name only
        // Record clinic entry time
        updateData.clinic_entry_at = new Date().toISOString();
      } else {
        updateData[field] = value;
      }

      const { error } = await supabase
        .from('patients')
        .update(updateData)
        .eq('id', patientId);

      if (error) {
        Alert.alert('Error', error.message || 'Failed to update');
        return;
      }

      await loadPatients();
      setShowClinicDropdown(false);
      setShowConditionDropdown(false);
      setShowTreatmentDropdown(false);
      setEditingPatientId(null);
      setEditingField(null);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'An error occurred');
    }
  };

  const handleDeleteNote = async () => {
    if (notePatientId) {
      try {
        await supabase
          .from('patients')
          .update({ note: null })
          .eq('id', notePatientId);
        await loadPatients();
      } catch (error: any) {
        Alert.alert('Error', error.message);
      }
    }
    setShowViewNoteModal(false);
    setCurrentNote('');
    setViewNoteContent('');
    setNotePatientId(null);
  };

  // Load timeline for expandable card
  const loadCardTimeline = async (patientId: string) => {
    try {
      const { data, error } = await supabase
        .from('timeline_events')
        .select('id, patient_id, event_type, event_details, timestamp, doctor_name, assigned_by_doctor_name')
        .eq('patient_id', patientId)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      setCardTimelines(prev => ({ ...prev, [patientId]: data || [] }));
      // Default to Timeline tab
      setShowTimelineTab(prev => ({ ...prev, [patientId]: true }));
    } catch (error: any) {
      // Error handled silently
    }
  };

  // Handle View Details button
  const handleViewDetails = (patientId: string) => {
    if (expandedCardId === patientId) {
      // Collapse
      setExpandedCardId(null);
    } else {
      // Expand and load timeline
      setExpandedCardId(patientId);
      loadCardTimeline(patientId);
    }
  };

  // Handle toggle between Timeline and NA Patients
  const handleToggleTab = (patientId: string) => {
    setShowTimelineTab(prev => ({ ...prev, [patientId]: !prev[patientId] }));
  };

  // Load dental data for permanent patient
  const loadDentalData = async (permanentPatientId: string, patientId: string, forceReload: boolean = false) => {
    // Check if already loaded (skip check if forceReload is true)
    if (!forceReload && dentalSummaries[patientId]) {
      return;
    }

    setLoadingDentalData(prev => ({ ...prev, [patientId]: true }));

    try {
      const { data, error } = await getCompleteDentalChart(permanentPatientId);

      if (error) {
        console.error('Error loading dental data:', error);
        return;
      }

      if (data && data.teeth) {
        const summary = generateDentalSummary(data.teeth);
        setDentalSummaries(prev => ({ ...prev, [patientId]: summary }));
      }

      // Fetch scaling records to get last scaling date
      const scalingResult = await getScalingRecords(permanentPatientId);
      if (scalingResult.data && scalingResult.data.length > 0) {
        const lastScalingDate = scalingResult.data[0].timestamp; // Already sorted descending
        setLastScalingDates(prev => ({ ...prev, [patientId]: lastScalingDate }));
      } else {
        setLastScalingDates(prev => ({ ...prev, [patientId]: null }));
      }

      // Also reload referrals and tooth notes
      const referralsResult = await getReferrals(permanentPatientId);
      if (referralsResult.data) {
        setPatientReferrals(prev => ({ ...prev, [permanentPatientId]: referralsResult.data || [] }));
      }

      // Add small delay to ensure database is updated
      await new Promise(resolve => setTimeout(resolve, 150));
      const notesResult = await getAllToothNotes(permanentPatientId);
      if (notesResult.data) {
        setPatientToothNotes(prev => ({ ...prev, [permanentPatientId]: notesResult.data || [] }));
        console.log(`✅ Loaded ${notesResult.data.length} notes in loadDentalData for patient ${permanentPatientId}`);
      }
    } catch (error) {
      console.error('Error loading dental data:', error);
    } finally {
      setLoadingDentalData(prev => ({ ...prev, [patientId]: false }));
    }
  };

  // Load scaling data and consent for all permanent patients in the list
  useEffect(() => {
    const loadScalingData = async () => {
      for (const patient of displayedPatients) {
        if (patient.permanent_patient_id) {
          try {
            // Load scaling data
            if (!lastScalingDates[patient.id]) {
              const scalingResult = await getScalingRecords(patient.permanent_patient_id);
              if (scalingResult.data && scalingResult.data.length > 0) {
                const lastScalingDate = scalingResult.data[0].timestamp;
                setLastScalingDates(prev => ({ ...prev, [patient.id]: lastScalingDate }));
              }
            }

            // Load consent data
            if (patientConsents[patient.id] === undefined) {
              const patientDataResult = await getPermanentPatientById(patient.permanent_patient_id);
              if (patientDataResult.data) {
                setPatientConsents(prev => ({ ...prev, [patient.id]: patientDataResult.data?.consent || false }));
              }
            }
          } catch (error) {
            console.error('Error loading patient data:', error);
          }
        }
      }
    };

    loadScalingData();
  }, [displayedPatients.map(p => p.id).join(',')]);

  // Toggle permanent patient card expansion
  const togglePermanentCardExpansion = async (patient: Patient) => {
    const isExpanding = expandedPermanentCardId !== patient.id;

    setExpandedPermanentCardId(prev => prev === patient.id ? null : patient.id);

    // Auto-collapse header when expanding card
    if (isExpanding && !isHeaderCollapsed) {
      toggleHeaderCollapse();
    }
    // Auto-expand header when closing card
    else if (!isExpanding && isHeaderCollapsed) {
      toggleHeaderCollapse();
    }

    // Load dental data when expanding - always force reload to get fresh data
    if (isExpanding && patient.permanent_patient_id) {
      await loadDentalData(patient.permanent_patient_id, patient.id, true); // forceReload = true
    }
  };

  // Toggle patient consent
  const togglePatientConsent = async (patient: Patient) => {
    if (!patient.permanent_patient_id) {
      Alert.alert('Error', 'Patient ID not found');
      return;
    }

    try {
      const currentConsent = patientConsents[patient.id] || false;
      const newConsent = !currentConsent;

      // Optimistically update UI
      setPatientConsents(prev => ({ ...prev, [patient.id]: newConsent }));

      // Update database
      const { error } = await updatePermanentPatientConsent(patient.permanent_patient_id, newConsent);

      if (error) {
        // Revert on error
        setPatientConsents(prev => ({ ...prev, [patient.id]: currentConsent }));
        Alert.alert('Error', 'Failed to update consent status');
      }
    } catch (err) {
      console.error('Error updating consent:', err);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  // Convert regular patient to permanent patient
  const convertToPermanentPatient = async () => {
    if (!convertPatientId || !convertFileNumber.trim()) {
      Alert.alert('Error', 'Please enter a file number');
      return;
    }

    try {
      const patient = patients.find(p => p.id === convertPatientId);
      if (!patient) {
        Alert.alert('Error', 'Patient not found');
        return;
      }

      console.log('Converting patient:', patient.name, 'File Number:', convertFileNumber);

      // Search for existing permanent patient or create new one
      const searchResult = await searchPermanentPatientsByFileNumber(convertFileNumber.trim(), userClinicId || selectedClinicId);

      let permanentPatientId: string;

      if (searchResult.data && searchResult.data.length > 0) {
        // Existing permanent patient found - take the first one
        console.log('Found existing permanent patient:', searchResult.data[0]);
        permanentPatientId = searchResult.data[0].id;
      } else {
        // Create new permanent patient
        console.log('Creating new permanent patient');
        const createResult = await createPermanentPatient(
          convertFileNumber.trim(),
          patient.name || 'Patient',
          userClinicId || selectedClinicId || ''
        );

        if (createResult.error || !createResult.data) {
          console.error('Failed to create permanent patient:', createResult.error);
          Alert.alert('Error', 'Failed to create permanent patient profile');
          return;
        }

        console.log('Created permanent patient:', createResult.data);
        permanentPatientId = createResult.data.id;
      }

      // Update the patient record to link with permanent patient
      console.log('Updating patient record in database...');
      const { error } = await supabase
        .from('patients')
        .update({
          permanent_patient_id: permanentPatientId,
          file_number: convertFileNumber.trim(),
          patient_type: 'permanent'
        })
        .eq('id', convertPatientId);

      if (error) {
        console.error('Database update error:', error);
        Alert.alert('Error', 'Failed to convert patient');
        return;
      }

      console.log('Database updated successfully');

      // Update patients array immediately for instant UI update
      setPatients(prev => {
        const updated = prev.map(p =>
          p.id === convertPatientId
            ? {
                ...p,
                permanent_patient_id: permanentPatientId,
                file_number: convertFileNumber.trim(),
                patient_type: 'permanent' as const
              }
            : p
        );
        console.log('Updated local state, patient now:', updated.find(p => p.id === convertPatientId));
        return updated;
      });

      // Close modal FIRST
      setShowConvertModal(false);
      setConvertPatientId(null);
      setConvertFileNumber('');

      // Load dental data for the newly converted permanent patient
      console.log('Loading dental data for converted patient...');
      await loadDentalData(permanentPatientId, convertPatientId, true);

      // Trigger animation refresh
      console.log('Triggering animation refresh');
      setAnimKey(prev => prev + 1);

      // Reload patients to ensure consistency
      console.log('Reloading all patients...');
      await loadPatients();

      Alert.alert('Success', 'Patient converted to permanent profile successfully');
    } catch (err) {
      console.error('Error converting patient:', err);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  // Open timeline
  const openTimeline = (patient: Patient) => {
    setSelectedPatient(patient);
    loadTimeline(patient.id);
    setShowTimelineModal(true);
  };

  // Mark treatment done
  const markTreatmentDone = async () => {
    if (!selectedPatient || !treatmentNote.trim()) {
      Alert.alert('Error', 'Please enter treatment details');
      return;
    }

    try {
      await supabase.from('timeline_events').insert([
        {
          patient_id: selectedPatient.id,
          event_type: 'treatment',
          event_details: treatmentNote,
          doctor_name: user?.name || 'Unknown',
        },
      ]);

      await supabase
        .from('patients')
        .update({ status: 'completed' })
        .eq('id', selectedPatient.id);

      await loadPatients();
      setShowTimelineModal(false);
      setTreatmentNote('');
      Alert.alert('Success', 'Treatment saved successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  return {
    handleFileNumberSearch,
    handlePatientNameSearch,
    handleAddPatient,
    handleArchive,
    handleMenuAction,
    handleSaveNote,
    handleViewNote,
    loadClinicDoctors,
    handleTreatmentDoneByDoctor,
    handleUpdateField,
    handleDeleteNote,
    loadCardTimeline,
    handleViewDetails,
    handleToggleTab,
    loadDentalData,
    togglePermanentCardExpansion,
    togglePatientConsent,
    convertToPermanentPatient,
    openTimeline,
    markTreatmentDone,
  };
}
