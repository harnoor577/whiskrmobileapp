import { useEffect, useState } from 'react';
import { startOfWeek, differenceInDays } from 'date-fns';
import { getUserTimezone, toLocalTime } from '@/lib/timezone';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useConsultUsage } from '@/hooks/use-consult-usage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Stethoscope, FileText, Clock, TrendingUp, Plus, Activity, Dog, Cat, Bird, Fish, Rabbit, Turtle, Squirrel, PawPrint, LucideIcon, Sun, Moon, Sunset } from 'lucide-react';
import { AtlasEye } from '@/components/ui/AtlasEye';
import { QuickConsultDialog } from '@/components/consult/QuickConsultDialog';
import { UpgradePlanModal } from '@/components/billing/UpgradePlanModal';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import CountUp from 'react-countup';
import { formatDisplayName } from '@/lib/formatDisplayName';
import { getCachedData, setCacheData } from '@/hooks/use-prefetch';
export default function Dashboard() {
  const {
    clinicId,
    user
  } = useAuth();
  const {
    canCreateConsult
  } = usePermissions();
  const {
    hasReachedCap,
    isUnlimited,
    currentTier,
    consultsUsed,
    consultsCap
  } = useConsultUsage();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState({
    totalPatients: 0,
    consultsThisWeek: 0,
    timeSaved: 0,
    completedConsultCount: 0,
    patientsGrowth: 0,
    weeklyConsults: [] as number[],
    timeSavedThisWeek: 0,
    daysElapsedThisWeek: 1
  });
  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [namePrefix, setNamePrefix] = useState<string>('Dr.');
  const [isQuickConsultOpen, setIsQuickConsultOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const minutesSavedPerConsult = 15;
  const handleStartConsultClick = () => {
    if (!isUnlimited && hasReachedCap) {
      setShowUpgradeModal(true);
    } else {
      setIsQuickConsultOpen(true);
    }
  };
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };
  const getTimeBasedEmoji = () => {
    const hour = new Date().getHours();
    if (hour < 12) return '☀️';
    if (hour < 17) return '👋';
    return '🌙';
  };
  const getTimeBasedIcon = (): LucideIcon => {
    const hour = new Date().getHours();
    if (hour < 12) return Sun;
    if (hour < 17) return Sunset;
    return Moon;
  };
  const getDisplayName = (shortened: boolean = false): string => {
    // If we have userName from profile, use it with prefix
    if (userName) {
      return formatDisplayName(userName, namePrefix, shortened);
    }
    // Fallback to user metadata
    const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name || '';
    const names = fullName.trim().split(/\s+/).filter((n: string) => n.length > 0);
    if (names.length === 0) return 'there';
    return names[0];
  };
  useEffect(() => {
    if (!clinicId) {
      setLoading(false);
      return;
    }
    const fetchUserRole = async () => {
      try {
        // Fetch clinic role
        const {
          data: clinicRole
        } = await supabase.from('clinic_roles').select('role').eq('user_id', user?.id).eq('clinic_id', clinicId).single();
        if (clinicRole) {
          setUserRole(clinicRole.role);
        }

        // Fetch profile for name and prefix
        const {
          data: profile
        } = await supabase.from('profiles').select('name, name_prefix').eq('user_id', user?.id).single();
        if (profile) {
          if (profile.name) setUserName(profile.name);
          if ((profile as any).name_prefix) setNamePrefix((profile as any).name_prefix);
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
      }
    };
    const fetchMetrics = async () => {
      // Check cache first for instant display
      const cacheKey = `dashboard-${clinicId}`;
      const cachedData = getCachedData<any>(cacheKey);
      if (cachedData) {
        setMetrics(prev => ({
          ...prev,
          totalPatients: cachedData.totalPatients || 0
        }));
        setRecentPatients(cachedData.recentPatients || []);
        setLoading(false);
      }
      try {
        // Get user's timezone for accurate day grouping
        const userTimezone = getUserTimezone();
        const now = new Date();
        const localNow = toLocalTime(now, userTimezone);

        // Get start of week (Monday) in user's local timezone
        const weekStart = startOfWeek(localNow, {
          weekStartsOn: 1
        });

        // Calculate days elapsed this week (1 = Monday only, 7 = full week)
        const daysElapsed = differenceInDays(localNow, weekStart) + 1;
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        // Single query to get all consults from the start of this week
        const [patientsCountResult, patientsLastWeekResult, patientsThisWeekResult, weeklyConsultsResult, totalConsultsResult, recentPatientsData] = await Promise.all([supabase.from('patients').select('*', {
          count: 'exact',
          head: true
        }).eq('clinic_id', clinicId), supabase.from('patients').select('*', {
          count: 'exact',
          head: true
        }).eq('clinic_id', clinicId).gte('created_at', twoWeeksAgo.toISOString()).lt('created_at', oneWeekAgo.toISOString()), supabase.from('patients').select('*', {
          count: 'exact',
          head: true
        }).eq('clinic_id', clinicId).gte('created_at', oneWeekAgo.toISOString()),
        // Get consults from start of this week (Monday)
        supabase.from('consults').select('created_at').eq('clinic_id', clinicId).gte('created_at', weekStart.toISOString()), supabase.from('consults').select('*', {
          count: 'exact',
          head: true
        }).eq('clinic_id', clinicId), supabase.from('patients').select('id, name, species, breed, created_at').eq('clinic_id', clinicId).order('created_at', {
          ascending: false
        }).limit(5)]);
        const patientsCount = patientsCountResult.count || 0;
        const patientsLastWeek = patientsLastWeekResult.count || 0;
        const patientsThisWeek = patientsThisWeekResult.count || 0;
        const consultsCount = weeklyConsultsResult.data?.length || 0;
        const totalConsults = totalConsultsResult.count || 0;
        const growth = patientsLastWeek ? Math.round((patientsThisWeek - patientsLastWeek) / patientsLastWeek * 100) : 0;

        // Group consults by day in user's local timezone
        const weeklyConsults = Array(7).fill(0);
        (weeklyConsultsResult.data || []).forEach((consult: {
          created_at: string;
        }) => {
          const consultLocalDate = toLocalTime(consult.created_at, userTimezone);
          const daysSinceWeekStart = differenceInDays(consultLocalDate, weekStart);
          if (daysSinceWeekStart >= 0 && daysSinceWeekStart < 7) {
            weeklyConsults[daysSinceWeekStart]++;
          }
        });
        const completedCount = totalConsults;
        const timeSavedMinutes = completedCount * minutesSavedPerConsult;
        const timeSavedHours = (timeSavedMinutes / 60).toFixed(1);
        const timeSavedThisWeekMinutes = consultsCount * minutesSavedPerConsult;
        const timeSavedThisWeekHours = (timeSavedThisWeekMinutes / 60).toFixed(1);

        // Update cache for prefetch
        setCacheData(`dashboard-${clinicId}`, {
          totalPatients: patientsCount,
          recentPatients: recentPatientsData.data || []
        });
        setMetrics({
          totalPatients: patientsCount,
          consultsThisWeek: consultsCount,
          timeSaved: parseFloat(timeSavedHours),
          completedConsultCount: completedCount,
          patientsGrowth: growth,
          weeklyConsults,
          timeSavedThisWeek: parseFloat(timeSavedThisWeekHours),
          daysElapsedThisWeek: daysElapsed
        });
        setRecentPatients(recentPatientsData.data || []);
      } catch (error) {
        console.error('Error fetching metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    // Run both fetches in parallel
    Promise.all([fetchUserRole(), fetchMetrics()]);
  }, [clinicId, user?.id]);
  if (loading) {
    return <DashboardSkeleton />;
  }
  if (!clinicId) {
    return <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <p className="text-muted-foreground">Your account is being set up. Please refresh the page.</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
          Refresh Page
        </button>
      </div>;
  }
  const getSpeciesColor = (species: string) => {
    const s = species?.toLowerCase() || '';
    if (s.includes('dog') || s.includes('canine')) return 'bg-orange-400';
    if (s.includes('cat') || s.includes('feline')) return 'bg-blue-400';
    if (s.includes('bird') || s.includes('avian') || s.includes('parrot')) return 'bg-green-400';
    if (s.includes('fish') || s.includes('aquatic')) return 'bg-cyan-400';
    if (s.includes('rabbit') || s.includes('bunny')) return 'bg-pink-400';
    if (s.includes('turtle') || s.includes('reptile') || s.includes('lizard') || s.includes('snake')) return 'bg-emerald-400';
    if (s.includes('hamster') || s.includes('guinea') || s.includes('ferret')) return 'bg-amber-400';
    return 'bg-purple-400';
  };
  const getSpeciesIcon = (species: string): LucideIcon => {
    const s = species?.toLowerCase() || '';
    if (s.includes('dog') || s.includes('canine')) return Dog;
    if (s.includes('cat') || s.includes('feline')) return Cat;
    if (s.includes('bird') || s.includes('avian') || s.includes('parrot')) return Bird;
    if (s.includes('fish') || s.includes('aquatic')) return Fish;
    if (s.includes('rabbit') || s.includes('bunny')) return Rabbit;
    if (s.includes('turtle') || s.includes('reptile') || s.includes('lizard') || s.includes('snake')) return Turtle;
    if (s.includes('hamster') || s.includes('guinea') || s.includes('ferret')) return Squirrel;
    return PawPrint;
  };
  const improvementPercent = metrics.completedConsultCount > 0 ? Math.round(metrics.timeSaved / Math.max(metrics.completedConsultCount, 1) * 10) : 0;
  const TimeIcon = getTimeBasedIcon();
  return <div className="space-y-4 sm:space-y-5 lg:space-y-6 animate-fade-in pb-8">
      {/* Hero Banner - Glass Card Style */}
      <div className="relative overflow-hidden rounded-2xl bg-card border border-border/50 p-5 sm:p-6 md:p-8 shadow-lg mx-2 sm:mx-0">
        {/* Gradient accent line at top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-primary" />
        
        {/* Atlas Eye - replaces paw cluster */}
        <div className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 opacity-80">
          <AtlasEye size="lg" wander={true} wanderSpeed={3000} glowIntensity="low" />
        </div>

        <div className="relative z-10 space-y-2 md:space-y-3">
          <div className="flex items-center gap-2">
            {/* Mobile: shortened name */}
            <h1 className="text-xl font-bold text-foreground tracking-tight md:hidden">
              {getGreeting()}, {getDisplayName(true)}
            </h1>
            {/* Desktop: full name */}
            <h1 className="hidden md:block text-3xl font-bold text-foreground tracking-tight">
              {getGreeting()}, {getDisplayName(false)}
            </h1>
            <TimeIcon className="h-5 w-5 md:h-7 md:w-7 text-primary" />
          </div>
          <p className="text-muted-foreground text-sm md:text-lg">
            You've helped <span className="font-bold text-primary">{metrics.totalPatients}</span> patients so far — keep making a difference!
          </p>
        </div>
      </div>


      {/* Stats Cards Row - Mobile Only (2 columns) */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:hidden px-2 sm:px-0">
        {/* Total Patients */}
        <Card className="bg-card shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer border" onClick={() => navigate('/patients')}>
          <CardContent className="p-3 sm:p-4 relative">
            <Users className="absolute top-3 right-3 h-5 w-5 text-primary/60" />
            <div className="flex flex-col">
              <div className="text-3xl font-bold text-foreground">
                <CountUp end={metrics.totalPatients} duration={1.5} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Total Patients</p>
            </div>
          </CardContent>
        </Card>

        {/* Consults This Week */}
        <Card className="bg-card shadow-md border">
          <CardContent className="p-3 sm:p-4 relative">
            <Stethoscope className="absolute top-3 right-3 h-5 w-5 text-primary/60" />
            <div className="flex flex-col">
              <div className="text-3xl font-bold text-foreground">
                <CountUp end={metrics.consultsThisWeek} duration={1.5} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Consults This Week</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Action Cards Row - Desktop/Tablet Only */}
      <div className="hidden md:grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Start New Consult */}
        {canCreateConsult && <Card className="bg-whiskr-mint/30 border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer bg-primary" onClick={handleStartConsultClick}>
            <CardContent className="p-5">
              <div className="flex flex-col h-full">
                <div className="h-12 w-12 rounded-xl bg-whiskr-green flex items-center justify-center mb-4 bg-green-300">
                  <Plus className="h-6 w-6 text-whiskr-dark" />
                </div>
                <h3 className="font-bold text-lg text-primary-foreground">Start New Consult</h3>
                <p className="text-sm mt-1 text-primary-foreground">Let's think through this together</p>
              </div>
            </CardContent>
          </Card>}

        {/* New Template */}
        <Card className="bg-card shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer border" onClick={() => navigate('/templates')}>
          <CardContent className="p-5">
            <div className="flex flex-col h-full">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-bold text-lg text-foreground">+ New Template</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-3">Create custom docs</p>
              <Button className="w-full mt-auto bg-primary hover:bg-primary/90 text-white">
                CREATE TEMPLATE
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Total Patients */}
        <Card className="bg-card shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer border" onClick={() => navigate('/patients')}>
          <CardContent className="p-5 relative">
            <Users className="absolute top-5 right-5 h-6 w-6 text-primary/60" />
            <div className="flex flex-col h-full">
              <div className="text-4xl font-bold text-foreground">
                <CountUp end={metrics.totalPatients} duration={1.5} />
              </div>
              <p className="text-sm text-muted-foreground mt-1">Total Patients</p>
              <p className="text-xs text-muted-foreground">(Active)</p>
            </div>
          </CardContent>
        </Card>

        {/* Consults This Week */}
        <Card className="bg-card shadow-md border">
          <CardContent className="p-5 relative">
            <Stethoscope className="absolute top-5 right-5 h-6 w-6 text-primary/60" />
            <div className="flex flex-col h-full">
              <div className="text-4xl font-bold text-foreground">
                <CountUp end={metrics.consultsThisWeek} duration={1.5} />
              </div>
              <p className="text-sm text-muted-foreground mt-1">Consults This Week</p>
              <p className="text-xs text-muted-foreground">(vs last week)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      {canCreateConsult && <QuickConsultDialog open={isQuickConsultOpen} onOpenChange={setIsQuickConsultOpen} />}
      <UpgradePlanModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} reason="consult_limit" consultInfo={{
      used: consultsUsed,
      cap: consultsCap || 0
    }} currentTier={currentTier} />

      {/* Bottom Section - Two Columns */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Weekly Summary */}
        <Card className="shadow-md border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Weekly Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stats Row */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Daily Average</span>
                <span className="font-semibold">
                  {Math.round(metrics.weeklyConsults.slice(0, metrics.daysElapsedThisWeek).reduce((a, b) => a + b, 0) / metrics.daysElapsedThisWeek)} consults
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Peak Day</span>
                <span className="font-semibold">{Math.max(...metrics.weeklyConsults.slice(0, metrics.daysElapsedThisWeek), 0)} consults</span>
              </div>
            </div>

            {/* Chart */}
            {(() => {
            const todayIndex = metrics.daysElapsedThisWeek - 1; // 0-indexed, so Monday = 0 when daysElapsed = 1
            const maxConsults = Math.max(...metrics.weeklyConsults.slice(0, metrics.daysElapsedThisWeek), 1);
            return <>
                  <div className="flex items-end gap-2 h-28">
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => {
                  const isFutureDay = i >= metrics.daysElapsedThisWeek;
                  const barHeight = isFutureDay ? 0 : Math.max(metrics.weeklyConsults[i] / maxConsults * 100, 8);
                  const isToday = i === todayIndex;
                  const hasConsults = !isFutureDay && metrics.weeklyConsults[i] > 0;
                  return <div key={day + i} className={`flex-1 flex flex-col items-center justify-end h-full ${isFutureDay ? 'opacity-30' : ''}`}>
                          {/* Value label - only for past/current days */}
                          {hasConsults && <span className="text-xs font-semibold text-primary mb-1">
                              {metrics.weeklyConsults[i]}
                            </span>}
                          {/* Bar - dashed empty for future days */}
                          {isFutureDay ? <div className="w-full h-4 border-2 border-dashed border-muted-foreground/30 rounded-t-lg" /> : <div className={`w-full bg-primary rounded-t-lg shadow-sm transition-all duration-200 hover:scale-105 hover:opacity-90 cursor-pointer ${isToday ? 'ring-2 ring-primary/40 ring-offset-1' : ''}`} style={{
                      height: `${barHeight}%`
                    }} />}
                        </div>;
                })}
                  </div>
                  {/* Day Labels */}
                  <div className="flex gap-2 mt-1">
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => {
                  const isToday = i === todayIndex;
                  const isFutureDay = i >= metrics.daysElapsedThisWeek;
                  return <span key={day + i} className={`flex-1 text-center text-xs ${isToday ? 'font-bold text-primary' : isFutureDay ? 'text-muted-foreground/40' : 'text-muted-foreground'}`}>
                          {day}
                        </span>;
                })}
                  </div>
                </>;
          })()}

            {/* Time Saved Row */}
            <div className="flex items-center justify-between text-sm border-t pt-3">
              <span className="text-muted-foreground">Time Saved</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{metrics.timeSavedThisWeek}h this week</span>
                {improvementPercent > 0 && <span className="flex items-center text-xs text-success font-medium">
                    <TrendingUp className="h-3 w-3 mr-0.5" />
                    +{improvementPercent}%
                  </span>}
              </div>
            </div>

            {/* Time Saved Callout Box */}
            <div className="bg-primary/10 rounded-xl p-4 flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center">
                <Clock className="h-7 w-7 text-primary" />
              </div>
              <div>
                <div className="text-3xl font-bold text-foreground">
                  <CountUp end={metrics.timeSaved} duration={1.5} decimals={1} />
                  <span className="text-lg ml-1">hrs</span>
                </div>
                <p className="text-sm text-muted-foreground">Time Saved</p>
                {improvementPercent > 0 && <p className="text-xs text-success font-medium">+{improvementPercent}% improvement</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Patients */}
        <Card className="shadow-md border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Recent Patients
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentPatients.length === 0 ? <div className="text-center py-8">
                <p className="text-muted-foreground mb-3">No patients yet</p>
                <Button onClick={() => navigate('/patients/new')} className="bg-primary hover:bg-primary/90">
                  <Users className="mr-2 h-4 w-4" />
                  Add New Patient
                </Button>
              </div> : <div className="space-y-3">
                {recentPatients.map(patient => <div key={patient.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => navigate(`/patients/${patient.id}`)}>
                    <div className="flex items-center gap-3">
                      {/* Species Icon Avatar */}
                      <div className={`h-10 w-10 rounded-full ${getSpeciesColor(patient.species)} flex items-center justify-center`}>
                        {(() => {
                    const SpeciesIcon = getSpeciesIcon(patient.species);
                    return <SpeciesIcon className="h-5 w-5 text-white" />;
                  })()}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{patient.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {patient.breed || patient.species}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 hover:bg-primary/10 font-semibold">
                      VIEW
                    </Button>
                  </div>)}
                <Button variant="outline" className="w-full mt-2 border-primary text-primary hover:bg-primary/10" onClick={() => navigate('/patients')}>
                  VIEW ALL
                </Button>
              </div>}
          </CardContent>
        </Card>
      </div>
    </div>;
}