import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, User, Building2, Lock, Shield } from 'lucide-react';
import { AccountSettingsSkeleton } from '@/components/settings/AccountSettingsSkeleton';
import { z } from 'zod';
import { ReferralCard } from '@/components/referral/ReferralCard';
import { NotificationSettings } from '@/components/notifications/NotificationSettings';
import { BackupCodesDisplay } from '@/components/auth/BackupCodesDisplay';
import { ActiveDevices } from '@/components/settings/ActiveDevices';
import { ExtensionTokensSection } from '@/components/settings/ExtensionTokensSection';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCachedData, setCacheData, AccountSettingsCacheData } from '@/hooks/use-prefetch';

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  email: z.string().trim().email('Invalid email address').max(255, 'Email must be less than 255 characters'),
});

const clinicSchema = z.object({
  clinicName: z.string().trim().min(1, 'Clinic name is required').max(200, 'Clinic name must be less than 200 characters'),
  clinicEmail: z.string().trim().email('Invalid email').max(255).optional().or(z.literal('')),
  clinicPhone: z.string().trim().max(50).optional(),
  clinicAddress: z.string().trim().max(500).optional(),
});

const passwordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(100),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const VET_SCHOOLS = [
  "Auburn University",
  "Colorado State University",
  "Cornell University",
  "Iowa State University",
  "Kansas State University",
  "Louisiana State University",
  "Michigan State University",
  "Mississippi State University",
  "North Carolina State University",
  "Ohio State University",
  "Oklahoma State University",
  "Oregon State University",
  "Purdue University",
  "Texas A&M University",
  "Tufts University",
  "Tuskegee University",
  "University of California, Davis",
  "University of Florida",
  "University of Georgia",
  "University of Illinois",
  "University of Minnesota",
  "University of Missouri",
  "University of Pennsylvania",
  "University of Tennessee",
  "University of Wisconsin-Madison",
  "Virginia-Maryland College",
  "Washington State University",
  "Western University of Health Sciences",
  "University of Guelph",
  "University of Montreal",
  "University of Prince Edward Island",
  "University of Calgary",
  "University of Saskatchewan",
  "Royal Veterinary College (UK)",
  "University of Edinburgh (UK)",
  "University of Glasgow (UK)",
  "Utrecht University (Netherlands)",
  "University of Sydney (Australia)",
  "Massey University (New Zealand)",
  "Other"
];

const PRACTICE_TYPES = [
  { id: 'general', label: 'General Practice' },
  { id: 'emergency', label: 'Emergency' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'relief_locum', label: 'Relief/Locum' }
];

function splitRegion(input: string) {
  const parts = input.split(',').map((p) => p.trim()).filter(Boolean);
  const city = parts[0] || '';
  const country = parts.length >= 2 ? parts[parts.length - 1] : '';
  const state_province = parts.length >= 3 ? parts[parts.length - 2] : '';
  return { city, state_province, country };
}

