import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, Animated, Modal, TextInput, Keyboard, TouchableWithoutFeedback, Alert } from 'react-native';
import { scale } from '../../lib/scale';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { DayOfWeek, ScheduleSlot } from './types';
import { ScheduleGrid } from './ScheduleGrid';
import { CellDetailModal } from './CellDetailModal';
import { WeekStrip } from './WeekStrip';
import { DoctorsTab } from './DoctorsTab';
import { getWeeklySchedule, getScheduleSettings, updateScheduleSettings } from '../../lib/database';
import { AIOrb, AIState } from '../../components/AIOrb';
import { AIChatSheet, ChatMessage } from '../../components/AIChatSheet';
import { AISchedulePanel, PanelAction } from '../../components/AISchedulePanel';
import { sendMessageV2, type V2Message, type V2User } from '../../lib/ai_v2';
import { useAuth } from '../../AuthContext';

interface ScheduleScreenProps {
  onBack: () => void;
  clinicId?: string | null;
  userId?: string;
}

type ScheduleTab = 'daily_duty' | 'doctors' | 'vacation' | 'weekend_duty';

const TABS: { key: ScheduleTab; label: string; icon: string }[] = [
  { key: 'daily_duty', label: 'Daily Duty', icon: 'calendar-outline' },
  { key: 'doctors', label: 'Doctors', icon: 'people-outline' },
  { key: 'vacation', label: 'Vacation', icon: 'airplane-outline' },
  { key: 'weekend_duty', label: 'Weekend', icon: 'time-outline' },
];

