import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FileText, Image, FlaskConical, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { FilePreviewModal } from '@/components/chat/FilePreviewModal';

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

interface DiagnosticsSectionProps {
  diagnostics: FileAsset[];
  embedded?: boolean;
}

export function DiagnosticsSection({ diagnostics, embedded = false }: DiagnosticsSectionProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; type: string } | null>(null);

  useEffect(() => {
    const loadThumbnails = async () => {
      const imageFiles = diagnostics.filter((f) => f.mime_type?.startsWith('image/'));
      const urls: Record<string, string> = {};
      
      for (const file of imageFiles) {
        try {
          const { data } = await supabase.storage
            .from('diagnostic-images')
            .createSignedUrl(file.storage_key, 3600);
          if (data?.signedUrl) {
            urls[file.id] = data.signedUrl;
          }
        } catch (error) {
          console.error('Error loading thumbnail:', error);
        }
      }
      setThumbnails(urls);
    };
    
    if (diagnostics.length > 0) {
      loadThumbnails();
    }
  }, [diagnostics]);

  const handleFileClick = async (file: FileAsset) => {
    try {
      const { data } = await supabase.storage
        .from('diagnostic-images')
        .createSignedUrl(file.storage_key, 3600);
      
      if (data?.signedUrl) {
        const fileName = file.storage_key.split('/').pop() || 'file';
        setPreviewFile({
          url: data.signedUrl,
          name: fileName,
          type: file.mime_type || 'application/octet-stream'
        });
      }
    } catch (error) {
      console.error('Error getting file URL:', error);
    }
  };

  const getFileTypeBadge = (file: FileAsset) => {
    const modality = (file.modality || '').toLowerCase();
    const docType = (file.document_type || '').toLowerCase();
    
    let typeKey = 'pending';
    
    if (modality) {
      typeKey = modality;
    } else if (docType) {
      if (docType.includes('x-ray') || docType.includes('xray') || docType.includes('radiograph')) {
        typeKey = 'xray';
      } else if (docType.includes('ultrasound')) {
        typeKey = 'ultrasound';
      } else if (docType.includes('echo')) {
        typeKey = 'echo';
      } else if (docType.includes('cbc') || docType.includes('blood') || docType.includes('urine') || 
                 docType.includes('chemistry') || docType.includes('thyroid') || docType.includes('lab')) {
        typeKey = 'lab';
      } else if (docType.includes('photo')) {
        typeKey = 'photo';
      } else if (docType !== 'processing...') {
        typeKey = 'text';
      }
    }

    const colors: Record<string, string> = {
      lab: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
      xray: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
      ultrasound: 'bg-green-500/10 text-green-700 dark:text-green-300',
      echo: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
      photo: 'bg-pink-500/10 text-pink-700 dark:text-pink-300',
      text: 'bg-muted text-muted-foreground',
      other: 'bg-muted text-muted-foreground',
      pending: 'bg-muted text-muted-foreground',
    };

    const labels: Record<string, string> = {
      lab: 'Lab',
      xray: 'X-ray',
      ultrasound: 'Ultrasound',
      echo: 'Echo',
      photo: 'Photo',
      text: 'Text',
      other: 'Other',
      pending: 'Unanalyzed',
    };

    return (
      <Badge className={colors[typeKey] || colors.pending} variant="secondary">
        {labels[typeKey] || 'Unanalyzed'}
      </Badge>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileName = (storageKey: string) => {
    const parts = storageKey.split('/');
    return parts[parts.length - 1];
  };

  if (diagnostics.length === 0) {
    return null;
  }

  const content = (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className={`pb-3 cursor-pointer hover:bg-accent/50 transition-colors ${embedded ? 'py-2' : 'p-4 md:p-6'}`}>
          <div className="text-base font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" />
              Diagnostics ({diagnostics.length})
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={embedded ? 'pt-2' : 'px-4 md:px-6 pb-4 md:pb-6'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {diagnostics.map((file) => {
              const isImage = file.mime_type?.startsWith('image/');
              const thumbnailUrl = thumbnails[file.id];
              
              return (
                <button
                  key={file.id}
                  onClick={() => handleFileClick(file)}
                  className="p-3 border rounded-lg hover:bg-accent hover:scale-[1.02] transition-all text-left group relative overflow-hidden"
                >
                  <div className="relative flex items-start gap-3">
                    {isImage && thumbnailUrl ? (
                      <div className="h-12 w-12 rounded border bg-muted shrink-0 overflow-hidden group-hover:scale-110 transition-transform">
                        <img 
                          src={thumbnailUrl} 
                          alt={getFileName(file.storage_key)}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : isImage ? (
                      <Image className="h-6 w-6 text-muted-foreground shrink-0 group-hover:scale-110 transition-transform" />
                    ) : (
                      <FileText className="h-6 w-6 text-muted-foreground shrink-0 group-hover:scale-110 transition-transform" />
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {getFileName(file.storage_key)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {getFileTypeBadge(file)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatFileSize(file.size_bytes)} {formatFileSize(file.size_bytes) && '•'} {new Date(file.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );

  return (
    <>
      {embedded ? content : <Card>{content}</Card>}

      <FilePreviewModal
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
        fileUrl={previewFile?.url || ''}
        fileName={previewFile?.name || ''}
        fileType={previewFile?.type || ''}
      />
    </>
  );
}
