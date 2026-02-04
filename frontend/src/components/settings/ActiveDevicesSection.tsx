import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

interface ActiveDevice {
  id: string;
  device_name: string;
  device_type: string;
  last_active: string;
  ip_address?: string;
  is_current: boolean;
}

interface ActiveDevicesSectionProps {
  userId: string;
}

export function ActiveDevicesSection({ userId }: ActiveDevicesSectionProps) {
  const [devices, setDevices] = useState<ActiveDevice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDevices();
  }, [userId]);

  const fetchDevices = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_devices')
        .select('*')
        .eq('user_id', userId)
        .order('last_active', { ascending: false })
        .limit(10);

      if (error) throw error;

      // Mark current device (simplified - in real app you'd use device fingerprinting)
      const devicesWithCurrent = (data || []).map((device, index) => ({
        ...device,
        is_current: index === 0, // Assume most recent is current
      }));

      setDevices(devicesWithCurrent);
    } catch (error) {
      console.error('Error fetching devices:', error);
      // Show mock data if table doesn't exist
      setDevices([
        {
          id: '1',
          device_name: Platform.OS === 'ios' ? 'iPhone' : 'Android Device',
          device_type: 'mobile',
          last_active: new Date().toISOString(),
          is_current: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeDevice = (deviceId: string) => {
    Alert.alert(
      'Revoke Device Access',
      'This will sign out the device. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase
                .from('user_devices')
                .delete()
                .eq('id', deviceId);

              setDevices((prev) => prev.filter((d) => d.id !== deviceId));
              Alert.alert('Success', 'Device access revoked');
            } catch (error) {
              Alert.alert('Error', 'Failed to revoke device');
            }
          },
        },
      ]
    );
  };

  const getDeviceIcon = (type: string) => {
    if (type === 'mobile') return 'phone-portrait-outline';
    if (type === 'tablet') return 'tablet-portrait-outline';
    return 'desktop-outline';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="hardware-chip-outline" size={18} color="#64748b" />
          <Text style={styles.sectionTitle}>Active Devices</Text>
        </View>
      </View>

      <View style={styles.card}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#1ce881" />
          </View>
        ) : devices.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No active devices</Text>
          </View>
        ) : (
          devices.map((device, index) => (
            <View
              key={device.id}
              style={[
                styles.deviceRow,
                index === devices.length - 1 && styles.deviceRowLast,
              ]}
            >
              <View style={styles.deviceIcon}>
                <Ionicons
                  name={getDeviceIcon(device.device_type) as any}
                  size={20}
                  color="#64748b"
                />
              </View>
              <View style={styles.deviceInfo}>
                <View style={styles.deviceNameRow}>
                  <Text style={styles.deviceName}>{device.device_name}</Text>
                  {device.is_current && (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>Current</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.deviceMeta}>
                  Last active: {formatDate(device.last_active)}
                </Text>
              </View>
              {!device.is_current && (
                <TouchableOpacity
                  style={styles.revokeButton}
                  onPress={() => handleRevokeDevice(device.id)}
                >
                  <Ionicons name="close-circle" size={20} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  loadingContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  deviceRowLast: {
    borderBottomWidth: 0,
  },
  deviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#101235',
  },
  currentBadge: {
    backgroundColor: 'rgba(28, 232, 129, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1ce881',
  },
  deviceMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  revokeButton: {
    padding: 8,
  },
});
