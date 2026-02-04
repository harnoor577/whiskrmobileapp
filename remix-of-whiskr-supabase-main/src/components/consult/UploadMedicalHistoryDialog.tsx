import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { FileUp, X, FileText, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';

export interface ExtractedPatientInfo {
  name?: string;
  species?: string;
  breed?: string;
  sex?: string;
  age?: string;
  dateOfBirth?: string;
  weight?: { kg?: number; lb?: number };
  medicalHistory?: string;
  diagnoses?: string[];
  medications?: string[];
  allergies?: string[];
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
}

interface UploadMedicalHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consultId: string;
  patientId: string;
  onComplete: (patientId: string, extractedInfo: ExtractedPatientInfo) => void;
  onBack: () => void;
}

type UploadStatus = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: UploadStatus;
  storageKey?: string;
  analysis?: any;
  error?: string;
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Helper function to determine file type based on MIME type
const getFileType = (mimeType: string): 'pdf' | 'image' | 'audio' | 'other' => {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'other';
};

// Normalize sex abbreviations to database-compatible values
const normalizeSex = (sex: string | undefined): string | null => {
  if (!sex) return null;
  const s = sex.toLowerCase().trim();
  
  if (s === 'mn' || s === 'm/n' || s === 'male neutered' || s === 'castrated male' || s === 'nm' || s === 'neutered male') {
    return 'Male (Neutered)';
  }
  if (s === 'fs' || s === 'f/s' || s === 'female spayed' || s === 'spayed female' || s === 'sf' || s === 'spayed') {
    return 'Female (Spayed)';
  }
  if (s === 'm' || s === 'male' || s === 'intact male') {
    return 'Male';
  }
  if (s === 'f' || s === 'female' || s === 'intact female') {
    return 'Female';
  }
  if (s === 'unknown' || s === 'u' || s === 'unk') {
    return 'Unknown';
  }
  
  const validValues = ['Male', 'Female', 'Male (Neutered)', 'Female (Spayed)', 'Unknown'];
  if (validValues.includes(sex)) return sex;
  
  return null;
};

// Normalize species to consistent format
const normalizeSpecies = (species: string | undefined): string | null => {
  if (!species) return null;
  const s = species.toLowerCase().trim();
  
  if (s === 'canine' || s === 'dog' || s === 'k9') return 'Canine';
  if (s === 'feline' || s === 'cat') return 'Feline';
  if (s === 'equine' || s === 'horse') return 'Equine';
  if (s === 'avian' || s === 'bird') return 'Avian';
  if (s === 'bovine' || s === 'cow' || s === 'cattle') return 'Bovine';
  if (s === 'rabbit' || s === 'bunny') return 'Rabbit';
  if (s === 'rodent' || s === 'hamster' || s === 'guinea pig') return 'Rodent';
  if (s === 'reptile' || s === 'snake' || s === 'lizard' || s === 'turtle') return 'Reptile';
  
  return species.charAt(0).toUpperCase() + species.slice(1).toLowerCase();
};

// Extract weight from various formats
const extractWeight = (weight: any): { weight_kg?: number; weight_lb?: number } | null => {
  if (!weight) return null;
  
  const result: { weight_kg?: number; weight_lb?: number } = {};
  
  if (weight.kg) {
    result.weight_kg = parseFloat(weight.kg);
    result.weight_lb = result.weight_kg * 2.20462;
    return result;
  }
  if (weight.lb) {
    result.weight_lb = parseFloat(weight.lb);
    result.weight_kg = result.weight_lb * 0.453592;
    return result;
  }
  
  if (weight.value !== undefined && weight.unit) {
    const value = parseFloat(weight.value);
    if (isNaN(value)) return null;
    
    const unit = weight.unit.toLowerCase();
    if (unit.includes('kg') || unit.includes('kilo')) {
      result.weight_kg = value;
      result.weight_lb = value * 2.20462;
    } else if (unit.includes('lb') || unit.includes('pound')) {
      result.weight_lb = value;
      result.weight_kg = value * 0.453592;
    } else {
      result.weight_kg = value;
      result.weight_lb = value * 2.20462;
    }
    return result;
  }
  
  return null;
};

