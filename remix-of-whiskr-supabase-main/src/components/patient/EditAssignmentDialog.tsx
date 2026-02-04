import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface EditAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  currentAssignedVetId: string | null;
  onSaved: () => void;
}

interface VetOption {
  userId: string;
  name: string;
}

export function EditAssignmentDialog({
  open,
  onOpenChange,
  patientId,
  currentAssignedVetId,
  onSaved,
}: EditAssignmentDialogProps) {
  const { clinicId } = useAuth();
  const { toast } = useToast();
  const [vets, setVets] = useState<VetOption[]>([]);
  const [selectedVetId, setSelectedVetId] = useState<string>(currentAssignedVetId || "unassigned");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && clinicId) {
      fetchVets();
    }
  }, [open, clinicId]);

  useEffect(() => {
    setSelectedVetId(currentAssignedVetId || "unassigned");
  }, [currentAssignedVetId]);

  const fetchVets = async () => {
    setLoading(true);
    try {
      // Get all users with vet role in this clinic
      const { data: vetRoles, error: rolesError } = await supabase
        .from("clinic_roles")
        .select("user_id")
        .eq("clinic_id", clinicId)
        .eq("role", "vet");

      if (rolesError) throw rolesError;

      if (vetRoles && vetRoles.length > 0) {
        const userIds = vetRoles.map((r) => r.user_id);
        
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, name")
          .in("user_id", userIds);

        if (profilesError) throw profilesError;

        if (profiles) {
          setVets(
            profiles.map((p) => ({
              userId: p.user_id,
              name: p.name,
            }))
          );
        }
      }
    } catch (error) {
      console.error("Error fetching vets:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load veterinarians",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Note: assigned_vet_id column doesn't exist in patients table yet
      // This feature requires a database migration to add the column
      console.log('Assignment update requested for vet:', selectedVetId);
      
      toast({
        title: "Info",
        description: "Vet assignment feature requires database update. Contact admin.",
        variant: "default",
      });
      
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error updating assignment:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update assignment",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Assignment</DialogTitle>
          <DialogDescription>
            Select the veterinarian assigned to this patient
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="assigned-vet">Assigned Veterinarian</Label>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Select value={selectedVetId} onValueChange={setSelectedVetId}>
                <SelectTrigger id="assigned-vet">
                  <SelectValue placeholder="Select a veterinarian" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {vets.map((vet) => (
                    <SelectItem key={vet.userId} value={vet.userId}>
                      Dr. {vet.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
