import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Users, Calendar, Gift, Eye } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getTierByProductId, SUBSCRIPTION_TIERS } from '@/lib/subscriptionTiers';
import { useNavigate } from 'react-router-dom';
import { DuplicatePatientChecker } from '@/components/admin/DuplicatePatientChecker';
import { UserPasswordReset } from '@/components/admin/UserPasswordReset';
import RefundForm from '@/pages/RefundForm';

export default function MasterAdmin() {
  const { userRole, setViewAsClinicId } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedClinic, setSelectedClinic] = useState<string | null>(null);
  const [trialDays, setTrialDays] = useState('30');
  const [trialPlan, setTrialPlan] = useState<'basic' | 'professional'>('basic');
  const [consultsToAdd, setConsultsToAdd] = useState('50');
  const [note, setNote] = useState('');

  // Fetch all clinics with admin emails
  const { data: clinics } = useQuery({
    queryKey: ['all-clinics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clinics')
        .select(`
          *,
          profiles!inner(email, user_id)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      
      // Transform data to include first admin email and profile count
      return data?.map((clinic: any) => ({
        ...clinic,
        adminEmail: clinic.profiles?.[0]?.email || 'N/A',
        profileCount: clinic.profiles?.length || 0,
      }));
    },
    enabled: userRole === 'super_admin',
  });

  // Grant trial mutation
  const grantTrial = useMutation({
    mutationFn: async ({ clinicId, days, plan }: { clinicId: string; days: number; plan: 'basic' | 'professional' }) => {
      const { error } = await supabase.rpc('grant_complimentary_trial', {
        clinic_uuid: clinicId,
        trial_days: days,
        trial_plan: plan,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Complimentary trial granted');
      queryClient.invalidateQueries({ queryKey: ['all-clinics'] });
      setSelectedClinic(null);
      setTrialDays('30');
      setTrialPlan('basic');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to grant trial');
    },
  });

  // Grant consults mutation
  const grantConsults = useMutation({
    mutationFn: async ({ clinicId, consults }: { clinicId: string; consults: number }) => {
      const { error } = await supabase.rpc('add_consults_to_cap', {
        clinic_uuid: clinicId,
        additional_consults: consults,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Consults granted');
      queryClient.invalidateQueries({ queryKey: ['all-clinics'] });
      setSelectedClinic(null);
      setConsultsToAdd('50');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to grant consults');
    },
  });

  // Add note mutation
  const addNote = useMutation({
    mutationFn: async ({ clinicId, noteText }: { clinicId: string; noteText: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const { error } = await supabase
        .from('master_admin_notes')
        .insert([{
          clinic_id: clinicId,
          admin_user_id: user.id,
          note: noteText,
        }]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Note added');
      setNote('');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add note');
    },
  });

  if (userRole !== 'super_admin') {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">Super admin access required</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusBadge = (clinic: any) => {
    if (clinic.subscription_status === 'active') {
      const tier = getTierByProductId(clinic.stripe_subscription_id);
      return <Badge className="bg-green-500">{tier ? SUBSCRIPTION_TIERS[tier].name : 'Active'}</Badge>;
    }
    if (clinic.subscription_status === 'trial') {
      const expired = new Date(clinic.trial_ends_at) < new Date();
      return <Badge variant={expired ? 'destructive' : 'secondary'}>
        {expired ? 'Trial Expired' : 'Trial'}
      </Badge>;
    }
    return <Badge variant="outline">Free</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Master Admin Dashboard</h1>
        <p className="text-muted-foreground">Manage all clinic accounts</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clinics</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clinics?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {clinics?.filter(c => c.subscription_status === 'active').length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trial Accounts</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {clinics?.filter(c => c.subscription_status === 'trial').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Duplicate Patient ID Checker */}
      <DuplicatePatientChecker />

      {/* User Password Reset */}
      <UserPasswordReset />

      {/* Clinics List */}
      <Card>
        <CardHeader>
          <CardTitle>All Clinic Accounts</CardTitle>
          <CardDescription>View and manage all registered clinics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {clinics?.map((clinic) => (
            <div key={clinic.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{clinic.name}</h3>
                    {getStatusBadge(clinic)}
                    {clinic.complimentary_trial_granted && (
                      <Badge variant="outline" className="gap-1">
                        <Gift className="h-3 w-3" />
                        Comp
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {clinic.adminEmail}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Created {format(new Date(clinic.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Set viewing as this clinic and navigate to dashboard
                      setViewAsClinicId(clinic.id);
                      navigate('/dashboard');
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Gift className="h-4 w-4 mr-1" />
                        Grant Trial
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Grant Complimentary Trial</DialogTitle>
                        <DialogDescription>
                          Give {clinic.name} extended trial access
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Trial Plan</Label>
                          <Select value={trialPlan} onValueChange={(value: 'basic' | 'professional') => setTrialPlan(value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select plan" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="basic">Basic Plan Trial</SelectItem>
                              <SelectItem value="professional">Pro Plan Trial</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Trial Duration (days)</Label>
                          <Input
                            type="number"
                            value={trialDays}
                            onChange={(e) => setTrialDays(e.target.value)}
                            min="1"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Admin Note (optional)</Label>
                          <Textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Reason for granting trial..."
                          />
                        </div>
                        <Button
                          onClick={async () => {
                            await grantTrial.mutateAsync({
                              clinicId: clinic.id,
                              days: parseInt(trialDays),
                              plan: trialPlan,
                            });
                            if (note) {
                              await addNote.mutateAsync({
                                clinicId: clinic.id,
                                noteText: note,
                              });
                            }
                          }}
                          disabled={grantTrial.isPending}
                          className="w-full"
                        >
                          Grant {trialPlan === 'basic' ? 'Basic' : 'Pro'} Trial
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline">
                        <Calendar className="h-4 w-4 mr-1" />
                        Grant Consults
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Grant Consults</DialogTitle>
                        <DialogDescription>
                          Add consults to {clinic.name}'s cap for this period
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Number of Consults to Add</Label>
                          <Input
                            type="number"
                            value={consultsToAdd}
                            onChange={(e) => setConsultsToAdd(e.target.value)}
                            min="1"
                            placeholder="50"
                          />
                          <p className="text-sm text-muted-foreground">
                            Current: {clinic.consults_used_this_period || 0} / {clinic.subscription_status === 'trial' ? clinic.trial_consults_cap : clinic.consults_cap}
                          </p>
                        </div>
                        <Button
                          onClick={async () => {
                            await grantConsults.mutateAsync({
                              clinicId: clinic.id,
                              consults: parseInt(consultsToAdd),
                            });
                          }}
                          disabled={grantConsults.isPending}
                          className="w-full"
                        >
                          {grantConsults.isPending ? 'Granting...' : 'Grant Consults'}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="destructive">
                        Issue Refund
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Issue Refund</DialogTitle>
                        <DialogDescription>
                          Refund a recent payment by Payment Intent ID
                        </DialogDescription>
                      </DialogHeader>
                      <RefundForm />
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Users:</span>
                  <span className="ml-2 font-medium">
                    {clinic.profileCount} / {clinic.max_users || 3}
                  </span>
                </div>
                {clinic.trial_ends_at && (
                  <div>
                    <span className="text-muted-foreground">Trial ends:</span>
                    <span className="ml-2 font-medium">
                      {format(new Date(clinic.trial_ends_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
