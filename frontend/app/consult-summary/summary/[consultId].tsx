import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { format } from 'date-fns';

interface SOAPData {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

interface ConsultData {
  id: string;
  status: string;
  created_at: string;
  finalized_at?: string;
  soap_s?: string;
  soap_o?: string;
  soap_a?: string;
  soap_p?: string;
  patient?: {
    id: string;
    name: string;
    species: string;
    breed?: string;
    sex?: string;
    identifiers?: { patient_id?: string };
  };
}

const SECTION_COLORS = {
  subjective: '#3b82f6',
  objective: '#22c55e',
  assessment: '#f59e0b',
  plan: '#8b5cf6',
};

const SECTION_LABELS = {
  subjective: 'Subjective',
  objective: 'Objective',
  assessment: 'Assessment',
  plan: 'Plan',
};

export default function CaseSummaryScreen() {
  const router = useRouter();
  const { consultId } = useLocalSearchParams<{ consultId: string }>();
  const insets = useSafeAreaInsets();
  
  const [consult, setConsult] = useState<ConsultData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (consultId) {
      loadConsultData();
    }
  }, [consultId]);

  const loadConsultData = async () => {
    if (!consultId) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('consults')
        .select(`
          id,
          status,
          created_at,
          finalized_at,
          soap_s,
          soap_o,
          soap_a,
          soap_p,
          patient:patients (
            id,
            name,
            species,
            breed,
            sex,
            identifiers
          )
        `)
        .eq('id', consultId)
        .single();

      if (error) throw error;
      setConsult(data as ConsultData);
    } catch (error) {
      console.error('Error loading consult:', error);
      Alert.alert('Error', 'Failed to load case summary.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleShare = async () => {
    if (!consult) return;

    const soapText = [
      `SUBJECTIVE:\n${consult.soap_s || 'N/A'}`,
      `OBJECTIVE:\n${consult.soap_o || 'N/A'}`,
      `ASSESSMENT:\n${consult.soap_a || 'N/A'}`,
      `PLAN:\n${consult.soap_p || 'N/A'}`,
    ].join('\n\n');

    const shareText = `SOAP Notes - ${consult.patient?.name || 'Patient'}\n${'='.repeat(40)}\n\n${soapText}`;

    try {
      await Share.share({
        message: shareText,
        title: `SOAP Notes - ${consult.patient?.name}`,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleEdit = () => {
    router.push(`/consult-editor/editor/${consultId}` as any);
  };

  const handleNewConsult = () => {
    router.replace('/(tabs)/consults' as any);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1ce881" />
          <Text style={styles.loadingText}>Loading case summary...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!consult) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.errorText}>Consultation not found</Text>
          <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const soapData: SOAPData = {
    subjective: consult.soap_s || '',
    objective: consult.soap_o || '',
    assessment: consult.soap_a || '',
    plan: consult.soap_p || '',
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#64748b" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Case Summary</Text>
          <View style={styles.statusBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
            <Text style={styles.statusText}>Finalized</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleShare} style={styles.headerAction}>
            <Ionicons name="share-outline" size={20} color="#64748b" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Patient Info Card */}
        {consult.patient && (
          <View style={styles.patientCard}>
            <View style={styles.patientAvatar}>
              <Ionicons name="paw" size={28} color="#1ce881" />
            </View>
            <View style={styles.patientInfo}>
              <Text style={styles.patientName}>{consult.patient.name}</Text>
              <Text style={styles.patientMeta}>
                {consult.patient.species}
                {consult.patient.breed ? ` • ${consult.patient.breed}` : ''}
                {consult.patient.sex ? ` • ${consult.patient.sex}` : ''}
              </Text>
              {consult.patient.identifiers?.patient_id && (
                <Text style={styles.patientId}>
                  ID: {consult.patient.identifiers.patient_id}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Date Info */}
        <View style={styles.dateCard}>
          <View style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={18} color="#64748b" />
            <Text style={styles.dateLabel}>Date:</Text>
            <Text style={styles.dateValue}>
              {format(new Date(consult.created_at), "MMM d, yyyy 'at' h:mm a")}
            </Text>
          </View>
          {consult.finalized_at && (
            <View style={styles.dateRow}>
              <Ionicons name="checkmark-done-outline" size={18} color="#22c55e" />
              <Text style={styles.dateLabel}>Finalized:</Text>
              <Text style={styles.dateValue}>
                {format(new Date(consult.finalized_at), "MMM d, yyyy 'at' h:mm a")}
              </Text>
            </View>
          )}
        </View>

        {/* SOAP Sections */}
        <View style={styles.soapContainer}>
          <Text style={styles.soapTitle}>SOAP Notes</Text>
          
          {(Object.keys(soapData) as Array<keyof SOAPData>).map((section) => (
            <View key={section} style={styles.soapSection}>
              <View style={styles.soapSectionHeader}>
                <View style={[styles.soapIndicator, { backgroundColor: SECTION_COLORS[section] }]} />
                <Text style={[styles.soapSectionTitle, { color: SECTION_COLORS[section] }]}>
                  {SECTION_LABELS[section]}
                </Text>
              </View>
              <Text style={styles.soapSectionContent}>
                {soapData[section] || 'No data recorded'}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <TouchableOpacity style={styles.editButton} onPress={handleEdit}>
          <Ionicons name="create-outline" size={20} color="#64748b" />
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.newConsultButton} onPress={handleNewConsult}>
          <Ionicons name="add-circle" size={20} color="#101235" />
          <Text style={styles.newConsultButtonText}>New Consult</Text>
        </TouchableOpacity>
      </View>
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
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: '#ef4444',
  },
  backLink: {
    marginTop: 16,
  },
  backLinkText: {
    fontSize: 16,
    color: '#1ce881',
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#101235',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  statusText: {
    fontSize: 12,
    color: '#22c55e',
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerAction: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  scrollView: {
    flex: 1,
  },
  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  patientAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(28, 232, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  patientInfo: {
    marginLeft: 14,
    flex: 1,
  },
  patientName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#101235',
  },
  patientMeta: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  patientId: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  dateCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dateLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  dateValue: {
    fontSize: 14,
    color: '#101235',
    fontWeight: '500',
  },
  soapContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  soapTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101235',
    marginBottom: 16,
  },
  soapSection: {
    marginBottom: 20,
  },
  soapSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  soapIndicator: {
    width: 4,
    height: 18,
    borderRadius: 2,
    marginRight: 10,
  },
  soapSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  soapSectionContent: {
    fontSize: 14,
    color: '#101235',
    lineHeight: 22,
    paddingLeft: 14,
  },
  bottomActions: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    gap: 12,
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#64748b',
  },
  newConsultButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1ce881',
  },
  newConsultButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#101235',
  },
});
