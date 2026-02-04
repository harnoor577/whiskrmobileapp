import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ReportGenerationOverlayProps {
  visible: boolean;
  isTranscribing?: boolean;
  isGenerating?: boolean;
  isComplete?: boolean;
  onAgree: () => void;
}

const STATUS_MESSAGES = [
  'Transcribing your recording...',
  'Processing audio content...',
  'Analyzing clinical findings...',
  'Extracting subjective history...',
  'Processing objective data...',
  'Formulating assessment...',
  'Generating treatment plan...',
  'Formatting SOAP notes...',
  'Almost ready...',
];

export function ReportGenerationOverlay({
  visible,
  isTranscribing = false,
  isGenerating = false,
  isComplete = false,
  onAgree,
}: ReportGenerationOverlayProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [dots, setDots] = useState('');
  const progressAnim = useState(new Animated.Value(0))[0];
  const pulseAnim = useState(new Animated.Value(1))[0];

  // Rotate through messages
  useEffect(() => {
    if (!visible || isComplete) {
      setMessageIndex(0);
      return;
    }

    const messageInterval = setInterval(() => {
      setMessageIndex(prev => 
        prev < STATUS_MESSAGES.length - 1 ? prev + 1 : prev
      );
    }, 2500);

    return () => clearInterval(messageInterval);
  }, [visible, isComplete]);

  // Animate dots
  useEffect(() => {
    if (!visible || isComplete) return;

    const dotsInterval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);

    return () => clearInterval(dotsInterval);
  }, [visible, isComplete]);

  // Progress animation
  useEffect(() => {
    if (isComplete) {
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } else if (visible) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(progressAnim, {
            toValue: 0.7,
            duration: 2000,
            useNativeDriver: false,
          }),
          Animated.timing(progressAnim, {
            toValue: 0.3,
            duration: 1000,
            useNativeDriver: false,
          }),
        ])
      ).start();
    }
  }, [visible, isComplete]);

  // Pulse animation for loading dots
  useEffect(() => {
    if (!visible || isComplete) return;

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
  }, [visible, isComplete]);

  if (!visible) return null;

  const currentMessage = isComplete 
    ? 'Report ready!' 
    : STATUS_MESSAGES[messageIndex];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Animated Icon */}
          <View style={styles.iconContainer}>
            <View style={styles.iconBackground}>
              <Ionicons 
                name={isComplete ? 'checkmark-circle' : 'pulse'} 
                size={48} 
                color="#1ce881" 
              />
            </View>
            {!isComplete && (
              <Animated.View 
                style={[
                  styles.iconRing,
                  { transform: [{ scale: pulseAnim }] }
                ]} 
              />
            )}
          </View>

          {/* Title */}
          <Text style={styles.title}>Generating SOAP Notes</Text>
          <Text style={styles.subtitle}>Atlas is analyzing your consultation</Text>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <Animated.View 
              style={[
                styles.progressBar,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]} 
            />
          </View>

          {/* Status Message */}
          <View style={styles.statusContainer}>
            <Text style={[styles.statusText, isComplete && styles.statusTextComplete]}>
              {currentMessage}
              {!isComplete && <Text style={styles.dots}>{dots}</Text>}
            </Text>
          </View>

          {/* Disclaimer */}
          <View style={styles.disclaimerContainer}>
            <Ionicons name="warning" size={18} color="#f59e0b" />
            <View style={styles.disclaimerContent}>
              <Text style={styles.disclaimerTitle}>Disclaimer:</Text>
              <Text style={styles.disclaimerText}>
                The information provided is generated for educational and informational purposes only. 
                It is not intended to replace professional judgment, diagnosis, or treatment. 
                Always consult a qualified professional for specific concerns.
              </Text>
            </View>
          </View>

          {/* Agree Button */}
          <TouchableOpacity
            style={[
              styles.agreeButton,
              !isComplete && styles.agreeButtonDisabled,
            ]}
            onPress={onAgree}
            disabled={!isComplete}
          >
            <Text style={[
              styles.agreeButtonText,
              !isComplete && styles.agreeButtonTextDisabled,
            ]}>
              {isComplete ? 'I Agree & Continue' : 'Please wait...'}
            </Text>
          </TouchableOpacity>

          {/* Loading Dots */}
          {!isComplete && (
            <View style={styles.loadingDots}>
              {[0, 1, 2].map(i => (
                <Animated.View
                  key={i}
                  style={[
                    styles.loadingDot,
                    {
                      opacity: pulseAnim.interpolate({
                        inputRange: [1, 1.2],
                        outputRange: [0.3, 0.8],
                      }),
                    },
                  ]}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  iconContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  iconBackground: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(28, 232, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: 'rgba(28, 232, 129, 0.3)',
    top: -10,
    left: -10,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#101235',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 20,
  },
  progressContainer: {
    width: '100%',
    height: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#1ce881',
    borderRadius: 3,
  },
  statusContainer: {
    minHeight: 24,
    marginBottom: 20,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1ce881',
    textAlign: 'center',
  },
  statusTextComplete: {
    color: '#1ce881',
  },
  dots: {
    width: 24,
  },
  disclaimerContainer: {
    flexDirection: 'row',
    backgroundColor: '#fefce8',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#fef08a',
  },
  disclaimerContent: {
    flex: 1,
    marginLeft: 10,
  },
  disclaimerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#101235',
    marginBottom: 4,
  },
  disclaimerText: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 16,
  },
  agreeButton: {
    width: '100%',
    backgroundColor: '#1ce881',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  agreeButtonDisabled: {
    backgroundColor: '#e2e8f0',
  },
  agreeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101235',
  },
  agreeButtonTextDisabled: {
    color: '#94a3b8',
  },
  loadingDots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1ce881',
  },
});
