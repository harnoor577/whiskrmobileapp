import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { supabase } from '../../src/lib/supabase';
import { Button } from '../../src/components/ui/Button';
import { getSpeciesColor } from '../../src/utils/colors';
import { useTheme } from '../../src/contexts/ThemeContext';

interface DashboardMetrics {
  totalPatients: number;
  consultsThisWeek: number;
  timeSaved: number;
  completedConsults: number;
}

interface RecentPatient {
  id: string;
  name: string;
  species: string;
  breed?: string;
  updated_at: string;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user, clinicId, clinicRole } = useAuthStore();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalPatients: 0,
    consultsThisWeek: 0,
    timeSaved: 0,
    completedConsults: 0,
  });
  const [recentPatients, setRecentPatients] = useState<RecentPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState('');
  const [namePrefix, setNamePrefix] = useState('Dr.');

  const minutesSavedPerConsult = 15;

  const fetchDashboardData = useCallback(async () => {
    if (!clinicId || !user?.id) return;

    try {
      // Fetch user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, name_prefix')
        .eq('user_id', user.id)
        .single();

      if (profile?.name) {
        setUserName(profile.name);
        if (profile.name_prefix) setNamePrefix(profile.name_prefix);
      }

      // Get start of week (Monday)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const weekStart = new Date(now.setDate(diff));
      weekStart.setHours(0, 0, 0, 0);

      // Fetch all data in parallel
      const [patientsResult, weeklyConsultsResult, totalConsultsResult, recentPatientsResult] = await Promise.all([
        // Total patients
        supabase
          .from('patients')
          .select('*', { count: 'exact', head: true })
          .eq('clinic_id', clinicId),
        // This week's consults
        supabase
          .from('consults')
          .select('*', { count: 'exact', head: true })
          .eq('clinic_id', clinicId)
          .gte('created_at', weekStart.toISOString()),
        // Total completed consults
        supabase
          .from('consults')
          .select('*', { count: 'exact', head: true })
          .eq('clinic_id', clinicId)
          .in('status', ['completed', 'finalized']),
        // Recent patients
        supabase
          .from('patients')
          .select('id, name, species, breed, updated_at')
          .eq('clinic_id', clinicId)
          .order('updated_at', { ascending: false })
          .limit(5),
      ]);

      const totalPatients = patientsResult.count || 0;
      const consultsThisWeek = weeklyConsultsResult.count || 0;
      const completedConsults = totalConsultsResult.count || 0;

      setMetrics({
        totalPatients,
        consultsThisWeek,
        timeSaved: completedConsults * minutesSavedPerConsult,
        completedConsults,
      });

      setRecentPatients(recentPatientsResult.data || []);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clinicId, user?.id]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const getTimeIcon = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'sunny-outline';
    if (hour < 17) return 'partly-sunny-outline';
    return 'moon-outline';
  };

  const getDisplayName = () => {
    if (userName) {
      const firstName = userName.split(' ')[0];
      return `${namePrefix} ${firstName}`;
    }
    const fullName = user?.user_metadata?.name || user?.user_metadata?.full_name || '';
    if (fullName) {
      return fullName.split(' ')[0];
    }
    return 'there';
  };

  const formatTimeSaved = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
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
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1ce881" />
        }
      >
        {/* Hero Banner */}
        <View style={styles.heroBanner}>
          <View style={styles.heroAccent} />
          <View style={styles.heroContent}>
            <View style={styles.greetingRow}>
              <Ionicons name={getTimeIcon() as any} size={20} color="#1ce881" />
              <Text style={styles.greeting}>{getGreeting()},</Text>
            </View>
            <Text style={styles.userName}>{getDisplayName()}</Text>
            <Text style={styles.heroSubtext}>
              You've helped <Text style={styles.heroHighlight}>{metrics.totalPatients}</Text> patients
            </Text>
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name="medical" size={36} color="#1ce881" />
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/(tabs)/patients')}
          >
            <View style={[styles.statIconBg, { backgroundColor: 'rgba(28, 232, 129, 0.1)' }]}>
              <Ionicons name="people" size={22} color="#1ce881" />
            </View>
            <Text style={styles.statNumber}>{metrics.totalPatients}</Text>
            <Text style={styles.statLabel}>Patients</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.statCard}>
            <View style={[styles.statIconBg, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
              <Ionicons name="clipboard" size={22} color="#3b82f6" />
            </View>
            <Text style={styles.statNumber}>{metrics.consultsThisWeek}</Text>
            <Text style={styles.statLabel}>This Week</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.statCard}>
            <View style={[styles.statIconBg, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
              <Ionicons name="time" size={22} color="#f59e0b" />
            </View>
            <Text style={styles.statNumber}>{formatTimeSaved(metrics.timeSaved)}</Text>
            <Text style={styles.statLabel}>Time Saved</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Patients */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Patients</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/patients')}>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>

          {recentPatients.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="paw" size={48} color="#e2e8f0" />
              <Text style={styles.emptyText}>No patients yet</Text>
              <Button
                title="Add First Patient"
                onPress={() => router.push('/(tabs)/patients')}
                size="sm"
                style={{ marginTop: 16 }}
              />
            </View>
          ) : (
            <View style={styles.patientsList}>
              {recentPatients.map((patient, index) => (
                <TouchableOpacity
                  key={patient.id}
                  style={[
                    styles.patientCard,
                    index === recentPatients.length - 1 && styles.patientCardLast,
                  ]}
                  onPress={() => router.push(`/(tabs)/patients?id=${patient.id}`)}
                >
                  <View
                    style={[
                      styles.patientAvatar,
                      { backgroundColor: getSpeciesColor(patient.species) },
                    ]}
                  >
                    <Ionicons name="paw" size={18} color="#ffffff" />
                  </View>
                  <View style={styles.patientInfo}>
                    <Text style={styles.patientName}>{patient.name}</Text>
                    <Text style={styles.patientBreed}>
                      {patient.breed || patient.species}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Bottom Padding for Tab Bar */}
        <View style={{ height: 100 }} />
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  heroBanner: {
    backgroundColor: '#101235',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  heroAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#1ce881',
  },
  heroContent: {
    flex: 1,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  greeting: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  heroSubtext: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  heroHighlight: {
    fontWeight: '700',
    color: '#1ce881',
  },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(28, 232, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: '#101235',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#101235',
  },
  viewAllText: {
    fontSize: 14,
    color: '#1ce881',
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyText: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 12,
  },
  patientsList: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  patientCardLast: {
    borderBottomWidth: 0,
  },
  patientAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  patientInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#101235',
  },
  patientBreed: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 1,
  },
});
