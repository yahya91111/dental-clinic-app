import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert, Animated } from 'react-native';
import { supabase, Patient } from './constants';
import { startAutoArchive, stopAutoArchive, archiveEventEmitter } from '../../autoArchiveService';

interface UsePatientDataParams {
  user: any;
  selectedClinicId: string | null;
  selectedPatient: Patient | null;
  loadTimeline: (patientId: string) => void;
}

export function usePatientData({ user, selectedClinicId, selectedPatient, loadTimeline }: UsePatientDataParams) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [displayedPatients, setDisplayedPatients] = useState<Patient[]>([]);
  const [userClinicId, setUserClinicId] = useState<number | null>(null);
  const [myTotalTreatments, setMyTotalTreatments] = useState(0);
  const [animKey, setAnimKey] = useState(0);

  const realtimeChannelRef = useRef<any>(null);
  const timelineChannelRef = useRef<any>(null);
  const myTreatmentsChannelRef = useRef<any>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  const timelineBlob1Anim = useRef(new Animated.Value(0)).current;
  const timelineBlob2Anim = useRef(new Animated.Value(0)).current;
  const timelineBlob3Anim = useRef(new Animated.Value(0)).current;
  const timelineBlob4Anim = useRef(new Animated.Value(0)).current;
  const timelineBlob5Anim = useRef(new Animated.Value(0)).current;
  const timelineBlob6Anim = useRef(new Animated.Value(0)).current;

  // Load patients from Supabase with useCallback
  const loadPatients = useCallback(async (silent = false) => {
    try {
      // استخدام selectedClinicId أولاً (للـ Coordinator/General Manager)، ثم userClinicId (للـ Doctor/Team Leader)
      const clinicId = selectedClinicId || userClinicId;

      //  إذا لم يكن هناك clinic_id محدد، لا تجلب أي شيء
      if (clinicId === null) {
        setPatients([]);
        return;
      }

      let query = supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', clinicId) // تصفية حسب clinic_id
        .is('archive_date', null) // فقط المرضى غير المؤرشفين
        .order('queue_number', { ascending: true });

      const { data, error} = await query;

      if (error) throw error;

      // Format all patients (including statistics records with queue_number = -1)
      const formattedPatients: Patient[] = (data || [])
        .map((p: any) => ({
          id: p.id,
          queue_number: p.queue_number,
          name: p.name,
          age: p.age || 0,
          clinic_id: p.clinic_id,
          clinic: p.clinic || 'Clinic',
          condition: p.condition || 'Condition',
          treatment: p.treatment || 'Treatment',
          timestamp: new Date(p.created_at),
          note: p.note || undefined,
          status: p.status === 'complete' || p.status === 'completed' ? 'complete' : (p.status === 'na' ? 'na' : (p.is_elderly ? 'elderly' : 'normal')),
          isElderly: p.is_elderly || false,
          isSpecialNeeds: p.is_special_needs || false,
          // Permanent patient fields
          permanent_patient_id: p.permanent_patient_id || undefined,
          file_number: p.file_number || undefined,
          patient_type: p.patient_type || 'walk-in',
          // Timeline fields
          registered_at: p.registered_at ? new Date(p.registered_at) : undefined,
          clinic_entry_at: p.clinic_entry_at ? new Date(p.clinic_entry_at) : undefined,
          completed_at: p.completed_at ? new Date(p.completed_at) : undefined,
          doctor_name: p.doctor_name || undefined,
          assigned_by_doctor_name: p.assigned_by_doctor_name || undefined,
        }));

      setPatients(formattedPatients);
    } catch (error: any) {
      if (!silent) Alert.alert('Error loading patients', error.message);
    }
  }, [selectedClinicId, userClinicId]);

  // Setup auto archive on app start
  useEffect(() => {
    // Start auto archive service (checks every minute for 23:59)
    startAutoArchive();

    // الاستماع لحدث الأرشفة التلقائية
    const handleArchiveCompleted = (date: string) => {
      // إعادة تحميل المرضى لتنظيف Timeline
      loadPatients();
    };

    archiveEventEmitter.on('archive-completed', handleArchiveCompleted);

    // Cleanup on unmount
    return () => {
      stopAutoArchive();
      archiveEventEmitter.off('archive-completed', handleArchiveCompleted);
    };
  }, [selectedClinicId]);

  // Show all patients (no filtering by clinic)
  // Exclude statistics records (queue_number = -1) from display
  useEffect(() => {
    setDisplayedPatients(patients.filter(p => p.queue_number !== -1));
  }, [patients]);

  // Fetch user's clinic_id from profile
  useEffect(() => {
    const fetchUserClinic = async () => {
      if (user) {
        try {
          // Try to fetch from doctors table first (approved doctors)
          const { data, error } = await supabase
            .from('doctors')
            .select('clinic_id')
            .eq('id', user.id)
            .single();

          if (error) {
            // If not found in doctors, this might be a pending doctor
            // Pending doctors don't have clinic_id, so we just skip
            return;
          }

          if (data?.clinic_id) {
            setUserClinicId(data.clinic_id);
          }
        } catch (error) {
          // Error handled silently
        }
      }
    };

    fetchUserClinic();
  }, [user]);

  // Fetch My Total Treatments automatically on app start
  useEffect(() => {
    const fetchMyTotalTreatments = async () => {
      if (user) {
        try {
          // Get today's date range (same as MyStatisticsScreen default)
          const dateFrom = new Date();
          dateFrom.setHours(0, 0, 0, 0);
          const dateTo = new Date();
          dateTo.setHours(23, 59, 59, 999);

          const fromTime = dateFrom.getTime();
          const toTime = dateTo.getTime();

          // Get all patients for this doctor
          const { data: patients, error } = await supabase
            .from('patients')
            .select('id, treatment, completed_at, updated_at, queue_number, permanent_patient_id')
            .eq('doctor_id', user.id);

          if (error) {
            return;
          }

          // Filter by today's date range
          const filteredPatients = patients?.filter((patient: any) => {
            const completedDate = patient.completed_at ? new Date(patient.completed_at) : new Date(patient.updated_at);
            const patientTime = completedDate.getTime();
            return patientTime >= fromTime && patientTime <= toTime;
          }) || [];

          // Count only valid treatments (excluding "Treatment" and duplicate permanent patient records)
          const validPatients = filteredPatients.filter((p: any) => {
            // Exclude "Treatment"
            if (p.treatment === 'Treatment') return false;

            // For permanent patients: only count statistics records (queue_number = -1)
            const isPermanentPatient = p.permanent_patient_id != null;
            const isStatisticsRecord = p.queue_number === -1;

            if (isPermanentPatient && !isStatisticsRecord) {
              return false; // Skip original timeline card
            }

            return true;
          });
          setMyTotalTreatments(validPatients.length);
        } catch (error) {
          // Error handled silently
        }
      }
    };

    fetchMyTotalTreatments();
  }, [user, patients]); // Re-fetch when user or patients change

  // Realtime: التحقق من myTotalTreatments
  useEffect(() => {
    if (!user) return;

    const fetchMyTotalTreatmentsPoll = async () => {
      try {
        const now = new Date();
        const fromTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).getTime();
        const toTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();

        const { data: patients, error } = await supabase
          .from('patients')
          .select('id, treatment, completed_at, updated_at')
          .eq('doctor_id', user.id);

        if (error) return;

        const filteredPatients = patients?.filter((patient: any) => {
          const completedDate = patient.completed_at ? new Date(patient.completed_at) : new Date(patient.updated_at);
          const patientTime = completedDate.getTime();
          return patientTime >= fromTime && patientTime <= toTime;
        }) || [];

        // استثناء كلمة "Treatment" من العدد
        const validPatients = filteredPatients.filter((p: any) => p.treatment !== 'Treatment');
        setMyTotalTreatments(validPatients.length);
      } catch (error) {
        // Error handled silently
      }
    };

    // Initial fetch
    fetchMyTotalTreatmentsPoll();

    // Cleanup previous subscription
    if (myTreatmentsChannelRef.current) {
      supabase.removeChannel(myTreatmentsChannelRef.current);
      myTreatmentsChannelRef.current = null;
    }

    // Setup Realtime for my treatments
    const myTreatmentsChannel = supabase
      .channel(`app-my-treatments-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'patients',
          filter: `doctor_id=eq.${user.id}`
        },
        () => {
          fetchMyTotalTreatmentsPoll();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          reconnectTimeoutRef.current = setTimeout(() => {
            fetchMyTotalTreatmentsPoll();
          }, 3000);
        }
      });

    myTreatmentsChannelRef.current = myTreatmentsChannel;

    return () => {
      if (myTreatmentsChannelRef.current) {
        supabase.removeChannel(myTreatmentsChannelRef.current);
        myTreatmentsChannelRef.current = null;
      }
    };
  }, [user]);

  // Dragon Design: Animate blobs continuously for Timeline
  useEffect(() => {
    if (selectedClinicId !== null) {
      // Blob 1 - Circular motion
      Animated.loop(
        Animated.sequence([
          Animated.timing(timelineBlob1Anim, {
            toValue: 1,
            duration: 8000,
            useNativeDriver: true,
          }),
          Animated.timing(timelineBlob1Anim, {
            toValue: 0,
            duration: 8000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Blob 2 - Slower circular motion
      Animated.loop(
        Animated.sequence([
          Animated.timing(timelineBlob2Anim, {
            toValue: 1,
            duration: 12000,
            useNativeDriver: true,
          }),
          Animated.timing(timelineBlob2Anim, {
            toValue: 0,
            duration: 12000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Blob 3 - Fastest circular motion
      Animated.loop(
        Animated.sequence([
          Animated.timing(timelineBlob3Anim, {
            toValue: 1,
            duration: 10000,
            useNativeDriver: true,
          }),
          Animated.timing(timelineBlob3Anim, {
            toValue: 0,
            duration: 10000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Blob 4 - Medium speed
      Animated.loop(
        Animated.sequence([
          Animated.timing(timelineBlob4Anim, {
            toValue: 1,
            duration: 9500,
            useNativeDriver: true,
          }),
          Animated.timing(timelineBlob4Anim, {
            toValue: 0,
            duration: 9500,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Blob 5 - Slow motion
      Animated.loop(
        Animated.sequence([
          Animated.timing(timelineBlob5Anim, {
            toValue: 1,
            duration: 14000,
            useNativeDriver: true,
          }),
          Animated.timing(timelineBlob5Anim, {
            toValue: 0,
            duration: 14000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Blob 6 - Fast motion
      Animated.loop(
        Animated.sequence([
          Animated.timing(timelineBlob6Anim, {
            toValue: 1,
            duration: 7000,
            useNativeDriver: true,
          }),
          Animated.timing(timelineBlob6Anim, {
            toValue: 0,
            duration: 7000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [selectedClinicId]);

  // Animation for patient cards on mount
  useEffect(() => {
    if (selectedClinicId !== null) {
      // Increment animKey to trigger patient cards animation
      setAnimKey(prev => prev + 1);
    }
  }, [selectedClinicId]);

  // Load patients when user clinic is set OR when selected clinic changes + Realtime
  useEffect(() => {
    if (!user) return;

    // Initial load
    loadPatients();

    // Cleanup previous subscriptions
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
    if (timelineChannelRef.current) {
      supabase.removeChannel(timelineChannelRef.current);
      timelineChannelRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const clinicId = selectedClinicId || userClinicId;
    if (clinicId === null) return;

    // Setup Realtime subscription for patients table
    const patientsChannel = supabase
      .channel(`app-patients-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'patients',
          filter: `clinic_id=eq.${clinicId}` // Filter by clinic
        },
        (payload) => {
          // Silent refresh on any change
          loadPatients(true);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Successfully subscribed
        } else if (status === 'CHANNEL_ERROR') {
          // Retry connection after 3 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            loadPatients(true);
          }, 3000);
        }
      });

    realtimeChannelRef.current = patientsChannel;

    // Setup Realtime subscription for timeline_events table
    const timelineChannel = supabase
      .channel(`app-timeline-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'timeline_events'
        },
        (payload) => {
          // Reload timeline for the affected patient
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;

          if (newRecord?.patient_id && selectedPatient?.id === newRecord.patient_id) {
            loadTimeline(newRecord.patient_id);
          }
          if (oldRecord?.patient_id && selectedPatient?.id === oldRecord.patient_id) {
            loadTimeline(oldRecord.patient_id);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Successfully subscribed
        } else if (status === 'CHANNEL_ERROR') {
          // Retry connection
          reconnectTimeoutRef.current = setTimeout(() => {
            if (selectedPatient) {
              loadTimeline(selectedPatient.id);
            }
          }, 3000);
        }
      });

    timelineChannelRef.current = timelineChannel;

    // Cleanup on unmount
    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      if (timelineChannelRef.current) {
        supabase.removeChannel(timelineChannelRef.current);
        timelineChannelRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [user, userClinicId, selectedClinicId]); // Removed loadPatients from dependencies

  return {
    patients,
    setPatients,
    displayedPatients,
    userClinicId,
    myTotalTreatments,
    setMyTotalTreatments,
    loadPatients,
    animKey,
    setAnimKey,
    timelineBlob1Anim,
    timelineBlob2Anim,
    timelineBlob3Anim,
    timelineBlob4Anim,
    timelineBlob5Anim,
    timelineBlob6Anim,
  };
}
