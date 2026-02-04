import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface AddPatientModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const speciesOptions = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Fish', 'Reptile', 'Other'];
const sexOptions = ['Male', 'Female', 'Unknown'];

export function AddPatientModal({ visible, onClose, onSuccess }: AddPatientModalProps) {
  const { clinicId, user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    patientId: '',
    species: '',
    breed: '',
    sex: '',
    ageYears: '',
    ageMonths: '',
    weight: '',
    ownerName: '',
    ownerPhone: '',
    ownerEmail: '',
  });

  const resetForm = () => {
    setForm({
      name: '',
      patientId: '',
      species: '',
      breed: '',
      sex: '',
      ageYears: '',
      ageMonths: '',
      weight: '',
      ownerName: '',
      ownerPhone: '',
      ownerEmail: '',
    });
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      Alert.alert('Error', 'Patient name is required');
      return;
    }
    if (!form.species) {
      Alert.alert('Error', 'Please select a species');
      return;
    }

    setLoading(true);
    try {
      const patientData: any = {
        name: form.name.trim(),
        species: form.species,
        breed: form.breed.trim() || null,
        sex: form.sex || null,
        clinic_id: clinicId,
        created_by: user?.id,
        owner_name: form.ownerName.trim() || null,
        owner_phone: form.ownerPhone.trim() || null,
        owner_email: form.ownerEmail.trim() || null,
      };

      // Add identifiers if patient ID provided
      if (form.patientId.trim()) {
        patientData.identifiers = { patient_id: form.patientId.trim() };
      }

      // Calculate age in months
      const years = parseInt(form.ageYears) || 0;
      const months = parseInt(form.ageMonths) || 0;
      if (years > 0 || months > 0) {
        patientData.age_months = years * 12 + months;
      }

      // Add weight
      if (form.weight) {
        patientData.weight_kg = parseFloat(form.weight);
      }

      const { error } = await supabase.from('patients').insert(patientData);

      if (error) throw error;

      Alert.alert('Success', 'Patient added successfully');
      resetForm();
      onSuccess();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add patient');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.content}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Add Patient</Text>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Patient Info Section */}
            <Text style={styles.sectionTitle}>Patient Information</Text>

            <Input
              label="Patient Name *"
              placeholder="e.g., Max, Bella"
              value={form.name}
              onChangeText={(text) => setForm({ ...form, name: text })}
              leftIcon={<Ionicons name="paw-outline" size={20} color="#64748b" />}
            />

            <Input
              label="Patient ID"
              placeholder="e.g., 12345"
              value={form.patientId}
              onChangeText={(text) => setForm({ ...form, patientId: text })}
              leftIcon={<Ionicons name="barcode-outline" size={20} color="#64748b" />}
            />

            {/* Species Selector */}
            <Text style={styles.inputLabel}>Species *</Text>
            <View style={styles.optionsRow}>
              {speciesOptions.map((species) => (
                <TouchableOpacity
                  key={species}
                  style={[
                    styles.optionButton,
                    form.species === species && styles.optionButtonActive,
                  ]}
                  onPress={() => setForm({ ...form, species })}
                >
                  <Text
                    style={[
                      styles.optionText,
                      form.species === species && styles.optionTextActive,
                    ]}
                  >
                    {species}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Input
              label="Breed"
              placeholder="e.g., Golden Retriever"
              value={form.breed}
              onChangeText={(text) => setForm({ ...form, breed: text })}
            />

            {/* Sex Selector */}
            <Text style={styles.inputLabel}>Sex</Text>
            <View style={styles.optionsRow}>
              {sexOptions.map((sex) => (
                <TouchableOpacity
                  key={sex}
                  style={[
                    styles.optionButton,
                    form.sex === sex && styles.optionButtonActive,
                  ]}
                  onPress={() => setForm({ ...form, sex })}
                >
                  <Text
                    style={[
                      styles.optionText,
                      form.sex === sex && styles.optionTextActive,
                    ]}
                  >
                    {sex}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Age */}
            <Text style={styles.inputLabel}>Age</Text>
            <View style={styles.ageRow}>
              <View style={styles.ageInput}>
                <TextInput
                  style={styles.ageTextInput}
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                  keyboardType="number-pad"
                  value={form.ageYears}
                  onChangeText={(text) => setForm({ ...form, ageYears: text })}
                />
                <Text style={styles.ageLabel}>Years</Text>
              </View>
              <View style={styles.ageInput}>
                <TextInput
                  style={styles.ageTextInput}
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                  keyboardType="number-pad"
                  value={form.ageMonths}
                  onChangeText={(text) => setForm({ ...form, ageMonths: text })}
                />
                <Text style={styles.ageLabel}>Months</Text>
              </View>
            </View>

            <Input
              label="Weight (kg)"
              placeholder="e.g., 25.5"
              value={form.weight}
              onChangeText={(text) => setForm({ ...form, weight: text })}
              keyboardType="decimal-pad"
              leftIcon={<Ionicons name="scale-outline" size={20} color="#64748b" />}
            />

            {/* Owner Info Section */}
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Owner Information</Text>

            <Input
              label="Owner Name"
              placeholder="e.g., John Smith"
              value={form.ownerName}
              onChangeText={(text) => setForm({ ...form, ownerName: text })}
              leftIcon={<Ionicons name="person-outline" size={20} color="#64748b" />}
            />

            <Input
              label="Phone"
              placeholder="e.g., (555) 123-4567"
              value={form.ownerPhone}
              onChangeText={(text) => setForm({ ...form, ownerPhone: text })}
              keyboardType="phone-pad"
              leftIcon={<Ionicons name="call-outline" size={20} color="#64748b" />}
            />

            <Input
              label="Email"
              placeholder="e.g., john@email.com"
              value={form.ownerEmail}
              onChangeText={(text) => setForm({ ...form, ownerEmail: text })}
              keyboardType="email-address"
              autoCapitalize="none"
              leftIcon={<Ionicons name="mail-outline" size={20} color="#64748b" />}
            />

            <Button
              title="Add Patient"
              onPress={handleSubmit}
              loading={loading}
              style={styles.submitButton}
            />

            <View style={{ height: 40 }} />
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
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  cancelText: {
    fontSize: 16,
    color: '#1ce881',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#101235',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#101235',
    marginBottom: 8,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  optionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  optionButtonActive: {
    backgroundColor: '#1ce881',
    borderColor: '#1ce881',
  },
  optionText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  optionTextActive: {
    color: '#101235',
  },
  ageRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  ageInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ageTextInput: {
    flex: 1,
    fontSize: 16,
    color: '#101235',
  },
  ageLabel: {
    fontSize: 14,
    color: '#64748b',
    marginLeft: 8,
  },
  submitButton: {
    marginTop: 24,
  },
});
