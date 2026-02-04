import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuthStore } from '../../../src/store/authStore';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { MinimizableAtlasChat } from '../../../src/components/atlas/MinimizableAtlasChat';
import { AtlasEye } from '../../../src/components/atlas/AtlasEye';

interface SOAPData {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

interface PatientInfo {
  id: string;
  name: string;
  species: string;
  breed?: string;
  sex?: string;
  age?: string;
  weight?: string;
  patientId?: string;
  dateOfBirth?: string;
}

const SECTION_COLORS = {
  subjective: '#3b82f6',
  objective: '#22c55e',
  assessment: '#f59e0b',
  plan: '#8b5cf6',
};

const SECTION_LABELS: Record<keyof SOAPData, string> = {
  subjective: 'Subjective',
  objective: 'Objective',
  assessment: 'Assessment',
  plan: 'Plan',
};

const REPORT_TYPES = [
  { id: 'soap', label: 'SOAP Notes', icon: 'document-text' },
  { id: 'wellness', label: 'Wellness Exam', icon: 'fitness' },
  { id: 'procedure', label: 'Procedure Notes', icon: 'medkit' },
];

export default function SOAPEditorScreen() {
  const router = useRouter();
  const { consultId } = useLocalSearchParams<{ consultId: string }>();
  const { clinicId, user } = useAuthStore();

  const [soapData, setSoapData] = useState<SOAPData>({
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
  });
  const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null);
  const [originalInput, setOriginalInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [editingSection, setEditingSection] = useState<keyof SOAPData | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  
  // Modal states
  const [showPatientInfo, setShowPatientInfo] = useState(false);
  const [showReportTypeSwitch, setShowReportTypeSwitch] = useState(false);
  const [showUploadDiagnostics, setShowUploadDiagnostics] = useState(false);
  const [showViewInput, setShowViewInput] = useState(false);
  const [currentReportType, setCurrentReportType] = useState('soap');
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAtlasChat, setShowAtlasChat] = useState(false);
  const [atlasMessageCount, setAtlasMessageCount] = useState(0);

  useEffect(() => {
    if (consultId) {
      loadConsultData();
    }
  }, [consultId]);

  const calculateAge = (dob: string) => {
    if (!dob) return undefined;
    const birth = new Date(dob);
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    const hasHadBirthday =
      today.getMonth() > birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
    if (!hasHadBirthday) years -= 1;
    if (years === 0) {
      const months = today.getMonth() - birth.getMonth();
      return `${Math.max(0, months)} month${months !== 1 ? 's' : ''}`;
    }
    return `${years} year${years !== 1 ? 's' : ''}`;
  };

  const loadConsultData = async () => {
    if (!consultId) return;
    setIsLoading(true);

    try {
      const { data: consult, error } = await supabase
        .from('consults')
        .select(`
          id,
          clinic_id,
          soap_s,
          soap_o,
          soap_a,
          soap_p,
          original_input,
          visit_type,
          patient:patients (
            id,
            name,
            species,
            breed,
            sex,
            date_of_birth,
            weight_kg,
            identifiers
          )
        `)
        .eq('id', consultId)
        .single();

      if (error) throw error;

      if (consult) {
        // Load existing SOAP data
        setSoapData({
          subjective: consult.soap_s || '',
          objective: consult.soap_o || '',
          assessment: consult.soap_a || '',
          plan: consult.soap_p || '',
        });

        setOriginalInput(consult.original_input || '');
        setCurrentReportType(consult.visit_type || 'soap');

        if (consult.patient) {
          const patient = consult.patient as any;
          const age = patient.date_of_birth ? calculateAge(patient.date_of_birth) : undefined;
          const ids = patient.identifiers as Record<string, string> | null;
          const info: PatientInfo = {
            id: patient.id,
            name: patient.name,
            species: patient.species,
            breed: patient.breed,
            sex: patient.sex,
            age,
            weight: patient.weight_kg ? `${patient.weight_kg} kg` : undefined,
            patientId: ids?.patient_id || patient.id?.slice(0, 8),
            dateOfBirth: patient.date_of_birth,
          };
          setPatientInfo(info);

          // Trigger patient enrichment if incomplete
          const isIncomplete = !patient.name || patient.name === 'New Patient' ||
            !patient.species || patient.species === 'Unknown';
          if (isIncomplete && patient.id) {
            enrichPatient(patient.id);
          }
        }

        // If no SOAP data exists, generate it
        const hasExistingData = consult.soap_s || consult.soap_o || consult.soap_a || consult.soap_p;
        if (!hasExistingData && consult.original_input) {
          await generateSOAP(consult.original_input);
        }
      }
    } catch (error) {
      console.error('Error loading consult:', error);
      Alert.alert('Error', 'Failed to load consultation data.');
    } finally {
      setIsLoading(false);
    }
  };

