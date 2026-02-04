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

interface ProfessionalSectionProps {
  profileData: any;
  userId: string;
  onUpdate: () => void;
}

const VET_SCHOOLS = [
  'Auburn University',
  'Colorado State University',
  'Cornell University',
  'Iowa State University',
  'Kansas State University',
  'Louisiana State University',
  'Michigan State University',
  'Mississippi State University',
  'North Carolina State University',
  'Ohio State University',
  'Oklahoma State University',
  'Oregon State University',
  'Purdue University',
  'Texas A&M University',
  'Tufts University',
  'Tuskegee University',
  'University of California, Davis',
  'University of Florida',
  'University of Georgia',
  'University of Illinois',
  'University of Minnesota',
  'University of Missouri',
  'University of Pennsylvania',
  'University of Tennessee',
  'University of Wisconsin-Madison',
  'Virginia-Maryland College',
  'Washington State University',
  'Western University of Health Sciences',
  'University of Guelph',
  'University of Montreal',
  'University of Prince Edward Island',
  'University of Calgary',
  'University of Saskatchewan',
  'Royal Veterinary College (UK)',
  'University of Edinburgh (UK)',
  'University of Glasgow (UK)',
  'Utrecht University (Netherlands)',
  'University of Sydney (Australia)',
  'Massey University (New Zealand)',
  'Other',
];

const PRACTICE_TYPES = [
  { id: 'general', label: 'General Practice' },
  { id: 'emergency', label: 'Emergency' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'relief_locum', label: 'Relief/Locum' },
];

