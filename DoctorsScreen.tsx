import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, ScrollView, TextInput, Modal, KeyboardAvoidingView, Platform, Alert, Animated, Dimensions } from 'react-native';
// Swipe gesture removed
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from './AuthContext';
import { supabase } from './lib/supabaseClient';
interface DoctorsScreenProps {
  onBack: () => void;
  clinicId?: string; // Optional: filter by clinic (UUID)
  onOpenDoctorProfile?: (doctor: Doctor) => void;
}

interface Doctor {
  id: string; // UUID
  name: string;
  clinicId: string | null; // UUID or null for pending
  clinicName: string;
  specialization?: string;
  role: 'doctor' | 'coordinator' | 'team_leader';
}

// DOCTORS mock data removed - now using Supabase

// Clinics are now loaded dynamically from Supabase

export default function DoctorsScreen({ onBack, clinicId, onOpenDoctorProfile }: DoctorsScreenProps) {
  const { user } = useAuth();
  const [doctors, setDoctors] = React.useState<Doctor[]>([]);
  const [clinics, setClinics] = React.useState<Array<{id: string, name: string, nameAr: string}>>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClinicFilter, setSelectedClinicFilter] = useState<string | null>(null); // null = All
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<'all' | 'coordinator' | 'team_leader' | 'doctor' | 'pending'>('all');

  // Dragon Design: Animated Blobs
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

  // Dragon Design: Animate blobs continuously
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

  // Get icon gradient colors based on role
  const getIconColors = (role: 'doctor' | 'coordinator' | 'team_leader') => {
    switch (role) {
      case 'coordinator':
        return ['rgba(167, 139, 250, 0.3)', 'rgba(139, 92, 246, 0.6)', 'rgba(124, 58, 237, 0.9)']; // Purple
      case 'team_leader':
        return ['rgba(134, 239, 172, 0.3)', 'rgba(34, 197, 94, 0.6)', 'rgba(22, 163, 74, 0.9)']; // Green
      case 'doctor':
      default:
        return ['rgba(96, 165, 250, 0.3)', 'rgba(59, 130, 246, 0.6)', 'rgba(37, 99, 235, 0.9)']; // Blue
    }
  };
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDoctorName, setNewDoctorName] = useState('');
  const [newDoctorEmail, setNewDoctorEmail] = useState('');
  const [newDoctorPassword, setNewDoctorPassword] = useState('');
  const [newDoctorClinic, setNewDoctorClinic] = useState<string>('10000000-0000-0000-0000-000000000001'); // Default to Mushref
  const [newDoctorRole, setNewDoctorRole] = useState<'doctor' | 'coordinator' | 'team_leader'>('doctor');
  
  // Swipe gesture removed
  const [showClinicDropdown, setShowClinicDropdown] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showRoleFilterDropdown, setShowRoleFilterDropdown] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null); // UUID
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedTransferClinic, setSelectedTransferClinic] = useState<string | null>(null); // UUID
  const [showDoctorProfile, setShowDoctorProfile] = useState(false);
  const [showChangeRoleModal, setShowChangeRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'doctor' | 'coordinator' | 'team_leader' | null>(null);

  // Load clinics from Supabase
  const loadClinics = async () => {
    try {
      const { data, error } = await supabase
        .from('clinics')
        .select('id, name')
        .order('id');
      
      if (error) throw error;
      
      if (data) {
        const formattedClinics = data.map(c => ({
          id: c.id, // UUID from database
          name: c.name,
          nameAr: c.name
        }));
        setClinics(formattedClinics);
      }
    } catch (error) {
      console.error('Error loading clinics:', error);
    }
  };

  // Load doctors from both pending_doctors and doctors tables
  const loadDoctors = async () => {
    try {
      setLoading(true);
      
      // Load from pending_doctors (virtual/unassigned)
      const { data: pendingData, error: pendingError } = await supabase
        .from('pending_doctors')
        .select('id, name, email, role, clinic_id')
        .in('role', ['doctor', 'coordinator', 'team_leader'])
        .order('name');
      
      console.log('📋 Pending Doctors Data:', pendingData);
      console.log('❌ Pending Doctors Error:', pendingError);
      
      if (pendingError) throw pendingError;
      
      // Load from doctors (assigned)
      const { data: assignedData, error: assignedError } = await supabase
        .from('doctors')
        .select('id, name, email, role, clinic_id')
        .in('role', ['doctor', 'coordinator', 'team_leader'])
        .order('name');
      
      console.log('👥 Assigned Doctors Data:', assignedData);
      console.log('❌ Assigned Doctors Error:', assignedError);
      
      if (assignedError) throw assignedError;
      
      // Combine both lists
      const allDoctors = [...(pendingData || []), ...(assignedData || [])];
      
      console.log('🔗 Combined Doctors Count:', allDoctors.length);
      console.log('🔗 Combined Doctors:', allDoctors);
      
      if (allDoctors.length > 0) {
        const formattedDoctors: Doctor[] = allDoctors.map(d => {
          const clinic = clinics.find(c => c.id === d.clinic_id);
          return {
            id: d.id,
            name: d.name || 'Unknown',
            clinicId: d.clinic_id || null, // UUID or null
            clinicName: clinic?.nameAr || (d.clinic_id ? 'غير معروف' : 'في انتظار التعيين'),
            specialization: '',
            role: d.role as 'doctor' | 'coordinator' | 'team_leader',
          };
        });
        setDoctors(formattedDoctors);
      }
    } catch (error) {
      console.error('Error loading doctors:', error);
      Alert.alert('Error', 'Failed to load doctors');
    } finally {
      setLoading(false);
    }
  };

  // Load clinics first, then doctors
  React.useEffect(() => {
    loadClinics();
  }, []);

  // Load doctors only when clinics are ready
  React.useEffect(() => {
    if (clinics.length > 0) {
      loadDoctors();
    }
  }, [clinics]);

  // Animate cards when doctors load
  React.useEffect(() => {
    if (doctors.length > 0) {
      // Reset animations
      cardAnims.forEach(anim => {
        anim.fade.setValue(0);
        anim.slide.setValue(cardAnims.indexOf(anim) % 2 === 0 ? 50 : -50);
      });

      // Start staggered animation
      setTimeout(() => {
        const animations = cardAnims.slice(0, Math.min(doctors.length, 20)).map(anim => 
          Animated.parallel([
            Animated.timing(anim.fade, { toValue: 1, duration: 600, useNativeDriver: true }),
            Animated.spring(anim.slide, { toValue: 0, useNativeDriver: true, friction: 8 }),
          ])
        );
        Animated.stagger(100, animations).start();
      }, 50);
    }
  }, [doctors.length]);

  // Calculate permissions based on user role
  const permissions = React.useMemo(() => {
    if (!user) return null;
    
    return {
      canAddDoctor: user.role === 'super_admin' || user.role === 'coordinator' || user.role === 'team_leader',
      canViewDoctorProfiles: user.role !== 'doctor',
      canPromoteToCoordinator: user.role === 'super_admin',
      canDeleteCoordinator: user.role === 'super_admin',
    };
  }, [user]);

  // Filter doctors based on search query and clinic filter
  const filteredDoctors = doctors
    .filter(doctor => {
      const matchesSearch = doctor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           doctor.clinicName.toLowerCase().includes(searchQuery.toLowerCase());
      
      // IMPORTANT: Always show pending doctors (clinic_id = null) for Super Admin & Coordinator
      const isPendingDoctor = doctor.clinicId === null;
      const matchesClinic = isPendingDoctor || selectedClinicFilter === null || doctor.clinicId === selectedClinicFilter;
      
      const matchesRole = selectedRoleFilter === 'all' || 
                          (selectedRoleFilter === 'pending' && doctor.clinicId === null) ||
                          (selectedRoleFilter !== 'pending' && doctor.role === selectedRoleFilter);
      const matchesProvidedClinic = !clinicId || doctor.clinicId === clinicId; // Filter by provided clinicId
      
      // Team Leader & Doctor: يرون فقط أطباء مركزهم
      const matchesUserClinic = 
        (user?.role !== 'team_leader' && user?.role !== 'doctor') || 
        doctor.clinicId === user?.clinicId;
      
      return matchesSearch && matchesClinic && matchesRole && matchesProvidedClinic && matchesUserClinic;
    })
    .sort((a, b) => {
      // ترتيب حسب الدور: coordinator أولاً، ثم team_leader، ثم doctor
      const roleOrder = { coordinator: 1, team_leader: 2, doctor: 3 };
      return roleOrder[a.role] - roleOrder[b.role];
    });

  return (
    <View style={{ flex: 1 }}>
      {/* Dragon Design Background */}
      <View style={styles.container}>
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
        
        <View style={styles.contentContainer}>
          <StatusBar barStyle="dark-content" />
          <SafeAreaView style={styles.safeArea} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity 
                style={styles.backButton}
                onPress={onBack}
              >
                <Ionicons name="arrow-back" size={24} color="#4A5568" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Doctors</Text>
              {permissions?.canAddDoctor && (
                <TouchableOpacity 
                  style={styles.addButton}
                  onPress={() => {
                    setNewDoctorRole('doctor'); // Reset to doctor
                    setShowAddModal(true);
                  }}
                >
                  <Ionicons name="add" size={24} color="#4A5568" />
                </TouchableOpacity>
              )}
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="ابحث عن طبيب..."
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

            {/* Role Filter Dropdown */}
            <View style={styles.dropdownContainer}>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setShowRoleFilterDropdown(!showRoleFilterDropdown)}
              >
                <Text style={styles.dropdownButtonText}>
                  {selectedRoleFilter === 'all' && `All (${filteredDoctors.length})`}
                  {selectedRoleFilter === 'coordinator' && `Coordinator (${doctors.filter(d => d.role === 'coordinator').length})`}
                  {selectedRoleFilter === 'team_leader' && `Team Leaders (${doctors.filter(d => d.role === 'team_leader').length})`}
                  {selectedRoleFilter === 'doctor' && `Doctors (${doctors.filter(d => d.role === 'doctor' && d.clinicId !== null).length})`}
                  {selectedRoleFilter === 'pending' && `Pending Doctors (${doctors.filter(d => d.clinicId === null).length})`}
                </Text>
                <Ionicons name={showRoleFilterDropdown ? "chevron-up" : "chevron-down"} size={20} color="#6B7280" />
              </TouchableOpacity>

              {/* Dropdown Menu */}
              {showRoleFilterDropdown && (
                <View style={styles.dropdownMenu}>
                  <TouchableOpacity
                    style={[styles.dropdownItem, selectedRoleFilter === 'all' && styles.dropdownItemActive]}
                    onPress={() => {
                      setSelectedRoleFilter('all');
                      setShowRoleFilterDropdown(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, selectedRoleFilter === 'all' && styles.dropdownItemTextActive]}>
                      All ({doctors.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.dropdownItem, selectedRoleFilter === 'coordinator' && styles.dropdownItemActive]}
                    onPress={() => {
                      setSelectedRoleFilter('coordinator');
                      setShowRoleFilterDropdown(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, selectedRoleFilter === 'coordinator' && styles.dropdownItemTextActive]}>
                      Coordinator ({doctors.filter(d => d.role === 'coordinator').length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.dropdownItem, selectedRoleFilter === 'team_leader' && styles.dropdownItemActive]}
                    onPress={() => {
                      setSelectedRoleFilter('team_leader');
                      setShowRoleFilterDropdown(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, selectedRoleFilter === 'team_leader' && styles.dropdownItemTextActive]}>
                      Team Leaders ({doctors.filter(d => d.role === 'team_leader').length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.dropdownItem, selectedRoleFilter === 'doctor' && styles.dropdownItemActive]}
                    onPress={() => {
                      setSelectedRoleFilter('doctor');
                      setShowRoleFilterDropdown(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, selectedRoleFilter === 'doctor' && styles.dropdownItemTextActive]}>
                      Doctors ({doctors.filter(d => d.role === 'doctor' && d.clinicId !== null).length})
                    </Text>
                  </TouchableOpacity>

                  {/* Pending Doctors - Only for Super Admin & Coordinator */}
                  {(user?.role === 'super_admin' || user?.role === 'coordinator') && (
                    <TouchableOpacity
                      style={[styles.dropdownItem, selectedRoleFilter === 'pending' && styles.dropdownItemActive]}
                      onPress={() => {
                        setSelectedRoleFilter('pending');
                        setShowRoleFilterDropdown(false);
                      }}
                    >
                      <Text style={[styles.dropdownItemText, selectedRoleFilter === 'pending' && styles.dropdownItemTextActive]}>
                        Pending Doctors ({doctors.filter(d => d.clinicId === null).length})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            {/* Doctors List */}
            <ScrollView 
              style={styles.content}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.doctorsList}>
                {filteredDoctors.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="people-outline" size={48} color="#9CA3AF" />
                    <Text style={styles.emptyText}>لا توجد نتائج</Text>
                  </View>
                ) : (
                  filteredDoctors.map((doctor, index) => (
                    <Animated.View
                      key={doctor.id}
                      style={{
                        opacity: cardAnims[index]?.fade || 1,
                        transform: [{ translateX: cardAnims[index]?.slide || 0 }]
                      }}
                    >
                    <LinearGradient
                      colors={[
                        'rgba(255, 255, 255, 0.5)',
                        'rgba(255, 255, 255, 0.35)',
                        getIconColors(doctor.role)[0]
                      ]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.doctorCard}
                    >
                      {/* Menu Button - Left */}
                      <TouchableOpacity
                        onPress={() => {
                          setSelectedDoctorId(doctor.id);
                          setSelectedDoctor(doctor);
                          setShowActionsModal(true);
                        }}
                        style={styles.menuButton}
                      >
                        <Ionicons name="ellipsis-vertical" size={20} color="#9CA3AF" />
                      </TouchableOpacity>

                      {/* Doctor Info - Right Side */}
                      <TouchableOpacity
                        style={styles.rightContent}
                        activeOpacity={0.7}
                        onPress={() => {
                          if (permissions?.canViewDoctorProfiles) {
                            console.log('Doctor pressed:', doctor.name);
                            // TODO: Open doctor profile
                          } else {
                            Alert.alert('غير مسموح', 'لا يمكنك فتح ملفات الأطباء');
                          }
                        }}
                        disabled={!permissions?.canViewDoctorProfiles}
                      >
                        <View style={styles.doctorInfo}>
                          <Text style={styles.doctorName}>{doctor.name}</Text>
                          <Text style={styles.clinicNameText}>{doctor.clinicName}</Text>
                        </View>
                        <View style={styles.doctorIconContainer}>
                          <LinearGradient
                            colors={getIconColors(doctor.role)}
                            start={{ x: 0.5, y: 0 }}
                            end={{ x: 0.5, y: 1 }}
                            style={styles.doctorIcon}
                          >
                            <View style={styles.innerGlow}>
                              <MaterialCommunityIcons name="doctor" size={28} color="#FFFFFF" />
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

          {/* Add Doctor Modal */}
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
              style={styles.modalContent}
            >
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Doctor</Text>
                <TouchableOpacity 
                  onPress={() => setShowAddModal(false)}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close" size={24} color="#2D3748" />
                </TouchableOpacity>
              </View>

              {/* Form Fields */}
              <View style={styles.formContainer}>
                {/* Name Field */}
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>Name:</Text>
                  <View style={[styles.textInput, { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 0 }]}>
                    <Text style={{ color: '#2D3748', fontSize: 16, fontWeight: '600', marginLeft: 4 }}>د. </Text>
                    <TextInput
                      style={{ flex: 1, color: '#2D3748', fontSize: 16, paddingVertical: 12, textAlign: 'right' }}
                      value={newDoctorName}
                      onChangeText={setNewDoctorName}
                      placeholder="أدخل اسم الطبيب"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                </View>

                {/* Email Field */}
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>Email:</Text>
                  <TextInput
                    style={styles.textInput}
                    value={newDoctorEmail}
                    onChangeText={setNewDoctorEmail}
                    placeholder="Enter doctor email"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                {/* Password Field */}
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>Password:</Text>
                  <TextInput
                    style={styles.textInput}
                    value={newDoctorPassword}
                    onChangeText={setNewDoctorPassword}
                    placeholder="Enter password"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry
                  />
                </View>

                {/* Clinic Dropdown - Hidden for Team Leader */}
                {user?.role !== 'team_leader' && (
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>Clinic:</Text>
                  <TouchableOpacity 
                    style={styles.textInput}
                    onPress={() => setShowClinicDropdown(!showClinicDropdown)}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: '#2D3748', fontSize: 16, flex: 1 }}>
                        {clinics.find(c => c.id === newDoctorClinic)?.name || 'Select clinic'}
                      </Text>
                      <Ionicons 
                        name={showClinicDropdown ? "chevron-up" : "chevron-down"} 
                        size={20} 
                        color="#4A5568" 
                      />
                    </View>
                  </TouchableOpacity>
                  
                  {showClinicDropdown && (
                    <View style={styles.clinicDropdownMenu}>
                      {clinics.filter(c => c.id !== 0).map((clinic) => (
                        <TouchableOpacity
                          key={clinic.id}
                          style={styles.clinicDropdownItem}
                          onPress={() => {
                            setNewDoctorClinic(clinic.id);
                            setShowClinicDropdown(false);
                          }}
                        >
                          <Text style={styles.clinicDropdownItemText}>
                            {clinic.name}
                          </Text>
                          {newDoctorClinic === clinic.id && (
                            <Ionicons name="checkmark" size={20} color="#3B82F6" />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                )}

                {/* Role Dropdown - Only Doctor for Team Leader */}
                {user?.role === 'team_leader' ? (
                  <View style={styles.formField}>
                    <Text style={styles.fieldLabel}>Role:</Text>
                    <View style={[styles.textInput, { backgroundColor: '#F3F4F6' }]}>
                      <Text style={{ color: '#6B7280', fontSize: 16 }}>Doctor (Fixed)</Text>
                    </View>
                  </View>
                ) : (
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>Role:</Text>
                  <TouchableOpacity 
                    style={styles.textInput}
                    onPress={() => setShowRoleDropdown(!showRoleDropdown)}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: '#2D3748', fontSize: 16, flex: 1 }}>
                        {newDoctorRole === 'doctor' ? 'Doctor' : newDoctorRole === 'coordinator' ? 'Coordinator' : 'Team Leader'}
                      </Text>
                      <Ionicons 
                        name={showRoleDropdown ? "chevron-up" : "chevron-down"} 
                        size={20} 
                        color="#4A5568" 
                      />
                    </View>
                  </TouchableOpacity>
                  
                  {showRoleDropdown && (
                    <View style={styles.clinicDropdownMenu}>
                      <TouchableOpacity
                        style={styles.clinicDropdownItem}
                        onPress={() => {
                          setNewDoctorRole('doctor');
                          setShowRoleDropdown(false);
                        }}
                      >
                        <Text style={styles.clinicDropdownItemText}>Doctor</Text>
                        {newDoctorRole === 'doctor' && (
                          <Ionicons name="checkmark" size={20} color="#3B82F6" />
                        )}
                      </TouchableOpacity>
                      {/* Coordinator - Only for Super Admin */}
                      {permissions?.canPromoteToCoordinator && (
                      <TouchableOpacity
                        style={styles.clinicDropdownItem}
                        onPress={() => {
                          setNewDoctorRole('coordinator');
                          setShowRoleDropdown(false);
                        }}
                      >
                        <Text style={styles.clinicDropdownItemText}>Coordinator</Text>
                        {newDoctorRole === 'coordinator' && (
                          <Ionicons name="checkmark" size={20} color="#3B82F6" />
                        )}
                      </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.clinicDropdownItem}
                        onPress={() => {
                          setNewDoctorRole('team_leader');
                          setShowRoleDropdown(false);
                        }}
                      >
                        <Text style={styles.clinicDropdownItemText}>Team Leader</Text>
                        {newDoctorRole === 'team_leader' && (
                          <Ionicons name="checkmark" size={20} color="#3B82F6" />
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                )}
              </View>

              {/* Action Buttons */}
              <View style={styles.modalActions}>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowAddModal(false);
                    setNewDoctorName('');
                    setNewDoctorEmail('');
                    setNewDoctorPassword('');
                    setNewDoctorClinic(1);
                    setNewDoctorRole('doctor');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={async () => {
                    // Validation
                    if (!newDoctorName.trim()) {
                      Alert.alert('Error', 'Please enter doctor name');
                      return;
                    }
                    if (!newDoctorEmail.trim()) {
                      Alert.alert('Error', 'Please enter email');
                      return;
                    }
                    
                    // For Team Leader: use their clinic and force role to doctor
                    const finalClinicId = user?.role === 'team_leader' ? user.clinicId : newDoctorClinic;
                    const finalRole = user?.role === 'team_leader' ? 'doctor' : newDoctorRole;
                    
                    if (!finalClinicId) {
                      Alert.alert('Error', 'Please select a clinic');
                      return;
                    }
                    
                    try {
                      // Get clinic name
                      const clinic = clinics.find(c => c.id === finalClinicId);
                      
                      // ✅ Step 1: Create user in Authentication
                      const { data: authData, error: authError } = await supabase.auth.signUp({
                        email: newDoctorEmail.trim(),
                        password: newDoctorPassword || '0000',
                        options: {
                          data: {
                            name: 'د. ' + newDoctorName.trim(),
                            role: finalRole,
                            clinic_id: finalClinicId
                          }
                        }
                      });
                      
                      if (authError) throw authError;
                      
                      if (!authData.user) {
                        throw new Error('Failed to create user in Authentication');
                      }
                      
                      // ✅ Step 2: Insert doctor into doctors table with the same UUID
                      const { error: doctorError } = await supabase
                        .from('doctors')
                        .insert([{
                          id: authData.user.id, // ✅ Use same UUID from auth.users
                          name: 'د. ' + newDoctorName.trim(),
                          email: newDoctorEmail.trim(),
                          password: newDoctorPassword || '0000', // ✅ Store password (required by table schema)
                          role: finalRole,
                          clinic_id: finalClinicId
                        }]);
                      
                      if (doctorError) throw doctorError;
                      
                      // Reload clinics and doctors
                      await loadClinics();
                      await loadDoctors();
                      
                      Alert.alert('Success', 'Doctor added successfully!');
                      setShowAddModal(false);
                      setNewDoctorName('');
                      setNewDoctorEmail('');
                      setNewDoctorPassword('');
                      setNewDoctorClinic(1);
                      setNewDoctorRole('doctor');
                    } catch (error: any) {
                      console.error('Error adding doctor:', error);
                      
                      // Check for duplicate email error
                      if (error.code === '23505') {
                        Alert.alert('Error', 'This email is already registered. Please use a different email.');
                      } else {
                        Alert.alert('Error', 'Failed to add doctor: ' + (error.message || 'Unknown error'));
                      }
                    }
                  }}
                >
                  <Text style={styles.saveButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Doctor Actions Modal */}
      <Modal
        visible={showActionsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowActionsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '90%', paddingHorizontal: 24, paddingVertical: 24 }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Doctor Actions</Text>
              <TouchableOpacity onPress={() => setShowActionsModal(false)}>
                <Ionicons name="close" size={28} color="#4A5568" />
              </TouchableOpacity>
            </View>

            {/* Action Buttons */}
            <View style={{ gap: 12, marginTop: 20 }}>
              {/* View Profile - Only for Team Leader, NOT for Doctor */}
              {user?.role !== 'doctor' && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  if (onOpenDoctorProfile && selectedDoctor) {
                    setShowActionsModal(false);
                    onOpenDoctorProfile(selectedDoctor);
                  }
                }}
              >
                <View style={[styles.actionIconContainer, { backgroundColor: '#3B82F6' }]}>
                  <Ionicons name="person-outline" size={24} color="#FFFFFF" />
                </View>
                <Text style={styles.actionButtonText}>View Profile</Text>
              </TouchableOpacity>
              )}

                     {/* Transfer - Only for Super Admin & Coordinator, but Coordinator cannot transfer another Coordinator */}
              {(user?.role === 'super_admin' || user?.role === 'coordinator') && 
               !(user?.role === 'coordinator' && selectedDoctor?.role === 'coordinator') && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  setShowActionsModal(false);
                  setShowTransferModal(true);
                }}
              >
                <View style={[styles.actionIconContainer, { backgroundColor: '#10B981' }]}>
                  <Ionicons name="swap-horizontal" size={24} color="#FFFFFF" />
                </View>
                <Text style={styles.actionButtonText}>Transfer Doctor</Text>
              </TouchableOpacity>
              )}

              {/* Change Role - Only for Super Admin & Coordinator, but Coordinator cannot change another Coordinator's role */}
              {(user?.role === 'super_admin' || user?.role === 'coordinator') && 
               !(user?.role === 'coordinator' && selectedDoctor?.role === 'coordinator') && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  setShowActionsModal(false);
                  setShowChangeRoleModal(true);
                }}
              >
                <View style={[styles.actionIconContainer, { backgroundColor: '#F59E0B' }]}>
                  <Ionicons name="key-outline" size={24} color="#FFFFFF" />
                </View>
                <Text style={styles.actionButtonText}>Change Role</Text>
              </TouchableOpacity>
              )}

              {/* Reset Password - Only for Super Admin */}
              {user?.role === 'super_admin' && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  setShowActionsModal(false);
                  Alert.alert(
                    'إعادة تعيين كلمة المرور',
                    `هل تريد إعادة تعيين كلمة المرور للطبيب ${selectedDoctor?.name} إلى 0000؟`,
                    [
                      { text: 'إلغاء', style: 'cancel' },
                      { 
                        text: 'إعادة تعيين', 
                        style: 'destructive',
                        onPress: async () => {
                          if (!selectedDoctor?.id) return;
                          
                          try {
                            // Update password in doctors table
                            const { error } = await supabase
                              .from('doctors')
                              .update({ password: '0000' })
                              .eq('id', selectedDoctor.id);
                            
                            if (error) throw error;
                            
                            Alert.alert('نجح', `تم إعادة تعيين كلمة المرور للطبيب ${selectedDoctor.name} إلى 0000\n\nيمكن للطبيب الآن تسجيل الدخول بكلمة المرور: 0000`);
                            setSelectedDoctorId(null);
                            setSelectedDoctor(null);
                          } catch (error) {
                            console.error('Error resetting password:', error);
                            Alert.alert('خطأ', 'فشل إعادة تعيين كلمة المرور. الرجاء المحاولة مرة أخرى.');
                          }
                        }
                      }
                    ]
                  );
                }}
              >
                <View style={[styles.actionIconContainer, { backgroundColor: '#8B5CF6' }]}>
                  <Ionicons name="lock-closed-outline" size={24} color="#FFFFFF" />
                </View>
                <Text style={styles.actionButtonText}>Reset Password</Text>
              </TouchableOpacity>
              )}

              {/* Delete - Only for Super Admin & Coordinator, Hidden if trying to delete Coordinator as Coordinator */}
              {(user?.role === 'super_admin' || user?.role === 'coordinator') && 
               !(selectedDoctor?.role === 'coordinator' && !permissions?.canDeleteCoordinator) && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  setShowActionsModal(false);
                  Alert.alert(
                    'Delete Doctor',
                    'Are you sure you want to delete this doctor?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { 
                        text: 'Delete', 
                        style: 'destructive', 
                        onPress: async () => {
                          if (!selectedDoctorId) return;
                          
                          try {
                            // ✅ Step 1: Check if doctor is in pending_doctors
                            const { data: pendingDoctor } = await supabase
                              .from('pending_doctors')
                              .select('id')
                              .eq('id', selectedDoctorId)
                              .single();
                            
                            if (pendingDoctor) {
                              // ✅ Delete from pending_doctors (CASCADE will delete pending_patients)
                              const { error: deletePendingError } = await supabase
                                .from('pending_doctors')
                                .delete()
                                .eq('id', selectedDoctorId);
                              
                              if (deletePendingError) throw deletePendingError;
                            } else {
                              // ✅ Delete from doctors table
                              // First delete all patients associated with this doctor
                              const { error: patientsError } = await supabase
                                .from('patients')
                                .delete()
                                .eq('doctor_id', selectedDoctorId);
                              
                              if (patientsError) {
                                console.error('Error deleting patients:', patientsError);
                                // Continue anyway - non-critical error
                              }
                              
                              // Then delete doctor
                              const { error: deleteDoctorError } = await supabase
                                .from('doctors')
                                .delete()
                                .eq('id', selectedDoctorId);
                              
                              if (deleteDoctorError) throw deleteDoctorError;
                            }
                            
                            // ✅ Delete from Authentication (if exists)
                            const { error: authError } = await supabase.auth.admin.deleteUser(selectedDoctorId);
                            if (authError) {
                              console.warn('Warning: Could not delete user from Authentication:', authError);
                              // Continue anyway - user might not exist in auth
                            }
                            
                            // Reload clinics and doctors
                            await loadClinics();
                            await loadDoctors();
                            
                            Alert.alert('Success', 'Doctor deleted successfully!');
                            setSelectedDoctorId(null);
                            setSelectedDoctor(null);
                          } catch (error) {
                            console.error('Error deleting doctor:', error);
                            Alert.alert('Error', 'Failed to delete doctor');
                          }
                        }
                      }
                    ]
                  );
                }}
              >
                <View style={[styles.actionIconContainer, { backgroundColor: '#EF4444' }]}>
                  <Ionicons name="trash-outline" size={24} color="#FFFFFF" />
                </View>
                <Text style={styles.actionButtonText}>Delete</Text>
              </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Transfer Doctor Modal */}
      <Modal
        visible={showTransferModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowTransferModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '90%', paddingHorizontal: 24, paddingVertical: 24 }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Transfer Doctor</Text>
              <TouchableOpacity onPress={() => setShowTransferModal(false)}>
                <Ionicons name="close" size={28} color="#4A5568" />
              </TouchableOpacity>
            </View>

            {/* Clinic Selection */}
            <View style={{ marginTop: 20 }}>
              <Text style={[styles.fieldLabel, { marginBottom: 12 }]}>Select New Clinic:</Text>
              {clinics.filter(c => c.id !== 0).map((clinic) => (
                <TouchableOpacity
                  key={clinic.id}
                  style={[
                    styles.clinicOption,
                    selectedTransferClinic === clinic.id && styles.clinicOptionSelected
                  ]}
                  onPress={() => setSelectedTransferClinic(clinic.id)}
                >
                  <View style={[
                    styles.radioButton,
                    selectedTransferClinic === clinic.id && styles.radioButtonSelected
                  ]}>
                    {selectedTransferClinic === clinic.id && (
                      <View style={styles.radioButtonInner} />
                    )}
                  </View>
                  <Text style={[
                    styles.clinicOptionText,
                    selectedTransferClinic === clinic.id && styles.clinicOptionTextSelected
                  ]}>
                    {clinic.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Action Buttons */}
            <View style={[styles.modalActions, { marginTop: 24 }]}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowTransferModal(false);
                  setSelectedTransferClinic(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.saveButton]}
                onPress={async () => {
                  if (!selectedTransferClinic || !selectedDoctorId) {
                    Alert.alert('Error', 'Please select a clinic');
                    return;
                  }
                  
                  try {
                    // Get clinic name
                    const clinic = clinics.find(c => c.id === selectedTransferClinic);
                    
                    // Step 1: Try to get doctor from pending_doctors first
                    const { data: pendingDoctor } = await supabase
                      .from('pending_doctors')
                      .select('*')
                      .eq('id', selectedDoctorId)
                      .single();
                    
                    if (pendingDoctor) {
                      // Doctor is in pending_doctors - move to doctors table
                      // ✅ Note: Authentication account already exists (created during registration)
                      // We just need to move data from pending_doctors to doctors
                      const { error: insertError } = await supabase
                        .from('doctors')
                        .insert([{
                          id: pendingDoctor.id, // ✅ Keep same UUID (already in auth.users)
                          name: pendingDoctor.name,
                          email: pendingDoctor.email,
                          password: pendingDoctor.password, // ✅ Keep password (required by table schema)
                          role: pendingDoctor.role,
                          clinic_id: selectedTransferClinic, // Assign to real clinic (UUID)
                          is_approved: true, // Now approved
                          virtual_center_id: null, // No longer virtual
                          virtual_center_name: null,
                        }]);
                      
                      if (insertError) throw insertError;
                      
                      // Delete from pending_doctors (CASCADE will delete pending_patients automatically)
                      const { error: deletePendingError } = await supabase
                        .from('pending_doctors')
                        .delete()
                        .eq('id', selectedDoctorId);
                      
                      if (deletePendingError) throw deletePendingError;
                    } else {
                      // Doctor is already in doctors table - just update clinic_id
                      const { error: updateError } = await supabase
                        .from('doctors')
                        .update({ clinic_id: selectedTransferClinic })
                        .eq('id', selectedDoctorId);
                      
                      if (updateError) throw updateError;
                    }
                    
                    // Reload clinics and doctors
                    await loadClinics();
                    await loadDoctors();
                    
                    Alert.alert('Success', 'Doctor transferred successfully!');
                    setShowTransferModal(false);
                    setSelectedTransferClinic(null);
                    setSelectedDoctorId(null);
                  } catch (error) {
                    console.error('Error transferring doctor:', error);
                    Alert.alert('Error', 'Failed to transfer doctor');
                  }
                }}
              >
                <Text style={styles.saveButtonText}>Transfer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Role Modal */}
      <Modal
        visible={showChangeRoleModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowChangeRoleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '90%', paddingHorizontal: 24, paddingVertical: 24 }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Role</Text>
              <TouchableOpacity onPress={() => setShowChangeRoleModal(false)}>
                <Ionicons name="close" size={28} color="#4A5568" />
              </TouchableOpacity>
            </View>

            {/* Role Selection */}
            <View style={{ marginTop: 20 }}>
              <Text style={[styles.fieldLabel, { marginBottom: 12 }]}>Select New Role:</Text>
              
              {/* Doctor Option */}
              <TouchableOpacity
                style={[
                  styles.clinicOption,
                  selectedRole === 'doctor' && styles.clinicOptionSelected
                ]}
                onPress={() => setSelectedRole('doctor')}
              >
                <View style={[
                  styles.radioButton,
                  selectedRole === 'doctor' && styles.radioButtonSelected
                ]}>
                  {selectedRole === 'doctor' && (
                    <View style={styles.radioButtonInner} />
                  )}
                </View>
                <Text style={[
                  styles.clinicOptionText,
                  selectedRole === 'doctor' && styles.clinicOptionTextSelected
                ]}>
                  Doctor
                </Text>
              </TouchableOpacity>

              {/* Coordinator Option - Only for Super Admin */}
              {user?.role === 'super_admin' && (
              <TouchableOpacity
                style={[
                  styles.clinicOption,
                  selectedRole === 'coordinator' && styles.clinicOptionSelected
                ]}
                onPress={() => setSelectedRole('coordinator')}
              >
                <View style={[
                  styles.radioButton,
                  selectedRole === 'coordinator' && styles.radioButtonSelected
                ]}>
                  {selectedRole === 'coordinator' && (
                    <View style={styles.radioButtonInner} />
                  )}
                </View>
                <Text style={[
                  styles.clinicOptionText,
                  selectedRole === 'coordinator' && styles.clinicOptionTextSelected
                ]}>
                  Coordinator
                </Text>
              </TouchableOpacity>
              )}

              {/* Team Leader Option */}
              <TouchableOpacity
                style={[
                  styles.clinicOption,
                  selectedRole === 'team_leader' && styles.clinicOptionSelected
                ]}
                onPress={() => setSelectedRole('team_leader')}
              >
                <View style={[
                  styles.radioButton,
                  selectedRole === 'team_leader' && styles.radioButtonSelected
                ]}>
                  {selectedRole === 'team_leader' && (
                    <View style={styles.radioButtonInner} />
                  )}
                </View>
                <Text style={[
                  styles.clinicOptionText,
                  selectedRole === 'team_leader' && styles.clinicOptionTextSelected
                ]}>
                  Team Leader
                </Text>
              </TouchableOpacity>
            </View>

            {/* Action Buttons */}
            <View style={[styles.modalActions, { marginTop: 24 }]}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowChangeRoleModal(false);
                  setSelectedRole(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.saveButton]}
                onPress={async () => {
                  if (!selectedRole || !selectedDoctorId) {
                    Alert.alert('Error', 'Please select a role');
                    return;
                  }
                  
                  try {
                    // Update role in Supabase
                    const { error } = await supabase
                      .from('doctors')
                      .update({ role: selectedRole })
                      .eq('id', selectedDoctorId);
                    
                    if (error) throw error;
                    
                    // Reload clinics and doctors
                    await loadClinics();
                    await loadDoctors();
                    
                    Alert.alert('Success', 'Role changed successfully!');
                    setShowChangeRoleModal(false);
                    setSelectedRole(null);
                    setSelectedDoctorId(null);
                  } catch (error) {
                    console.error('Error changing role:', error);
                    Alert.alert('Error', 'Failed to change role');
                  }
                }}
              >
                <Text style={styles.saveButtonText}>Change</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  contentContainer: {
    flex: 1,
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
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    flex: 1,
    textAlign: 'center',
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
  filterContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  filterScrollContent: {
    gap: 8,
  },
  filterChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
    borderColor: '#3B82F6',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A5568',
  },
  filterChipTextActive: {
    color: '#3B82F6',
  },
  content: {
    flex: 1,
    paddingTop: 0,
  },
  doctorsList: {
    paddingHorizontal: 20,
    paddingTop: 0,
    gap: 16,
  },  doctorCard: {
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
  rightContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginLeft: 16,
  },
  doctorInfo: {
    flex: 1,
    alignItems: 'flex-end',
    marginRight: 12,
  },
  doctorName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 4,
  },
  clinicNameText: {
    fontSize: 14,
    color: '#718096',
  },
  doctorIconContainer: {
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 12,
  },
  doctorIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerGlow: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 24,
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
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: '#A78BFA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  dropdownButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D3748',
    letterSpacing: 0.3,
  },
  dropdownMenu: {
    marginTop: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#A78BFA',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'transparent',
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
  },
  dropdownItemText: {
    fontSize: 15,
    color: '#4A5568',
    fontWeight: '500',
  },
  dropdownItemTextActive: {
    color: '#7C3AED',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  dropdownItemTextActive: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  dropdownContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '98%',
    minWidth: '98%',
    maxWidth: '98%',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    paddingHorizontal: 32,
    paddingVertical: 28,
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
    borderColor: 'rgba(0, 0, 0, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#2D3748',
  },
  clinicDropdownMenu: {
    marginTop: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    maxHeight: 200,
  },
  clinicDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  clinicDropdownItemText: {
    fontSize: 16,
    color: '#4A5568',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A5568',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  menuButton: {
    padding: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    gap: 16,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
    flex: 1,
  },
  clinicOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    gap: 12,
  },
  clinicOptionSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: '#3B82F6',
  },
  clinicOptionText: {
    fontSize: 16,
    color: '#4A5568',
    fontWeight: '500',
  },
  clinicOptionTextSelected: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonSelected: {
    borderColor: '#3B82F6',
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3B82F6',
  },
  roleFilterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 8,
  },
  roleFilterTab: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  roleFilterTabActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderColor: 'rgba(167, 139, 250, 0.6)',
    shadowColor: '#A78BFA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  roleFilterTabGradient: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleFilterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#718096',
  },
  roleFilterTabTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