  // Patient Enrichment Function
  const enrichPatient = async (patientId: string) => {
    setIsEnriching(true);
    try {
      const { error } = await supabase.functions.invoke('enrich-patient-details', {
        body: { patientId },
      });

      if (error) {
        console.log('Patient enrichment error:', error);
      }

      // Always refresh patient data after enrichment attempt
      const { data: refreshedPatient } = await supabase
        .from('patients')
        .select('id, name, species, breed, sex, date_of_birth, weight_kg, identifiers')
        .eq('id', patientId)
        .single();

      if (refreshedPatient) {
        const ids = refreshedPatient.identifiers as Record<string, string> | null;
        setPatientInfo({
          id: refreshedPatient.id,
          name: refreshedPatient.name,
          species: refreshedPatient.species,
          breed: refreshedPatient.breed,
          sex: refreshedPatient.sex,
          age: refreshedPatient.date_of_birth ? calculateAge(refreshedPatient.date_of_birth) : undefined,
          weight: refreshedPatient.weight_kg ? `${refreshedPatient.weight_kg} kg` : undefined,
          patientId: ids?.patient_id || refreshedPatient.id?.slice(0, 8),
          dateOfBirth: refreshedPatient.date_of_birth,
        });
      }
    } catch (err) {
      console.log('Enrichment failed:', err);
    } finally {
      setIsEnriching(false);
    }
  };

  const handleSectionChange = (section: keyof SOAPData, value: string) => {
    setSoapData(prev => ({ ...prev, [section]: value }));
  };

  // Generate SOAP Notes
  const generateSOAP = async (inputContent?: string) => {
    const content = inputContent || originalInput;
    if (!consultId || !content) {
      Alert.alert('Error', 'No input data available for generation.');
      return;
    }

    setIsRegenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-soap', {
        body: { 
          consultId, 
          transcription: content,
          patientInfo: patientInfo ? {
            name: patientInfo.name,
            species: patientInfo.species,
            breed: patientInfo.breed,
            date_of_birth: patientInfo.dateOfBirth,
          } : undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });

      if (error) throw error;

      // Check for insufficient data error
      if (data?.error === 'INSUFFICIENT_CLINICAL_DATA' || data?.soap?.error === 'INSUFFICIENT_CLINICAL_DATA') {
        Alert.alert('Insufficient Data', data?.message || 'Please provide more clinical details.');
        return;
      }

