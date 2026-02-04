import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Copy, Gift, Users } from 'lucide-react';
import { copyToClipboard, isIOS } from '@/utils/clipboard';
import { CopyFallbackDialog } from '@/components/ui/CopyFallbackDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { getCachedData, AccountSettingsCacheData } from '@/hooks/use-prefetch';

export function ReferralCard() {
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState<string>('');
  const [inviterName, setInviterName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ referrals: 0, credits: 0 });
  const isMobile = useIsMobile();
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyDialogText, setCopyDialogText] = useState("");
  const [copyDialogTitle, setCopyDialogTitle] = useState("");

  useEffect(() => {
    if (user) {
      // Check if data was prefetched
      const cached = getCachedData<AccountSettingsCacheData>(`account-settings-${user.id}`);
      if (cached?.profile?.name) {
        const userName = cached.profile.name || user?.user_metadata?.name || 'A colleague';
        setInviterName(userName.trim().replace(/\s+/g, ' '));
        
        // Use cached stats if available
        if (cached.referrals || cached.credits) {
          setStats({
            referrals: cached.referrals?.length || 0,
            credits: cached.credits?.reduce((sum, c) => sum + Number(c.amount), 0) || 0,
          });
        }
      }
      // Always need to fetch referral code as it requires edge function
      loadReferralData();
    }
  }, [user]);

  const loadReferralData = async () => {
    try {
      // Check cache for profile name first
      const cached = getCachedData<AccountSettingsCacheData>(`account-settings-${user?.id}`);
      
      if (!cached?.profile?.name) {
        // Fetch user profile name only if not cached
        const { data: profileData } = await supabase
          .from('profiles')
          .select('name')
          .eq('user_id', user?.id)
          .single();

        const userName = profileData?.name || user?.user_metadata?.name || 'A colleague';
        setInviterName(userName.trim().replace(/\s+/g, ' '));
      }

      // Get or generate referral code (always need this)
      const { data, error } = await supabase.functions.invoke('generate-referral-code');
      
      if (error) throw error;
      setReferralCode(data.code);

      // Only fetch stats if not already set from cache
      if (!cached?.referrals && !cached?.credits) {
        const [referralsResult, creditsResult] = await Promise.all([
          supabase.from('referrals').select('*').eq('referrer_id', user?.id),
          supabase.from('user_credits').select('amount').eq('user_id', user?.id)
        ]);

        setStats({
          referrals: referralsResult.data?.length || 0,
          credits: creditsResult.data?.reduce((sum, c) => sum + Number(c.amount), 0) || 0,
        });
      }
    } catch (error) {
      console.error('Error loading referral data:', error);
    }
  };

  const copyToClipboardHandler = async (text: string, successMessage: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      toast.success(successMessage);
    } else {
      if (isMobile || isIOS()) {
        setCopyDialogText(text);
        setCopyDialogTitle("Copy Referral Link");
        setShowCopyDialog(true);
      } else {
        toast.error('Failed to copy');
      }
    }
  };

  const copyReferralLink = () => {
    const baseUrl = import.meta.env.VITE_REFERRAL_BASE_URL || 'https://whiskr.ai';
    const referralUrl = `${baseUrl}/refer/${referralCode}?name=${encodeURIComponent(inviterName)}`;
    copyToClipboardHandler(referralUrl, 'Production link copied!');
  };

  const copyPreviewLink = () => {
    const referralUrl = `${window.location.origin}/refer/${referralCode}?name=${encodeURIComponent(inviterName)}`;
    copyToClipboardHandler(referralUrl, 'Preview link copied!');
  };

  const shareViaEmail = () => {
    const baseUrl = import.meta.env.VITE_REFERRAL_BASE_URL || 'https://whiskr.ai';
    const referralUrl = `${baseUrl}/refer/${referralCode}?name=${encodeURIComponent(inviterName)}`;
    const subject = encodeURIComponent('Join me on Whiskr - Extended 30-Day Trial!');
    const body = encodeURIComponent(
      `I'm using Whiskr to streamline my veterinary practice and I think you'd love it too!\n\nI've sent you an exclusive 30-day trial:\n${referralUrl}`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="h-5 w-5" />
          Referral Program
        </CardTitle>
        <CardDescription>
          Earn $50 credit for each paying user you refer (Max $2,500 lifetime)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 text-sm text-blue-900 mb-1 font-medium">
              <Users className="h-4 w-4" />
              Referrals
            </div>
            <div className="text-3xl font-bold text-blue-900">{stats.referrals}</div>
          </div>
          <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
            <div className="flex items-center gap-2 text-sm text-green-900 mb-1 font-medium">
              <Gift className="h-4 w-4" />
              Credits Earned
            </div>
            <div className="text-3xl font-bold text-green-900">${stats.credits.toFixed(2)}</div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Your Referral Code</label>
          <div className="flex gap-2">
            <Input
              value={referralCode}
              readOnly
              className="font-mono text-2xl text-center font-bold"
            />
            <Button onClick={copyReferralLink} size="icon" variant="outline">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Button onClick={copyReferralLink} className="flex-1" variant="outline">
              Copy Link
            </Button>
            <Button onClick={shareViaEmail} className="flex-1">
              Share via Email
            </Button>
          </div>
          <Button onClick={copyPreviewLink} className="w-full" variant="ghost" size="sm">
            Copy Preview Link
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          Share your referral code with other veterinary professionals. You'll earn $50 credit (up to $2,500 lifetime) once they become a paying subscriber. Credits can only be used for monthly subscription fees.
        </div>
      </CardContent>

      {/* Copy Fallback Dialog for Mobile */}
      <CopyFallbackDialog
        open={showCopyDialog}
        onOpenChange={setShowCopyDialog}
        title={copyDialogTitle}
        text={copyDialogText}
      />
    </Card>
  );
}