export function UploadMedicalHistoryDialog({
  open,
  onOpenChange,
  consultId,
  patientId,
  onComplete,
  onBack,
}: UploadMedicalHistoryDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { clinicId, user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const resetState = () => {
    setUploadedFile(null);
    setIsDragOver(false);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFile = async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF, image (JPEG, PNG, WebP), or Word document.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File too large",
        description: "Maximum file size is 50MB.",
        variant: "destructive",
      });
      return;
    }

    const fileId = crypto.randomUUID();
    const uploadedFileObj: UploadedFile = {
      id: fileId,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'uploading',
    };

    setUploadedFile(uploadedFileObj);

    try {
      const storagePath = `${clinicId}/${patientId}/${fileId}_${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('medical-history')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      setUploadedFile(prev => prev ? { ...prev, progress: 50, storageKey: storagePath } : null);

      const { data: fileAsset, error: assetError } = await supabase
        .from('file_assets')
        .insert({
          clinic_id: clinicId,
          patient_id: patientId,
          consult_id: consultId,
          storage_key: storagePath,
          type: getFileType(file.type),
          document_type: 'medical_history',
          mime_type: file.type,
          size_bytes: file.size,
          created_by: user?.id,
        })
        .select()
        .single();

      if (assetError) throw assetError;

      setUploadedFile(prev => prev ? { 
        ...prev, 
        id: fileAsset.id, 
        progress: 70, 
        status: 'analyzing' 
      } : null);

      const { data: analysisResult, error: analysisError } = await supabase.functions
        .invoke('analyze-document', {
          body: {
            caseId: consultId,
            file: {
              id: fileAsset.id,
              name: file.name,
              mime: file.type,
              storagePath: storagePath,
            },
            extractPatientInfo: true,
          },
        });

      if (analysisError) throw analysisError;

      if (!analysisResult?.ok) {
        throw new Error(analysisResult?.error || 'Analysis failed');
      }

      const analysis = analysisResult.analysis;
      const extracted: ExtractedPatientInfo = {
        name: analysis?.patient?.name,
        species: analysis?.patient?.species,
        breed: analysis?.patient?.breed,
        sex: analysis?.patient?.sex,
        age: analysis?.patient?.age,
        weight: analysis?.patient?.weight,
        medicalHistory: analysis?.medical_history_summary || analysis?.summary,
        diagnoses: analysis?.diagnoses || [],
        medications: analysis?.medications || [],
        allergies: analysis?.allergies || [],
        ownerName: analysis?.owner?.name,
        ownerPhone: analysis?.owner?.phone,
        ownerEmail: analysis?.owner?.email,
      };

      setUploadedFile(prev => prev ? { 
        ...prev, 
        progress: 100, 
        status: 'complete',
        analysis: analysis,
      } : null);

      // Auto-apply patient updates
      const patientUpdate: Record<string, any> = {};

      if (extracted.name) patientUpdate.name = extracted.name;
      
      const normalizedSpecies = normalizeSpecies(extracted.species);
      if (normalizedSpecies) patientUpdate.species = normalizedSpecies;
      
      if (extracted.breed) patientUpdate.breed = extracted.breed;
      
      const normalizedSex = normalizeSex(extracted.sex);
      if (normalizedSex) patientUpdate.sex = normalizedSex;
      
      if (extracted.age) patientUpdate.age = extracted.age;

      const weightData = extractWeight(extracted.weight);
      if (weightData) {
        if (weightData.weight_kg) patientUpdate.weight_kg = weightData.weight_kg;
        if (weightData.weight_lb) patientUpdate.weight_lb = weightData.weight_lb;
      }

      if (extracted.allergies?.length) {
        patientUpdate.alerts = extracted.allergies.join(', ');
      }

      if (Object.keys(patientUpdate).length > 0) {
        const { error: patientAutoUpdateError } = await supabase
          .from('patients')
          .update(patientUpdate)
          .eq('id', patientId);
        
        if (patientAutoUpdateError) {
          console.error('Failed to auto-apply patient info:', patientAutoUpdateError);
        } else {
          console.log('Auto-applied patient info from medical history:', patientUpdate);
        }
      }
      
      // Trigger background enrichment for deeper AI analysis
      supabase.functions.invoke('enrich-patient-details', {
        body: { patientId }
      }).catch(err => console.log('Background patient enrichment:', err));

      const caseNotesData = {
        imported_medical_history: {
          summary: extracted.medicalHistory,
          diagnoses: extracted.diagnoses,
          medications: extracted.medications,
          allergies: extracted.allergies,
          imported_at: new Date().toISOString(),
        },
      };

      const { error: consultUpdateError } = await supabase
        .from('consults')
        .update({
          case_notes: JSON.stringify(caseNotesData),
          status: 'finalized',
        })
        .eq('id', consultId);

      if (consultUpdateError) {
        console.error('Failed to update consult:', consultUpdateError);
        toast({
          title: "Warning",
          description: "Document analyzed but failed to save to timeline. Please try again.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Medical history imported",
        description: "Patient information has been updated successfully.",
      });

      // Auto-close and navigate
      onOpenChange(false);
      onComplete(patientId, extracted);
      navigate(`/patients/${patientId}?t=${Date.now()}`);

    } catch (error: any) {
      console.error('Upload/analysis error:', error);
      setUploadedFile(prev => prev ? { 
        ...prev, 
        status: 'error',
        error: error.message || 'Upload failed',
      } : null);

      toast({
        title: "Error",
        description: error.message || "Failed to process document",
        variant: "destructive",
      });
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
  };

  const handleBack = () => {
    resetState();
    onBack();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetState();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-primary" />
            Upload Medical History
          </DialogTitle>
          <DialogDescription>
            Upload existing medical records to extract patient information automatically
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop Zone */}
          {!uploadedFile && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragOver 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border hover:border-primary/50 hover:bg-accent/50'
              }`}
            >
              <FileUp className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium mb-1">
                Drop your file here or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                PDF, JPEG, PNG, WebP, or Word documents (max 50MB)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          )}

          {/* Uploaded File */}
          {uploadedFile && (
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileText className="h-8 w-8 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{uploadedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(uploadedFile.size)}
                    </p>
                  </div>
                </div>
                {uploadedFile.status === 'error' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={handleRemoveFile}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Progress */}
              {(uploadedFile.status === 'uploading' || uploadedFile.status === 'analyzing') && (
                <div className="space-y-2">
                  <Progress value={uploadedFile.progress} className="h-2" />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>
                      {uploadedFile.status === 'uploading' 
                        ? 'Uploading...' 
                        : 'Analyzing document with AI...'}
                    </span>
                  </div>
                </div>
              )}

              {/* Error */}
              {uploadedFile.status === 'error' && (
                <p className="text-xs text-destructive">{uploadedFile.error}</p>
              )}

              {/* Success - brief message before auto-redirect */}
              {uploadedFile.status === 'complete' && (
                <div className="flex items-center gap-2 text-xs text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Redirecting to patient profile...</span>
                </div>
              )}
            </div>
          )}

          {/* Back button - only show when idle or error */}
          {(!uploadedFile || uploadedFile.status === 'error') && (
            <div className="flex justify-start pt-2">
              <Button variant="outline" onClick={handleBack} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
