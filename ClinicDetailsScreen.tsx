import React, { useRef, useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, Animated, Dimensions, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from './lib/supabaseClient';
import { useAuth } from './AuthContext';

interface ClinicDetailsScreenProps {
  clinicName: string;
  clinicId: string; // UUID
  currentWaitingCount?: number;
  currentDoctorsCount?: number;
  currentTotalTreatments?: number;
  onBadgesUpdate?: (waiting: number, doctors: number, treatments: number) => void;
  onBack: () => void;
  onDoctorsPress: () => void;
  onTimelinePress: () => void;
}

const { width } = Dimensions.get('window');

export default function ClinicDetailsScreen({ 
  clinicName,
  clinicId,
  currentWaitingCount,
  currentDoctorsCount,
  currentTotalTreatments,
  onBadgesUpdate,
  onBack, 
  onDoctorsPress, 
  onTimelinePress 
}: ClinicDetailsScreenProps) {
  const { user } = useAuth();
  
  // ✅ State للـ Badges - استخدام props كـ initial value
  const [waitingPatientsCount, setWaitingPatientsCount] = useState(currentWaitingCount || 0);
  const [doctorsCount, setDoctorsCount] = useState(currentDoctorsCount || 0);
  const [totalTreatmentsCount, setTotalTreatmentsCount] = useState(currentTotalTreatments || 0);

  // ✅ حفظ آخر clinicId صالح لمنع reset الأرقام
  const lastValidClinicIdRef = useRef<string | null>(null);

  // Realtime subscriptions
  const patientsChannelRef = useRef<any>(null);
  const doctorsChannelRef = useRef<any>(null);
  const reconnectTimeoutRef = useRef<any>(null);


  // ✅ تحديث lastValidClinicId عندما يكون clinicId موجود
  useEffect(() => {
    if (clinicId) {
      lastValidClinicIdRef.current = clinicId;

      // ✅ Fetch فوري عند تغيير clinicId
      const fetchInitialData = async () => {
        if (!user || !clinicId) return;

        try {
          const today = new Date();
          const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
          const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

          // Fetch waiting patients (exclude those assigned to specific clinics)
          const { data: waitingData } = await supabase
            .from('patients')
            .select('clinic, status')
            .eq('clinic_id', clinicId)
            .neq('status', 'complete')
            .neq('status', 'na')
            .is('archive_date', null)
            .gte('registered_at', startOfDay.toISOString())
            .lte('registered_at', endOfDay.toISOString());

          const waitingCount = waitingData?.filter(p => p.clinic === 'Clinic' || !p.clinic).length || 0;

          // Fetch doctors
          const { count: doctorsCountResult } = await supabase
            .from('doctors')
            .select('*', { count: 'exact', head: true })
            .eq('clinic_id', clinicId);

          // Fetch total treatments
          const { count: treatmentsCount } = await supabase
            .from('patients')
            .select('*', { count: 'exact', head: true })
            .eq('clinic_id', clinicId)
            .eq('status', 'complete')
            .is('archive_date', null)
            .gte('completed_at', startOfDay.toISOString())
            .lte('completed_at', endOfDay.toISOString());

          setWaitingPatientsCount(waitingCount || 0);
          setDoctorsCount(doctorsCountResult || 0);
          setTotalTreatmentsCount(treatmentsCount || 0);
        } catch (error) {
          // Error handling
        }
      };

      fetchInitialData();
    }
  }, [clinicId, user]);

  // Dragon Design: Animated Blobs
  const blob1Anim = React.useState(new Animated.Value(0))[0];
  const blob2Anim = React.useState(new Animated.Value(0))[0];
  const blob3Anim = React.useState(new Animated.Value(0))[0];

  // Card animations - staggered
  const fadeAnim1 = useRef(new Animated.Value(0)).current;
  const slideAnim1 = useRef(new Animated.Value(100)).current;
  const fadeAnim2 = useRef(new Animated.Value(0)).current;
  const slideAnim2 = useRef(new Animated.Value(-100)).current;
  const fadeAnim3 = useRef(new Animated.Value(0)).current;
  const slideAnim3 = useRef(new Animated.Value(100)).current;

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

  useEffect(() => {
    // Staggered card animations
    Animated.stagger(150, [
      Animated.parallel([
        Animated.timing(fadeAnim1, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim1, {
          toValue: 0,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(fadeAnim2, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim2, {
          toValue: 0,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(fadeAnim3, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim3, {
          toValue: 0,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  // ✅ استخدام القيم الممررة من props إذا كانت موجودة
  React.useEffect(() => {
    if (currentWaitingCount !== undefined) {
      setWaitingPatientsCount(currentWaitingCount);
    }
    if (currentDoctorsCount !== undefined) {
      setDoctorsCount(currentDoctorsCount);
    }
    if (currentTotalTreatments !== undefined) {
      setTotalTreatmentsCount(currentTotalTreatments);
    }
  }, [currentWaitingCount, currentDoctorsCount, currentTotalTreatments]);
  
  // ✅ إبلاغ الصفحة الأم عندما تتغير الأرقام
  React.useEffect(() => {
    if (onBadgesUpdate) {
      onBadgesUpdate(waitingPatientsCount, doctorsCount, totalTreatmentsCount);
    }
  }, [waitingPatientsCount, doctorsCount, totalTreatmentsCount]);

  // ✅ Realtime: تحديث فوري للبيانات
  React.useEffect(() => {
    const effectiveClinicId = clinicId || lastValidClinicIdRef.current;

    if (!user || !effectiveClinicId) {
      return;
    }

    // Fetch functions
    const fetchWaitingCount = async () => {
      try {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

        const { data, error } = await supabase
          .from('patients')
          .select('clinic, status')
          .eq('clinic_id', effectiveClinicId)
          .neq('status', 'complete')
          .neq('status', 'na')
          .is('archive_date', null)
          .gte('registered_at', startOfDay.toISOString())
          .lte('registered_at', endOfDay.toISOString());

        if (!error) {
          const count = data?.filter(p => p.clinic === 'Clinic' || !p.clinic).length || 0;
          setWaitingPatientsCount(count);
        }
      } catch (error) {
        // Error handling
      }
    };

    const fetchDoctorsCount = async () => {
      try {
        const { count, error } = await supabase
          .from('doctors')
          .select('*', { count: 'exact', head: true })
          .eq('clinic_id', effectiveClinicId);

        if (!error) {
          setDoctorsCount(count || 0);
        }
      } catch (error) {
        // Error handling
      }
    };

    const fetchTreatmentsCount = async () => {
      try {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

        const { count, error } = await supabase
          .from('patients')
          .select('*', { count: 'exact', head: true })
          .eq('clinic_id', effectiveClinicId)
          .eq('status', 'complete')
          .is('archive_date', null)
          .gte('completed_at', startOfDay.toISOString())
          .lte('completed_at', endOfDay.toISOString());

        if (!error) {
          setTotalTreatmentsCount(count || 0);
        }
      } catch (error) {
        // Error handling
      }
    };

    // Initial fetch
    fetchWaitingCount();
    fetchDoctorsCount();
    fetchTreatmentsCount();

    // Cleanup previous subscriptions
    if (patientsChannelRef.current) {
      supabase.removeChannel(patientsChannelRef.current);
      patientsChannelRef.current = null;
    }
    if (doctorsChannelRef.current) {
      supabase.removeChannel(doctorsChannelRef.current);
      doctorsChannelRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Setup Realtime for patients table
    const patientsChannel = supabase
      .channel(`clinic-patients-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'patients',
          filter: `clinic_id=eq.${effectiveClinicId}`
        },
        () => {
          fetchWaitingCount();
          fetchTreatmentsCount();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          reconnectTimeoutRef.current = setTimeout(() => {
            fetchWaitingCount();
            fetchTreatmentsCount();
          }, 3000);
        }
      });

    patientsChannelRef.current = patientsChannel;

    // Setup Realtime for doctors table
    const doctorsChannel = supabase
      .channel(`clinic-doctors-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'doctors',
          filter: `clinic_id=eq.${effectiveClinicId}`
        },
        () => {
          fetchDoctorsCount();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          reconnectTimeoutRef.current = setTimeout(() => {
            fetchDoctorsCount();
          }, 3000);
        }
      });

    doctorsChannelRef.current = doctorsChannel;

    // Cleanup
    return () => {
      if (patientsChannelRef.current) {
        supabase.removeChannel(patientsChannelRef.current);
        patientsChannelRef.current = null;
      }
      if (doctorsChannelRef.current) {
        supabase.removeChannel(doctorsChannelRef.current);
        doctorsChannelRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [user, clinicId]);

  // Blob 1 animation - top-left corner (5%)
  const blob1TranslateX = blob1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 30],
  });
  const blob1TranslateY = blob1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 40],
  });

  // Blob 2 animation - middle-right (60%)
  const blob2TranslateX = blob2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -25],
  });
  const blob2TranslateY = blob2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 35],
  });

  // Blob 3 animation - bottom-center
  const blob3TranslateX = blob3Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 20],
  });
  const blob3TranslateY = blob3Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -30],
  });

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
              styles.blob,
              {
                top: '5%',
                left: '10%',
                width: 180,
                height: 180,
                backgroundColor: 'rgba(91, 159, 237, 0.15)',
                transform: [
                  { translateX: blob1TranslateX },
                  { translateY: blob1TranslateY },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.blob,
              {
                top: '60%',
                right: '5%',
                width: 220,
                height: 220,
                backgroundColor: 'rgba(168, 85, 247, 0.12)',
                transform: [
                  { translateX: blob2TranslateX },
                  { translateY: blob2TranslateY },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.blob,
              {
                bottom: '8%',
                left: '50%',
                marginLeft: -110,
                width: 200,
                height: 200,
                backgroundColor: 'rgba(236, 72, 153, 0.1)',
                transform: [
                  { translateX: blob3TranslateX },
                  { translateY: blob3TranslateY },
                ],
              },
            ]}
          />

          {/* Content Wrapper */}
          <View style={styles.contentWrapper}>
            {/* Side Header with Clinic Name */}
            <View style={styles.sideHeader}>
              <TouchableOpacity onPress={onBack} style={styles.backButton}>
                <Ionicons name="arrow-back" size={24} color="#4A5568" />
              </TouchableOpacity>
              
              <View style={styles.sideInfo}>
                <Text style={styles.sideClinicName} numberOfLines={1}>{clinicName}</Text>
              </View>
              
              <View style={{ width: 40 }} />
            </View>

            {/* Content - 3D Floating Cards */}
            <ScrollView 
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
                  onPress={() => {
                    onTimelinePress();
                  }}
                >
                  <LinearGradient
                    colors={['rgba(168, 218, 255, 0.6)', 'rgba(126, 200, 255, 0.5)']}
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
                          <Text style={styles.ticketNumber}>{waitingPatientsCount}</Text>
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

              {/* Card 2: Doctors - Left Aligned */}
              <Animated.View
                style={[
                  { opacity: fadeAnim2, transform: [{ translateX: slideAnim2 }] }
                ]}
              >
                <TouchableOpacity 
                  style={[styles.floatingCard, styles.cardLeft, { marginTop: 20 }]}
                  activeOpacity={0.85}
                  onPress={onDoctorsPress}
                >
                  <LinearGradient
                    colors={['rgba(157, 223, 206, 0.6)', 'rgba(125, 211, 189, 0.5)']}
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
                          <Text style={styles.ticketNumber}>{doctorsCount}</Text>
                          <Text style={styles.ticketLabel}>Doctors</Text>
                        </LinearGradient>
                      </View>

                    <View style={styles.cardContent}>
                      <View style={styles.cardIconWrapper}>
                        <Ionicons name="people-circle" size={32} color="#FFFFFF" />
                      </View>
                      <Text style={styles.cardTitle}>Doctors</Text>
                      <Text style={styles.cardSubtitle}>Medical Staff</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>

              {/* Card 3: Schedules - Right Aligned */}
              <Animated.View
                style={[
                  { opacity: fadeAnim3, transform: [{ translateX: slideAnim3 }] }
                ]}
              >
                <TouchableOpacity
                  style={[styles.floatingCard, styles.cardRight, { marginTop: 20 }]}
                  activeOpacity={0.85}
                  onPress={() => {
                    // TODO: Add schedules functionality
                  }}
                >
                  <LinearGradient
                    colors={['rgba(255, 212, 163, 0.6)', 'rgba(255, 199, 138, 0.5)']}
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
                        <Ionicons name="calendar-sharp" size={32} color="#FFFFFF" />
                      </View>
                      <Text style={styles.cardTitle}>Schedules</Text>
                      <Text style={styles.cardSubtitle}>Work Shifts</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            </ScrollView>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  meshGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  blob: {
    position: 'absolute',
    borderRadius: 1000,
  },
  contentWrapper: {
    flex: 1,
    paddingHorizontal: 20,
  },
  // Side Header
  sideHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 12,
    zIndex: 100,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  sideInfo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideClinicName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4A5568',
  },
  // 3D Floating Cards
  cardsScrollView: {
    flex: 1,
  },
  cardsContainer: {
    paddingHorizontal: 20,
    paddingTop: 110,
    paddingBottom: 40,
  },
  floatingCard: {
    width: '105%',
    height: 130,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#000',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 8 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.15,
    shadowRadius: Platform.OS === 'android' ? 0 : 16,
    elevation: Platform.OS === 'android' ? 0 : 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  cardRight: {
    marginHorizontal: -20,  // ✅ الكرت يخرج خارج الشاشة 20 بكسل
  },
  cardLeft: {
    marginHorizontal: -20,  // ✅ الكرت يخرج خارج الشاشة 20 بكسل
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
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#FFFFFF',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 4 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.5,
    shadowRadius: Platform.OS === 'android' ? 0 : 8,
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
  // ✅ Animated Badge Styles (نفس DoctorProfileScreen)
  badgeContainer: {
    position: 'absolute',
    right: 20,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 10,
  },
  badge: {
    width: 110,
    height: 100,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    shadowColor: Platform.OS === 'android' ? 'transparent' : '#000',
    shadowOffset: { width: 0, height: Platform.OS === 'android' ? 0 : 6 },
    shadowOpacity: Platform.OS === 'android' ? 0 : 0.3,
    shadowRadius: Platform.OS === 'android' ? 0 : 12,
    elevation: Platform.OS === 'android' ? 0 : 10,
    overflow: 'visible',
  },
  badgeNumber: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: -2,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  badgeSubtext: {
    fontSize: 8,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.95)',
    marginTop: -2,
    letterSpacing: 1,
  },
  // ✅ Ticket Stub - قسم منفصل بنصف قوس
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
