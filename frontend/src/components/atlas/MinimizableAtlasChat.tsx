import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AtlasEye } from './AtlasEye';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';

// Get backend URL from environment
const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                    process.env.EXPO_PUBLIC_BACKEND_URL || 
                    '';

interface MinimizableAtlasChatProps {
  transcription: string | null;
  isTranscribing?: boolean;
  patientInfo: {
    patientId: string;
    name: string;
    species: string;
  } | null;
  consultId: string;
  inline?: boolean;
  readOnly?: boolean;
  onMessageCountChange?: (count: number) => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface DifferentialItem {
  name: string;
  reason?: string;
  treatmentPlan?: string;
  isLoading?: boolean;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// API call helper function
const callAnalyzeRecording = async (params: {
  transcription?: string | null;
  patientInfo?: { patientId: string; name: string; species: string } | null;
  consultId?: string;
  followUpQuestion?: string;
  previousMessages?: Array<{ role: string; content: string }>;
}) => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/analyze-recording`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API call error:', error);
    throw error;
  }
};

export const MinimizableAtlasChat: React.FC<MinimizableAtlasChatProps> = ({
  transcription,
  isTranscribing = false,
  patientInfo,
  consultId,
  inline = false,
  readOnly = false,
  onMessageCountChange,
}) => {
  const [isOpen, setIsOpen] = useState(inline);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  // Expandable card states
  const [caseSummaryOpen, setCaseSummaryOpen] = useState(false);
  const [differentialsOpen, setDifferentialsOpen] = useState(false);
  const [differentials, setDifferentials] = useState<DifferentialItem[]>([]);
  const [selectedDifferential, setSelectedDifferential] = useState<string | null>(null);
  const [differentialsLoaded, setDifferentialsLoaded] = useState(false);
  const [differentialsLoading, setDifferentialsLoading] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for new messages
  useEffect(() => {
    if (hasNewMessage) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [hasNewMessage]);

  // Update message count
  useEffect(() => {
    onMessageCountChange?.(messages.length);
  }, [messages.length, onMessageCountChange]);

  // Parse differentials from AI response
  const parseDifferentials = (analysisContent: string): DifferentialItem[] => {
    const lines = analysisContent.split('\n');
    const differentialsList: DifferentialItem[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      const numberedMatch = trimmedLine.match(/^(\d+)\.\s*\**([^:*\n]+)\**/);
      if (numberedMatch) {
        const name = numberedMatch[2].replace(/[*_]/g, '').trim();
        if (name && name.length > 2 && name.length < 100 && !differentialsList.some(d => d.name.toLowerCase() === name.toLowerCase())) {
          differentialsList.push({ name });
        }
        continue;
      }

      const bulletMatch = trimmedLine.match(/^[\-\*\•]\s*\**([^:*\n]+)\**/);
      if (bulletMatch) {
        const name = bulletMatch[1].replace(/[*_]/g, '').trim();
        if (name && name.length > 2 && name.length < 100 && !differentialsList.some(d => d.name.toLowerCase() === name.toLowerCase())) {
          differentialsList.push({ name });
        }
      }
    }

    return differentialsList.slice(0, 5);
  };

  // Fetch differentials on-demand
  const fetchDifferentials = async () => {
    if (differentialsLoading || differentialsLoaded) return;

    setDifferentialsLoading(true);
    try {
      const data = await callAnalyzeRecording({
        transcription,
        patientInfo,
        consultId,
        followUpQuestion: 'Based on this case, please provide your top 3-5 differential diagnoses. Format each as a numbered list (1. 2. 3. etc.) with just the condition name on each line.',
        previousMessages: messages.map(m => ({ role: m.role, content: m.content })),
      });

      if (data?.analysis) {
        const parsed = parseDifferentials(data.analysis);
        setDifferentials(parsed);
        setDifferentialsLoaded(true);
      }
    } catch (error) {
      console.error('Error fetching differentials:', error);
      Alert.alert('Error', 'Failed to analyze differentials. Please try again.');
    } finally {
      setDifferentialsLoading(false);
    }
  };

  // Auto-analyze when transcription is ready (skip in readOnly mode)
  useEffect(() => {
    if (readOnly) return;
    if (transcription && messages.length === 0 && !isAnalyzing) {
      analyzeCase();
    }
  }, [transcription, readOnly]);

  // Load existing messages when in readOnly mode
  useEffect(() => {
    if (!readOnly) return;

    const loadExistingMessages = async () => {
      setIsAnalyzing(true);
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('id, role, content, created_at')
          .eq('consult_id', consultId)
          .order('created_at', { ascending: true });

        if (!error && data && data.length > 0) {
          const formattedMessages: Message[] = data
            .filter(m => m.role !== 'system')
            .map(m => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
            }));
          setMessages(formattedMessages);
          setShowSuggestions(true);
        }
      } catch (error) {
        console.error('Error loading messages:', error);
      } finally {
        setIsAnalyzing(false);
      }
    };

    loadExistingMessages();
  }, [readOnly, consultId]);

  // Flash notification when new message arrives while minimized
  useEffect(() => {
    if (!isOpen && messages.length > 0) {
      setHasNewMessage(true);
    }
  }, [messages.length]);

  // Clear notification when opened
  useEffect(() => {
    if (isOpen) {
      setHasNewMessage(false);
    }
  }, [isOpen]);

  const saveMessageToDb = async (role: 'user' | 'assistant', content: string) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('clinic_id')
        .eq('user_id', userData.user.id)
        .single();

      if (!profile?.clinic_id) return;

      await supabase.from('chat_messages').insert({
        consult_id: consultId,
        clinic_id: profile.clinic_id,
        user_id: userData.user.id,
        role,
        content,
      });
    } catch (error) {
      console.error('Error saving message:', error);
    }
  };

  const analyzeCase = async () => {
    if (!transcription) return;
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-recording', {
        body: {
          transcription,
          patientInfo,
          consultId,
        },
      });
      if (error) throw error;
      if (data?.analysis) {
        const newMessage = {
          id: Date.now().toString(),
          role: 'assistant' as const,
          content: data.analysis,
        };
        setMessages([newMessage]);
        await saveMessageToDb('assistant', data.analysis);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Analysis error:', error);
      const errorMessage = "I'm having trouble analyzing this case right now. Feel free to ask me any questions about the recording!";
      setMessages([{ id: Date.now().toString(), role: 'assistant', content: errorMessage }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const fetchDifferentialDetails = async (differentialName: string) => {
    setDifferentials(prev => prev.map(d => d.name === differentialName ? { ...d, isLoading: true } : d));
    setSelectedDifferential(differentialName);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-recording', {
        body: {
          transcription,
          patientInfo,
          consultId,
          followUpQuestion: `For the differential diagnosis "${differentialName}" based on this case:

1. REASON: Explain why this is being considered as a differential.
2. TREATMENT PLAN: Provide a general treatment plan including recommended diagnostics, medications, and monitoring.

Please format your response with clear "REASON:" and "TREATMENT PLAN:" sections.`,
          previousMessages: messages,
        },
      });

      if (error) throw error;

      const response = data?.analysis || '';
      const reasonMatch = response.match(/REASON:?\s*([\s\S]*?)(?=TREATMENT PLAN:|$)/i);
      const treatmentMatch = response.match(/TREATMENT PLAN:?\s*([\s\S]*?)$/i);

      setDifferentials(prev =>
        prev.map(d =>
          d.name === differentialName
            ? {
                ...d,
                reason: reasonMatch?.[1]?.trim() || 'Clinical findings support this diagnosis.',
                treatmentPlan: treatmentMatch?.[1]?.trim() || response,
                isLoading: false,
              }
            : d
        )
      );
    } catch (error) {
      console.error('Error fetching differential details:', error);
      setDifferentials(prev =>
        prev.map(d =>
          d.name === differentialName
            ? { ...d, reason: 'Unable to load reasoning.', treatmentPlan: 'Failed to load treatment plan.', isLoading: false }
            : d
        )
      );
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    setShowSuggestions(false);
    const content = input.trim();
    setInput('');

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    await saveMessageToDb('user', content);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-recording', {
        body: {
          transcription,
          patientInfo,
          consultId,
          followUpQuestion: content,
          previousMessages: messages,
        },
      });
      if (error) throw error;
      if (data?.analysis) {
        const assistantMessage: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: data.analysis };
        setMessages(prev => [...prev, assistantMessage]);
        await saveMessageToDb('assistant', data.analysis);
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = "I'm sorry, I couldn't process that. Please try again.";
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: errorMessage }]);
    } finally {
      setIsLoading(false);
    }
  };

  const getCaseSummaryContent = () => {
    const firstAssistantMessage = messages.find(m => m.role === 'assistant');
    return firstAssistantMessage?.content || '';
  };

  const copyToClipboard = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', `${label} copied to clipboard`);
  };

  const getMinimizedLabel = () => {
    if (isTranscribing) return 'Processing...';
    if (isAnalyzing) return 'Analyzing...';
    if (messages.length > 0 && showSuggestions) return 'Tap for insights';
    if (messages.length > 0) return 'Case ready';
    return 'Ask Atlas';
  };

  // Render suggestion cards
  const renderSuggestionCards = () => {
    if (!showSuggestions || isLoading) return null;

    const caseSummary = getCaseSummaryContent();

    return (
      <View style={styles.suggestionsContainer}>
        {/* Case Summary Card */}
        <TouchableOpacity
          style={styles.suggestionCard}
          onPress={() => setCaseSummaryOpen(!caseSummaryOpen)}
        >
          <View style={styles.suggestionCardHeader}>
            <Text style={styles.suggestionCardTitle}>Case Summary</Text>
            <Ionicons name={caseSummaryOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
          </View>
        </TouchableOpacity>
        {caseSummaryOpen && caseSummary && (
          <View style={styles.expandedContent}>
            <Text style={styles.expandedText}>{caseSummary}</Text>
            <TouchableOpacity
              style={styles.copyButton}
              onPress={() => copyToClipboard(caseSummary, 'Case summary')}
            >
              <Ionicons name="copy-outline" size={14} color="#1ce881" />
              <Text style={styles.copyButtonText}>Copy</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Differentials Card */}
        <TouchableOpacity
          style={styles.suggestionCard}
          onPress={() => {
            setDifferentialsOpen(!differentialsOpen);
            if (!differentialsOpen && !differentialsLoaded && !differentialsLoading) {
              fetchDifferentials();
            }
          }}
        >
          <View style={styles.suggestionCardHeader}>
            <Text style={styles.suggestionCardTitle}>Differentials</Text>
            {differentialsLoading ? (
              <ActivityIndicator size="small" color="#1ce881" />
            ) : (
              <Ionicons name={differentialsOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
            )}
          </View>
        </TouchableOpacity>
        {differentialsOpen && (
          <View style={styles.expandedContent}>
            {differentialsLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#1ce881" />
                <Text style={styles.loadingText}>Analyzing differentials...</Text>
              </View>
            ) : differentials.length > 0 ? (
              differentials.map((diff) => (
                <View key={diff.name} style={styles.differentialItem}>
                  <TouchableOpacity
                    style={styles.differentialHeader}
                    onPress={() => {
                      if (!diff.reason && !diff.treatmentPlan && !diff.isLoading) {
                        fetchDifferentialDetails(diff.name);
                      } else {
                        setSelectedDifferential(selectedDifferential === diff.name ? null : diff.name);
                      }
                    }}
                  >
                    <Text style={styles.differentialName}>{diff.name}</Text>
                    {diff.isLoading ? (
                      <ActivityIndicator size="small" color="#8b5cf6" />
                    ) : (diff.reason || diff.treatmentPlan) ? (
                      <Ionicons name={selectedDifferential === diff.name ? 'chevron-up' : 'chevron-down'} size={16} color="#64748b" />
                    ) : (
                      <Text style={styles.tapForDetails}>Tap for details</Text>
                    )}
                  </TouchableOpacity>
                  {(diff.reason || diff.treatmentPlan) && selectedDifferential === diff.name && (
                    <View style={styles.differentialDetails}>
                      {diff.reason && (
                        <View style={styles.detailSection}>
                          <Text style={styles.detailLabel}>Why this differential?</Text>
                          <Text style={styles.detailText}>{diff.reason}</Text>
                        </View>
                      )}
                      {diff.treatmentPlan && (
                        <View style={styles.detailSection}>
                          <Text style={styles.detailLabel}>Treatment Plan</Text>
                          <Text style={styles.detailText}>{diff.treatmentPlan}</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={styles.copyButton}
                        onPress={() => copyToClipboard(`${diff.name}\n\nReason: ${diff.reason || ''}\n\nTreatment Plan: ${diff.treatmentPlan || ''}`, diff.name)}
                      >
                        <Ionicons name="copy-outline" size={14} color="#1ce881" />
                        <Text style={styles.copyButtonText}>Copy</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>Expand to analyze differentials for this case.</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  // Floating button when minimized (skip if inline mode)
  if (!isOpen && !inline) {
    return (
      <Animated.View style={[styles.floatingButtonContainer, { transform: [{ scale: pulseAnim }] }]}>
        <TouchableOpacity style={styles.floatingButton} onPress={() => setIsOpen(true)}>
          <AtlasEye size="sm" wander blink glowIntensity="medium" />
          {(isTranscribing || isAnalyzing) && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="small" color="#ffffff" />
            </View>
          )}
        </TouchableOpacity>
        {messages.length > 0 && !isTranscribing && !isAnalyzing && (
          <View style={styles.messageBadge}>
            <Text style={styles.messageBadgeText}>{messages.length}</Text>
          </View>
        )}
        <View style={styles.labelContainer}>
          <Text style={styles.labelText}>{getMinimizedLabel()}</Text>
        </View>
      </Animated.View>
    );
  }

  // Modal chat view
  return (
    <Modal
      visible={isOpen && !inline}
      animationType="slide"
      transparent
      onRequestClose={() => setIsOpen(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalContainer}
      >
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setIsOpen(false)} />
        <View style={styles.chatContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.avatarContainer}>
                <AtlasEye size="xs" blink glowIntensity="low" />
              </View>
              <Text style={styles.headerTitle}>Atlas</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={() => setIsOpen(false)}>
              <Ionicons name="remove" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Chat content */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.chatContent}
            contentContainerStyle={styles.chatContentContainer}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {/* Initial Loading State */}
            {(isTranscribing || isAnalyzing) && messages.length === 0 && (
              <View style={styles.initialLoading}>
                <AtlasEye size="lg" wander blink glowIntensity="high" />
                <View style={styles.dotsContainer}>
                  <View style={[styles.dot, { animationDelay: '0ms' }]} />
                  <View style={[styles.dot, { animationDelay: '150ms' }]} />
                  <View style={[styles.dot, { animationDelay: '300ms' }]} />
                </View>
                <Text style={styles.loadingLabel}>
                  {isTranscribing ? 'Processing your recording...' : readOnly ? 'Loading conversation...' : 'Analyzing the case...'}
                </Text>
              </View>
            )}

            {/* Empty state for readOnly mode */}
            {readOnly && messages.length === 0 && !isAnalyzing && (
              <View style={styles.emptyState}>
                <AtlasEye size="sm" blink />
                <Text style={styles.emptyText}>No AI conversation for this consult.</Text>
              </View>
            )}

            {/* Suggestion Cards */}
            {messages.length > 0 && renderSuggestionCards()}

            {/* Loading indicator */}
            {isLoading && (
              <View style={styles.loadingBubble}>
                <ActivityIndicator size="small" color="#1ce881" />
              </View>
            )}
          </ScrollView>

          {/* Input Area - hide in readOnly mode */}
          {!readOnly && (
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Ask Atlas a question..."
                placeholderTextColor="#94a3b8"
                editable={!isLoading && !isTranscribing && !isAnalyzing}
                onSubmitEditing={sendMessage}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={[styles.sendButton, (!input.trim() || isLoading) && styles.sendButtonDisabled]}
                onPress={sendMessage}
                disabled={!input.trim() || isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="send" size={18} color="#ffffff" />
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  // Floating button
  floatingButtonContainer: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    alignItems: 'center',
    zIndex: 1000,
  },
  floatingButton: {
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
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 232, 129, 0.8)',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageBadge: {
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
  messageBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
  labelContainer: {
    marginTop: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  labelText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748b',
  },

  // Modal
  modalContainer: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  chatContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.7,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1ce881',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101235',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Chat content
  chatContent: {
    flex: 1,
  },
  chatContentContainer: {
    padding: 16,
    paddingBottom: 100,
  },

  // Loading states
  initialLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1ce881',
  },
  loadingLabel: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  loadingBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 8,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },

  // Suggestions
  suggestionsContainer: {
    marginTop: 12,
  },
  suggestionCard: {
    backgroundColor: 'rgba(28, 232, 129, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(28, 232, 129, 0.3)',
    marginBottom: 8,
  },
  suggestionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  suggestionCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#101235',
  },
  expandedContent: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  expandedText: {
    fontSize: 14,
    color: '#101235',
    lineHeight: 22,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(28, 232, 129, 0.1)',
    borderRadius: 6,
  },
  copyButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1ce881',
  },

  // Differentials
  differentialItem: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
    overflow: 'hidden',
  },
  differentialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#fafafa',
  },
  differentialName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#101235',
    flex: 1,
  },
  tapForDetails: {
    fontSize: 11,
    color: '#94a3b8',
  },
  differentialDetails: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  detailSection: {
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1ce881',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  detailText: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 20,
  },

  // Loading
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
  },

  // Input
  inputContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  input: {
    flex: 1,
    height: 44,
    backgroundColor: '#f8fafc',
    borderRadius: 22,
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#101235',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1ce881',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
});

export default MinimizableAtlasChat;
