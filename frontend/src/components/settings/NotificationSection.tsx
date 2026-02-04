import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function NotificationSection() {
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await AsyncStorage.getItem('notification_settings');
      if (settings) {
        const parsed = JSON.parse(settings);
        setEmailNotifications(parsed.email ?? true);
        setPushNotifications(parsed.push ?? true);
        setMarketingEmails(parsed.marketing ?? false);
      }
    } catch (error) {
      console.error('Error loading notification settings:', error);
    }
  };

  const saveSettings = async (key: string, value: boolean) => {
    try {
      const settings = await AsyncStorage.getItem('notification_settings');
      const parsed = settings ? JSON.parse(settings) : {};
      parsed[key] = value;
      await AsyncStorage.setItem('notification_settings', JSON.stringify(parsed));
    } catch (error) {
      console.error('Error saving notification settings:', error);
    }
  };

  const handleToggle = (key: string, value: boolean, setter: (v: boolean) => void) => {
    setter(value);
    saveSettings(key, value);
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="notifications-outline" size={18} color="#64748b" />
          <Text style={styles.sectionTitle}>Notification Settings</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Email Notifications</Text>
            <Text style={styles.settingDescription}>Receive important updates via email</Text>
          </View>
          <Switch
            value={emailNotifications}
            onValueChange={(v) => handleToggle('email', v, setEmailNotifications)}
            trackColor={{ false: '#e2e8f0', true: 'rgba(28, 232, 129, 0.5)' }}
            thumbColor={emailNotifications ? '#1ce881' : '#f4f3f4'}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Push Notifications</Text>
            <Text style={styles.settingDescription}>Receive alerts on your device</Text>
          </View>
          <Switch
            value={pushNotifications}
            onValueChange={(v) => handleToggle('push', v, setPushNotifications)}
            trackColor={{ false: '#e2e8f0', true: 'rgba(28, 232, 129, 0.5)' }}
            thumbColor={pushNotifications ? '#1ce881' : '#f4f3f4'}
          />
        </View>

        <View style={[styles.settingRow, styles.settingRowLast]}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Marketing Emails</Text>
            <Text style={styles.settingDescription}>Receive news and special offers</Text>
          </View>
          <Switch
            value={marketingEmails}
            onValueChange={(v) => handleToggle('marketing', v, setMarketingEmails)}
            trackColor={{ false: '#e2e8f0', true: 'rgba(28, 232, 129, 0.5)' }}
            thumbColor={marketingEmails ? '#1ce881' : '#f4f3f4'}
          />
        </View>
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
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  settingRowLast: {
    borderBottomWidth: 0,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#101235',
  },
  settingDescription: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
});
