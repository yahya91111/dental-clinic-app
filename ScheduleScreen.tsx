import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

type ScheduleScreenProps = {
  onBack: () => void;
};

export default function ScheduleScreen({ onBack }: ScheduleScreenProps) {
  const [selectedDay, setSelectedDay] = useState<string>('Monday');

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  // Mock schedule data
  const scheduleData: Record<string, Array<{ time: string; activity: string; clinic: string }>> = {
    Monday: [
      { time: '08:00 - 12:00', activity: 'Morning Shift', clinic: 'Mushrif Center' },
      { time: '13:00 - 17:00', activity: 'Afternoon Shift', clinic: 'Mushrif Center' },
    ],
    Tuesday: [
      { time: '08:00 - 12:00', activity: 'Morning Shift', clinic: 'Mushrif Center' },
      { time: '14:00 - 18:00', activity: 'Evening Shift', clinic: 'Mushrif Center' },
    ],
    Wednesday: [
      { time: '09:00 - 13:00', activity: 'Morning Shift', clinic: 'Mushrif Center' },
    ],
    Thursday: [
      { time: '08:00 - 12:00', activity: 'Morning Shift', clinic: 'Mushrif Center' },
      { time: '13:00 - 17:00', activity: 'Afternoon Shift', clinic: 'Mushrif Center' },
    ],
    Friday: [],
    Saturday: [
      { time: '10:00 - 14:00', activity: 'Weekend Shift', clinic: 'Mushrif Center' },
    ],
    Sunday: [],
  };

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <StatusBar translucent={true} backgroundColor="transparent" barStyle="light-content" />
        <LinearGradient
          colors={['#D4E8E0', '#E0D4E8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#2D3748" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Work Schedule</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Days Selector */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.daysScroll}
            contentContainerStyle={styles.daysContainer}
          >
            {daysOfWeek.map((day) => (
              <TouchableOpacity
                key={day}
                style={[
                  styles.dayButton,
                  selectedDay === day && styles.dayButtonActive
                ]}
                onPress={() => setSelectedDay(day)}
              >
                <Text style={[
                  styles.dayText,
                  selectedDay === day && styles.dayTextActive
                ]}>
                  {day.substring(0, 3)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Schedule Content */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.selectedDayTitle}>{selectedDay}</Text>
            
            {scheduleData[selectedDay].length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={64} color="#CBD5E0" />
                <Text style={styles.emptyText}>No shifts scheduled</Text>
                <Text style={styles.emptySubtext}>Enjoy your day off!</Text>
              </View>
            ) : (
              scheduleData[selectedDay].map((shift, index) => (
                <View key={index} style={styles.shiftCard}>
                  <LinearGradient
                    colors={['#667EEA', '#764BA2']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.shiftGradient}
                  >
                    <View style={styles.shiftContent}>
                      <View style={styles.shiftHeader}>
                        <Ionicons name="time" size={24} color="#FFFFFF" />
                        <Text style={styles.shiftTime}>{shift.time}</Text>
                      </View>
                      <Text style={styles.shiftActivity}>{shift.activity}</Text>
                      <View style={styles.shiftFooter}>
                        <Ionicons name="location" size={16} color="rgba(255, 255, 255, 0.8)" />
                        <Text style={styles.shiftClinic}>{shift.clinic}</Text>
                      </View>
                    </View>
                  </LinearGradient>
                </View>
              ))
            )}
          </ScrollView>
        </LinearGradient>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#D4E8E0',
  },
  gradient: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
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
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#4A5568',
    letterSpacing: -0.5,
  },
  daysScroll: {
    maxHeight: 60,
    marginBottom: 20,
  },
  daysContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  dayButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  dayButtonActive: {
    backgroundColor: 'rgba(102, 126, 234, 0.3)',
    borderColor: '#667EEA',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#718096',
  },
  dayTextActive: {
    color: '#667EEA',
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  selectedDayTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 20,
  },
  shiftCard: {
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  shiftGradient: {
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  shiftContent: {
    gap: 8,
  },
  shiftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  shiftTime: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  shiftActivity: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 8,
  },
  shiftFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shiftClinic: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#718096',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#A0AEC0',
    marginTop: 8,
  },
});
