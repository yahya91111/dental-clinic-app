import React, { useState, useEffect } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, ScrollView, Dimensions, Animated, Modal, Platform, Alert } from 'react-native';
// Swipe gesture removed
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from './lib/supabaseClient';
import { shadows } from './theme';
import { useAuth } from './AuthContext';

type MyStatisticsScreenProps = {
  onBack: () => void;
  userClinicId?: number | null; // User's clinic ID for filtering
  doctorName?: string; // اسم الطبيب (للعرض في الرأس)
  clinicName?: string; // اسم المركز (للعرض في الرأس)
  doctorId?: string; // UUID للطبيب المختار (لجلب إحصائياته)
};

type StatsData = {
  treatments: { [key: string]: number };
  total: number;
};

export default function MyStatisticsScreen({ onBack, userClinicId, doctorName, clinicName, doctorId }: MyStatisticsScreenProps) {
  const { user } = useAuth();
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  
  // Date Range States - Default to Today
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0); // Start of today
    return date;
  });
  const [dateTo, setDateTo] = useState(() => {
    const date = new Date();
    date.setHours(23, 59, 59, 999); // End of today
    return date;
  });
  const [showDateFromPicker, setShowDateFromPicker] = useState(false);
  const [showDateToPicker, setShowDateToPicker] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDateFrom, setTempDateFrom] = useState(dateFrom);
  const [tempDateTo, setTempDateTo] = useState(dateTo);
  
  // Swipe gesture removed

  useEffect(() => {
    loadMyStatistics(dateFrom, dateTo);
  }, []);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleDateFromChange = (event: any, selectedDate?: Date) => {
    setShowDateFromPicker(false);
    if (selectedDate) {
      console.log('[DatePicker] From date selected:', selectedDate);
      setTempDateFrom(selectedDate);
      setDateFrom(selectedDate);
    }
  };

  const handleDateToChange = (event: any, selectedDate?: Date) => {
    setShowDateToPicker(false);
    if (selectedDate) {
      console.log('[DatePicker] To date selected:', selectedDate);
      setTempDateTo(selectedDate);
      setDateTo(selectedDate);
    }
  };

  const loadMyStatistics = async (fromDate: Date, toDate: Date) => {
    setLoading(true);
    try {
      // إذا كان هناك doctorId من props، استخدمه (للطبيب المختار)
      // وإلا استخدم user.id (للطبيب الحالي)
      const targetDoctorId = doctorId || user?.id;
      const clinicId = user?.clinicId || userClinicId; // Use user's clinic_id first

      console.log('[MyStatistics] Loading statistics for doctor:', doctorId, 'clinic:', clinicId);
      console.log('[MyStatistics] User data:', user);
      console.log('[MyStatistics] Date range:', fromDate.toISOString(), 'to', toDate.toISOString());

      // Removed debug alert

      // Get all patients for this doctor only
      let query = supabase
        .from('patients')
        .select(`
          id,
          treatment,
          status,
          clinic_id,
          archive_date,
          doctor_id,
          doctor_name,
          completed_at,
          updated_at
        `)
        .eq('doctor_id', targetDoctorId);

      // Don't filter by clinic_id for now - get all patients for this doctor
      // if (clinicId) {
      //   query = query.eq('clinic_id', clinicId);
      // }

      const { data: patients, error } = await query;

      console.log('[MyStatistics] Query result:', patients?.length || 0, 'patients');
      if (error) {
        console.error('[MyStatistics] Error loading statistics:', error);
        Alert.alert('Error', `Failed to load statistics: ${error.message}`);
        setStatsData({ treatments: {}, total: 0 });
        return;
      }

      // Removed debug alert

      // Filter by date range
      const fromTime = fromDate.getTime();
      const toTime = toDate.getTime();
      
      const filteredPatients = patients?.filter((patient: any) => {
        const completedDate = patient.completed_at ? new Date(patient.completed_at) : new Date(patient.updated_at);
        const patientTime = completedDate.getTime();
        return patientTime >= fromTime && patientTime <= toTime;
      }) || [];

      console.log('[MyStatistics] Total patients for doctor:', patients?.length || 0);
      console.log('[MyStatistics] Filtered patients in date range:', filteredPatients.length);

      // No alert needed - just show empty state in UI

      // Count treatments
      const treatments: { [key: string]: number } = {};
      let total = 0;

      filteredPatients.forEach((patient: any) => {
        const treatment = patient.treatment || 'Unknown';
        // ✅ استثناء كلمة "Treatment" من الإحصائيات
        if (treatment !== 'Treatment') {
          treatments[treatment] = (treatments[treatment] || 0) + 1;
          total++;
        }
      });

      console.log('[MyStatistics] Statistics:', { treatments, total });
      setStatsData({ treatments, total });
    } catch (error) {
      console.error('Error:', error);
      setStatsData({ treatments: {}, total: 0 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#E8EAF6' }}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <LinearGradient
        colors={['#FFF0F5', '#F5E5FF', '#E8D5FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          {/* Animated Blobs - مطابق MyTimelineScreen */}
          <Animated.View style={[styles.blob1]} />
          <Animated.View style={[styles.blob2]} />
          <Animated.View style={[styles.blob3]} />
          
          {/* Content Wrapper */}
          <View style={styles.contentWrapper}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTop}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={onBack}
                >
                  <Ionicons name="arrow-back" size={28} color="#2D3748" />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={styles.headerTitle}>{doctorName || 'My Statistics'}</Text>
                  {clinicName && (
                    <Text style={styles.headerSubtitle}>{clinicName}</Text>
                  )}
                </View>
                <View style={{ width: 40 }} />
              </View>
            </View>

            {/* Divider */}
            <View style={styles.headerDivider} />

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {/* Timeline: Date Range Selector */}
              <View style={styles.timelineContainer}>
                {/* Step 1: Start Date */}
                <View style={styles.timelineStep}>
                  <TouchableOpacity onPress={() => {
                    setTempDateFrom(dateFrom);
                    setShowDateFromPicker(true);
                  }}>
                    <LinearGradient
                      colors={['#A78BFA', '#A78BFA']}
                      style={styles.timelineDot}
                    >
                      <Ionicons name="calendar" size={24} color="#FFFFFF" />
                    </LinearGradient>
                  </TouchableOpacity>
                  <Text style={styles.timelineLabel}>From</Text>
                  <Text style={styles.timelineValue}>{formatDate(dateFrom)}</Text>
                </View>

                {/* Line */}
                <View style={styles.timelineLine} />

                {/* Step 2: End Date */}
                <View style={styles.timelineStep}>
                  <TouchableOpacity onPress={() => {
                    setTempDateTo(dateTo);
                    setShowDateToPicker(true);
                  }}>
                    <LinearGradient
                      colors={['#7DD3FC', '#7DD3FC']}
                      style={styles.timelineDot}
                    >
                      <Ionicons name="calendar" size={24} color="#FFFFFF" />
                    </LinearGradient>
                  </TouchableOpacity>
                  <Text style={styles.timelineLabel}>To</Text>
                  <Text style={styles.timelineValue}>{formatDate(dateTo)}</Text>
                </View>

                {/* Line */}
                <View style={styles.timelineLine} />

                {/* Step 3: Load */}
                <View style={styles.timelineStep}>
                  <TouchableOpacity onPress={() => {
                    setDateFrom(tempDateFrom);
                    setDateTo(tempDateTo);
                    loadMyStatistics(tempDateFrom, tempDateTo);
                  }}>
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

                  {/* Total Summary */}
                  <View style={styles.totalCard}>
                    <Text style={styles.totalLabel}>Total Treatments</Text>
                    <Text style={styles.totalCount}>{statsData.total}</Text>
                  </View>
                </>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No statistics available</Text>
                </View>
              )}
            </ScrollView>

            {/* Date From Picker */}
            {showDateFromPicker && Platform.OS === 'ios' && (
              <Modal
                transparent
                animationType="slide"
                visible={showDateFromPicker}
                onRequestClose={() => setShowDateFromPicker(false)}
              >
                <View style={styles.pickerModalOverlay}>
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
                      value={tempDateFrom}
                      mode="date"
                      display="spinner"
                      onChange={(event, date) => {
                        if (date) setTempDateFrom(date);
                      }}
                    />
                  </View>
                </View>
              </Modal>
            )}
            {showDateFromPicker && Platform.OS === 'android' && (
              <DateTimePicker
                value={tempDateFrom}
                mode="date"
                display="default"
                onChange={handleDateFromChange}
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
                <View style={styles.pickerModalOverlay}>
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
                      value={tempDateTo}
                      mode="date"
                      display="spinner"
                      onChange={(event, date) => {
                        if (date) setTempDateTo(date);
                      }}
                    />
                  </View>
                </View>
              </Modal>
            )}
            {showDateToPicker && Platform.OS === 'android' && (
              <DateTimePicker
                value={tempDateTo}
                mode="date"
                display="default"
                onChange={handleDateToChange}
              />
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8EAF6',
  },
  gradient: {
    flex: 1,
    position: 'relative',
  },
  meshGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  contentWrapper: {
    flex: 1,
  },
  blob1: {
    position: 'absolute',
    top: '3%',
    right: '-10%',
    width: 180,
    height: 180,
    borderRadius: 100,
    backgroundColor: 'rgba(91, 159, 237, 0.15)',
  },
  blob2: {
    position: 'absolute',
    top: '65%',
    left: '-15%',
    width: 220,
    height: 220,
    borderRadius: 100,
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
  },
  blob3: {
    position: 'absolute',
    bottom: '12%',
    right: '-5%',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(236, 72, 153, 0.1)',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginBottom: 20,
  },
  backButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2D3748',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#718096',
    marginTop: 4,
  },
  headerDivider: {
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    marginHorizontal: 20,
    marginBottom: 20,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 20,
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
  },
  paginationDotActive: {
    backgroundColor: '#A78BFA',
    width: 24,
  },
  totalCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
    padding: 30,
    marginBottom: 30,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  totalLabel: {
    fontSize: 16,
    color: '#718096',
    marginBottom: 10,
  },
  totalCount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2D3748',
  },
  loadingText: {
    textAlign: 'center',
    color: '#718096',
    fontSize: 16,
    marginTop: 40,
  },
  emptyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 20,
    padding: 30,
    marginTop: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  emptyText: {
    textAlign: 'center',
    color: '#718096',
    fontSize: 16,
  },
  // Timeline Styles
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
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
  // Date Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateModalContent: {
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
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D3748',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateFieldContainer: {
    marginBottom: 20,
  },
  dateLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: 8,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(91, 159, 237, 0.1)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(91, 159, 237, 0.3)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  dateButtonText: {
    fontSize: 16,
    color: '#2D3748',
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
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
  applyButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10B981',
  },
  // Date Picker Modal (iOS)
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
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
});