export function ProfessionalSection({ profileData, userId, onUpdate }: ProfessionalSectionProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userType, setUserType] = useState<'dvm' | 'student' | ''>(profileData?.user_type || '');
  const [practiceTypes, setPracticeTypes] = useState<string[]>(profileData?.practice_types || []);
  const [regionInput, setRegionInput] = useState(
    [profileData?.city, profileData?.state_province, profileData?.country].filter(Boolean).join(', ')
  );
  const [schoolName, setSchoolName] = useState(profileData?.school_name || '');
  const [showSchoolPicker, setShowSchoolPicker] = useState(false);

  const togglePracticeType = (id: string) => {
    setPracticeTypes((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const splitRegion = (input: string) => {
    const parts = input.split(',').map((p) => p.trim()).filter(Boolean);
    const city = parts[0] || '';
    const country = parts.length >= 2 ? parts[parts.length - 1] : '';
    const state_province = parts.length >= 3 ? parts[parts.length - 2] : '';
    return { city, state_province, country };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { city, state_province, country } = splitRegion(regionInput);
      const update: any = {
        user_type: userType || null,
      };

      if (userType === 'dvm') {
        update.city = city || null;
        update.state_province = state_province || null;
        update.country = country || null;
        update.practice_types = practiceTypes;
        update.school_name = null;
      } else if (userType === 'student') {
        update.city = null;
        update.state_province = null;
        update.country = null;
        update.practice_types = null;
        update.school_name = schoolName || null;
      }

      const { error } = await supabase
        .from('profiles')
        .update(update)
        .eq('user_id', userId);

      if (error) throw error;

      Alert.alert('Success', 'Professional info updated');
      setEditing(false);
      onUpdate();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const getUserTypeLabel = () => {
    if (userType === 'dvm') return 'Doctor of Veterinary Medicine (DVM)';
    if (userType === 'student') return 'Veterinary Student';
    return 'Not specified';
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="school-outline" size={18} color="#64748b" />
          <Text style={styles.sectionTitle}>Professional Information</Text>
        </View>
      </View>

      <View style={styles.card}>
        {/* Current Selection Display */}
        <View style={styles.currentSelection}>
          <Text style={styles.userTypeLabel}>
            {userType === 'dvm' ? '🩺 ' : userType === 'student' ? '🎓 ' : ''}
            {getUserTypeLabel()}
          </Text>

          {userType === 'student' && schoolName && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>School</Text>
              <Text style={styles.infoValue}>{schoolName}</Text>
            </View>
          )}

          {userType === 'dvm' && (
            <>
              {regionInput && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Region</Text>
                  <Text style={styles.infoValue}>{regionInput}</Text>
                </View>
              )}

              {practiceTypes.length > 0 && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Practice Types</Text>
                  <View style={styles.practiceTypeBadges}>
                    {practiceTypes.map((typeId) => {
                      const type = PRACTICE_TYPES.find((t) => t.id === typeId);
                      return type ? (
                        <View key={typeId} style={styles.practiceTypeBadge}>
                          <Text style={styles.practiceTypeBadgeText}>{type.label}</Text>
                        </View>
                      ) : null;
                    })}
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        <TouchableOpacity
          style={styles.editButtonContainer}
          onPress={() => setEditing(true)}
        >
          <Text style={styles.editButtonText}>Change Selection</Text>
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
              <Text style={styles.modalTitle}>Professional Info</Text>
              <View style={{ width: 50 }} />
            </View>

            <ScrollView style={styles.modalScrollView} keyboardShouldPersistTaps="handled">
              {/* User Type Selection */}
              <Text style={styles.inputLabel}>I am a *</Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={[
                    styles.radioOption,
                    userType === 'dvm' && styles.radioOptionActive,
                  ]}
                  onPress={() => setUserType('dvm')}
                >
                  <View style={styles.radio}>
                    {userType === 'dvm' && <View style={styles.radioInner} />}
                  </View>
                  <Text style={styles.radioLabel}>Doctor of Veterinary Medicine (DVM)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.radioOption,
                    userType === 'student' && styles.radioOptionActive,
                  ]}
                  onPress={() => setUserType('student')}
                >
                  <View style={styles.radio}>
                    {userType === 'student' && <View style={styles.radioInner} />}
                  </View>
                  <Text style={styles.radioLabel}>Veterinary Student</Text>
                </TouchableOpacity>
              </View>

              {/* Student Section */}
              {userType === 'student' && (
                <View style={styles.conditionalSection}>
                  <Text style={styles.inputLabel}>School Name *</Text>
                  <TouchableOpacity
                    style={styles.selector}
                    onPress={() => setShowSchoolPicker(true)}
                  >
                    <Text style={schoolName ? styles.selectorText : styles.selectorPlaceholder}>
                      {schoolName || 'Select your veterinary school'}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color="#64748b" />
                  </TouchableOpacity>
                </View>
              )}

              {/* DVM Section */}
              {userType === 'dvm' && (
                <View style={styles.conditionalSection}>
                  <Input
                    label="Region of Practice *"
                    placeholder="City, State/Province, Country"
                    value={regionInput}
                    onChangeText={setRegionInput}
                    leftIcon={<Ionicons name="location-outline" size={20} color="#64748b" />}
                  />
                  <Text style={styles.helperText}>
                    e.g., Los Angeles, California, United States
                  </Text>

                  <Text style={styles.inputLabel}>Type of Practice *</Text>
                  <View style={styles.checkboxGroup}>
                    {PRACTICE_TYPES.map((type) => (
                      <TouchableOpacity
                        key={type.id}
                        style={styles.checkboxOption}
                        onPress={() => togglePracticeType(type.id)}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            practiceTypes.includes(type.id) && styles.checkboxActive,
                          ]}
                        >
                          {practiceTypes.includes(type.id) && (
                            <Ionicons name="checkmark" size={14} color="#ffffff" />
                          )}
                        </View>
                        <Text style={styles.checkboxLabel}>{type.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <Button
                title="Save Changes"
                onPress={handleSave}
                loading={saving}
                style={styles.saveButton}
              />
            </ScrollView>

            {/* School Picker Modal */}
            <Modal
              visible={showSchoolPicker}
              animationType="slide"
              presentationStyle="pageSheet"
              onRequestClose={() => setShowSchoolPicker(false)}
            >
              <SafeAreaView style={styles.pickerContainer}>
                <View style={styles.pickerHeader}>
                  <TouchableOpacity onPress={() => setShowSchoolPicker(false)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.modalTitle}>Select School</Text>
                  <View style={{ width: 50 }} />
                </View>
                <ScrollView style={styles.pickerScrollView}>
                  {VET_SCHOOLS.map((school) => (
                    <TouchableOpacity
                      key={school}
                      style={[
                        styles.pickerOption,
                        schoolName === school && styles.pickerOptionActive,
                      ]}
                      onPress={() => {
                        setSchoolName(school);
                        setShowSchoolPicker(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          schoolName === school && styles.pickerOptionTextActive,
                        ]}
                      >
                        {school}
                      </Text>
                      {schoolName === school && (
                        <Ionicons name="checkmark" size={20} color="#1ce881" />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </SafeAreaView>
            </Modal>
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  currentSelection: {
    padding: 14,
  },
  userTypeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#101235',
    marginBottom: 12,
  },
  infoItem: {
    marginTop: 8,
  },
  infoLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: '#101235',
  },
  practiceTypeBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  practiceTypeBadge: {
    backgroundColor: 'rgba(28, 232, 129, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  practiceTypeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1ce881',
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
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#101235',
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: -8,
    marginBottom: 16,
  },
  // Radio Group
  radioGroup: {
    marginBottom: 20,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },
  radioOptionActive: {
    borderColor: '#1ce881',
    backgroundColor: 'rgba(28, 232, 129, 0.05)',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1ce881',
  },
  radioLabel: {
    fontSize: 15,
    color: '#101235',
  },
  // Conditional Section
  conditionalSection: {
    backgroundColor: 'rgba(100, 116, 139, 0.05)',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  selector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
  },
  selectorText: {
    fontSize: 15,
    color: '#101235',
  },
  selectorPlaceholder: {
    fontSize: 15,
    color: '#94a3b8',
  },
  // Checkbox Group
  checkboxGroup: {
    gap: 8,
  },
  checkboxOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxActive: {
    backgroundColor: '#1ce881',
    borderColor: '#1ce881',
  },
  checkboxLabel: {
    fontSize: 15,
    color: '#101235',
  },
  saveButton: {
    marginTop: 16,
  },
  // School Picker
  pickerContainer: {
    flex: 1,
    backgroundColor: '#fafbfc',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  pickerScrollView: {
    flex: 1,
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
    fontSize: 15,
    color: '#101235',
  },
  pickerOptionTextActive: {
    fontWeight: '600',
    color: '#1ce881',
  },
});
