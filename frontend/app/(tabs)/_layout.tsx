import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QuickConsultModal } from '../../src/components/consult/QuickConsultModal';
import { ConsultModeSelection } from '../../src/components/consult/ConsultModeSelection';
import { ActiveRecordingScreen } from '../../src/components/consult/ActiveRecordingScreen';
import { TypeDetailsModal, ConsultFormData } from '../../src/components/consult/TypeDetailsModal';
import { ReportGenerationOverlay } from '../../src/components/consult/ReportGenerationOverlay';
import { supabase } from '../../src/lib/supabase';
import * as FileSystem from 'expo-file-system';
import { Alert } from 'react-native';
import { useTheme } from '../../src/contexts/ThemeContext';

export default function TabsLayout() {
  const { user, loading, initialized, clinicId } = useAuthStore();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
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

  // Show loading while auth initializes
  if (!initialized || loading) {
    return null;
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Redirect href="/" />;
  }

  // Create consult and return its ID
  const createConsult = async (patientId: string, patientInfo: any): Promise<string | null> => {
    if (!clinicId || !user) return null;

    try {
      let finalPatientId: string;
      let ownerId: string;

      if (patientInfo?.id) {
        finalPatientId = patientInfo.id;
        const { data: patient } = await supabase
          .from('patients')
          .select('owner_id')
          .eq('id', finalPatientId)
          .single();
        ownerId = patient?.owner_id || '';
      } else {
        const { data: owner, error: ownerError } = await supabase
          .from('owners')
          .insert({ clinic_id: clinicId, name: 'Unknown Owner' })
          .select()
          .single();

        if (ownerError) throw ownerError;
        ownerId = owner.id;

        const { data: patient, error: patientError } = await supabase
          .from('patients')
          .insert({
            clinic_id: clinicId,
            owner_id: ownerId,
            name: `Patient ${patientId}`,
            species: 'Unknown',
            identifiers: { patient_id: patientId },
          })
          .select()
          .single();

        if (patientError) throw patientError;
        finalPatientId = patient.id;
      }

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
      const base64Audio = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { data: transcriptionData, error: transcriptionError } = await supabase.functions.invoke(
        'transcribe-audio',
        { body: { audio: base64Audio, consultId: createdConsultId } }
      );

      const transcription = transcriptionError ? '' : transcriptionData?.text || '';
      
      setIsTranscribing(false);
      setIsGeneratingSOAP(true);

      if (createdConsultId) {
        await supabase
          .from('consults')
          .update({ original_input: transcription, audio_duration_seconds: duration })
          .eq('id', createdConsultId);
      }

      await generateSOAP(transcription);
    } catch (error: any) {
      console.error('Processing error:', error);
      setIsTranscribing(false);
      setIsGeneratingSOAP(false);
      Alert.alert('Error', 'Failed to process recording.');
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
      const sections: string[] = [];
      if (formData.patientIdentification?.trim()) sections.push(`Patient: ${formData.patientIdentification}`);
      if (formData.presentingComplaint?.trim()) sections.push(`Complaint: ${formData.presentingComplaint}`);
      if (formData.vitals?.trim()) sections.push(`Vitals: ${formData.vitals}`);
      if (formData.physicalExamination?.trim()) sections.push(`PE: ${formData.physicalExamination}`);
      if (formData.diagnostics?.trim()) sections.push(`Diagnostics: ${formData.diagnostics}`);
      if (formData.ownerConstraints?.trim()) sections.push(`Constraints: ${formData.ownerConstraints}`);
      
      const formattedMessage = sections.join('\n\n') || formData.presentingComplaint?.trim() || '';

      if (createdConsultId) {
        await supabase
          .from('consults')
          .update({ original_input: formattedMessage, history_summary: formattedMessage })
          .eq('id', createdConsultId);
      }

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
        body: { consultId: createdConsultId, transcription: input.trim() },
      });

      if (error) throw error;

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
  };

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: [
            styles.tabBar,
            { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 },
          ],
          tabBarActiveTintColor: '#1ce881',
          tabBarInactiveTintColor: '#64748b',
          tabBarLabelStyle: styles.tabBarLabel,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="patients"
          options={{
            title: 'Patients',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'paw' : 'paw-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="consults"
          options={{
            title: 'Consults',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'settings' : 'settings-outline'} size={24} color={color} />
            ),
          }}
        />
        {/* Hidden screens */}
        <Tabs.Screen name="consult-placeholder" options={{ href: null }} />
        <Tabs.Screen name="signout" options={{ href: null }} />
      </Tabs>

      {/* Floating Center Button */}
      <View style={[styles.fabContainer, { bottom: insets.bottom > 0 ? insets.bottom + 50 : 70 }]}>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowQuickConsult(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="mic" size={28} color="#101235" />
        </TouchableOpacity>
      </View>

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
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
    height: Platform.OS === 'ios' ? 88 : 68,
    position: 'absolute',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  fabContainer: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 100,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1ce881',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1ce881',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
