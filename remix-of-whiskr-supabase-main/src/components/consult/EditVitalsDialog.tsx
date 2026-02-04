import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface EditVitalsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consultId: string;
  clinicId: string;
  currentVitals: {
    weight_kg?: number | null;
    weight_lb?: number | null;
    vitals_temperature_f?: number | null;
    vitals_heart_rate?: number | null;
    vitals_respiratory_rate?: number | null;
    vitals_body_condition_score?: string | null;
    vitals_dehydration_percent?: string | null;
    vitals_pain_score?: number | null;
    vitals_crt?: string | null;
    vitals_mucous_membranes?: string | null;
    vitals_attitude?: string | null;
  };
  onVitalsUpdated?: () => void;
}

export function EditVitalsDialog({ 
  open, 
  onOpenChange, 
  consultId, 
  clinicId,
  currentVitals,
  onVitalsUpdated 
}: EditVitalsDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [formData, setFormData] = useState({
    weight: '',
    temperature: '',
    heartRate: '',
    respiratoryRate: '',
    bodyConditionScore: '',
    dehydration: '',
    painScore: '',
    crt: '',
    mucousMembranes: '',
    attitude: '',
  });

  // Fetch clinic preference for weight unit
  useEffect(() => {
    const fetchClinicPreference = async () => {
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
      fetchClinicPreference();
    }
  }, [open, clinicId]);

  // Pre-populate form with current vitals
  useEffect(() => {
    if (open && currentVitals) {
      setFormData({
        weight: weightUnit === 'kg' 
          ? (currentVitals.weight_kg?.toString() || '')
          : (currentVitals.weight_lb?.toString() || ''),
        temperature: currentVitals.vitals_temperature_f?.toString() || '',
        heartRate: currentVitals.vitals_heart_rate?.toString() || '',
        respiratoryRate: currentVitals.vitals_respiratory_rate?.toString() || '',
        bodyConditionScore: currentVitals.vitals_body_condition_score || '',
        dehydration: currentVitals.vitals_dehydration_percent || '',
        painScore: currentVitals.vitals_pain_score?.toString() || '',
        crt: currentVitals.vitals_crt || '',
        mucousMembranes: currentVitals.vitals_mucous_membranes || '',
        attitude: currentVitals.vitals_attitude || '',
      });
    }
  }, [open, currentVitals, weightUnit]);

  const getWeightInBothUnits = (value: string, unit: 'kg' | 'lb') => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return { kg: null, lb: null };
    
    if (unit === 'kg') {
      return {
        kg: numValue,
        lb: Math.round(numValue * 2.20462 * 100) / 100
      };
    } else {
      return {
        kg: Math.round((numValue / 2.20462) * 100) / 100,
        lb: numValue
      };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Prepare update data
      const updateData: any = {};

      // Handle weight conversion
      if (formData.weight) {
        const weights = getWeightInBothUnits(formData.weight, weightUnit);
        updateData.weight_kg = Number(weights.kg);
        updateData.weight_lb = Number(weights.lb);
      }

      // Handle temperature conversion
      if (formData.temperature) {
        const tempF = parseFloat(formData.temperature);
        updateData.vitals_temperature_f = tempF;
        updateData.vitals_temperature_c = Number(((tempF - 32) * 5 / 9).toFixed(2));
      }

      // Add vitals if provided (use consistent vitals_* columns)
      if (formData.heartRate) updateData.vitals_heart_rate = parseInt(formData.heartRate);
      if (formData.respiratoryRate) updateData.vitals_respiratory_rate = parseInt(formData.respiratoryRate);
      if (formData.bodyConditionScore) updateData.vitals_body_condition_score = formData.bodyConditionScore;
      if (formData.dehydration) updateData.vitals_dehydration_percent = formData.dehydration;
      if (formData.painScore) updateData.vitals_pain_score = parseInt(formData.painScore);
      if (formData.crt) updateData.vitals_crt = formData.crt;
      if (formData.mucousMembranes) updateData.vitals_mucous_membranes = formData.mucousMembranes;
      if (formData.attitude) updateData.vitals_attitude = formData.attitude;

      // Update consult with new vitals
      const { error } = await supabase
        .from('consults')
        .update(updateData)
        .eq('id', consultId);

      if (error) throw error;

      toast({
        title: "Vitals Updated",
        description: "Patient vitals have been successfully updated.",
      });

      onOpenChange(false);
      if (onVitalsUpdated) {
        onVitalsUpdated();
      }
    } catch (error: any) {
      console.error('Error updating vitals:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update vitals",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Vitals</DialogTitle>
          <DialogDescription>
            Update patient vitals for this consultation
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Weight */}
            <div className="space-y-2">
              <Label htmlFor="weight">
                Weight ({weightUnit})
              </Label>
              <div className="flex gap-2">
                <Input
                  id="weight"
                  type="number"
                  step="0.01"
                  value={formData.weight}
                  onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
                  placeholder={`Enter weight in ${weightUnit}`}
                />
                <Select
                  value={weightUnit}
                  onValueChange={(value: 'kg' | 'lb') => {
                    if (formData.weight) {
                      const weights = getWeightInBothUnits(formData.weight, weightUnit);
                      const newWeight = value === 'kg' ? weights.kg : weights.lb;
                      setFormData(prev => ({ ...prev, weight: newWeight?.toString() || '' }));
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

            {/* Temperature */}
            <div className="space-y-2">
              <Label htmlFor="temperature">Temperature (°F)</Label>
              <Input
                id="temperature"
                type="number"
                step="0.1"
                value={formData.temperature}
                onChange={(e) => setFormData(prev => ({ ...prev, temperature: e.target.value }))}
                placeholder="e.g., 101.5"
              />
            </div>

            {/* Heart Rate */}
            <div className="space-y-2">
              <Label htmlFor="heartRate">Heart Rate (bpm)</Label>
              <Input
                id="heartRate"
                type="number"
                value={formData.heartRate}
                onChange={(e) => setFormData(prev => ({ ...prev, heartRate: e.target.value }))}
                placeholder="e.g., 120"
              />
            </div>

            {/* Respiratory Rate */}
            <div className="space-y-2">
              <Label htmlFor="respiratoryRate">Respiratory Rate (bpm)</Label>
              <Input
                id="respiratoryRate"
                type="number"
                value={formData.respiratoryRate}
                onChange={(e) => setFormData(prev => ({ ...prev, respiratoryRate: e.target.value }))}
                placeholder="e.g., 30"
              />
            </div>

            {/* Body Condition Score */}
            <div className="space-y-2">
              <Label htmlFor="bodyConditionScore">Body Condition Score (1-9)</Label>
              <Select
                value={formData.bodyConditionScore}
                onValueChange={(value) => setFormData(prev => ({ ...prev, bodyConditionScore: value }))}
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

            {/* Dehydration */}
            <div className="space-y-2">
              <Label htmlFor="dehydration">Dehydration (%)</Label>
              <Select
                value={formData.dehydration}
                onValueChange={(value) => setFormData(prev => ({ ...prev, dehydration: value }))}
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

            {/* Pain Score */}
            <div className="space-y-2">
              <Label htmlFor="painScore">Pain Score (0-4)</Label>
              <Select
                value={formData.painScore}
                onValueChange={(value) => setFormData(prev => ({ ...prev, painScore: value }))}
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

            {/* CRT */}
            <div className="space-y-2">
              <Label htmlFor="crt">CRT (seconds)</Label>
              <Input
                id="crt"
                type="text"
                value={formData.crt}
                onChange={(e) => setFormData(prev => ({ ...prev, crt: e.target.value }))}
                placeholder="e.g., <2"
              />
            </div>

            {/* Mucous Membranes */}
            <div className="space-y-2">
              <Label htmlFor="mucousMembranes">Mucous Membranes</Label>
              <Select
                value={formData.mucousMembranes}
                onValueChange={(value) => setFormData(prev => ({ ...prev, mucousMembranes: value }))}
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

            {/* Attitude */}
            <div className="space-y-2">
              <Label htmlFor="attitude">Attitude</Label>
              <Select
                value={formData.attitude}
                onValueChange={(value) => setFormData(prev => ({ ...prev, attitude: value }))}
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

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Vitals
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
