import { NavLink, useLocation } from "react-router-dom";
import {
  FileText,
  Settings,
  CreditCard,
  Crown,
  Gift,
  MessageSquare,
  User,
  HelpCircle,
  ChevronRight,
  Shield,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import growdvmLogo from "@/assets/growdvm-logo.png";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatDisplayName } from "@/lib/formatDisplayName";
import { prefetchAccountSettings } from "@/hooks/use-prefetch";

// Menu items - Clinical moved to top bar, only Setup/Support/SuperAdmin here
const menuGroups = {
  setup: [
    {
      title: "Templates",
      url: "/templates",
      icon: FileText,
      roles: ["admin", "standard", "super_admin"],
    },
    {
      title: "Billing",
      url: "/billing",
      icon: CreditCard,
      roles: ["admin", "super_admin"],
    },
    {
      title: "Admin",
      url: "/admin",
      icon: Settings,
      roles: ["admin", "super_admin"],
    },
  ],
  support: [
    {
      title: "Support",
      url: "/support",
      icon: MessageSquare,
      roles: ["admin", "standard", "super_admin"],
    },
    {
      title: "Affiliate",
      url: "/affiliate",
      icon: Gift,
      roles: ["admin", "standard", "super_admin"],
    },
  ],
  superAdmin: [
    {
      title: "Master Admin",
      url: "/master-admin",
      icon: Crown,
      roles: ["super_admin"],
    },
    {
      title: "Audit Trail",
      url: "/admin/audit-trail",
      icon: Shield,
      roles: ["super_admin"],
    },
    {
      title: "User Feedback",
      url: "/user-feedback",
      icon: MessageSquare,
      roles: ["super_admin"],
    },
    {
      title: "Support Management",
      url: "/support-management",
      icon: Settings,
      roles: ["super_admin"],
    },
  ],
};
export function AppSidebar() {
  const location = useLocation();
  const { userRole, user, clinicId, clinicRole, isSupportAgent } = useAuth();
  const { setOpenMobile } = useSidebar();
  const [userName, setUserName] = useState<string>("");
  const [namePrefix, setNamePrefix] = useState<string>("Dr.");
  const [clinicName, setClinicName] = useState<string>("");

  // Filter menu groups based on roles
  const filterGroupItems = (items: typeof menuGroups.setup) => {
    const hasClinicRole = !!clinicRole;
    return items.filter((item) => {
      if (userRole === "super_admin") return true;
      if (isSupportAgent && !hasClinicRole) return item.title === "Support Management";
      if (!userRole || !item.roles.includes(userRole)) return false;
      return true;
    });
  };
  const filteredGroups = {
    setup: filterGroupItems(menuGroups.setup),
    support: filterGroupItems(menuGroups.support),
    superAdmin: filterGroupItems(menuGroups.superAdmin),
  };

  // Load user and clinic info
  useEffect(() => {
    if (!user || !clinicId) return;
    const loadUserInfo = async () => {
      const { data: profile } = await supabase.from("profiles").select("name").eq("user_id", user.id).single();
      if (profile?.name) setUserName(profile.name);
      const { data: clinic } = await supabase.from("clinics").select("name").eq("id", clinicId).single();
      if (clinic?.name) setClinicName(clinic.name);
    };
    loadUserInfo();
  }, [user, clinicId]);

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    setOpenMobile(false);
  }, [location.pathname, setOpenMobile]);

  // Get role display name
  const getRoleDisplayName = () => {
    if (userRole === "super_admin") return "Super Admin";
    if (clinicRole === "vet") return "Veterinarian";
    if (clinicRole === "vet_tech") return "Vet Tech";
    if (clinicRole === "receptionist") return "Receptionist";
    if (userRole === "admin") return "Admin";
    return "Staff";
  };
  const renderMenuGroup = (items: typeof menuGroups.setup, groupLabel?: string, isLast?: boolean) => {
    if (items.length === 0) return null;
    return (
      <SidebarGroup className="mb-2">
        {groupLabel && (
          <div className="px-4 mb-3">
            <div className="flex items-center gap-2">
              <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-widest p-0 text-sidebar-foreground opacity-70">
                {groupLabel}
              </SidebarGroupLabel>
              <div className="flex-1 h-px bg-border/50" />
            </div>
          </div>
        )}
        <SidebarGroupContent>
          <SidebarMenu className="space-y-1 px-3">
            {items.map((item, index) => (
              <SidebarMenuItem
                key={item.title}
                style={{
                  animation: `fadeIn 0.4s ease-out ${index * 50}ms both`,
                }}
              >
                <SidebarMenuButton asChild>
                  <NavLink
                    to={item.url}
                    end
                    className={({ isActive }) =>
                      `group relative flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${isActive ? "bg-primary/10 text-sidebar-foreground shadow-sm" : "text-sidebar-foreground hover:bg-sidebar-accent/60"}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 ${isActive ? "bg-primary/20" : "bg-primary/10 group-hover:bg-primary/15"}`}
                          >
                            <item.icon className="h-4 w-4 shrink-0 transition-all duration-200 text-primary" />
                          </div>
                          <span className="text-sm font-medium text-sidebar-foreground">{item.title}</span>
                        </div>
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-primary shadow-sm" />
                        )}
                      </>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
        {!isLast && <div className="mx-4 mt-4 h-px bg-border/30" />}
      </SidebarGroup>
    );
  };
  return (
    <Sidebar className="border-r border-sidebar-border/50 bg-sidebar shadow-sm" collapsible="offcanvas">
      {/* Header with Logo */}
      <SidebarHeader className="p-4 border-b border-border/50">
        <div className="relative">
          <NavLink
            to="/dashboard"
            className="flex items-center justify-center group cursor-pointer transition-all duration-300 ease-out hover:opacity-90"
          >
            {/* Subtle glow effect */}
            <div className="absolute inset-0 bg-primary/5 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <img
              src={growdvmLogo}
              className="w-16 h-16 object-contain relative z-10 transition-transform duration-300 group-hover:scale-105"
            />
          </NavLink>
        </div>
      </SidebarHeader>

      {/* User Profile Section */}
      <div className="px-4 py-3 border-b border-border/50">
        <NavLink
          to="/account"
          className="flex items-center gap-3 p-2 rounded-xl hover:bg-sidebar-accent/50 transition-colors group cursor-pointer"
          onMouseEnter={() => {
            if (user?.id && clinicId) {
              prefetchAccountSettings(user.id, clinicId);
            }
          }}
          onTouchStart={() => {
            if (user?.id && clinicId) {
              prefetchAccountSettings(user.id, clinicId);
            }
          }}
        >
          {/* Avatar */}
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-semibold text-sm">
            {userName ? userName.charAt(0).toUpperCase() : <User className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-sidebar-foreground">
              {userName ? formatDisplayName(userName, namePrefix) : "Loading..."}
            </p>
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-0 font-medium"
            >
              {getRoleDisplayName()}
            </Badge>
          </div>
          <ChevronRight className="h-4 w-4 text-sidebar-foreground opacity-50 group-hover:opacity-100 transition-opacity" />
        </NavLink>
      </div>

      {/* Navigation Content - Only Setup, Support, Super Admin */}
      <SidebarContent className="pt-4 flex-1 overflow-y-auto">
        {renderMenuGroup(filteredGroups.setup, "SETUP")}
        {renderMenuGroup(filteredGroups.support, "SUPPORT", filteredGroups.superAdmin.length === 0)}
        {renderMenuGroup(filteredGroups.superAdmin, "SUPER ADMIN", true)}
      </SidebarContent>

      {/* Footer Section */}
      <SidebarFooter className="border-t border-border/50 p-3">
        <div className="space-y-1">
          <NavLink
            to="/account"
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground opacity-70 hover:bg-sidebar-accent/50 hover:opacity-100"}`
            }
            onMouseEnter={() => {
              if (user?.id && clinicId) {
                prefetchAccountSettings(user.id, clinicId);
              }
            }}
            onTouchStart={() => {
              if (user?.id && clinicId) {
                prefetchAccountSettings(user.id, clinicId);
              }
            }}
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </NavLink>
          <NavLink
            to="/support"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground opacity-70 hover:bg-sidebar-accent/50 hover:opacity-100 transition-colors"
          >
            <HelpCircle className="h-4 w-4" />
            <span>Need Help?</span>
          </NavLink>
        </div>
        <Separator className="my-2" />
        <div className="px-3 py-1">
          <p className="text-[10px] text-sidebar-foreground opacity-60 font-medium tracking-wide">
            {clinicName || "Whiskr"} • v1.0
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
