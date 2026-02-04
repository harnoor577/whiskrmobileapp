import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Mic, ClipboardCheck, Users, FileText, FlaskConical, Scan } from 'lucide-react';
import { TranscriptionSegment } from '@/types/transcription';
import { TranscriptionSegmentCard } from './TranscriptionSegmentCard';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import React from 'react';

interface DiagnosticAnalysis {
  summary?: string;
  imaging?: {
    findings?: string[];
    impression?: string;
  };
  differentials?: Array<{
    dx: string;
    likelihood: string;
  }>;
  labPanel?: {
    parsed?: Array<{
      analyte: string;
      value: string;
      unit: string;
      flag?: string;
    }>;
  };
}

interface DiagnosticFile {
  id: string;
  document_type: string | null;
  modality: string | null;
  analysis_json: DiagnosticAnalysis | null;
}

interface ViewInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: string;
  segments?: TranscriptionSegment[];
  onSave: (updatedContent: string, updatedSegments?: TranscriptionSegment[]) => void;
  inputMode: 'recording' | 'typed' | 'continue';
  consultId?: string;
}

// Helper function to detect recording session breaks
function detectRecordingBreaks(segments: TranscriptionSegment[]): number[] {
  const breakIndices: number[] = [];
  for (let i = 1; i < segments.length; i++) {
    // If next segment starts significantly before previous segment ends (timestamp reset)
    if (segments[i].start < segments[i - 1].end - 1) {
      breakIndices.push(i);
    }
  }
  return breakIndices;
}

