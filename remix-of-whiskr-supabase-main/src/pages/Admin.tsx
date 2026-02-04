import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Trash2, Crown, Calendar, CreditCard, ShieldCheck, X, Clock } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

export default function Admin() {
  const { clinicId, userRole, user } = useAuth();
  const queryClient = useQueryClient();
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserClinicRole, setNewUserClinicRole] = useState<'vet_tech' | 'receptionist'>('vet_tech');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Fetch clinic info
  const { data: clinic } = useQuery({
    queryKey: ['clinic', clinicId],
    queryFn: async () => {
      if (!clinicId) return null;
      const { data, error } = await supabase
        .from('clinics')
        .select('*')
        .eq('id', clinicId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!clinicId,
  });

  // Fetch users and their roles
  const { data: users } = useQuery({
    queryKey: ['clinic-users', clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      
      // First get all profiles in the clinic
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .eq('clinic_id', clinicId);
      
      if (profilesError) throw profilesError;
      if (!profiles) return [];
      
      // Then get account roles and clinic roles for each user
      const usersWithRoles = await Promise.all(
        profiles.map(async (profile) => {
          const { data: accountRoles } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', profile.user_id);
          
          const { data: clinicRoles } = await supabase
            .from('clinic_roles')
            .select('role')
            .eq('user_id', profile.user_id)
            .eq('clinic_id', clinicId);
          
          return {
            ...profile,
            user_roles: accountRoles || [],
            clinic_roles: clinicRoles || [],
            invitation_status: 'accepted' as const
          };
        })
      );
      
      return usersWithRoles;
    },
    enabled: !!clinicId,
  });

  // Fetch pending invitations
  const { data: pendingInvitations } = useQuery({
    queryKey: ['pending-invitations', clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      
      const { data, error } = await supabase
        .from('user_invitations')
        .select('id, email, clinic_role, role, invited_at, expires_at, invited_by')
        .eq('clinic_id', clinicId)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('invited_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!clinicId,
  });

  // Create user mutation
  const createUser = useMutation({
    mutationFn: async () => {
      if (!clinicId) throw new Error('No clinic ID');
      
      const { data, error } = await supabase.functions.invoke('create-team-user', {
        body: {
          email: newUserEmail,
          role: 'standard', // All invited users are standard users
          clinicRole: newUserClinicRole,
          clinicId: clinicId,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      if (data?.isNewUser) {
        toast.success('Invitation email sent to ' + newUserEmail);
      } else {
        toast.info(data?.message || 'User already exists in this clinic');
      }
      setNewUserEmail('');
      setNewUserClinicRole('vet_tech');
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['clinic-users', clinicId] });
      queryClient.invalidateQueries({ queryKey: ['pending-invitations', clinicId] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create user');
    },
  });

  // Removed: Account roles are fixed - only clinic creator is admin

  // Update clinic role mutation
  const updateClinicRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: 'vet_tech' | 'receptionist' }) => {
      if (!clinicId) throw new Error('No clinic ID');

      // Delete old clinic role and insert new one
      const { error: deleteError } = await supabase
        .from('clinic_roles')
        .delete()
        .eq('user_id', userId)
        .eq('clinic_id', clinicId);
      
      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase
        .from('clinic_roles')
        .insert({ user_id: userId, clinic_id: clinicId, role: newRole });
      
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      toast.success('Clinic role updated successfully');
      queryClient.invalidateQueries({ queryKey: ['clinic-users', clinicId] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update clinic role');
    },
  });

  // Delete user mutation
  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      // Can't delete yourself
      if (userId === user?.id) {
        throw new Error("You cannot delete your own account");
      }

      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('User deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['clinic-users', clinicId] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete user');
    },
  });

  // Revoke invitation mutation
  const revokeInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase
        .from('user_invitations')
        .delete()
        .eq('id', invitationId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Invitation revoked successfully');
      queryClient.invalidateQueries({ queryKey: ['pending-invitations', clinicId] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to revoke invitation');
    },
  });

  if (userRole !== 'admin') {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">Admin access required</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const trialExpired = clinic?.subscription_status === 'trial' && new Date(clinic?.trial_ends_at) < new Date();
  const daysRemaining = clinic?.trial_ends_at ? Math.max(0, Math.ceil((new Date(clinic.trial_ends_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin</h1>
          <p className="text-muted-foreground">Manage clinic settings and users</p>
        </div>
        <Link to="/admin/permissions">
          <Button variant="outline">
            <ShieldCheck className="h-4 w-4 mr-2" />
            View Permissions
          </Button>
        </Link>
      </div>

      {/* Subscription Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Current Plan</p>
              <p className="text-2xl font-bold capitalize">{clinic?.subscription_tier || 'Free'}</p>
            </div>
            {clinic?.subscription_status === 'trial' && (
              <Badge variant={trialExpired ? 'destructive' : 'secondary'} className="text-sm">
                <Calendar className="h-3 w-3 mr-1" />
                {trialExpired ? 'Trial Expired' : `${daysRemaining} days left`}
              </Badge>
            )}
          </div>
          
          {(clinic?.subscription_status === 'trial' || trialExpired) && (
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <p className="text-sm">
                {trialExpired 
                  ? 'Your trial has expired. Upgrade to continue using all features.'
                  : `Your free trial ends on ${format(new Date(clinic.trial_ends_at), 'MMM d, yyyy')}.`}
              </p>
              <Link to="/billing">
                <Button className="w-full">
                  View Plans & Upgrade
                </Button>
              </Link>
            </div>
          )}

          <div className="pt-4 border-t space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Users</span>
              <span className="font-medium">
                {((users?.length || 0) + (pendingInvitations?.length || 0))} / {clinic?.max_users || 3}
              </span>
            </div>
            {((users?.length || 0) + (pendingInvitations?.length || 0)) >= (clinic?.max_users || 3) && (
              <p className="text-xs text-amber-600">
                User limit reached. Upgrade your plan to add more users.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* User Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Create and manage staff accounts for your clinic</CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  disabled={((users?.length || 0) + (pendingInvitations?.length || 0)) >= (clinic?.max_users || 3)}
                  title={
                    ((users?.length || 0) + (pendingInvitations?.length || 0)) >= (clinic?.max_users || 3)
                      ? 'User limit reached. Upgrade to add more users.'
                      : 'Add a new team member'
                  }
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Team Member</DialogTitle>
                  <DialogDescription>
                    Send an invitation email to add a new team member. They'll set their own password.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="user@example.com"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">
                      An invitation email will be sent to this address. Invited users will have standard access (no billing permissions).
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clinicRole">Clinic Role</Label>
                    <Select value={newUserClinicRole} onValueChange={(value: any) => setNewUserClinicRole(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vet_tech">Vet Tech - Full clinical access</SelectItem>
                        <SelectItem value="receptionist">Receptionist - View only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    onClick={() => createUser.mutate()} 
                    disabled={!newUserEmail || createUser.isPending}
                    className="w-full"
                  >
                    {createUser.isPending ? 'Sending...' : 'Send Invitation'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Users */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Active Users</h4>
            {users?.map((userItem) => {
              const currentAccountRole = (userItem.user_roles as any)[0]?.role || 'standard';
              const currentClinicRole = (userItem.clinic_roles as any)[0]?.role || null;
              const isAdmin = currentAccountRole === 'admin';
              const isCurrentUser = userItem.user_id === user?.id;
              
              return (
                <div key={userItem.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{userItem.name}</p>
                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <Crown className="h-4 w-4 text-yellow-500" />
                          <Badge variant="secondary" className="text-xs">Account Owner</Badge>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{userItem.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin ? (
                      <Badge variant="default" className="bg-blue-600">
                        DVM (Account Owner)
                      </Badge>
                    ) : (
                      <Select 
                        value={currentClinicRole || 'none'} 
                        onValueChange={(value: any) => {
                          if (value !== 'none') {
                            updateClinicRole.mutate({ userId: userItem.user_id, newRole: value });
                          }
                        }}
                      >
                        <SelectTrigger className="w-[180px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="vet_tech">Vet Tech</SelectItem>
                          <SelectItem value="receptionist">Receptionist</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {!isCurrentUser && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteUser.mutate(userItem.user_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pending Invitations */}
          {pendingInvitations && pendingInvitations.length > 0 && (
            <div className="space-y-2 pt-4 border-t">
              <h4 className="text-sm font-medium">Pending Invitations</h4>
              {pendingInvitations.map((invitation) => (
                <div key={invitation.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{invitation.email}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Invited {invitation.invited_at ? format(new Date(invitation.invited_at), 'MMM d, yyyy') : 'recently'} • Expires {invitation.expires_at ? format(new Date(invitation.expires_at), 'MMM d, yyyy') : 'soon'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      Pending
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => revokeInvitation.mutate(invitation.id)}
                      title="Revoke invitation"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}