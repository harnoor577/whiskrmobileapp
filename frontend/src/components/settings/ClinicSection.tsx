import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

interface ClinicSectionProps {
  clinicData: any;
  clinicId: string;
  onUpdate: () => void;
}

export function ClinicSection({ clinicData, clinicId, onUpdate }: ClinicSectionProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clinicName, setClinicName] = useState(clinicData?.name || '');
  const [clinicEmail, setClinicEmail] = useState(clinicData?.clinic_email || '');
  const [clinicPhone, setClinicPhone] = useState(clinicData?.phone || '');
  const [clinicAddress, setClinicAddress] = useState(clinicData?.address || '');

  const handleSave = async () => {
    if (!clinicName.trim()) {
      Alert.alert('Error', 'Clinic name is required');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('clinics')
        .update({
          name: clinicName.trim(),
          clinic_email: clinicEmail.trim() || null,
          phone: clinicPhone.trim() || null,
          address: clinicAddress.trim() || null,
        })
        .eq('id', clinicId);

      if (error) throw error;

      Alert.alert('Success', 'Clinic information updated');
      setEditing(false);
      onUpdate();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update clinic');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="business-outline" size={18} color="#64748b" />
          <Text style={styles.sectionTitle}>Clinic Information</Text>
        </View>
        <Text style={styles.adminBadge}>Admin</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Clinic Name</Text>
          <Text style={styles.value}>{clinicData?.name || 'Not set'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{clinicData?.clinic_email || 'Not set'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Phone</Text>
          <Text style={styles.value}>{clinicData?.phone || 'Not set'}</Text>
        </View>
        <View style={[styles.infoRow, styles.infoRowLast]}>
          <Text style={styles.label}>Address</Text>
          <Text style={styles.value}>{clinicData?.address || 'Not set'}</Text>
        </View>

        <TouchableOpacity
          style={styles.editButtonContainer}
          onPress={() => setEditing(true)}
        >
          <Text style={styles.editButtonText}>Edit Clinic Information</Text>
        </TouchableOpacity>
      </View>

      {/* Edit Modal */}
      <Modal
        visible={editing}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditing(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContent}
          >
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setEditing(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Edit Clinic</Text>
              <View style={{ width: 50 }} />
            </View>

            <ScrollView style={styles.modalScrollView} keyboardShouldPersistTaps="handled">
              <Input
                label="Clinic Name *"
                placeholder="Your Veterinary Clinic"
                value={clinicName}
                onChangeText={setClinicName}
                leftIcon={<Ionicons name="business-outline" size={20} color="#64748b" />}
              />

              <Input
                label="Clinic Email"
                placeholder="contact@clinic.com"
                value={clinicEmail}
                onChangeText={setClinicEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                leftIcon={<Ionicons name="mail-outline" size={20} color="#64748b" />}
              />
              <Text style={styles.helperText}>
                This email will appear in treatment plan PDFs
              </Text>

              <Input
                label="Phone"
                placeholder="(555) 123-4567"
                value={clinicPhone}
                onChangeText={setClinicPhone}
                keyboardType="phone-pad"
                leftIcon={<Ionicons name="call-outline" size={20} color="#64748b" />}
              />

              <Input
                label="Address"
                placeholder="123 Main Street, City, State ZIP"
                value={clinicAddress}
                onChangeText={setClinicAddress}
                leftIcon={<Ionicons name="location-outline" size={20} color="#64748b" />}
              />

              <Button
                title="Save Changes"
                onPress={handleSave}
                loading={saving}
                style={styles.saveButton}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  adminBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  infoRow: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  label: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  value: {
    fontSize: 15,
    fontWeight: '500',
    color: '#101235',
  },
  editButtonContainer: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1ce881',
  },
  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#fafbfc',
  },
  modalContent: {
    flex: 1,
  },
  modalHeader: {
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
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#101235',
  },
  modalScrollView: {
    flex: 1,
    padding: 16,
  },
  helperText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: -8,
    marginBottom: 16,
  },
  saveButton: {
    marginTop: 8,
  },
});
