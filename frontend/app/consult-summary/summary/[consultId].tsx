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
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { format } from 'date-fns';
import * as Clipboard from 'expo-clipboard';
import { MinimizableAtlasChat } from '../../../src/components/atlas/MinimizableAtlasChat';
import { AtlasEye } from '../../../src/components/atlas/AtlasEye';

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
  visit_type?: string;
  soap_s?: string;
  soap_o?: string;
  soap_a?: string;
  soap_p?: string;
  case_notes?: string;
  discharge_summary?: string;
  client_education?: string;
  original_input?: string;
  patient?: {
    id: string;
    name: string;
    species: string;
    breed?: string;
    sex?: string;
    identifiers?: { patient_id?: string };
  };
}

interface WellnessData {
  [key: string]: string;
}

interface ProcedureData {
  [key: string]: string;
}

interface ExtractedMedication {
  name: string;
  dosage?: string;
  frequency?: string;
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

// Extract medications from SOAP plan section
function extractMedicationsFromConsult(consult: ConsultData): ExtractedMedication[] {
  const medications: ExtractedMedication[] = [];
  const planText = consult.soap_p || '';
  
  // Common medication patterns
  const patterns = [
    /(\w+(?:\s+\w+)?)\s+(\d+(?:\.\d+)?\s*(?:mg|ml|mcg|g|units?)(?:\/(?:kg|lb))?)\s*(?:PO|IV|IM|SC|SQ|topical)?\s*(?:q?\d+h?|(?:once|twice|three times)\s+(?:daily|a day)|BID|TID|QID|SID|EOD)?/gi,
    /(?:prescribe|administer|give|start)\s+(\w+(?:\s+\w+)?)\s+(?:at\s+)?(\d+(?:\.\d+)?\s*(?:mg|ml|mcg|g|units?))/gi,
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(planText)) !== null) {
      const name = match[1]?.trim();
      if (name && name.length > 2 && !medications.find(m => m.name.toLowerCase() === name.toLowerCase())) {
        medications.push({
          name,
          dosage: match[2]?.trim(),
        });
      }
    }
  });
  
  // Also look for common drug names
  const commonDrugs = [
    'Amoxicillin', 'Clavamox', 'Metronidazole', 'Carprofen', 'Meloxicam',
    'Gabapentin', 'Prednisone', 'Prednisolone', 'Cerenia', 'Famotidine',
    'Omeprazole', 'Sucralfate', 'Diphenhydramine', 'Apoquel', 'Cytopoint',
    'Convenia', 'Baytril', 'Enrofloxacin', 'Doxycycline', 'Clindamycin',
    'Tramadol', 'Buprenorphine', 'Trazodone', 'Fluoxetine', 'Rimadyl'
  ];
  
  commonDrugs.forEach(drug => {
    const regex = new RegExp(drug, 'gi');
    if (planText.match(regex) && !medications.find(m => m.name.toLowerCase() === drug.toLowerCase())) {
      medications.push({ name: drug });
    }
  });
  
  return medications.slice(0, 10); // Limit to 10 medications
}

// Parse discharge summary sections
function parseDischargeSections(content: string) {
  const sections: { title: string; content: string }[] = [];
  
  const patterns = [
    { title: 'Summary', pattern: /(?:\d+\.\s*)?SUMMARY[:\s]*\n([\s\S]*?)(?=(?:\d+\.\s*)?KEY FINDINGS[:\s]*\n|$)/i },
    { title: 'Key Findings', pattern: /(?:\d+\.\s*)?KEY FINDINGS[:\s]*\n([\s\S]*?)(?=(?:\d+\.\s*)?TREATMENT PLAN|$)/i },
    { title: 'Treatment Plan and Care Instructions', pattern: /(?:\d+\.\s*)?TREATMENT PLAN AND CARE INSTRUCTIONS[:\s]*\n([\s\S]*?)(?=(?:\d+\.\s*)?SIGNS TO WATCH|$)/i },
    { title: 'Signs to Watch For', pattern: /(?:\d+\.\s*)?SIGNS TO WATCH FOR[:\s]*\n([\s\S]*?)(?=(?:\d+\.\s*)?FOLLOW-UP|$)/i },
    { title: 'Follow-Up Steps', pattern: /(?:\d+\.\s*)?FOLLOW-UP STEPS[:\s]*\n([\s\S]*?)$/i },
  ];
  
  for (const { title, pattern } of patterns) {
    const match = content.match(pattern);
    if (match && match[1]?.trim()) {
      sections.push({ title, content: match[1].trim() });
    }
  }
  
  // If no sections found, return the whole content as one section
  if (sections.length === 0 && content.trim()) {
    sections.push({ title: 'Discharge Summary', content: content.trim() });
  }
  
  return sections;
}

