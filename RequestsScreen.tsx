import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

type RequestsScreenProps = {
  onBack: () => void;
};

type Request = {
  id: string;
  type: 'leave' | 'shift_change' | 'equipment' | 'other';
  title: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  date: string;
};

export default function RequestsScreen({ onBack }: RequestsScreenProps) {
  const [selectedTab, setSelectedTab] = useState<'pending' | 'all'>('pending');

  // Mock requests data
  const requests: Request[] = [
    {
      id: '1',
      type: 'leave',
      title: 'Annual Leave Request',
      description: 'Requesting 3 days leave from Dec 15-17',
      status: 'pending',
      date: '2024-11-10',
    },
    {
      id: '2',
      type: 'shift_change',
      title: 'Shift Swap Request',
      description: 'Request to swap Thursday shift with Dr. Ahmed',
      status: 'approved',
      date: '2024-11-08',
    },
    {
      id: '3',
      type: 'equipment',
      title: 'Equipment Request',
      description: 'Need new dental mirror set',
      status: 'pending',
      date: '2024-11-12',
    },
    {
      id: '4',
      type: 'other',
      title: 'Training Request',
      description: 'Request to attend dental conference',
      status: 'rejected',
      date: '2024-11-05',
    },
  ];

  const filteredRequests = selectedTab === 'pending' 
    ? requests.filter(r => r.status === 'pending')
    : requests;

  const getRequestIcon = (type: Request['type']) => {
    switch (type) {
      case 'leave': return 'calendar';
      case 'shift_change': return 'swap-horizontal';
      case 'equipment': return 'construct';
      case 'other': return 'document-text';
    }
  };

  const getRequestColor = (type: Request['type']) => {
    switch (type) {
      case 'leave': return ['#667EEA', '#764BA2'];
      case 'shift_change': return ['#11998E', '#38EF7D'];
      case 'equipment': return ['#FA709A', '#FEE140'];
      case 'other': return ['#4776E6', '#8E54E9'];
    }
  };

  const getStatusColor = (status: Request['status']) => {
    switch (status) {
      case 'pending': return '#F59E0B';
      case 'approved': return '#10B981';
      case 'rejected': return '#EF4444';
    }
  };

  const getStatusIcon = (status: Request['status']) => {
    switch (status) {
      case 'pending': return 'time';
      case 'approved': return 'checkmark-circle';
      case 'rejected': return 'close-circle';
    }
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
            <Text style={styles.headerTitle}>My Requests</Text>
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => Alert.alert('Coming Soon', 'New request feature will be available soon!')}
            >
              <Ionicons name="add" size={24} color="#2D3748" />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabsContainer}>
            <TouchableOpacity
              style={[styles.tab, selectedTab === 'pending' && styles.tabActive]}
              onPress={() => setSelectedTab('pending')}
            >
              <Text style={[styles.tabText, selectedTab === 'pending' && styles.tabTextActive]}>
                Pending ({requests.filter(r => r.status === 'pending').length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, selectedTab === 'all' && styles.tabActive]}
              onPress={() => setSelectedTab('all')}
            >
              <Text style={[styles.tabText, selectedTab === 'all' && styles.tabTextActive]}>
                All ({requests.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Requests List */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {filteredRequests.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="mail-open-outline" size={64} color="#CBD5E0" />
                <Text style={styles.emptyText}>No requests found</Text>
                <Text style={styles.emptySubtext}>Create a new request to get started</Text>
              </View>
            ) : (
              filteredRequests.map((request) => (
                <TouchableOpacity
                  key={request.id}
                  style={styles.requestCard}
                  onPress={() => Alert.alert('Request Details', request.description)}
                >
                  <LinearGradient
                    colors={getRequestColor(request.type)}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.requestGradient}
                  >
                    <View style={styles.requestContent}>
                      {/* Header */}
                      <View style={styles.requestHeader}>
                        <View style={styles.requestIconWrapper}>
                          <Ionicons name={getRequestIcon(request.type)} size={24} color="#FFFFFF" />
                        </View>
                        <View style={styles.statusBadge}>
                          <Ionicons 
                            name={getStatusIcon(request.status)} 
                            size={16} 
                            color={getStatusColor(request.status)} 
                          />
                          <Text style={[styles.statusText, { color: getStatusColor(request.status) }]}>
                            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                          </Text>
                        </View>
                      </View>

                      {/* Content */}
                      <Text style={styles.requestTitle}>{request.title}</Text>
                      <Text style={styles.requestDescription} numberOfLines={2}>
                        {request.description}
                      </Text>

                      {/* Footer */}
                      <View style={styles.requestFooter}>
                        <Ionicons name="calendar-outline" size={14} color="rgba(255, 255, 255, 0.7)" />
                        <Text style={styles.requestDate}>{request.date}</Text>
                      </View>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
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
  addButton: {
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
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    borderColor: '#FF6B6B',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#718096',
  },
  tabTextActive: {
    color: '#FF6B6B',
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  requestCard: {
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  requestGradient: {
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  requestContent: {
    gap: 8,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  requestIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  requestTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  requestDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 20,
  },
  requestFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  requestDate: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
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
