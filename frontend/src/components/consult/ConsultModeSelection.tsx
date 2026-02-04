import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';

interface ConsultModeSelectionProps {
  visible: boolean;
  onClose: () => void;
  patientId: string;
  patientInfo: {
    id: string;
    name: string;
    species: string;
    breed?: string;
  } | null;
  onSelectMode: (mode: 'recording' | 'typing') => void;
  loading?: boolean;
}

export function ConsultModeSelection({
  visible,
  onClose,
  patientId,
  patientInfo,
  onSelectMode,
  loading = false,
}: ConsultModeSelectionProps) {
  const [selectedMode, setSelectedMode] = useState<'recording' | 'typing' | null>(null);

  const handleSelectMode = (mode: 'recording' | 'typing') => {
    setSelectedMode(mode);
    onSelectMode(mode);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#64748b" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.patientIdText}>Patient ID: {patientId}</Text>
            {patientInfo && (
              <Text style={styles.patientInfoText}>
                {patientInfo.name} • {patientInfo.species}
                {patientInfo.breed ? ` • ${patientInfo.breed}` : ''}
              </Text>
            )}
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.title}>Choose how you'd like to begin</Text>

          {/* Recording Option */}
          <TouchableOpacity
            style={[
              styles.optionCard,
              selectedMode === 'recording' && styles.optionCardSelected,
              loading && selectedMode !== 'recording' && styles.optionCardDisabled,
            ]}
            onPress={() => handleSelectMode('recording')}
            disabled={loading}
            activeOpacity={0.7}
          >
            <View style={styles.optionIconContainer}>
              <Ionicons name="mic" size={40} color="#101235" />
            </View>
            <Text style={styles.optionTitle}>Start Recording</Text>
            <Text style={styles.optionDescription}>
              Record audio. Atlas AI will transcribe and summarize it for you.
            </Text>
            {loading && selectedMode === 'recording' && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#1ce881" />
                <Text style={styles.loadingText}>Starting...</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Typing Option */}
          <TouchableOpacity
            style={[
              styles.optionCard,
              selectedMode === 'typing' && styles.optionCardSelected,
              loading && selectedMode !== 'typing' && styles.optionCardDisabled,
            ]}
            onPress={() => handleSelectMode('typing')}
            disabled={loading}
            activeOpacity={0.7}
          >
            <View style={styles.optionIconContainer}>
              <Ionicons name="create" size={40} color="#101235" />
            </View>
            <Text style={styles.optionTitle}>Type the Details</Text>
            <Text style={styles.optionDescription}>
              Manually enter consultation details and notes.
            </Text>
            {loading && selectedMode === 'typing' && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#1ce881" />
                <Text style={styles.loadingText}>Starting...</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafbfc',
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
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  patientIdText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101235',
  },
  patientInfoText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '500',
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
  },
  optionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  optionCardSelected: {
    borderColor: '#1ce881',
    backgroundColor: 'rgba(28, 232, 129, 0.05)',
  },
  optionCardDisabled: {
    opacity: 0.5,
  },
  optionIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#1ce881',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#101235',
    marginBottom: 8,
  },
  optionDescription: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#1ce881',
    fontWeight: '500',
  },
});