// Parse client education sections
function parseEducationSections(content: string) {
  const sections: { title: string; content: string }[] = [];
  
  const patterns = [
    { title: 'What Is This Condition?', pattern: /(?:1\.\s*)?WHAT IS THIS CONDITION\?[:\s]*\n([\s\S]*?)(?=(?:2\.\s*)?CAUSES|$)/i },
    { title: 'Causes and Risk Factors', pattern: /(?:2\.\s*)?CAUSES AND RISK FACTORS[:\s]*\n([\s\S]*?)(?=(?:3\.\s*)?UNDERSTANDING|$)/i },
    { title: 'Understanding the Treatment', pattern: /(?:3\.\s*)?UNDERSTANDING THE TREATMENT[:\s]*\n([\s\S]*?)(?=(?:4\.\s*)?WHAT TO EXPECT|$)/i },
    { title: 'What to Expect During Recovery', pattern: /(?:4\.\s*)?WHAT TO EXPECT DURING RECOVERY[:\s]*\n([\s\S]*?)(?=(?:5\.\s*)?HOME CARE|$)/i },
    { title: 'Home Care Tips', pattern: /(?:5\.\s*)?HOME CARE TIPS[:\s]*\n([\s\S]*?)(?=(?:6\.\s*)?PREVENTION|$)/i },
    { title: 'Prevention and Long-Term Care', pattern: /(?:6\.\s*)?PREVENTION AND LONG-TERM CARE[:\s]*\n([\s\S]*?)(?=(?:7\.\s*)?WHEN TO CONTACT|$)/i },
    { title: 'When to Contact Your Veterinarian', pattern: /(?:7\.\s*)?WHEN TO CONTACT YOUR VETERINARIAN[:\s]*\n([\s\S]*?)$/i },
  ];
  
  for (const { title, pattern } of patterns) {
    const match = content.match(pattern);
    if (match && match[1]?.trim()) {
      sections.push({ title, content: match[1].trim() });
    }
  }
  
  // If no sections found, return the whole content as one section
  if (sections.length === 0 && content.trim()) {
    sections.push({ title: 'Client Education', content: content.trim() });
  }
  
  return sections;
}

