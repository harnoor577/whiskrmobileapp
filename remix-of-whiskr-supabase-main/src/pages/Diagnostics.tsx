import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, FileText, Calendar, Download, Check, Stethoscope } from 'lucide-react';
import { DiagnosticConsultCard } from '@/components/diagnostics/DiagnosticConsultCard';
import { FileDetailDrawer } from '@/components/diagnostics/FileDetailDrawer';
import { FilePreviewModal } from '@/components/chat/FilePreviewModal';
import { usePlanRestrictions } from '@/hooks/use-plan-restrictions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Link } from 'react-router-dom';
import { DiagnosticsSkeleton } from '@/components/diagnostics/DiagnosticsSkeleton';

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

export default function Diagnostics() {
  const { clinicId } = useAuth();
  const { toast } = useToast();
  const { canUploadDiagnostics, isBasicPlan } = usePlanRestrictions();
  const [consults, setConsults] = useState<ConsultWithFiles[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileAsset | null>(null);
  const [selectedConsult, setSelectedConsult] = useState<ConsultWithFiles | null>(null);
  const [previewFile, setPreviewFile] = useState<{
    url: string;
    name: string;
    type: string;
  } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    if (!clinicId) return;
    loadDiagnostics();
  }, [clinicId, typeFilter, dateFrom, dateTo]);

  const loadDiagnostics = async () => {
    setLoading(true);
    try {
      // 1) Get consult IDs that have file_assets (respect clinic + optional file filters)
      let filesBase = supabase
        .from('file_assets')
        .select('consult_id, created_at, modality')
        .eq('clinic_id', clinicId)
        .not('consult_id', 'is', null);

      if (typeFilter && typeFilter !== 'all') {
        filesBase = filesBase.eq('modality', typeFilter);
      }
      if (dateFrom) {
        filesBase = filesBase.gte('created_at', dateFrom);
      }
      if (dateTo) {
        filesBase = filesBase.lte('created_at', dateTo);
      }

      const { data: fileConsults, error: fileConsultsError } = await filesBase;
      if (fileConsultsError) throw fileConsultsError;

      const fileConsultIds = Array.from(
        new Set((fileConsults || []).map((f: any) => f.consult_id).filter(Boolean))
      ) as string[];

      // 1b) Fallback: also look for chat messages with attachments (for legacy uploads without DB rows)
      let msgsQuery = supabase
        .from('chat_messages')
        .select('consult_id, attachments, created_at, user_id')
        .eq('clinic_id', clinicId)
        .not('consult_id', 'is', null)
        .order('created_at', { ascending: false });

      if (dateFrom) msgsQuery = msgsQuery.gte('created_at', dateFrom);
      if (dateTo) msgsQuery = msgsQuery.lte('created_at', dateTo);

      const { data: msgRows, error: msgErr } = await msgsQuery;
      if (msgErr) throw msgErr;

      const msgConsultIds = Array.from(new Set(
        (msgRows || [])
          .filter((m: any) => Array.isArray(m.attachments) && m.attachments.length > 0)
          .map((m: any) => m.consult_id)
          .filter(Boolean)
      )) as string[];

      const uniqueConsultIds = Array.from(new Set([...(fileConsultIds || []), ...(msgConsultIds || [])])) as string[];

      if (uniqueConsultIds.length === 0) {
        setConsults([]);
        setLoading(false);
        return;
      }

      // 2) Fetch ALL consults with those IDs, including patient details, newest first
      const { data: consultRows, error: consultsError } = await supabase
        .from('consults')
        .select('id, started_at, patient:patients(id, name, species)')
        .eq('clinic_id', clinicId)
        .in('id', uniqueConsultIds)
        .order('started_at', { ascending: false });

      if (consultsError) throw consultsError;

      const consultIdsOrdered = (consultRows || []).map((c: any) => c.id);

      // 3) Fetch files for these consults from file_assets (respect filters already applied)
      let filesQuery = supabase
        .from('file_assets')
        .select('*')
        .eq('clinic_id', clinicId)
        .in('consult_id', consultIdsOrdered)
        .order('created_at', { ascending: false });

      if (typeFilter && typeFilter !== 'all') {
        filesQuery = filesQuery.eq('modality', typeFilter);
      }
      if (dateFrom) {
        filesQuery = filesQuery.gte('created_at', dateFrom);
      }
      if (dateTo) {
        filesQuery = filesQuery.lte('created_at', dateTo);
      }

      const { data: files, error: filesError } = await filesQuery;
      if (filesError) throw filesError;

      // 3b) Build fallback files from chat message attachments
      // OPTIMIZED: Skip individual file size fetching - not critical for display
      const fallbackFilesByConsult: Record<string, FileAsset[]> = {};
      
      (msgRows || [])
        .filter((m: any) => Array.isArray(m.attachments) && m.attachments.length > 0)
        .forEach((m: any) => {
          const consultId = m.consult_id as string;
          fallbackFilesByConsult[consultId] = fallbackFilesByConsult[consultId] || [];
          (m.attachments as any[]).forEach((att: any, idx: number) => {
            if (!att?.storagePath) return;
            const mime = att.type || 'application/octet-stream';
            const fileType = mime.startsWith('image/') ? 'image' : mime === 'application/pdf' ? 'pdf' : mime.startsWith('audio/') ? 'audio' : 'other';
            
            // Guess modality from MIME type for fallback files
            let guessedModality: string | null = null;
            if (mime.startsWith('image/')) {
              guessedModality = 'photo';
            } else if (mime === 'application/pdf') {
              guessedModality = 'text';
            } else if (mime.startsWith('audio/')) {
              guessedModality = 'other';
            } else {
              guessedModality = 'text';
            }
            
            const fallback: FileAsset = {
              id: `msg-${m.id || 'unknown'}-${idx}`,
              storage_key: att.storagePath,
              mime_type: mime,
              size_bytes: att.size || 0, // Use size from attachment metadata if available
              type: fileType,
              document_type: null,
              modality: guessedModality,
              analysis_json: null,
              pdf_path: null,
              created_at: m.created_at,
              created_by: m.user_id || null,
              consult_id: consultId,
            };
            fallbackFilesByConsult[consultId].push(fallback);
          });
        });

      // 4) Group files by consult, merging DB files with fallback ones (dedupe by storage_key)
      const grouped: ConsultWithFiles[] = (consultRows || []).map((consult: any) => {
        const dbFiles = (files || []).filter((f: any) => f.consult_id === consult.id);
        const fallback = fallbackFilesByConsult[consult.id] || [];
        const all = [...dbFiles, ...fallback];
        const deduped = all.reduce((acc: FileAsset[], cur: any) => {
          if (!acc.find((x) => x.storage_key === cur.storage_key)) acc.push(cur as FileAsset);
          return acc;
        }, []);

        return {
          id: consult.id,
          started_at: consult.started_at,
          patient: consult.patient,
          files: deduped,
        } as ConsultWithFiles;
      }).filter((c: ConsultWithFiles) => c.files.length > 0);

      setConsults(grouped);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to load diagnostics',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredConsults = consults.filter((consult) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const patientName = consult.patient?.name?.toLowerCase?.() || '';
    return (
      patientName.includes(query) ||
      consult.files.some((f) => (f.storage_key || '').toLowerCase().includes(query))
    );
  });

  const handleFileClick = async (file: FileAsset, consult: ConsultWithFiles) => {
    try {
      // Get signed URL for file preview
      const { data: signedUrlData, error } = await supabase.storage
        .from('diagnostic-images')
        .createSignedUrl(file.storage_key, 3600); // 1 hour expiry

      if (error) throw error;

      if (signedUrlData?.signedUrl) {
        const fileName = file.storage_key.split('/').pop() || 'file';
        setPreviewFile({
          url: signedUrlData.signedUrl,
          name: fileName,
          type: file.mime_type || 'application/octet-stream',
        });
      }
    } catch (error: any) {
      console.error('Error loading file preview:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load file preview',
      });
    }
  };

  const handleAnalyzeAll = async () => {
    setAnalyzing(true);
    try {
      // Get all file_assets that need analysis (no modality or no analysis_json)
      const { data: filesToAnalyze, error: fetchError } = await supabase
        .from('file_assets')
        .select('id, storage_key, mime_type, consult_id, consults!inner(id, patient_id, patients(id, name, species, date_of_birth, sex, breed))')
        .eq('clinic_id', clinicId!)
        .or('modality.is.null,analysis_json.is.null');

      if (fetchError) throw fetchError;

      if (!filesToAnalyze || filesToAnalyze.length === 0) {
        toast({
          title: 'No files to analyze',
          description: 'All files have already been analyzed.',
        });
        setAnalyzing(false);
        return;
      }

      setAnalysisProgress({ current: 0, total: filesToAnalyze.length });

      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < filesToAnalyze.length; i++) {
        const file = filesToAnalyze[i] as any;
        setAnalysisProgress({ current: i + 1, total: filesToAnalyze.length });

        try {
          // Prepare patient context
          const patient = file.consults?.patients;
          const fileName = file.storage_key.split('/').pop() || 'file';

          // Call analyze-document function with correct parameters
          const { error: analyzeError } = await supabase.functions.invoke('analyze-document', {
            body: {
              caseId: file.consult_id,
              patient: patient ? {
                species: patient.species,
                sex: patient.sex,
                date_of_birth: patient.date_of_birth,
                breed: patient.breed,
              } : null,
              file: {
                id: file.id,
                name: fileName,
                mime: file.mime_type,
                storagePath: file.storage_key,
              },
            },
          });

          if (analyzeError) {
            console.error(`Error analyzing file ${file.id}:`, analyzeError);
            failCount++;
          } else {
            successCount++;
          }
        } catch (error) {
          console.error(`Error analyzing file ${file.id}:`, error);
          failCount++;
        }
      }

      toast({
        title: 'Analysis complete',
        description: `Successfully analyzed ${successCount} files. ${failCount > 0 ? `${failCount} failed.` : ''}`,
      });

      // Refresh the diagnostics list
      await loadDiagnostics();
    } catch (error: any) {
      console.error('Error in bulk analysis:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to analyze files',
      });
    } finally {
      setAnalyzing(false);
      setAnalysisProgress({ current: 0, total: 0 });
    }
  };

  if (loading) {
    return <DiagnosticsSkeleton />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Basic Plan Restriction - Show prominently at top */}
      {isBasicPlan && (
        <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground">Upgrade to Professional or Enterprise</h2>
              </div>
              <p className="text-muted-foreground mb-4">
                Diagnostic analysis is available on Professional and Enterprise plans. Upload and analyze X-rays, ultrasounds, and blood work with AI assistance.
              </p>
              <ul className="space-y-2 mb-4 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  <span>AI-powered diagnostic analysis</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  <span>X-ray, ultrasound, and bloodwork interpretation</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  <span>Automatic categorization and storage</span>
                </li>
              </ul>
              <Link to="/billing">
                <Button className="gap-2">
                  <Stethoscope className="h-4 w-4" />
                  View Plans & Upgrade
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Uploaded Diagnostics</h1>
          <p className="text-muted-foreground mt-1">
            View and manage diagnostic files from consultations
          </p>
        </div>
        {canUploadDiagnostics && (
          <Button 
            onClick={handleAnalyzeAll} 
            disabled={analyzing || loading}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            {analyzing ? `Analyzing ${analysisProgress.current}/${analysisProgress.total}...` : 'Analyze All Unanalyzed'}
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by patient or filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="lab">Lab Reports</SelectItem>
              <SelectItem value="xray">X-ray</SelectItem>
              <SelectItem value="ultrasound">Ultrasound</SelectItem>
              <SelectItem value="echo">Echo</SelectItem>
              <SelectItem value="photo">Photo</SelectItem>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="From date"
          />

          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="To date"
          />
        </div>
      </Card>

      {/* Consults List */}
      {loading ? (
        <DiagnosticsSkeleton />
      ) : filteredConsults.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No diagnostics uploaded yet</h3>
          <p className="text-muted-foreground">
            Upload files from any consultation chat to see them here.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredConsults.map((consult) => (
            <DiagnosticConsultCard
              key={consult.id}
              consult={consult}
              onFileClick={(file) => handleFileClick(file, consult)}
              onRefresh={loadDiagnostics}
            />
          ))}
        </div>
      )}

      {/* File Detail Drawer */}
      {selectedFile && selectedConsult && (
        <FileDetailDrawer
          file={selectedFile}
          consult={selectedConsult}
          open={!!selectedFile}
          onClose={() => {
            setSelectedFile(null);
            setSelectedConsult(null);
          }}
          onRefresh={loadDiagnostics}
        />
      )}

      {/* File Preview Modal */}
      <FilePreviewModal
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
        fileUrl={previewFile?.url || ''}
        fileName={previewFile?.name || ''}
        fileType={previewFile?.type || ''}
      />
    </div>
  );
}
