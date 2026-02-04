import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Outlet, useNavigate, useLocation, NavLink, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { LogOut, User, Building2, ChevronDown, Check, Crown, UserCog, Stethoscope, UserPlus, UserCircle, LayoutDashboard, Dog, Calendar, Activity, MessageSquare, Menu, X } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import growdvmLogo from "@/assets/growdvm-logo.png";
import { useNotifications } from "@/hooks/use-notifications";
import { useDiagnosticNotifications } from "@/hooks/use-diagnostic-notifications";
import { useConsultLimitNotifications } from "@/hooks/use-consult-limit-notifications";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { MinimizableChat } from "@/components/chat/MinimizableChat";
import { MasterAdminBanner } from "./MasterAdminBanner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTrialStatus } from "@/hooks/use-trial-status";
import UpgradeRequired from "@/pages/UpgradeRequired";
import TrialExpired from "@/pages/TrialExpired";
import PaymentOverdue from "@/pages/PaymentOverdue";
import { toast } from "sonner";
import { usePrefetch } from "@/hooks/use-prefetch";

// Clinical navigation items for top bar
const clinicalNavItems = [{
  title: "Dashboard",
  url: "/dashboard",
  icon: LayoutDashboard
}, {
  title: "Patients",
  url: "/patients",
  icon: Dog
}, {
  title: "Tasks",
  url: "/tasks",
  icon: Calendar
}, {
  title: "Diagnostics",
  url: "/diagnostics",
  icon: Activity
}, {
  title: "Messages",
  url: "/messages",
  icon: MessageSquare
}];

