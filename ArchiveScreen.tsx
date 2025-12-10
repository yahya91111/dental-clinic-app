import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Modal,
  Alert,
  Platform,
  Dimensions,
  Animated,
} from 'react-native';
// Swipe gesture removed
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { shadows } from './theme';
import { supabase } from './lib/supabaseClient';
import DateTimePicker from '@react-native-community/datetimepicker';
import DoctorProfileScreen from './DoctorProfileScreen';
import { useAuth } from './AuthContext';

type Patient = {
  id: string;
  queue_number: number;
  name: string;
  clinic: string;
  condition: string;
  treatment: string;
  timestamp: Date;
  note?: string;
  status: 'waiting' | 'complete';
  is_elderly?: boolean;
  timeline: TimelineEvent[];
  doctor_name?: string;
};

type TimelineEvent = {
  type: string;
  timestamp: Date;
  details: string;
  doctor_name?: string;
};

type ArchiveScreenProps = {
  onBack: () => void;
  selectedClinicId?: number | null;
  userClinicId?: number | null; // User's clinic ID for filtering
};

export default function ArchiveScreen({ onBack, selectedClinicId, userClinicId }: ArchiveScreenProps) {
  const { user } = useAuth();
  const [showDoctorProfile, setShowDoctorProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<'archive' | 'stats'>('archive');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState<string>('All Clinics');
  const [showClinicDropdown, setShowClinicDropdown] = useState(false);
  const [archivedPatients, setArchivedPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState<string>('');

  // Stats state
  const [dateFrom, setDateFrom] = useState(new Date(new Date().setDate(new Date().getDate() - 7)));
  const [dateTo, setDateTo] = useState(new Date());
  const [showDateFromPicker, setShowDateFromPicker] = useState(false);
  const [showDateToPicker, setShowDateToPicker] = useState(false);
  const [statsData, setStatsData] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(0);
  
  // Dragon Design: Animated Blobs
  const archiveBlob1Anim = React.useState(new Animated.Value(0))[0];
  const archiveBlob2Anim = React.useState(new Animated.Value(0))[0];
  const archiveBlob3Anim = React.useState(new Animated.Value(0))[0];
  const archiveBlob4Anim = React.useState(new Animated.Value(0))[0];
  const archiveBlob5Anim = React.useState(new Animated.Value(0))[0];
  const archiveBlob6Anim = React.useState(new Animated.Value(0))[0];

  // Dragon Design: Animate blobs continuously
  React.useEffect(() => {
    // Blob 1 - Circular motion
    Animated.loop(
      Animated.sequence([
        Animated.timing(archiveBlob1Anim, {
          toValue: 1,
          duration: 9000,
          useNativeDriver: true,
        }),
        Animated.timing(archiveBlob1Anim, {
          toValue: 0,
          duration: 9000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Blob 2 - Slower circular motion
    Animated.loop(
      Animated.sequence([
        Animated.timing(archiveBlob2Anim, {
          toValue: 1,
          duration: 13000,
          useNativeDriver: true,
        }),
        Animated.timing(archiveBlob2Anim, {
          toValue: 0,
          duration: 13000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Blob 3 - Fastest circular motion
    Animated.loop(
      Animated.sequence([
        Animated.timing(archiveBlob3Anim, {
          toValue: 1,
          duration: 11000,
          useNativeDriver: true,
        }),
        Animated.timing(archiveBlob3Anim, {
          toValue: 0,
          duration: 11000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Blob 4 - Medium speed
    Animated.loop(
      Animated.sequence([
        Animated.timing(archiveBlob4Anim, {
          toValue: 1,
          duration: 10500,
          useNativeDriver: true,
        }),
        Animated.timing(archiveBlob4Anim, {
          toValue: 0,
          duration: 10500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Blob 5 - Slow motion
    Animated.loop(
      Animated.sequence([
        Animated.timing(archiveBlob5Anim, {
          toValue: 1,
          duration: 15000,
          useNativeDriver: true,
        }),
        Animated.timing(archiveBlob5Anim, {
          toValue: 0,
          duration: 15000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Blob 6 - Fast motion
    Animated.loop(
      Animated.sequence([
        Animated.timing(archiveBlob6Anim, {
          toValue: 1,
          duration: 8000,
          useNativeDriver: true,
        }),
        Animated.timing(archiveBlob6Anim, {
          toValue: 0,
          duration: 8000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);
  
  // Swipe gesture removed

  const clinics = ['All Clinics', 'Clinic 1', 'Clinic 2', 'Clinic 3', 'Clinic 4', 'Clinic 5'];

  const loadArchivedPatients = async (date: Date) => {
    try {
      setLoading(true);
      const dateStr = date.toISOString().split('T')[0];
      // ✅ استخدام selectedClinicId أولاً (للمدير العام)، ثم userClinicId
      const clinicId = selectedClinicId || userClinicId;

      let query = supabase
        .from('patients')
        .select('*') // ✅ جلب جميع الأعمدة من patients (بما فيها registered_at, clinic_entry_at, completed_at)
        .eq('archive_date', dateStr)
        .order('queue_number', { ascending: true });

      // Filter by clinic_id if available
      if (clinicId) {
        query = query.eq('clinic_id', clinicId);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data && data.length > 0) {
        const formattedPatients: Patient[] = data.map((p: any) => ({
          id: p.id,
          queue_number: p.queue_number,
          name: p.name,
          clinic: p.clinic,
          condition: p.condition || '',
          treatment: p.treatment || '',
          timestamp: new Date(p.created_at),
          note: p.note,
          status: p.status,
          is_elderly: p.is_elderly || false,
          doctor_name: p.doctor_name,
          // ✅ بناء Timeline من أعمدة patients
          timeline: [
            p.registered_at && {
              type: 'registered',
              timestamp: new Date(p.registered_at),
              details: 'Patient registered',
              doctor_name: p.doctor_name
            },
            p.clinic_entry_at && {
              type: 'clinic_entry',
              timestamp: new Date(p.clinic_entry_at),
              details: 'Entered clinic',
              doctor_name: p.doctor_name
            },
            p.completed_at && {
              type: 'completed',
              timestamp: new Date(p.completed_at),
              details: 'Treatment completed',
              doctor_name: p.doctor_name
            }
          ].filter(Boolean) as TimelineEvent[] // ✅ إزالة null/undefined
        }));
        setArchivedPatients(formattedPatients);
      } else {
        setArchivedPatients([]);
      }
    } catch (error) {
      console.error('Error loading archived patients:', error);
      Alert.alert('Error', 'Failed to load archived patients');
    } finally {
      setLoading(false);
    }
  };

  const loadStatistics = async (from: Date, to: Date) => {
    try {
      setLoading(true);
      const fromStr = from.toISOString().split('T')[0];
      const toStr = to.toISOString().split('T')[0];
      // ✅ استخدام selectedClinicId أولاً (للمدير العام)، ثم userClinicId
      const clinicId = selectedClinicId || userClinicId;

      let query = supabase
        .from('patients')
        .select('*')
        .gte('archive_date', fromStr)
        .lte('archive_date', toStr)
        .eq('status', 'complete'); // Only completed treatments

      // Filter by clinic_id if available
      if (clinicId) {
        query = query.eq('clinic_id', clinicId);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data) {
        // Calculate statistics
        const treatments: Record<string, number> = {};
        const conditions: Record<string, number> = {};
        const clinicPerformance: Record<string, number> = {};

        // فلترة المرضى الصحيحين فقط (استبعاد القيم الافتراضية)
        const validPatients = data.filter((p: any) => 
          p.treatment !== 'Treatment' && 
          p.condition !== 'Condition' && 
          p.clinic !== 'Clinic'
        );

        validPatients.forEach((p: any) => {
          // Treatments
          if (p.treatment) {
            treatments[p.treatment] = (treatments[p.treatment] || 0) + 1;
          }

          // Conditions
          if (p.condition) {
            conditions[p.condition] = (conditions[p.condition] || 0) + 1;
          }

          // Clinics
          if (p.clinic) {
            clinicPerformance[p.clinic] = (clinicPerformance[p.clinic] || 0) + 1;
          }
        });

        setStatsData({
          treatments,
          conditions,
          clinicPerformance,
          total: validPatients.length // ✅ عدد المرضى الصحيحين فقط
        });
      }
    } catch (error) {
      console.error('Error loading statistics:', error);
      Alert.alert('Error', 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (activeTab === 'archive') {
      loadArchivedPatients(selectedDate);
    } else {
      loadStatistics(dateFrom, dateTo);
    }
  }, [activeTab]);

  const filteredPatients = selectedClinic === 'All Clinics'
    ? archivedPatients
    : archivedPatients.filter(p => p.clinic === selectedClinic);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB');
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  if (showDoctorProfile) {
    return <DoctorProfileScreen onBack={() => setShowDoctorProfile(false)} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar translucent={true} backgroundColor="transparent" barStyle="dark-content" />
      {/* Gradient Mesh Background - Pink/Purple Tint */}
      <LinearGradient 
        colors={['#FFF0F5', '#F5E5FF', '#E8D5FF']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject} 
      />
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={{ flex: 1, position: 'relative' }}>
              
              {/* Animated Blobs */}
              <Animated.View 
                style={[
                  styles.archiveBlob,
                  {
                    top: '5%',
                    left: '3%',
                    width: 190,
                    height: 190,
                    backgroundColor: 'rgba(125, 211, 252, 0.15)',
                    transform: [
                      {
                        translateX: archiveBlob1Anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 25],
                        }),
                      },
                      {
                        translateY: archiveBlob1Anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -35],
                        }),
                      },
                    ],
                  },
                ]} 
              />
              <Animated.View 
                style={[
                  styles.archiveBlob,
                  {
                    top: '60%',
                    right: '5%',
                    width: 210,
                    height: 210,
                    backgroundColor: 'rgba(196, 181, 253, 0.13)',
                    transform: [
                      {
                        translateX: archiveBlob2Anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -30],
                        }),
                      },
                      {
                        translateY: archiveBlob2Anim.interpolate({
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
                  styles.archiveBlob,
                  {
                    bottom: '8%',
                    left: '50%',
                    marginLeft: -97,
                    width: 195,
                    height: 195,
                    backgroundColor: 'rgba(240, 98, 146, 0.11)',
                    transform: [
                      {
                        translateX: archiveBlob3Anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 35],
                        }),
                      },
                      {
                        translateY: archiveBlob3Anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -25],
                        }),
                      },
                    ],
                  },
                ]} 
              />
              <Animated.View 
                style={[
                  styles.archiveBlob,
                  {
                    top: '25%',
                    left: '70%',
                    width: 165,
                    height: 165,
                    backgroundColor: 'rgba(245, 158, 11, 0.12)',
                    transform: [
                      {
                        translateX: archiveBlob4Anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -22],
                        }),
                      },
                      {
                        translateY: archiveBlob4Anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 28],
                        }),
                      },
                    ],
                  },
                ]} 
              />
              <Animated.View 
                style={[
                  styles.archiveBlob,
                  {
                    top: '12%',
                    right: '20%',
                    width: 175,
                    height: 175,
                    backgroundColor: 'rgba(59, 130, 246, 0.11)',
                    transform: [
                      {
                        translateX: archiveBlob5Anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 30],
                        }),
                      },
                      {
                        translateY: archiveBlob5Anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -35],
                        }),
                      },
                    ],
                  },
                ]} 
              />
              <Animated.View 
                style={[
                  styles.archiveBlob,
                  {
                    bottom: '35%',
                    left: '10%',
                    width: 155,
                    height: 155,
                    backgroundColor: 'rgba(139, 92, 246, 0.10)',
                    transform: [
                      {
                        translateX: archiveBlob6Anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -20],
                        }),
                      },
                      {
                        translateY: archiveBlob6Anim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 25],
                        }),
                      },
                    ],
                  },
                ]} 
              />
        
        {/* Header with Tabs */}
        <View style={styles.headerContainer}>
          <View style={styles.headerTitleRow}>
            {/* ✅ زر Profile مُزال - يجب العودة للصفحة الرئيسية لفتح Profile */}
            <Text style={styles.headerTitle}>Archive & Statistics</Text>
          </View>
          
          <View style={styles.tabsContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'archive' && styles.tabActive]}
              onPress={() => setActiveTab('archive')}
            >
              <LinearGradient
                colors={activeTab === 'archive' ? ['#A78BFA', '#7DD3FC'] : ['transparent', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.tabGradient}
              >
                <Text style={[styles.tabText, activeTab === 'archive' && styles.tabTextActive]}>
                  Archive
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'stats' && styles.tabActive]}
              onPress={() => setActiveTab('stats')}
            >
              <LinearGradient
                colors={activeTab === 'stats' ? ['#A78BFA', '#7DD3FC'] : ['transparent', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.tabGradient}
              >
                <Text style={[styles.tabText, activeTab === 'stats' && styles.tabTextActive]}>
                  Statistics
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.headerDivider} />

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {activeTab === 'archive' ? (
            <>
              {/* Timeline Style Selector */}
              <View style={styles.timelineContainer}>
                {/* Step 1: Date */}
                <View style={styles.timelineStep}>
                  <TouchableOpacity onPress={() => setShowDatePicker(true)}>
                    <LinearGradient
                      colors={['#A78BFA', '#A78BFA']}
                      style={styles.timelineDot}
                    >
                      <Ionicons name="calendar" size={24} color="#FFFFFF" />
                    </LinearGradient>
                  </TouchableOpacity>
                  <Text style={styles.timelineLabel}>Date</Text>
                  <Text style={styles.timelineValue}>{formatDate(selectedDate).split(',')[0]}</Text>
                </View>

                {/* Line */}
                <View style={styles.timelineLine} />

                {/* Step 2: Clinic */}
                <View style={styles.timelineStep}>
                  <TouchableOpacity onPress={() => setShowClinicDropdown(true)}>
                    <View style={[styles.timelineDot, styles.timelineDotInactive]}>
                      <Ionicons name="medkit" size={24} color="#7DD3FC" />
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.timelineLabel}>Clinic</Text>
                  <Text style={styles.timelineValue}>{selectedClinic}</Text>
                </View>

                {/* Line */}
                <View style={styles.timelineLine} />

                {/* Step 3: Load */}
                <View style={styles.timelineStep}>
                  <TouchableOpacity onPress={() => loadArchivedPatients(selectedDate)}>
                    <View style={[styles.timelineDot, styles.timelineDotInactive]}>
                      <Ionicons name="checkmark-circle" size={24} color="#F687B3" />
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.timelineLabel}>Load</Text>
                  <Text style={styles.timelineValue}>Tap</Text>
                </View>
              </View>

              {/* Timeline Label */}
              <Text style={styles.sectionLabel}>Timeline:</Text>

              {/* Patient Cards */}
              {loading ? (
                <Text style={styles.loadingText}>Loading...</Text>
              ) : filteredPatients.length === 0 ? (
                <View style={[styles.card, shadows.medium]}>
                  <Text style={styles.emptyText}>No archived patients for this date</Text>
                </View>
              ) : (
                filteredPatients.map((patient) => {
                  const gradientColors: [string, string] = ['#B8D4F1', '#D4B8E8'];
                  
                  const cardBgColor = patient.status === 'elderly' ? '#FEF3C7' : '#FFFFFF';
                  const textColor = '#2D3748';
                  const clinicColor = '#E0F2FE';
                  const conditionColor = '#FCE7F3';
                  const treatmentColor = '#D1FAE5';
                  
                  let eventText = (event: any) => {
                    if (event.type === 'registered') return 'Patient registered';
                    if (event.type === 'clinic_entry') return 'Entered clinic'; // ✅ إضافة clinic_entry
                    if (event.type === 'clinic_assigned') return `Assigned to ${event.details}`;
                    if (event.type === 'not_available') return 'Patient not available';
                    if (event.type === 'completed') return 'Treatment completed';
                    return event.details;
                  };
                  
                  return (
                    <View key={patient.id} style={[styles.patientCard, shadows.medium]}>
                      {patient.status === 'complete' ? (
                        <LinearGradient 
                          colors={gradientColors} 
                          start={{ x: 0, y: 0 }} 
                          end={{ x: 1, y: 1 }} 
                          style={styles.patientCardContent}
                        >
                          {/* Header Row */}
                          <View style={styles.cardHeader}>
                            <View style={styles.leftSection}>
                              <View style={[styles.statusBadge, { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]}>
                                <Text style={styles.statusBadgeText}>DONE</Text>
                              </View>
                              {patient.is_elderly && (
                                <View style={[styles.statusBadge, { backgroundColor: 'rgba(251, 191, 36, 0.75)' }]}>
                                  <Text style={styles.statusBadgeText}>ELDR</Text>
                                </View>
                              )}
                              {patient.note && (
                                <TouchableOpacity 
                                  style={[styles.statusBadge, { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]}
                                  onPress={() => {
                                    setSelectedNote(patient.note || '');
                                    setShowNoteModal(true);
                                  }}
                                >
                                  <Text style={styles.statusBadgeText}>NOTE</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                            <Text style={[styles.patientName, { color: '#FFFFFF' }]}>{patient.name}</Text>
                          </View>
                        
                          <View style={[styles.divider, { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]} />
                          
                          <View style={styles.tagsRow}>
                            <View style={[styles.tag, { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]}>
                              <Text style={[styles.tagText, { color: '#FFFFFF' }]} numberOfLines={1} ellipsizeMode="tail">{patient.clinic || 'Clinic'}</Text>
                            </View>
                            <View style={[styles.tag, { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]}>
                              <Text style={[styles.tagText, { color: '#FFFFFF' }]} numberOfLines={1} ellipsizeMode="tail">{patient.condition || 'Condition'}</Text>
                            </View>
                            <View style={[styles.tag, { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]}>
                              <Text style={[styles.tagText, { color: '#FFFFFF' }]} numberOfLines={1} ellipsizeMode="tail">{patient.treatment || 'Treatment'}</Text>
                            </View>
                          </View>
                          
                          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.3)' }}>
                            {patient.timeline && patient.timeline.map((event, index) => {
                                return (
                                  <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                    <Ionicons 
                                      name={
                                        event.type === 'registered' ? 'add-circle-outline' :
                                        event.type === 'clinic_entry' ? 'enter-outline' :
                                        event.type === 'completed' ? 'checkmark-circle-outline' :
                                        'ellipse-outline'
                                      } 
                                      size={14} 
                                      color="#FFFFFF" 
                                    />
                                    <View style={{ marginLeft: 6, flex: 1 }}>
                                      <Text style={{ fontSize: 11, color: '#FFFFFF' }}>
                                        {eventText(event)}: {formatTime(event.timestamp)}
                                      </Text>
                                      {event.doctor_name && event.type === 'completed' && (
                                        <Text style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.9)', fontWeight: '600', marginTop: 2 }}>
                                          Doctor: {event.doctor_name}
                                        </Text>
                                      )}
                                    </View>
                                  </View>
                                );
                              })}
                          </View>
                        </LinearGradient>
                      ) : (
                        <LinearGradient 
                          colors={['rgba(184, 212, 241, 0.25)', 'rgba(212, 184, 232, 0.25)']} 
                          start={{ x: 0, y: 0 }} 
                          end={{ x: 1, y: 1 }} 
                          style={styles.patientCardContent}
                        >
                          {/* Header Row */}
                          <View style={styles.cardHeader}>
                            <View style={styles.leftSection}>
                              {patient.is_elderly && (
                                <View style={[styles.statusBadge, { backgroundColor: 'rgba(251, 191, 36, 0.75)' }]}>
                                  <Text style={styles.statusBadgeText}>ELDR</Text>
                                </View>
                              )}
                              {patient.status === 'na' && (
                                <View style={[styles.statusBadge, { backgroundColor: 'rgba(75, 85, 99, 0.75)' }]}>
                                  <Text style={styles.statusBadgeText}>N/A</Text>
                                </View>
                              )}
                              {patient.note && (
                                <TouchableOpacity 
                                  style={[styles.statusBadge, { backgroundColor: 'rgba(59, 130, 246, 0.5)' }]}
                                  onPress={() => {
                                    setSelectedNote(patient.note || '');
                                    setShowNoteModal(true);
                                  }}
                                >
                                  <Text style={styles.statusBadgeText}>NOTE</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                            <Text style={[styles.patientName, { color: textColor }]}>{patient.name}</Text>
                          </View>
                        
                          <View style={styles.divider} />
                          
                          <View style={styles.tagsRow}>
                            <View style={[styles.tag, { backgroundColor: 'rgba(184, 212, 241, 0.75)' }]}>
                              <Text style={[styles.tagText, patient.clinic && patient.clinic !== 'Clinic' ? { color: '#C2410C', fontWeight: '700' } : { color: '#000000', fontWeight: '700' }]} numberOfLines={1} ellipsizeMode="tail">{patient.clinic || 'Clinic'}</Text>
                            </View>
                            <View style={[styles.tag, { backgroundColor: 'rgba(200, 198, 236, 0.75)' }]}>
                              <Text style={[styles.tagText, patient.condition && patient.condition !== 'Condition' ? { color: '#C2410C', fontWeight: '700' } : { color: '#000000', fontWeight: '700' }]} numberOfLines={1} ellipsizeMode="tail">{patient.condition || 'Condition'}</Text>
                            </View>
                            <View style={[styles.tag, { backgroundColor: 'rgba(212, 184, 232, 0.75)' }]}>
                              <Text style={[styles.tagText, patient.treatment && patient.treatment !== 'Treatment' ? { color: '#C2410C', fontWeight: '700' } : { color: '#000000', fontWeight: '700' }]} numberOfLines={1} ellipsizeMode="tail">{patient.treatment || 'Treatment'}</Text>
                            </View>
                          </View>
                          
                          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
                            {patient.timeline && patient.timeline.map((event, index) => {
                                return (
                                  <View key={index} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                    <Ionicons 
                                      name={
                                        event.type === 'registered' ? 'add-circle-outline' :
                                        event.type === 'clinic_entry' ? 'enter-outline' :
                                        event.type === 'completed' ? 'checkmark-circle-outline' :
                                        'ellipse-outline'
                                      } 
                                      size={14} 
                                      color="#9CA3AF" 
                                    />
                                    <View style={{ marginLeft: 6, flex: 1 }}>
                                      <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                                        {eventText(event)}: {formatTime(event.timestamp)}
                                      </Text>
                                      {event.doctor_name && event.type === 'completed' && (
                                        <Text style={{ fontSize: 11, color: '#4B5563', fontWeight: '600', marginTop: 2 }}>
                                          Doctor: {event.doctor_name}
                                        </Text>
                                      )}
                                    </View>
                                  </View>
                                );
                              })}
                          </View>
                        </LinearGradient>
                      )}
                      
                      {/* Queue Number */}
                      <LinearGradient 
                        colors={gradientColors} 
                        start={{ x: 0, y: 0 }} 
                        end={{ x: 1, y: 1 }} 
                        style={styles.queueNumberSection}
                      >
                        <Text style={styles.queueNumberText}>{patient.queue_number === 0 ? '-' : patient.queue_number}</Text>
                      </LinearGradient>
                    </View>
                  );
                })
              )}

              {/* Read-only Badge */}
              {filteredPatients.length > 0 && (
                <View style={styles.readonlyBadge}>
                  <Text style={styles.readonlyText}>🔒 Read-only view</Text>
                </View>
              )}
            </>
          ) : (
            <>
              {/* Timeline Style: Date Range Selector */}
              <View style={styles.timelineContainer}>
                {/* Step 1: Start Date */}
                <View style={styles.timelineStep}>
                  <TouchableOpacity onPress={() => setShowDateFromPicker(true)}>
                    <LinearGradient
                      colors={['#A78BFA', '#A78BFA']}
                      style={styles.timelineDot}
                    >
                      <Ionicons name="calendar" size={24} color="#FFFFFF" />
                    </LinearGradient>
                  </TouchableOpacity>
                  <Text style={styles.timelineLabel}>From</Text>
                  <Text style={styles.timelineValue}>{formatDate(dateFrom).split(',')[0]}</Text>
                </View>

                {/* Line */}
                <View style={styles.timelineLine} />

                {/* Step 2: End Date */}
                <View style={styles.timelineStep}>
                  <TouchableOpacity onPress={() => setShowDateToPicker(true)}>
                    <LinearGradient
                      colors={['#7DD3FC', '#7DD3FC']}
                      style={styles.timelineDot}
                    >
                      <Ionicons name="calendar" size={24} color="#FFFFFF" />
                    </LinearGradient>
                  </TouchableOpacity>
                  <Text style={styles.timelineLabel}>To</Text>
                  <Text style={styles.timelineValue}>{formatDate(dateTo).split(',')[0]}</Text>
                </View>

                {/* Line */}
                <View style={styles.timelineLine} />

                {/* Step 3: Load */}
                <View style={styles.timelineStep}>
                  <TouchableOpacity onPress={() => loadStatistics(dateFrom, dateTo)}>
                    <View style={[styles.timelineDot, styles.timelineDotInactive]}>
                      <Ionicons name="checkmark-circle" size={24} color="#F687B3" />
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.timelineLabel}>Load</Text>
                  <Text style={styles.timelineValue}>Tap</Text>
                </View>
              </View>

              {loading ? (
                <Text style={styles.loadingText}>Loading...</Text>
              ) : statsData ? (
                <>
                  {/* Treatment Summary - Circular Progress Cards */}
                  <Text style={styles.sectionTitle}>💉 Treatment Summary</Text>
                  <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onScroll={(event) => {
                      const scrollPosition = event.nativeEvent.contentOffset.x;
                      const pageIndex = Math.round(scrollPosition / event.nativeEvent.layoutMeasurement.width);
                      setCurrentPage(pageIndex);
                    }}
                    scrollEventThrottle={16}
                    style={styles.horizontalScroll}
                  >
                    {(() => {
                      const treatments = Object.entries(statsData.treatments);
                      const pages = [];
                      const itemsPerPage = 4;
                      
                      for (let i = 0; i < treatments.length; i += itemsPerPage) {
                        const pageItems = treatments.slice(i, i + itemsPerPage);
                        pages.push(
                          <View key={`page-${i}`} style={styles.circularCardsPage}>
                            {pageItems.map(([treatment, count]: [string, any]) => {
                              const percentage = Math.round((count / statsData.total) * 100);
                              const treatmentColors: { [key: string]: string[] } = {
                                'Filling': ['#3B82F6', '#60A5FA'],
                                'Extraction': ['#EF4444', '#F87171'],
                                'Scaling': ['#10B981', '#34D399'],
                                'Pulpectomy': ['#8B5CF6', '#A78BFA'],
                                'Medication': ['#F59E0B', '#FBBF24'],
                                'Cementation': ['#EC4899', '#F472B6'],
                                'Referral': ['#6B7280', '#9CA3AF'],
                                'Suture Removal': ['#14B8A6', '#2DD4BF'],
                              };
                              const colors = treatmentColors[treatment] || ['#7DD3C0', '#5FBDAA'];
                              
                              return (
                                <View key={treatment} style={styles.circularCard}>
                                  <View style={styles.circularProgressContainer}>
                                    {/* Background Circle */}
                                    <View style={[styles.circularProgressBg, { borderColor: `${colors[0]}30` }]} />
                                    
                                    {/* Progress Circle */}
                                    <LinearGradient
                                      colors={colors}
                                      start={{ x: 0, y: 0 }}
                                      end={{ x: 1, y: 1 }}
                                      style={[
                                        styles.circularProgress,
                                        {
                                          transform: [
                                            { rotate: `-${90 - (percentage * 3.6)}deg` }
                                          ]
                                        }
                                      ]}
                                    />
                                    
                                    {/* Center Content */}
                                    <View style={styles.circularCenter}>
                                      <Text style={styles.circularCount}>{count}</Text>
                                      <Text style={styles.circularPercentage}>{percentage}%</Text>
                                    </View>
                                  </View>
                                  
                                  <Text style={styles.circularLabel}>{treatment}</Text>
                                </View>
                              );
                            })}
                          </View>
                        );
                      }
                      return pages;
                    })()}
                  </ScrollView>
                  
                  {/* Pagination Dots */}
                  {Object.entries(statsData.treatments).length > 4 && (
                    <View style={styles.paginationContainer}>
                      {Array.from({ length: Math.ceil(Object.entries(statsData.treatments).length / 4) }).map((_, index) => (
                        <View
                          key={index}
                          style={[
                            styles.paginationDot,
                            currentPage === index && styles.paginationDotActive
                          ]}
                        />
                      ))}
                    </View>
                  )}

                  {/* Total Patients */}
                  <View style={[styles.glassCard, { marginTop: 16, marginBottom: 24, alignItems: 'center', paddingVertical: 20 }]}>
                    <Text style={{ fontSize: 18, color: '#6B7280', fontWeight: '600', marginBottom: 8 }}>Total Patients</Text>
                    <Text style={{ fontSize: 48, fontWeight: '700', color: '#1F2937' }}>{statsData.total}</Text>
                  </View>

                  {/* Condition Breakdown */}
                  <View style={styles.glassCard}>
                    <Text style={styles.sectionTitle}>📈 Condition Breakdown</Text>
                    <View style={styles.chartContainer}>
                      {Object.entries(statsData.conditions).map(([condition, count]: [string, any], index) => {
                        const percentage = ((count / statsData.total) * 100).toFixed(0);
                        const conditionColors = ['#F687B3', '#A78BFA', '#60A5FA', '#34D399', '#FBBF24'];
                        const color = conditionColors[index % conditionColors.length];
                        return (
                          <View key={condition} style={styles.chartBar}>
                            <View
                              style={[
                                styles.bar,
                                { height: `${percentage}%` }
                              ]}
                            >
                              <LinearGradient
                                colors={[color, `${color}CC`]}
                                style={styles.barGradient}
                              >
                                <Text style={styles.barPercentage}>{percentage}%</Text>
                              </LinearGradient>
                            </View>
                            <Text style={styles.barLabel}>{condition}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  {/* Clinic Performance */}
                  <View style={styles.glassCard}>
                    <Text style={styles.sectionTitle}>🏥 Clinic Performance</Text>
                    <View style={styles.chartContainer}>
                      {Object.entries(statsData.clinicPerformance).map(([clinic, count]: [string, any], index) => {
                        const totalClinics = Object.values(statsData.clinicPerformance).reduce((a: number, b: any) => a + b, 0);
                        const percentage = ((count / totalClinics) * 100).toFixed(0);
                        const clinicColors = ['#3B82F6', '#8B5CF6', '#EC4899', '#10B981', '#F59E0B'];
                        const color = clinicColors[index % clinicColors.length];
                        return (
                          <View key={clinic} style={styles.chartBar}>
                            <View
                              style={[
                                styles.bar,
                                { height: `${percentage}%` }
                              ]}
                            >
                              <LinearGradient
                                colors={[color, `${color}CC`]}
                                style={styles.barGradient}
                              >
                                <Text style={styles.barPercentage}>{count}</Text>
                              </LinearGradient>
                            </View>
                            <Text style={styles.barLabel}>{clinic}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </>
              ) : null}
            </>
          )}
        </ScrollView>

        {/* Date Picker Modals */}
        {showDatePicker && Platform.OS === 'ios' && (
          <Modal
            transparent
            animationType="slide"
            visible={showDatePicker}
            onRequestClose={() => setShowDatePicker(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.datePickerModal}>
                <View style={styles.datePickerHeader}>
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.datePickerButton}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {
                    setShowDatePicker(false);
                    loadArchivedPatients(selectedDate);
                  }}>
                    <Text style={[styles.datePickerButton, styles.datePickerButtonDone]}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display="spinner"
                  onChange={(event, date) => {
                    if (date) {
                      setSelectedDate(date);
                    }
                  }}
                />
              </View>
            </View>
          </Modal>
        )}
        {showDatePicker && Platform.OS === 'android' && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="default"
            onChange={(event, date) => {
              setShowDatePicker(false);
              if (date) {
                setSelectedDate(date);
                loadArchivedPatients(date);
              }
            }}
          />
        )}

        {/* Date From Picker */}
        {showDateFromPicker && Platform.OS === 'ios' && (
          <Modal
            transparent
            animationType="slide"
            visible={showDateFromPicker}
            onRequestClose={() => setShowDateFromPicker(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.datePickerModal}>
                <View style={styles.datePickerHeader}>
                  <TouchableOpacity onPress={() => setShowDateFromPicker(false)}>
                    <Text style={styles.datePickerButton}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowDateFromPicker(false)}>
                    <Text style={[styles.datePickerButton, styles.datePickerButtonDone]}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={dateFrom}
                  mode="date"
                  display="spinner"
                  onChange={(event, date) => {
                    if (date) setDateFrom(date);
                  }}
                />
              </View>
            </View>
          </Modal>
        )}
        {showDateFromPicker && Platform.OS === 'android' && (
          <DateTimePicker
            value={dateFrom}
            mode="date"
            display="default"
            onChange={(event, date) => {
              setShowDateFromPicker(false);
              if (date) setDateFrom(date);
            }}
          />
        )}

        {/* Date To Picker */}
        {showDateToPicker && Platform.OS === 'ios' && (
          <Modal
            transparent
            animationType="slide"
            visible={showDateToPicker}
            onRequestClose={() => setShowDateToPicker(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.datePickerModal}>
                <View style={styles.datePickerHeader}>
                  <TouchableOpacity onPress={() => setShowDateToPicker(false)}>
                    <Text style={styles.datePickerButton}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowDateToPicker(false)}>
                    <Text style={[styles.datePickerButton, styles.datePickerButtonDone]}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={dateTo}
                  mode="date"
                  display="spinner"
                  onChange={(event, date) => {
                    if (date) setDateTo(date);
                  }}
                />
              </View>
            </View>
          </Modal>
        )}
        {showDateToPicker && Platform.OS === 'android' && (
          <DateTimePicker
            value={dateTo}
            mode="date"
            display="default"
            onChange={(event, date) => {
              setShowDateToPicker(false);
              if (date) setDateTo(date);
            }}
          />
        )}

        {/* Clinic Dropdown Modal */}
        <Modal visible={showClinicDropdown} transparent animationType="fade">
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowClinicDropdown(false)}
          >
            <View style={styles.dropdownModal}>
              {clinics.map((clinic) => (
                <TouchableOpacity
                  key={clinic}
                  style={styles.dropdownItem}
                  onPress={() => {
                    setSelectedClinic(clinic);
                    setShowClinicDropdown(false);
                  }}
                >
                  <Text style={styles.dropdownItemText}>{clinic}</Text>
                  {selectedClinic === clinic && (
                    <Ionicons name="checkmark" size={24} color="#5B9FED" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Note Modal (Read-Only) */}
        <Modal visible={showNoteModal} transparent animationType="fade">
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowNoteModal(false)}
          >
            <View style={styles.noteModal}>
              <View style={styles.noteModalHeader}>
                <Text style={styles.noteModalTitle}>Patient Note</Text>
                <TouchableOpacity onPress={() => setShowNoteModal(false)}>
                  <Ionicons name="close" size={24} color="#4A5568" />
                </TouchableOpacity>
              </View>
              <View style={styles.noteModalContent}>
                <Text style={styles.noteModalText}>{selectedNote}</Text>
              </View>
              <Text style={styles.noteModalFooter}>Read-only - Cannot be edited in Archive</Text>
            </View>
          </TouchableOpacity>
        </Modal>

        </View>
      </SafeAreaView>

      {/* Bottom Navigation - Glass Effect Updated v2.0 */}
      <View style={[styles.bottomNav, shadows.medium]}>
        <TouchableOpacity 
          style={styles.navItem}
          onPress={onBack}
        >
          <Ionicons name="home-sharp" size={26} color="#9CA3AF" />
          <Text style={styles.navLabel}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.navItem}
          onPress={() => Alert.alert('Patient File', 'This feature will be implemented soon')}
        >
          <Ionicons name="person-circle" size={28} color="#9CA3AF" />
          <Text style={styles.navLabel}>Patient File</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.navItem}
          onPress={() => Alert.alert('Appointments', 'This feature will be implemented soon')}
        >
          <Ionicons name="calendar-sharp" size={26} color="#9CA3AF" />
          <Text style={styles.navLabel}>Appointments</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="archive-sharp" size={26} color="#7DD3C0" />
          <Text style={[styles.navLabel, styles.navLabelActive]}>Archive</Text>
        </TouchableOpacity>
      </View>
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
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 25,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',  // ✅ توسيط العنوان
    marginBottom: 20,
  },
  doctorProfileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(229, 231, 235, 0.5)',
    marginHorizontal: 20,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2D3748',
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: 15,
  },
  tab: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  tabActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderColor: 'rgba(167, 139, 250, 0.6)',
    shadowColor: '#A78BFA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  tabGradient: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#718096',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 30,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  cardLabel: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 10,
  },
  dateButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  dateText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2D3748',
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  dropdownText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2D3748',
  },
  sectionLabel: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 15,
    marginLeft: 5,
  },
  loadingText: {
    textAlign: 'center',
    color: '#718096',
    fontSize: 16,
    marginTop: 40,
  },
  emptyText: {
    textAlign: 'center',
    color: '#718096',
    fontSize: 16,
  },
  patientCardWrapper: {
    flexDirection: 'row',
    marginBottom: 16,
    borderRadius: 18,
    overflow: 'hidden',
  },
  patientCard: {
    flexDirection: 'row',
    marginBottom: 16,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    shadowColor: '#5B9FED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  patientCardContent: {
    flex: 1,
    padding: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    minWidth: 50,
    maxWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  menuButton: {
    padding: 4,
  },
  menuIcon: {
    fontSize: 24,
    fontWeight: '700',
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 4,
  },
  tag: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A5568',
    textAlign: 'center',
  },
  timelineSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineMarker: {
    alignItems: 'center',
    marginRight: 12,
    width: 20,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 4,
  },
  timelineEventText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  timelineTimeText: {
    fontSize: 12,
    fontWeight: '400',
  },
  queueNumberSection: {
    width: 50,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  queueNumberText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  patientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  patientName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3748',
    letterSpacing: 0.3,
    fontFamily: 'Cairo-Bold',
    marginLeft: 70,
    marginRight: 20,
  },
  doctorName: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  queueBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#5B9FED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  queueNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#7DD3C0',
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 10,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  divider: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    marginBottom: 6,
  },
  dividerOld: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginBottom: 6,
  },

  readonlyBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#F59E0B',
    paddingHorizontal: 15,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    marginBottom: 30,
  },
  readonlyText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: 'bold',
  },
  dateRangeContainer: {
    flexDirection: 'row',
    gap: 15,
    marginBottom: 15,
  },
  dateRangeButton: {
    flex: 1,
    backgroundColor: '#F0F9FF',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#5B9FED',
    padding: 12,
  },
  dateRangeLabel: {
    fontSize: 12,
    color: '#718096',
    marginBottom: 5,
  },
  dateRangeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2D3748',
  },
  loadButton: {
    backgroundColor: '#F687B3',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  loadButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 15,
  },
  statItem: {
    marginBottom: 20,
  },
  statLabel: {
    fontSize: 14,
    color: '#2D3748',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#5B9FED',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  progressBar: {
    height: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  clinicItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  clinicBadge: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 15,
  },
  clinicBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  clinicCount: {
    fontSize: 14,
    color: '#2D3748',
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 200,
    paddingTop: 20,
  },
  chartBar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginHorizontal: 5,
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 10,
    minHeight: 40,
  },
  barPercentage: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  barGradient: {
    width: '100%',
    height: '100%',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 10,
  },
  barLabel: {
    fontSize: 11,
    color: '#2D3748',
    marginTop: 8,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 10,
    width: '80%',
    maxHeight: '60%',
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#2D3748',
  },
  
  // Bottom Navigation
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
    fontWeight: '700',
  },
  // Timeline Style
  timelineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 30,
    paddingHorizontal: 20,
    marginBottom: 20,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  timelineStep: {
    alignItems: 'center',
    flex: 1,
  },
  timelineDot: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#A78BFA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  timelineDotInactive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#CBD5E0',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  timelineLine: {
    width: 40,
    height: 3,
    backgroundColor: '#CBD5E0',
    marginHorizontal: -10,
  },
  timelineLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D3748',
    marginTop: 8,
  },
  timelineValue: {
    fontSize: 12,
    color: '#718096',
    marginTop: 4,
  },
  // Date Picker Modal
  datePickerModal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  datePickerButton: {
    fontSize: 16,
    color: '#5B9FED',
    fontWeight: '600',
  },
  datePickerButtonDone: {
    fontWeight: '700',
  },
  
  // Circular Progress Cards
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 20,
    marginLeft: 5,
  },
  horizontalScroll: {
    marginBottom: 20,
  },
  circularCardsPage: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    width: Dimensions.get('window').width,
  },
  circularCard: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  circularProgressContainer: {
    width: 100,
    height: 100,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  circularProgressBg: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 8,
    borderColor: '#E5E7EB',
  },
  circularProgress: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 8,
    borderColor: 'transparent',
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  circularCenter: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circularCount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2D3748',
  },
  circularPercentage: {
    fontSize: 12,
    color: '#718096',
    marginTop: 2,
  },
  circularLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A5568',
    textAlign: 'center',
  },
  
  // Pagination Dots
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    gap: 8,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  paginationDotActive: {
    width: 24,
    backgroundColor: '#7DD3C0',
    borderColor: '#7DD3C0',
  },
  
  // Note Modal (Read-Only)
  noteModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '85%',
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  noteModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#E5E7EB',
  },
  noteModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D3748',
  },
  noteModalContent: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    minHeight: 100,
  },
  noteModalText: {
    fontSize: 16,
    color: '#4A5568',
    lineHeight: 24,
  },
  noteModalFooter: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  archiveBlob: {
    position: 'absolute',
    borderRadius: 100,
  },
});
