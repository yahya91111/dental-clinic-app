import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from './AuthContext';

interface DebugPanelProps {
  visible?: boolean;
}

/**
 * Debug Panel - Shows current user data for testing
 * Remove this component in production
 */
export default function DebugPanel({ visible = true }: DebugPanelProps) {
  const { user } = useAuth();
  const [expanded, setExpanded] = React.useState(false);

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
      >
        <Text style={styles.headerText}>
          🐛 DEBUG {expanded ? '▼' : '▶'}
        </Text>
      </TouchableOpacity>
      
      {expanded && (
        <View style={styles.content}>
          <Text style={styles.label}>User ID:</Text>
          <Text style={styles.value}>{user?.id || 'null'}</Text>
          
          <Text style={styles.label}>Name:</Text>
          <Text style={styles.value}>{user?.name || 'null'}</Text>
          
          <Text style={styles.label}>Email:</Text>
          <Text style={styles.value}>{user?.email || 'null'}</Text>
          
          <Text style={styles.label}>Role:</Text>
          <Text style={styles.value}>{user?.role || 'null'}</Text>
          
          <Text style={styles.label}>Clinic ID:</Text>
          <Text style={[styles.value, styles.highlight]}>
            {user?.clinicId !== undefined ? `${user.clinicId} (${typeof user.clinicId})` : 'null'}
          </Text>
          
          <Text style={styles.label}>Clinic Name:</Text>
          <Text style={styles.value}>{user?.clinicName || 'null'}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FF6B6B',
    zIndex: 9999,
    minWidth: 200,
  },
  header: {
    padding: 8,
    backgroundColor: '#FF6B6B',
  },
  headerText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  content: {
    padding: 12,
  },
  label: {
    color: '#FFD93D',
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 8,
  },
  value: {
    color: '#FFFFFF',
    fontSize: 12,
    marginTop: 2,
  },
  highlight: {
    backgroundColor: '#4ECDC4',
    color: '#000000',
    padding: 4,
    borderRadius: 4,
    fontWeight: 'bold',
  },
});
