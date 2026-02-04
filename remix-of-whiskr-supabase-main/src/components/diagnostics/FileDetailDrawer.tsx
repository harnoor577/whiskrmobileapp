import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Download, Edit2, RefreshCw, FileText, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface FileAsset {
  id: string;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  type: string;
  document_type: string | null;
  modality: string | null;
  analysis_json: any;
  pdf_path: string | null;
  created_at: string;
  consult_id: string | null;
}

interface ConsultWithFiles {
  id: string;
  started_at: string;
  patient: {
    id: string;
    name: string;
    species: string;
  };
}

interface FileDetailDrawerProps {
  file: FileAsset;
  consult: ConsultWithFiles;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export function FileDetailDrawer({ file, consult, open, onClose, onRefresh }: FileDetailDrawerProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [fileName, setFileName] = useState(getFileName(file.storage_key));
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  function getFileName(storageKey: string) {
    const parts = storageKey.split('/');
    return parts[parts.length - 1];
  }

  const handleRename = async () => {
    try {
      const { error } = await supabase.functions.invoke('rename-file', {
        body: { fileId: file.id, newName: fileName },
      });

      if (error) throw error;

      toast({ title: 'Success', description: 'File renamed successfully' });
      setIsEditing(false);
      onRefresh();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to rename file',
      });
    }
  };

  const handleRegenerateEvaluation = async () => {
    setIsRegenerating(true);
    try {
      const { error } = await supabase.functions.invoke('regenerate-evaluation', {
        body: { fileId: file.id },
      });

      if (error) throw error;

      toast({ title: 'Success', description: 'Evaluation regenerated successfully' });
      onRefresh();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to regenerate evaluation',
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-diagnostic-pdf', {
        body: { fileId: file.id },
      });

      if (error) throw error;

      // Create download link
      const url = data.pdfUrl;
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName.replace(/\.[^/.]+$/, '')}_report.pdf`;
      a.click();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to download PDF',
      });
    }
  };

  const loadImagePreview = async () => {
    if (file.mime_type?.startsWith('image/')) {
      const { data } = supabase.storage
        .from('diagnostic-images')
        .getPublicUrl(file.storage_key);
      setImageUrl(data.publicUrl);
    }
  };

  useState(() => {
    loadImagePreview();
  });

  const analysis = file.analysis_json || {};

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Diagnostic File Details</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* File Info */}
          <Card className="p-4">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                {isEditing ? (
                  <div className="flex gap-2">
                    <Input
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      className="flex-1"
                    />
                    <Button size="sm" onClick={handleRename}>
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{fileName}</h3>
                    <Button size="icon" variant="ghost" onClick={() => setIsEditing(true)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <Badge>{file.document_type || 'Unknown'}</Badge>
                  <Badge variant="outline">{file.modality || 'N/A'}</Badge>
                </div>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Patient:</span> {consult.patient.name} (
                {consult.patient.species})
              </p>
              <p>
                <span className="text-muted-foreground">Uploaded:</span>{' '}
                {new Date(file.created_at).toLocaleString()}
              </p>
            </div>

            <div className="flex gap-2 mt-4">
              <Button size="sm" variant="outline" onClick={handleDownloadPDF}>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRegenerateEvaluation}
                disabled={isRegenerating}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
                Regenerate
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={`/consults/${consult.id}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Consult
                </a>
              </Button>
            </div>
          </Card>

          {/* Image Preview */}
          {imageUrl && (
            <Card className="p-4">
              <h4 className="font-semibold mb-3">Image Preview</h4>
              <img src={imageUrl} alt={fileName} className="w-full rounded-lg" />
            </Card>
          )}

          {/* Evaluation */}
          {analysis && Object.keys(analysis).length > 0 && (
            <Card className="p-4">
              <h4 className="font-semibold mb-3">Evaluation</h4>
              
              {analysis.summary && (
                <div className="mb-4">
                  <h5 className="text-sm font-medium mb-2">Summary</h5>
                  <p className="text-sm text-muted-foreground">{analysis.summary}</p>
                </div>
              )}

              <Separator className="my-4" />

              {analysis.imaging && (
                <div className="space-y-4">
                  {analysis.imaging.findings && analysis.imaging.findings.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium mb-2">Findings</h5>
                      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                        {analysis.imaging.findings.map((finding: string, idx: number) => (
                          <li key={idx}>{finding}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analysis.imaging.impression && analysis.imaging.impression.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium mb-2">Impression</h5>
                      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                        {analysis.imaging.impression.map((imp: string, idx: number) => (
                          <li key={idx}>{imp}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {analysis.labPanel && (
                <div>
                  <h5 className="text-sm font-medium mb-2">Lab Results</h5>
                  {analysis.labPanel.parsed && analysis.labPanel.parsed.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">Analyte</th>
                            <th className="text-left py-2">Value</th>
                            <th className="text-left py-2">Unit</th>
                            <th className="text-left py-2">Flag</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysis.labPanel.parsed.map((item: any, idx: number) => (
                            <tr key={idx} className="border-b">
                              <td className="py-2">{item.analyte}</td>
                              <td className="py-2">{item.value}</td>
                              <td className="py-2">{item.unit}</td>
                              <td className="py-2">
                                {item.flag === 'high' && <Badge variant="destructive">High</Badge>}
                                {item.flag === 'low' && <Badge variant="destructive">Low</Badge>}
                                {item.flag === 'normal' && <Badge variant="outline">Normal</Badge>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <Separator className="my-4" />

              {analysis.differentials && analysis.differentials.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium mb-2">Differential Diagnoses</h5>
                  <ul className="space-y-2">
                    {analysis.differentials.map((diff: any, idx: number) => (
                      <li key={idx} className="text-sm">
                        <span className="font-medium">{diff.dx}</span>
                        {diff.likelihood && (
                          <Badge className="ml-2" variant="outline">
                            {diff.likelihood}
                          </Badge>
                        )}
                        {diff.why && (
                          <p className="text-muted-foreground mt-1">{diff.why}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.recommended_tests && analysis.recommended_tests.length > 0 && (
                <div className="mt-4">
                  <h5 className="text-sm font-medium mb-2">Recommended Tests</h5>
                  <ul className="space-y-2">
                    {analysis.recommended_tests.map((test: any, idx: number) => (
                      <li key={idx} className="text-sm">
                        <span className="font-medium">{test.test}</span>
                        {test.rationale && (
                          <p className="text-muted-foreground mt-1">{test.rationale}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

          {(!analysis || Object.keys(analysis).length === 0) && (
            <Card className="p-8 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No evaluation found. Click "Regenerate" to analyze this file.
              </p>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
