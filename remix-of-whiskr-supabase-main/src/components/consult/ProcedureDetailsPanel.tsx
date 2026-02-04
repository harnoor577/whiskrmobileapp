import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Edit2, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
interface ProcedureDetailsPanelProps {
  consultId: string;
  procedureName?: string | null;
  procedureIndication?: string | null;
  procedureDateTime?: string | null;
  isFinalized: boolean;
  canEdit: boolean;
}
export function ProcedureDetailsPanel({
  consultId,
  procedureName: initialName,
  procedureIndication: initialIndication,
  procedureDateTime: initialDateTime,
  isFinalized,
  canEdit
}: ProcedureDetailsPanelProps) {
  const {
    toast
  } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [procedureName, setProcedureName] = useState(initialName || "");
  const [procedureIndication, setProcedureIndication] = useState(initialIndication || "");
  const [procedureDate, setProcedureDate] = useState("");
  const [procedureTime, setProcedureTime] = useState("");
  useEffect(() => {
    if (initialDateTime) {
      const dt = new Date(initialDateTime);
      setProcedureDate(format(dt, "yyyy-MM-dd"));
      setProcedureTime(format(dt, "HH:mm"));
    } else {
      // Default to current date/time
      const now = new Date();
      setProcedureDate(format(now, "yyyy-MM-dd"));
      setProcedureTime(format(now, "HH:mm"));
    }
  }, [initialDateTime]);
  const handleSave = async () => {
    try {
      setIsSaving(true);

      // Combine date and time into ISO timestamp
      const dateTimeString = `${procedureDate}T${procedureTime}:00`;
      const procedureDateTimeISO = new Date(dateTimeString).toISOString();
      // Store procedure details in case_notes JSON since procedure-specific columns don't exist
      const caseNotesUpdate = {
        procedure: {
          procedureName: procedureName || null,
          procedureIndication: procedureIndication || null,
          procedureDateTime: procedureDateTimeISO
        }
      };
      
      const { error } = await supabase.from("consults").update({
        case_notes: JSON.stringify(caseNotesUpdate)
      }).eq("id", consultId);
      if (error) throw error;
      toast({
        title: "Saved",
        description: "Procedure details updated successfully"
      });
      setIsEditing(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save procedure details"
      });
    } finally {
      setIsSaving(false);
    }
  };
  const handleCancel = () => {
    setProcedureName(initialName || "");
    setProcedureIndication(initialIndication || "");
    if (initialDateTime) {
      const dt = new Date(initialDateTime);
      setProcedureDate(format(dt, "yyyy-MM-dd"));
      setProcedureTime(format(dt, "HH:mm"));
    }
    setIsEditing(false);
  };
  const formatDisplayDateTime = () => {
    if (!procedureDate) return "Not set";
    try {
      const dt = new Date(`${procedureDate}T${procedureTime || "00:00"}:00`);
      return format(dt, "MMMM d, yyyy 'at' h:mm a");
    } catch {
      return "Invalid date";
    }
  };
  if (!isEditing) {
    return;
  }
  return <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">Edit Procedure Details</h3>
      </div>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="procedureName" className="text-xs">
            Procedure Name
          </Label>
          <Input id="procedureName" value={procedureName} onChange={e => setProcedureName(e.target.value)} placeholder="e.g., Dental cleaning, Spay surgery" className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="procedureIndication" className="text-xs">
            Indication
          </Label>
          <Textarea id="procedureIndication" value={procedureIndication} onChange={e => setProcedureIndication(e.target.value)} placeholder="e.g., Tartar buildup and bad breath" rows={2} className="text-sm resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="procedureDate" className="text-xs">
              Date
            </Label>
            <Input id="procedureDate" type="date" value={procedureDate} onChange={e => setProcedureDate(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="procedureTime" className="text-xs">
              Time
            </Label>
            <Input id="procedureTime" type="time" value={procedureTime} onChange={e => setProcedureTime(e.target.value)} className="h-9 text-sm" />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={isSaving} size="sm" className="flex-1 h-8">
            <Save className="h-3 w-3 mr-1.5" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button onClick={handleCancel} disabled={isSaving} variant="outline" size="sm" className="flex-1 h-8">
            <X className="h-3 w-3 mr-1.5" />
            Cancel
          </Button>
        </div>
      </div>
    </Card>;
}