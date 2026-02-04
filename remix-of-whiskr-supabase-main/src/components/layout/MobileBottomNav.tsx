import { useState, useEffect } from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { Home, Plus, PawPrint, Settings, LogOut } from 'lucide-react';
import { useHaptic } from '@/hooks/use-haptic';
import { QuickConsultDialog } from '@/components/consult/QuickConsultDialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';

/**
 * Mobile bottom navigation bar with 3 buttons:
 * - Dashboard
 * - Start New Consult (prominent center button)
 * - Patients
 */
export const MobileBottomNav = () => {
  const [showQuickConsult, setShowQuickConsult] = useState(false);
  const [patientData, setPatientData] = useState<any>(null);
  const { triggerHaptic } = useHaptic();
  const location = useLocation();
  const { patientId } = useParams<{ patientId?: string }>();
  const { clinicId, signOut } = useAuth();

  // Fetch patient data when on patient detail page
  useEffect(() => {
    const fetchPatient = async () => {
      if (patientId && clinicId && location.pathname.includes('/patients/')) {
        const { data } = await supabase
          .from('patients')
          .select('*')
          .eq('id', patientId)
          .eq('clinic_id', clinicId)
          .maybeSingle();
        setPatientData(data);
      } else {
        setPatientData(null);
      }
    };
    fetchPatient();
  }, [patientId, clinicId, location.pathname]);

  const handleNavClick = () => {
    triggerHaptic('light');
  };

  const handleNewConsult = () => {
    triggerHaptic('success');
    setShowQuickConsult(true);
  };

  const handleSignOut = async () => {
    triggerHaptic('warning');
    await signOut();
  };

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Bottom Navigation Bar - Mobile Only */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50">
        {/* Background bar */}
        <div className="bg-card/95 backdrop-blur-lg border-t border-border">
          <div className="flex items-center justify-around px-2 py-3">
            {/* Dashboard */}
            <NavLink
              to="/dashboard"
              end
              onClick={handleNavClick}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-2 py-1 rounded-lg transition-colors btn-touch",
                isActive('/dashboard')
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Home className="h-5 w-5" />
              <span className="text-[10px] font-medium">Home</span>
            </NavLink>

            {/* Patients */}
            <NavLink
              to="/patients"
              onClick={handleNavClick}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-2 py-1 rounded-lg transition-colors btn-touch",
                isActive('/patients')
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <PawPrint className="h-5 w-5" />
              <span className="text-[10px] font-medium">Patients</span>
            </NavLink>

            {/* Placeholder for center button space */}
            <div className="w-14" />

            {/* Settings */}
            <NavLink
              to="/account"
              onClick={handleNavClick}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-2 py-1 rounded-lg transition-colors btn-touch",
                isActive('/account')
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Settings className="h-5 w-5" />
              <span className="text-[10px] font-medium">Settings</span>
            </NavLink>

            {/* Sign Out */}
            <button
              onClick={handleSignOut}
              className="flex flex-col items-center justify-center gap-1 px-2 py-1 rounded-lg transition-colors btn-touch text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-5 w-5" />
              <span className="text-[10px] font-medium">Sign Out</span>
            </button>
          </div>
          {/* Bottom Safe Area Spacer - Despia Native injects value */}
          <div style={{ height: 'var(--safe-area-bottom)' }} />
        </div>

        {/* Floating Center Button - absolutely positioned above the bar */}
        <button
          onClick={handleNewConsult}
          className="absolute left-1/2 -translate-x-1/2 -top-7 flex flex-col items-center"
        >
          <div className="h-14 w-14 rounded-full bg-primary shadow-xl ring-4 ring-card/80 flex items-center justify-center transform transition-transform active:scale-95 hover:bg-primary/90">
            <Plus className="h-7 w-7 text-primary-foreground" />
          </div>
          <span className="text-[10px] mt-1 font-semibold text-primary">Consult</span>
        </button>
      </nav>

      {/* Quick Consult Dialog - Patient-aware */}
      <QuickConsultDialog
        open={showQuickConsult}
        onOpenChange={setShowQuickConsult}
        prefilledPatientId={patientData?.identifiers?.patient_id}
        prefilledPatientData={patientData}
      />
    </>
  );
};
