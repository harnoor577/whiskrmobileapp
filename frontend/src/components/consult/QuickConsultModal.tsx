import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../ui/Button';
import { getSpeciesColor } from '../../utils/colors';
import { format } from 'date-fns';

interface Patient {
  id: string;
  name: string;
  species: string;
  breed?: string;
  date_of_birth?: string;
  identifiers?: { patient_id?: string };
}

interface QuickConsultModalProps {
  visible: boolean;
  onClose: () => void;
  prefilledPatientId?: string;
  prefilledPatientData?: Patient | null;
  onPatientSelected?: (patientId: string, patientInfo: Patient | null) => void;
}

// Normalize patient ID by removing leading zeros
const normalizePatientId = (id: string): string => {
  const trimmed = id.trim();
  if (!trimmed) return '';
  const parsed = parseInt(trimmed, 10);
  return isNaN(parsed) ? trimmed : String(parsed);
};

export function QuickConsultModal({ 
  visible, 
  onClose, 
  prefilledPatientId,
  prefilledPatientData,
  onPatientSelected,
}: QuickConsultModalProps) {
  const router = useRouter();
  const { clinicId, user } = useAuthStore();
  
  // Mode: 'id' for ID-based flow, 'search' for search-based flow
  const [mode, setMode] = useState<'search' | 'id'>('id');
  
  // Common state
  const [patientIdInput, setPatientIdInput] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [existingPatient, setExistingPatient] = useState<Patient | null>(null);
  const [lastConsult, setLastConsult] = useState<any>(null);
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [checking, setChecking] = useState(false);
  const [step, setStep] = useState<'input' | 'details'>('input');

  // Pre-fill data when provided
  useEffect(() => {
    if (prefilledPatientId) {
      setPatientIdInput(prefilledPatientId);
    }
    if (prefilledPatientData) {
      setExistingPatient(prefilledPatientData);
    }
  }, [prefilledPatientId, prefilledPatientData]);

  // Reset when modal closes
  useEffect(() => {
    if (!visible) {
      setPatientIdInput('');
      setPatientSearch('');
      setChiefComplaint('');
      setSelectedPatient(null);
      setExistingPatient(null);
      setLastConsult(null);
      setStep('input');
    }
  }, [visible]);

  // Debounced patient lookup by ID
  useEffect(() => {
    if (mode !== 'id') return;
    if (prefilledPatientData) return;

    const timer = setTimeout(async () => {
      if (!patientIdInput.trim() || !clinicId) {
        setExistingPatient(null);
        setLastConsult(null);
        return;
      }
      setChecking(true);
      try {
        const { data: patient } = await supabase
          .from('patients')
          .select('id, name, species, breed, date_of_birth, identifiers')
          .eq('clinic_id', clinicId)
          .eq('identifiers->>patient_id', normalizePatientId(patientIdInput))
          .maybeSingle();

        if (patient) {
          setExistingPatient(patient);
          
          const { data: consult } = await supabase
            .from('consults')
            .select('id, started_at, status, reason_for_visit')
            .eq('patient_id', patient.id)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          setLastConsult(consult || null);
        } else {
          setExistingPatient(null);
          setLastConsult(null);
        }
      } finally {
        setChecking(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [patientIdInput, clinicId, mode, prefilledPatientData]);

  // Search patients (for search mode)
  useEffect(() => {
    if (!visible || !clinicId || mode !== 'search') return;

    const searchPatients = async () => {
      if (!patientSearch.trim()) {
        // Load recent patients
        setSearching(true);
        const { data } = await supabase
          .from('patients')
          .select('id, name, species, breed, date_of_birth, identifiers')
          .eq('clinic_id', clinicId)
          .order('updated_at', { ascending: false })
          .limit(10);
        setPatients(data || []);
        setSearching(false);
        return;
      }

      setSearching(true);
      const { data } = await supabase
        .from('patients')
        .select('id, name, species, breed, date_of_birth, identifiers')
        .eq('clinic_id', clinicId)
        .or(`name.ilike.%${patientSearch}%,identifiers->>patient_id.ilike.%${patientSearch}%`)
        .limit(20);
      setPatients(data || []);
      setSearching(false);
    };

    const debounce = setTimeout(searchPatients, 300);
    return () => clearTimeout(debounce);
  }, [patientSearch, visible, clinicId, mode]);

  const calculateAge = (dob?: string | null) => {
    if (!dob) return 'Unknown';
    const birth = new Date(dob);
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    const hasHadBirthday =
      today.getMonth() > birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
    if (!hasHadBirthday) years -= 1;
    return `${years} year${years !== 1 ? 's' : ''}`;
  };

  const handleSelectPatient = (patient: Patient) => {
    if (onPatientSelected) {
      // Use new workflow - just pass patient to parent
      const patientId = patient.identifiers?.patient_id || patient.id;
      onPatientSelected(patientId, patient);
    } else {
      // Old workflow - handle internally
      setSelectedPatient(patient);
      setStep('details');
    }
  };

  const handleContinue = () => {
    if (!patientIdInput.trim()) {
      Alert.alert('Error', 'Please enter a patient ID');
      return;
    }
    
    if (onPatientSelected) {
      // Use new workflow - just pass patient info to parent
      onPatientSelected(normalizePatientId(patientIdInput), existingPatient);
    } else {
      // Old workflow - go to details step
      if (existingPatient) {
        setSelectedPatient(existingPatient);
      }
      setStep('details');
    }
  };

  const handleStartConsult = async () => {
    setLoading(true);
    try {
      let patientUUID = selectedPatient?.id || existingPatient?.id;
      
      // If no existing patient, create a placeholder patient
      if (!patientUUID && patientIdInput.trim()) {
        // Create default owner
        const { data: owner, error: ownerError } = await supabase
          .from('owners')
          .insert({
            clinic_id: clinicId,
            name: 'Unknown Owner',
          })
          .select()
          .single();

        if (ownerError) throw ownerError;

        // Create patient with minimal info
        const { data: patient, error: patientError } = await supabase
          .from('patients')
          .insert({
            clinic_id: clinicId,
            owner_id: owner.id,
            name: `Patient ${normalizePatientId(patientIdInput)}`,
            species: 'Unknown',
            identifiers: { patient_id: normalizePatientId(patientIdInput) },
          })
          .select()
          .single();

        if (patientError) throw patientError;
        patientUUID = patient.id;
      }

      if (!patientUUID) {
        Alert.alert('Error', 'Please select or enter a patient');
        setLoading(false);
        return;
      }

      // Create new consultation
      const { data: consult, error } = await supabase
        .from('consults')
        .insert({
          patient_id: patientUUID,
          clinic_id: clinicId,
          created_by: user?.id,
          status: 'draft',
          reason_for_visit: chiefComplaint.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      onClose();
      // Navigate to consult workspace
      router.push(`/(tabs)/consults` as any);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create consultation');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'details') {
      setStep('input');
      setSelectedPatient(null);
    } else {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.content}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
              <Ionicons name={step === 'input' ? 'close' : 'arrow-back'} size={24} color="#64748b" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {step === 'input' ? 'Start New Consult' : 'Consult Details'}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {step === 'input' ? (
            /* Patient Input Step */
            <ScrollView style={styles.scrollContent} keyboardShouldPersistTaps="handled">
              <View style={styles.form}>
                {/* Mode Toggle */}
                <View style={styles.modeToggle}>
                  <TouchableOpacity
                    style={[styles.modeButton, mode === 'id' && styles.modeButtonActive]}
                    onPress={() => setMode('id')}
                  >
                    <Ionicons name="id-card-outline" size={18} color={mode === 'id' ? '#1ce881' : '#64748b'} />
                    <Text style={[styles.modeButtonText, mode === 'id' && styles.modeButtonTextActive]}>
                      By Patient ID
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeButton, mode === 'search' && styles.modeButtonActive]}
                    onPress={() => setMode('search')}
                  >
                    <Ionicons name="search-outline" size={18} color={mode === 'search' ? '#1ce881' : '#64748b'} />
                    <Text style={[styles.modeButtonText, mode === 'search' && styles.modeButtonTextActive]}>
                      Search
                    </Text>
                  </TouchableOpacity>
                </View>

                {mode === 'id' ? (
                  /* ID-based lookup */
                  <>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Patient ID</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g., 12345"
                        placeholderTextColor="#94a3b8"
                        value={patientIdInput}
                        onChangeText={(text) => setPatientIdInput(text.replace(/[^0-9]/g, ''))}
                        keyboardType="numeric"
                        autoFocus
                      />
                      <Text style={styles.helperText}>Numbers only - no letters or special characters</Text>
                    </View>

                    {checking && (
                      <View style={styles.checkingContainer}>
                        <ActivityIndicator size="small" color="#1ce881" />
                        <Text style={styles.checkingText}>Checking for existing patient...</Text>
                      </View>
                    )}

                    {existingPatient && (
                      <View style={styles.patientFoundCard}>
                        <View style={styles.patientFoundHeader}>
                          <Ionicons name="checkmark-circle" size={20} color="#1ce881" />
                          <Text style={styles.patientFoundTitle}>Patient Found</Text>
                        </View>
                        <View style={styles.patientFoundContent}>
                          <View style={styles.patientInfo}>
                            <View style={[styles.patientAvatar, { backgroundColor: getSpeciesColor(existingPatient.species) }]}>
                              <Ionicons name="paw" size={24} color="#ffffff" />
                            </View>
                            <View style={styles.patientDetails}>
                              <Text style={styles.patientName}>{existingPatient.name}</Text>
                              <Text style={styles.patientMeta}>
                                {existingPatient.species}
                                {existingPatient.breed ? ` • ${existingPatient.breed}` : ''}
                              </Text>
                              <Text style={styles.patientAge}>
                                Age: {calculateAge(existingPatient.date_of_birth)}
                              </Text>
                            </View>
                          </View>
                          {lastConsult && (
                            <View style={styles.lastConsultInfo}>
                              <Ionicons name="time-outline" size={14} color="#64748b" />
                              <Text style={styles.lastConsultText}>
                                Last visit: {format(new Date(lastConsult.started_at), 'MMM dd, yyyy')}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    )}

                    <View style={styles.buttonRow}>
                      {existingPatient ? (
                        <>
                          <Button
                            title={loading ? 'Continuing...' : 'CONTINUE'}
                            onPress={handleContinue}
                            loading={loading}
                            style={styles.continueButton}
                          />
                          <Button
                            title="Re-enter ID"
                            variant="outline"
                            onPress={() => {
                              setPatientIdInput('');
                              setExistingPatient(null);
                              setLastConsult(null);
                            }}
                            style={styles.reenterButton}
                          />
                        </>
                      ) : (
                        <Button
                          title="CONTINUE"
                          onPress={handleContinue}
                          disabled={!patientIdInput.trim()}
                          style={styles.fullWidthButton}
                        />
                      )}
                    </View>
                  </>
                ) : (
                  /* Search-based lookup */
                  <>
                    <View style={styles.searchContainer}>
                      <Ionicons name="search" size={20} color="#64748b" />
                      <TextInput
                        style={styles.searchInput}
                        placeholder="Search patient by name or ID..."
                        placeholderTextColor="#94a3b8"
                        value={patientSearch}
                        onChangeText={setPatientSearch}
                        autoFocus
                      />
                      {patientSearch ? (
                        <TouchableOpacity onPress={() => setPatientSearch('')}>
                          <Ionicons name="close-circle" size={20} color="#64748b" />
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    {searching ? (
                      <ActivityIndicator style={styles.loader} color="#1ce881" />
                    ) : patients.length === 0 ? (
                      <View style={styles.emptyState}>
                        <Ionicons name="paw" size={48} color="#e2e8f0" />
                        <Text style={styles.emptyText}>
                          {patientSearch ? 'No patients found' : 'No recent patients'}
                        </Text>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.sectionLabel}>
                          {patientSearch ? 'Search Results' : 'Recent Patients'}
                        </Text>
                        {patients.map((patient) => (
                          <TouchableOpacity
                            key={patient.id}
                            style={styles.patientCard}
                            onPress={() => handleSelectPatient(patient)}
                          >
                            <View
                              style={[
                                styles.patientAvatarSmall,
                                { backgroundColor: getSpeciesColor(patient.species) },
                              ]}
                            >
                              <Ionicons name="paw" size={20} color="#ffffff" />
                            </View>
                            <View style={styles.patientCardInfo}>
                              <Text style={styles.patientCardName}>{patient.name}</Text>
                              <Text style={styles.patientCardMeta}>
                                {patient.breed || patient.species}
                                {patient.identifiers?.patient_id
                                  ? ` • ID: ${patient.identifiers.patient_id}`
                                  : ''}
                              </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                          </TouchableOpacity>
                        ))}
                      </>
                    )}
                  </>
                )}
              </View>
            </ScrollView>
          ) : (
            /* Consult Details Step */
            <ScrollView style={styles.scrollContent} keyboardShouldPersistTaps="handled">
              <View style={styles.form}>
                {/* Selected Patient Card */}
                {(selectedPatient || existingPatient) && (
                  <View style={styles.selectedPatientCard}>
                    <View
                      style={[
                        styles.patientAvatarLarge,
                        { backgroundColor: getSpeciesColor((selectedPatient || existingPatient)?.species || '') },
                      ]}
                    >
                      <Ionicons name="paw" size={28} color="#ffffff" />
                    </View>
                    <View style={styles.selectedPatientInfo}>
                      <Text style={styles.selectedPatientName}>
                        {(selectedPatient || existingPatient)?.name}
                      </Text>
                      <Text style={styles.selectedPatientMeta}>
                        {(selectedPatient || existingPatient)?.breed || (selectedPatient || existingPatient)?.species}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.changeButton}
                      onPress={() => {
                        setStep('input');
                        setSelectedPatient(null);
                      }}
                    >
                      <Text style={styles.changeButtonText}>Change</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Chief Complaint */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Chief Complaint (Optional)</Text>
                  <TextInput
                    style={styles.textArea}
                    placeholder="What brings them in today?"
                    placeholderTextColor="#94a3b8"
                    value={chiefComplaint}
                    onChangeText={setChiefComplaint}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </View>

                {/* Start Button */}
                <Button
                  title="Start Consultation"
                  onPress={handleStartConsult}
                  loading={loading}
                  style={styles.submitButton}
                  icon={<Ionicons name="mic" size={20} color="#101235" />}
                />
              </View>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafbfc',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#101235',
  },
  scrollContent: {
    flex: 1,
  },
  form: {
    padding: 16,
  },
  // Mode Toggle
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  modeButtonActive: {
    backgroundColor: '#ffffff',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  modeButtonTextActive: {
    color: '#1ce881',
  },
  // Input styles
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#101235',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#101235',
  },
  helperText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 6,
  },
  textArea: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#101235',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  // Checking state
  checkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  checkingText: {
    fontSize: 14,
    color: '#64748b',
  },
  // Patient Found Card
  patientFoundCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1ce881',
    marginBottom: 16,
    overflow: 'hidden',
  },
  patientFoundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(28, 232, 129, 0.1)',
  },
  patientFoundTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1ce881',
  },
  patientFoundContent: {
    padding: 14,
  },
  patientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  patientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  patientDetails: {
    flex: 1,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101235',
  },
  patientMeta: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  patientAge: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  lastConsultInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  lastConsultText: {
    fontSize: 12,
    color: '#64748b',
  },
  // Buttons
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  continueButton: {
    flex: 1,
  },
  reenterButton: {
    flex: 1,
  },
  fullWidthButton: {
    flex: 1,
  },
  submitButton: {
    marginTop: 8,
  },
  // Search styles
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: '#101235',
  },
  loader: {
    marginTop: 40,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  patientAvatarSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  patientCardInfo: {
    flex: 1,
  },
  patientCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101235',
  },
  patientCardMeta: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  // Selected Patient Card
  selectedPatientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 24,
  },
  patientAvatarLarge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  selectedPatientInfo: {
    flex: 1,
  },
  selectedPatientName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#101235',
  },
  selectedPatientMeta: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  changeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  changeButtonText: {
    fontSize: 14,
    color: '#1ce881',
    fontWeight: '600',
  },
});
