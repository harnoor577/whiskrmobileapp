import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, FileText, Image } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
  created_by: string | null;
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
  files: FileAsset[];
}

interface DiagnosticConsultCardProps {
  consult: ConsultWithFiles;
  onFileClick: (file: FileAsset) => void;
  onRefresh: () => void;
}

export function DiagnosticConsultCard({ consult, onFileClick }: DiagnosticConsultCardProps) {
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  useEffect(() => {
    // Load thumbnails for image files
    const loadThumbnails = async () => {
      const imageFiles = consult.files.filter((f) => f.mime_type?.startsWith('image/'));
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
    
    loadThumbnails();
  }, [consult.files]);

  const getFileTypeBadge = (file: FileAsset) => {
    // Use modality-first, then infer from document_type keywords
    const modality = (file.modality || '').toLowerCase();
    const docType = (file.document_type || '').toLowerCase();
    
    let typeKey = 'pending';
    
    if (modality) {
      typeKey = modality;
    } else if (docType) {
      // Infer from document_type keywords
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
      text: 'bg-gray-500/10 text-gray-700 dark:text-gray-300',
      other: 'bg-gray-500/10 text-gray-700 dark:text-gray-300',
      pending: 'bg-gray-500/10 text-gray-700 dark:text-gray-300',
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
      <Badge className={colors[typeKey] || colors.pending}>
        {labels[typeKey] || 'Unanalyzed'}
      </Badge>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileName = (storageKey: string) => {
    const parts = storageKey.split('/');
    return parts[parts.length - 1];
  };

  return (
    <Card className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-lg font-semibold text-foreground">
              {consult.patient?.name || 'Unknown patient'}
            </h3>
            <Badge variant="outline">{consult.patient?.species || 'Unknown'}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Consultation: {new Date(consult.started_at).toLocaleString()}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/patients/${consult.patient.id}`}>
            <ExternalLink className="h-4 w-4 mr-2" />
            View Patient
          </Link>
        </Button>
      </div>

      {/* Files Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {consult.files.map((file) => {
          const isImage = file.mime_type?.startsWith('image/');
          const thumbnailUrl = thumbnails[file.id];
          
          return (
            <button
              key={file.id}
              onClick={() => onFileClick(file)}
              className="p-4 border rounded-lg hover:bg-accent hover:scale-[1.02] transition-all text-left group relative overflow-hidden"
            >
              
              <div className="relative flex items-start gap-3">
                {isImage && thumbnailUrl ? (
                  <div className="h-16 w-16 rounded border bg-muted shrink-0 overflow-hidden group-hover:scale-110 transition-transform">
                    <img 
                      src={thumbnailUrl} 
                      alt={getFileName(file.storage_key)}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : isImage ? (
                  <Image className="h-8 w-8 text-muted-foreground shrink-0 group-hover:scale-110 transition-transform" />
                ) : (
                  <FileText className="h-8 w-8 text-muted-foreground shrink-0 group-hover:scale-110 transition-transform" />
                )}
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {getFileName(file.storage_key)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {getFileTypeBadge(file)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatFileSize(file.size_bytes)} • {new Date(file.created_at).toLocaleDateString()}
                  </p>
                  <p className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                    Click to preview
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
