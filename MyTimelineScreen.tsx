import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Modal,
  TextInput,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from './AuthContext';
import DoctorProfileScreen from './DoctorProfileScreen';
import MyStatisticsScreen from './MyStatisticsScreen';

// Supabase setup
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Color definitions
const CLINICS = [
  { name: 'Clinic', id: 0, color: '#E5E7EB' },
  { name: 'Clinic 1', id: 1, color: '#C8F5E0' },
  { name: 'Clinic 2', id: 2, color: '#C4D9F5' },
  { name: 'Clinic 3', id: 3, color: '#E8D4F5' },
  { name: 'Clinic 4', id: 4, color: '#FFD9C4' },
  { name: 'Clinic 5', id: 5, color: '#FFC4E0' },
];

const CONDITIONS = [
  { name: 'Condition', color: '#E5E7EB' },
  { name: 'Checkup', color: '#6EE7B7' },
  { name: 'Pain', color: '#6EE7B7' },
  { name: 'Broken Tooth', color: '#6EE7B7' },
  { name: 'Others', color: '#6EE7B7' },
];

const TREATMENTS = [
  { name: 'Treatment', color: '#E5E7EB' },
  { name: 'Examination', color: '#A7F3D0' },
  { name: 'Scaling', color: '#A7F3D0' },
  { name: 'Filling', color: '#A7F3D0' },
  { name: 'Extraction', color: '#A7F3D0' },
  { name: 'Pulpectomy', color: '#A7F3D0' },
  { name: 'Medication', color: '#A7F3D0' },
  { name: 'Suture Removal', color: '#A7F3D0' },
  { name: 'Cementation', color: '#A7F3D0' },
  { name: 'Referral', color: '#A7F3D0' },
];

interface Patient {
  id: string;
  queue_number: number;
  name: string;
  age: number;
  clinic_id?: number;
  clinic?: string;
  condition?: string;
  treatment?: string;
  timestamp: Date;
  note?: string;
  status?: 'normal' | 'na' | 'elderly' | 'complete';
  virtual_center_id?: string;
  doctor_id?: string;
  isElderly?: boolean;
  registered_at?: Date;
  clinic_entry_at?: Date;
  completed_at?: Date;
}

interface MyTimelineScreenProps {
  onBack: () => void;
}

