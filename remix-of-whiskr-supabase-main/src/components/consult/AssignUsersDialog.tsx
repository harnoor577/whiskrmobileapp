import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Users, Loader2, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
interface AssignUsersDialogProps {
  consultId: string;
  patientName?: string;
  disabled?: boolean;
}
interface UserWithRole {
  user_id: string;
  name: string;
  email: string;
  roles: string[];
  isAssigned: boolean;
}
export function AssignUsersDialog({
  consultId,
  patientName,
  disabled = false
}: AssignUsersDialogProps) {
  const {
    clinicId,
    user
  } = useAuth();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open && clinicId) {
      loadUsers();
    }
  }, [open, clinicId, consultId]);
  const loadUsers = async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      // Get all profiles in the clinic
      const {
        data: profiles,
        error: profilesError
      } = await supabase.from('profiles').select('user_id, name, email').eq('clinic_id', clinicId).eq('status', 'active').order('name');
      if (profilesError) throw profilesError;

      // Get roles for these users
      const userIds = profiles?.map(p => p.user_id) || [];
      const {
        data: roles,
        error: rolesError
      } = await supabase.from('user_roles').select('user_id, role').in('user_id', userIds);
      if (rolesError) throw rolesError;

      // Get current assignments
      const {
        data: assignments,
        error: assignmentsError
      } = await supabase.from('consult_assignments').select('user_id').eq('consult_id', consultId);
      if (assignmentsError) throw assignmentsError;
      const assignedUserIds = new Set(assignments?.map(a => a.user_id) || []);

      // Combine data
      const usersWithRoles: UserWithRole[] = (profiles || []).map(profile => ({
        user_id: profile.user_id,
        name: profile.name,
        email: profile.email,
        roles: roles?.filter(r => r.user_id === profile.user_id).map(r => r.role) || [],
        isAssigned: assignedUserIds.has(profile.user_id)
      }));
      setUsers(usersWithRoles);
      setSelectedUsers(assignedUserIds);
    } catch (error: any) {
      console.error('Error loading users:', error);
      toast.error('Failed to load team members');
    } finally {
      setLoading(false);
    }
  };
  const handleToggleUser = (userId: string) => {
    setSelectedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };
  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const currentlyAssigned = new Set(users.filter(u => u.isAssigned).map(u => u.user_id));
      const toAdd = Array.from(selectedUsers).filter(id => !currentlyAssigned.has(id));
      const toRemove = Array.from(currentlyAssigned).filter(id => !selectedUsers.has(id));

      // Remove assignments
      if (toRemove.length > 0) {
        const {
          error: removeError
        } = await supabase.from('consult_assignments').delete().eq('consult_id', consultId).in('user_id', toRemove);
        if (removeError) throw removeError;
      }

      // Add new assignments
      if (toAdd.length > 0 && clinicId) {
        const {
          error: addError
        } = await supabase.from('consult_assignments').insert(toAdd.map(userId => ({
          consult_id: consultId,
          user_id: userId,
          assigned_by: user.id,
          clinic_id: clinicId
        })));
        if (addError) throw addError;

        // Send notifications to newly assigned users
        for (const userId of toAdd) {
          const assignedUser = users.find(u => u.user_id === userId);
          if (assignedUser) {
            // Add notification via the notification hook
            // This will be handled by the real-time listener
            console.log(`User ${assignedUser.name} assigned to consult ${consultId}`);
          }
        }
      }
      toast.success(toAdd.length > 0 ? `Assigned ${toAdd.length} team member${toAdd.length > 1 ? 's' : ''} to consultation` : 'Assignments updated');
      setOpen(false);
    } catch (error: any) {
      console.error('Error saving assignments:', error);
      toast.error('Failed to update assignments');
    } finally {
      setSaving(false);
    }
  };
  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'vet':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'vet_tech':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'receptionist':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'standard':
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
      case 'super_admin':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'standard':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };
  const formatRole = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Admin';
      case 'standard':
        return 'Standard';
      case 'vet':
        return 'DVM';
      case 'vet_tech':
        return 'Vet Tech';
      case 'receptionist':
        return 'Receptionist';
      case 'super_admin':
        return 'Super Admin';
      case 'standard':
        return 'Front Reception';
      default:
        return 'Staff';
    }
  };
  const assignedCount = users.filter(u => u.isAssigned).length;
  return <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-background border-border">
        <DialogHeader>
          <DialogTitle>Assign Team Members</DialogTitle>
          <DialogDescription>
            {patientName ? `Assign team members to ${patientName}'s consultation` : 'Assign team members to this consultation'}
          </DialogDescription>
        </DialogHeader>

        {loading ? <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div> : <>
            <ScrollArea className="max-h-[400px] pr-4">
              <div className="space-y-3">
                {users.map(userItem => <div key={userItem.user_id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${selectedUsers.has(userItem.user_id) ? 'bg-accent border-primary/50' : 'bg-card border-border hover:bg-accent/50'}`} onClick={() => handleToggleUser(userItem.user_id)}>
                    <Checkbox id={userItem.user_id} checked={selectedUsers.has(userItem.user_id)} onCheckedChange={() => handleToggleUser(userItem.user_id)} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <Label htmlFor={userItem.user_id} className="font-medium cursor-pointer flex items-center gap-2">
                        {userItem.name}
                        {userItem.isAssigned && <UserCheck className="h-3 w-3 text-primary" />}
                      </Label>
                      <p className="text-xs text-muted-foreground truncate">
                        {userItem.email}
                      </p>
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {userItem.roles.map(role => <Badge key={role} variant="outline" className={`text-xs ${getRoleBadgeColor(role)}`}>
                            {formatRole(role)}
                          </Badge>)}
                      </div>
                    </div>
                  </div>)}
                {users.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">
                    No team members found
                  </p>}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </> : 'Save Assignments'}
              </Button>
            </div>
          </>}
      </DialogContent>
    </Dialog>;
}