export default function CaseSummaryScreen() {
  const router = useRouter();
  const { consultId } = useLocalSearchParams<{ consultId: string }>();
  const insets = useSafeAreaInsets();
  
  const [consult, setConsult] = useState<ConsultData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal states
  const [showEducationModal, setShowEducationModal] = useState(false);
  const [showMedicineModal, setShowMedicineModal] = useState(false);
  const [showRecordingModal, setShowRecordingModal] = useState(false);
  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [showAtlasChat, setShowAtlasChat] = useState(false);
  const [atlasMessageCount, setAtlasMessageCount] = useState(0);
  
  // Generation states
  const [isGeneratingEducation, setIsGeneratingEducation] = useState(false);
  const [isGeneratingDischarge, setIsGeneratingDischarge] = useState(false);
  const [extractedMedications, setExtractedMedications] = useState<ExtractedMedication[]>([]);
  
  // Report type selection
  const [selectedReportType, setSelectedReportType] = useState<'soap' | 'wellness' | 'procedure' | null>(null);

  useEffect(() => {
    if (consultId) {
      loadConsultData();
    }
  }, [consultId]);

  // Extract medications when consult loads
  useEffect(() => {
    if (consult) {
      const meds = extractMedicationsFromConsult(consult);
      setExtractedMedications(meds);
    }
  }, [consult]);

  // Auto-generate client education if needed
  useEffect(() => {
    const autoGenerateEducation = async () => {
      if (!consultId || !consult) return;
      if (consult.client_education) return;
      if (isGeneratingEducation) return;

      const hasSOAPNotes = consult.soap_s || consult.soap_o || consult.soap_a || consult.soap_p;
      if (!hasSOAPNotes) return;

      setIsGeneratingEducation(true);
      try {
        const { data, error } = await supabase.functions.invoke('generate-client-education', {
          body: { consultId },
        });

        if (error) {
          console.error('Error generating client education:', error);
          return;
        }

        if (data?.clientEducation) {
          // Reload consult data
          loadConsultData();
        }
      } catch (err) {
        console.error('Error generating education:', err);
      } finally {
        setIsGeneratingEducation(false);
      }
    };

    autoGenerateEducation();
  }, [consultId, consult?.soap_s, consult?.soap_o, consult?.soap_a, consult?.soap_p, consult?.client_education]);

  // Auto-generate discharge summary if needed
  useEffect(() => {
    const autoGenerateDischarge = async () => {
      if (!consultId || !consult) return;
      if (consult.discharge_summary) return;
      if (isGeneratingDischarge) return;

      const hasSOAPNotes = consult.soap_s || consult.soap_o || consult.soap_a || consult.soap_p;
      if (!hasSOAPNotes) return;

      setIsGeneratingDischarge(true);
      try {
        const { data, error } = await supabase.functions.invoke('generate-discharge-plan', {
          body: { consultId },
        });

        if (error) {
          console.error('Error generating discharge plan:', error);
          return;
        }

        if (data?.dischargePlan) {
          // Reload consult data
          loadConsultData();
        }
      } catch (err) {
        console.error('Error generating discharge:', err);
      } finally {
        setIsGeneratingDischarge(false);
      }
    };

    autoGenerateDischarge();
  }, [consultId, consult?.soap_s, consult?.soap_o, consult?.soap_a, consult?.soap_p, consult?.discharge_summary]);

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
          visit_type,
          soap_s,
          soap_o,
          soap_a,
          soap_p,
          case_notes,
          discharge_summary,
          client_education,
          original_input,
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

  const handleCopyEducation = async () => {
    if (!consult?.client_education) return;
    await Clipboard.setStringAsync(consult.client_education);
    Alert.alert('Copied', 'Client education copied to clipboard');
  };

  const handleCopyMedication = async (med: ExtractedMedication) => {
    const text = `${med.name}${med.dosage ? ` - ${med.dosage}` : ''}${med.frequency ? ` (${med.frequency})` : ''}`;
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', `${med.name} copied to clipboard`);
  };

  const handleCopyDischarge = async () => {
    if (!consult?.discharge_summary) return;
    await Clipboard.setStringAsync(consult.discharge_summary);
    Alert.alert('Copied', 'Discharge summary copied to clipboard');
  };

  // Parse case_notes JSON for wellness and procedure data (must be before useEffect)
  let wellnessData: WellnessData | null = null;
  let procedureData: ProcedureData | null = null;

  if (consult?.case_notes) {
    try {
      const parsed = JSON.parse(consult.case_notes);
      if (parsed.wellness) wellnessData = parsed.wellness;
      if (parsed.procedure) procedureData = parsed.procedure;
    } catch {
      // Not JSON, ignore
    }
  }

  // Check if SOAP notes exist
  const hasSOAP = !!(consult?.soap_s || consult?.soap_o || consult?.soap_a || consult?.soap_p);

  // Auto-select primary report type on load (must be before conditional returns)
  useEffect(() => {
    if (!selectedReportType && consult) {
      if (hasSOAP) {
        setSelectedReportType('soap');
      } else if (wellnessData) {
        setSelectedReportType('wellness');
      } else if (procedureData) {
        setSelectedReportType('procedure');
      }
    }
  }, [consult, hasSOAP, selectedReportType]);

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

  const educationSections = consult.client_education ? parseEducationSections(consult.client_education) : [];
  const dischargeSections = consult.discharge_summary ? parseDischargeSections(consult.discharge_summary) : [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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

        {/* Quick Action Buttons Row */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity 
            style={[styles.actionButton, !consult.discharge_summary && !isGeneratingDischarge && styles.actionButtonDisabled]}
            onPress={() => consult.discharge_summary && setShowDischargeModal(true)}
            disabled={!consult.discharge_summary && !isGeneratingDischarge}
          >
            {isGeneratingDischarge ? (
              <ActivityIndicator size="small" color="#0ea5e9" />
            ) : (
              <Ionicons name="exit-outline" size={18} color={consult.discharge_summary ? "#0ea5e9" : "#94a3b8"} />
            )}
            <Text style={[styles.actionButtonText, !consult.discharge_summary && styles.actionButtonTextDisabled]}>
              Discharge
            </Text>
            {consult.discharge_summary && (
              <View style={styles.actionButtonBadge}>
                <Ionicons name="checkmark" size={10} color="#ffffff" />
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionButton, !consult.client_education && !isGeneratingEducation && styles.actionButtonDisabled]}
            onPress={() => consult.client_education && setShowEducationModal(true)}
            disabled={!consult.client_education && !isGeneratingEducation}
          >
            {isGeneratingEducation ? (
              <ActivityIndicator size="small" color="#22c55e" />
            ) : (
              <Ionicons name="book-outline" size={18} color={consult.client_education ? "#22c55e" : "#94a3b8"} />
            )}
            <Text style={[styles.actionButtonText, !consult.client_education && styles.actionButtonTextDisabled]}>
              Education
            </Text>
            {consult.client_education && (
              <View style={[styles.actionButtonBadge, { backgroundColor: '#22c55e' }]}>
                <Ionicons name="checkmark" size={10} color="#ffffff" />
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionButton, extractedMedications.length === 0 && styles.actionButtonDisabled]}
            onPress={() => extractedMedications.length > 0 && setShowMedicineModal(true)}
            disabled={extractedMedications.length === 0}
          >
            <Ionicons name="medkit-outline" size={18} color={extractedMedications.length > 0 ? "#8b5cf6" : "#94a3b8"} />
            <Text style={[styles.actionButtonText, extractedMedications.length === 0 && styles.actionButtonTextDisabled]}>
              Medicine
            </Text>
            {extractedMedications.length > 0 && (
              <View style={[styles.actionButtonBadge, { backgroundColor: '#8b5cf6' }]}>
                <Text style={styles.actionButtonBadgeText}>{extractedMedications.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => setShowRecordingModal(true)}
          >
            <Ionicons name="mic-outline" size={18} color="#f59e0b" />
            <Text style={styles.actionButtonText}>Recording</Text>
          </TouchableOpacity>
        </View>

        {/* Report Type Selector - shown only if multiple report types exist */}
        {(hasSOAP || wellnessData || procedureData) && (
          <View style={styles.reportTypeRow}>
            <Text style={styles.reportTypeLabel}>Report:</Text>
            
            <TouchableOpacity
              style={[
                styles.reportTypeButton,
                selectedReportType === 'soap' && styles.reportTypeButtonActive,
                !hasSOAP && styles.reportTypeButtonDisabled
              ]}
              onPress={() => hasSOAP && setSelectedReportType('soap')}
              disabled={!hasSOAP}
            >
              <Ionicons 
                name="document-text" 
                size={16} 
                color={selectedReportType === 'soap' ? '#ffffff' : hasSOAP ? '#3b82f6' : '#94a3b8'} 
              />
              <Text style={[
                styles.reportTypeButtonText,
                selectedReportType === 'soap' && styles.reportTypeButtonTextActive,
                !hasSOAP && styles.reportTypeButtonTextDisabled
              ]}>
                SOAP
              </Text>
              {hasSOAP && <Ionicons name="checkmark-circle" size={14} color={selectedReportType === 'soap' ? '#ffffff' : '#22c55e'} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.reportTypeButton,
                selectedReportType === 'wellness' && styles.reportTypeButtonActiveGreen,
                !wellnessData && styles.reportTypeButtonDisabled
              ]}
              onPress={() => wellnessData && setSelectedReportType('wellness')}
              disabled={!wellnessData}
            >
              <Ionicons 
                name="fitness" 
                size={16} 
                color={selectedReportType === 'wellness' ? '#ffffff' : wellnessData ? '#22c55e' : '#94a3b8'} 
              />
              <Text style={[
                styles.reportTypeButtonText,
                selectedReportType === 'wellness' && styles.reportTypeButtonTextActive,
                !wellnessData && styles.reportTypeButtonTextDisabled
              ]}>
                Wellness
              </Text>
              {wellnessData && <Ionicons name="checkmark-circle" size={14} color={selectedReportType === 'wellness' ? '#ffffff' : '#22c55e'} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.reportTypeButton,
                selectedReportType === 'procedure' && styles.reportTypeButtonActivePurple,
                !procedureData && styles.reportTypeButtonDisabled
              ]}
              onPress={() => procedureData && setSelectedReportType('procedure')}
              disabled={!procedureData}
            >
              <Ionicons 
                name="cut" 
                size={16} 
                color={selectedReportType === 'procedure' ? '#ffffff' : procedureData ? '#8b5cf6' : '#94a3b8'} 
              />
              <Text style={[
                styles.reportTypeButtonText,
                selectedReportType === 'procedure' && styles.reportTypeButtonTextActive,
                !procedureData && styles.reportTypeButtonTextDisabled
              ]}>
                Procedure
              </Text>
              {procedureData && <Ionicons name="checkmark-circle" size={14} color={selectedReportType === 'procedure' ? '#ffffff' : '#22c55e'} />}
            </TouchableOpacity>
          </View>
        )}

        {/* SOAP Notes - shown when SOAP is selected */}
        {selectedReportType === 'soap' && hasSOAP && (
          <View style={[styles.soapContainer, styles.reportContainer]}>
            <View style={styles.soapHeader}>
              <View style={styles.soapTitleRow}>
                <Ionicons name="document-text" size={20} color="#3b82f6" />
                <Text style={styles.soapTitle}>SOAP Notes</Text>
              </View>
              <TouchableOpacity 
                style={styles.copyAllButton}
                onPress={handleShare}
              >
                <Ionicons name="copy-outline" size={16} color="#64748b" />
                <Text style={styles.copyAllText}>Copy All</Text>
              </TouchableOpacity>
            </View>
            
            {(Object.keys(soapData) as Array<keyof SOAPData>).map((section) => (
              <View key={section} style={styles.soapSection}>
                <View style={styles.soapSectionHeader}>
                  <View style={[styles.soapIndicator, { backgroundColor: SECTION_COLORS[section] }]} />
                  <Text style={[styles.soapSectionTitle, { color: SECTION_COLORS[section] }]}>
                    {SECTION_LABELS[section]}
                  </Text>
                  <TouchableOpacity 
                    style={styles.copySectionButton}
                    onPress={async () => {
                      await Clipboard.setStringAsync(soapData[section] || '');
                      Alert.alert('Copied', `${SECTION_LABELS[section]} copied to clipboard`);
                    }}
                  >
                    <Ionicons name="copy-outline" size={14} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.soapSectionContent}>
                  {soapData[section] || 'No data recorded'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Wellness Report - shown when Wellness is selected */}
        {selectedReportType === 'wellness' && wellnessData && (
          <View style={[styles.reportContainer, { borderLeftColor: '#22c55e' }]}>
            <View style={styles.soapHeader}>
              <View style={styles.soapTitleRow}>
                <Ionicons name="fitness" size={20} color="#22c55e" />
                <Text style={styles.soapTitle}>Wellness Report</Text>
              </View>
              <TouchableOpacity 
                style={styles.copyAllButton}
                onPress={async () => {
                  const text = Object.entries(wellnessData)
                    .map(([key, value]) => `${key.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase()}:\n${value}`)
                    .join('\n\n');
                  await Clipboard.setStringAsync(text);
                  Alert.alert('Copied', 'Wellness report copied to clipboard');
                }}
              >
                <Ionicons name="copy-outline" size={16} color="#64748b" />
                <Text style={styles.copyAllText}>Copy All</Text>
              </TouchableOpacity>
            </View>
            
            {Object.entries(wellnessData).map(([key, value]) => (
              <View key={key} style={styles.soapSection}>
                <View style={styles.soapSectionHeader}>
                  <View style={[styles.soapIndicator, { backgroundColor: '#22c55e' }]} />
                  <Text style={[styles.soapSectionTitle, { color: '#22c55e' }]}>
                    {key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')}
                  </Text>
                  <TouchableOpacity 
                    style={styles.copySectionButton}
                    onPress={async () => {
                      await Clipboard.setStringAsync(String(value));
                      Alert.alert('Copied', `${key} copied to clipboard`);
                    }}
                  >
                    <Ionicons name="copy-outline" size={14} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.soapSectionContent}>
                  {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Procedure Report - shown when Procedure is selected */}
        {selectedReportType === 'procedure' && procedureData && (
          <View style={[styles.reportContainer, { borderLeftColor: '#8b5cf6' }]}>
            <View style={styles.soapHeader}>
              <View style={styles.soapTitleRow}>
                <Ionicons name="cut" size={20} color="#8b5cf6" />
                <Text style={styles.soapTitle}>Procedural Notes</Text>
              </View>
              <TouchableOpacity 
                style={styles.copyAllButton}
                onPress={async () => {
                  const text = Object.entries(procedureData)
                    .map(([key, value]) => `${key.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase()}:\n${value}`)
                    .join('\n\n');
                  await Clipboard.setStringAsync(text);
                  Alert.alert('Copied', 'Procedure notes copied to clipboard');
                }}
              >
                <Ionicons name="copy-outline" size={16} color="#64748b" />
                <Text style={styles.copyAllText}>Copy All</Text>
              </TouchableOpacity>
            </View>
            
            {Object.entries(procedureData).map(([key, value]) => (
              <View key={key} style={styles.soapSection}>
                <View style={styles.soapSectionHeader}>
                  <View style={[styles.soapIndicator, { backgroundColor: '#8b5cf6' }]} />
                  <Text style={[styles.soapSectionTitle, { color: '#8b5cf6' }]}>
                    {key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')}
                  </Text>
                  <TouchableOpacity 
                    style={styles.copySectionButton}
                    onPress={async () => {
                      await Clipboard.setStringAsync(String(value));
                      Alert.alert('Copied', `${key} copied to clipboard`);
                    }}
                  >
                    <Ionicons name="copy-outline" size={14} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.soapSectionContent}>
                  {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* No Report Available */}
        {!selectedReportType && !hasSOAP && !wellnessData && !procedureData && (
          <View style={styles.emptyReportContainer}>
            <Ionicons name="document-outline" size={48} color="#94a3b8" />
            <Text style={styles.emptyReportText}>No report generated for this consultation yet.</Text>
          </View>
        )}
        
        {/* Bottom padding for navigation bar */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Navigation Bar */}
      <View style={[styles.bottomActions, { paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }]}>
        <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)' as any)}>
          <Ionicons name="home-outline" size={24} color="#ffffff" />
          <Text style={styles.bottomBarLabel}>Dashboard</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/patients' as any)}>
          <Ionicons name="paw-outline" size={24} color="#ffffff" />
          <Text style={styles.bottomBarLabel}>Patient</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.recordingButton} onPress={() => setShowRecordingModal(true)}>
          <View style={styles.recordingButtonInner}>
            <Ionicons name="mic" size={28} color="#101235" />
          </View>
          <Text style={styles.recordingLabel}>Recording</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.bottomBarItem, !consult.client_education && !isGeneratingEducation && styles.bottomBarItemDisabled]} 
          onPress={() => consult.client_education && setShowEducationModal(true)}
          disabled={!consult.client_education && !isGeneratingEducation}
        >
          {isGeneratingEducation ? (
            <ActivityIndicator size="small" color="#1ce881" />
          ) : (
            <Ionicons name="book-outline" size={24} color={consult.client_education ? "#ffffff" : "#64748b"} />
          )}
          <Text style={[styles.bottomBarLabel, !consult.client_education && styles.bottomBarLabelDisabled]}>Education</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.bottomBarItem, extractedMedications.length === 0 && styles.bottomBarItemDisabled]} 
          onPress={() => extractedMedications.length > 0 && setShowMedicineModal(true)}
          disabled={extractedMedications.length === 0}
        >
          <View style={styles.bottomBarIconContainer}>
            <Ionicons name="medkit-outline" size={24} color={extractedMedications.length > 0 ? "#ffffff" : "#64748b"} />
            {extractedMedications.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{extractedMedications.length}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.bottomBarLabel, extractedMedications.length === 0 && styles.bottomBarLabelDisabled]}>Medicine</Text>
        </TouchableOpacity>
      </View>

      {/* Recording/Original Input Modal */}
      <Modal
        visible={showRecordingModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowRecordingModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowRecordingModal(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="mic" size={24} color="#1ce881" />
                <Text style={styles.modalTitle}>Recording / Original Input</Text>
              </View>
              <TouchableOpacity onPress={() => setShowRecordingModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScrollView}>
              {consult.original_input ? (
                <View style={styles.originalInputContainer}>
                  <Text style={styles.originalInputText}>{consult.original_input}</Text>
                  <TouchableOpacity 
                    style={styles.copyButton}
                    onPress={async () => {
                      await Clipboard.setStringAsync(consult.original_input || '');
                      Alert.alert('Copied', 'Original input copied to clipboard');
                    }}
                  >
                    <Ionicons name="copy-outline" size={16} color="#1ce881" />
                    <Text style={styles.copyButtonText}>Copy</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.emptyStateText}>No original input recorded.</Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Client Education Modal */}
      <Modal
        visible={showEducationModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEducationModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowEducationModal(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="book" size={24} color="#3b82f6" />
                <Text style={styles.modalTitle}>Client Education</Text>
              </View>
              <View style={styles.modalHeaderActions}>
                <TouchableOpacity style={styles.modalCopyAll} onPress={handleCopyEducation}>
                  <Ionicons name="copy-outline" size={16} color="#3b82f6" />
                  <Text style={styles.modalCopyAllText}>Copy All</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowEducationModal(false)}>
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>
            
            <ScrollView style={styles.modalScrollView}>
              {educationSections.length > 0 ? (
                educationSections.map((section, index) => (
                  <View key={index} style={styles.educationSection}>
                    <View style={styles.educationSectionHeader}>
                      <Text style={styles.educationSectionTitle}>{section.title}</Text>
                      <TouchableOpacity 
                        onPress={async () => {
                          await Clipboard.setStringAsync(section.content);
                          Alert.alert('Copied', `${section.title} copied to clipboard`);
                        }}
                      >
                        <Ionicons name="copy-outline" size={14} color="#94a3b8" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.educationSectionContent}>{section.content}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyStateText}>No client education generated.</Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Medicine Summary Modal */}
      <Modal
        visible={showMedicineModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowMedicineModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowMedicineModal(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="medkit" size={24} color="#8b5cf6" />
                <Text style={styles.modalTitle}>Medicine Summary</Text>
                <View style={styles.medicationBadge}>
                  <Text style={styles.medicationBadgeText}>{extractedMedications.length}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowMedicineModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScrollView}>
              {extractedMedications.length > 0 ? (
                <View style={styles.medicationList}>
                  <Text style={styles.medicationListSubtitle}>
                    Medications identified in the treatment plan:
                  </Text>
                  {extractedMedications.map((med, index) => (
                    <TouchableOpacity 
                      key={index} 
                      style={styles.medicationItem}
                      onPress={() => handleCopyMedication(med)}
                    >
                      <View style={styles.medicationInfo}>
                        <View style={styles.medicationIcon}>
                          <Ionicons name="medical" size={20} color="#8b5cf6" />
                        </View>
                        <View style={styles.medicationDetails}>
                          <Text style={styles.medicationName}>{med.name}</Text>
                          {med.dosage && (
                            <Text style={styles.medicationDosage}>{med.dosage}</Text>
                          )}
                          {med.frequency && (
                            <Text style={styles.medicationFrequency}>{med.frequency}</Text>
                          )}
                        </View>
                      </View>
                      <Ionicons name="copy-outline" size={18} color="#94a3b8" />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="medical-outline" size={48} color="#64748b" />
                  <Text style={styles.emptyStateText}>No medications identified in this consultation.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Discharge Summary Modal */}
      <Modal
        visible={showDischargeModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDischargeModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowDischargeModal(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="exit" size={24} color="#0ea5e9" />
                <Text style={styles.modalTitle}>Discharge Summary</Text>
              </View>
              <View style={styles.modalHeaderActions}>
                <TouchableOpacity style={[styles.modalCopyAll, { backgroundColor: '#e0f2fe' }]} onPress={handleCopyDischarge}>
                  <Ionicons name="copy-outline" size={16} color="#0ea5e9" />
                  <Text style={[styles.modalCopyAllText, { color: '#0ea5e9' }]}>Copy All</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowDischargeModal(false)}>
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>
            
            <ScrollView style={styles.modalScrollView}>
              {dischargeSections.length > 0 ? (
                dischargeSections.map((section, index) => (
                  <View key={index} style={styles.dischargeSection}>
                    <View style={styles.dischargeSectionHeader}>
                      <Text style={styles.dischargeSectionTitle}>{section.title}</Text>
                      <TouchableOpacity 
                        onPress={async () => {
                          await Clipboard.setStringAsync(section.content);
                          Alert.alert('Copied', `${section.title} copied to clipboard`);
                        }}
                      >
                        <Ionicons name="copy-outline" size={14} color="#94a3b8" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.dischargeSectionContent}>{section.content}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyStateText}>No discharge summary generated.</Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Atlas Floating Button */}
      <TouchableOpacity 
        style={styles.atlasFloatingButton}
        onPress={() => setShowAtlasChat(true)}
      >
        <View style={styles.atlasButtonInner}>
          <AtlasEye size="sm" blink wander glowIntensity="medium" />
        </View>
        {atlasMessageCount > 0 && (
          <View style={styles.atlasMessageBadge}>
            <Text style={styles.atlasMessageBadgeText}>{atlasMessageCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Atlas Chat Modal */}
      {showAtlasChat && (
        <MinimizableAtlasChat
          transcription={consult.original_input}
          patientInfo={consult.patient ? {
            patientId: consult.patient.id,
            name: consult.patient.name,
            species: consult.patient.species,
          } : null}
          consultId={consultId || ''}
          readOnly={true}
          onMessageCountChange={setAtlasMessageCount}
        />
      )}
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
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
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
  // Action Buttons Row
  actionButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    fontSize: 13,
    color: '#101235',
    fontWeight: '500',
  },
  actionButtonTextDisabled: {
    color: '#94a3b8',
  },
  actionButtonBadge: {
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 2,
  },
  actionButtonBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
  },
  // Report Type Selector
  reportTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  reportTypeLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
    marginRight: 4,
  },
  reportTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  reportTypeButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  reportTypeButtonActiveGreen: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  reportTypeButtonActivePurple: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  reportTypeButtonDisabled: {
    opacity: 0.4,
  },
  reportTypeButtonText: {
    fontSize: 13,
    color: '#101235',
    fontWeight: '500',
  },
  reportTypeButtonTextActive: {
    color: '#ffffff',
  },
  reportTypeButtonTextDisabled: {
    color: '#94a3b8',
  },
  // Report Container
  reportContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  emptyReportContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 40,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyReportText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 12,
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
  soapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  soapTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  soapTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101235',
  },
  copyAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  copyAllText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
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
    flex: 1,
  },
  copySectionButton: {
    padding: 4,
  },
  soapSectionContent: {
    fontSize: 14,
    color: '#101235',
    lineHeight: 22,
    paddingLeft: 14,
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingTop: 12,
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
  bottomBarItemDisabled: {
    opacity: 0.5,
  },
  bottomBarIconContainer: {
    position: 'relative',
  },
  bottomBarLabel: {
    fontSize: 10,
    color: '#ffffff',
    marginTop: 4,
  },
  bottomBarLabelDisabled: {
    color: '#64748b',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    backgroundColor: '#1ce881',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#101235',
  },
  recordingButton: {
    alignItems: 'center',
    marginTop: -20,
  },
  recordingButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1ce881',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1ce881',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  recordingLabel: {
    fontSize: 10,
    color: '#1ce881',
    marginTop: 4,
    fontWeight: '500',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    minHeight: '50%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#101235',
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalCopyAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#eff6ff',
    borderRadius: 6,
  },
  modalCopyAllText: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '500',
  },
  modalScrollView: {
    flex: 1,
    padding: 20,
  },
  // Original Input
  originalInputContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
  },
  originalInputText: {
    fontSize: 14,
    color: '#101235',
    lineHeight: 22,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(28, 232, 129, 0.1)',
    borderRadius: 8,
  },
  copyButtonText: {
    fontSize: 13,
    color: '#1ce881',
    fontWeight: '500',
  },
  // Education Sections
  educationSection: {
    marginBottom: 20,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
  },
  educationSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  educationSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3b82f6',
    flex: 1,
  },
  educationSectionContent: {
    fontSize: 14,
    color: '#101235',
    lineHeight: 22,
  },
  // Medication List
  medicationList: {
    gap: 12,
  },
  medicationListSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 8,
  },
  medicationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  medicationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  medicationIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  medicationDetails: {
    flex: 1,
  },
  medicationName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#101235',
  },
  medicationDosage: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  medicationFrequency: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  medicationBadge: {
    backgroundColor: '#8b5cf6',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  medicationBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 12,
  },
  // Discharge Sections
  dischargeSection: {
    marginBottom: 20,
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#0ea5e9',
  },
  dischargeSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dischargeSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0ea5e9',
    flex: 1,
  },
  dischargeSectionContent: {
    fontSize: 14,
    color: '#101235',
    lineHeight: 22,
  },
  // Atlas Floating Button
  atlasFloatingButton: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    zIndex: 1000,
  },
  atlasButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1ce881',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1ce881',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  atlasMessageBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  atlasMessageBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
});