// Component for displaying diagnostic analysis
function DiagnosticCard({ file }: { file: DiagnosticFile }) {
  const analysis = file.analysis_json;
  
  if (!analysis) {
    return (
      <div className="rounded-lg border p-4 bg-muted/50">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Scan className="h-4 w-4" />
          <span className="font-medium">{file.document_type || 'Diagnostic'}</span>
        </div>
        <p className="text-sm text-muted-foreground mt-2">Analysis pending...</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-3 bg-card">
      {/* Header with document type */}
      <div className="flex items-center gap-2">
        <Scan className="h-4 w-4 text-blue-500" />
        <span className="font-medium">{file.document_type || 'Diagnostic'}</span>
        {file.modality && (
          <span className="text-xs bg-muted px-2 py-0.5 rounded">
            {file.modality.toUpperCase()}
          </span>
        )}
      </div>
      
      {/* Summary */}
      {analysis.summary && (
        <p className="text-sm">{analysis.summary}</p>
      )}
      
      {/* Imaging Findings */}
      {analysis.imaging?.findings && analysis.imaging.findings.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Findings:</p>
          <ul className="text-sm space-y-1">
            {analysis.imaging.findings.map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted-foreground">•</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Imaging Impression */}
      {analysis.imaging?.impression && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Impression:</p>
          <p className="text-sm">{analysis.imaging.impression}</p>
        </div>
      )}
      
      {/* Lab Panel Results */}
      {analysis.labPanel?.parsed && analysis.labPanel.parsed.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Lab Results:</p>
          <div className="text-sm space-y-1">
            {analysis.labPanel.parsed.map((lab, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-muted-foreground">•</span>
                <span>{lab.analyte}: {lab.value} {lab.unit}</span>
                {lab.flag && lab.flag.toLowerCase() !== 'normal' && (
                  <span className={cn(
                    "px-1.5 rounded text-xs font-medium",
                    lab.flag.toLowerCase() === 'high' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                    lab.flag.toLowerCase() === 'low' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  )}>
                    {lab.flag.toUpperCase()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Differentials */}
      {analysis.differentials && analysis.differentials.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Differentials:</p>
          <div className="text-sm space-y-1">
            {analysis.differentials.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={cn(
                  "px-1.5 rounded text-xs font-medium",
                  d.likelihood === 'high' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                  d.likelihood === 'moderate' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                  "bg-muted text-muted-foreground"
                )}>
                  {d.likelihood}
                </span>
                <span>{d.dx}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ViewInputDialog({
  open,
  onOpenChange,
  content,
  segments = [],
  onSave,
  inputMode,
  consultId,
}: ViewInputDialogProps) {
  const [editedContent, setEditedContent] = useState(content);
  const [editedSegments, setEditedSegments] = useState<TranscriptionSegment[]>(segments);
  const [activeTab, setActiveTab] = useState<'segmented' | 'diagnostics' | 'plain'>('segmented');
  const [diagnosticFiles, setDiagnosticFiles] = useState<DiagnosticFile[]>([]);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);

  const hasSegments = segments && segments.length > 0;

  // Detect recording session breaks
  const recordingBreaks = useMemo(() => detectRecordingBreaks(editedSegments), [editedSegments]);

  useEffect(() => {
    if (open) {
      setEditedContent(content);
      setEditedSegments(segments);
      // Default to segmented view if segments exist, otherwise plain text
      setActiveTab(hasSegments ? 'segmented' : 'plain');
      
      // Fetch diagnostics if consultId is provided
      if (consultId) {
        fetchDiagnostics();
      }
    }
  }, [open, content, segments, hasSegments, consultId]);

  const fetchDiagnostics = async () => {
    if (!consultId) return;
    
    setLoadingDiagnostics(true);
    try {
      const { data } = await supabase
        .from('file_assets')
        .select('id, document_type, modality, analysis_json')
        .eq('consult_id', consultId)
        .eq('type', 'image');
      
      if (data) {
        setDiagnosticFiles(data as DiagnosticFile[]);
      }
    } catch (error) {
      console.error('Error fetching diagnostics:', error);
    } finally {
      setLoadingDiagnostics(false);
    }
  };

  // Sync plain text when segments change
  const segmentsToText = useMemo(() => {
    return editedSegments.map(s => s.text).join('\n\n');
  }, [editedSegments]);

  const handleSegmentUpdate = (updated: TranscriptionSegment) => {
    setEditedSegments(prev => 
      prev.map(s => s.id === updated.id ? updated : s)
    );
  };

  // Handler for plain text changes - syncs back to segments
  const handlePlainTextChange = (newText: string) => {
    setEditedContent(newText);
    
    // Sync changes back to segments if they exist
    if (hasSegments && editedSegments.length > 0) {
      const paragraphs = newText.split('\n\n');
      
      // Map paragraphs back to segments
      const updatedSegments = editedSegments.map((segment, index) => ({
        ...segment,
        text: paragraphs[index] !== undefined ? paragraphs[index] : segment.text
      }));
      
      setEditedSegments(updatedSegments);
    }
  };

  const handleSave = () => {
    // If we have segments, use the segment text; otherwise use plain text
    const finalContent = hasSegments ? segmentsToText : editedContent;
    onSave(finalContent, hasSegments ? editedSegments : undefined);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setEditedContent(content);
    setEditedSegments(segments);
    onOpenChange(false);
  };

  const title = inputMode === 'typed' ? 'Consultation Details' : 'Recording Transcription';
  const Icon = inputMode === 'typed' ? ClipboardCheck : Mic;

  // Determine which tabs to show
  const showDiagnosticsTab = diagnosticFiles.length > 0;
  const tabCount = (hasSegments && inputMode !== 'typed' ? 1 : 0) + (showDiagnosticsTab ? 1 : 0) + 1; // +1 for plain text

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 min-h-0 py-4 overflow-hidden">
          {(hasSegments && inputMode !== 'typed') || showDiagnosticsTab ? (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="h-full flex flex-col">
              <TabsList className={cn("grid w-full mb-4", `grid-cols-${tabCount}`)}>
                {hasSegments && inputMode !== 'typed' && (
                  <TabsTrigger value="segmented" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Speaker View
                  </TabsTrigger>
                )}
                {showDiagnosticsTab && (
                  <TabsTrigger value="diagnostics" className="flex items-center gap-2">
                    <FlaskConical className="h-4 w-4" />
                    Diagnostics
                  </TabsTrigger>
                )}
                <TabsTrigger value="plain" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Plain Text
                </TabsTrigger>
              </TabsList>
              
              {hasSegments && inputMode !== 'typed' && (
            <TabsContent value="segmented" className="flex-1 mt-0 overflow-hidden">
              <ScrollArea className="h-[400px]">
                <div className="pr-4 w-full max-w-full overflow-hidden">
                      <div className="space-y-3">
                        {editedSegments.map((segment, index) => {
                          const isNewRecording = recordingBreaks.includes(index);
                          return (
                            <React.Fragment key={segment.id}>
                              {isNewRecording && (
                                <div className="flex items-center gap-3 py-2">
                                  <div className="flex-1 h-px bg-border" />
                                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 px-2">
                                    <Mic className="h-3 w-3" />
                                    Continued Recording
                                  </span>
                                  <div className="flex-1 h-px bg-border" />
                                </div>
                              )}
                              <TranscriptionSegmentCard
                                segment={segment}
                                onUpdate={handleSegmentUpdate}
                              />
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>
              )}

              {showDiagnosticsTab && (
            <TabsContent value="diagnostics" className="flex-1 mt-0 overflow-hidden">
              <ScrollArea className="h-[400px]">
                <div className="pr-4 w-full max-w-full overflow-hidden">
                      {loadingDiagnostics ? (
                        <div className="text-center text-muted-foreground py-8">
                          <FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-50 animate-pulse" />
                          <p>Loading diagnostics...</p>
                        </div>
                      ) : diagnosticFiles.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                          <FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No diagnostics uploaded for this consult</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {diagnosticFiles.map(file => (
                            <DiagnosticCard key={file.id} file={file} />
                          ))}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              )}
              
              <TabsContent value="plain" className="flex-1 mt-0">
                <Textarea
                  value={hasSegments ? segmentsToText : editedContent}
                  onChange={(e) => handlePlainTextChange(e.target.value)}
                  className="h-[400px] resize-none font-mono text-sm"
                  placeholder="No transcription available"
                />
              </TabsContent>
            </Tabs>
          ) : (
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="h-[400px] resize-none font-mono text-sm"
              placeholder={inputMode === 'typed' ? 'No consultation details available' : 'No transcription available'}
            />
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