      if (data?.soap) {
        const newSoapData = {
          subjective: data.soap.subjective || '',
          objective: data.soap.objective || '',
          assessment: data.soap.assessment || '',
          plan: data.soap.plan || '',
        };
        setSoapData(newSoapData);
        
        // Auto-save to database
        await supabase
          .from('consults')
          .update({
            soap_s: newSoapData.subjective,
            soap_o: newSoapData.objective,
            soap_a: newSoapData.assessment,
            soap_p: newSoapData.plan,
          })
          .eq('id', consultId);

        Alert.alert('Success', 'SOAP notes generated successfully.');
      }
    } catch (error: any) {
      console.error('SOAP generation error:', error);
      Alert.alert('Error', 'Failed to generate SOAP notes.');
    } finally {
      setIsRegenerating(false);
    }
  };

  // Regenerate SOAP Notes
  const handleRegenerate = async () => {
    if (!consultId || !originalInput) {
      Alert.alert('Error', 'No input data available for regeneration.');
      return;
    }

    Alert.alert(
      'Regenerate SOAP Notes',
      'This will regenerate all SOAP sections using the original input. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Regenerate', onPress: () => generateSOAP() },
      ]
    );
  };

  // Copy All SOAP Notes
  const handleCopyAll = async () => {
    const fullText = Object.entries(SECTION_LABELS)
      .map(([key, label]) => `${label.toUpperCase()}:\n${soapData[key as keyof SOAPData] || 'N/A'}`)
      .join('\n\n');
    
    await Clipboard.setStringAsync(fullText);
    setCopied(true);
    Alert.alert('Copied', 'All SOAP notes copied to clipboard.');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopySection = async (section: keyof SOAPData) => {
    await Clipboard.setStringAsync(soapData[section] || '');
    Alert.alert('Copied', `${SECTION_LABELS[section]} copied to clipboard.`);
  };

  // Finalize Consult - Updates status and navigates to Case Summary
  const handleFinalize = async () => {
    if (!consultId) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('consults')
        .update({
          soap_s: soapData.subjective,
          soap_o: soapData.objective,
          soap_a: soapData.assessment,
          soap_p: soapData.plan,
          status: 'finalized',
          visit_type: currentReportType,
          finalized_at: new Date().toISOString(),
        })
        .eq('id', consultId);

      if (error) throw error;

      // Navigate directly to case summary
      router.replace(`/consult-summary/summary/${consultId}` as any);
    } catch (error: any) {
      console.error('Finalize error:', error);
      Alert.alert('Error', 'Failed to finalize consultation.');
    } finally {
      setIsSaving(false);
    }
  };

  // Switch Report Type Handler - Saves current data and navigates to the appropriate editor
  const handleSwitchReportType = async (reportType: string) => {
    if (reportType === currentReportType) {
      setShowReportTypeSwitch(false);
      return;
    }

    setShowReportTypeSwitch(false);

    // First save current SOAP data
    if (consultId) {
      await supabase
        .from('consults')
        .update({
          soap_s: soapData.subjective,
          soap_o: soapData.objective,
          soap_a: soapData.assessment,
          soap_p: soapData.plan,
        })
        .eq('id', consultId);
    }

    // Navigate to the appropriate editor screen
    if (reportType === 'wellness') {
      router.replace(`/consult-editor/wellness/${consultId}` as any);
    } else if (reportType === 'procedure') {
      router.replace(`/consult-editor/procedure/${consultId}` as any);
    }
  };

  // Upload Diagnostics Handler
  const handleUploadDiagnostics = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        setIsUploading(true);
        setShowUploadDiagnostics(true);

        const newFiles: any[] = [];
        
        for (const asset of result.assets) {
          try {
            const base64 = await FileSystem.readAsStringAsync(asset.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });

            // Upload to Supabase storage
            const fileName = `${consultId}/${Date.now()}_${asset.fileName || 'image.jpg'}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('diagnostic-images')
              .upload(fileName, decode(base64), {
                contentType: 'image/jpeg',
              });

            if (uploadError) {
              console.error('Upload error:', uploadError);
              continue;
            }

            newFiles.push({ 
              name: asset.fileName || 'Image', 
              uri: asset.uri,
              path: fileName,
              base64,
            });
          } catch (err) {
            console.error('File processing error:', err);
          }
        }

        setUploadedFiles(prev => [...prev, ...newFiles]);
        setIsUploading(false);

        if (newFiles.length > 0) {
          // Analyze the uploaded files and add to original input
          analyzeAndRegenerateSOAP(newFiles);
        }
      }
    } catch (error) {
      console.error('Image picker error:', error);
      setIsUploading(false);
      Alert.alert('Error', 'Failed to select images.');
    }
  };

  // Analyze uploaded diagnostic files and regenerate SOAP
  const analyzeAndRegenerateSOAP = async (files: any[]) => {
    if (files.length === 0) return;

    setIsAnalyzing(true);
    try {
      let diagnosticSummary = '';

      for (const file of files) {
        try {
          const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyze-document', {
            body: { 
              consultId,
              document: file.base64,
              documentType: 'diagnostic',
            },
          });

          if (!analysisError && analysisData) {
            // Format the analysis results
            if (analysisData.labPanel?.parsed?.length > 0) {
              diagnosticSummary += '\nLab Results:\n';
              analysisData.labPanel.parsed.forEach((lab: any) => {
                const flagIndicator = lab.flag && lab.flag.toLowerCase() !== 'normal' ? ` [${String(lab.flag).toUpperCase()}]` : '';
                diagnosticSummary += `• ${lab.analyte}: ${lab.value} ${lab.unit}${flagIndicator}\n`;
              });
            } else if (analysisData.imaging?.findings?.length > 0) {
              const docType = analysisData.document_type || 'Imaging';
              diagnosticSummary += `\n${docType.charAt(0).toUpperCase() + docType.slice(1)} Findings:\n`;
              analysisData.imaging.findings.forEach((finding: string) => {
                diagnosticSummary += `• ${finding}\n`;
              });
            }
          }
        } catch (err) {
          console.error('Analysis error for file:', err);
        }
      }

      if (diagnosticSummary) {
        // Add diagnostic findings to original input
        const enrichedInput = originalInput 
          ? `${originalInput}\n\n**Diagnostics Findings**${diagnosticSummary}` 
          : `**Diagnostics Findings**${diagnosticSummary}`;
        
        setOriginalInput(enrichedInput);

        // Save to database
        if (consultId) {
          await supabase
            .from('consults')
            .update({ original_input: enrichedInput })
            .eq('id', consultId);
        }

        Alert.alert(
          'Analysis Complete',
          'Diagnostic findings have been added. Regenerating SOAP notes...',
          [{ text: 'OK', onPress: () => generateSOAP(enrichedInput) }]
        );
      } else {
        Alert.alert('Analysis Complete', 'No diagnostic findings could be extracted from the uploaded files.');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      Alert.alert('Error', 'Failed to analyze diagnostic files.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1ce881" />
          <Text style={styles.loadingText}>Loading consultation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
              <Ionicons name="arrow-back" size={24} color="#ffffff" />
            </TouchableOpacity>
            
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>
                {currentReportType === 'soap' ? 'SOAP Report' : 
                 currentReportType === 'wellness' ? 'Wellness Exam' : 'Procedure Notes'}
              </Text>
              <Text style={styles.headerSubtitle}>
                {patientInfo?.name || 'Patient'} • {consultId?.slice(0, 8)}...
              </Text>
            </View>
            
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={handleCopyAll} style={styles.headerAction}>
                <Ionicons name={copied ? "checkmark" : "copy-outline"} size={20} color={copied ? "#1ce881" : "#94a3b8"} />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleRegenerate} 
                style={styles.headerAction} 
                disabled={isRegenerating}
              >
                <Ionicons 
                  name="refresh" 
                  size={20} 
                  color={isRegenerating ? '#64748b' : '#94a3b8'} 
                />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleFinalize} 
                style={[styles.finalizeButton, isSaving && styles.finalizeButtonDisabled]}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#101235" />
                ) : (
                  <Text style={styles.finalizeButtonText}>Finalize</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Regenerating Overlay */}
          {isRegenerating && (
            <View style={styles.regeneratingOverlay}>
              <ActivityIndicator size="large" color="#1ce881" />
              <Text style={styles.regeneratingText}>
                {currentReportType === 'soap' ? 'Regenerating SOAP notes...' : 
                 `Generating ${currentReportType} report...`}
              </Text>
            </View>
          )}

          {/* SOAP Sections */}
          <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
            <View style={styles.sectionsContainer}>
              {(Object.keys(soapData) as Array<keyof SOAPData>).map((section) => (
                <View key={section} style={[styles.sectionCard, { borderLeftColor: SECTION_COLORS[section] }]}>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: SECTION_COLORS[section] }]}>
                      {SECTION_LABELS[section]}
                    </Text>
                    <View style={styles.sectionActions}>
                      <TouchableOpacity 
                        style={styles.sectionAction}
                        onPress={() => handleCopySection(section)}
                      >
                        <Ionicons name="copy-outline" size={18} color="#64748b" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  
                  {editingSection === section ? (
                    <TextInput
                      style={styles.sectionInput}
                      value={soapData[section]}
                      onChangeText={(value) => handleSectionChange(section, value)}
                      multiline
                      placeholder={`Enter ${SECTION_LABELS[section].toLowerCase()}...`}
                      placeholderTextColor="#64748b"
                      textAlignVertical="top"
                      onBlur={() => setEditingSection(null)}
                      autoFocus
                    />
                  ) : (
                    <TouchableOpacity onPress={() => setEditingSection(section)}>
                      <Text style={[styles.sectionText, !soapData[section] && styles.sectionPlaceholder]}>
                        {soapData[section] || `Tap to add ${SECTION_LABELS[section].toLowerCase()}...`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
            
            {/* Bottom padding for bottom bar */}
            <View style={{ height: 120 }} />
          </ScrollView>

          {/* Custom Bottom Bar */}
          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.bottomBarItem} onPress={() => setShowPatientInfo(true)}>
              <View style={styles.bottomBarIconContainer}>
                <Ionicons name="paw-outline" size={22} color="#94a3b8" />
                {isEnriching && <ActivityIndicator size="small" color="#1ce881" style={styles.enrichingIndicator} />}
              </View>
              <Text style={styles.bottomBarLabel}>Patient</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.bottomBarItem} onPress={() => setShowViewInput(true)}>
              <Ionicons name="eye-outline" size={22} color="#94a3b8" />
              <Text style={styles.bottomBarLabel}>View Input</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.recordButton} disabled>
              <View style={styles.recordButtonInner}>
                <Ionicons name="mic" size={26} color="#101235" />
              </View>
              <Text style={styles.recordLabel}>Record</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.bottomBarItem} onPress={handleUploadDiagnostics}>
              <View style={styles.bottomBarIconContainer}>
                <Ionicons name="cloud-upload-outline" size={22} color="#94a3b8" />
                {uploadedFiles.length > 0 && (
                  <View style={styles.uploadBadge}>
                    <Text style={styles.uploadBadgeText}>{uploadedFiles.length}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.bottomBarLabel}>Upload Dx</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.bottomBarItem} onPress={() => setShowReportTypeSwitch(true)}>
              <Ionicons name="swap-horizontal-outline" size={22} color="#94a3b8" />
              <Text style={styles.bottomBarLabel}>Switch</Text>
            </TouchableOpacity>
          </View>

          {/* Patient Info Modal */}
          <Modal
            visible={showPatientInfo}
            transparent
            animationType="slide"
            onRequestClose={() => setShowPatientInfo(false)}
          >
            <TouchableOpacity 
              style={styles.modalOverlay} 
              activeOpacity={1} 
              onPress={() => setShowPatientInfo(false)}
            >
              <View style={styles.patientModal}>
                <View style={styles.modalHandle} />
                <View style={styles.patientModalHeader}>
                  <Text style={styles.patientModalTitle}>Patient Information</Text>
                  <View style={styles.patientModalActions}>
                    {patientInfo?.id && (
                      <TouchableOpacity 
                        style={styles.enrichButton}
                        onPress={() => enrichPatient(patientInfo.id)}
                        disabled={isEnriching}
                      >
                        <Ionicons 
                          name={isEnriching ? "sync" : "refresh-outline"} 
                          size={16} 
                          color="#1ce881" 
                        />
                        <Text style={styles.enrichButtonText}>
                          {isEnriching ? 'Refreshing...' : 'Refresh'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => setShowPatientInfo(false)}>
                      <Ionicons name="close" size={24} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                </View>
                
                <View style={styles.patientCard}>
                  <Text style={styles.patientName}>{patientInfo?.name || 'Unknown'}</Text>
                  <Text style={styles.patientMeta}>
                    {patientInfo?.species}{patientInfo?.breed ? ` • ${patientInfo.breed}` : ''}
                  </Text>
                  
                  <View style={styles.patientDetails}>
                    <View style={styles.patientDetailCol}>
                      <Text style={styles.patientDetailLabel}>SEX</Text>
                      <Text style={styles.patientDetailValue}>{patientInfo?.sex || 'Unknown'}</Text>
                    </View>
                    <View style={styles.patientDetailCol}>
                      <Text style={styles.patientDetailLabel}>AGE</Text>
                      <Text style={styles.patientDetailValue}>{patientInfo?.age || 'Unknown'}</Text>
                    </View>
                  </View>
                  
                  {patientInfo?.weight && (
                    <View style={styles.patientDetailRow}>
                      <Text style={styles.patientDetailLabel}>WEIGHT</Text>
                      <Text style={styles.patientDetailValue}>{patientInfo.weight}</Text>
                    </View>
                  )}
                  
                  {patientInfo?.patientId && (
                    <View style={styles.patientDetailRow}>
                      <Text style={styles.patientDetailLabel}>PATIENT ID</Text>
                      <View style={styles.identifierBadge}>
                        <Text style={styles.identifierText}>{patientInfo.patientId}</Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </Modal>

          {/* View Input Modal */}
          <Modal
            visible={showViewInput}
            transparent
            animationType="slide"
            onRequestClose={() => setShowViewInput(false)}
          >
            <TouchableOpacity 
              style={styles.modalOverlay} 
              activeOpacity={1} 
              onPress={() => setShowViewInput(false)}
            >
              <View style={styles.viewInputModal}>
                <View style={styles.modalHandle} />
                <View style={styles.switchModalHeader}>
                  <Text style={styles.switchModalTitle}>Original Input</Text>
                  <TouchableOpacity onPress={() => setShowViewInput(false)}>
                    <Ionicons name="close" size={24} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
                
                <ScrollView style={styles.viewInputScroll}>
                  <Text style={styles.viewInputText}>
                    {originalInput || 'No original input recorded.'}
                  </Text>
                </ScrollView>
              </View>
            </TouchableOpacity>
          </Modal>

          {/* Report Type Switch Modal */}
          <Modal
            visible={showReportTypeSwitch}
            transparent
            animationType="slide"
            onRequestClose={() => setShowReportTypeSwitch(false)}
          >
            <TouchableOpacity 
              style={styles.modalOverlay} 
              activeOpacity={1} 
              onPress={() => setShowReportTypeSwitch(false)}
            >
              <View style={styles.switchModal}>
                <View style={styles.modalHandle} />
                <View style={styles.switchModalHeader}>
                  <Text style={styles.switchModalTitle}>Switch Report Type</Text>
                  <TouchableOpacity onPress={() => setShowReportTypeSwitch(false)}>
                    <Ionicons name="close" size={24} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
                
                <Text style={styles.switchModalDescription}>
                  Select a different report format. The system will generate the new report using the same input data.
                </Text>
                
                {REPORT_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type.id}
                    style={[
                      styles.reportTypeOption,
                      currentReportType === type.id && styles.reportTypeOptionActive,
                    ]}
                    onPress={() => handleSwitchReportType(type.id)}
                    disabled={isRegenerating}
                  >
                    <View style={styles.reportTypeLeft}>
                      <Ionicons 
                        name={type.icon as any} 
                        size={22} 
                        color={currentReportType === type.id ? '#101235' : '#ffffff'} 
                      />
                      <Text style={[
                        styles.reportTypeLabel,
                        currentReportType === type.id && styles.reportTypeLabelActive,
                      ]}>
                        {type.label}
                      </Text>
                    </View>
                    {currentReportType === type.id && (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>Current</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </Modal>

          {/* Upload Diagnostics Modal */}
          <Modal
            visible={showUploadDiagnostics}
            transparent
            animationType="slide"
            onRequestClose={() => !isUploading && !isAnalyzing && setShowUploadDiagnostics(false)}
          >
            <TouchableOpacity 
              style={styles.modalOverlay} 
              activeOpacity={1} 
              onPress={() => !isUploading && !isAnalyzing && setShowUploadDiagnostics(false)}
            >
              <View style={styles.uploadModal}>
                <View style={styles.modalHandle} />
                <View style={styles.switchModalHeader}>
                  <Text style={styles.switchModalTitle}>Upload Diagnostics</Text>
                  <TouchableOpacity 
                    onPress={() => setShowUploadDiagnostics(false)} 
                    disabled={isUploading || isAnalyzing}
                  >
                    <Ionicons name="close" size={24} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
                
                {isUploading || isAnalyzing ? (
                  <View style={styles.uploadingContainer}>
                    <ActivityIndicator size="large" color="#1ce881" />
                    <Text style={styles.uploadingText}>
                      {isAnalyzing ? 'Analyzing diagnostics...' : 'Uploading files...'}
                    </Text>
                    <Text style={styles.uploadingSubtext}>
                      {isAnalyzing ? 'Findings will be added to input and SOAP regenerated' : 'Please wait...'}
                    </Text>
                  </View>
                ) : uploadedFiles.length > 0 ? (
                  <View style={styles.uploadedFilesContainer}>
                    {uploadedFiles.map((file, index) => (
                      <View key={index} style={styles.uploadedFileItem}>
                        <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                        <Text style={styles.uploadedFileName}>{file.name}</Text>
                      </View>
                    ))}
                    <TouchableOpacity 
                      style={styles.addMoreButton}
                      onPress={handleUploadDiagnostics}
                    >
                      <Ionicons name="add" size={20} color="#1ce881" />
                      <Text style={styles.addMoreText}>Add More Files</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity 
                    style={styles.uploadDropzone}
                    onPress={handleUploadDiagnostics}
                  >
                    <Ionicons name="cloud-upload" size={48} color="#64748b" />
                    <Text style={styles.uploadDropzoneText}>Tap to select images</Text>
                    <Text style={styles.uploadDropzoneHint}>Lab results, X-rays, and other diagnostics</Text>
                    <Text style={styles.uploadDropzoneHint2}>Files will be analyzed and findings added to SOAP</Text>
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity 
                  style={styles.doneButton}
                  onPress={() => setShowUploadDiagnostics(false)}
                  disabled={isUploading || isAnalyzing}
                >
                  <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

// Base64 decode helper for uploading
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#94a3b8',
  },
  regeneratingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  regeneratingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#ffffff',
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerAction: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  finalizeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1ce881',
    borderRadius: 10,
    marginLeft: 8,
  },
  finalizeButtonDisabled: {
    opacity: 0.6,
  },
  finalizeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#101235',
  },
  // Scroll View
  scrollView: {
    flex: 1,
  },
  sectionsContainer: {
    padding: 12,
  },
  // Section Card
  sectionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  sectionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  sectionAction: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#0f172a',
  },
  sectionText: {
    fontSize: 14,
    color: '#e2e8f0',
    lineHeight: 22,
  },
  sectionPlaceholder: {
    color: '#64748b',
    fontStyle: 'italic',
  },
  sectionInput: {
    fontSize: 14,
    color: '#e2e8f0',
    lineHeight: 22,
    minHeight: 80,
    padding: 0,
  },
  // Bottom Bar
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    paddingHorizontal: 8,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  bottomBarItem: {
    alignItems: 'center',
    paddingVertical: 4,
    minWidth: 60,
  },
  bottomBarIconContainer: {
    position: 'relative',
  },
  bottomBarLabel: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 4,
  },
  enrichingIndicator: {
    position: 'absolute',
    top: -4,
    right: -4,
  },
  uploadBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    backgroundColor: '#1ce881',
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#101235',
  },
  recordButton: {
    alignItems: 'center',
    marginTop: -20,
  },
  recordButtonInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#1ce881',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1ce881',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  recordLabel: {
    fontSize: 10,
    color: '#1ce881',
    marginTop: 4,
    fontWeight: '500',
  },
  // Modal Overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#64748b',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  // Patient Modal
  patientModal: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  patientModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  patientModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
  },
  patientModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  enrichButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(28, 232, 129, 0.1)',
    borderRadius: 8,
  },
  enrichButtonText: {
    fontSize: 13,
    color: '#1ce881',
    fontWeight: '500',
  },
  patientCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 20,
  },
  patientName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  patientMeta: {
    fontSize: 15,
    color: '#94a3b8',
    marginBottom: 20,
  },
  patientDetails: {
    flexDirection: 'row',
    gap: 40,
    marginBottom: 16,
  },
  patientDetailCol: {},
  patientDetailRow: {
    marginBottom: 12,
  },
  patientDetailLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  patientDetailValue: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '500',
  },
  identifierBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  identifierText: {
    fontSize: 13,
    color: '#94a3b8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  // View Input Modal
  viewInputModal: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  viewInputScroll: {
    maxHeight: 300,
  },
  viewInputText: {
    fontSize: 14,
    color: '#e2e8f0',
    lineHeight: 22,
  },
  // Switch Modal
  switchModal: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  switchModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  switchModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  switchModalDescription: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 20,
  },
  reportTypeOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  reportTypeOptionActive: {
    backgroundColor: '#1ce881',
  },
  reportTypeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reportTypeLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
  },
  reportTypeLabelActive: {
    color: '#101235',
  },
  currentBadge: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  currentBadgeText: {
    fontSize: 12,
    color: '#101235',
    fontWeight: '500',
  },
  // Upload Modal
  uploadModal: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    minHeight: 300,
  },
  uploadDropzone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#334155',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  uploadDropzoneText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '500',
    marginTop: 12,
  },
  uploadDropzoneHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
    textAlign: 'center',
  },
  uploadDropzoneHint2: {
    fontSize: 11,
    color: '#1ce881',
    marginTop: 4,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  uploadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  uploadingText: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 16,
  },
  uploadingSubtext: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  uploadedFilesContainer: {
    marginBottom: 20,
  },
  uploadedFileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  uploadedFileName: {
    fontSize: 14,
    color: '#ffffff',
    flex: 1,
  },
  addMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  addMoreText: {
    fontSize: 14,
    color: '#1ce881',
    fontWeight: '500',
  },
  doneButton: {
    backgroundColor: '#1ce881',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101235',
  },
});