export default function AccountSettings() {
  const { user, clinicId, userRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Profile data
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [namePrefix, setNamePrefix] = useState('Dr.');
  const [clinicName, setClinicName] = useState('');
  const [clinicEmail, setClinicEmail] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  
  
  // Professional data
  const [userType, setUserType] = useState<'dvm' | 'student' | ''>('');
  const [practiceTypes, setPracticeTypes] = useState<string[]>([]);
  const [regionInput, setRegionInput] = useState('');
  const [schoolName, setSchoolName] = useState('');
  
  // Password change
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Backup codes
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [generatingCodes, setGeneratingCodes] = useState(false);
  
  // Edit modes
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingClinic, setEditingClinic] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  

  const MASTER_ADMIN_EMAIL = 'bbal@growdvm.com';

  useEffect(() => {
    fetchAccountData();
  }, [user, clinicId]);

  const fetchAccountData = async () => {
    if (!user || !clinicId) {
      setLoading(false);
      return;
    }

    // Check cache first for instant display
    const cached = getCachedData<AccountSettingsCacheData>(`account-settings-${user.id}`);
    if (cached) {
      setName(cached.profile?.name || '');
      setEmail(cached.profile?.email || user.email || '');
      setNamePrefix(cached.profile?.name_prefix || 'Dr.');
      setUserType((cached.profile?.user_type as 'dvm' | 'student') || '');
      setPracticeTypes((cached.profile?.practice_types as string[]) || []);
      setSchoolName(cached.profile?.school_name || '');
      
      const region = [cached.profile?.city, cached.profile?.state_province, cached.profile?.country].filter(Boolean).join(', ');
      setRegionInput(region);
      setClinicName(cached.clinic?.name || '');
      setClinicEmail(cached.clinic?.clinic_email || '');
      setClinicPhone(cached.clinic?.phone || '');
      setClinicAddress(cached.clinic?.address || '');
      setLoading(false);
      return;
    }

    try {
      // Parallel fetch profile + clinic for faster loading
      const [profileResult, clinicResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('name, email, user_type, practice_types, city, state_province, country, school_name, unit_preference, name_prefix')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('clinics')
          .select('name, clinic_email, phone, address')
          .eq('id', clinicId)
          .maybeSingle()
      ]);

      if (profileResult.error) throw profileResult.error;
      if (clinicResult.error) throw clinicResult.error;

      const profile = profileResult.data;
      const clinic = clinicResult.data;

      setName(profile?.name || '');
      setEmail(profile?.email || user.email || '');
      setNamePrefix((profile as any)?.name_prefix || 'Dr.');
      setUserType((profile?.user_type as 'dvm' | 'student') || '');
      setPracticeTypes((profile?.practice_types as string[]) || []);
      setSchoolName(profile?.school_name || '');
      
      const region = [profile?.city, profile?.state_province, profile?.country].filter(Boolean).join(', ');
      setRegionInput(region);
      setClinicName(clinic?.name || '');
      setClinicEmail(clinic?.clinic_email || '');
      setClinicPhone(clinic?.phone || '');
      setClinicAddress(clinic?.address || '');

      // Update cache with fetched data
      setCacheData(`account-settings-${user.id}`, {
        profile: profile,
        clinic: clinic,
        devices: [],
        tokens: [],
        referralCode: null,
        referrals: [],
        credits: []
      });
    } catch (error: any) {
      console.error('Error fetching account data:', error);
      toast.error('Failed to load account data');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      const validated = profileSchema.parse({ name, email });
      setSaving(true);

      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          name: validated.name,
          email: validated.email,
          name_prefix: namePrefix === 'None' ? null : namePrefix,
        } as any)
        .eq('user_id', user?.id);

      if (profileError) throw profileError;

      // Update auth email if changed
      if (validated.email !== user?.email) {
        const { error: authError } = await supabase.auth.updateUser({
          email: validated.email,
        });
        if (authError) throw authError;
        toast.success('Profile updated. Check your new email for confirmation.');
      } else {
        toast.success('Profile updated successfully');
      }

      setEditingProfile(false);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        console.error('Error updating profile:', error);
        toast.error('Failed to update profile');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateClinic = async () => {
    try {
      const validated = clinicSchema.parse({ 
        clinicName, 
        clinicEmail,
        clinicPhone,
        clinicAddress 
      });
      setSaving(true);

      const { error } = await supabase
        .from('clinics')
        .update({ 
          name: validated.clinicName,
          clinic_email: validated.clinicEmail || null,
          phone: validated.clinicPhone || null,
          address: validated.clinicAddress || null,
        })
        .eq('id', clinicId);

      if (error) throw error;

      toast.success('Clinic information updated successfully');
      setEditingClinic(false);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        console.error('Error updating clinic:', error);
        toast.error('Failed to update clinic name');
      }
    } finally {
      setSaving(false);
    }
  };

  const togglePracticeType = (id: string) => {
    setPracticeTypes((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleUpdateProfessional = async () => {
    try {
      if (!user) return;
      setSaving(true);
      const { city, state_province, country } = splitRegion(regionInput);
      const update: any = {
        user_type: userType || null,
      };
      if (userType === 'dvm') {
        update.city = city || null;
        update.state_province = state_province || null;
        update.country = country || null;
        update.practice_types = practiceTypes;
        update.school_name = null;
      } else if (userType === 'student') {
        update.city = null;
        update.state_province = null;
        update.country = null;
        update.practice_types = null;
        update.school_name = schoolName || null;
      }

      const { error } = await supabase
        .from('profiles')
        .update(update)
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success('Professional info updated');
      setEditingProfessional(false);
    } catch (error) {
      console.error('Error updating professional info:', error);
      toast.error('Failed to update professional info');
    } finally {
      setSaving(false);
    }
  };


  const handleUpdatePassword = async () => {
    try {
      const validated = passwordSchema.parse({ newPassword, confirmPassword });
      setSaving(true);

      const { error } = await supabase.auth.updateUser({
        password: validated.newPassword,
      });

      if (error) throw error;

      toast.success('Password updated successfully');
      setNewPassword('');
      setConfirmPassword('');
      setEditingPassword(false);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        console.error('Error updating password:', error);
        toast.error('Failed to update password');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateBackupCodes = async () => {
    if (!user || user.email?.toLowerCase() !== MASTER_ADMIN_EMAIL.toLowerCase()) {
      toast.error('Only master admin can generate backup codes');
      return;
    }

    setGeneratingCodes(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-backup-codes', {
        body: {
          email: user.email,
        },
      });

      if (error) throw error;

      if (data?.codes && Array.isArray(data.codes)) {
        setBackupCodes(data.codes);
        setShowBackupCodes(true);
        toast.success('Backup codes generated successfully');
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error: any) {
      console.error('Error generating backup codes:', error);
      toast.error('Failed to generate backup codes');
    } finally {
      setGeneratingCodes(false);
    }
  };

  if (loading) {
    return <AccountSettingsSkeleton />;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Account Settings</h1>
        <p className="text-muted-foreground">Manage your account details and preferences</p>
      </div>

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Information
          </CardTitle>
          <CardDescription>Your personal account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <div className="flex gap-2">
              <Select
                value={namePrefix}
                onValueChange={setNamePrefix}
                disabled={!editingProfile}
              >
                <SelectTrigger className="w-24">
                  <SelectValue placeholder="Prefix" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dr.">Dr.</SelectItem>
                  <SelectItem value="Mr.">Mr.</SelectItem>
                  <SelectItem value="Ms.">Ms.</SelectItem>
                  <SelectItem value="Mrs.">Mrs.</SelectItem>
                  <SelectItem value="None">None</SelectItem>
                </SelectContent>
              </Select>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!editingProfile}
                maxLength={100}
                placeholder="Full Name"
                className="flex-1"
              />
              {editingProfile ? (
                <div className="flex gap-2">
                  <Button onClick={handleUpdateProfile} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setEditingProfile(false);
                    fetchAccountData();
                  }}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button variant="outline" onClick={() => setEditingProfile(true)}>
                  Edit
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Display name: {namePrefix === 'None' ? name : `${namePrefix} ${name}`}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <div className="flex gap-2">
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!editingProfile}
                maxLength={255}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clinic Information - Admin Only */}
      {userRole === 'admin' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Clinic Information
            </CardTitle>
            <CardDescription>Details about your veterinary clinic (Admin only)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clinicName">Clinic Name</Label>
              <Input
                id="clinicName"
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                disabled={!editingClinic}
                maxLength={200}
                placeholder="Your Veterinary Clinic"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clinicEmail">Clinic Email</Label>
              <Input
                id="clinicEmail"
                type="email"
                value={clinicEmail}
                onChange={(e) => setClinicEmail(e.target.value)}
                disabled={!editingClinic}
                maxLength={255}
                placeholder="contact@yourclinic.com"
              />
              <p className="text-xs text-muted-foreground">This email will appear in treatment plan PDFs and emails</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="clinicPhone">Clinic Phone</Label>
              <Input
                id="clinicPhone"
                type="tel"
                value={clinicPhone}
                onChange={(e) => setClinicPhone(e.target.value)}
                disabled={!editingClinic}
                maxLength={50}
                placeholder="(555) 123-4567"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clinicAddress">Clinic Address</Label>
              <Input
                id="clinicAddress"
                value={clinicAddress}
                onChange={(e) => setClinicAddress(e.target.value)}
                disabled={!editingClinic}
                maxLength={500}
                placeholder="123 Main Street, City, State ZIP"
              />
            </div>

            <div className="flex gap-2">
              {editingClinic ? (
                <>
                  <Button onClick={handleUpdateClinic} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setEditingClinic(false);
                    fetchAccountData();
                  }}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setEditingClinic(true)}>
                  Edit Clinic Information
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Professional Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Professional Information
          </CardTitle>
          <CardDescription>Your veterinary professional details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!editingProfessional ? (
            <>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Current Selection</Label>
                <div className="p-4 bg-muted/50 rounded-lg border">
                  <p className="text-base font-medium mb-3">
                    {userType === 'dvm' ? '🩺 Doctor of Veterinary Medicine (DVM)' : 
                     userType === 'student' ? '🎓 Veterinary Student' : 
                     'Not specified'}
                  </p>

                  {userType === 'student' && schoolName && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">School</p>
                      <p className="text-base font-medium">{schoolName}</p>
                    </div>
                  )}

                  {userType === 'dvm' && (
                    <div className="space-y-3">
                      {regionInput && (
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Region</p>
                          <p className="text-base">{regionInput}</p>
                        </div>
                      )}
                      
                      {practiceTypes.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Practice Types</p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {practiceTypes.map(typeId => {
                              const type = PRACTICE_TYPES.find(t => t.id === typeId);
                              return type ? (
                                <span key={typeId} className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                                  {type.label}
                                </span>
                              ) : null;
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <Button 
                variant="outline" 
                onClick={() => setEditingProfessional(true)}
                className="w-full"
              >
                Change Selection
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>I am a *</Label>
                <RadioGroup
                  value={userType}
                  onValueChange={(v: 'dvm' | 'student') => setUserType(v)}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="dvm" id="edit-dvm" />
                    <Label htmlFor="edit-dvm" className="cursor-pointer font-normal">
                      Doctor of Veterinary Medicine (DVM)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="student" id="edit-student" />
                    <Label htmlFor="edit-student" className="cursor-pointer font-normal">
                      Veterinary Student
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {userType === 'student' && (
                <div className="space-y-2 p-4 bg-muted/30 rounded-lg">
                  <Label htmlFor="edit-school">School Name *</Label>
                  <Select value={schoolName} onValueChange={setSchoolName}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select your veterinary school" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {VET_SCHOOLS.map((school) => (
                        <SelectItem key={school} value={school}>
                          {school}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {userType === 'dvm' && (
                <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                  <div className="space-y-2">
                    <Label htmlFor="regionInput">Region of Practice *</Label>
                    <Input
                      id="regionInput"
                      value={regionInput}
                      onChange={(e) => setRegionInput(e.target.value)}
                      placeholder="City, State/Province, Country"
                    />
                    <p className="text-xs text-muted-foreground">
                      e.g., Los Angeles, California, United States
                    </p>
                  </div>

                  <div className="space-y-3">
                    <Label>Type of Practice (Select all that apply) *</Label>
                    <div className="space-y-2">
                      {PRACTICE_TYPES.map((type) => (
                        <div key={type.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`edit-practice-${type.id}`}
                            checked={practiceTypes.includes(type.id)}
                            onCheckedChange={() => togglePracticeType(type.id)}
                          />
                          <Label htmlFor={`edit-practice-${type.id}`} className="cursor-pointer font-normal">
                            {type.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={handleUpdateProfessional} disabled={saving} className="flex-1">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
                </Button>
                <Button variant="outline" onClick={() => {
                  setEditingProfessional(false);
                  fetchAccountData();
                }} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>


      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Change Password
          </CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!editingPassword ? (
            <Button onClick={() => setEditingPassword(true)}>
              Change Password
            </Button>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 8 characters)"
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  maxLength={100}
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleUpdatePassword} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Password'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingPassword(false);
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Master Admin Backup Codes */}
      {user?.email?.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase() && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Master Admin Backup Codes
            </CardTitle>
            <CardDescription>
              Emergency access codes for when you can't receive OTP emails
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Backup codes allow you to log in without email verification. Each code can only be used once.
                Generate new codes if you've used more than 2, or if you suspect they've been compromised.
              </p>
            </div>
            <Button 
              onClick={handleGenerateBackupCodes} 
              disabled={generatingCodes}
              variant="outline"
            >
              {generatingCodes ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate New Backup Codes'
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* API Tokens for Extensions */}
      <ExtensionTokensSection />

      {/* Notification Settings */}
      <NotificationSettings />

      {/* Active Devices */}
      <ActiveDevices />

      {/* Login History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Login History
          </CardTitle>
          <CardDescription>
            View your recent login attempts and device information for security monitoring
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <a href="/login-history">View Login History</a>
          </Button>
        </CardContent>
      </Card>

      {/* Referral Program */}
      <ReferralCard />

      {/* Backup Codes Dialog */}
      <Dialog open={showBackupCodes} onOpenChange={setShowBackupCodes}>
        <DialogContent className="max-w-2xl">
          <BackupCodesDisplay 
            codes={backupCodes} 
            onClose={() => setShowBackupCodes(false)} 
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
