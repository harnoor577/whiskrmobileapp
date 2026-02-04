import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Upload, X, FileImage, FileText, Check, Loader2, FlaskConical, Scan, AlertTriangle, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface DiagnosticAnalysis {
  document_type?: string;
  summary?: string;
  labPanel?: {
    parsed?: Array<{
      analyte: string;
      value: string | number;
      unit: string;
      flag: string;
    }>;
    notes?: string;
  };
  imaging?: {
    findings?: string[];
    impression?: string[];
  };
  differentials?: Array<{
    dx: string;
    likelihood: string;
    why: string;
  }>;
  recommended_tests?: Array<{
    test: string;
    rationale: string;
  }>;
}

interface UploadDiagnosticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consultId: string;
  clinicId: string;
  onUploadComplete?: (fileCount: number) => void;
  onAnalysisComplete?: (analysis: DiagnosticAnalysis) => void;
  patientInfo?: { species?: string; sex?: string; age?: string };
  existingTranscription?: string;
}

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  status: 'uploading' | 'completed' | 'error';
  progress: number;
  analysis?: DiagnosticAnalysis;
}

export function UploadDiagnosticsDialog({
  open,
  onOpenChange,
  consultId,
  clinicId,
  onUploadComplete,
  onAnalysisComplete,
  patientInfo,
  existingTranscription,
}: UploadDiagnosticsDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState<DiagnosticAnalysis | null>(null);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // Load existing diagnostics when dialog opens
  useEffect(() => {
    if (open && consultId) {
      loadExistingDiagnostics();
    }
  }, [open, consultId]);

  const loadExistingDiagnostics = async () => {
    setIsLoadingExisting(true);
    try {
      const { data: existingFiles, error } = await supabase
        .from('file_assets')
        .select('id, storage_key, mime_type, analysis_json, document_type')
        .eq('consult_id', consultId)
        .eq('clinic_id', clinicId);

      if (error) {
        console.error('Error loading existing diagnostics:', error);
        return;
      }

      if (existingFiles && existingFiles.length > 0) {
        // Convert to UploadedFile format with analysis
        const loadedFiles: UploadedFile[] = existingFiles.map((file) => ({
          id: file.id,
          name: file.storage_key.split('/').pop() || 'Diagnostic File',
          type: file.mime_type || 'application/octet-stream',
          status: 'completed' as const,
          progress: 100,
          analysis: file.analysis_json as DiagnosticAnalysis | undefined,
        }));

        setFiles(loadedFiles);

        // Set current analysis to the most recent one with data
        const fileWithAnalysis = loadedFiles.find(f => f.analysis);
        if (fileWithAnalysis?.analysis) {
          setCurrentAnalysis(fileWithAnalysis.analysis);
        }
      }
    } catch (err) {
      console.error('Failed to load existing diagnostics:', err);
    } finally {
      setIsLoadingExisting(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    handleFiles(selectedFiles);
  };

  const handleFiles = async (selectedFiles: File[]) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const validFiles = selectedFiles.filter(file => validTypes.includes(file.type));

    if (validFiles.length !== selectedFiles.length) {
      toast({
        title: "Invalid file type",
        description: "Only images (JPEG, PNG, WebP) and PDFs are supported.",
        variant: "destructive",
      });
    }

    for (const file of validFiles) {
      await uploadFile(file);
    }
  };

  const uploadFile = async (file: File) => {
    const fileId = crypto.randomUUID();
    const uploadedFile: UploadedFile = {
      id: fileId,
      name: file.name,
      type: file.type,
      status: 'uploading',
      progress: 0,
    };

    setFiles(prev => [...prev, uploadedFile]);

    try {
      // Create storage path
      const fileExt = file.name.split('.').pop();
      const storagePath = `${clinicId}/${consultId}/${fileId}.${fileExt}`;

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('diagnostic-images')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Update progress
      setFiles(prev =>
        prev.map(f =>
          f.id === fileId ? { ...f, progress: 50 } : f
        )
      );

      // Create file_assets record and get the inserted ID
      const { data: fileAsset, error: dbError } = await supabase
        .from('file_assets')
        .insert({
          clinic_id: clinicId,
          consult_id: consultId,
          storage_key: storagePath,
          type: file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'other',
          mime_type: file.type,
          size_bytes: file.size,
          document_type: 'diagnostic',
        })
        .select('id')
        .single();

      if (dbError) throw dbError;

      // Mark upload as completed
      setFiles(prev =>
        prev.map(f =>
          f.id === fileId ? { ...f, status: 'completed', progress: 100 } : f
        )
      );

      // Auto-analyze the document
      if (fileAsset?.id) {
        setIsAnalyzing(true);
        try {
          const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyze-document', {
            body: {
              caseId: consultId,
              file: {
                id: fileAsset.id,
                name: file.name,
                storagePath: storagePath,
                mime: file.type,
              },
              patient: patientInfo ? {
                species: patientInfo.species,
                sex: patientInfo.sex,
                age: patientInfo.age,
              } : null,
              presentingComplaint: existingTranscription,
            }
          });

          if (analysisError) {
            console.error('Analysis error:', analysisError);
          } else if (analysisData?.analysis) {
            // Extract the inner analysis object from the response wrapper
            const analysis = analysisData.analysis;
            
            // Store analysis in the file object and current analysis state
            setFiles(prev =>
              prev.map(f =>
                f.id === fileId ? { ...f, analysis } : f
              )
            );
            setCurrentAnalysis(analysis);
            
            // Call the callback to update transcription
            onAnalysisComplete?.(analysis);
          }
        } catch (analysisErr) {
          console.error('Failed to analyze document:', analysisErr);
        } finally {
          setIsAnalyzing(false);
        }
      }

    } catch (error: any) {
      console.error('Upload error:', error);
      setFiles(prev =>
        prev.map(f =>
          f.id === fileId ? { ...f, status: 'error', progress: 0 } : f
        )
      );
      toast({
        title: "Upload Failed",
        description: `Failed to upload ${file.name}.`,
        variant: "destructive",
      });
    }
  };

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleAddMore = () => {
    fileInputRef.current?.click();
  };

  const handleDone = () => {
    if (isAnalyzing) return;
    
    const completedCount = files.filter(f => f.status === 'completed').length;
    if (completedCount > 0) {
      const existingCount = parseInt(sessionStorage.getItem('uploadedDiagnosticsCount') || '0', 10);
      sessionStorage.setItem('uploadedDiagnosticsCount', String(existingCount + completedCount));
      onUploadComplete?.(completedCount);
    }
    setFiles([]);
    setCurrentAnalysis(null);
    onOpenChange(false);
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) {
      return <FileImage className="h-5 w-5 text-blue-500" />;
    }
    return <FileText className="h-5 w-5 text-orange-500" />;
  };

  const getFlagColor = (flag: string) => {
    const f = flag?.toLowerCase();
    if (f === 'high' || f === 'critical high' || f === 'h') return 'text-red-500 font-semibold';
    if (f === 'low' || f === 'critical low' || f === 'l') return 'text-blue-500 font-semibold';
    return 'text-muted-foreground';
  };

  const toggleFileExpansion = (fileId: string) => {
    setExpandedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const hasFileAnalysis = (file: UploadedFile) => {
    return file.analysis && (
      file.analysis.document_type ||
      file.analysis.summary ||
      (file.analysis.labPanel?.parsed && file.analysis.labPanel.parsed.length > 0) ||
      (file.analysis.imaging?.findings && file.analysis.imaging.findings.length > 0)
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Upload Diagnostics</DialogTitle>
        </DialogHeader>

        <div className="flex-1 pr-4 overflow-y-auto max-h-[calc(85vh-140px)]">
          <div className="space-y-4">
            {/* Dropzone */}
            <div
              className={`
                border-2 border-dashed rounded-lg p-6 text-center transition-colors
                ${isDragging ? 'border-primary bg-primary/5' : 'border-border'}
              `}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground mb-1">
                Drag and drop files here
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                or click to browse
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                Select Files
              </Button>
              <p className="text-xs text-muted-foreground mt-3">
                Supported: JPEG, PNG, WebP, PDF
              </p>
            </div>

            {/* File list with inline collapsible analysis */}
            {files.length > 0 && (
              <div className="space-y-2">
                {files.map(file => (
                  <div
                    key={file.id}
                    className="bg-muted/50 rounded-lg overflow-hidden"
                  >
                    {/* File header row */}
                    <div className="flex items-center gap-3 p-3">
                      {getFileIcon(file.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        {file.status === 'uploading' && (
                          <Progress value={file.progress} className="h-1 mt-1" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {file.status === 'uploading' && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                        {file.status === 'completed' && hasFileAnalysis(file) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleFileExpansion(file.id)}
                            className="text-xs h-7 px-2"
                          >
                            {expandedFiles.has(file.id) ? (
                              <ChevronDown className="h-4 w-4 mr-1" />
                            ) : (
                              <ChevronRight className="h-4 w-4 mr-1" />
                            )}
                            Analysis
                          </Button>
                        )}
                        {file.status === 'completed' && !hasFileAnalysis(file) && (
                          <Check className="h-4 w-4 text-green-500" />
                        )}
                        {file.status === 'error' && (
                          <span className="text-xs text-destructive">Failed</span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeFile(file.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Collapsible analysis section */}
                    {hasFileAnalysis(file) && expandedFiles.has(file.id) && (
                      <div className="border-t p-3 bg-card space-y-3">
                        {/* Document Type */}
                        {file.analysis?.document_type && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">Type:</span>
                            <span className="font-medium">{file.analysis.document_type}</span>
                          </div>
                        )}

                        {/* Summary */}
                        {file.analysis?.summary && (
                          <div className="text-xs">
                            <p className="text-muted-foreground mb-1">Summary:</p>
                            <p className="text-foreground">{file.analysis.summary}</p>
                          </div>
                        )}

                        {/* Lab Results */}
                        {file.analysis?.labPanel?.parsed && file.analysis.labPanel.parsed.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <FlaskConical className="h-3 w-3 text-purple-500" />
                              <span className="text-xs font-medium">Lab Results</span>
                            </div>
                            <div className="bg-muted/30 rounded p-2 space-y-1">
                              {file.analysis.labPanel.parsed.map((lab, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs">
                                  <span>{lab.analyte}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono">{lab.value} {lab.unit}</span>
                                    {lab.flag && lab.flag.toLowerCase() !== 'normal' && (
                                      <span className={getFlagColor(lab.flag)}>{lab.flag.toUpperCase()}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {file.analysis.labPanel.notes && (
                              <p className="text-xs text-muted-foreground mt-1 italic">
                                {file.analysis.labPanel.notes}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Imaging Findings */}
                        {file.analysis?.imaging?.findings && file.analysis.imaging.findings.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Scan className="h-3 w-3 text-blue-500" />
                              <span className="text-xs font-medium">Imaging Findings</span>
                            </div>
                            <ul className="bg-muted/30 rounded p-2 space-y-1">
                              {file.analysis.imaging.findings.map((finding, idx) => (
                                <li key={idx} className="text-xs flex items-start gap-2">
                                  <span className="text-muted-foreground">•</span>
                                  <span>{finding}</span>
                                </li>
                              ))}
                            </ul>
                            {file.analysis.imaging.impression && file.analysis.imaging.impression.length > 0 && (
                              <div className="mt-2 flex items-start gap-2 text-xs">
                                <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                                <p className="text-foreground">
                                  <span className="font-medium">Impression: </span>
                                  {file.analysis.imaging.impression.join('; ')}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Analysis indicator */}
            {isAnalyzing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Analyzing diagnostic document...</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between gap-2 pt-4 border-t mt-4">
          {files.some(f => f.status === 'completed') && !isAnalyzing ? (
            <>
              <Button variant="outline" onClick={handleAddMore}>
                <Plus className="h-4 w-4 mr-2" />
                Add More
              </Button>
              <Button onClick={handleDone}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isAnalyzing}>
                Cancel
              </Button>
              <Button onClick={handleDone} disabled={isAnalyzing || files.length === 0}>
                {isAnalyzing ? 'Analyzing...' : 'Done'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
