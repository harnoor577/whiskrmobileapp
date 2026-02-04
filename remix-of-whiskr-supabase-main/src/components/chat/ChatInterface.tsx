import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Send, Bot, User, ChevronDown, ChevronUp, AlertCircle, Check, Paperclip, X, Image as ImageIcon, Stethoscope, FileText, Loader2, Pencil, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DiagnosticTypeDialog } from './DiagnosticTypeDialog';
import ReactMarkdown from 'react-markdown';
import { Patient, Consult } from '@/types';
import { VoiceRecorder } from '@/components/voice/VoiceRecorder';
import { VetMascotThinking } from '@/components/chat/VetMascot';
import { FormattedMessage } from './FormattedMessage';
import { TypingMessage } from './TypingMessage';
import { formatInLocalTime } from '@/lib/timezone';
import { usePermissions } from '@/hooks/use-permissions';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FilePreviewModal } from './FilePreviewModal';
import { CaseNotesSection } from './CaseNotesSection';
import { usePlanRestrictions } from '@/hooks/use-plan-restrictions';
import { FeedbackButtons } from '@/components/feedback/FeedbackButtons';
import { WellnessFormatDisplay } from './WellnessFormatDisplay';

interface MessageAttachment {
  id?: string;
  url: string;
  type: string;
  name: string;
  storagePath?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'case_note' | 'system';
  content: string;
  created_at: string;
  attachments?: MessageAttachment[];
  isTyping?: boolean;
  senderName?: string;
}

interface CaseNote {
  id: string;
  note: string;
  created_at: string;
  created_by: string;
  author_name?: string;
}

interface ChatInterfaceProps {
  consultId?: string;
  patientId?: string;
  useHistory?: boolean;
  className?: string;
  onMessageSent?: () => void;
  onConsultCreated?: (consultId: string) => void;
  clinicId?: string;
  consult?: Consult | null;
  visitType?: string | null;
  onCopyNotes?: () => void;
  onCopyEmail?: () => void;
  inputMode?: 'recording' | 'typing' | null;
}

// REMOVED - CaseNotesSection moved to separate file