// Desktop navigation with sliding indicator
function DesktopNavigation({
  messagesUnread,
  onPrefetch
}: {
  messagesUnread: number;
  onPrefetch: (url: string) => void;
}) {
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({
    left: 0,
    width: 0,
    opacity: 0
  });

  // Single source of truth for active tab
  const activeIndex = useMemo(() => {
    return clinicalNavItems.findIndex(item => item.url === "/dashboard" ? location.pathname === "/dashboard" : location.pathname.startsWith(item.url));
  }, [location.pathname]);
  useEffect(() => {
    if (activeIndex >= 0 && itemRefs.current[activeIndex] && navRef.current) {
      const el = itemRefs.current[activeIndex];
      const navRect = navRef.current.getBoundingClientRect();
      const elRect = el!.getBoundingClientRect();
      setIndicatorStyle({
        left: elRect.left - navRect.left,
        width: elRect.width,
        opacity: 1
      });
    } else {
      setIndicatorStyle(prev => ({
        ...prev,
        opacity: 0
      }));
    }
  }, [activeIndex]);
  return <nav ref={navRef} className="hidden lg:flex items-center gap-1 ml-4 relative">
      {/* Sliding teal indicator */}
      <div className="absolute bg-primary rounded-lg h-9 transition-all duration-300 ease-out shadow-sm" style={{
      left: indicatorStyle.left,
      width: indicatorStyle.width,
      opacity: indicatorStyle.opacity,
      top: "50%",
      transform: "translateY(-50%)"
    }} />

      {clinicalNavItems.map((item, index) => <Link key={item.url} ref={el => {
      itemRefs.current[index] = el;
    }} to={item.url} onMouseEnter={() => onPrefetch(item.url)} onTouchStart={() => onPrefetch(item.url)} className={`relative z-10 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${index === activeIndex ? "text-white" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}>
          <item.icon className="h-4 w-4" />
          <span>{item.title}</span>
          {item.title === "Messages" && messagesUnread > 0 && <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
              {messagesUnread > 9 ? "9+" : messagesUnread}
            </span>}
        </Link>)}
    </nav>;
}
function DashboardContent() {
  const isMobile = useIsMobile();
  const {
    user,
    signOut,
    clinicId,
    selectClinic
  } = useAuth();
  const {
    accountRole,
    clinicRole
  } = usePermissions();
  const navigate = useNavigate();
  const {
    prefetchPatients,
    prefetchDashboard
  } = usePrefetch(clinicId);

  // Prefetch handler for navigation
  const handlePrefetch = useCallback((url: string) => {
    if (url === '/patients') {
      prefetchPatients();
    } else if (url === '/dashboard') {
      prefetchDashboard();
    }
  }, [prefetchPatients, prefetchDashboard]);

  // Determine account icon based on role hierarchy
  const getAccountIcon = () => {
    // Account-level roles take precedence
    if (accountRole === "super_admin") return Crown;
    if (accountRole === "admin") return UserCog;

    // Clinic-level roles
    if (clinicRole === "vet") return Stethoscope;
    if (clinicRole === "vet_tech") return UserPlus;
    if (clinicRole === "receptionist") return UserCircle;

    // Default
    return User;
  };
  const AccountIcon = getAccountIcon();
  const location = useLocation();
  const {
    open
  } = useSidebar();
  const {
    unreadCount
  } = useNotifications();
  useDiagnosticNotifications(); // Initialize diagnostic monitoring
  useConsultLimitNotifications(); // Initialize consult limit monitoring
  const mainPadding = location.pathname.startsWith("/consults/") || location.pathname.startsWith("/soap-editor/") || location.pathname.startsWith("/wellness-editor/") || location.pathname.startsWith("/procedure-editor/") || location.pathname.startsWith("/case-summary/") || location.pathname.startsWith("/post-recording/") ? "p-0" : "px-0 py-2 sm:p-4 lg:p-6";
  const [userClinics, setUserClinics] = useState<Array<{
    id: string;
    name: string;
  }>>([]);
  const [currentClinicName, setCurrentClinicName] = useState<string>("");
  const [switchingClinic, setSwitchingClinic] = useState(false);

  // Fetch user's clinics and current clinic name
  useEffect(() => {
    if (!user?.id) return;
    const fetchClinics = async () => {
      const {
        data: profiles
      } = await supabase.from("profiles").select("clinic_id, clinics(id, name)").eq("user_id", user.id);
      if (profiles && profiles.length > 0) {
        const clinics = profiles.map(p => ({
          id: p.clinic_id,
          name: (p.clinics as any)?.name || "Unknown Clinic"
        }));
        setUserClinics(clinics);

        // Set current clinic name
        const currentClinic = clinics.find(c => c.id === clinicId);
        if (currentClinic) {
          setCurrentClinicName(currentClinic.name);
        }
      }
    };
    fetchClinics();
  }, [user?.id, clinicId]);

  // Update browser tab title with unread count
  useEffect(() => {
    const baseTitle = "whiskr";
    document.title = unreadCount > 0 ? `(${unreadCount}) ${baseTitle}` : baseTitle;
  }, [unreadCount]);
  const handleClinicSwitch = async (newClinicId: string) => {
    if (newClinicId === clinicId) return;
    setSwitchingClinic(true);
    try {
      await selectClinic(newClinicId);
      const newClinic = userClinics.find(c => c.id === newClinicId);
      if (newClinic) {
        setCurrentClinicName(newClinic.name);
        toast.success(`Switched to ${newClinic.name}`);
        // Reload the page to refresh all clinic-specific data
        window.location.reload();
      }
    } catch (error) {
      console.error("Error switching clinic:", error);
      toast.error("Failed to switch clinic");
    } finally {
      setSwitchingClinic(false);
    }
  };
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Get unread messages count for the Messages nav item
  const [messagesUnread, setMessagesUnread] = useState(0);
  useEffect(() => {
    if (!clinicId || !user) return;
    const loadUnread = async () => {
      const {
        data
      } = await supabase.from("messages").select("id").eq("clinic_id", clinicId).eq("recipient_id", user.id).eq("read", false);
      setMessagesUnread(data?.length || 0);
    };
    loadUnread();
    const channel = supabase.channel("topbar-messages").on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "messages",
      filter: `clinic_id=eq.${clinicId}`
    }, () => loadUnread()).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clinicId, user]);
  return <div className="flex-1 flex flex-col h-screen">
      <MasterAdminBanner />
      {/* Top Safe Area Spacer - Despia Native injects value */}
      <div style={{
      height: 'var(--safe-area-top)'
    }} className="hidden lg:block bg-card" />
      <header className="hidden lg:flex h-14 border-b items-center justify-between px-4 bg-card shadow-sm">
        {/* Left: Sidebar trigger + Logo + Clinical Nav */}
        <div className="flex items-center gap-4">
          <SidebarTrigger className="hidden lg:flex text-muted-foreground hover:text-foreground" />

          <NavLink to="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-all duration-200">
            <img src={growdvmLogo} alt="whiskr" className="w-8 h-8 object-contain" />
            <span className="text-base font-semibold text-foreground hidden sm:block">​</span>
          </NavLink>

          {/* Clinical Navigation - Desktop */}
          <DesktopNavigation messagesUnread={messagesUnread} onPrefetch={handlePrefetch} />
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2">
          {/* Mobile menu button - Hidden on mobile since we use bottom nav */}
          <Button variant="ghost" size="icon" className="hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>

          {/* Clinic Switcher */}
          {userClinics.length > 1 && <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 hidden sm:flex" disabled={switchingClinic}>
                  <Building2 className="h-4 w-4" />
                  <span className="max-w-[120px] truncate">{currentClinicName || "Clinic"}</span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-background z-50">
                <DropdownMenuLabel>Switch Clinic</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {userClinics.map(clinic => <DropdownMenuItem key={clinic.id} onClick={() => handleClinicSwitch(clinic.id)} className="flex items-center justify-between cursor-pointer">
                    <span className="truncate">{clinic.name}</span>
                    {clinic.id === clinicId && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>}

          <ThemeToggle />
          <NotificationCenter />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <AccountIcon className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-background z-50">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/account")}>
                <User className="mr-2 h-4 w-4" />
                Account Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile Clinical Navigation Dropdown */}
      {mobileMenuOpen && <div className="lg:hidden border-b bg-card shadow-sm animate-fade-in">
          <nav className="flex flex-col p-2 gap-1">
            {clinicalNavItems.map(item => <NavLink key={item.url} to={item.url} end={item.url === "/dashboard"} onClick={() => setMobileMenuOpen(false)} className={({
          isActive
        }) => `relative flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${isActive ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}>
                <item.icon className="h-5 w-5" />
                <span>{item.title}</span>
                {item.title === "Messages" && messagesUnread > 0 && <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                    {messagesUnread}
                  </span>}
              </NavLink>)}
          </nav>
        </div>}

      <main className={`flex-1 ${mainPadding} overflow-auto has-bottom-nav lg:pb-0`}>
        <div key={location.pathname} className="page-transition">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation - Hide on pages with custom bottom nav */}
      {!location.pathname.startsWith("/post-recording/") && !location.pathname.startsWith("/case-summary/") && !location.pathname.startsWith("/soap-editor/") && !location.pathname.startsWith("/wellness-editor/") && !location.pathname.startsWith("/procedure-editor/") && !location.pathname.match(/^\/patients\/[^/]+$/) && <MobileBottomNav />}
    </div>;
}
export function DashboardLayout() {
  const {
    user,
    loading,
    clinicId,
    userRole,
    clinicRole,
    isSupportAgent
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const {
    isTrialExpired,
    needsUpgrade,
    isPaymentBlocked,
    hasPaymentIssue,
    isLoading: trialLoading
  } = useTrialStatus();
  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
    }
  }, [user, loading, navigate]);

  // Redirect support agents WITHOUT clinic role to support-management page only
  useEffect(() => {
    if (!loading && user && isSupportAgent && userRole !== "super_admin" && !clinicRole) {
      // Only restrict users who are ONLY support agents (no clinic role)
      const allowedPaths = ["/support-management", "/account"];
      const isAllowedPath = allowedPaths.some(path => location.pathname.startsWith(path));
      if (!isAllowedPath) {
        navigate("/support-management", {
          replace: true
        });
      }
    }
  }, [user, loading, isSupportAgent, userRole, clinicRole, location.pathname, navigate]);

  // Load unread message count for floating chat button
  useEffect(() => {
    if (!clinicId || !user) return;
    const loadUnreadCount = async () => {
      const {
        data
      } = await supabase.from("messages").select("id").eq("clinic_id", clinicId).eq("recipient_id", user.id).eq("read", false);
      setUnreadMessagesCount(data?.length || 0);
    };
    loadUnreadCount();

    // Listen for refresh events
    const refreshHandler = () => loadUnreadCount();
    window.addEventListener("messages:refresh-unread", refreshHandler);

    // Real-time subscription
    const channel = supabase.channel("unread-messages-widget").on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "messages",
      filter: `clinic_id=eq.${clinicId}`
    }, () => {
      loadUnreadCount();
    }).subscribe();
    return () => {
      window.removeEventListener("messages:refresh-unread", refreshHandler);
      supabase.removeChannel(channel);
    };
  }, [clinicId, user]);
  if (loading || trialLoading) {
    return <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>;
  }
  if (!user) return null;

  // Define allowed pages that don't require subscription
  const allowedPages = ["/billing", "/account", "/payment-success"];
  const isAllowedPage = allowedPages.some(path => location.pathname.startsWith(path));

  // Block access if payment is overdue and grace period expired (except super_admin and allowed pages)
  if (isPaymentBlocked && userRole !== "super_admin" && !isAllowedPage) {
    return <PaymentOverdue />;
  }

  // Global paywall: Block access for users who need to upgrade (except super_admin and allowed pages)
  if (needsUpgrade && userRole !== "super_admin" && !isAllowedPage) {
    return <UpgradeRequired />;
  }

  // Block access if trial expired (except for super_admin and allowed pages)
  if (isTrialExpired && userRole !== "super_admin" && !isAllowedPage) {
    return <TrialExpired />;
  }
  return <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <DashboardContent />
        <MinimizableChat unreadCount={unreadMessagesCount} />
      </div>
    </SidebarProvider>;
}