import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';

export interface ConsultFormData {
  patientIdentification: string;
  presentingComplaint: string;
  vitals: string;
  physicalExamination: string;
  diagnostics: string;
  ownerConstraints: string;
}

interface TypeDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: ConsultFormData) => void;
  patientId: string;
  loading?: boolean;
}

export function TypeDetailsModal({
  visible,
  onClose,
  onSubmit,
  patientId,
  loading = false,
}: TypeDetailsModalProps) {
  const [formData, setFormData] = useState<ConsultFormData>({
    patientIdentification: '',
    presentingComplaint: '',
    vitals: '',
    physicalExamination: '',
    diagnostics: '',
    ownerConstraints: '',
  });

  const handleSubmit = () => {
    if (!formData.presentingComplaint.trim()) {
      return;
    }
    onSubmit(formData);
  };

  const updateField = (field: keyof ConsultFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
          style={styles.keyboardView}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#64748b" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Type Details</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
            <View style={styles.form}>
              <Text style={styles.patientIdLabel}>Patient ID: {patientId}</Text>

              {/* Patient Identification */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Patient Identification</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Max, 5-year-old male Golden Retriever"
                  placeholderTextColor="#94a3b8"
                  value={formData.patientIdentification}
                  onChangeText={(v) => updateField('patientIdentification', v)}
                  multiline
                />
                <Text style={styles.helperText}>
                  Include name, age, sex, species, and breed
                </Text>
              </View>

              {/* Presenting Complaint */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Presenting Complaint *</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="What brings them in today?"
                  placeholderTextColor="#94a3b8"
                  value={formData.presentingComplaint}
                  onChangeText={(v) => updateField('presentingComplaint', v)}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              {/* Vitals */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Vitals</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Temperature, heart rate, respiratory rate, weight..."
                  placeholderTextColor="#94a3b8"
                  value={formData.vitals}
                  onChangeText={(v) => updateField('vitals', v)}
                  multiline
                />
              </View>

              {/* Physical Examination */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Physical Examination</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Physical exam findings..."
                  placeholderTextColor="#94a3b8"
                  value={formData.physicalExamination}
                  onChangeText={(v) => updateField('physicalExamination', v)}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              {/* Diagnostics */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Diagnostics</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Lab results, imaging findings..."
                  placeholderTextColor="#94a3b8"
                  value={formData.diagnostics}
                  onChangeText={(v) => updateField('diagnostics', v)}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Owner's Constraints */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Owner's Constraints</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Budget limitations, scheduling constraints..."
                  placeholderTextColor="#94a3b8"
                  value={formData.ownerConstraints}
                  onChangeText={(v) => updateField('ownerConstraints', v)}
                  multiline
                />
              </View>

              <Button
                title={loading ? 'Generating SOAP...' : 'Generate SOAP Notes'}
                onPress={handleSubmit}
                loading={loading}
                disabled={!formData.presentingComplaint.trim()}
                style={styles.submitButton}
              />
            </View>
          </ScrollView>
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
  keyboardView: {
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
  scrollView: {
    flex: 1,
  },
  form: {
    padding: 16,
  },
  patientIdLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
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
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  helperText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 6,
  },
  submitButton: {
    marginTop: 8,
  },
});
