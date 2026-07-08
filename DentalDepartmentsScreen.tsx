import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, ScrollView, TextInput, Animated, Dimensions, Modal, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { scaledStyleSheet, scale } from './lib/scale';
// Swipe gesture removed
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import ClinicDetailsScreen from './ClinicDetailsScreen';
import ScheduleScreen from './screens/Schedule';
import DoctorsScreen from './DoctorsScreen';
import MyStatisticsScreen from './MyStatisticsScreen';
import { useAuth } from './AuthContext';
import { supabase } from './lib/supabaseClient';
interface DentalDepartmentsScreenProps {
  onBack: () => void;
  onOpenTimeline?: (clinicId: string, clinicName: string) => void;
  onOpenDoctors?: (clinicId: string, clinicName: string) => void;
}

interface Clinic {
  id: string; // UUID
  name: string;
}

interface DentalDepartment {
  key: string;
  label: string;
  icon: string;
  color: string[];
}

interface ReferralWithPatient {
  id: string;
  tooth_number: string | null;
  patient_name: string;
  patient_file_number: string;
  permanent_patient_id: string;
}

export default function DentalDepartmentsScreen({ onBack, onOpenTimeline, onOpenDoctors }: DentalDepartmentsScreenProps) {
  const { user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [showClinicSchedule, setShowClinicSchedule] = useState(false); // معاينةُ جدولِ المركز (اطّلاعٌ فقط)
  const [showDoctorsScreen, setShowDoctorsScreen] = useState(false);
  const [viewingDoctorData, setViewingDoctorData] = useState<{id: string, name: string, clinicId: string | null, role: string} | null>(null);
  const [currentDoctorsScreen, setCurrentDoctorsScreen] = useState<'list' | 'viewStats'>('list');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClinicName, setNewClinicName] = useState('');
  const [menuClinicId, setMenuClinicId] = useState<number | null>(null);

  // New states for dental departments and referrals
  const [selectedDepartment, setSelectedDepartment] = useState<DentalDepartment | null>(null);
  const [departmentReferrals, setDepartmentReferrals] = useState<ReferralWithPatient[]>([]);
  const [showDepartmentModal, setShowDepartmentModal] = useState(false);
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [departmentCounts, setDepartmentCounts] = useState<Record<string, number>>({});

  // Animated Blobs
  const blob1Anim = React.useState(new Animated.Value(0))[0];
  const blob2Anim = React.useState(new Animated.Value(0))[0];
  const blob3Anim = React.useState(new Animated.Value(0))[0];

  // Cards animation
  const [cardAnims] = React.useState(() =>
    Array.from({ length: 20 }, (_, i) => ({
      fade: new Animated.Value(0),
      slide: new Animated.Value(i % 2 === 0 ? 50 : -50)
    }))
  );

  // Dental Departments List
  const dentalDepartments: DentalDepartment[] = [
    { key: 'Endodontics', label: 'Endodontics', icon: 'medical', color: ['#FFE5E5', '#FFCCCC'] },
    { key: 'Oral Surgery', label: 'Oral Surgery', icon: 'cut', color: ['#E5F0FF', '#CCDEFF'] },
    { key: 'Orthodontics', label: 'Orthodontics', icon: 'grid', color: ['#E5FFE5', '#CCFFCC'] },
    { key: 'Periodontics', label: 'Periodontics', icon: 'water', color: ['#FFF0E5', '#FFE5CC'] },
    { key: 'Prosthodontics', label: 'Prosthodontics', icon: 'construct', color: ['#F0E5FF', '#E5CCFF'] },
    { key: 'Oral Medicine', label: 'Oral Medicine', icon: 'fitness', color: ['#FFFFE5', '#FFFFCC'] },
  ];

  // Load referrals for selected department
  const loadDepartmentReferrals = async (departmentName: string) => {
    try {
      setLoadingReferrals(true);

      // Fetch referrals with patient info using join
      const { data, error } = await supabase
        .from('referrals')
        .select(`
          id,
          tooth_number,
          permanent_patient_id,
          permanent_patients!inner (
            name_encrypted,
            file_number_encrypted
          )
        `)
        .eq('referral_type', departmentName)
        .eq('status', 'not_given')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        // Decrypt patient data and format referrals
        const { decrypt } = await import('./lib/encryption');
        const referralsWithPatients: ReferralWithPatient[] = data.map(ref => ({
          id: ref.id,
          tooth_number: ref.tooth_number,
          permanent_patient_id: ref.permanent_patient_id,
          patient_name: decrypt((ref.permanent_patients as any).name_encrypted),
          patient_file_number: decrypt((ref.permanent_patients as any).file_number_encrypted),
        }));

        setDepartmentReferrals(referralsWithPatients);
      }
    } catch (error) {
      console.error('Error loading department referrals:', error);
      Alert.alert('Error', 'Failed to load referrals');
    } finally {
      setLoadingReferrals(false);
    }
  };

  // Load all department counts
  const loadDepartmentCounts = async () => {
    try {
      const counts: Record<string, number> = {};

      for (const dept of dentalDepartments) {
        const { count, error } = await supabase
          .from('referrals')
          .select('*', { count: 'exact', head: true })
          .eq('referral_type', dept.key)
          .eq('status', 'not_given');

        if (!error && count !== null) {
          counts[dept.key] = count;
        } else {
          counts[dept.key] = 0;
        }
      }

      setDepartmentCounts(counts);
    } catch (error) {
      console.error('Error loading department counts:', error);
    }
  };

  // Handle department selection
  const handleDepartmentPress = (department: DentalDepartment) => {
    setSelectedDepartment(department);
    setShowDepartmentModal(true);
    loadDepartmentReferrals(department.key);
  };

  // Load clinics from Supabase
  const loadClinics = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clinics')
        .select('id, name')
        .order('id');
      
      if (error) throw error;
      
      if (data) {
        setClinics(data);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load clinics');
    } finally {
      setLoading(false);
    }
  };

  // Add new clinic
  const handleAddClinic = async () => {
    if (!newClinicName.trim()) {
      Alert.alert('Error', 'Please enter clinic name');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('clinics')
        .insert([{ name: newClinicName.trim() }])
        .select();
      
      if (error) throw error;
      
      Alert.alert('Success', 'Clinic added successfully!');
      setNewClinicName('');
      setShowAddModal(false);
      loadClinics(); // Reload clinics
    } catch (error) {
      Alert.alert('Error', 'Failed to add clinic');
    }
  };

  // Delete clinic
  const handleDeleteClinic = async (clinicId: string, clinicName: string) => {
    try {
      // First, check if there are any doctors in this clinic
      const { data: doctors, error: doctorsError } = await supabase
        .from('doctors')
        .select('id, name')
        .eq('clinic_id', clinicId);
      
      if (doctorsError) throw doctorsError;
      
      // If there are doctors, prevent deletion
      if (doctors && doctors.length > 0) {
        Alert.alert(
          'Cannot Delete Clinic',
          `This clinic has ${doctors.length} doctor(s). Please transfer all doctors to another clinic before deleting.`,
          [{ text: 'OK' }]
        );
        return;
      }
      
      // If no doctors, proceed with deletion confirmation
      Alert.alert(
        'Delete Clinic',
        `Are you sure you want to delete "${clinicName}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Delete', 
            style: 'destructive',
            onPress: async () => {
              try {
                const { error } = await supabase
                  .from('clinics')
                  .delete()
                  .eq('id', clinicId);
                
                if (error) throw error;
                
                Alert.alert('Success', 'Clinic deleted successfully!');
                loadClinics(); // Reload clinics
              } catch (error) {
                Alert.alert('Error', 'Failed to delete clinic');
              }
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to check clinic doctors');
    }
  };

  React.useEffect(() => {
    loadClinics();
    loadDepartmentCounts();
  }, []);

  // Animate blobs continuously
  React.useEffect(() => {
    // Blob 1 - Circular motion
    Animated.loop(
      Animated.sequence([
        Animated.timing(blob1Anim, {
          toValue: 1,
          duration: 8000,
          useNativeDriver: true,
        }),
        Animated.timing(blob1Anim, {
          toValue: 0,
          duration: 8000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Blob 2 - Slower circular motion
    Animated.loop(
      Animated.sequence([
        Animated.timing(blob2Anim, {
          toValue: 1,
          duration: 12000,
          useNativeDriver: true,
        }),
        Animated.timing(blob2Anim, {
          toValue: 0,
          duration: 12000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Blob 3 - Fastest circular motion
    Animated.loop(
      Animated.sequence([
        Animated.timing(blob3Anim, {
          toValue: 1,
          duration: 10000,
          useNativeDriver: true,
        }),
        Animated.timing(blob3Anim, {
          toValue: 0,
          duration: 10000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Animate cards when clinics load
  React.useEffect(() => {
    if (clinics.length > 0) {
      // Reset animations
      cardAnims.forEach(anim => {
        anim.fade.setValue(0);
        anim.slide.setValue(cardAnims.indexOf(anim) % 2 === 0 ? 50 : -50);
      });

      // Start staggered animation
      setTimeout(() => {
        const animations = cardAnims.slice(0, Math.min(clinics.length, 20)).map(anim => 
          Animated.parallel([
            Animated.timing(anim.fade, { toValue: 1, duration: 600, useNativeDriver: true }),
            Animated.spring(anim.slide, { toValue: 0, useNativeDriver: true, friction: 8 }),
          ])
        );
        Animated.stagger(100, animations).start();
      }, 50);
    }
  }, [clinics.length]);

  // Filter clinics based on search query
  const filteredClinics = clinics.filter(clinic =>
    clinic.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Check if user is super admin
  const isSuperAdmin = user?.role === 'super_admin';

  //  Doctors screen - View Stats
  if (selectedClinic && showDoctorsScreen && currentDoctorsScreen === 'viewStats' && viewingDoctorData) {
    return (
      <MyStatisticsScreen
        onBack={() => {
          setCurrentDoctorsScreen('list');
          setViewingDoctorData(null);
        }}
        userClinicId={null}
        onTotalChange={() => {}}
        doctorId={viewingDoctorData.id}
        doctorName={viewingDoctorData.name}
        clinicName={selectedClinic.name}
      />
    );
  }

  //  Doctors screen - List
  if (selectedClinic && showDoctorsScreen && currentDoctorsScreen === 'list') {
    return (
      <DoctorsScreen
        onBack={() => {
          setShowDoctorsScreen(false);
          setCurrentDoctorsScreen('list');
        }}
        clinicId={selectedClinic.id}
        onOpenDoctorProfile={(doctor) => {
          setViewingDoctorData({
            id: doctor.id,
            name: doctor.name,
            clinicId: doctor.clinicId,
            role: doctor.role,
          });
          setCurrentDoctorsScreen('viewStats');
        }}
      />
    );
  }

  // جدولُ المركز من صفحةِ التفاصيل — القائد/المنسّق/المديرُ العام: تحكّمٌ كامل؛ الطبيبُ العاديّ: اطّلاعٌ فقط
  if (selectedClinic && showClinicSchedule) {
    const canManage = !!user && ['team_leader', 'coordinator', 'super_admin', 'manager'].includes(user.role);
    return (
      <ScheduleScreen
        onBack={() => setShowClinicSchedule(false)}
        clinicId={selectedClinic.id}
        userId={user?.id}
        viewOnly={!canManage}
        headerTitle={selectedClinic.name}
      />
    );
  }

  // If a clinic is selected, show ClinicDetailsScreen
  if (selectedClinic) {
    return (
      <ClinicDetailsScreen
        clinicName={selectedClinic.name}
        clinicId={selectedClinic.id}
        onBack={() => { setShowClinicSchedule(false); setSelectedClinic(null); }}
        onDoctorsPress={() => {
          setShowDoctorsScreen(true);
        }}
        onTimelinePress={() => {
          if (onOpenTimeline) {
            onOpenTimeline(selectedClinic.id, selectedClinic.name);
          }
        }}
        onSchedulePress={() => setShowClinicSchedule(true)}
      />
    );
  }

  // Swipe gesture removed

  return (
    <View style={{ flex: 1 }}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="transparent"
        translucent={true}
      />
      <View style={styles.gradient}>
        {/* Gradient Mesh Background */}
        <LinearGradient
          colors={['#F0F4F8', '#E8EDF3', '#F5F0F8']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        
        {/* Animated Blobs */}
        <Animated.View 
          style={[
            styles.blob, 
            styles.blob1,
            {
              transform: [
                {
                  translateX: blob1Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(30)],
                  }),
                },
                {
                  translateY: blob1Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(40)],
                  }),
                },
              ],
            },
          ]} 
        />
        <Animated.View 
          style={[
            styles.blob, 
            styles.blob2,
            {
              transform: [
                {
                  translateX: blob2Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(-25)],
                  }),
                },
                {
                  translateY: blob2Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(35)],
                  }),
                },
              ],
            },
          ]} 
        />
        <Animated.View 
          style={[
            styles.blob, 
            styles.blob3,
            {
              transform: [
                {
                  translateX: blob3Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(20)],
                  }),
                },
                {
                  translateY: blob3Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [scale(0), scale(-30)],
                  }),
                },
              ],
            },
          ]} 
        />
        
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity 
                style={styles.backButton}
                onPress={onBack}
              >
                <Ionicons name="arrow-back" size={scale(24)} color="#4A5568" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Dental Departments</Text>
              {isSuperAdmin && (
                <TouchableOpacity
                  style={[
                    styles.addButton,
                    Platform.OS === 'android' && { marginLeft: scale(10) }
                  ]}
                  onPress={() => setShowAddModal(true)}
                >
                  <Ionicons name="add" size={scale(28)} color="#4A5568" />
                </TouchableOpacity>
              )}
              {!isSuperAdmin && <View style={{ width: scale(40) }} />}
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={scale(20)} color="#9CA3AF" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="ابحث عن مركز..."
                  placeholderTextColor="#9CA3AF"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={scale(20)} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Content */}
            <ScrollView
              style={styles.content}
              showsVerticalScrollIndicator={false}
            >
              {/* Clinics List */}
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Dental Centers</Text>
                <View style={styles.clinicsList}>
                  {filteredClinics.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons name="search-outline" size={scale(48)} color="#9CA3AF" />
                      <Text style={styles.emptyText}>لا توجد نتائج</Text>
                    </View>
                  ) : (
                    filteredClinics.map((clinic, index) => (
                      <Animated.View
                        key={clinic.id}
                        style={{
                          opacity: cardAnims[index]?.fade || 1,
                          transform: [{ translateX: cardAnims[index]?.slide || 0 }]
                        }}
                      >
                      <View style={styles.clinicCard}>
                      {/* Menu Button - Far Left (Super Admin only) */}
                      {isSuperAdmin && (
                        <TouchableOpacity
                          style={styles.menuButton}
                          onPress={() => setMenuClinicId(clinic.id)}
                        >
                          <Ionicons name="ellipsis-vertical" size={scale(20)} color="#9CA3AF" />
                        </TouchableOpacity>
                      )}

                      {/* Icon and Name - Right Side */}
                      <TouchableOpacity
                        style={styles.rightContent}
                        activeOpacity={0.7}
                        onPress={() => setSelectedClinic(clinic)}
                      >
                        <View style={styles.clinicInfo}>
                          <Text style={styles.clinicName}>{clinic.name}</Text>
                        </View>
                        <View style={styles.clinicIconContainer}>
                          <LinearGradient
                            colors={['#E9D5FF', '#C084FC', '#9333EA']}
                            start={{ x: 0.5, y: 0 }}
                            end={{ x: 0.5, y: 1 }}
                            style={styles.clinicIcon}
                          >
                            <View style={styles.clinicInnerGlow}>
                              <Ionicons name="business-outline" size={scale(30)} color="#FFFFFF" />
                            </View>
                          </LinearGradient>
                        </View>
                      </TouchableOpacity>
                    </View>
                      </Animated.View>
                    ))
                  )}
                </View>
              </View>
            </ScrollView>
        </SafeAreaView>
      </View>

      {/* Add Clinic Modal */}
      <Modal
        visible={showAddModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity 
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowAddModal(false)}
          >
            <TouchableOpacity 
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.modalContent}>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Add New Clinic</Text>
                  <TouchableOpacity 
                    onPress={() => setShowAddModal(false)}
                    style={styles.modalCloseButton}
                  >
                    <Ionicons name="close" size={scale(24)} color="#2D3748" />
                  </TouchableOpacity>
                </View>

                {/* Form Fields */}
                <View style={styles.formContainer}>
                  {/* Clinic Name Field */}
                  <View style={styles.formField}>
                    <Text style={styles.fieldLabel}>Clinic Name:</Text>
                    <TextInput
                      style={styles.textInput}
                      value={newClinicName}
                      onChangeText={setNewClinicName}
                      placeholder="Enter clinic name"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                </View>

                {/* Save & Cancel Buttons */}
                <View style={styles.bottomActions}>
                  <TouchableOpacity 
                    style={[styles.bottomButton, styles.cancelButton]}
                    onPress={() => {
                      setNewClinicName('');
                      setShowAddModal(false);
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.bottomButton, styles.saveButton]}
                    onPress={handleAddClinic}
                  >
                    <Text style={styles.saveButtonText}>Add Clinic</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Menu Modal */}
      <Modal
        visible={menuClinicId !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuClinicId(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMenuClinicId(null)}
        >
          <View style={styles.menuModalContainer}>
            <TouchableOpacity
              style={styles.deleteMenuButton}
              onPress={() => {
                const clinic = clinics.find(c => c.id === menuClinicId);
                if (clinic) {
                  setMenuClinicId(null);
                  handleDeleteClinic(clinic.id, clinic.name);
                }
              }}
            >
              <Ionicons name="trash-outline" size={scale(20)} color="#FFFFFF" />
              <Text style={styles.deleteMenuText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Department Referrals Modal */}
      <Modal
        visible={showDepartmentModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowDepartmentModal(false);
          loadDepartmentCounts(); // Reload counts when modal closes
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.departmentModalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedDepartment?.label} - Referrals
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowDepartmentModal(false);
                  loadDepartmentCounts(); // Reload counts when modal closes
                }}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={scale(24)} color="#2D3748" />
              </TouchableOpacity>
            </View>

            {/* Referrals List */}
            <ScrollView style={styles.referralsScrollView}>
              {loadingReferrals ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Loading...</Text>
                </View>
              ) : departmentReferrals.length === 0 ? (
                <View style={styles.emptyReferralsContainer}>
                  <Ionicons name="checkmark-circle-outline" size={scale(48)} color="#10B981" />
                  <Text style={styles.emptyReferralsText}>No pending referrals</Text>
                </View>
              ) : (
                <View style={styles.referralsList}>
                  {(() => {
                    // Group referrals by patient
                    const groupedByPatient: Record<string, {
                      patient_name: string;
                      patient_file_number: string;
                      teeth: (string | null)[];
                    }> = {};

                    departmentReferrals.forEach(referral => {
                      const key = referral.permanent_patient_id;
                      if (!groupedByPatient[key]) {
                        groupedByPatient[key] = {
                          patient_name: referral.patient_name,
                          patient_file_number: referral.patient_file_number,
                          teeth: []
                        };
                      }
                      groupedByPatient[key].teeth.push(referral.tooth_number);
                    });

                    return Object.entries(groupedByPatient).map(([patientId, data]) => (
                      <View key={patientId} style={styles.referralCard}>
                        <View style={styles.patientHeaderSection}>
                          <Text style={styles.patientName}>{data.patient_name}</Text>
                          <Text style={styles.patientFileNumber}>File: {data.patient_file_number}</Text>
                        </View>

                        {/* Teeth Display */}
                        <View style={styles.teethContainer}>
                          {data.teeth.map((tooth, idx) => (
                            tooth ? (
                              <View key={idx} style={styles.toothBadge}>
                                <Text style={styles.toothBadgeText}>{tooth}</Text>
                              </View>
                            ) : (
                              <View key={idx} style={[styles.toothBadge, { backgroundColor: 'rgba(168, 85, 247, 0.2)' }]}>
                                <Text style={[styles.toothBadgeText, { color: '#7C3AED' }]}>General</Text>
                              </View>
                            )
                          ))}
                        </View>
                      </View>
                    ));
                  })()}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = scaledStyleSheet({
  gradient: {
    flex: 1,
    position: 'relative',
  },
  blob: {
    position: 'absolute',
    borderRadius: 9999,
    opacity: 0.15,
  },
  blob1: {
    width: 300,
    height: 300,
    backgroundColor: '#A78BFA',
    top: -100,
    right: -50,
  },
  blob2: {
    width: 250,
    height: 250,
    backgroundColor: '#7DD3FC',
    bottom: 100,
    left: -80,
  },
  blob3: {
    width: 200,
    height: 200,
    backgroundColor: '#FCA5A5',
    top: '40%',
    right: -60,
  },
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: Platform.OS === 'android' ? 28 : 34,
    fontWeight: '700',
    color: '#4A5568',
    letterSpacing: -0.5,
  },
  content: {
    flex: 1,
    paddingTop: 0,
  },
  clinicsList: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 16,
  },
  clinicCard: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.35)', // 💎 زجاجي شفاف
    borderRadius: 20,
    padding: 14, // 💎 أنحف
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)', // 💎 حدود بيضاء شفافة
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#C084FC', // 💎 ظل بنفسجي ملون
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 6 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.2,
    shadowRadius: Platform.OS === 'android' ? 0 : 14,
    elevation: Platform.OS === 'android' ? 0 : 6,
  },
  deleteButton: {
    padding: 8,
    marginRight: 8,
  },
  arrowButton: {
    padding: 4,
  },
  rightContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginLeft: 16,
  },
  clinicIconContainer: {
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#C084FC', // 💎 ظل بنفسجي
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 4 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.25,
    shadowRadius: Platform.OS === 'android' ? 0 : 10,
    elevation: Platform.OS === 'android' ? 0 : 6,
  },
  clinicIcon: {
    width: 52, // 💎 أيقونة أصغر وأنحف
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clinicInnerGlow: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)', // 💎 شفافية أكثر
    borderRadius: 26,
  },
  clinicInfo: {
    flex: 1,
    alignItems: 'flex-end',
    marginRight: 14, // 💎 أقرب قليلاً
  },
  clinicName: {
    fontSize: 18, // 💎 أصغر قليلاً
    fontWeight: '600',
    color: '#2D3748',
    letterSpacing: -0.2,
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#2D3748',
    textAlign: 'right',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    color: '#9CA3AF',
    marginTop: 16,
    fontWeight: '500',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButton: {
    padding: 8,
    marginRight: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2D3748',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formContainer: {
    gap: 20,
    marginBottom: 24,
  },
  formField: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A5568',
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(203, 213, 225, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#2D3748',
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 12,
  },
  bottomButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  saveButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  cancelButton: {
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
    borderColor: 'rgba(107, 114, 128, 0.3)',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10B981',
  },
  menuModalContainer: {
    backgroundColor: '#374151',
    borderRadius: 16,
    padding: 8,
    minWidth: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  deleteMenuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
  },
  deleteMenuText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Dental Departments Styles
  sectionContainer: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4A5568',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  departmentsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
  },
  departmentCard: {
    width: '48%',
    height: 100,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#000',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 4 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.1,
    shadowRadius: Platform.OS === 'android' ? 0 : 8,
    elevation: Platform.OS === 'android' ? 0 : 4,
  },
  departmentGradient: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  departmentIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  departmentName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A5568',
    textAlign: 'center',
  },
  countBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Department Modal Styles
  departmentModalContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    padding: 0,
    maxHeight: '80%',
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  referralsScrollView: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  emptyReferralsContainer: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyReferralsText: {
    fontSize: 16,
    color: '#10B981',
    fontWeight: '600',
    marginTop: 12,
  },
  referralsList: {
    gap: 12,
  },
  referralCard: {
    backgroundColor: 'rgba(147, 197, 253, 0.15)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(147, 197, 253, 0.3)',
    marginBottom: 8,
  },
  referralHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  patientHeaderSection: {
    marginBottom: 10,
  },
  patientInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 4,
  },
  patientFileNumber: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  teethContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  toothBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    marginRight: 4,
    marginBottom: 4,
  },
  toothBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
});
