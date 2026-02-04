import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Copy, Gift, Users, DollarSign, TrendingUp, Share2, Mail } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { copyToClipboard, isIOS } from '@/utils/clipboard';
import { CopyFallbackDialog } from '@/components/ui/CopyFallbackDialog';
import { useIsMobile } from '@/hooks/use-mobile';

export default function Affiliate() {
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState<string>('');
  const [inviterName, setInviterName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ 
    referrals: 0, 
    credits: 0, 
    pendingReferrals: 0,
    paidReferrals: 0 
  });
  const [referralHistory, setReferralHistory] = useState<any[]>([]);
  const isMobile = useIsMobile();
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyDialogText, setCopyDialogText] = useState("");
  const [copyDialogTitle, setCopyDialogTitle] = useState("");

  useEffect(() => {
    if (user) {
      loadAffiliateData();
    }
  }, [user]);

  const loadAffiliateData = async () => {
    setLoading(true);
    try {
      // Fetch user profile name
      const { data: profileData } = await supabase
        .from('profiles')
        .select('name')
        .eq('user_id', user?.id)
        .single();

      const userName = profileData?.name || user?.user_metadata?.name || 'A colleague';
      setInviterName(userName.trim().replace(/\s+/g, ' '));

      // Get or generate referral code
      const { data, error } = await supabase.functions.invoke('generate-referral-code');
      
      if (error) throw error;
      setReferralCode(data.code);

      // Get referral stats with user details
      const { data: referrals } = await supabase
        .from('referrals')
        .select(`
          *,
          profiles!inner(email, clinic_id, clinics(name))
        `)
        .eq('referrer_id', user?.id);

      // Get credit totals
      const { data: credits } = await supabase
        .from('user_credits')
        .select('amount')
        .eq('user_id', user?.id);

      const totalReferrals = referrals?.length || 0;
      const paidReferrals = referrals?.filter(r => r.became_paying_at)?.length || 0;
      const pendingReferrals = totalReferrals - paidReferrals;

      setStats({
        referrals: totalReferrals,
        credits: credits?.reduce((sum, c) => sum + Number(c.amount), 0) || 0,
        pendingReferrals,
        paidReferrals
      });

      setReferralHistory(referrals || []);
    } catch (error) {
      console.error('Error loading affiliate data:', error);
      toast.error('Failed to load affiliate data');
    } finally {
      setLoading(false);
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
    copyToClipboardHandler(referralUrl, 'Production referral link copied!');
  };

  const copyPreviewLink = () => {
    const referralUrl = `${window.location.origin}/refer/${referralCode}?name=${encodeURIComponent(inviterName)}`;
    copyToClipboardHandler(referralUrl, 'Preview link copied!');
  };

  const copyCodeOnly = () => {
    copyToClipboardHandler(referralCode, 'Referral code copied to clipboard!');
  };

  const shareViaEmail = () => {
    const baseUrl = import.meta.env.VITE_REFERRAL_BASE_URL || 'https://whiskr.ai';
    const referralUrl = `${baseUrl}/refer/${referralCode}?name=${encodeURIComponent(inviterName)}`;
    const subject = encodeURIComponent('Join me on Whiskr - Extended 14-Day Trial!');
    const body = encodeURIComponent(
      `I'm using Whiskr to streamline my veterinary practice and I think you'd love it too!\n\nI've sent you an exclusive 14-day trial (instead of the standard 7 days) to try it out:\n${referralUrl}\n\nYou'll get access to:\n• AI-powered SOAP notes\n• Voice transcription\n• Smart clinical assistance\n• 50 consults during trial\n\nNo credit card required to start!\n\nBest regards`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Affiliate Program</h1>
        <p className="text-muted-foreground mt-1">
          Earn $50 credit for each paying user you refer (Max $2,500 lifetime credit)
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Credits can only be applied to monthly subscription fees
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-blue-900">
              <Users className="h-4 w-4" />
              Referrals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-blue-900">{stats.referrals}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-900">
              <Gift className="h-4 w-4" />
              Credits Earned
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-green-900">${stats.credits.toFixed(2)}</div>
            <div className="text-xs text-green-700 mt-1">
              Lifetime limit: ${Math.min(stats.credits, 2500).toFixed(2)} / $2,500
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Referral Code Section */}
      <Card>
        <CardHeader>
          <CardTitle>Your Referral Code</CardTitle>
          <CardDescription>
            Share your referral code with other veterinary professionals. You'll earn $50 credit once they become a paying subscriber.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Large Prominent Referral Code Display */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4 p-6 border-2 border-primary/20 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50">
              <div className="flex-1">
                <div className="text-5xl font-bold text-center tracking-wider text-primary font-mono">
                  {referralCode || "--------"}
                </div>
              </div>
              <Button onClick={copyCodeOnly} size="icon" variant="outline" className="h-12 w-12">
                <Copy className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <div className="flex gap-3">
              <Button onClick={copyReferralLink} className="flex-1" variant="default" size="lg">
                Copy Production Link
              </Button>
              <Button onClick={shareViaEmail} className="flex-1" variant="default" size="lg">
                Share via Email
              </Button>
            </div>
            <Button onClick={copyPreviewLink} className="w-full" variant="outline" size="lg">
              Copy Preview Link (Testing)
            </Button>
          </div>

          {/* Info Box */}
          <div className="bg-muted/50 p-4 rounded-lg border">
            <p className="text-sm text-muted-foreground">
              Share your referral code with other veterinary professionals. You'll earn $50 credit once they become a paying subscriber.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Referral History */}
      <Card>
        <CardHeader>
          <CardTitle>Referral History</CardTitle>
          <CardDescription>
            Track all users who signed up using your referral code
          </CardDescription>
        </CardHeader>
        <CardContent>
          {referralHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No referrals yet. Start sharing your code to earn credits!</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Signup Date</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Clinic</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Became Paying</TableHead>
                  <TableHead>Credit Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referralHistory.map((referral: any) => (
                  <TableRow key={referral.id}>
                    <TableCell>{formatDate(referral.signed_up_at)}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {referral.profiles?.email || '-'}
                    </TableCell>
                    <TableCell>
                      {referral.profiles?.clinics?.name || '-'}
                    </TableCell>
                    <TableCell>
                      {referral.became_paying_at ? (
                        <Badge className="bg-green-100 text-green-800">Paying</Badge>
                      ) : (
                        <Badge variant="outline">Free Trial</Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(referral.became_paying_at)}</TableCell>
                    <TableCell>
                      {referral.credit_awarded ? (
                        <Badge className="bg-blue-100 text-blue-800">
                          <DollarSign className="h-3 w-3 mr-1" />
                          $50 Credited
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Copy Fallback Dialog for Mobile */}
      <CopyFallbackDialog
        open={showCopyDialog}
        onOpenChange={setShowCopyDialog}
        title={copyDialogTitle}
        text={copyDialogText}
      />
    </div>
  );
}