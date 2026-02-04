import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RecordVisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  onVisitRecorded?: () => void;
}

export function RecordVisitDialog({ open, onOpenChange, patientId, onVisitRecorded }: RecordVisitDialogProps) {
  const navigate = useNavigate();
  const { clinicId } = useAuth();
  const { isReceptionist, isVetTech } = usePermissions();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('lb');
  
  const [formData, setFormData] = useState({
    presentingComplaint: "",
    weight: "",
    temperature: "",
    heartRate: "",
    respiratoryRate: "",
    bodyConditionScore: "",
    dehydration: "",
    painScore: "",
    crt: "",
    mucousMembranes: "",
    attitude: "",
  });

  // Fetch clinic preferences for weight unit
  useEffect(() => {
    const fetchClinicPreferences = async () => {
      if (!clinicId) return;
      
      const { data: clinic } = await supabase
        .from('clinics')
        .select('data_residency')
        .eq('id', clinicId)
        .single();
      
      if (clinic?.data_residency === 'us') {
        setWeightUnit('lb');
      } else {
        setWeightUnit('kg');
      }
    };

    if (open) {
      fetchClinicPreferences();
    }
  }, [clinicId, open]);

  const getWeightInBothUnits = (weight: string, unit: 'kg' | 'lb') => {
    const weightNum = parseFloat(weight);
    if (isNaN(weightNum)) return { kg: null, lb: null };
    
    if (unit === 'kg') {
      return {
        kg: weightNum,
        lb: weightNum * 2.20462
      };
    } else {
      return {
        kg: weightNum / 2.20462,
        lb: weightNum
      };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.presentingComplaint.trim()) {
      toast({
        title: "Missing presenting complaint",
        description: "Please enter the reason for this visit",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      // Fetch patient data
      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .select("owner_id")
        .eq("id", patientId)
        .eq("clinic_id", clinicId)
        .single();

      if (patientError) throw patientError;

      const weights = formData.weight ? getWeightInBothUnits(formData.weight, weightUnit) : { kg: null, lb: null };

      // Create draft consult with vitals
      const consultData: any = {
        clinic_id: clinicId!,
        owner_id: patient.owner_id,
        patient_id: patientId,
        status: 'draft',
        reason_for_visit: formData.presentingComplaint,
        weight_kg: weights.kg,
        weight_lb: weights.lb,
      };

      // Add vitals if provided
      if (formData.temperature) consultData.vitals_temperature_f = parseFloat(formData.temperature);
      if (formData.heartRate) consultData.vitals_heart_rate = parseInt(formData.heartRate);
      if (formData.respiratoryRate) consultData.vitals_respiratory_rate = parseInt(formData.respiratoryRate);
      if (formData.bodyConditionScore) consultData.vitals_body_condition_score = formData.bodyConditionScore;
      if (formData.dehydration) consultData.vitals_dehydration_percent = formData.dehydration;
      if (formData.painScore) consultData.vitals_pain_score = parseInt(formData.painScore);
      if (formData.crt) consultData.vitals_crt = formData.crt;
      if (formData.mucousMembranes) consultData.vitals_mucous_membranes = formData.mucousMembranes;
      if (formData.attitude) consultData.vitals_attitude = formData.attitude;

      const { error: consultError } = await supabase
        .from('consults')
        .insert(consultData);

      if (consultError) throw consultError;

      toast({
        title: "Success",
        description: "Visit recorded successfully",
      });

      // Reset form and close
      setFormData({
        presentingComplaint: "",
        weight: "",
        temperature: "",
        heartRate: "",
        respiratoryRate: "",
        bodyConditionScore: "",
        dehydration: "",
        painScore: "",
        crt: "",
        mucousMembranes: "",
        attitude: "",
      });
      
      onOpenChange(false);
      
      if (onVisitRecorded) {
        onVisitRecorded();
      }
    } catch (error: any) {
      console.error("Error recording visit:", error);
      toast({
        title: "Error",
        description: "Failed to record visit",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record New Visit</DialogTitle>
          <DialogDescription>
            {isReceptionist 
              ? "Enter the presenting complaint for this visit"
              : "Enter the presenting complaint and vitals for this visit"
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="presentingComplaint">Presenting Complaint *</Label>
            <Textarea
              id="presentingComplaint"
              value={formData.presentingComplaint}
              onChange={(e) => setFormData({ ...formData, presentingComplaint: e.target.value })}
              placeholder="What is the reason for this visit? (e.g., vomiting, limping, routine check-up)"
              rows={3}
              required
            />
          </div>

          {!isReceptionist && (
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold mb-3">Vitals (Optional)</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="weight">Weight</Label>
                <div className="flex gap-2">
                  <Input
                    id="weight"
                    type="number"
                    min="0"
                    step="0.1"
                    value={formData.weight}
                    onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                    placeholder={weightUnit === 'kg' ? 'e.g., 25.5' : 'e.g., 56.2'}
                    className="flex-1"
                  />
                  <Select
                    value={weightUnit}
                    onValueChange={(value: 'kg' | 'lb') => {
                      if (formData.weight) {
                        const currentWeight = parseFloat(formData.weight);
                        if (!isNaN(currentWeight)) {
                          let newWeight: number;
                          if (weightUnit === 'kg' && value === 'lb') {
                            newWeight = currentWeight * 2.20462;
                          } else if (weightUnit === 'lb' && value === 'kg') {
                            newWeight = currentWeight / 2.20462;
                          } else {
                            newWeight = currentWeight;
                          }
                          setFormData({ ...formData, weight: newWeight.toFixed(2) });
                        }
                      }
                      setWeightUnit(value);
                    }}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="lb">lb</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="temperature">Temperature (°F)</Label>
                <Input
                  id="temperature"
                  type="number"
                  step="0.1"
                  value={formData.temperature}
                  onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                  placeholder="e.g., 101.5"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="heartRate">Heart Rate (bpm)</Label>
                <Input
                  id="heartRate"
                  type="number"
                  value={formData.heartRate}
                  onChange={(e) => setFormData({ ...formData, heartRate: e.target.value })}
                  placeholder="e.g., 120"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="respiratoryRate">Respiratory Rate</Label>
                <Input
                  id="respiratoryRate"
                  type="number"
                  value={formData.respiratoryRate}
                  onChange={(e) => setFormData({ ...formData, respiratoryRate: e.target.value })}
                  placeholder="e.g., 30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bodyConditionScore">Body Condition Score (1-9)</Label>
                <Select
                  value={formData.bodyConditionScore}
                  onValueChange={(value) => setFormData({ ...formData, bodyConditionScore: value })}
                >
                  <SelectTrigger id="bodyConditionScore">
                    <SelectValue placeholder="Select score" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((score) => (
                      <SelectItem key={score} value={score.toString()}>
                        {score}/9
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="painScore">Pain Score (0-4)</Label>
                <Select
                  value={formData.painScore}
                  onValueChange={(value) => setFormData({ ...formData, painScore: value })}
                >
                  <SelectTrigger id="painScore">
                    <SelectValue placeholder="Select score" />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2, 3, 4].map((score) => (
                      <SelectItem key={score} value={score.toString()}>
                        {score}/4
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dehydration">Dehydration (%)</Label>
                <Select
                  value={formData.dehydration}
                  onValueChange={(value) => setFormData({ ...formData, dehydration: value })}
                >
                  <SelectTrigger id="dehydration">
                    <SelectValue placeholder="Select percentage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="<5%">&lt;5%</SelectItem>
                    <SelectItem value="5-6%">5-6%</SelectItem>
                    <SelectItem value="6-8%">6-8%</SelectItem>
                    <SelectItem value="8-10%">8-10%</SelectItem>
                    <SelectItem value="10-12%">10-12%</SelectItem>
                    <SelectItem value=">12%">&gt;12%</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="crt">CRT (seconds)</Label>
                <Input
                  id="crt"
                  value={formData.crt}
                  onChange={(e) => setFormData({ ...formData, crt: e.target.value })}
                  placeholder="e.g., <2"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mucousMembranes">Mucous Membranes</Label>
                <Select
                  value={formData.mucousMembranes}
                  onValueChange={(value) => setFormData({ ...formData, mucousMembranes: value })}
                >
                  <SelectTrigger id="mucousMembranes">
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pink and moist">Pink and moist</SelectItem>
                    <SelectItem value="Pale">Pale</SelectItem>
                    <SelectItem value="Tacky">Tacky</SelectItem>
                    <SelectItem value="Injected">Injected</SelectItem>
                    <SelectItem value="Cyanotic">Cyanotic</SelectItem>
                    <SelectItem value="Icteric">Icteric</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="attitude">Attitude</Label>
                <Select
                  value={formData.attitude}
                  onValueChange={(value) => setFormData({ ...formData, attitude: value })}
                >
                  <SelectTrigger id="attitude">
                    <SelectValue placeholder="Select attitude" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bright, Alert, Responsive">Bright, Alert, Responsive</SelectItem>
                    <SelectItem value="Quiet, Alert, Responsive">Quiet, Alert, Responsive</SelectItem>
                    <SelectItem value="Lethargic">Lethargic</SelectItem>
                    <SelectItem value="Depressed">Depressed</SelectItem>
                    <SelectItem value="Obtunded">Obtunded</SelectItem>
                    <SelectItem value="Stuporous">Stuporous</SelectItem>
                    <SelectItem value="Comatose">Comatose</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Recording...
                </>
              ) : (
                "Record Visit"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
