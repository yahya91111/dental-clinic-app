import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StatusBar,
  ScrollView,
  Animated,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DentalChartScreen from './screens/DentalChart';
import { BlurView } from 'expo-blur';
import { useAuth } from './AuthContext';
import {
  searchPermanentPatients,
  searchPermanentPatientByFileNumberAndName,
  createPermanentPatient,
  getPermanentPatientById,
} from './lib/database';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
import { PermanentPatientDecrypted } from './types';

interface PatientProfileScreenProps {
  onBack: () => void;
  onNavigateHome: () => void;
  onNavigateAppointments: () => void;
  onNavigateArchive: () => void;
  initialPatientId?: string;
  initialFileNumber?: string;
  initialOpenDentalChart?: boolean;
  clinicId?: string | number | null;
}

export default function PatientProfileScreen({
  onBack,
  onNavigateHome,
  onNavigateAppointments,
  onNavigateArchive,
  initialPatientId,
  initialFileNumber,
  initialOpenDentalChart = false,
  clinicId: propClinicId,
}: PatientProfileScreenProps) {
  const { user } = useAuth();
  const effectiveClinicId = propClinicId || user?.clinicId;
  const [currentScreen, setCurrentScreen] = useState<'profile' | 'dentalChart'>(initialOpenDentalChart ? 'dentalChart' : 'profile');

  // Patients State
  const [searchResults, setSearchResults] = useState<PermanentPatientDecrypted[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PermanentPatientDecrypted | null>(null);

  // Add Patient Modal State
  const [isAddPatientModalVisible, setIsAddPatientModalVisible] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [fileNumber, setFileNumber] = useState('');

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Menu & Edit State
  const [showMenu, setShowMenu] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editFileNumber, setEditFileNumber] = useState('');

  const handleEditPatient = async () => {
    if (!selectedPatient || !editName.trim() || !editFileNumber.trim()) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    try {
      const { encryptFileNumber, encryptPatientName } = require('./lib/encryption');
      const { error } = await supabase
        .from('permanent_patients')
        .update({
          name_encrypted: encryptPatientName(editName.trim()),
          file_number_encrypted: encryptFileNumber(editFileNumber.trim()),
        })
        .eq('id', selectedPatient.id);
      if (error) throw error;
      // Refresh
      const result = await getPermanentPatientById(selectedPatient.id);
      if (result.data) setSelectedPatient(result.data);
      setShowEditModal(false);
      Alert.alert('Success', 'Patient updated');
    } catch (err) {
      Alert.alert('Error', 'Failed to update patient');
    }
  };

  const handleDeletePatient = () => {
    if (!selectedPatient) return;
    Alert.alert(
      'Delete Patient',
      `Are you sure you want to permanently delete "${selectedPatient.name}"?\n\nThis will delete all dental records, notes, referrals, and scaling records.\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete from timeline (patients table) first
              await supabase
                .from('patients')
                .delete()
                .eq('permanent_patient_id', selectedPatient.id);

              // Delete permanent patient (cascades to dental records)
              const { error } = await supabase
                .from('permanent_patients')
                .delete()
                .eq('id', selectedPatient.id);
              if (error) throw error;
              setSelectedPatient(null);
              setSearchResults([]);
              setSearchQuery('');
              Alert.alert('Deleted', 'Patient has been permanently deleted');
            } catch (err) {
              Alert.alert('Error', 'Failed to delete patient');
            }
          },
        },
      ]
    );
  };

  // Animated Blobs - Same as App.tsx
  const blob1Anim = useState(new Animated.Value(0))[0];
  const blob2Anim = useState(new Animated.Value(0))[0];
  const blob3Anim = useState(new Animated.Value(0))[0];
  const blob4Anim = useState(new Animated.Value(0))[0];
  const blob5Anim = useState(new Animated.Value(0))[0];
  const blob6Anim = useState(new Animated.Value(0))[0];

  // Search patients by file number OR name (intelligent search)
  useEffect(() => {
    const searchPatients = async () => {
      if (!searchQuery.trim() || !effectiveClinicId) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const { data, error } = await searchPermanentPatients(
          searchQuery.trim(),
          effectiveClinicId.toString()
        );

        if (error) {
          console.error('Search error:', error);
          setSearchResults([]);
        } else if (data && data.length > 0) {
          setSearchResults(data); // Returns array of patients matching file number OR name
        } else {
          setSearchResults([]);
        }
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    // Debounce search
    const timeoutId = setTimeout(searchPatients, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, effectiveClinicId]);

  // Load initial patient if provided
  useEffect(() => {
    const loadInitialPatient = async () => {
      if (initialPatientId) {
        try {
          const { data, error } = await getPermanentPatientById(initialPatientId);

          if (error) {
            console.error('Error loading initial patient:', error);
            Alert.alert('خطأ', 'فشل تحميل بيانات المريض');
            setCurrentScreen('profile');
          } else if (data) {
            setSelectedPatient(data);
          }
        } catch (error) {
          console.error('Error loading initial patient:', error);
          Alert.alert('خطأ', 'فشل تحميل بيانات المريض');
          setCurrentScreen('profile');
        }
      }
    };

    loadInitialPatient();
  }, [initialPatientId]);

  // Add new patient to database
  const handleAddPatient = async () => {
    if (!patientName.trim() || !fileNumber.trim() || !effectiveClinicId) {
      Alert.alert('خطأ', 'الرجاء إدخال الاسم ورقم الملف');
      return;
    }

    setIsAdding(true);
    try {
      //  STEP 1: Search for existing patient with SAME file number AND name
      const searchResult = await searchPermanentPatientByFileNumberAndName(
        fileNumber.trim(),
        patientName.trim(),
        effectiveClinicId.toString()
      );

      if (searchResult.data) {
        // Patient with same file number AND name already exists
        setSelectedPatient(searchResult.data);
        setIsAddPatientModalVisible(false);
        setPatientName('');
        setFileNumber('');
        setSearchQuery('');
        Alert.alert(
          'مريض موجود',
          `المريض "${searchResult.data.name}" موجود بالفعل برقم الملف "${searchResult.data.file_number}". تم تحميل بياناته.`
        );
      } else {
        //  STEP 2: Patient doesn't exist - create new one
        // (Same file number with different name is allowed!)
        const { data, error } = await createPermanentPatient(
          fileNumber.trim(),
          patientName.trim(),
          effectiveClinicId.toString()
        );

        if (error) {
          Alert.alert('خطأ', 'حدث خطأ أثناء إضافة المريض. الرجاء المحاولة مرة أخرى.');
          console.error('Error creating patient:', error);
        } else if (data) {
          setSelectedPatient(data);
          setIsAddPatientModalVisible(false);
          setPatientName('');
          setFileNumber('');
          setSearchQuery('');
          Alert.alert('تم', 'تم إضافة المريض بنجاح');
        }
      }
    } catch (error) {
      Alert.alert('خطأ', 'حدث خطأ غير متوقع');
      console.error('Error creating patient:', error);
    } finally {
      setIsAdding(false);
    }
  };

  // Show Dental Chart Screen
  if (currentScreen === 'dentalChart') {
    if (!selectedPatient) {
      // If loading initial patient, show loading indicator
      if (initialPatientId && initialFileNumber) {
        return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F4F8' }}>
            <ActivityIndicator size="large" color="#7DD3C0" />
            <Text style={{ marginTop: 16, fontSize: 16, color: '#4A5568' }}>جاري تحميل بيانات المريض...</Text>
          </View>
        );
      }
      Alert.alert('خطأ', 'الرجاء اختيار مريض أولاً');
      setCurrentScreen('profile');
      return null;
    }

    return (
      <DentalChartScreen
        onBack={() => {
          // If opened directly from Timeline, go back to Timeline
          if (initialOpenDentalChart) {
            onBack();
          } else {
            // If opened from Patient Profile, go back to profile
            setCurrentScreen('profile');
          }
        }}
        permanentPatientId={selectedPatient.id}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar translucent={true} backgroundColor="transparent" barStyle="light-content" />
      {/* Gradient Mesh Background */}
      <LinearGradient
        colors={['#F0F4F8', '#E8EDF3', '#F5F0F8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.container}>
        <View style={styles.gradient}>

          {/* Animated Blobs - Same as App.tsx */}
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
                backgroundColor: 'rgba(184, 140, 227, 0.12)',
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
                backgroundColor: 'rgba(236, 72, 153, 0.1)',
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
                backgroundColor: 'rgba(34, 197, 94, 0.11)',
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
                backgroundColor: 'rgba(239, 68, 68, 0.10)',
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

          {/* Content Wrapper */}
          <View style={styles.contentWrapper}>
            {/* Glass Container Header */}
            <View style={styles.glassHeaderContainer}>
              {/* Color Tint Layer */}
              <LinearGradient
                colors={[
                  'rgba(168, 85, 247, 0.10)',
                  'rgba(91, 159, 237, 0.10)',
                  'rgba(125, 211, 192, 0.10)',
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.glassHeaderColorTint}
              />

              {/* Header Content */}
              <View style={styles.glassHeaderContent}>
                {/* Menu Button - Left (circular) */}
                {selectedPatient ? (
                  <TouchableOpacity
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: 'rgba(255, 255, 255, 0.15)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onPress={() => setShowMenu(true)}
                  >
                    <Ionicons name="ellipsis-horizontal" size={22} color="#FFFFFF" />
                  </TouchableOpacity>
                ) : (
                  <View style={{ width: 40 }} />
                )}

                {/* Info */}
                <View style={[styles.glassHeaderInfo, { flex: 1 }]}>
                  <Text style={styles.glassHeaderDoctorName} numberOfLines={1}>Patient Profile</Text>
                </View>

                {/* Add Patient Icon Button */}
                <TouchableOpacity
                  style={styles.addPatientIconButton}
                  activeOpacity={0.7}
                  onPress={() => setIsAddPatientModalVisible(true)}
                >
                  <View style={styles.addPatientIconContainer}>
                    <Ionicons name="person-add" size={24} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>
              </View>
            </View>

          {/* Content */}
          <View style={styles.content}>
            <ScrollView
              style={styles.cardsScrollView}
              contentContainerStyle={styles.contentContainer}
              showsVerticalScrollIndicator={false}
            >
              {/* Search Bar */}
              <View style={styles.searchAndAddContainer}>
                <View style={styles.searchBarContainer}>
                  <Ionicons name="search" size={20} color="#6B7280" style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search patients..."
                    placeholderTextColor="#9CA3AF"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <Ionicons name="close-circle" size={20} color="#6B7280" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Search Results */}
              {isSearching && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#A855F7" />
                  <Text style={styles.loadingText}>جاري البحث...</Text>
                </View>
              )}

              {!isSearching && searchResults.length > 0 && (
                <View style={styles.patientsListContainer}>
                  {searchResults.map((patient) => (
                    <TouchableOpacity
                      key={patient.id}
                      style={styles.patientCard}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSelectedPatient(patient);
                        setSearchQuery('');
                      }}
                    >
                      <View style={styles.patientCardContent}>
                        <Ionicons name="person-circle" size={40} color="#A855F7" />
                        <View style={styles.patientCardInfo}>
                          <Text style={styles.patientCardName}>{patient.name}</Text>
                          <Text style={styles.patientCardFileNumber}>File: {patient.file_number}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {!isSearching && searchQuery.trim() !== '' && searchResults.length === 0 && (
                <View style={styles.noResultsContainer}>
                  <Ionicons name="search-outline" size={48} color="#9CA3AF" />
                  <Text style={styles.noResultsText}>لم يتم العثور على مريض بهذا الرقم</Text>
                </View>
              )}

              {/* Glass Divider */}
              <View style={styles.glassDividerContainer}>
                <View style={styles.glassDivider} />
              </View>

              {/* Patient Info Card */}
              {selectedPatient && (
                <View style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.15)',
                  borderRadius: 16,
                  padding: 16,
                  marginHorizontal: 4,
                  marginBottom: 16,
                  borderWidth: 1.5,
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                  alignItems: 'center',
                }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#FFFFFF' }} numberOfLines={1}>
                    {selectedPatient.name}
                  </Text>
                  <Text style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.7)', marginTop: 4, fontWeight: '600' }}>
                    File: {selectedPatient.file_number}
                  </Text>
                </View>
              )}

              {/* 3D Floating Menu Buttons - Overwatch Style */}
              <View style={styles.menuButtonsContainer}>

                {/* Button 1: Dental Chart */}
                <TouchableOpacity
                  style={styles.menuButton}
                  activeOpacity={0.8}
                  onPress={() => setCurrentScreen('dentalChart')}
                >
                  <View style={styles.menuButtonContainer}>
                    <Text style={styles.menuButtonText}>DENTAL CHART</Text>
                  </View>
                </TouchableOpacity>

              </View>
            </ScrollView>
          </View>

          </View>

          {/* Bottom Navigation - Same as App.tsx */}
          <View style={styles.bottomNav}>
            <TouchableOpacity style={styles.navItem} onPress={onNavigateHome}>
              <Ionicons name="home-sharp" size={26} color="#9CA3AF" />
              <Text style={styles.navLabel}>Home</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navItem}>
              <Ionicons name="person-circle" size={28} color="#7DD3C0" />
              <Text style={[styles.navLabel, styles.navLabelActive]}>Patient File</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navItem}
              onPress={onNavigateAppointments}
            >
              <Ionicons name="calendar-sharp" size={26} color="#9CA3AF" />
              <Text style={styles.navLabel}>Appointments</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navItem}
              onPress={onNavigateArchive}
            >
              <Ionicons name="archive-sharp" size={26} color="#9CA3AF" />
              <Text style={styles.navLabel}>Archive</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Add Patient Modal */}
      <Modal
        visible={isAddPatientModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsAddPatientModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsAddPatientModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <BlurView intensity={80} tint="light" style={styles.modalContainer}>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Add New Patient</Text>
                  <TouchableOpacity
                    onPress={() => setIsAddPatientModalVisible(false)}
                    style={styles.modalCloseButton}
                  >
                    <Ionicons name="close" size={22} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                {/* Modal Content */}
                <View style={styles.modalContent}>
                  {/* Patient Name Input */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Patient Name</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter patient name"
                      placeholderTextColor="#9CA3AF"
                      value={patientName}
                      onChangeText={setPatientName}
                    />
                  </View>

                  {/* File Number Input */}
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>File Number</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0000"
                      placeholderTextColor="#9CA3AF"
                      value={fileNumber}
                      onChangeText={(text) => {
                        // Only allow 4 digits
                        const numericText = text.replace(/[^0-9]/g, '');
                        if (numericText.length <= 4) {
                          setFileNumber(numericText);
                        }
                      }}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={styles.modalCancelButton}
                      onPress={() => {
                        setIsAddPatientModalVisible(false);
                        setPatientName('');
                        setFileNumber('');
                      }}
                    >
                      <Text style={styles.modalCancelButtonText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.modalSaveButton,
                        ((!patientName.trim() || !fileNumber.trim()) || isAdding) && styles.modalSaveButtonDisabled
                      ]}
                      disabled={(!patientName.trim() || !fileNumber.trim()) || isAdding}
                      onPress={handleAddPatient}
                    >
                      {isAdding ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                          <Text style={styles.modalSaveButtonText}>Save</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </BlurView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Patient Menu Modal */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={{
            backgroundColor: '#F0F4F8',
            borderRadius: 20,
            width: '75%',
            padding: 8,
          }}>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 16,
                borderRadius: 14,
              }}
              onPress={() => {
                setShowMenu(false);
                if (selectedPatient) {
                  setEditName(selectedPatient.name);
                  setEditFileNumber(selectedPatient.file_number);
                  setShowEditModal(true);
                }
              }}
            >
              <Ionicons name="create-outline" size={22} color="#2563EB" />
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#1E3A8A' }}>Edit Patient</Text>
            </TouchableOpacity>

            <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.08)', marginHorizontal: 12 }} />

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 16,
                borderRadius: 14,
              }}
              onPress={() => {
                setShowMenu(false);
                handleDeletePatient();
              }}
            >
              <Ionicons name="trash-outline" size={22} color="#EF4444" />
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#EF4444' }}>Delete Patient</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Patient Modal */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{
              backgroundColor: '#F0F4F8',
              borderRadius: 20,
              width: 320,
              padding: 24,
            }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#1E3A8A', marginBottom: 20, textAlign: 'center' }}>
                Edit Patient
              </Text>

              <Text style={{ fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 6 }}>Patient Name</Text>
              <TextInput
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 16,
                  color: '#1E3A8A',
                  borderWidth: 1.5,
                  borderColor: 'rgba(37, 99, 235, 0.2)',
                  marginBottom: 16,
                }}
                value={editName}
                onChangeText={setEditName}
                placeholder="Name"
              />

              <Text style={{ fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 6 }}>File Number</Text>
              <TextInput
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 16,
                  color: '#1E3A8A',
                  borderWidth: 1.5,
                  borderColor: 'rgba(37, 99, 235, 0.2)',
                  marginBottom: 24,
                }}
                value={editFileNumber}
                onChangeText={setEditFileNumber}
                placeholder="File Number"
                keyboardType="number-pad"
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.06)',
                    borderRadius: 12,
                    paddingVertical: 14,
                    alignItems: 'center',
                  }}
                  onPress={() => setShowEditModal(false)}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#6B7280' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: '#2563EB',
                    borderRadius: 12,
                    paddingVertical: 14,
                    alignItems: 'center',
                  }}
                  onPress={handleEditPatient}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  timelineBlob: {
    position: 'absolute',
    borderRadius: 1000,
  },
  contentWrapper: {
    flex: 1,
  },
  glassHeaderContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 0,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    borderWidth: 2,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
    position: 'relative',
    zIndex: 2,
    paddingTop: 100,
  },
  glassHeaderColorTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  glassHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 24,
    position: 'relative',
    zIndex: 1,
    width: '100%',
  },
  glassHeaderInfo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -50,
  },
  glassHeaderDoctorName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 6,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  patientFileNumber: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 3,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  addPatientIconButton: {
    position: 'absolute',
    right: 20,
    top: '50%',
    marginTop: -35,
  },
  addPatientIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  content: {
    flex: 1,
  },
  cardsScrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 40,
    paddingBottom: 100,
    paddingHorizontal: 0,
  },
  menuButtonsContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    paddingLeft: 0,
    paddingTop: 20,
    gap: 20,
  },
  menuButton: {
    position: 'relative',
    paddingVertical: 8,
  },
  menuButtonContainer: {
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 16,
  },
  menuButtonText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 15,
  },
  bottomNav: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingBottom: 20,
    backgroundColor: 'transparent',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.5)',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  navLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
    fontWeight: '500',
  },
  navLabelActive: {
    color: '#7DD3C0',
    fontWeight: '600',
  },
  searchAndAddContainer: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 10,
    gap: 12,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '500',
  },
  patientsListContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 12,
  },
  patientCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
    overflow: 'hidden',
  },
  patientCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  patientCardInfo: {
    flex: 1,
    gap: 4,
  },
  patientCardName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
  },
  patientCardFileNumber: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  glassDividerContainer: {
    paddingHorizontal: 30,
    paddingVertical: 20,
  },
  glassDivider: {
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    padding: 24,
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#000',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 20 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.4,
    shadowRadius: Platform.OS === 'android' ? 0 : 30,
    elevation: Platform.OS === 'android' ? 0 : 15,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#374151',
    textShadowColor: 'rgba(255, 255, 255, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    gap: 16,
  },
  inputGroup: {
    gap: 10,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4B5563',
    textShadowColor: 'rgba(255, 255, 255, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  modalCancelButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#4B5563',
    textShadowColor: 'rgba(255, 255, 255, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modalSaveButton: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: 'rgba(34, 197, 94, 0.7)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  modalSaveButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalSaveButtonDisabled: {
    backgroundColor: 'rgba(209, 213, 219, 0.6)',
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowOpacity: 0.1,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  noResultsContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  noResultsText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
  },
});
