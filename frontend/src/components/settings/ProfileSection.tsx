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

interface ProfileSectionProps {
  profileData: any;
  userEmail: string;
  userId: string;
  onUpdate: () => void;
}

const NAME_PREFIXES = ['Dr.', 'Mr.', 'Ms.', 'Mrs.', 'None'];

export function ProfileSection({ profileData, userEmail, userId, onUpdate }: ProfileSectionProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(profileData?.name || '');
  const [email, setEmail] = useState(profileData?.email || userEmail);
  const [namePrefix, setNamePrefix] = useState(profileData?.name_prefix || 'Dr.');
  const [showPrefixPicker, setShowPrefixPicker] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          name: name.trim(),
          email: email.trim(),
          name_prefix: namePrefix === 'None' ? null : namePrefix,
        })
        .eq('user_id', userId);

      if (error) throw error;

      // Update auth email if changed
      if (email.trim() !== userEmail) {
        const { error: authError } = await supabase.auth.updateUser({
          email: email.trim(),
        });
        if (authError) throw authError;
        Alert.alert('Success', 'Profile updated. Check your new email for confirmation.');
      } else {
        Alert.alert('Success', 'Profile updated successfully');
      }

      setEditing(false);
      onUpdate();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const displayName = namePrefix === 'None' || !namePrefix
    ? name
    : `${namePrefix} ${name}`;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="person-outline" size={18} color="#64748b" />
          <Text style={styles.sectionTitle}>Profile Information</Text>
        </View>
        {!editing && (
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={styles.editButton}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.card}>
        {!editing ? (
          <>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Name</Text>
              <Text style={styles.value}>{displayName || 'Not set'}</Text>
            </View>
            <View style={[styles.infoRow, styles.infoRowLast]}>
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{email}</Text>
            </View>
          </>
        ) : (
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
                  <Text style={styles.modalTitle}>Edit Profile</Text>
                  <View style={{ width: 50 }} />
                </View>

                <ScrollView style={styles.modalScrollView} keyboardShouldPersistTaps="handled">
                  {/* Name Prefix */}
                  <Text style={styles.inputLabel}>Name Prefix</Text>
                  <TouchableOpacity
                    style={styles.prefixSelector}
                    onPress={() => setShowPrefixPicker(true)}
                  >
                    <Text style={styles.prefixText}>{namePrefix}</Text>
                    <Ionicons name="chevron-down" size={20} color="#64748b" />
                  </TouchableOpacity>

                  <Input
                    label="Full Name *"
                    placeholder="Your full name"
                    value={name}
                    onChangeText={setName}
                    leftIcon={<Ionicons name="person-outline" size={20} color="#64748b" />}
                  />

                  <Input
                    label="Email Address"
                    placeholder="your@email.com"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    leftIcon={<Ionicons name="mail-outline" size={20} color="#64748b" />}
                  />

                  <Text style={styles.helperText}>
                    Display name: {namePrefix === 'None' ? name : `${namePrefix} ${name}`}
                  </Text>

                  <Button
                    title="Save Changes"
                    onPress={handleSave}
                    loading={saving}
                    style={styles.saveButton}
                  />
                </ScrollView>

                {/* Prefix Picker Modal */}
                <Modal
                  visible={showPrefixPicker}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setShowPrefixPicker(false)}
                >
                  <TouchableOpacity
                    style={styles.pickerOverlay}
                    activeOpacity={1}
                    onPress={() => setShowPrefixPicker(false)}
                  >
                    <View style={styles.pickerContent}>
                      <Text style={styles.pickerTitle}>Select Prefix</Text>
                      {NAME_PREFIXES.map((prefix) => (
                        <TouchableOpacity
                          key={prefix}
                          style={[
                            styles.pickerOption,
                            namePrefix === prefix && styles.pickerOptionActive,
                          ]}
                          onPress={() => {
                            setNamePrefix(prefix);
                            setShowPrefixPicker(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.pickerOptionText,
                              namePrefix === prefix && styles.pickerOptionTextActive,
                            ]}
                          >
                            {prefix}
                          </Text>
                          {namePrefix === prefix && (
                            <Ionicons name="checkmark" size={20} color="#1ce881" />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </TouchableOpacity>
                </Modal>
              </KeyboardAvoidingView>
            </SafeAreaView>
          </Modal>
        )}
      </View>
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
  editButton: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1ce881',
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
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#101235',
    marginBottom: 8,
  },
  prefixSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  prefixText: {
    fontSize: 16,
    color: '#101235',
  },
  helperText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: -8,
    marginBottom: 16,
  },
  saveButton: {
    marginTop: 8,
  },
  // Picker Modal
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 300,
    overflow: 'hidden',
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101235',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  pickerOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  pickerOptionActive: {
    backgroundColor: 'rgba(28, 232, 129, 0.1)',
  },
  pickerOptionText: {
    fontSize: 16,
    color: '#101235',
  },
  pickerOptionTextActive: {
    fontWeight: '600',
    color: '#1ce881',
  },
});
