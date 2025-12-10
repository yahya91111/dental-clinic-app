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
      console.error('Error loading doctor data:', error);
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
                
                {/* Logout Button */}
                <TouchableOpacity 
                  onPress={onLogout} 
                  style={[styles.sideEditButton, { zIndex: 1 }]}
                >
                  <Ionicons name="log-out-outline" size={20} color="#4A5568" />
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
                      colors={['#B8A4E5', '#9B87D1']}
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


                {/* Card 3: Schedule - Right Aligned */}
                <Animated.View
                  style={[
                    { opacity: fadeAnim3, transform: [{ translateX: slideAnim3 }] }
                  ]}
                >
                  <TouchableOpacity 
                    style={[styles.floatingCard, styles.cardRight, { marginTop: 20 }]}
                    activeOpacity={0.85}
                    onPress={onNavigateToSchedule}
                  >
                    <LinearGradient
                      colors={['#8DD4C7', '#6BC4B5']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cardGradient}
                    >
                      {/* ✅ قسم منفصل بنصف قوس */}
                      <View style={styles.ticketStub}>
                        <LinearGradient
                          colors={['rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.ticketStubGradient}
                        >
                          <Text style={styles.ticketNumber}>{new Date().getDate()}</Text>
                          <Text style={styles.ticketLabel}>{new Date().toLocaleString('en', { month: 'short' }).toUpperCase()}</Text>
                        </LinearGradient>
                      </View>
                      
                      <View style={styles.cardContent}>
                        <View style={styles.cardIconWrapper}>
                          <Ionicons name="calendar" size={32} color="#FFFFFF" />
                        </View>
                        <Text style={styles.cardTitle}>Schedule</Text>
                        <Text style={styles.cardSubtitle}>Coming Soon</Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              </ScrollView>
            </View>
          </View>
        </View>
      </SafeAreaView>
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
});