export default function ScheduleScreen({ onBack, clinicId, userId }: ScheduleScreenProps) {
  const { user } = useAuth();

  // Blob animations (matching DoctorProfileScreen)
  const blob1Anim = useRef(new Animated.Value(0)).current;
  const blob2Anim = useRef(new Animated.Value(0)).current;
  const blob3Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createBlobLoop = (anim: Animated.Value, duration: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration, useNativeDriver: true }),
        ])
      ).start();
    };
    createBlobLoop(blob1Anim, 8000);
    createBlobLoop(blob2Anim, 10000);
    createBlobLoop(blob3Anim, 12000);
  }, []);

  // Week navigation - selected week start (Sunday)
  const getCurrentSunday = () => {
    const now = new Date();
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const [selectedWeekStart, setSelectedWeekStart] = useState(getCurrentSunday());

  // Cell detail modal
  const [selectedCell, setSelectedCell] = useState<{ day: DayOfWeek; period: number } | null>(null);

  // Settings
  const [showMenu, setShowMenu] = useState(false);
  const [showClinicInput, setShowClinicInput] = useState(false);
  const [clinicCount, setClinicCount] = useState(2);
  const [clinicInputValue, setClinicInputValue] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<ScheduleTab>('daily_duty');

  // AI Assistant
  const [showAIChat, setShowAIChat] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiState, setAiState] = useState<AIState>('idle');
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const aiHistoryRef = useRef<V2Message[]>([]);

  const handleAISend = async (text: string) => {
    if (!user) return;

    // Add user message
    const userMsg: ChatMessage = { id: `u${Date.now()}`, role: 'user', content: text, timestamp: Date.now() };
    setAiMessages(prev => [...prev, userMsg]);
    aiHistoryRef.current.push({ role: 'user', content: text });

    setAiLoading(true);
    setAiState('thinking');

    // Context block helps the AI without forcing it to ask basics
    const tabLabel = activeTab === 'daily_duty'
      ? 'Daily Duty'
      : activeTab === 'doctors' ? 'Doctors' : activeTab === 'vacation' ? 'Vacation' : 'Weekend';
    const contextData =
      `Selected week start (Sunday): ${formatWeekStart(selectedWeekStart)}\n` +
      `Clinic count: ${clinicCount}\n` +
      `Currently viewing: ${tabLabel}`;

    const v2User: V2User = {
      id: user.id,
      name: user.name,
      role: user.role,
      clinicId: user.clinicId || undefined,
      clinicName: user.clinicName,
    };

    const response = await sendMessageV2({
      messages: aiHistoryRef.current,
      user: v2User,
      clinicId: clinicId || undefined,
      contextData,
    });

    setAiLoading(false);

    if (response.success) {
      setAiState('success');
      const assistantMsg: ChatMessage = { id: `a${Date.now()}`, role: 'assistant', content: response.message, timestamp: Date.now() };
      setAiMessages(prev => [...prev, assistantMsg]);
      aiHistoryRef.current.push({ role: 'assistant', content: response.message });
      // Reload schedule in case AI made changes
      loadSchedule();
    } else {
      setAiState('error');
      const errorMsg: ChatMessage = { id: `e${Date.now()}`, role: 'assistant', content: response.error || 'Something went wrong.', timestamp: Date.now() };
      setAiMessages(prev => [...prev, errorMsg]);
    }

    // Reset state after delay
    setTimeout(() => setAiState('idle'), 2000);
  };

  // Bottom bar hide/show on scroll
  const tabBarAnim = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const tabBarVisible = useRef(true);

  const handleContentScroll = (event: any) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const diff = currentY - lastScrollY.current;
    if (diff > 8 && tabBarVisible.current && currentY > 30) {
      tabBarVisible.current = false;
      Animated.spring(tabBarAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 12 }).start();
    } else if (diff < -8 && !tabBarVisible.current) {
      tabBarVisible.current = true;
      Animated.spring(tabBarAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
    }
    lastScrollY.current = currentY;
  };

  // Schedule slots from Supabase
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);

  // Format date to YYYY-MM-DD for Supabase
  const formatWeekStart = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Load settings from Supabase
  const loadSettings = useCallback(async () => {
    if (!clinicId) return;
    const { data } = await getScheduleSettings(clinicId);
    if (data?.clinic_count) {
      setClinicCount(data.clinic_count);
    }
    setSettingsLoaded(true);
  }, [clinicId]);

  // Load weekly schedule from Supabase
  const loadSchedule = useCallback(async () => {
    if (!clinicId) return;
    const weekStr = formatWeekStart(selectedWeekStart);
    const { data } = await getWeeklySchedule(clinicId, weekStr);
    if (data) {
      const mapped: ScheduleSlot[] = data.map((s: any) => ({
        id: s.id,
        day: s.day_of_week as DayOfWeek,
        period: s.period,
        clinicNumber: s.clinic_number,
        doctorId: s.doctor_id,
        doctorName: s.doctor_name,
        role: s.role,
        status: s.status,
      }));
      setSlots(mapped);
    } else {
      setSlots([]);
    }
  }, [clinicId, selectedWeekStart]);

  // Load on mount and when week changes
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar translucent={true} backgroundColor="transparent" barStyle="dark-content" />
      {/* Gradient Mesh Background - matching DoctorProfileScreen */}
      <LinearGradient
        colors={['#F0F4F8', '#E8EDF3', '#F5F0F8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flex: 1 }}>

          {/* Animated Blobs - matching DoctorProfileScreen */}
          <Animated.View
            style={{
              position: 'absolute',
              width: scale(300),
              height: scale(300),
              borderRadius: scale(150),
              top: scale(100),
              right: scale(-50),
              backgroundColor: 'rgba(167, 139, 250, 0.15)',
              transform: [
                { translateX: blob1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, scale(30)] }) },
                { translateY: blob1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, scale(-40)] }) },
              ],
            }}
          />
          <Animated.View
            style={{
              position: 'absolute',
              width: scale(300),
              height: scale(300),
              borderRadius: scale(150),
              bottom: scale(150),
              left: scale(-80),
              backgroundColor: 'rgba(125, 211, 252, 0.12)',
              transform: [
                { translateX: blob2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, scale(-50)] }) },
                { translateY: blob2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, scale(30)] }) },
              ],
            }}
          />
          <Animated.View
            style={{
              position: 'absolute',
              width: scale(300),
              height: scale(300),
              borderRadius: scale(150),
              top: '50%',
              right: '20%',
              backgroundColor: 'rgba(240, 98, 146, 0.1)',
              transform: [
                { translateX: blob3Anim.interpolate({ inputRange: [0, 1], outputRange: [0, scale(40)] }) },
                { translateY: blob3Anim.interpolate({ inputRange: [0, 1], outputRange: [0, scale(-50)] }) },
              ],
            }}
          />

          {/* Header - matching DoctorsScreen style */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: scale(20),
            paddingVertical: scale(16),
          }}>
            <TouchableOpacity
              onPress={onBack}
              style={{
                width: scale(40),
                height: scale(40),
                borderRadius: scale(20),
                backgroundColor: 'rgba(255,255,255,0.25)',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: scale(2),
                borderColor: 'rgba(255,255,255,0.4)',
              }}
            >
              <Ionicons name="arrow-back" size={scale(24)} color="#2D3748" />
            </TouchableOpacity>
            <Text style={{
              fontSize: scale(34),
              fontWeight: '700',
              color: '#4A5568',
              letterSpacing: -0.5,
              flex: 1,
              textAlign: 'center',
            }}>Schedule</Text>
            <TouchableOpacity
              onPress={() => setShowMenu(!showMenu)}
              style={{
                width: scale(40),
                height: scale(40),
                borderRadius: scale(20),
                backgroundColor: 'rgba(255,255,255,0.25)',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: scale(2),
                borderColor: 'rgba(255,255,255,0.4)',
              }}
            >
              <Ionicons name="menu" size={scale(22)} color="#2D3748" />
            </TouchableOpacity>

            {/* Side Menu */}
            {showMenu && (
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => setShowMenu(false)}
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  zIndex: 100,
                }}
              >
                <View style={{
                  position: 'absolute',
                  top: scale(50),
                  right: scale(20),
                  backgroundColor: 'rgba(30, 30, 40, 0.85)',
                  borderRadius: scale(16),
                  padding: scale(8),
                  minWidth: scale(180),
                  borderWidth: scale(1),
                  borderColor: 'rgba(255,255,255,0.15)',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: scale(8) },
                  shadowOpacity: 0.3,
                  shadowRadius: scale(12),
                  elevation: 10,
                  zIndex: 101,
                }}>
                  {/* Clinics Count Option */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      setShowMenu(false);
                      setClinicInputValue(String(clinicCount));
                      setShowClinicInput(true);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: scale(10),
                      paddingVertical: scale(12),
                      paddingHorizontal: scale(14),
                      borderRadius: scale(10),
                    }}
                  >
                    <Ionicons name="business-outline" size={scale(18)} color="#A5B4FC" />
                    <Text style={{ fontSize: scale(14), fontWeight: '600', color: '#FFFFFF', flex: 1 }}>
                      Number of Clinics
                    </Text>
                    <View style={{
                      backgroundColor: 'rgba(165, 180, 252, 0.2)',
                      borderRadius: scale(8),
                      paddingHorizontal: scale(8),
                      paddingVertical: scale(3),
                    }}>
                      <Text style={{ fontSize: scale(13), fontWeight: '700', color: '#A5B4FC' }}>{clinicCount}</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* Week Strip - only for Daily Duty */}
          {activeTab === 'daily_duty' && (
            <WeekStrip
              selectedWeekStart={selectedWeekStart}
              onSelectWeek={setSelectedWeekStart}
            />
          )}

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: scale(10), paddingTop: scale(12), paddingBottom: scale(80) }}
            showsVerticalScrollIndicator={false}
            onScroll={handleContentScroll}
            scrollEventThrottle={16}
          >
            {activeTab === 'daily_duty' && settingsLoaded && (
              <ScheduleGrid
                slots={slots}
                clinicCount={clinicCount}
                onCellPress={(day, period) => setSelectedCell({ day, period })}
                userId={userId}
              />
            )}
            {activeTab === 'doctors' && <DoctorsTab clinicId={clinicId || null} />}
            {activeTab === 'vacation' && (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: scale(80) }}>
                <Ionicons name="airplane-outline" size={scale(60)} color="rgba(107,114,128,0.3)" />
                <Text style={{ fontSize: scale(16), fontWeight: '600', color: '#9CA3AF', marginTop: scale(12) }}>Vacation</Text>
                <Text style={{ fontSize: scale(13), color: '#CBD5E0', marginTop: scale(4) }}>Coming Soon</Text>
              </View>
            )}
            {activeTab === 'weekend_duty' && (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: scale(80) }}>
                <Ionicons name="time-outline" size={scale(60)} color="rgba(107,114,128,0.3)" />
                <Text style={{ fontSize: scale(16), fontWeight: '600', color: '#9CA3AF', marginTop: scale(12) }}>Weekend Duty</Text>
                <Text style={{ fontSize: scale(13), color: '#CBD5E0', marginTop: scale(4) }}>Coming Soon</Text>
              </View>
            )}
          </ScrollView>

          {/* Bottom Tab Bar */}
          <Animated.View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'transparent',
            paddingTop: scale(4),
            paddingBottom: scale(14),
            transform: [{
              translateY: tabBarAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, scale(80)],
              }),
            }],
            opacity: tabBarAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
            }),
          }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  activeOpacity={0.7}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: scale(2),
                  }}
                >
                  {isActive ? (
                    <LinearGradient
                      colors={['rgba(124,108,180,0.5)', 'rgba(167,155,203,0.3)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{
                        width: scale(36),
                        height: scale(36),
                        borderRadius: scale(12),
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: scale(1.5),
                        borderColor: 'rgba(124,108,180,0.3)',
                      }}
                    >
                      <Ionicons name={tab.icon as any} size={scale(18)} color="#FFFFFF" />
                    </LinearGradient>
                  ) : (
                    <View style={{
                      width: scale(36),
                      height: scale(36),
                      borderRadius: scale(12),
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Ionicons name={tab.icon as any} size={scale(18)} color="#9CA3AF" />
                    </View>
                  )}
                  <Text style={{
                    fontSize: scale(8),
                    fontWeight: isActive ? '700' : '500',
                    color: isActive ? '#6B4C9A' : '#9CA3AF',
                    marginTop: scale(1),
                  }}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        </View>
      </SafeAreaView>

      {/* Clinic Count Input Modal */}
      <Modal transparent visible={showClinicInput} animationType="fade" onRequestClose={() => setShowClinicInput(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{
              width: '75%',
              backgroundColor: 'rgba(255,255,255,0.95)',
              borderRadius: scale(20),
              padding: scale(24),
              borderWidth: scale(2),
              borderColor: 'rgba(255,255,255,0.8)',
            }}>
              <Text style={{ fontSize: scale(16), fontWeight: '700', color: '#1E3A8A', textAlign: 'center', marginBottom: scale(16) }}>
                Number of Clinics
              </Text>
              <TextInput
                value={clinicInputValue}
                onChangeText={(text) => {
                  const num = text.replace(/[^0-9]/g, '');
                  if (num === '' || (parseInt(num) >= 1 && parseInt(num) <= 10)) {
                    setClinicInputValue(num);
                  }
                }}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="1-10"
                placeholderTextColor="#A0AEC0"
                style={{
                  fontSize: scale(24),
                  fontWeight: '700',
                  color: '#2D3748',
                  textAlign: 'center',
                  backgroundColor: 'rgba(0,0,0,0.04)',
                  borderRadius: scale(14),
                  paddingVertical: scale(14),
                  borderWidth: scale(2),
                  borderColor: 'rgba(102,126,234,0.3)',
                  marginBottom: scale(16),
                }}
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: scale(10) }}>
                <TouchableOpacity
                  onPress={() => setShowClinicInput(false)}
                  style={{
                    flex: 1,
                    paddingVertical: scale(12),
                    borderRadius: scale(12),
                    backgroundColor: 'rgba(0,0,0,0.06)',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: scale(14), fontWeight: '600', color: '#6B7280' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={async () => {
                    const num = parseInt(clinicInputValue);
                    if (num >= 1 && num <= 10) {
                      setClinicCount(num);
                      setShowClinicInput(false);
                      if (clinicId) {
                        await updateScheduleSettings(clinicId, num);
                      }
                    } else {
                      Alert.alert('Invalid', 'Please enter a number between 1 and 10');
                    }
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: scale(12),
                    borderRadius: scale(12),
                    backgroundColor: '#667EEA',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: scale(14), fontWeight: '700', color: '#FFFFFF' }}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* AI Orb */}
      {!showAIChat && !showAIPanel && (
        <AIOrb state={aiState} onPress={() => setShowAIPanel(true)} />
      )}

      {/* AI hub: cinematic reveal + orbiting quick actions */}
      <AISchedulePanel
        visible={showAIPanel}
        onClose={() => setShowAIPanel(false)}
        onAction={(action: PanelAction) => {
          setShowAIPanel(false);
          setShowAIChat(true);
          if (action === 'create') {
            setTimeout(() => handleAISend('أنشئ جدول هذا الأسبوع'), 350);
          }
        }}
      />

      {/* AI Chat Sheet */}
      <AIChatSheet
        visible={showAIChat}
        onClose={() => setShowAIChat(false)}
        messages={aiMessages}
        onSend={handleAISend}
        isLoading={aiLoading}
        contextLabel={`Schedule — ${activeTab === 'daily_duty' ? 'Daily Duty' : activeTab === 'doctors' ? 'Doctors' : activeTab === 'vacation' ? 'Vacation' : 'Weekend'}`}
        clinicId={clinicId}
      />

      {/* Cell Detail Modal */}
      <CellDetailModal
        visible={selectedCell !== null}
        day={selectedCell?.day || null}
        period={selectedCell?.period ?? null}
        slots={slots}
        clinicCount={clinicCount}
        clinicId={clinicId || null}
        weekStart={formatWeekStart(selectedWeekStart)}
        userId={userId}
        onClose={() => setSelectedCell(null)}
        onSaved={() => {
          loadSchedule();
        }}
        onChangePeriod={(p) => {
          if (selectedCell) {
            setSelectedCell({ ...selectedCell, period: p });
          }
        }}
      />
    </View>
  );
}
