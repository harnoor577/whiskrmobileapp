import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CreditCard, Upload } from "lucide-react";
import { z } from "zod";
import { format } from "date-fns";

const refundSchema = z.object({
  invoice: z.string().min(1, "Invoice or purchase date is required"),
  amount: z.number().positive("Amount must be greater than 0"),
  paymentMethod: z.enum(["card", "ach", "paypal", "other"]),
  plan: z.enum(["monthly", "annual", "addon", "other"]),
  refundType: z.enum(["full", "prorated", "partial"]),
  reason: z.string().min(20, "Reason must be at least 20 characters"),
  consultationId: z.string().optional(),
  preferredResolution: z.enum(["refund", "credit"]),
  acknowledged: z.boolean().refine((val) => val === true, "You must acknowledge the refund policy"),
});

interface RefundRequestDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RefundRequestDialog({ isOpen, onClose }: RefundRequestDialogProps) {
  const { clinicId, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [invoice, setInvoice] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "ach" | "paypal" | "other">("card");
  const [plan, setPlan] = useState<"monthly" | "annual" | "addon" | "other">("monthly");
  const [refundType, setRefundType] = useState<"full" | "prorated" | "partial">("full");
  const [reason, setReason] = useState("");
  const [consultationId, setConsultationId] = useState("");
  const [preferredResolution, setPreferredResolution] = useState<"refund" | "credit">("refund");
  const [acknowledged, setAcknowledged] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadingPaymentHistory, setLoadingPaymentHistory] = useState(false);

  // Fetch payment history on open
  useQuery({
    queryKey: ['payment-history-for-refund', user?.id],
    queryFn: async () => {
      setLoadingPaymentHistory(true);
      try {
        const { data, error } = await supabase.functions.invoke('list-payments');
        if (error) throw error;
        
        const invoices = data?.invoices || [];
        if (invoices.length > 0) {
          const lastPayment = invoices[0];
          
          // Pre-fill form with last payment data
          setInvoice(lastPayment.id || format(new Date(lastPayment.created * 1000), 'yyyy-MM-dd'));
          setAmount((lastPayment.amount_paid / 100).toFixed(2));
          
          // Extract payment method
          if (lastPayment.payment_method) {
            const pmLower = lastPayment.payment_method.toLowerCase();
            if (pmLower.includes('card') || pmLower.includes('visa') || pmLower.includes('mastercard')) {
              setPaymentMethod('card');
            } else if (pmLower.includes('ach')) {
              setPaymentMethod('ach');
            } else if (pmLower.includes('paypal')) {
              setPaymentMethod('paypal');
            }
          }
          
          // Determine plan type
          if (lastPayment.plan_name) {
            const planLower = lastPayment.plan_name.toLowerCase();
            if (planLower.includes('annual') || planLower.includes('year')) {
              setPlan('annual');
            } else if (planLower.includes('month')) {
              setPlan('monthly');
            } else if (planLower.includes('addon') || planLower.includes('add-on')) {
              setPlan('addon');
            }
          }
        }
        
        return invoices;
      } finally {
        setLoadingPaymentHistory(false);
      }
    },
    enabled: isOpen && !!user,
  });

