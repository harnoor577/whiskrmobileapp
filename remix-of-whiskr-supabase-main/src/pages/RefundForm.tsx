import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function RefundForm() {
  const [paymentIntent, setPaymentIntent] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<'requested_by_customer' | 'duplicate' | 'fraudulent' | ''>('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!paymentIntent) {
      toast.error('Payment Intent is required');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-refund', {
        body: {
          payment_intent: paymentIntent,
          amount_dollars: amount ? parseFloat(amount) : undefined,
          reason: reason || undefined,
        },
      });
      if (error) throw error;
      toast.success(`Refund ${data?.id || ''} created (status: ${data?.status})`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to create refund');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label>Payment Intent ID</Label>
        <Input value={paymentIntent} onChange={(e) => setPaymentIntent(e.target.value)} placeholder="pi_..." />
      </div>
      <div className="space-y-2">
        <Label>Amount (USD, optional)</Label>
        <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Leave empty for full refund" />
      </div>
      <div className="space-y-2">
        <Label>Reason (optional)</Label>
        <Select value={reason} onValueChange={(v) => setReason(v as any)}>
          <SelectTrigger>
            <SelectValue placeholder="Select a reason" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="requested_by_customer">Requested by customer</SelectItem>
            <SelectItem value="duplicate">Duplicate</SelectItem>
            <SelectItem value="fraudulent">Fraudulent</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button onClick={submit} disabled={loading} className="w-full">
        {loading ? 'Processing...' : 'Issue Refund'}
      </Button>
    </div>
  );
}