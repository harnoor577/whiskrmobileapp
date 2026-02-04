import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Image, File, Upload, Trash2, Download, Plus, Loader2, StickyNote, X, Eye } from "lucide-react";
import { format } from "date-fns";

interface PatientDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  clinicId: string;
}

interface FileAsset {
  id: string;
  type: string;
  mime_type: string | null;
  storage_key: string;
  ocr_text: string | null;
  created_at: string;
  size_bytes: number | null;
  document_type: string | null;
}

export function PatientDocumentsDialog({ 
  open, 
  onOpenChange, 
  patientId, 
  clinicId 
}: PatientDocumentsDialogProps) {
  const [documents, setDocuments] = useState<FileAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<FileAsset | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (open && patientId) {
      fetchDocuments();
    }
  }, [open, patientId]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      // Note: file_assets doesn't have patient_id column - fetch by consult_id instead
      const { data: consults } = await supabase
        .from("consults")
        .select("id")
        .eq("patient_id", patientId);
      
      const consultIds = consults?.map(c => c.id) || [];
      
      if (consultIds.length === 0) {
        setDocuments([]);
        return;
      }
      
      const { data, error } = await supabase
        .from("file_assets")
        .select("*")
        .in("consult_id", consultIds)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Only PDF and image files are allowed");
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setUploading(true);
    try {
      const fileId = crypto.randomUUID();
      const ext = file.name.split('.').pop();
      const storagePath = `${clinicId}/patients/${patientId}/${fileId}.${ext}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("patient-attachments")
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      // Create file_assets record with original filename
      const { error: dbError } = await supabase
        .from("file_assets")
        .insert({
          clinic_id: clinicId,
          patient_id: patientId,
          type: file.type.startsWith('image/') ? 'image' : 'pdf',
          mime_type: file.type,
          storage_key: storagePath,
          size_bytes: file.size,
          document_type: file.name, // Store original filename
        });

      if (dbError) throw dbError;

      toast.success("File uploaded successfully");
      fetchDocuments();
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Failed to upload file");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSaveNote = async () => {
    if (!newNoteText.trim()) {
      toast.error("Please enter some text");
      return;
    }

    setSavingNote(true);
    try {
      const { error } = await supabase
        .from("file_assets")
        .insert({
          clinic_id: clinicId,
          patient_id: patientId,
          type: 'other',
          ocr_text: newNoteText.trim(),
          storage_key: `notes/${patientId}/${Date.now()}`,
        });

      if (error) throw error;

      toast.success("Note saved successfully");
      setNewNoteText("");
      fetchDocuments();
    } catch (error) {
      console.error("Error saving note:", error);
      toast.error("Failed to save note");
    } finally {
      setSavingNote(false);
    }
  };

  const isNote = (doc: FileAsset) => doc.storage_key.startsWith('notes/');

  const getDisplayName = (doc: FileAsset) => {
    if (isNote(doc)) return 'Text Note';
    // Use original filename stored in document_type, or fallback to storage key
    return doc.document_type || doc.storage_key.split('/').pop() || 'Document';
  };

  const handlePreview = async (doc: FileAsset) => {
    if (isNote(doc)) return;
    
    setLoadingPreview(true);
    try {
      const { data, error } = await supabase.storage
        .from("patient-attachments")
        .createSignedUrl(doc.storage_key, 3600); // 1 hour
      
      if (error) throw error;
      
      if (data?.signedUrl) {
        setPreviewUrl(data.signedUrl);
        setPreviewDoc(doc);
      }
    } catch (error) {
      console.error("Error generating preview:", error);
      toast.error("Failed to load preview");
    } finally {
      setLoadingPreview(false);
    }
  };

  const closePreview = () => {
    setPreviewDoc(null);
    setPreviewUrl(null);
  };

  const handleDelete = async (doc: FileAsset) => {
    try {
      // Delete from storage if it's a file (not a note)
      if (!isNote(doc)) {
        await supabase.storage
          .from("patient-attachments")
          .remove([doc.storage_key]);
      }

      // Delete from database
      const { error } = await supabase
        .from("file_assets")
        .delete()
        .eq("id", doc.id);

      if (error) throw error;

      toast.success("Document deleted");
      fetchDocuments();
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Failed to delete document");
    }
  };

  const handleDownload = async (doc: FileAsset) => {
    if (isNote(doc)) {
      // For notes, copy to clipboard
      if (doc.ocr_text) {
        await navigator.clipboard.writeText(doc.ocr_text);
        toast.success("Note copied to clipboard");
      }
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from("patient-attachments")
        .download(doc.storage_key);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.storage_key.split('/').pop() || 'document';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading file:", error);
      toast.error("Failed to download file");
    }
  };

  const getDocumentIcon = (doc: FileAsset) => {
    if (isNote(doc)) return <StickyNote className="h-4 w-4" />;
    if (doc.type === 'image' || doc.mime_type?.startsWith('image/')) return <Image className="h-4 w-4" />;
    if (doc.mime_type === 'application/pdf') return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const getDocumentLabel = (doc: FileAsset) => {
    if (isNote(doc)) return 'Text Note';
    if (doc.mime_type === 'application/pdf') return 'PDF';
    if (doc.mime_type?.startsWith('image/')) return 'Image';
    return 'File';
  };

  const notes = documents.filter(d => isNote(d));
  const files = documents.filter(d => !isNote(d));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Patient Documents</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="files" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="files">
              Files ({files.length})
            </TabsTrigger>
            <TabsTrigger value="notes">
              Notes ({notes.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="files" className="space-y-4">
            {/* Upload section */}
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept=".pdf,image/*"
                onChange={handleFileUpload}
                disabled={uploading}
                className="flex-1"
              />
              {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>

            {/* Files list */}
            <ScrollArea className="h-[300px]">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : files.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No files uploaded yet</p>
                </div>
              ) : (
                <TooltipProvider>
                  <div className="space-y-2">
                    {files.map((doc) => {
                      const displayName = getDisplayName(doc);
                      return (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors group"
                        >
                          <div 
                            className="flex items-center gap-3 flex-1 cursor-pointer min-w-0"
                            onClick={() => handlePreview(doc)}
                          >
                            <div className="p-2 rounded-md bg-primary/10 text-primary flex-shrink-0">
                              {getDocumentIcon(doc)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="text-sm font-medium truncate max-w-[250px]">
                                    {displayName}
                                  </p>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{displayName}</p>
                                </TooltipContent>
                              </Tooltip>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="secondary" className="text-xs">
                                  {getDocumentLabel(doc)}
                                </Badge>
                                <span>{format(new Date(doc.created_at), "MMM d, yyyy")}</span>
                                {doc.size_bytes && (
                                  <span>• {(doc.size_bytes / 1024).toFixed(0)} KB</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePreview(doc)}
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              disabled={loadingPreview}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownload(doc)}
                              className="h-8 w-8"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(doc)}
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TooltipProvider>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="notes" className="space-y-4">
            {/* Add note section */}
            <div className="space-y-2">
              <Textarea
                placeholder="Add a quick note about this patient..."
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                rows={3}
              />
              <Button 
                onClick={handleSaveNote} 
                disabled={savingNote || !newNoteText.trim()}
                size="sm"
              >
                {savingNote ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                Add Note
              </Button>
            </div>

            {/* Notes list */}
            <ScrollArea className="h-[250px]">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : notes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No notes yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {notes.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm whitespace-pre-wrap flex-1">
                          {doc.ocr_text}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(doc)}
                          className="h-7 w-7 text-destructive hover:text-destructive flex-shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {format(new Date(doc.created_at), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Preview Modal */}
        {previewDoc && previewUrl && (
          <Dialog open={!!previewDoc} onOpenChange={closePreview}>
            <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
              <DialogHeader className="p-4 pb-2 border-b">
                <div className="flex items-center justify-between">
                  <DialogTitle className="truncate pr-8">
                    {getDisplayName(previewDoc)}
                  </DialogTitle>
                </div>
              </DialogHeader>
              <div className="flex-1 overflow-auto p-4">
                {previewDoc.mime_type?.startsWith('image/') ? (
                  <img 
                    src={previewUrl} 
                    alt={getDisplayName(previewDoc)} 
                    className="max-w-full max-h-[70vh] mx-auto object-contain rounded-md"
                  />
                ) : (
                  <iframe 
                    src={previewUrl} 
                    className="w-full h-[70vh] rounded-md border"
                    title={getDisplayName(previewDoc)}
                  />
                )}
              </div>
              <div className="p-4 pt-2 border-t flex justify-end gap-2">
                <Button variant="outline" onClick={closePreview}>
                  Close
                </Button>
                <Button onClick={() => handleDownload(previewDoc)}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
