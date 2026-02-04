import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuthStore } from '../../../src/store/authStore';
import { QuickConsultModal } from '../../../src/components/consult/QuickConsultModal';
import { ConsultModeSelection } from '../../../src/components/consult/ConsultModeSelection';
import { ActiveRecordingScreen } from '../../../src/components/consult/ActiveRecordingScreen';
import { TypeDetailsModal, ConsultFormData } from '../../../src/components/consult/TypeDetailsModal';
import { ReportGenerationOverlay } from '../../../src/components/consult/ReportGenerationOverlay';
import { format } from 'date-fns';
import * as FileSystem from 'expo-file-system';

interface Consult {
  id: string;
  status: string;
  created_at: string;
  patient?: {
    id: string;
    name: string;
    species: string;
    breed?: string;
    identifiers?: { patient_id?: string };
  };
}

export default function ConsultsScreen() {
  const router = useRouter();
  const { clinicId, user } = useAuthStore();
  
  const [consults, setConsults] = useState<Consult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Modal states
  const [showQuickConsult, setShowQuickConsult] = useState(false);
  const [showModeSelection, setShowModeSelection] = useState(false);
  const [showRecording, setShowRecording] = useState(false);
  const [showTypeDetails, setShowTypeDetails] = useState(false);
  const [showGenerationOverlay, setShowGenerationOverlay] = useState(false);
  
  // Workflow state
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedPatientInfo, setSelectedPatientInfo] = useState<any>(null);
  const [createdConsultId, setCreatedConsultId] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingSOAP, setIsGeneratingSOAP] = useState(false);
  const [isGenerationComplete, setIsGenerationComplete] = useState(false);
  const [modeSelectionLoading, setModeSelectionLoading] = useState(false);

  useEffect(() => {
    fetchConsults();
  }, [clinicId]);

  const fetchConsults = async () => {
    if (!clinicId) return;
    
    try {
      const { data, error } = await supabase
        .from('consults')
        .select(`
          id,
          status,
          created_at,
          patient:patients (
            id,
            name,
            species,
            breed,
            identifiers
          )
        `)
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setConsults(data || []);
    } catch (error) {
      console.error('Error fetching consults:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchConsults();
  }, [clinicId]);

  // Create consult and return its ID
  const createConsult = async (patientId: string, patientInfo: any): Promise<string | null> => {
    if (!clinicId || !user) return null;

    try {
      let finalPatientId: string;
      let ownerId: string;

      if (patientInfo?.id) {
        // Use existing patient
        finalPatientId = patientInfo.id;
        const { data: patient } = await supabase
          .from('patients')
          .select('owner_id')
          .eq('id', finalPatientId)
          .single();
        ownerId = patient?.owner_id || '';
      } else {
        // Create new patient with default owner
        const { data: owner, error: ownerError } = await supabase
          .from('owners')
          .insert({
            clinic_id: clinicId,
            name: 'Unknown Owner',
          })
          .select()
          .single();

        if (ownerError) throw ownerError;
        ownerId = owner.id;

        const { data: patient, error: patientError } = await supabase
          .from('patients')
          .insert({
            clinic_id: clinicId,
            owner_id: ownerId,
            name: 'New Patient',
            species: 'Unknown',
            identifiers: { patient_id: patientId },
          })
          .select()
          .single();

        if (patientError) throw patientError;
        finalPatientId = patient.id;
      }

      // Create new consult
      const { data: consult, error: consultError } = await supabase
        .from('consults')
        .insert({
          clinic_id: clinicId,
          patient_id: finalPatientId,
          owner_id: ownerId,
          status: 'draft',
        })
        .select()
        .single();

      if (consultError) throw consultError;
      return consult.id;
    } catch (error: any) {
      console.error('Error creating consult:', error);
      Alert.alert('Error', error.message || 'Failed to create consultation');
      return null;
    }
  };

  // Handle patient selection from QuickConsultModal
  const handlePatientSelected = (patientId: string, patientInfo: any) => {
    setSelectedPatientId(patientId);
    setSelectedPatientInfo(patientInfo);
    setShowQuickConsult(false);
    setShowModeSelection(true);
  };

  // Handle mode selection
  const handleModeSelect = async (mode: 'recording' | 'typing') => {
    setModeSelectionLoading(true);
    
    // Create consult first
    const consultId = await createConsult(selectedPatientId, selectedPatientInfo);
    if (!consultId) {
      setModeSelectionLoading(false);
      return;
    }
    
    setCreatedConsultId(consultId);
    setModeSelectionLoading(false);
    setShowModeSelection(false);
    
    if (mode === 'recording') {
      setShowRecording(true);
    } else {
      setShowTypeDetails(true);
    }
  };

  // Handle recording complete
  const handleRecordingComplete = async (uri: string, duration: number) => {
    setShowRecording(false);
    setShowGenerationOverlay(true);
    setIsTranscribing(true);

    try {
      // Read the audio file as base64
      const base64Audio = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Call transcription
      const { data: transcriptionData, error: transcriptionError } = await supabase.functions.invoke(
        'transcribe-audio',
        {
          body: { audio: base64Audio, consultId: createdConsultId },
        }
      );

      const transcription = transcriptionError ? '' : transcriptionData?.text || '';
      
      setIsTranscribing(false);
      setIsGeneratingSOAP(true);

      // Save transcription to database
      if (createdConsultId) {
        await supabase
          .from('consults')
          .update({
            original_input: transcription,
            audio_duration_seconds: duration,
          })
          .eq('id', createdConsultId);
      }

      // Generate SOAP
      await generateSOAP(transcription);
    } catch (error: any) {
      console.error('Processing error:', error);
      setIsTranscribing(false);
      setIsGeneratingSOAP(false);
      Alert.alert('Error', 'Failed to process recording. You can add content manually.');
      // Still navigate to editor
      setShowGenerationOverlay(false);
      if (createdConsultId) {
        router.push(`/consult-editor/editor/${createdConsultId}` as any);
      }
    }
  };

  // Handle type details submit
  const handleTypeDetailsSubmit = async (formData: ConsultFormData) => {
    setShowTypeDetails(false);
    setShowGenerationOverlay(true);
    setIsGeneratingSOAP(true);

    try {
      // Build formatted message
      const sections: string[] = [];
      if (formData.patientIdentification.trim()) {
        sections.push(`Patient Identification: ${formData.patientIdentification}`);
      }
      if (formData.presentingComplaint.trim()) {
        sections.push(`Presenting Complaint: ${formData.presentingComplaint}`);
      }
      if (formData.vitals.trim()) {
        sections.push(`Vitals: ${formData.vitals}`);
      }
      if (formData.physicalExamination.trim()) {
        sections.push(`Physical Examination: ${formData.physicalExamination}`);
      }
      if (formData.diagnostics.trim()) {
        sections.push(`Diagnostics: ${formData.diagnostics}`);
      }
      if (formData.ownerConstraints?.trim()) {
        sections.push(`Owner's Constraints: ${formData.ownerConstraints}`);
      }
      
      const formattedMessage = sections.length > 0 
        ? sections.join('\n\n') 
        : formData.presentingComplaint.trim();

      // Save to database
      if (createdConsultId) {
        await supabase
          .from('consults')
          .update({
            original_input: formattedMessage,
            history_summary: formattedMessage,
          })
          .eq('id', createdConsultId);
      }

      // Generate SOAP
      await generateSOAP(formattedMessage);
    } catch (error: any) {
      console.error('Processing error:', error);
      setIsGeneratingSOAP(false);
      Alert.alert('Error', 'Failed to generate SOAP notes.');
      setShowGenerationOverlay(false);
    }
  };

  // Generate SOAP notes
  const generateSOAP = async (input: string) => {
    if (!createdConsultId || !input.trim()) {
      setIsGeneratingSOAP(false);
      setIsGenerationComplete(true);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('generate-soap', {
        body: {
          consultId: createdConsultId,
          transcription: input.trim(),
        },
      });

      if (error) throw error;

      // Save SOAP to database
      if (data?.soap) {
        await supabase
          .from('consults')
          .update({
            soap_s: data.soap.subjective || '',
            soap_o: data.soap.objective || '',
            soap_a: data.soap.assessment || '',
            soap_p: data.soap.plan || '',
          })
          .eq('id', createdConsultId);
      }

      setIsGeneratingSOAP(false);
      setIsGenerationComplete(true);
    } catch (error: any) {
      console.error('SOAP generation error:', error);
      setIsGeneratingSOAP(false);
      setIsGenerationComplete(true);
    }
  };

  // Handle agree on generation overlay
  const handleAgreeAndContinue = () => {
    setShowGenerationOverlay(false);
    setIsTranscribing(false);
    setIsGeneratingSOAP(false);
    setIsGenerationComplete(false);
    
    if (createdConsultId) {
      router.push(`/consult-editor/editor/${createdConsultId}` as any);
    }
    
    // Refresh the list
    fetchConsults();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'finalized':
        return '#22c55e';
      case 'draft':
        return '#f59e0b';
      default:
        return '#64748b';
    }
  };

  const renderConsultCard = (consult: Consult) => (
    <TouchableOpacity
      key={consult.id}
      style={styles.consultCard}
      onPress={() => {
        if (consult.status === 'finalized') {
          router.push(`/consult-summary/summary/${consult.id}` as any);
        } else {
          router.push(`/consult-editor/editor/${consult.id}` as any);
        }
      }}
    >
      <View style={styles.consultCardLeft}>
        <View style={[styles.consultAvatar, { backgroundColor: `${getStatusColor(consult.status)}20` }]}>
          <Ionicons 
            name={consult.status === 'finalized' ? 'checkmark-circle' : 'create'} 
            size={20} 
            color={getStatusColor(consult.status)} 
          />
        </View>
      </View>
      <View style={styles.consultCardContent}>
        <Text style={styles.consultPatientName}>
          {consult.patient?.name || 'Unknown Patient'}
        </Text>
        <Text style={styles.consultMeta}>
          {consult.patient?.species || 'Unknown'}
          {consult.patient?.breed ? ` • ${consult.patient.breed}` : ''}
        </Text>
        <Text style={styles.consultDate}>
          {format(new Date(consult.created_at), 'MMM d, yyyy h:mm a')}
        </Text>
      </View>
      <View style={styles.consultCardRight}>
        <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(consult.status)}20` }]}>
          <Text style={[styles.statusText, { color: getStatusColor(consult.status) }]}>
            {consult.status === 'finalized' ? 'Finalized' : 'Draft'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Consultations</Text>
        <TouchableOpacity 
          style={styles.newButton} 
          onPress={() => setShowQuickConsult(true)}
        >
          <Ionicons name="add" size={24} color="#101235" />
        </TouchableOpacity>
      </View>

      {/* Consults List */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1ce881']} />
        }
      >
        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Loading...</Text>
          </View>
        ) : consults.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color="#e2e8f0" />
            <Text style={styles.emptyTitle}>No consultations yet</Text>
            <Text style={styles.emptyText}>Start your first consultation</Text>
            <TouchableOpacity 
              style={styles.emptyButton} 
              onPress={() => setShowQuickConsult(true)}
            >
              <Text style={styles.emptyButtonText}>Start New Consult</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {consults.map(renderConsultCard)}
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity 
        style={styles.fab} 
        onPress={() => setShowQuickConsult(true)}
      >
        <Ionicons name="mic" size={28} color="#101235" />
      </TouchableOpacity>

      {/* Modals */}
      <QuickConsultModal
        visible={showQuickConsult}
        onClose={() => setShowQuickConsult(false)}
        onPatientSelected={handlePatientSelected}
      />

      <ConsultModeSelection
        visible={showModeSelection}
        onClose={() => setShowModeSelection(false)}
        patientId={selectedPatientId}
        patientInfo={selectedPatientInfo}
        onSelectMode={handleModeSelect}
        loading={modeSelectionLoading}
      />

      <ActiveRecordingScreen
        visible={showRecording}
        onClose={() => setShowRecording(false)}
        onRecordingComplete={handleRecordingComplete}
        patientId={selectedPatientId}
        patientInfo={selectedPatientInfo}
      />

      <TypeDetailsModal
        visible={showTypeDetails}
        onClose={() => setShowTypeDetails(false)}
        onSubmit={handleTypeDetailsSubmit}
        patientId={selectedPatientId}
      />

      <ReportGenerationOverlay
        visible={showGenerationOverlay}
        isTranscribing={isTranscribing}
        isGenerating={isGeneratingSOAP}
        isComplete={isGenerationComplete}
        onAgree={handleAgreeAndContinue}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafbfc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#101235',
  },
  newButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1ce881',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  listContainer: {
    padding: 16,
  },
  consultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  consultCardLeft: {
    marginRight: 12,
  },
  consultAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  consultCardContent: {
    flex: 1,
  },
  consultPatientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101235',
  },
  consultMeta: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  consultDate: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  consultCardRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#101235',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  emptyButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#1ce881',
    borderRadius: 12,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#101235',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1ce881',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1ce881',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
