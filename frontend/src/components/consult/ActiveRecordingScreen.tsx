import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { RecordingConsentModal } from './RecordingConsentModal';

interface ActiveRecordingScreenProps {
  visible: boolean;
  onClose: () => void;
  onRecordingComplete: (uri: string, duration: number) => void;
  patientId: string;
  patientInfo: {
    name: string;
    species: string;
    breed?: string;
  } | null;
}

export function ActiveRecordingScreen({
  visible,
  onClose,
  onRecordingComplete,
  patientId,
  patientInfo,
}: ActiveRecordingScreenProps) {
  const [showConsent, setShowConsent] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [waveformData, setWaveformData] = useState<number[]>(new Array(30).fill(10));
  
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const waveformRef = useRef<NodeJS.Timeout | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setShowConsent(true);
      setIsRecording(false);
      setIsPaused(false);
      setElapsedTime(0);
      setWaveformData(new Array(30).fill(10));
    } else {
      stopRecording(false);
    }
  }, [visible]);

  // Timer effect
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused]);

  // Waveform animation
  useEffect(() => {
    if (isRecording && !isPaused) {
      waveformRef.current = setInterval(() => {
        setWaveformData(prev => 
          prev.map(() => Math.random() * 80 + 20)
        );
      }, 100);
    } else {
      if (waveformRef.current) {
        clearInterval(waveformRef.current);
        waveformRef.current = null;
      }
      // Idle animation
      setWaveformData(prev => prev.map(() => Math.random() * 10 + 5));
    }
    return () => {
      if (waveformRef.current) clearInterval(waveformRef.current);
    };
  }, [isRecording, isPaused]);

  // Pulse animation for recording indicator
  useEffect(() => {
    if (isRecording && !isPaused) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, isPaused]);

  const handleConsentAgree = async () => {
    setShowConsent(false);
    await startRecording();
  };

  const handleConsentCancel = () => {
    setShowConsent(false);
    onClose();
  };

  const startRecording = async () => {
    try {
      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow microphone access to record.',
          [{ text: 'OK', onPress: onClose }]
        );
        return;
      }

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Start recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
      onClose();
    }
  };

  const pauseRecording = async () => {
    if (!recordingRef.current) return;
    
    try {
      if (isPaused) {
        await recordingRef.current.startAsync();
        setIsPaused(false);
      } else {
        await recordingRef.current.pauseAsync();
        setIsPaused(true);
      }
    } catch (error) {
      console.error('Failed to pause/resume recording:', error);
    }
  };

  const stopRecording = async (shouldComplete = true) => {
    if (!recordingRef.current) return;

    try {
      await recordingRef.current.stopAndUnloadAsync();
      
      if (shouldComplete && elapsedTime >= 3) {
        const uri = recordingRef.current.getURI();
        if (uri) {
          onRecordingComplete(uri, elapsedTime);
        }
      } else if (shouldComplete && elapsedTime < 3) {
        Alert.alert(
          'Recording too short',
          'Please record for at least 3 seconds.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
    } finally {
      recordingRef.current = null;
      setIsRecording(false);
      setIsPaused(false);
      
      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
    }
  };

  const handleBack = () => {
    stopRecording(false);
    onClose();
  };

  const handleStopRecording = () => {
    if (elapsedTime < 3) {
      Alert.alert(
        'Recording too short',
        'Please record for at least 3 seconds.',
        [{ text: 'OK' }]
      );
      return;
    }
    stopRecording(true);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleBack}
    >
      <RecordingConsentModal
        visible={showConsent}
        onAgree={handleConsentAgree}
        onCancel={handleConsentCancel}
      />
      
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#64748b" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Active Recording</Text>
            <Text style={styles.headerSubtitle}>
              Patient ID: {patientId}
              {patientInfo ? ` - ${patientInfo.name}` : ''}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Instructions */}
        <View style={styles.instructionsContainer}>
          <View style={styles.instructionsHeader}>
            <Ionicons name="mic" size={18} color="#1ce881" />
            <Text style={styles.instructionsTitle}>Instructions for Best Results</Text>
          </View>
          <Text style={styles.instructionsText}>
            Please verbally include: <Text style={styles.highlight}>Presenting Complaint</Text>,{' '}
            <Text style={styles.highlight}>Vitals</Text>,{' '}
            <Text style={styles.highlight}>Physical Examination</Text>,{' '}
            <Text style={styles.highlight}>Diagnostics</Text>, and{' '}
            <Text style={styles.highlight}>Owner's Constraints</Text>.
          </Text>
        </View>

        {/* Recording Area */}
        <View style={styles.recordingArea}>
          {/* Recording Indicator */}
          <Animated.View 
            style={[
              styles.recordingIndicator,
              { transform: [{ scale: pulseAnim }] },
              isPaused && styles.recordingIndicatorPaused,
            ]}
          >
            <Ionicons 
              name={isPaused ? 'pause' : 'mic'} 
              size={48} 
              color="#ffffff" 
            />
          </Animated.View>

          {/* Timer */}
          <Text style={styles.timer}>{formatTime(elapsedTime)}</Text>

          {/* Waveform */}
          <View style={styles.waveformContainer}>
            {waveformData.map((height, index) => (
              <View
                key={index}
                style={[
                  styles.waveformBar,
                  { 
                    height: `${height}%`,
                    backgroundColor: isPaused ? '#fbbf24' : '#1ce881',
                  },
                ]}
              />
            ))}
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={pauseRecording}
              disabled={!isRecording}
            >
              <Ionicons 
                name={isPaused ? 'play' : 'pause'} 
                size={24} 
                color="#64748b" 
              />
              <Text style={styles.controlButtonText}>
                {isPaused ? 'Resume' : 'Pause'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, styles.stopButton]}
              onPress={handleStopRecording}
              disabled={!isRecording}
            >
              <Ionicons name="stop" size={24} color="#ef4444" />
              <Text style={[styles.controlButtonText, styles.stopButtonText]}>Stop</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View 
            style={[
              styles.progressBar,
              { width: `${Math.min((elapsedTime / 300) * 100, 100)}%` }
            ]} 
          />
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
  headerSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  instructionsContainer: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  instructionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#101235',
  },
  instructionsText: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 20,
  },
  highlight: {
    color: '#1ce881',
    fontWeight: '500',
  },
  recordingArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  recordingIndicator: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1ce881',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#1ce881',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  recordingIndicatorPaused: {
    backgroundColor: '#fbbf24',
    shadowColor: '#fbbf24',
  },
  timer: {
    fontSize: 56,
    fontWeight: '300',
    color: '#101235',
    fontVariant: ['tabular-nums'],
    marginBottom: 32,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 80,
    gap: 3,
    marginBottom: 40,
  },
  waveformBar: {
    width: 4,
    borderRadius: 2,
    opacity: 0.8,
  },
  controls: {
    flexDirection: 'row',
    gap: 16,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  controlButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#64748b',
  },
  stopButton: {
    borderColor: '#fecaca',
  },
  stopButtonText: {
    color: '#ef4444',
  },
  progressContainer: {
    height: 4,
    backgroundColor: 'rgba(28, 232, 129, 0.2)',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#1ce881',
  },
});