export default function MyTimelineScreen({ onBack }: MyTimelineScreenProps) {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientQueueNumber, setNewPatientQueueNumber] = useState('');
  const [newPatientCondition, setNewPatientCondition] = useState('Condition');
  const [newPatientTreatment, setNewPatientTreatment] = useState('Treatment');
  const [isElderly, setIsElderly] = useState(false);
  const [newPatientNote, setNewPatientNote] = useState('');
  const [showConditionDropdown, setShowConditionDropdown] = useState(false);
  const [showTreatmentDropdown, setShowTreatmentDropdown] = useState(false);
  const [menuPatientId, setMenuPatientId] = useState<string | null>(null);
  const [notePatientId, setNotePatientId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editFieldModalVisible, setEditFieldModalVisible] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'clinic' | 'condition' | 'treatment' | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [filterWaitingOnly, setFilterWaitingOnly] = useState(false);
  const [showDoctorProfile, setShowDoctorProfile] = useState(false);
  const [showMyStatistics, setShowMyStatistics] = useState(false);
  
  // Animated values for blobs
  const blob1Anim = useRef(new Animated.Value(0)).current;
  const blob2Anim = useRef(new Animated.Value(0)).current;
  const blob3Anim = useRef(new Animated.Value(0)).current;

  // Start blob animations
  useEffect(() => {
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

  // Fetch patients by virtual_center_id
  useEffect(() => {
    if (!user?.id) return;
    fetchPatients();
  }, [user]);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      
      // Check if user is a pending doctor (has virtualCenterId)
      const isPendingDoctor = user?.virtualCenterId != null;
      
      const { data, error } = await supabase
        .from(isPendingDoctor ? 'pending_patients' : 'patients')
        .select('*')
        .eq(isPendingDoctor ? 'pending_doctor_id' : 'virtual_center_id', user?.id)
        .order('queue_number', { ascending: true });

      if (error) throw error;

      const formattedPatients = data.map((p: any) => ({
        ...p,
        timestamp: new Date(p.timestamp),
        registered_at: p.registered_at ? new Date(p.registered_at) : undefined,
        clinic_entry_at: p.clinic_entry_at ? new Date(p.clinic_entry_at) : undefined,
        completed_at: p.completed_at ? new Date(p.completed_at) : undefined,
      }));

      setPatients(formattedPatients);
    } catch (error) {
      console.error('Error fetching patients:', error);
    } finally {
      setLoading(false);
    }
  };

  // Convert Arabic numerals to English numerals
  const convertArabicToEnglishNumbers = (str: string): string => {
    const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    const englishNumerals = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    
    let result = str;
    for (let i = 0; i < arabicNumerals.length; i++) {
      result = result.replace(new RegExp(arabicNumerals[i], 'g'), englishNumerals[i]);
    }
    return result;
  };

  const handleAddPatient = async () => {
    if (!newPatientName.trim()) {
      Alert.alert('Error', 'Please enter patient name');
      return;
    }

    try {
      // Ensure queue_number is always a valid integer
      let queueNumber = 1;
      if (newPatientQueueNumber && newPatientQueueNumber.trim() !== '') {
        // Convert Arabic numerals to English before parsing
        const englishNumber = convertArabicToEnglishNumbers(newPatientQueueNumber);
        queueNumber = parseInt(englishNumber);
        if (isNaN(queueNumber) || queueNumber < 1) {
          queueNumber = patients.length + 1;
        }
      } else {
        queueNumber = patients.length + 1;
      }
      
      // Check if user is a pending doctor (has virtualCenterId)
      const isPendingDoctor = user?.virtualCenterId != null;
      
      const { data, error } = await supabase
        .from(isPendingDoctor ? 'pending_patients' : 'patients')
        .insert([
          {
            name: newPatientName,
            queue_number: queueNumber,
            condition: newPatientCondition !== 'Condition' ? newPatientCondition : null,
            treatment: newPatientTreatment !== 'Treatment' ? newPatientTreatment : null,
            note: newPatientNote || null,
            status: isElderly ? 'elderly' : 'normal',
            // Use correct foreign key based on doctor type
            ...(isPendingDoctor 
              ? { pending_doctor_id: user?.id }
              : { virtual_center_id: user?.id, doctor_id: user?.id }
            ),
          },
        ])
        .select();

      if (error) throw error;

      setShowAddModal(false);
      setNewPatientName('');
      setNewPatientQueueNumber('');
      setNewPatientCondition('Condition');
      setNewPatientTreatment('Treatment');
      setIsElderly(false);
      setNewPatientNote('');
      fetchPatients();
    } catch (error) {
      console.error('Error adding patient:', error);
      Alert.alert('Error', 'Failed to add patient');
    }
  };

  const handleMenuAction = async (action: 'done' | 'na' | 'elderly' | 'archive' | 'delete') => {
    if (!menuPatientId) return;

    try {
      // Check if user is a pending doctor
      const isPendingDoctor = user?.virtualCenterId != null;
      const tableName = isPendingDoctor ? 'pending_patients' : 'patients';
      
      if (action === 'delete') {
        await supabase.from(tableName).delete().eq('id', menuPatientId);
      } else if (action === 'done') {
        const patient = patients.find(p => p.id === menuPatientId);
        // Toggle: if already complete, revert to normal
        await supabase
          .from(tableName)
          .update({
            status: patient?.status === 'complete' ? 'normal' : 'complete',
            completed_at: patient?.status === 'complete' ? null : new Date().toISOString(),
          })
          .eq('id', menuPatientId);
      } else if (action === 'na') {
        await supabase
          .from(tableName)
          .update({ status: 'na' })
          .eq('id', menuPatientId);
      } else if (action === 'elderly') {
        const patient = patients.find(p => p.id === menuPatientId);
        await supabase
          .from(tableName)
          .update({ 
            status: patient?.status === 'elderly' ? 'normal' : 'elderly'
          })
          .eq('id', menuPatientId);
      }

      setMenuPatientId(null);
      fetchPatients();
    } catch (error) {
      console.error('Error updating patient:', error);
    }
  };

  const handleSaveNote = async () => {
    if (!notePatientId) return;

    try {
      // Check if user is a pending doctor
      const isPendingDoctor = user?.virtualCenterId != null;
      const tableName = isPendingDoctor ? 'pending_patients' : 'patients';
      
      await supabase
        .from(tableName)
        .update({ note: noteText })
        .eq('id', notePatientId);

      setShowNoteModal(false);
      setNoteText('');
      setNotePatientId(null);
      fetchPatients();
    } catch (error) {
      console.error('Error saving note:', error);
    }
  };

  const handleEditField = (patientId: string, field: 'clinic' | 'condition' | 'treatment') => {
    setEditingPatientId(patientId);
    setEditingField(field);
    setEditFieldModalVisible(true);
  };

  const handleSaveField = async (value: string) => {
    if (!editingPatientId || !editingField) return;

    try {
      // Check if user is a pending doctor
      const isPendingDoctor = user?.virtualCenterId != null;
      const tableName = isPendingDoctor ? 'pending_patients' : 'patients';
      
      const updateData: any = {};
      
      if (editingField === 'clinic') {
        updateData.clinic = value;
        if (value !== 'Clinic') {
          updateData.clinic_entry_at = new Date().toISOString();
        }
      } else if (editingField === 'condition') {
        updateData.condition = value;
      } else if (editingField === 'treatment') {
        updateData.treatment = value;
      }

      await supabase
        .from(tableName)
        .update(updateData)
        .eq('id', editingPatientId);

      setEditFieldModalVisible(false);
      setEditingPatientId(null);
      setEditingField(null);
      fetchPatients();
    } catch (error) {
      console.error('Error updating field:', error);
    }
  };

  // Calculate stats
  const totalPatients = patients.length;
  const waitingPatients = patients.filter(p => p.status !== 'complete').length;

  // Filter patients
  const filteredPatients = filterWaitingOnly
    ? patients.filter(p => p.status !== 'complete')
    : patients;

  // Blob animations
  const blob1TranslateX = blob1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 100],
  });
  const blob1TranslateY = blob1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -50],
  });

  const blob2TranslateX = blob2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -80],
  });
  const blob2TranslateY = blob2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 60],
  });

  const blob3TranslateX = blob3Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 50],
  });
  const blob3TranslateY = blob3Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 80],
  });

  // Show My Statistics
  if (showMyStatistics) {
    return (
      <MyStatisticsScreen
        onBack={() => setShowMyStatistics(false)}
        userClinicId={null}
      />
    );
  }

  // Show Doctor Profile
  if (showDoctorProfile) {
    return (
      <DoctorProfileScreen
        onBack={() => setShowDoctorProfile(false)}
        onOpenMyStatistics={() => {
          setShowDoctorProfile(false);
          setShowMyStatistics(true);
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
      {/* Gradient Mesh Background - Pink/Purple Tint - مطابق App.tsx */}
      <LinearGradient
        colors={['#FFF0F5', '#F5E5FF', '#E8D5FF']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Animated Blobs - مطابق App.tsx */}
      <Animated.View
        style={[
          styles.blob,
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
          {
            top: '65%',
            right: '2%',
            width: 220,
            height: 220,
            backgroundColor: 'rgba(168, 85, 247, 0.12)',
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
                  outputRange: [0, -35],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.blob,
          {
            bottom: '12%',
            left: '8%',
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

      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <View style={styles.profileButtonGlass}>
              <View style={styles.profileButtonInnerGlow} />
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" style={{ zIndex: 10 }} />
            </View>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Dental Clinic</Text>
            <Text style={styles.headerSubtitle}>My Practice - {user?.user_metadata?.full_name || 'Doctor'}</Text>
          </View>

          <View style={{ width: 50 }} />
        </View>

        {/* Statistics */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="tooth-outline" size={48} color="#9CA3AF" style={{ marginBottom: 8 }} />
            <Text style={styles.statLabel}>Total Patients</Text>
            <Text style={styles.statValue}>{totalPatients}</Text>
          </View>
          <TouchableOpacity
            style={[styles.statCard, filterWaitingOnly && styles.statCardActive]}
            onPress={() => setFilterWaitingOnly(!filterWaitingOnly)}
          >
            <Ionicons name="person-outline" size={48} color={filterWaitingOnly ? '#7DD3C0' : '#9CA3AF'} style={{ marginBottom: 8 }} />
            <Text style={[styles.statLabel, filterWaitingOnly && styles.statLabelActive]}>Waiting</Text>
            <Text style={[styles.statValue, filterWaitingOnly && styles.statValueActive]}>{waitingPatients}</Text>
          </TouchableOpacity>
        </View>

        {/* Queue Header */}
        <View style={styles.queueHeader}>
          <View style={styles.queueTitleContainer}>
            <Text style={styles.queueTitle}>Queue</Text>
            <TouchableOpacity style={styles.minimizeButton} onPress={() => {}}>
              <View style={styles.minimizeButtonInnerGlow} />
              <Ionicons 
                name="chevron-up" 
                size={24} 
                color="#FFFFFF" 
                style={{ 
                  textShadowColor: 'rgba(0, 0, 0, 0.3)', 
                  textShadowOffset: { width: 0, height: 2 }, 
                  textShadowRadius: 5,
                  zIndex: 10 
                }}
              />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.viewDetailsHeaderButton}
            onPress={() => setExpandedCardId(expandedCardId ? null : 'header')}
          >
            <Text style={styles.viewDetailsHeaderText}>
              {expandedCardId === 'header' ? '▲ Hide Details' : '▼ View Details'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Expandable Options */}
        {expandedCardId === 'header' && (
          <View style={styles.headerExpandableSection}>
            <TouchableOpacity
              style={[styles.headerOptionButton, showTimeline && styles.headerOptionButtonActive]}
              onPress={() => {
                setShowTimeline(!showTimeline);
                setExpandedCardId(null);
              }}
            >
              <Ionicons name="time-outline" size={20} color={showTimeline ? '#7DD3C0' : '#6B7280'} />
              <Text style={[styles.headerOptionText, showTimeline && styles.headerOptionTextActive]}>
                {showTimeline ? 'Hide Timeline' : 'Show Timeline'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Patient List */}
        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 120 }}>
          {filteredPatients.map((patient) => {
            // Determine gradient colors based on status
            const gradientColors: [string, string] = patient.status === 'complete'
              ? ['#B8D4F1', '#D4B8E8'] // Solid gradient for DONE
              : ['rgba(184, 212, 241, 0.25)', 'rgba(212, 184, 232, 0.25)']; // Glass effect
            
            const textColor = patient.status === 'complete' ? '#FFFFFF' : '#4A5568';
            
            return (
            <View key={patient.id} style={styles.patientCardWrapper}>
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.patientCardContent}
              >
                {/* Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.leftSection}>
                    <TouchableOpacity style={styles.menuButton} onPress={() => setMenuPatientId(patient.id)}>
                      <Text style={[styles.menuIcon, { color: textColor }]}>⋮</Text>
                    </TouchableOpacity>

                    {patient.status === 'complete' && (
                      <View style={[styles.statusBadge, { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]}>
                        <Text style={styles.statusBadgeText}>DONE</Text>
                      </View>
                    )}
                    {patient.status === 'elderly' && (
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
                        style={[styles.statusBadge, { backgroundColor: patient.status === 'complete' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(59, 130, 246, 0.5)' }]}
                        onPress={() => {
                          setNotePatientId(patient.id);
                          setNoteText(patient.note || '');
                          setShowNoteModal(true);
                        }}
                      >
                        <Text style={styles.statusBadgeText}>NOTE</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={[styles.patientName, { color: textColor }]}>{patient.name}</Text>
                </View>

                {/* Divider */}
                <View style={[styles.divider, patient.status === 'complete' && { backgroundColor: 'rgba(255, 255, 255, 0.3)' }]} />

                {/* Tags */}
                <View style={styles.tagsRow}>
                  <TouchableOpacity
                    style={[styles.tag, { backgroundColor: patient.status === 'complete' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(184, 212, 241, 0.75)' }]}
                    onPress={() => handleEditField(patient.id, 'clinic')}
                  >
                    <Text style={[
                      styles.tagText,
                      patient.status === 'complete' 
                        ? { color: '#FFFFFF', fontWeight: '700' }
                        : (patient.clinic && patient.clinic !== 'Clinic' ? { color: '#C2410C', fontWeight: '700' } : { color: '#000000', fontWeight: '700' })
                    ]} numberOfLines={1} ellipsizeMode="tail">{patient.clinic || 'Clinic'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tag, { backgroundColor: patient.status === 'complete' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(200, 198, 236, 0.75)' }]}
                    onPress={() => handleEditField(patient.id, 'condition')}
                  >
                    <Text style={[
                      styles.tagText,
                      patient.status === 'complete' 
                        ? { color: '#FFFFFF', fontWeight: '700' }
                        : (patient.condition && patient.condition !== 'Condition' ? { color: '#C2410C', fontWeight: '700' } : { color: '#000000', fontWeight: '700' })
                    ]} numberOfLines={1} ellipsizeMode="tail">{patient.condition || 'Condition'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tag, { backgroundColor: patient.status === 'complete' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(212, 184, 232, 0.75)' }]}
                    onPress={() => handleEditField(patient.id, 'treatment')}
                  >
                    <Text style={[
                      styles.tagText,
                      patient.status === 'complete' 
                        ? { color: '#FFFFFF', fontWeight: '700' }
                        : (patient.treatment && patient.treatment !== 'Treatment' ? { color: '#C2410C', fontWeight: '700' } : { color: '#000000', fontWeight: '700' })
                    ]} numberOfLines={1} ellipsizeMode="tail">{patient.treatment || 'Treatment'}</Text>
                  </TouchableOpacity>
                </View>

                {/* Timeline */}
                {showTimeline && (
                  <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
                    {patient.registered_at && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <Ionicons name="add-circle-outline" size={14} color="#9CA3AF" />
                        <Text style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 6 }}>
                          Registered: {patient.registered_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </Text>
                      </View>
                    )}
                    {patient.clinic_entry_at && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <Ionicons name="enter-outline" size={14} color="#9CA3AF" />
                        <Text style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 6 }}>
                          Entered Clinic: {patient.clinic_entry_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </Text>
                      </View>
                    )}
                    {patient.completed_at && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <Ionicons name="checkmark-circle-outline" size={14} color="#9CA3AF" />
                        <Text style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 6 }}>
                          Completed: {patient.completed_at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </LinearGradient>

              {/* Queue Number */}
              <LinearGradient
                colors={['rgba(184, 212, 241, 0.75)', 'rgba(212, 184, 232, 0.75)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.queueNumberSection}
              >
                <Text style={styles.queueNumberText}>{patient.queue_number}</Text>
              </LinearGradient>
            </View>
            );
          })}
        </ScrollView>

        {/* FAB - ✅ مطابق 100% لـ App.tsx */}
        <TouchableOpacity style={styles.fab} onPress={() => setShowAddModal(true)}>
          <View style={styles.fabGlass}>
            <View style={styles.fabInnerGlow} />
            <Text style={styles.fabIcon}>+</Text>
          </View>
        </TouchableOpacity>

        {/* Bottom Navigation */}
        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navItem}>
            <Ionicons name="home" size={26} color="#7DD3C0" />
            <Text style={[styles.navLabel, styles.navLabelActive]}>Home</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => Alert.alert('Coming Soon', 'Patient File feature is under development')}>
            <Ionicons name="document-text-outline" size={26} color="#9CA3AF" />
            <Text style={styles.navLabel}>Patient File</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => Alert.alert('Coming Soon', 'Appointments feature is under development')}>
            <Ionicons name="calendar-outline" size={26} color="#9CA3AF" />
            <Text style={styles.navLabel}>Appointments</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => Alert.alert('Coming Soon', 'Archive feature is under development')}>
            <Ionicons name="archive-sharp" size={26} color="#9CA3AF" />
            <Text style={styles.navLabel}>Archive</Text>
          </TouchableOpacity>
        </View>

        {/* Menu Modal - مطابق App.tsx */}
        {menuPatientId && (
          <Modal visible={true} animationType="fade" transparent onRequestClose={() => setMenuPatientId(null)}>
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setMenuPatientId(null)}
            >
              <LinearGradient
                colors={['rgba(184, 212, 241, 0.95)', 'rgba(212, 184, 232, 0.95)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.menuModal}
              >
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    const patient = patients.find(p => p.id === menuPatientId);
                    if (patient) {
                      setNotePatientId(patient.id);
                      setNoteText(patient.note || '');
                      setShowNoteModal(true);
                      setMenuPatientId(null);
                    }
                  }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255, 255, 255, 0.5)', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="document-text" size={22} color="#3B82F6" />
                  </View>
                  <Text style={styles.menuItemText}>Note</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleMenuAction('na')}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255, 255, 255, 0.5)', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="person-remove" size={22} color="#6B7280" />
                  </View>
                  <Text style={styles.menuItemText}>Patient N/A</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleMenuAction('elderly')}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255, 255, 255, 0.5)', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="man" size={22} color="#F97316" />
                  </View>
                  <Text style={styles.menuItemText}>Elderly</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleMenuAction('done')}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255, 255, 255, 0.5)', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="checkmark-circle" size={22} color="#22C55E" />
                  </View>
                  <Text style={styles.menuItemText}>Treatment Done</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleMenuAction('delete')}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255, 255, 255, 0.5)', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="trash" size={22} color="#EF4444" />
                  </View>
                  <Text style={styles.menuItemText}>Delete</Text>
                </TouchableOpacity>
              </LinearGradient>
            </TouchableOpacity>
          </Modal>
        )}

        {/* Note Modal - مطابق App.tsx */}
        <Modal visible={showNoteModal} animationType="fade" transparent onRequestClose={() => setShowNoteModal(false)}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <LinearGradient
                  colors={['rgba(184, 212, 241, 0.95)', 'rgba(212, 184, 232, 0.95)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalContent}
                >
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Patient Note</Text>
                    <TouchableOpacity onPress={() => setShowNoteModal(false)}>
                      <Ionicons name="close" size={28} color="#4A5568" />
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    style={[styles.textInput, styles.textArea]}
                    placeholder="Enter note..."
                    value={noteText}
                    onChangeText={setNoteText}
                    multiline
                    numberOfLines={5}
                    autoFocus
                  />

                  <TouchableOpacity style={styles.addButton} onPress={handleSaveNote}>
                    <LinearGradient
                      colors={['#A855F7', '#D4B8E8']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.addButtonGradient}
                    >
                      <Text style={styles.addButtonText}>Save Note</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </LinearGradient>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Edit Field Modal - مطابق App.tsx */}
        <Modal visible={editFieldModalVisible} animationType="fade" transparent onRequestClose={() => setEditFieldModalVisible(false)}>
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setEditFieldModalVisible(false)}
          >
            <LinearGradient
              colors={['rgba(184, 212, 241, 0.95)', 'rgba(212, 184, 232, 0.95)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.beautifulModal}
            >
              <Text style={styles.modalHeaderTitle}>
                Select {editingField === 'clinic' ? 'Clinic' : editingField === 'condition' ? 'Condition' : 'Treatment'}
              </Text>
              <View style={styles.modalDivider} />
              <ScrollView style={styles.modalScrollView}>
                {editingField === 'clinic' && CLINICS.map((clinic) => (
                  <TouchableOpacity
                    key={clinic.id}
                    style={styles.beautifulDropdownItem}
                    onPress={() => handleSaveField(clinic.name)}
                  >
                    <View style={[styles.colorDot, { backgroundColor: '#D4B8E8' }]} />
                    <Text style={styles.beautifulDropdownText}>{clinic.name}</Text>
                  </TouchableOpacity>
                ))}
                {editingField === 'condition' && CONDITIONS.map((condition, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.beautifulDropdownItem}
                    onPress={() => handleSaveField(condition.name)}
                  >
                    <View style={[styles.colorDot, { backgroundColor: '#D4B8E8' }]} />
                    <Text style={styles.beautifulDropdownText}>{condition.name}</Text>
                  </TouchableOpacity>
                ))}
                {editingField === 'treatment' && TREATMENTS.map((treatment, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.beautifulDropdownItem}
                    onPress={() => handleSaveField(treatment.name)}
                  >
                    <View style={[styles.colorDot, { backgroundColor: '#D4B8E8' }]} />
                    <Text style={styles.beautifulDropdownText}>{treatment.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </LinearGradient>
          </TouchableOpacity>
        </Modal>

        {/* Add Patient Modal */}
        <Modal visible={showAddModal} animationType="fade" transparent onRequestClose={() => setShowAddModal(false)}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <LinearGradient
                  colors={['rgba(184, 212, 241, 0.95)', 'rgba(212, 184, 232, 0.95)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.addModalContent}
                >
                  <View style={styles.addModalHeader}>
                    <Text style={styles.addModalTitle}>Add New Patient</Text>
                    <TouchableOpacity onPress={() => setShowAddModal(false)}>
                      <Ionicons name="close" size={28} color="#4A5568" />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.inputLabel}>Patient Name:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Patient Name"
                    value={newPatientName}
                    onChangeText={setNewPatientName}
                    returnKeyType="done"
                  />

                  <Text style={styles.inputLabel}>Queue Number:</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Queue Number"
                    value={newPatientQueueNumber}
                    onChangeText={setNewPatientQueueNumber}
                    keyboardType="numeric"
                    returnKeyType="done"
                  />

                  <Text style={styles.inputLabel}>Condition:</Text>
                  <TouchableOpacity
                    style={styles.textInput}
                    onPress={() => setShowConditionDropdown(!showConditionDropdown)}
                  >
                    <Text style={styles.dropdownButtonText}>{newPatientCondition}</Text>
                  </TouchableOpacity>
                  {showConditionDropdown && (
                    <View style={styles.dropdownList}>
                      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true}>
                        {CONDITIONS.map((condition, index) => (
                          <TouchableOpacity
                            key={condition.name}
                            style={[
                              styles.dropdownItem,
                              newPatientCondition === condition.name && styles.dropdownItemSelected
                            ]}
                            onPress={() => {
                              setNewPatientCondition(condition.name);
                              setShowConditionDropdown(false);
                            }}
                          >
                            <Text style={[
                              styles.dropdownItemText,
                              newPatientCondition === condition.name && styles.dropdownItemTextSelected
                            ]}>{condition.name}</Text>
                            {newPatientCondition === condition.name && (
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
                    onPress={() => setShowTreatmentDropdown(!showTreatmentDropdown)}
                  >
                    <Text style={styles.dropdownButtonText}>{newPatientTreatment}</Text>
                  </TouchableOpacity>
                  {showTreatmentDropdown && (
                    <View style={styles.dropdownList}>
                      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true}>
                        {TREATMENTS.map((treatment, index) => (
                          <TouchableOpacity
                            key={treatment.name}
                            style={[
                              styles.dropdownItem,
                              newPatientTreatment === treatment.name && styles.dropdownItemSelected
                            ]}
                            onPress={() => {
                              setNewPatientTreatment(treatment.name);
                              setShowTreatmentDropdown(false);
                            }}
                          >
                            <Text style={[
                              styles.dropdownItemText,
                              newPatientTreatment === treatment.name && styles.dropdownItemTextSelected
                            ]}>{treatment.name}</Text>
                            {newPatientTreatment === treatment.name && (
                              <Ionicons name="checkmark" size={20} color="#7DD3C0" />
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setIsElderly(!isElderly)}
                  >
                    <View style={[styles.checkbox, isElderly && styles.checkboxChecked]}>
                      {isElderly && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                    </View>
                    <Text style={styles.checkboxLabel}>Elderly</Text>
                  </TouchableOpacity>

                  <Text style={styles.inputLabel}>Notes (Optional):</Text>
                  <TextInput
                    style={[styles.textInput, styles.textArea]}
                    placeholder="Add notes..."
                    value={newPatientNote}
                    onChangeText={setNewPatientNote}
                    multiline
                    numberOfLines={3}
                    returnKeyType="done"
                    blurOnSubmit
                  />

                  <TouchableOpacity style={styles.addButton} onPress={handleAddPatient}>
                    <LinearGradient
                      colors={['#A855F7', '#D4B8E8']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.addButtonGradient}
                    >
                      <Text style={styles.addButtonText}>Add Patient</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </LinearGradient>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  blob: {
    position: 'absolute',
    borderRadius: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
  },
  backButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  profileButtonGlass: {
    width: '100%',
    height: '100%',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(125, 211, 192, 0.45)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#7DD3C0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 25,
    elevation: 12,
  },
  profileButtonInnerGlow: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 16,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  statCardActive: {
    backgroundColor: 'rgba(125, 211, 192, 0.2)',
    borderColor: 'rgba(125, 211, 192, 0.5)',
  },
  statLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
    fontWeight: '600',
  },
  statLabelActive: {
    color: '#7DD3C0',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#2D3748',
  },
  statValueActive: {
    color: '#7DD3C0',
  },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  queueTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  queueTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#4A5568',
  },
  minimizeButton: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: 'rgba(125, 211, 192, 0.45)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#7DD3C0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 25,
    elevation: 12,
  },
  minimizeButtonInnerGlow: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
  },
  viewDetailsHeaderButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  viewDetailsHeaderText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  headerExpandableSection: {
    alignSelf: 'flex-end',
    marginRight: 24,
    marginBottom: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 16,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerOptionButtonActive: {
    backgroundColor: 'rgba(125, 211, 192, 0.3)',
    borderWidth: 2.5,
    borderColor: 'rgba(125, 211, 192, 0.9)',
    shadowColor: '#7DD3C0',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  headerOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  headerOptionTextActive: {
    color: '#7DD3C0',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  patientCardWrapper: {
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
  menuButton: {
    padding: 4,
  },
  menuIcon: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2D3748',
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
  patientName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3748',
    letterSpacing: 0.3,
    marginLeft: 70,
    marginRight: 20,
  },
  divider: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    marginBottom: 6,
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
  queueNumberSection: {
    width: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  queueNumberText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 24,
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  fabGlass: {
    width: '100%',
    height: '100%',
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(125, 211, 192, 0.45)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#7DD3C0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 25,
    elevation: 12,
  },
  fabInnerGlow: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
  },
  fabIcon: {
    fontSize: 42,
    color: '#FFFFFF',
    fontWeight: '400',
    lineHeight: 42,
    textAlign: 'center',
    textAlignVertical: 'center',
    marginTop: -2,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
    zIndex: 10,
  },
  bottomNav: {
    flexDirection: 'row',
    paddingVertical: 10,
    marginBottom: -25,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuModal: {
    borderRadius: 20,
    padding: 12,
    width: '75%',
    maxWidth: 300,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 14,
    borderRadius: 12,
    marginVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  menuItemText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
  noteModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '85%',
    maxWidth: 400,
    padding: 20,
  },
  noteModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 16,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#2D3748',
    minHeight: 100,
    marginBottom: 16,
    textAlignVertical: 'top',
  },
  noteModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  noteModalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  editFieldModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '85%',
    maxWidth: 400,
    maxHeight: '70%',
    padding: 20,
  },
  editFieldTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 16,
  },
  editFieldOptions: {
    maxHeight: 400,
  },
  editFieldOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  editFieldOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2D3748',
  },
  addModalContent: {
    borderRadius: 24,
    width: '90%',
    maxWidth: 400,
    padding: 24,
  },
  addModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  addModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2D3748',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: 8,
    marginTop: 12,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#2D3748',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  addButton: {
    marginTop: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  addButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dropdownButtonText: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '500',
  },
  dropdownList: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 12,
    marginBottom: 12,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'transparent',
  },
  dropdownItemSelected: {
    backgroundColor: 'rgba(125, 211, 192, 0.2)',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
  dropdownItemTextSelected: {
    color: '#7DD3C0',
    fontWeight: '600',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#7DD3C0',
    borderColor: '#7DD3C0',
    borderWidth: 2,
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '600',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 16,
  },
  beautifulModal: {
    borderRadius: 24,
    width: '85%',
    maxHeight: '60%',
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    paddingVertical: 20,
  },
  modalDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 8,
  },
  modalScrollView: {
    maxHeight: 400,
  },
  beautifulDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 8,
    marginVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  beautifulDropdownText: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '500',
    marginLeft: 12,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  modalContent: {
    borderRadius: 24,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
  },
});
