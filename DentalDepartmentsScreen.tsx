import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, ScrollView, TextInput, Animated, Dimensions, Modal, KeyboardAvoidingView, Platform, Alert } from 'react-native';
// Swipe gesture removed
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import ClinicDetailsScreen from './ClinicDetailsScreen';
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

export default function DentalDepartmentsScreen({ onBack, onOpenTimeline, onOpenDoctors }: DentalDepartmentsScreenProps) {
  const { user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [showDoctorsScreen, setShowDoctorsScreen] = useState(false);
  const [viewingDoctorData, setViewingDoctorData] = useState<{id: string, name: string, clinicId: string | null, role: string} | null>(null);
  const [currentDoctorsScreen, setCurrentDoctorsScreen] = useState<'list' | 'viewStats'>('list');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClinicName, setNewClinicName] = useState('');
  const [menuClinicId, setMenuClinicId] = useState<number | null>(null);

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
      console.error('Error loading clinics:', error);
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
      console.error('Error adding clinic:', error);
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
                console.error('Error deleting clinic:', error);
                Alert.alert('Error', 'Failed to delete clinic');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error checking doctors:', error);
      Alert.alert('Error', 'Failed to check clinic doctors');
    }
  };

  React.useEffect(() => {
    loadClinics();
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

  // ✅ Doctors screen - View Stats
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

  // ✅ Doctors screen - List
  if (selectedClinic && showDoctorsScreen && currentDoctorsScreen === 'list') {
    return (
      <DoctorsScreen
        onBack={() => {
          setShowDoctorsScreen(false);
          setCurrentDoctorsScreen('list');
        }}
        clinicId={selectedClinic.id}
        onOpenDoctorProfile={(doctor) => {
          console.log('Doctor selected:', doctor);
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

  // If a clinic is selected, show ClinicDetailsScreen
  if (selectedClinic) {
    return (
      <ClinicDetailsScreen
        clinicName={selectedClinic.name}
        clinicId={selectedClinic.id}
        onBack={() => setSelectedClinic(null)}
        onDoctorsPress={() => {
          setShowDoctorsScreen(true);
        }}
        onTimelinePress={() => {
          console.log('[DentalDepartmentsScreen] onTimelinePress called for:', selectedClinic.name);
          if (onOpenTimeline) {
            console.log('[DentalDepartmentsScreen] Calling onOpenTimeline');
            onOpenTimeline(selectedClinic.id, selectedClinic.name);
          } else {
            console.log('[DentalDepartmentsScreen] ERROR: onOpenTimeline is undefined!');
          }
        }}
      />
    );
  }

  // Swipe gesture removed

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
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
                    outputRange: [0, 30],
                  }),
                },
                {
                  translateY: blob1Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 40],
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
            styles.blob, 
            styles.blob3,
            {
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
        
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity 
                style={styles.backButton}
                onPress={onBack}
              >
                <Ionicons name="arrow-back" size={24} color="#4A5568" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Dental Departments</Text>
              {isSuperAdmin && (
                <TouchableOpacity 
                  style={styles.addButton}
                  onPress={() => setShowAddModal(true)}
                >
                  <Ionicons name="add" size={28} color="#4A5568" />
                </TouchableOpacity>
              )}
              {!isSuperAdmin && <View style={{ width: 40 }} />}
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="ابحث عن مركز..."
                  placeholderTextColor="#9CA3AF"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={20} color="#9CA3AF" />
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
              <View style={styles.clinicsList}>
                {filteredClinics.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="search-outline" size={48} color="#9CA3AF" />
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
                    <LinearGradient
                      colors={[
                        'rgba(255, 255, 255, 0.5)',
                        'rgba(255, 255, 255, 0.35)',
                        'rgba(147, 51, 234, 0.3)' // Purple smoke effect
                      ]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.clinicCard}
                    >
                      {/* Menu Button - Far Left (Super Admin only) */}
                      {isSuperAdmin && (
                        <TouchableOpacity
                          style={styles.menuButton}
                          onPress={() => setMenuClinicId(clinic.id)}
                        >
                          <Ionicons name="ellipsis-vertical" size={20} color="#9CA3AF" />
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
                              <Ionicons name="business-outline" size={28} color="#FFFFFF" />
                            </View>
                          </LinearGradient>
                        </View>
                      </TouchableOpacity>
                    </LinearGradient>
                    </Animated.View>
                  ))
                )}
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
                    <Ionicons name="close" size={24} color="#2D3748" />
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
              <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
              <Text style={styles.deleteMenuText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 34,
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
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    shadowColor: '#9333EA',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 12,
  },
  clinicIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clinicInnerGlow: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 24,
  },
  clinicInfo: {
    flex: 1,
    alignItems: 'flex-end',
    marginRight: 12,
  },
  clinicName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3748',
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
});
