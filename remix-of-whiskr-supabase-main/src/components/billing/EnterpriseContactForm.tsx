import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Building2 } from "lucide-react";

const enterpriseFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  email: z.string().email("Please enter a valid email").max(255, "Email is too long"),
  phone: z.string().min(10, "Please enter a valid phone number").max(20, "Phone is too long"),
  clinicName: z.string().min(1, "Clinic name is required").max(200, "Clinic name is too long"),
  clinicAddress: z.string().min(1, "Clinic address is required").max(500, "Address is too long"),
  numberOfLocations: z.string().min(1, "Please enter number of locations"),
  additionalNotes: z.string().max(1000, "Notes are too long").optional(),
});

type EnterpriseFormData = z.infer<typeof enterpriseFormSchema>;

interface EnterpriseContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EnterpriseContactForm({ open, onOpenChange }: EnterpriseContactFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<EnterpriseFormData>({
    resolver: zodResolver(enterpriseFormSchema),
  });

  const onSubmit = async (data: EnterpriseFormData) => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("send-enterprise-inquiry", {
        body: data,
      });

      if (error) throw error;

      toast.success("Thank you! Our team will contact you shortly.");
      reset();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to submit inquiry:", error);
      toast.error(error.message || "Failed to submit inquiry. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Enterprise Inquiry</DialogTitle>
              <DialogDescription>Tell us about your clinic and we'll get back to you.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input id="name" placeholder="Dr. Jane Smith" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" placeholder="jane@clinic.com" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <Input id="phone" type="tel" placeholder="(555) 123-4567" {...register("phone")} />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="numberOfLocations">Number of Locations *</Label>
              <Input id="numberOfLocations" type="number" min="1" placeholder="3" {...register("numberOfLocations")} />
              {errors.numberOfLocations && (
                <p className="text-xs text-destructive">{errors.numberOfLocations.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="clinicName">Clinic/Organization Name *</Label>
            <Input id="clinicName" placeholder="ABC Veterinary Group" {...register("clinicName")} />
            {errors.clinicName && <p className="text-xs text-destructive">{errors.clinicName.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="clinicAddress">Primary Clinic Address *</Label>
            <Input id="clinicAddress" placeholder="123 Main St, City, State 12345" {...register("clinicAddress")} />
            {errors.clinicAddress && <p className="text-xs text-destructive">{errors.clinicAddress.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="additionalNotes">Additional Notes (Optional)</Label>
            <Textarea
              id="additionalNotes"
              placeholder="Tell us about your needs or any questions..."
              rows={3}
              {...register("additionalNotes")}
            />
            {errors.additionalNotes && <p className="text-xs text-destructive">{errors.additionalNotes.message}</p>}
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Inquiry"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