export function ChatInterface({ consultId, patientId, useHistory = false, className, onMessageSent, onConsultCreated, clinicId, consult, visitType, onCopyNotes, onCopyEmail, inputMode }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [caseNotes, setCaseNotes] = useState<CaseNote[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [isPatientInfoExpanded, setIsPatientInfoExpanded] = useState(true);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [previewFile, setPreviewFile] = useState<{
    url: string;
    name: string;
    type: string;
  } | null>(null);
  const [userMessageCount, setUserMessageCount] = useState(0);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [message, setMessage] = useState('');
  const [diagnosticTypeDialogOpen, setDiagnosticTypeDialogOpen] = useState(false);
  const [selectedDiagnosticType, setSelectedDiagnosticType] = useState<'imaging' | 'bloodwork' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const { canEditClinicalData, isReceptionist, isVetTech } = usePermissions();
  const { canUploadDiagnostics } = usePlanRestrictions();

  const canUploadFiles = canUploadDiagnostics;

  // Check if consult is finalized
  const isFinalized = consult?.status === 'finalized';

  // Auto-start recording or focus textarea based on inputMode
  useEffect(() => {
    if (!inputMode) return;
    
    // Small delay to ensure component is fully mounted
    const timer = setTimeout(() => {
      if (inputMode === 'recording') {
        setIsVoiceRecording(true);
      } else if (inputMode === 'typing') {
        textareaRef.current?.focus();
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [inputMode]);

  useEffect(() => {
    // Load current user's profile name for "Sent by"
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('name').eq('user_id', user.id).single();
      setCurrentUserName(data?.name || null);
    })();
  }, []);

  const loadPatientInfo = useCallback(async () => {
    if (!patientId) return;
    
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('*, owner:owners(*)')
        .eq('id', patientId)
        .single();

      if (error) throw error;
      setPatient(data);
    } catch (error) {
      console.error('Error loading patient:', error);
    }
  }, [patientId]);

  const loadChatHistory = useCallback(async () => {
    if (!consultId) {
      setMessages([]);
      return;
    }

    try {
      console.log('Loading chat history for consultId:', consultId);
      
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('consult_id', consultId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) {
        console.error('Error loading chat history:', error);
        throw error;
      }

      console.log('Loaded messages:', data?.length || 0);
      
      setMessages((data || []).map(msg => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        created_at: msg.created_at,
        attachments: (msg.attachments as unknown as MessageAttachment[]) || [],
        senderName: (msg as any).sender_name,
      })));
    } catch (error) {
      console.error('Error loading chat history:', error);
      setMessages([]);
    }
  }, [consultId]);

  const loadCaseNotes = useCallback(async () => {
    if (!consultId) {
      setCaseNotes([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('case_notes')
        .select('id, note, created_at, created_by')
        .eq('consult_id', consultId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch user names separately
      const userIds = [...new Set(data?.map(note => note.created_by) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, name')
        .in('user_id', userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.user_id, p.name]) || []);

      const notesWithNames = (data || []).map((note: any) => ({
        id: note.id,
        note: note.note,
        created_at: note.created_at,
        created_by: note.created_by,
        author_name: profileMap.get(note.created_by) || 'Unknown',
      }));

      setCaseNotes(notesWithNames);
    } catch (error) {
      console.error('Error loading case notes:', error);
    }
  }, [consultId]);

  const hasDiagnosticsInConversation = useCallback(() => {
    // Keywords that indicate diagnostics have been provided
    const diagnosticKeywords = [
      // Lab values
      'wbc', 'rbc', 'hct', 'hgb', 'platelet', 'neutrophil', 'lymphocyte', 'eosinophil',
      'bun', 'creatinine', 'alt', 'ast', 'alp', 'ggt', 'albumin', 'globulin',
      'glucose', 'calcium', 'phosphorus', 'sodium', 'potassium', 'chloride',
      // Test types
      'cbc', 'chemistry', 'urinalysis', 'usg', 'blood work', 'lab result',
      'radiograph', 'ultrasound', 'x-ray', 'imaging', 'ct scan', 'mri',
      // Phrases
      'test result', 'lab value', 'panel shows', 'bloodwork',
    ];

    // Check all user messages for diagnostic keywords
    const userMessages = messages.filter(m => m.role === 'user');
    
    return userMessages.some(message => {
      const content = message.content.toLowerCase();
      return diagnosticKeywords.some(keyword => content.includes(keyword));
    });
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    // Smoothly scroll the last message into view inside the ScrollArea viewport
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }, []);

  useEffect(() => {
    // Clear messages when consultId changes
    setMessages([]);
    setCaseNotes([]);
    loadChatHistory();
    loadCaseNotes();
    if (patientId) {
      loadPatientInfo();
    }
  }, [consultId, patientId, loadChatHistory, loadCaseNotes, loadPatientInfo]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, caseNotes, scrollToBottom]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadedFiles((prev) => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (): Promise<MessageAttachment[]> => {
    if (uploadedFiles.length === 0) return [];

    setIsUploading(true);
    const attachments: MessageAttachment[] = [];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Ensure we always have a clinic id for the file_assets row (RLS requires it)
      let effectiveClinicId = clinicId || null;
      if (!effectiveClinicId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('clinic_id')
          .eq('user_id', user.id)
          .maybeSingle();
        effectiveClinicId = profile?.clinic_id || null;
      }
      if (!effectiveClinicId) {
        throw new Error('Unable to determine clinic. Please reload and try again.');
      }

      for (const file of uploadedFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { data, error } = await supabase.storage
          .from('diagnostic-images')
          .upload(fileName, file);

        if (error) throw error;

        // Create file_assets record - type must be: audio, pdf, image, or other
        const fileType = file.type.startsWith('image/') ? 'image' 
          : file.type === 'application/pdf' ? 'pdf'
          : file.type.startsWith('audio/') ? 'audio'
          : 'other';
        
        const { data: fileRecord, error: fileError } = await supabase
          .from('file_assets')
          .insert({
            clinic_id: effectiveClinicId,
            consult_id: consultId || null,
            storage_key: fileName,
            type: fileType,
            mime_type: file.type,
            size_bytes: file.size,
            created_by: user.id,
            modality: selectedDiagnosticType || null,
          })
          .select()
          .single();

        if (fileError || !fileRecord) {
          console.error('Error creating file record:', fileError);
          toast({
            title: 'File saved but record missing',
            description: 'We could not index this file for the Diagnostics page. Please try again.',
            variant: 'destructive',
          });
          continue; // Skip creating attachment without DB record
        }

        // Generate signed URL that expires in 24 hours
        const { data: signedUrlData } = await supabase.storage
          .from('diagnostic-images')
          .createSignedUrl(fileName, 86400); // 24 hours

        if (signedUrlData?.signedUrl) {
          attachments.push({
            id: fileRecord.id,
            url: signedUrlData.signedUrl,
            type: file.type,
            name: file.name,
            storagePath: fileName,
          });
        }
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload files',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }

    return attachments;
  };

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, window.innerHeight * 0.25);
      textarea.style.height = `${newHeight}px`;
    }
  }, [message]);

  const sendMessage = async () => {
    if ((!message.trim() && uploadedFiles.length === 0) || isLoading || isUploading) return;

    const userMessage = message.trim();
    setMessage('');
    setIsLoading(true);
    setUserMessageCount(prev => prev + 1);

    // Upload files first
    const attachments = await uploadFiles();
    setUploadedFiles([]);
    setSelectedDiagnosticType(null); // Reset after upload

    // Analyze documents if uploaded
    if (attachments.length > 0) {
      setIsAnalyzingFile(true);
      toast({
        title: "Analyzing document...",
        description: "Please wait while we process your file.",
      });

      for (const attachment of attachments) {
        if (!attachment.id || !attachment.storagePath) continue;

        try {
          const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyze-document', {
            body: {
              caseId: consultId,
              conversationId: consultId,
              patient: patient,
              presentingComplaint: userMessage || '',
              history: '',
              physicalExam: '',
              file: {
                id: attachment.id,
                name: attachment.name,
                mime: attachment.type,
                storagePath: attachment.storagePath,
              },
            },
          });

          if (analysisError) {
            console.error('Analysis error:', analysisError);
            toast({
              title: "Analysis Failed",
              description: "File received but analysis failed. Try re-uploading or a different format.",
              variant: "destructive",
            });
          } else if (analysisData?.lowConfidence) {
            toast({
              title: "Low Confidence",
              description: "I couldn't confidently classify this file. I treated it as text; please confirm.",
            });
          } else if (analysisData?.analysis) {
            // Add analysis summary as assistant message
            const analysisSummary = formatAnalysisForChat(analysisData.analysis);
            const analysisMsg: Message = {
              id: `analysis-${Date.now()}`,
              role: 'assistant',
              content: analysisSummary,
              created_at: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, analysisMsg]);
          }
        } catch (err) {
          console.error('Document analysis error:', err);
        }
      }
    }

    // Fetch visit_type if consultId exists
    let visitType = null;
    if (consultId) {
      const { data: consultData } = await supabase
        .from('consults')
        .select('visit_type')
        .eq('id', consultId)
        .single();
      // Type assertion needed until types are regenerated
      visitType = (consultData as any)?.visit_type;
    }

    // Optimistically add user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage || '(Attached files)',
      created_at: new Date().toISOString(),
      attachments,
      senderName: currentUserName || undefined,
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      const { data, error } = await supabase.functions.invoke('chat-assistant', {
        body: {
          message: userMessage,
          consultId: consultId || null,
          patientId: patientId || null,
          useHistory: useHistory,
          attachments,
          visitType: visitType || null,
          timezone: userTimezone,
        },
      });

      if (error) throw error;

      // Add assistant response with typing animation
      const assistantMsg: Message = {
        id: `temp-${Date.now() + 1}`,
        role: 'assistant',
        content: data.message,
        created_at: new Date().toISOString(),
        isTyping: true,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Update consultId if new consultation was created (without page reload)
      if (data.consultId && !consultId && onConsultCreated) {
        onConsultCreated(data.consultId);
      }
      
      // Notify parent that a message was sent
      if (onMessageSent) {
        onMessageSent();
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send message',
        variant: 'destructive',
      });
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setIsLoading(false);
      setIsAnalyzingFile(false);
    }
  };

  const formatAnalysisForChat = (analysis: any): string => {
    // Format document type nicely - just show the specific type without modality in parentheses
    const docType = analysis.document_type || 'Document';
    let content = `## Document Analyzed: ${docType}\n\n`;
    content += `${analysis.summary}\n\n`;

    if (analysis.labPanel?.parsed) {
      content += `### Lab Results\n`;
      content += `| Analyte | Value | Unit | Flag | Reference |\n`;
      content += `|---------|-------|------|------|------------|\n`;
      analysis.labPanel.parsed.forEach((lab: any) => {
        const flag = lab.flag === 'high' ? '🔺' : lab.flag === 'low' ? '🔻' : '✓';
        content += `| ${lab.analyte} | ${lab.value} | ${lab.unit} | ${flag} ${lab.flag} | ${lab.refLow}-${lab.refHigh} |\n`;
      });
      content += `\n${analysis.labPanel.notes}\n\n`;
    }

    if (analysis.imaging) {
      content += `### Imaging Findings\n`;
      content += `**Region:** ${analysis.imaging.anatomic_region}\n`;
      content += `**Severity:** ${analysis.imaging.severity}\n\n`;
      content += `**Findings:**\n${analysis.imaging.findings.map((f: string) => `- ${f}`).join('\n')}\n\n`;
      content += `**Impression:**\n${analysis.imaging.impression.map((i: string) => `- ${i}`).join('\n')}\n\n`;
    }

    if (analysis.differentials?.length > 0) {
      content += `### Most Likely Differentials\n`;
      analysis.differentials.forEach((diff: any, idx: number) => {
        content += `${idx + 1}. **${diff.dx}** (${diff.likelihood})\n   ${diff.why}\n\n`;
      });
    }

    if (analysis.recommended_tests?.length > 0) {
      content += `### Recommended Next Diagnostics\n`;
      analysis.recommended_tests.forEach((test: any, idx: number) => {
        content += `${idx + 1}. **${test.test}**\n   ${test.rationale}\n\n`;
      });
    }

    return content;
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // Enter key now creates a new line instead of sending
    // Users must click the send button to send messages
  };

  const sendQuickAction = (template: string) => {
    setInput(template);
    setTimeout(() => sendMessage(), 100);
  };

  const handleEditMessage = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditingContent(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  const saveEditedMessage = async (messageId: string) => {
    if (!editingContent.trim()) {
      toast({
        title: 'Error',
        description: 'Message cannot be empty',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('chat_messages')
        .update({ content: editingContent.trim() })
        .eq('id', messageId);

      if (error) throw error;

      // Update local messages
      setMessages(prev => 
        prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, content: editingContent.trim() }
            : msg
        )
      );

      setEditingMessageId(null);
      setEditingContent('');

      toast({
        title: 'Message updated',
        description: 'Your message has been updated successfully',
      });
    } catch (error: any) {
      console.error('Error updating message:', error);
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update message',
        variant: 'destructive',
      });
    }
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditingContent('');
  };

  const canEditMessage = (msg: Message) => {
    if (msg.role !== 'user') return false;
    
    // Check if message is within 5 minutes
    const messageTime = new Date(msg.created_at).getTime();
    const now = new Date().getTime();
    const fiveMinutes = 5 * 60 * 1000;
    
    if (now - messageTime > fiveMinutes) return false;
    
    // Check if this is the last user message
    const userMessages = messages.filter(m => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];
    
    return msg.id === lastUserMessage?.id;
  };

  const calculateAge = (dob: string | undefined) => {
    if (!dob) return 'Unknown';
    const birthDate = new Date(dob);
    const today = new Date();
    const age = Math.floor((today.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    return `${age}Y`;
  };

  return (
    <Card className="flex flex-col h-full border-0 shadow-none">
      {(isReceptionist || isFinalized) && (
        <div className="px-4 py-2 bg-muted/50 border-b border-border">
          <p className="text-xs text-muted-foreground text-center">
            {isFinalized 
              ? 'This consultation is finalized. You can add case notes below but cannot send messages or upload files.'
              : 'View-only access - You cannot send messages, upload files, or record audio'}
          </p>
        </div>
      )}
      <ScrollArea className="flex-1 py-4">
        <div className="space-y-4 px-2">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8 px-4">
              <Bot className="w-12 h-12 mx-auto mb-2 opacity-50" />
              {visitType === 'procedure' ? (
                <div className="space-y-4 max-w-2xl mx-auto">
                  <p className="text-sm font-medium text-foreground">Ready to document your procedure</p>
                  <div className="bg-muted/50 rounded-lg p-4 text-left space-y-3">
                    <p className="text-xs font-semibold text-foreground mb-2">For the most detailed procedure notes and client email, please include:</p>
                    <ul className="text-xs space-y-2 list-disc list-inside marker:text-primary">
                      <li><span className="font-medium">Procedure type</span> (e.g., dental cleaning, spay, mass removal)</li>
                      <li><span className="font-medium">Pre-procedure status</span> (patient condition, vitals, anesthesia protocol)</li>
                      <li><span className="font-medium">Procedure findings</span> (what was discovered, any complications)</li>
                      <li><span className="font-medium">Actions taken</span> (specific procedures performed, medications given)</li>
                      <li><span className="font-medium">Recovery status</span> (how patient is doing post-procedure)</li>
                      <li><span className="font-medium">Home care instructions</span> (medications, activity restrictions, follow-up)</li>
                    </ul>
                  </div>
                </div>
              ) : visitType === 'wellness' || visitType === 'vaccine' ? (
                <div className="space-y-4 max-w-2xl mx-auto">
                  <p className="text-sm font-medium text-foreground">Ready to document wellness visit</p>
                  <div className="bg-muted/50 rounded-lg p-4 text-left space-y-3">
                    <p className="text-xs font-semibold text-foreground mb-2">For complete wellness documentation, please provide:</p>
                    <ul className="text-xs space-y-2 list-disc list-inside marker:text-primary">
                      <li><span className="font-medium">Vitals</span> (weight, temp, HR, RR) - at least 3 required</li>
                      <li><span className="font-medium">Physical exam findings</span> (or "all normal" if no abnormalities)</li>
                      <li><span className="font-medium">Vaccines administered</span> (name, dose, route, site, lot, expiry) or "no vaccines today"</li>
                      <li><span className="font-medium">Current preventives</span> (heartworm, flea/tick medications)</li>
                      <li><span className="font-medium">Diet and lifestyle</span> (food, exercise, any concerns)</li>
                    </ul>
                    <p className="text-xs text-muted-foreground italic mt-2">
                      Note: If any abnormal findings are detected, the system will automatically switch to standard SOAP format.
                    </p>
                  </div>
                </div>
              ) : (
                <p>Start a conversation with the AI assistant</p>
              )}
            </div>
          )}
          
          {/* Show all messages in chronological order */}
          {messages.map((msg) => (
            msg.role === 'system' ? (
              // System message (centered, distinct style)
              <div key={msg.id} className="w-full flex justify-center my-4">
                <div className="max-w-md bg-muted/50 border border-border px-4 py-2 rounded-lg">
                  <div className="flex items-center gap-2 justify-center">
                    <AlertCircle className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground text-center">
                      {msg.content}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground/70 text-center mt-1">
                    {formatInLocalTime(msg.created_at, 'h:mm a')}
                  </p>
                </div>
              </div>
            ) : msg.role === 'user' ? (
              // User message
              <div key={msg.id} className="w-full flex justify-end">
                <div className="w-[95%] sm:w-[85%] bg-primary text-primary-foreground p-3 rounded-lg">
                  {editingMessageId === msg.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        className="min-h-[80px] bg-primary-foreground/10 text-primary-foreground border-primary-foreground/20"
                        autoFocus
                      />
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={cancelEdit}
                          className="text-primary-foreground hover:bg-primary-foreground/10"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => saveEditedMessage(msg.id)}
                          className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {msg.attachments.map((att, idx) => (
                            <button
                              key={idx}
                              onClick={() => setPreviewFile({ url: att.url, name: att.name, type: att.type })}
                              className="flex items-center gap-2 text-xs bg-primary-foreground/10 hover:bg-primary-foreground/20 rounded p-2 transition-all hover:scale-[1.02] w-full text-left group"
                            >
                              <ImageIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                              <span className="truncate">{att.name}</span>
                              <span className="ml-auto text-[10px] opacity-60 group-hover:opacity-100">Click to preview</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs opacity-70">
                            {formatInLocalTime(msg.created_at, 'h:mm a')}
                          </span>
                          {canEditMessage(msg) && !isFinalized && canEditClinicalData && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditMessage(msg.id, msg.content)}
                              className="h-6 px-2 text-xs text-primary-foreground hover:bg-primary-foreground/10"
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                        {msg.senderName && (
                          <span className="text-xs text-primary-foreground">
                            Sent by {msg.senderName}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              // AI message
              <div key={msg.id} className="w-full">
                {(visitType === 'wellness' || visitType === 'vaccine') ? (
                  // Wellness/Vaccine format
                  <WellnessFormatDisplay 
                    message={msg}
                    consultId={consultId}
                  />
                ) : (
                  // Standard SOAP format
                  <Card className="p-4 bg-card border border-border">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <Stethoscope className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">whiskr AI</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatInLocalTime(msg.created_at, 'h:mm a')}
                      </span>
                    </div>
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown
                        components={{
                          h3: ({ children }) => (
                            <h3 className="text-base font-bold mt-4 mb-2 text-foreground border-b pb-1">
                              {children}
                            </h3>
                          ),
                          h4: ({ children }) => (
                            <h4 className="text-sm font-semibold mt-3 mb-1 text-foreground">
                              {children}
                            </h4>
                          ),
                          p: ({ children }) => (
                            <p className="text-sm leading-relaxed mb-2 text-foreground">
                              {children}
                            </p>
                          ),
                          ul: ({ children }) => (
                            <ul className="list-disc pl-5 mb-3 space-y-1">
                              {children}
                            </ul>
                          ),
                          li: ({ children }) => (
                            <li className="text-sm text-foreground">
                              {children}
                            </li>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold text-foreground">
                              {children}
                            </strong>
                          ),
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                    <div className="pt-3 mt-3 border-t">
                      <FeedbackButtons
                        contentType="diagnosis"
                        contentText={msg.content}
                        consultId={consultId}
                      />
                    </div>
                  </Card>
                )}
              </div>
            )
          ))}
          
          {isLoading && (
            <div className="w-full">
              <div className="w-full p-3 rounded-lg bg-card border">
                <div className="flex items-center gap-2 mb-2 pb-2 border-b">
                  <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center">
                    <Stethoscope className="w-3 h-3 animate-pulse" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">whiskr AI</span>
                </div>
                <VetMascotThinking 
                  mode={isAnalyzingFile ? 'file-analysis' : 'chat'}
                  isComplete={false}
                  onComplete={() => {
                    // Progress completes when message is received
                  }} 
                />
              </div>
            </div>
          )}
          
          {/* Display Case Notes */}
          {caseNotes.length > 0 && (
            <div className="space-y-3 mt-6 pt-6 border-t-2 border-dashed">
              <div className="flex items-center gap-2 px-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold text-muted-foreground">Case Notes</h4>
              </div>
              {caseNotes.map((note) => (
                <div key={note.id} className="px-2">
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <p className="text-sm whitespace-pre-wrap text-foreground">{note.note}</p>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span>{formatInLocalTime(note.created_at, 'MMM d, yyyy h:mm a')}</span>
                      <span>Added by {note.author_name}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {isFinalized && clinicId && consultId && !isReceptionist ? (
        <div className="border-t bg-card">
          {/* Action Buttons for Finalized Procedure Consultations */}
          {messages.length > 0 && (
            <div className="grid grid-cols-2 gap-3 px-4 pt-3 pb-2">
              <Button
                size="sm"
                variant="outline"
                onClick={onCopyEmail}
                disabled={!onCopyEmail}
                className="gap-2 hover:bg-accent transition-all h-9"
              >
                <Mail className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Copy Email</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onCopyNotes}
                disabled={!onCopyNotes}
                className="gap-2 hover:bg-accent transition-all h-9"
              >
                <FileText className="h-4 w-4" />
                <span className="text-xs sm:text-sm">
                  {visitType === 'procedure' ? 'Copy Notes' : 'Copy SOAP'}
                </span>
              </Button>
            </div>
          )}
          <CaseNotesSection 
            consultId={consultId} 
            clinicId={clinicId}
            onNoteAdded={loadCaseNotes}
          />
        </div>
      ) : isFinalized && isReceptionist && clinicId && consultId ? (
        <div className="px-4 py-3 border-t bg-card space-y-3">
          <div className="px-3 py-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-900 dark:text-blue-100">
                <strong>Receptionist Access:</strong> You have view-only access to consultations. You can only add case notes below.
              </div>
            </div>
          </div>
          <CaseNotesSection 
            consultId={consultId} 
            clinicId={clinicId}
            onNoteAdded={loadCaseNotes}
          />
        </div>
      ) : !isReceptionist && !isFinalized && !isVetTech ? (
        <div className="px-4 py-3 border-t bg-card space-y-2.5">
          
          {!canEditClinicalData && (
            <div className="px-2 py-2 bg-muted/50 rounded-md text-sm text-muted-foreground text-center">
              View-only access: Only vets or techs can interact with the AI assistant
            </div>
          )}
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.csv,.txt,image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Action Buttons - Mobile Optimized */}
          {isFinalized && messages.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={onCopyEmail}
                disabled={!onCopyEmail}
                className="gap-2 hover:bg-accent transition-all h-9"
              >
                <Mail className="h-4 w-4" />
                <span className="text-xs sm:text-sm">Copy Email</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onCopyNotes}
                disabled={!onCopyNotes}
                className="gap-2 hover:bg-accent transition-all h-9"
              >
                <FileText className="h-4 w-4" />
                <span className="text-xs sm:text-sm">
                  {visitType === 'procedure' ? 'Copy Notes' : 'Copy SOAP'}
                </span>
              </Button>
            </div>
          )}
          
          {/* Recording overlay mount point */}
          <div id="recording-overlay-slot" className="mb-2" />
          
          {uploadedFiles.length > 0 && (
          <div className="flex gap-2 flex-wrap p-2 bg-muted rounded-md">
            {uploadedFiles.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-background px-2 py-1 rounded text-sm">
                <ImageIcon className="w-4 h-4" />
                <span className="truncate max-w-[150px]">{file.name}</span>
                <button
                  onClick={() => removeFile(idx)}
                  className="hover:text-destructive"
                  type="button"
                  disabled={isUploading}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {isUploading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Uploading files...</span>
              </div>
            )}
          </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-2">
            <TooltipProvider>
              {/* Auto-expanding textarea - Primary Focus */}
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  canEditClinicalData 
                    ? ((consult as any)?.version > 1 && consult?.status === 'draft'
                        ? "Describe the changes/updates..."
                        : userMessageCount === 0 
                          ? (visitType === 'procedure' 
                              ? "Describe the procedure details..." 
                              : "Describe the presenting complaint...") 
                          : (hasDiagnosticsInConversation() 
                              ? "Continue conversation..." 
                              : "Type a message..."))
                    : "View-only access"
                }
                disabled={!canEditClinicalData || isLoading || isUploading}
                className="resize-none transition-all min-h-[48px] focus:min-h-[90px] text-base"
                rows={2}
                style={{ maxHeight: '25vh' }}
              />

              {/* Recording overlay mount point */}
              <div id="recording-overlay-slot" className={`transition-all ${isVoiceRecording ? 'mb-1' : ''}`} />

              {/* AI Processing Indicator */}
              {isLoading && (
                <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-lg animate-fade-in">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm font-medium text-primary">AI is analyzing...</span>
                </div>
              )}

              {/* Compact action buttons row */}
              <div className="flex gap-2 items-center justify-between">
                <div className="flex gap-1.5 items-center">
                   <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => setDiagnosticTypeDialogOpen(true)}
                        disabled={!canEditClinicalData || isLoading || isUploading || !canUploadFiles}
                        className="h-9 w-9 rounded-full transition-all shrink-0 hover:bg-accent"
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    {!canEditClinicalData ? (
                      <TooltipContent>
                        <p>Only vets or techs can upload files</p>
                      </TooltipContent>
                    ) : !canUploadFiles ? (
                      <TooltipContent>
                        <p>Upgrade your Plan to get diagnostics analyzed</p>
                      </TooltipContent>
                    ) : (
                      <TooltipContent>
                        <p>Attach Diagnostics</p>
                      </TooltipContent>
                    )}
                  </Tooltip>

                  <VoiceRecorder
                    onTranscriptionComplete={(text) => {
                      setMessage(text);
                    }}
                    onError={(error) => {
                      console.error('Voice recording error:', error);
                    }}
                    isDisabled={!canEditClinicalData || isLoading}
                    consultId={consultId}
                    inline={true}
                    isRecording={isVoiceRecording}
                    onRecordingChange={setIsVoiceRecording}
                    overlayContainerId="recording-overlay-slot"
                  />
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="submit"
                      size="icon"
                      disabled={!canEditClinicalData || (!message.trim() && uploadedFiles.length === 0) || isLoading || isUploading}
                      className="h-11 w-11 rounded-full hover:scale-105 transition-all shrink-0"
                    >
                      {isUploading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  {!canEditClinicalData && (
                    <TooltipContent>
                      <p>Only vets or techs can send messages</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </div>
            </TooltipProvider>
          </form>
        </div>
      ) : isVetTech && !isFinalized ? (
        <div className="px-4 py-3 border-t bg-card">
          <div className="px-3 py-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-900 dark:text-blue-100">
                You do not have access to input information in this consultation. Please use the <strong>'Edit Vitals'</strong> button to update vitals only.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <DiagnosticTypeDialog
        open={diagnosticTypeDialogOpen}
        onClose={() => setDiagnosticTypeDialogOpen(false)}
        onSelectType={(type) => {
          setSelectedDiagnosticType(type);
          fileInputRef.current?.click();
        }}
      />

      {/* File Preview Modal */}
      <FilePreviewModal
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
        fileUrl={previewFile?.url || ''}
        fileName={previewFile?.name || ''}
        fileType={previewFile?.type || ''}
      />
    </Card>
  );
}