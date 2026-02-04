import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { UserRole, ClinicRole } from '@/types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: UserRole | null;
  clinicRole: ClinicRole | null;
  canEdit: boolean; // Helper to check if user can edit clinical data
  clinicId: string | null;
  loading: boolean;
  subscriptionStatus: {
    subscribed: boolean;
    product_id: string | null;
    subscription_end: string | null;
  } | null;
  viewAsClinicId: string | null; // For super_admin to view as another clinic
  setViewAsClinicId: (clinicId: string | null) => void;
  actualClinicId: string | null; // The super admin's real clinic
  isSupportAgent: boolean; // Check if user is a support agent
  selectClinic: (clinicId: string) => Promise<void>; // Select clinic for multi-clinic users
  signIn: (email: string, password: string, deviceInfo?: {
    deviceFingerprint: string;
    ipAddress: string;
    userAgent: string;
    deviceName: string;
  }) => Promise<{ error: any; data?: any }>;
  signUp: (email: string, password: string, name: string, clinicName: string, referralCode?: string) => Promise<{ data: any; error: any }>;
  signOut: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;
  updatePassword: (newPassword: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [clinicRole, setClinicRole] = useState<ClinicRole | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [actualClinicId, setActualClinicId] = useState<string | null>(null);
  const [viewAsClinicId, setViewAsClinicId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSupportAgent, setIsSupportAgent] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<{
    subscribed: boolean;
    product_id: string | null;
    subscription_end: string | null;
  } | null>(null);
  
  // For super_admin, use viewAsClinicId if set, otherwise use their actual clinic
  // For regular users, always use their actual clinic
  // Memoize to prevent unnecessary re-renders
  const effectiveClinicId = useMemo(() => {
    return userRole === 'super_admin' && viewAsClinicId ? viewAsClinicId : clinicId;
  }, [userRole, viewAsClinicId, clinicId]);
  
  // Helper to determine if user can edit clinical data
  // Memoize to prevent unnecessary re-renders
  const canEdit = useMemo(() => {
    return clinicRole === 'vet' || clinicRole === 'vet_tech' || userRole === 'super_admin';
  }, [clinicRole, userRole]);

  const fetchSubscriptionStatus = async () => {
    try {
      // Get current session and refresh if needed
      const { data: authData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !authData?.session) {
        console.log('[AUTH] No valid session for subscription check');
        setSubscriptionStatus(null);
        return;
      }
      
      // Check if token is close to expiry (within 5 minutes) and refresh
      const expiresAt = authData.session.expires_at;
      if (expiresAt) {
        const expiryTime = expiresAt * 1000; // Convert to milliseconds
        const fiveMinutes = 5 * 60 * 1000;
        if (Date.now() > expiryTime - fiveMinutes) {
          console.log('[AUTH] Token expiring soon, refreshing session');
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            console.error('[AUTH] Session refresh failed:', refreshError);
            setSubscriptionStatus(null);
            return;
          }
          console.log('[AUTH] Session refreshed successfully');
        }
      }
      
      const { data, error } = await supabase.functions.invoke('check-subscription');
      
      // Handle authentication errors gracefully
      if (error) {
        if (error.message?.includes('Session expired') || 
            error.message?.includes('invalid') ||
            error.message?.includes('Unauthorized')) {
          console.log('[AUTH] Subscription check auth error, attempting session refresh');
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError) {
            // Retry after refresh
            const { data: retryData, error: retryError } = await supabase.functions.invoke('check-subscription');
            if (!retryError && retryData) {
              setSubscriptionStatus(retryData);
            }
          }
          return;
        }
        console.error('[AUTH] Subscription check error:', error);
        return;
      }
      
      if (data) {
        setSubscriptionStatus(data);
      }
    } catch (error) {
      console.error('[AUTH] Error fetching subscription:', error);
    }
  };

  const fetchUserData = async (userId: string) => {
    try {
      // Fetch ALL profiles for multi-clinic support
      const { data: profiles } = await supabase
        .from('profiles')
        .select('clinic_id')
        .eq('user_id', userId);
      
      if (!profiles || profiles.length === 0) {
        console.warn('No profiles found for user');
        setLoading(false);
        return;
      }

      // Determine which clinic to use
      let selectedClinicId: string | null = null;
      
      if (profiles.length === 1) {
        // Single clinic user
        selectedClinicId = profiles[0].clinic_id;
      } else {
        // Multi-clinic user - check for stored preference
        const storedClinicId = localStorage.getItem(`preferred_clinic_${userId}`);
        if (storedClinicId && profiles.some(p => p.clinic_id === storedClinicId)) {
          selectedClinicId = storedClinicId;
        } else {
          // No preference stored - use first clinic as fallback
          selectedClinicId = profiles[0].clinic_id;
        }
      }
      
      setClinicId(selectedClinicId);
      setActualClinicId(selectedClinicId);

      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      
      // Prioritize super_admin if it exists, otherwise use first role
      const roles = rolesData?.map(r => r.role) ?? [];
      const role = roles.includes('super_admin') ? 'super_admin' : roles[0] ?? null;
      setUserRole(role as UserRole);
      
      // Check if user is a support agent
      const { data: supportAgentData } = await supabase
        .from('support_agents')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      
      setIsSupportAgent(!!supportAgentData);
      
      // Fetch clinic role for the selected clinic
      const { data: clinicRoleData } = await supabase
        .from('clinic_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('clinic_id', selectedClinicId)
        .maybeSingle();
      
      setClinicRole((clinicRoleData?.role as ClinicRole) ?? null);
      
      // Fetch subscription status
      await fetchSubscriptionStatus();
      setLoading(false);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setLoading(false);
    }
  };

  // Watch for viewAsClinicId changes and update clinic role
  useEffect(() => {
    if (!user) return;
    
    if (userRole === 'super_admin' && viewAsClinicId) {
      // For super_admin viewing another clinic, always give them vet role for full edit permissions
      setClinicRole('vet' as ClinicRole);
    } else if (!viewAsClinicId && actualClinicId) {
      // When not viewing as another clinic, fetch their actual clinic role
      const fetchActualClinicRole = async () => {
        try {
          const { data: clinicRoleData } = await supabase
            .from('clinic_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('clinic_id', actualClinicId)
            .maybeSingle();
          
          setClinicRole((clinicRoleData?.role as ClinicRole) ?? null);
        } catch (error) {
          console.error('Error fetching clinic role:', error);
        }
      };
      
      fetchActualClinicRole();
    }
  }, [viewAsClinicId, userRole, user, actualClinicId]);

  useEffect(() => {
    const initAuth = async () => {
      // Get current session first
      const { data: { session } } = await supabase.auth.getSession();
      
      // Check remember me preference on app load
      const rememberMe = localStorage.getItem('rememberMe');
      const currentSession = sessionStorage.getItem('currentSession');
      
      // If no active session and neither remember me nor current session marker, sign out
      if (!session && !rememberMe && !currentSession) {
        console.log('[AUTH] No session and no remember me, clearing');
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setLoading(false);
        return;
      }
      
      // Check if remember me timestamp is expired (30 days)
      if (rememberMe && session) {
        const timestamp = localStorage.getItem('rememberMeTimestamp');
        if (timestamp) {
          const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
          if (Date.now() - parseInt(timestamp) > thirtyDaysInMs) {
            console.log('[AUTH] Remember me expired, signing out');
            localStorage.removeItem('rememberMe');
            localStorage.removeItem('rememberMeTimestamp');
            await supabase.auth.signOut();
            setUser(null);
            setSession(null);
            setLoading(false);
            return;
          }
        }
      }
      
      // If we have a session, verify it's still valid by attempting refresh
      if (session) {
        // Try to refresh the session to verify it's still valid
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError) {
          console.log('[AUTH] Session invalid (refresh failed), clearing:', refreshError.message);
          await supabase.auth.signOut();
          setUser(null);
          setSession(null);
          setLoading(false);
          return;
        }
        
        // Use the refreshed session
        const validSession = refreshData.session;
        if (validSession) {
          setSession(validSession);
          setUser(validSession.user);
          fetchUserData(validSession.user.id);
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };
    
    // Initialize auth
    initAuth();
    
    // Set up auth state listener
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[AUTH] Auth state changed:', event);
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Defer Supabase calls with setTimeout to avoid deadlock
          setTimeout(() => fetchUserData(session.user.id), 0);
        } else {
          setUserRole(null);
          setClinicRole(null);
          setClinicId(null);
          setActualClinicId(null);
          setViewAsClinicId(null);
          setSubscriptionStatus(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string, deviceInfo?: {
    deviceFingerprint: string;
    ipAddress: string;
    userAgent: string;
    deviceName: string;
    rememberMe?: boolean;
  }) => {
    try {
      // Store remember me preference
      if (deviceInfo?.rememberMe) {
        localStorage.setItem('rememberMe', 'true');
        localStorage.setItem('rememberMeTimestamp', Date.now().toString());
      } else {
        localStorage.removeItem('rememberMe');
        sessionStorage.setItem('currentSession', 'true');
      }
      
      const { data: userData, error: userError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (userError) return { error: userError };

      // Check if user has multiple clinics
      const { data: profiles } = await supabase
        .from('profiles')
        .select('clinic_id, clinics(id, name)')
        .eq('user_id', userData.user.id);

      if (!profiles || profiles.length === 0) {
        return { error: { message: 'No clinic found for user' } };
      }

      // If user has multiple clinics, return them for selection
      if (profiles.length > 1) {
        // Check if user has a stored preference
        const storedClinicId = localStorage.getItem(`preferred_clinic_${userData.user.id}`);
        if (storedClinicId && profiles.some(p => p.clinic_id === storedClinicId)) {
          // Use stored preference
          setClinicId(storedClinicId);
          setActualClinicId(storedClinicId);
        } else {
          // Return clinics for selection
          return { 
            error: null, 
            data: { 
              requiresClinicSelection: true, 
              clinics: profiles.map(p => ({
                id: p.clinic_id,
                name: (p.clinics as any)?.name || 'Unknown Clinic'
              }))
            } 
          };
        }
      }

      // Device limit check only for non-multi-clinic scenario
      if (deviceInfo && profiles.length === 1) {
        console.log('[AUTH] Checking device limit for user:', userData.user.id);
        
      const { data: limitData, error: limitError } = await supabase.functions.invoke('check-device-limit', {
        body: {
          deviceFingerprint: deviceInfo.deviceFingerprint,
          ipAddress: deviceInfo.ipAddress,
          userAgent: deviceInfo.userAgent,
          deviceName: deviceInfo.deviceName,
        }
      });

        console.log('[AUTH] Device limit check result:', { limitData, limitError });

        if (limitError) {
          console.error('[AUTH] Device limit check error:', limitError);
          await supabase.auth.signOut();
          return { 
            error: { 
              message: 'Failed to verify device',
              details: limitError.message
            } 
          };
        }

        if (limitData?.error) {
          console.log('[AUTH] Device limit reached');
          await supabase.auth.signOut();
          return { 
            error: { 
              message: 'Device limit reached',
              details: limitData.message
            } 
          };
        }

        if (!limitData?.allowed) {
          console.log('[AUTH] Device not allowed');
          await supabase.auth.signOut();
          return { 
            error: { 
              message: 'Device limit reached',
              details: 'Please remove a device or upgrade your plan'
            } 
          };
        }

        // Upsert device session
        if (!limitData?.isExisting) {
          const { error: upsertError } = await supabase.functions.invoke('upsert-device-session', {
            body: {
              clinicId: profiles[0].clinic_id,
              deviceFingerprint: deviceInfo.deviceFingerprint,
              ipAddress: deviceInfo.ipAddress,
              userAgent: deviceInfo.userAgent,
              deviceName: deviceInfo.deviceName,
            }
          });

          if (upsertError) {
            console.error('[AUTH] Error upserting device session:', upsertError);
          }
        }
      }

      // Log successful login
      if (deviceInfo) {
        try {
          await supabase.from('login_history').insert({
            user_id: userData.user.id,
            email: userData.user.email || email,
            success: true,
            device_name: deviceInfo.deviceName,
            device_fingerprint: deviceInfo.deviceFingerprint,
            ip_address: deviceInfo.ipAddress,
            user_agent: deviceInfo.userAgent,
          });
        } catch (logError) {
          console.error('[AUTH] Failed to log successful login:', logError);
        }
      }

      return { error: null };
    } catch (error: any) {
      console.error('Sign in error:', error);
      return { error };
    }
  };

  const signUp = async (email: string, password: string, name: string, clinicName: string, referralCode?: string) => {
    const redirectUrl = `${window.location.origin}/`; // Email confirmations return to home

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          name,
          clinic_name: clinicName,
          referral_code: referralCode || null,
        }
      }
    });

    // Do not sign out here; allow user to finish onboarding and payment
    // Access to app features will be gated by trial status / subscription checks

    return { data, error };
  };

  const signOut = async () => {
    // Reset view-as mode before signing out
    setViewAsClinicId(null);
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const resetPassword = async (email: string) => {
    // Always use production domain for white-label experience
    const origin = "https://whiskr.ai";
      
    const { data, error } = await supabase.functions.invoke('send-auth-email', {
      body: {
        email,
        type: 'recovery',
        origin: origin,
      },
    });
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    return { error };
  };

  const selectClinic = async (selectedClinicId: string) => {
    if (!user) return;
    
    // Store preference
    localStorage.setItem(`preferred_clinic_${user.id}`, selectedClinicId);
    
    // Update state
    setClinicId(selectedClinicId);
    setActualClinicId(selectedClinicId);
    
    // Fetch clinic role for selected clinic
    const { data: clinicRoleData } = await supabase
      .from('clinic_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('clinic_id', selectedClinicId)
      .maybeSingle();
    
    setClinicRole((clinicRoleData?.role as ClinicRole) ?? null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      userRole,
      clinicRole,
      canEdit,
      clinicId: effectiveClinicId, 
      actualClinicId,
      viewAsClinicId,
      setViewAsClinicId,
      isSupportAgent,
      loading,
      subscriptionStatus,
      selectClinic,
      signIn, 
      signUp, 
      signOut,
      refreshSubscription: fetchSubscriptionStatus,
      resetPassword,
      updatePassword
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
