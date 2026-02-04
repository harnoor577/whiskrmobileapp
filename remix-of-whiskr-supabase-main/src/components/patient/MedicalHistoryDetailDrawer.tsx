import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { 
  FileText, 
  Download, 
  RefreshCw, 
  User, 
  Pill, 
  AlertTriangle,
  ClipboardList,
  Loader2,
  Syringe,
  FileSearch,
  Scissors,
  BookOpen,
  Building2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface FileAsset {
  id: string;
  storage_key: string;
  document_type: string | null;
  mime_type: string | null;
  created_at: string;
  analysis_json: any;
}

interface MedicalHistoryDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consultId: string;
  patientId: string;
}

export function MedicalHistoryDetailDrawer({
  open,
  onOpenChange,
  consultId,
  patientId,
}: MedicalHistoryDetailDrawerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [fileAsset, setFileAsset] = useState<FileAsset | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (open && consultId) {
      loadMedicalHistoryFile();
    }
  }, [open, consultId]);

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

  // Normalize species
  const normalizeSpecies = (species: string | undefined): string | null => {
    if (!species) return null;
    const s = species.toLowerCase().trim();
    
    if (s === 'canine' || s === 'dog' || s === 'k9') return 'Canine';
    if (s === 'feline' || s === 'cat') return 'Feline';
    if (s === 'equine' || s === 'horse') return 'Equine';
    if (s === 'avian' || s === 'bird') return 'Avian';
    
    return species.charAt(0).toUpperCase() + species.slice(1).toLowerCase();
  };

  // Auto-apply extracted patient info to the patient record
  const applyPatientInfoToRecord = async (analysisData: any) => {
    if (!analysisData?.patient || !patientId) return;
    
    try {
      const patientUpdate: Record<string, any> = {};
      
      if (analysisData.patient.name) patientUpdate.name = analysisData.patient.name;
      
      const normalizedSpecies = normalizeSpecies(analysisData.patient.species);
      if (normalizedSpecies) patientUpdate.species = normalizedSpecies;
      
      if (analysisData.patient.breed) patientUpdate.breed = analysisData.patient.breed;
      
      const normalizedSex = normalizeSex(analysisData.patient.sex);
      if (normalizedSex) patientUpdate.sex = normalizedSex;
      
      if (analysisData.patient.age) patientUpdate.age = analysisData.patient.age;
      
      // Handle weight conversion - support both {value, unit} and {kg/lb} formats
      const weight = analysisData.patient.weight;
      if (weight) {
        if (weight.kg) {
          patientUpdate.weight_kg = parseFloat(weight.kg);
          patientUpdate.weight_lb = patientUpdate.weight_kg * 2.20462;
        } else if (weight.lb) {
          patientUpdate.weight_lb = parseFloat(weight.lb);
          patientUpdate.weight_kg = patientUpdate.weight_lb * 0.453592;
        } else if (weight.value !== undefined && weight.unit) {
          const weightValue = parseFloat(weight.value);
          if (!isNaN(weightValue)) {
            const unit = weight.unit.toLowerCase();
            if (unit.includes('kg') || unit.includes('kilo')) {
              patientUpdate.weight_kg = weightValue;
              patientUpdate.weight_lb = weightValue * 2.20462;
            } else if (unit.includes('lb') || unit.includes('pound')) {
              patientUpdate.weight_lb = weightValue;
              patientUpdate.weight_kg = weightValue * 0.453592;
            } else {
              patientUpdate.weight_kg = weightValue;
              patientUpdate.weight_lb = weightValue * 2.20462;
            }
          }
        }
      }
      
      // Add allergies to alerts
      if (analysisData.allergies?.length) {
        patientUpdate.alerts = analysisData.allergies.join(', ');
      }

      if (Object.keys(patientUpdate).length > 0) {
        const { error } = await supabase
          .from('patients')
          .update(patientUpdate)
          .eq('id', patientId);
        
        if (error) {
          console.error('Failed to auto-apply patient info:', error);
        } else {
          console.log('Auto-applied patient info from medical history:', patientUpdate);
        }
      }
    } catch (error) {
      console.error('Error auto-applying patient info:', error);
    }
  };

  const loadMedicalHistoryFile = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('file_assets')
        .select('*')
        .eq('consult_id', consultId)
        .eq('document_type', 'medical_history')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      setFileAsset(data);

      // Auto-apply patient info from analysis
      if (data?.analysis_json) {
        await applyPatientInfoToRecord(data.analysis_json);
      }

      // Load preview for images
      if (data?.mime_type?.startsWith('image/') && data?.storage_key) {
        const { data: signedUrl } = await supabase.storage
          .from('medical-history')
          .createSignedUrl(data.storage_key, 3600);
        
        if (signedUrl?.signedUrl) {
          setImageUrl(signedUrl.signedUrl);
        }
      }
    } catch (error) {
      console.error('Error loading medical history file:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!fileAsset?.storage_key) return;

    try {
      const { data, error } = await supabase.storage
        .from('medical-history')
        .download(fileAsset.storage_key);

      if (error) throw error;

      const fileName = fileAsset.storage_key.split('/').pop() || 'medical-history';
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download failed",
        description: "Could not download the file",
        variant: "destructive",
      });
    }
  };

  const handleRegenerate = async () => {
    if (!fileAsset) return;

    setRegenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-document', {
        body: {
          caseId: consultId,
          file: {
            id: fileAsset.id,
            name: fileAsset.storage_key.split('/').pop(),
            mime: fileAsset.mime_type,
            storagePath: fileAsset.storage_key,
          },
          extractPatientInfo: true,
        },
      });

      if (error) throw error;

      toast({
        title: "Analysis regenerated",
        description: "The document has been re-analyzed.",
      });

      loadMedicalHistoryFile();
    } catch (error) {
      console.error('Regeneration error:', error);
      toast({
        title: "Regeneration failed",
        description: "Could not regenerate the analysis",
        variant: "destructive",
      });
    } finally {
      setRegenerating(false);
    }
  };

  const getFileName = () => {
    if (!fileAsset?.storage_key) return 'Medical History';
    const parts = fileAsset.storage_key.split('/');
    const fileName = parts[parts.length - 1];
    return fileName.replace(/^[a-f0-9-]{36}_/, '');
  };

  const analysis = fileAsset?.analysis_json;

  // Helper to check if section has data
  const hasData = (data: any): boolean => {
    if (!data) return false;
    if (Array.isArray(data)) return data.length > 0;
    if (typeof data === 'string') return data.trim().length > 0;
    if (typeof data === 'object') return Object.keys(data).length > 0;
    return Boolean(data);
  };

  // Combine allergies from analysis for Key Alerts
  const keyAlerts = [
    ...(analysis?.allergies || []),
    ...(analysis?.diagnoses?.filter((d: string) => 
      d.toLowerCase().includes('critical') || 
      d.toLowerCase().includes('severe') ||
      d.toLowerCase().includes('emergency')
    ) || [])
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Patient History
          </DialogTitle>
          <DialogDescription>
            {fileAsset && format(new Date(fileAsset.created_at), "MMMM d, yyyy 'at' h:mm a")}
          </DialogDescription>
        </DialogHeader>

        <div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !fileAsset ? (
            <div className="text-center py-12 text-muted-foreground">
              No medical history file found
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {/* Document Actions */}
              <div className="flex items-center justify-between gap-2 pb-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{getFileName()}</p>
                  <p className="text-xs text-muted-foreground">{fileAsset.mime_type}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    className="gap-1.5"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    className="gap-1.5"
                  >
                    {regenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Re-analyze
                  </Button>
                </div>
              </div>

              {/* Image Preview */}
              {imageUrl && (
                <div className="rounded-lg overflow-hidden border bg-muted">
                  <img 
                    src={imageUrl} 
                    alt="Medical history document" 
                    className="w-full h-auto max-h-[200px] object-contain"
                  />
                </div>
              )}

              {analysis ? (
                <Card>
                  <CardContent className="pt-6 space-y-6">
                    {/* 1. Patient Information */}
                    <div>
                      <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                        <User className="h-4 w-4" />
                        Patient Information
                      </h4>
                      {analysis.patient ? (
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {analysis.patient.name && (
                            <div>• Name: {analysis.patient.name}</div>
                          )}
                          {analysis.patient.species && (
                            <div>• Species: {analysis.patient.species}</div>
                          )}
                          {analysis.patient.breed && (
                            <div>• Breed: {analysis.patient.breed}</div>
                          )}
                          {analysis.patient.sex && (
                            <div>• Sex: {analysis.patient.sex}</div>
                          )}
                          {analysis.patient.age && (
                            <div>• Age: {analysis.patient.age}</div>
                          )}
                          {analysis.patient.weight && (
                            <div>• Weight: {analysis.patient.weight.value} {analysis.patient.weight.unit}</div>
                          )}
                          {analysis.patient.owner && (
                            <div className="col-span-2">• Owner: {analysis.patient.owner}</div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No patient information extracted</p>
                      )}
                    </div>

                    <Separator />

                    {/* 2. Key Alerts */}
                    <div>
                      <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4" />
                        Key Alerts
                      </h4>
                      {keyAlerts.length > 0 ? (
                        <ul className="text-sm space-y-1">
                          {keyAlerts.map((alert: string, i: number) => (
                            <li key={i}>• {alert}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No critical alerts</p>
                      )}
                    </div>

                    <Separator />

                    {/* 3. Full Problem List */}
                    <div>
                      <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                        <ClipboardList className="h-4 w-4" />
                        Full Problem List
                      </h4>
                      {hasData(analysis.diagnoses) ? (
                        <ul className="text-sm space-y-1">
                          {analysis.diagnoses.map((dx: string, i: number) => (
                            <li key={i}>• {dx}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No diagnoses extracted</p>
                      )}
                    </div>

                    <Separator />

                    {/* 4. Vaccine History */}
                    <div>
                      <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                        <Syringe className="h-4 w-4" />
                        Vaccine History
                      </h4>
                      {hasData(analysis.vaccines) ? (
                        <ul className="text-sm space-y-1">
                          {analysis.vaccines.map((vaccine: string, i: number) => (
                            <li key={i}>• {vaccine}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No vaccine history extracted</p>
                      )}
                    </div>

                    <Separator />

                    {/* 5. Medications */}
                    <div>
                      <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                        <Pill className="h-4 w-4" />
                        Medications
                      </h4>
                      {hasData(analysis.medications) ? (
                        <ul className="text-sm space-y-1">
                          {analysis.medications.map((med: string, i: number) => (
                            <li key={i}>• {med}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No medications extracted</p>
                      )}
                    </div>

                    <Separator />

                    {/* 6. Diagnostic Tests */}
                    <div>
                      <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                        <FileSearch className="h-4 w-4" />
                        Diagnostic Tests
                      </h4>
                      {hasData(analysis.diagnostic_tests) ? (
                        <ul className="text-sm space-y-1">
                          {analysis.diagnostic_tests.map((test: string, i: number) => (
                            <li key={i}>• {test}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No diagnostic tests extracted</p>
                      )}
                    </div>

                    <Separator />

                    {/* 7. Surgical and Anesthetic History */}
                    <div>
                      <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                        <Scissors className="h-4 w-4" />
                        Surgical and Anesthetic History
                      </h4>
                      {hasData(analysis.surgical_history) ? (
                        <ul className="text-sm space-y-1">
                          {analysis.surgical_history.map((surgery: string, i: number) => (
                            <li key={i}>• {surgery}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No surgical history extracted</p>
                      )}
                    </div>

                    <Separator />

                    {/* 8. Allergies and Adverse Reactions */}
                    <div>
                      <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4" />
                        Allergies and Adverse Reactions
                      </h4>
                      {hasData(analysis.allergies) ? (
                        <ul className="text-sm space-y-1">
                          {analysis.allergies.map((allergy: string, i: number) => (
                            <li key={i}>• {allergy}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No allergies extracted</p>
                      )}
                    </div>

                    <Separator />

                    {/* 9. Medical History Narrative Summary */}
                    <div>
                      <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                        <BookOpen className="h-4 w-4" />
                        Medical History Narrative Summary
                      </h4>
                      {hasData(analysis.medical_history_summary || analysis.summary) ? (
                        <ul className="text-sm space-y-1">
                          {(analysis.medical_history_summary || analysis.summary)
                            .split(/(?<=[.!?])\s+/)
                            .filter((sentence: string) => sentence.trim().length > 0)
                            .map((sentence: string, i: number) => (
                              <li key={i}>• {sentence.trim()}</li>
                            ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No summary extracted</p>
                      )}
                    </div>

                    <Separator />

                    {/* 10. Clinics and Veterinarians Involved */}
                    <div>
                      <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                        <Building2 className="h-4 w-4" />
                        Clinics and Veterinarians Involved
                      </h4>
                      {hasData(analysis.clinics) ? (
                        <ul className="text-sm space-y-1">
                          {analysis.clinics.map((clinic: string, i: number) => (
                            <li key={i}>• {clinic}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No clinic information extracted</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">
                    No analysis data available
                  </p>
                  <Button onClick={handleRegenerate} disabled={regenerating}>
                    {regenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Analyze Document
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <Separator className="my-4" />

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
