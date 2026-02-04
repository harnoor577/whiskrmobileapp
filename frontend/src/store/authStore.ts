import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User, Session, UserRole, ClinicRole } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthState {
  user: User | null;
  session: Session | null;
  userRole: UserRole | null;
  clinicRole: ClinicRole | null;
  clinicId: string | null;
  loading: boolean;
  initialized: boolean;
  
  // Actions
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, name: string, clinicName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  fetchUserData: (userId: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  userRole: null,
  clinicRole: null,
  clinicId: null,
  loading: true,
  initialized: false,

  initialize: async () => {
    try {
      console.log('[AUTH] Starting initialization...');
      
      // Set a timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Auth timeout')), 5000)
      );
      
      const sessionPromise = supabase.auth.getSession();
      
      const { data: { session } } = await Promise.race([
        sessionPromise,
        timeoutPromise
      ]) as any;
      
      console.log('[AUTH] Session check complete:', !!session);
      
      if (session) {
        set({ 
          session: session as any, 
          user: session.user as any,
          loading: false,
          initialized: true 
        });
        // Fetch user data in background
        get().fetchUserData(session.user.id);
      } else {
        set({ loading: false, initialized: true });
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('[AUTH] State changed:', event);
        if (session) {
          set({ session: session as any, user: session.user as any });
          get().fetchUserData(session.user.id);
        } else {
          set({ 
            user: null, 
            session: null, 
            userRole: null, 
            clinicRole: null, 
            clinicId: null 
          });
        }
      });
    } catch (error) {
      console.error('[AUTH] Initialize error:', error);
      set({ loading: false, initialized: true });
    }
  },

  fetchUserData: async (userId: string) => {
    try {
      // Fetch profile to get clinic_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('clinic_id')
        .eq('user_id', userId)
        .single();

      if (profile) {
        set({ clinicId: profile.clinic_id });

        // Fetch clinic role
        const { data: clinicRoleData } = await supabase
          .from('clinic_roles')
          .select('role')
          .eq('user_id', userId)
          .eq('clinic_id', profile.clinic_id)
          .single();

        if (clinicRoleData) {
          set({ clinicRole: clinicRoleData.role as ClinicRole });
        }
      }

      // Fetch user role
      const { data: userRoleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (userRoleData && userRoleData.length > 0) {
        const roles = userRoleData.map(r => r.role);
        const role = roles.includes('super_admin') ? 'super_admin' : roles[0];
        set({ userRole: role as UserRole });
      }

      set({ loading: false });
    } catch (error) {
      console.error('[AUTH] Error fetching user data:', error);
      set({ loading: false });
    }
  },

  signIn: async (email: string, password: string) => {
    try {
      set({ loading: true });
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        set({ loading: false });
        return { error };
      }

      if (data.session) {
        set({ 
          session: data.session as any, 
          user: data.user as any 
        });
        await get().fetchUserData(data.user.id);
      }

      return { error: null };
    } catch (error) {
      set({ loading: false });
      return { error };
    }
  },

  signUp: async (email: string, password: string, name: string, clinicName: string) => {
    try {
      set({ loading: true });
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            name,
            clinic_name: clinicName,
          },
        },
      });

      set({ loading: false });
      return { error };
    } catch (error) {
      set({ loading: false });
      return { error };
    }
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut();
      set({ 
        user: null, 
        session: null, 
        userRole: null, 
        clinicRole: null, 
        clinicId: null 
      });
    } catch (error) {
      console.error('[AUTH] Sign out error:', error);
    }
  },

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
}));
