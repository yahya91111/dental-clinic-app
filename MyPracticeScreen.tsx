import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Animated,
  StatusBar,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from './lib/supabase';

interface MyPracticeScreenProps {
  doctorId: string; // UUID
  doctorName: string;
  virtualCenterId: string; // UUID
  onNavigateToTimeline: () => void;
  onNavigateToStatistics: () => void;
  onNavigateToSchedule: () => void;
  onLogout: () => void;
}

export default function MyPracticeScreen({
  doctorId,
  doctorName,
  virtualCenterId,
  onNavigateToTimeline,
  onNavigateToStatistics,
  onNavigateToSchedule,
  onLogout,
}: MyPracticeScreenProps) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalPatients: 0,
    todayPatients: 0,
    completedPatients: 0,
  });
  
  // Edit Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editedDoctorName, setEditedDoctorName] = useState(doctorName);
  const [doctorEmail, setDoctorEmail] = useState(''); // Will be loaded from database
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // virtualCenterId is now passed as prop

  // Animation values for 3D cards - EXACTLY like DoctorProfileScreen
  const [animKey, setAnimKey] = useState(0);
  const fadeAnim1 = React.useRef(new Animated.Value(0)).current;
  const fadeAnim2 = React.useRef(new Animated.Value(0)).current;
  const fadeAnim3 = React.useRef(new Animated.Value(0)).current;
  const slideAnim1 = React.useRef(new Animated.Value(50)).current;
  const slideAnim2 = React.useRef(new Animated.Value(-50)).current;
  const slideAnim3 = React.useRef(new Animated.Value(50)).current;

  // Animated Blobs - EXACTLY like DoctorProfileScreen
  const blob1Anim = useState(new Animated.Value(0))[0];
  const blob2Anim = useState(new Animated.Value(0))[0];
  const blob3Anim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    loadDoctorData();
  }, [virtualCenterId]);

  // Animate blobs continuously - EXACTLY like DoctorProfileScreen
  React.useEffect(() => {
    // Blob 1
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

    // Blob 2
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

    // Blob 3
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

  // Animate cards on mount - EXACTLY like DoctorProfileScreen
  React.useEffect(() => {
    // Stop any ongoing animations first
    fadeAnim1.stopAnimation();
    slideAnim1.stopAnimation();
    fadeAnim2.stopAnimation();
    slideAnim2.stopAnimation();
    fadeAnim3.stopAnimation();
    slideAnim3.stopAnimation();
    
    // Reset animations to initial values
    fadeAnim1.setValue(0);
    slideAnim1.setValue(50);
    fadeAnim2.setValue(0);
    slideAnim2.setValue(-50);
    fadeAnim3.setValue(0);
    slideAnim3.setValue(50);
    
    // Start animations with a small delay to ensure reset is complete
    setTimeout(() => {
      Animated.stagger(100, [
        Animated.parallel([
          Animated.timing(fadeAnim1, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.spring(slideAnim1, { toValue: 0, useNativeDriver: true, friction: 8 }),
        ]),
        Animated.parallel([
          Animated.timing(fadeAnim2, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.spring(slideAnim2, { toValue: 0, useNativeDriver: true, friction: 8 }),
        ]),
        Animated.parallel([
          Animated.timing(fadeAnim3, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.spring(slideAnim3, { toValue: 0, useNativeDriver: true, friction: 8 }),
        ]),
      ]).start();
    }, 50); // Small delay to ensure reset is complete
  }, []);

  const loadDoctorData = async () => {
    try {
      // Get doctor email from Supabase Auth
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setDoctorEmail(user.email);
      }
      
      // Get statistics using virtualCenterId from props
      if (virtualCenterId) {
        const { data: patients, error: patientsError } = await supabase
          .from('patients')
          .select('*')
          .eq('virtual_center_id', virtualCenterId);

        if (patientsError) throw patientsError;

        const today = new Date().toISOString().split('T')[0];
        const todayPatients = patients?.filter(
          (p) => p.created_at.startsWith(today)
        ).length || 0;
        const completedPatients = patients?.filter(
          (p) => p.status === 'complete'
        ).length || 0;

        setStats({
          totalPatients: patients?.length || 0,
          todayPatients,
          completedPatients,
        });
      }
    } catch (error) {
      Alert.alert('خطأ', 'فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#A855F7" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar translucent={true} backgroundColor="transparent" barStyle="dark-content" />
      
      {/* Gradient Mesh Background */}
      <LinearGradient
        colors={['#F0F4F8', '#E8EDF3', '#F5F0F8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.gradient}>
          {/* Animated Blobs */}
          <Animated.View 
            style={[
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
                      outputRange: [0, -40],
                    }),
                  },
                ],
              },
            ]} 
          />
          <Animated.View 
            style={[
              styles.blob2, 
              {
                transform: [
                  {
                    translateX: blob2Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -50],
                    }),
                  },
                  {
                    translateY: blob2Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 30],
                    }),
                  },
                ],
              },
            ]} 
          />
          <Animated.View 
            style={[
              styles.blob3, 
              {
                transform: [
                  {
                    translateX: blob3Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 40],
                    }),
                  },
                  {
                    translateY: blob3Anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 50],
                    }),
                  },
                ],
              },
            ]} 
          />
          
          {/* Content Wrapper */}
          <View style={styles.contentWrapper}>
            {/* Content */}
            <View style={styles.content}>
              {/* Side Avatar Header */}
              <View style={styles.sideHeader}>
                {/* Info */}
                <View style={[styles.sideInfo, { zIndex: 1 }]}>
                  <Text style={styles.sideDoctorName} numberOfLines={1}>{doctorName}</Text>
                  <View style={styles.sideClinicRow}>
                    <Ionicons name="briefcase" size={12} color="#718096" />
                    <Text style={styles.sideClinicName} numberOfLines={1}>My Practice</Text>
                  </View>
                </View>
                
                {/* Edit Button */}
                <TouchableOpacity 
                  onPress={() => setShowEditModal(true)} 
                  style={[styles.sideEditButton, { zIndex: 1 }]}
                >
                  <Ionicons name="create-outline" size={20} color="#4A5568" />
                </TouchableOpacity>
              </View>

              {/* 3D Floating Cards - Staggered Layout */}
              <ScrollView 
                key={`cards-mypractice-${animKey}`}
                style={styles.cardsScrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.cardsContainer}
              >
                {/* Card 1: Timeline - Right Aligned */}
                <Animated.View
                  style={[
                    { opacity: fadeAnim1, transform: [{ translateX: slideAnim1 }] }
                  ]}
                >
                  <TouchableOpacity 
                    style={[styles.floatingCard, styles.cardRight, { marginTop: 0 }]}
                    activeOpacity={0.85}
                    onPress={onNavigateToTimeline}
                  >
                    <LinearGradient
                      colors={['rgba(168, 218, 255, 0.6)', 'rgba(126, 200, 255, 0.5)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/* ✅ قسم منفصل بنصف قوس على اليسار */}
                      <View style={styles.ticketStub}>
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.ticketStubGradient}
                        >
                          <Text style={styles.ticketNumber}>{stats.totalPatients}</Text>
                          <Text style={styles.ticketLabel}>Waiting</Text>
                        </LinearGradient>
                      </View>

                      <View style={styles.cardContent}>
                        <View style={styles.cardIconWrapper}>
                          <Ionicons name="pulse" size={32} color="#FFFFFF" />
                        </View>
                        <Text style={styles.cardTitle}>Timeline</Text>
                        <Text style={styles.cardSubtitle}>Patient Queue</Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                {/* Schedule card removed - Coming Soon feature */}
              </ScrollView>
            </View>
          </View>
        </View>
      </SafeAreaView>

      {/* Edit Profile Modal */}
      <Modal
      visible={showEditModal}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setShowEditModal(false)}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowEditModal(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalContent}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Profile</Text>
                <TouchableOpacity 
                  onPress={() => setShowEditModal(false)}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close" size={24} color="#2D3748" />
                </TouchableOpacity>
              </View>

              {/* Form Fields */}
              <View style={styles.formContainer}>
                {/* Name Field - Editable */}
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>الاسم:</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editedDoctorName}
                    onChangeText={setEditedDoctorName}
                    placeholder="أدخل الاسم"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                {/* Email Field - Read Only */}
                <View style={styles.formField}>
                  <Text style={styles.fieldLabel}>الإيميل:</Text>
                  <TextInput
                    style={[styles.textInput, styles.disabledInput]}
                    value={doctorEmail}
                    placeholder="لا يوجد إيميل"
                    placeholderTextColor="#9CA3AF"
                    editable={false}
                  />
                </View>

                {/* Change Password Section */}
                <View style={styles.passwordSection}>
                  <Text style={styles.sectionTitle}>تغيير كلمة المرور</Text>
                  
                  {/* Current Password */}
                  <View style={styles.formField}>
                    <Text style={styles.fieldLabel}>كلمة المرور الحالية:</Text>
                    <View style={styles.passwordInputContainer}>
                      <TextInput
                        style={styles.passwordInput}
                        value={currentPassword}
                        onChangeText={setCurrentPassword}
                        placeholder="أدخل كلمة المرور الحالية"
                        placeholderTextColor="#9CA3AF"
                        secureTextEntry={!showCurrentPassword}
                      />
                      <TouchableOpacity
                        onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                        style={styles.eyeIcon}
                      >
                        <Ionicons
                          name={showCurrentPassword ? 'eye-off' : 'eye'}
                          size={20}
                          color="#6B7280"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* New Password */}
                  <View style={styles.formField}>
                    <Text style={styles.fieldLabel}>كلمة المرور الجديدة:</Text>
                    <View style={styles.passwordInputContainer}>
                      <TextInput
                        style={styles.passwordInput}
                        value={newPassword}
                        onChangeText={setNewPassword}
                        placeholder="أدخل كلمة المرور الجديدة"
                        placeholderTextColor="#9CA3AF"
                        secureTextEntry={!showNewPassword}
                      />
                      <TouchableOpacity
                        onPress={() => setShowNewPassword(!showNewPassword)}
                        style={styles.eyeIcon}
                      >
                        <Ionicons
                          name={showNewPassword ? 'eye-off' : 'eye'}
                          size={20}
                          color="#6B7280"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Confirm Password */}
                  <View style={styles.formField}>
                    <Text style={styles.fieldLabel}>تأكيد كلمة المرور:</Text>
                    <View style={styles.passwordInputContainer}>
                      <TextInput
                        style={styles.passwordInput}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        placeholder="أعد إدخال كلمة المرور الجديدة"
                        placeholderTextColor="#9CA3AF"
                        secureTextEntry={!showConfirmPassword}
                      />
                      <TouchableOpacity
                        onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                        style={styles.eyeIcon}
                      >
                        <Ionicons
                          name={showConfirmPassword ? 'eye-off' : 'eye'}
                          size={20}
                          color="#6B7280"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Logout Button */}
                <TouchableOpacity 
                  style={styles.logoutButton}
                  onPress={() => {
                    setShowEditModal(false);
                    Alert.alert(
                      'Logout',
                      'Are you sure you want to logout?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { 
                          text: 'Logout', 
                          style: 'destructive',
                          onPress: onLogout
                        }
                      ]
                    );
                  }}
                >
                  <Text style={styles.logoutButtonText}>Logout</Text>
                </TouchableOpacity>
              </View>

              {/* Save & Cancel Buttons */}
              <View style={styles.bottomActions}>
                <TouchableOpacity 
                  style={[styles.bottomButton, styles.cancelButton]}
                  onPress={() => {
                    setEditedDoctorName(doctorName); // Reset
                    setShowEditModal(false);
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.bottomButton, styles.saveButton]}
                  onPress={async () => {
                    try {
                      // Validate password change if fields are filled
                      if (currentPassword || newPassword || confirmPassword) {
                        if (!currentPassword) {
                          Alert.alert('خطأ', 'الرجاء إدخال كلمة المرور الحالية');
                          return;
                        }
                        if (!newPassword) {
                          Alert.alert('خطأ', 'الرجاء إدخال كلمة المرور الجديدة');
                          return;
                        }
                        if (newPassword !== confirmPassword) {
                          Alert.alert('خطأ', 'كلمة المرور الجديدة وتأكيد كلمة المرور غير متطابقين');
                          return;
                        }
                        if (newPassword.length < 6) {
                          Alert.alert('خطأ', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');
                          return;
                        }

                        // Verify current password from database
                        const { data: doctorData, error: fetchError } = await supabase
                          .from('pending_doctors')
                          .select('password')
                          .eq('id', doctorId)
                          .single();

                        if (fetchError || !doctorData) {
                          Alert.alert('خطأ', 'فشل في التحقق من كلمة المرور');
                          return;
                        }

                        if (doctorData.password !== currentPassword) {
                          Alert.alert('خطأ', 'كلمة المرور الحالية غير صحيحة');
                          return;
                        }

                        // Update password in database
                        const { error: updateError } = await supabase
                          .from('pending_doctors')
                          .update({ password: newPassword })
                          .eq('id', doctorId);

                        if (updateError) {
                          Alert.alert('خطأ', 'فشل تحديث كلمة المرور');
                          return;
                        }

                        Alert.alert('نجح', 'تم تغيير كلمة المرور بنجاح!');

                        // Reset password fields after successful change
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                        setShowEditModal(false);
                        return; // Exit early after password change
                      }

                      // Update doctor name in database
                      const { error } = await supabase
                        .from('pending_doctors')
                        .update({ name: editedDoctorName })
                        .eq('id', doctorId);

                      if (error) throw error;

                      Alert.alert(
                        'نجح',
                        'تم تحديث الملف الشخصي بنجاح!',
                        [{ text: 'OK' }]
                      );

                      // Reset password fields
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                      setShowEditModal(false);
                    } catch (error) {
                      Alert.alert('خطأ', 'فشل تحديث الملف الشخصي');
                    }
                  }}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8EAF6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  gradient: {
    flex: 1,
    position: 'relative',
  },
  contentWrapper: {
    flex: 1,
  },
  blob1: {
    position: 'absolute',
    top: 100,
    right: -50,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(179, 157, 219, 0.15)',
  },
  blob2: {
    position: 'absolute',
    bottom: 150,
    left: -80,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: 'rgba(129, 212, 250, 0.12)',
  },
  blob3: {
    position: 'absolute',
    top: '50%',
    right: '20%',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(240, 98, 146, 0.1)',
  },
  content: {
    flex: 1,
  },
  // Side Avatar Header
  sideHeader: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
    borderRadius: 0,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    marginBottom: 20,
  },
  sideInfo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideDoctorName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  sideClinicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  sideClinicName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4A5568',
  },
  sideEditButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardsScrollView: {
    flex: 1,
  },
  cardsContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  floatingCard: {
    width: '95%',
    height: 130,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
  },
  cardRight: {
    marginHorizontal: -10,
  },
  cardLeft: {
    marginHorizontal: -10,
  },
  cardGradient: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  cardContent: {
    alignItems: 'flex-start',
  },
  cardIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // ✅ Ticket Stub - على اليمين
  ticketStub: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 90,
    overflow: 'hidden',
  },
  ticketStubGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255, 255, 255, 0.3)',
    borderStyle: 'dashed',
    // ✅ نصف قوس على اليسار
    borderTopLeftRadius: 100,
    borderBottomLeftRadius: 100,
  },
  ticketNumber: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  ticketLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // Modal styles
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
    gap: 16,
  },
  formField: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A5568',
    textAlign: 'right',
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
    textAlign: 'right',
  },
  disabledInput: {
    backgroundColor: 'rgba(200, 200, 200, 0.3)',
    borderColor: 'rgba(0, 0, 0, 0.05)',
    color: '#9CA3AF',
  },
  passwordSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    gap: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3748',
    textAlign: 'right',
    marginBottom: 8,
  },
  passwordInputContainer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingRight: 50,
    fontSize: 16,
    color: '#2D3748',
    textAlign: 'right',
  },
  eyeIcon: {
    position: 'absolute',
    left: 16,
    padding: 4,
  },
  logoutButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginTop: 12,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
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
    fontWeight: '600',
    color: '#10B981',
  },
});