  const validateForm = () => {
    try {
      const parsedAmount = parseFloat(amount) || 0;
      refundSchema.parse({
        invoice,
        amount: parsedAmount,
        paymentMethod,
        plan,
        refundType,
        reason,
        consultationId: consultationId || undefined,
        preferredResolution,
        acknowledged,
      });
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path) {
            newErrors[err.path[0]] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const createRefundRequest = useMutation({
    mutationFn: async () => {
      if (!clinicId || !user) throw new Error('Not authenticated');
      if (!validateForm()) throw new Error('Validation failed');

      const parsedAmount = parseFloat(amount);
      const payload = {
        invoice,
        amount: parsedAmount,
        currency: "USD",
        payment_method: paymentMethod,
        plan,
        refund_type: refundType,
        reason,
        consultation_id: consultationId || null,
        preferred_resolution: preferredResolution,
      };

      // Determine priority based on amount
      const priority = parsedAmount > 500 ? 'high' : 'medium';

      // Create human-readable description
      const description = `
REFUND REQUEST

Invoice/Purchase: ${invoice}
Amount Requested: $${parsedAmount.toFixed(2)} USD
Payment Method: ${paymentMethod}
Plan/Product: ${plan}
Refund Type: ${refundType}
Preferred Resolution: ${preferredResolution === 'refund' ? 'Refund to original payment method' : 'Account credit'}
${consultationId ? `Related Consultation: ${consultationId}` : ''}

REASON:
${reason}
      `.trim();

      const { data: ticket, error: ticketError } = await supabase
        .from('support_tickets')
        .insert({
          clinic_id: clinicId,
          user_id: user.id,
          subject: `Refund Request — ${invoice} — $${parsedAmount.toFixed(2)} USD`,
          description,
          priority,
          category: 'billing_refund',
          tags: ['Refund', 'Billing'],
          payload,
          related_consult_id: consultationId || null,
        })
        .select()
        .single();

      if (ticketError) throw ticketError;

      // Send notification email
      await supabase.functions.invoke('send-support-notification', {
        body: { ticketId: ticket.id },
      });

      return ticket;
    },
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast({
        title: "Refund request submitted",
        description: `Ticket #${ticket.id.substring(0, 8)} created. We'll review your request shortly.`,
      });
      resetForm();
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message === 'Validation failed' 
          ? "Please check all required fields" 
          : "Failed to submit refund request. Please try again.",
        variant: "destructive",
      });
      console.error('Error creating refund request:', error);
    },
  });

  const resetForm = () => {
    setInvoice("");
    setAmount("");
    setPaymentMethod("card");
    setPlan("monthly");
    setRefundType("full");
    setReason("");
    setConsultationId("");
    setPreferredResolution("refund");
    setAcknowledged(false);
    setErrors({});
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Request Refund
          </DialogTitle>
          <DialogDescription>
            Submit a refund request and our billing team will review it according to our refund policy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loadingPaymentHistory && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading payment history...
            </div>
          )}
          
          {/* Invoice/Purchase */}
          <div className="space-y-2">
            <Label htmlFor="invoice">Invoice # or Purchase Date *</Label>
            <Input
              id="invoice"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              placeholder="Invoice # or purchase date"
              className={errors.invoice ? "border-destructive" : ""}
            />
            {errors.invoice && <p className="text-sm text-destructive">{errors.invoice}</p>}
          </div>

          {/* Amount Requested */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount Requested (USD) *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g., 149.00"
              className={errors.amount ? "border-destructive" : ""}
            />
            {errors.amount && <p className="text-sm text-destructive">{errors.amount}</p>}
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label htmlFor="paymentMethod">Payment Method *</Label>
            <Select value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="ach">ACH</SelectItem>
                <SelectItem value="paypal">PayPal</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Plan/Product */}
          <div className="space-y-2">
            <Label htmlFor="plan">Plan / Product *</Label>
            <Select value={plan} onValueChange={(v: any) => setPlan(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="addon">Add-on</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Refund Type */}
          <div className="space-y-2">
            <Label>Refund Type *</Label>
            <RadioGroup value={refundType} onValueChange={(v: any) => setRefundType(v)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="full" id="full" />
                <Label htmlFor="full" className="font-normal">Full</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="prorated" id="prorated" />
                <Label htmlFor="prorated" className="font-normal">Prorated</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="partial" id="partial" />
                <Label htmlFor="partial" className="font-normal">Partial (enter amount above)</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Refund * (minimum 20 characters)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please explain why you're requesting a refund..."
              className={`min-h-[120px] ${errors.reason ? "border-destructive" : ""}`}
            />
            <p className="text-xs text-muted-foreground">{reason.length} / 20 characters minimum</p>
            {errors.reason && <p className="text-sm text-destructive">{errors.reason}</p>}
          </div>

          {/* Related Consultation ID */}
          <div className="space-y-2">
            <Label htmlFor="consultationId">Related Consultation ID (Optional)</Label>
            <Input
              id="consultationId"
              value={consultationId}
              onChange={(e) => setConsultationId(e.target.value)}
              placeholder="If tied to a specific consult"
            />
            <p className="text-xs text-muted-foreground">Leave blank if not applicable</p>
          </div>

          {/* Preferred Resolution */}
          <div className="space-y-2">
            <Label htmlFor="preferredResolution">Preferred Resolution *</Label>
            <Select value={preferredResolution} onValueChange={(v: any) => setPreferredResolution(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="refund">Refund to original payment method</SelectItem>
                <SelectItem value="credit">Account credit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Acknowledgment */}
          <div className="flex items-start space-x-2 pt-2">
            <Checkbox
              id="acknowledged"
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked as boolean)}
              className={errors.acknowledged ? "border-destructive" : ""}
            />
            <div className="space-y-1">
              <label
                htmlFor="acknowledged"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                I understand refunds are subject to our Refund Policy *
              </label>
              {errors.acknowledged && <p className="text-sm text-destructive">{errors.acknowledged}</p>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={createRefundRequest.isPending}>
            Cancel
          </Button>
          <Button 
            onClick={() => createRefundRequest.mutate()} 
            disabled={createRefundRequest.isPending || !acknowledged}
          >
            {createRefundRequest.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}