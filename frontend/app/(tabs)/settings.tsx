import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { supabase } from '../../src/lib/supabase';
import { ProfileSection } from '../../src/components/settings/ProfileSection';
import { ClinicSection } from '../../src/components/settings/ClinicSection';
import { ProfessionalSection } from '../../src/components/settings/ProfessionalSection';
import { PasswordSection } from '../../src/components/settings/PasswordSection';
import { NotificationSection } from '../../src/components/settings/NotificationSection';
import { ActiveDevicesSection } from '../../src/components/settings/ActiveDevicesSection';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut, clinicId, userRole, clinicRole } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [clinicData, setClinicData] = useState<any>(null);

  const fetchAccountData = useCallback(async () => {
    if (!user || !clinicId) {
      setLoading(false);
      return;
    }

    try {
      const [profileResult, clinicResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('name, email, user_type, practice_types, city, state_province, country, school_name, name_prefix')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('clinics')
          .select('name, clinic_email, phone, address')
          .eq('id', clinicId)
          .maybeSingle(),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (clinicResult.error) throw clinicResult.error;

      setProfileData(profileResult.data);
      setClinicData(clinicResult.data);
    } catch (error) {
      console.error('Error fetching account data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, clinicId]);

  useEffect(() => {
    fetchAccountData();
  }, [fetchAccountData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAccountData();
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/');
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1ce881" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Account Settings</Text>
        <Text style={styles.subtitle}>Manage your account details</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1ce881" />
        }
      >
        {/* User Card */}
        <View style={styles.userCard}>
          <View style={styles.avatarContainer}>
            <Ionicons name="person" size={28} color="#ffffff" />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {profileData?.name_prefix && profileData.name_prefix !== 'None'
                ? `${profileData.name_prefix} ${profileData.name || ''}`
                : profileData?.name || 'User'}
            </Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
            {clinicRole && (
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>
                  {clinicRole.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Profile Section */}
        <ProfileSection
          profileData={profileData}
          userEmail={user?.email || ''}
          userId={user?.id || ''}
          onUpdate={fetchAccountData}
        />

        {/* Clinic Section - Admin Only */}
        {(userRole === 'admin' || clinicRole === 'admin') && (
          <ClinicSection
            clinicData={clinicData}
            clinicId={clinicId || ''}
            onUpdate={fetchAccountData}
          />
        )}

        {/* Professional Section */}
        <ProfessionalSection
          profileData={profileData}
          userId={user?.id || ''}
          onUpdate={fetchAccountData}
        />

        {/* Password Section */}
        <PasswordSection />

        {/* Notification Settings */}
        <NotificationSection />

        {/* Active Devices */}
        <ActiveDevicesSection userId={user?.id || ''} />

        {/* Login History */}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => Alert.alert('Login History', 'View your recent login activity')}
        >
          <View style={styles.menuItemLeft}>
            <View style={[styles.menuIcon, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#3b82f6" />
            </View>
            <View>
              <Text style={styles.menuItemTitle}>Login History</Text>
              <Text style={styles.menuItemSubtitle}>View recent login activity</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
        </TouchableOpacity>

        {/* Support Links */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          <View style={styles.menuGroup}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => Linking.openURL('mailto:support@whiskr.ai')}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIcon, { backgroundColor: 'rgba(28, 232, 129, 0.1)' }]}>
                  <Ionicons name="chatbubble-outline" size={20} color="#1ce881" />
                </View>
                <Text style={styles.menuItemTitle}>Contact Support</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => Linking.openURL('https://whiskr.ai/terms')}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIcon, { backgroundColor: 'rgba(100, 116, 139, 0.1)' }]}>
                  <Ionicons name="document-text-outline" size={20} color="#64748b" />
                </View>
                <Text style={styles.menuItemTitle}>Terms of Service</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemLast]}
              onPress={() => Linking.openURL('https://whiskr.ai/privacy')}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIcon, { backgroundColor: 'rgba(100, 116, 139, 0.1)' }]}>
                  <Ionicons name="shield-outline" size={20} color="#64748b" />
                </View>
                <Text style={styles.menuItemTitle}>Privacy Policy</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Version */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>whiskr.ai v1.0.0</Text>
        </View>

        {/* Bottom padding for tab bar */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafbfc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafbfc',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#101235',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  // User Card
  userCard: {
    backgroundColor: '#101235',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(28, 232, 129, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  userEmail: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: '#1ce881',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#101235',
  },
  // Section
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 4,
  },
  // Menu Group
  menuGroup: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuItemTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#101235',
  },
  menuItemSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  // Sign Out
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    gap: 8,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ef4444',
  },
  // Version
  versionContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  versionText: {
    fontSize: 12,
    color: '#94a3b8',
  },
});
