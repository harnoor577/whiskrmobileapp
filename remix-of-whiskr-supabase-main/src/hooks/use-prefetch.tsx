import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Simple in-memory cache for prefetched data
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds
const prefetchingRef = new Set<string>();

export function usePrefetch(clinicId: string | null) {
  const prefetchingLocalRef = useRef<Set<string>>(new Set());

  const prefetchPatients = useCallback(async () => {
    if (!clinicId) return;
    const cacheKey = `patients-${clinicId}`;
    
    // Skip if already cached and fresh
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) return;
    
    // Skip if already prefetching
    if (prefetchingLocalRef.current.has(cacheKey)) return;
    prefetchingLocalRef.current.add(cacheKey);
    
    try {
      const { data } = await supabase
        .from('patients')
        .select(`*, consults (started_at, chat_messages (content))`)
        .eq('clinic_id', clinicId)
        .order('started_at', { referencedTable: 'consults', ascending: false });
      
      if (data) {
        cache.set(cacheKey, { data, timestamp: Date.now() });
      }
    } finally {
      prefetchingLocalRef.current.delete(cacheKey);
    }
  }, [clinicId]);

  const prefetchDashboard = useCallback(async () => {
    if (!clinicId) return;
    const cacheKey = `dashboard-${clinicId}`;
    
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) return;
    
    if (prefetchingLocalRef.current.has(cacheKey)) return;
    prefetchingLocalRef.current.add(cacheKey);
    
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      const [patientsResult, recentPatientsResult] = await Promise.all([
        supabase.from('patients').select('*', { count: 'exact', head: true }).eq('clinic_id', clinicId),
        supabase.from('patients').select('id, name, species, breed, created_at').eq('clinic_id', clinicId).order('created_at', { ascending: false }).limit(5)
      ]);
      
      cache.set(cacheKey, { 
        data: { 
          totalPatients: patientsResult.count || 0,
          recentPatients: recentPatientsResult.data || []
        }, 
        timestamp: Date.now() 
      });
    } finally {
      prefetchingLocalRef.current.delete(cacheKey);
    }
  }, [clinicId]);

  return { prefetchPatients, prefetchDashboard };
}

// Prefetch patient detail data on hover
export async function prefetchPatientDetail(patientId: string, clinicId: string) {
  const cacheKey = `patient-detail-${patientId}`;
  
  // Skip if already cached and fresh
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return;
  
  // Skip if already prefetching
  if (prefetchingRef.has(cacheKey)) return;
  prefetchingRef.add(cacheKey);
  
  try {
    // Fetch patient, clinic, and consults in parallel with chat_messages included
    const [patientResult, clinicResult, consultsResult] = await Promise.all([
      supabase.from('patients').select('*').eq('id', patientId).eq('clinic_id', clinicId).maybeSingle(),
      supabase.from('clinics').select('name').eq('id', clinicId).maybeSingle(),
      supabase.from('consults')
        .select(`
          *, 
          clinical_summary,
          chat_messages (content, role, created_at)
        `)
        .eq('patient_id', patientId)
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
    ]);
    
    if (patientResult.data) {
      cache.set(cacheKey, {
        data: {
          patient: patientResult.data,
          clinic: clinicResult.data,
          consults: consultsResult.data || []
        },
        timestamp: Date.now()
      });
    }
  } catch (error) {
    console.error('Error prefetching patient detail:', error);
  } finally {
    prefetchingRef.delete(cacheKey);
  }
}

// Prefetch case summary data on hover
export async function prefetchCaseSummary(consultId: string) {
  const cacheKey = `case-summary-${consultId}`;
  
  // Skip if already cached and fresh
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return;
  
  // Skip if already prefetching
  if (prefetchingRef.has(cacheKey)) return;
  prefetchingRef.add(cacheKey);
  
  try {
    // First fetch consult with patient and clinic data using joins
    const { data: consultData } = await supabase
      .from('consults')
      .select(`
        id, patient_id, status, created_at, started_at,
        soap_s, soap_o, soap_a, soap_p, case_notes, history_summary,
        clinic_id
      `)
      .eq('id', consultId)
      .single();
    
    if (!consultData) return;
    
    // Parallel fetch patient, clinic, diagnostics, and assignment
    const [patientResult, clinicResult, diagnosticsResult, assignmentResult] = await Promise.all([
      supabase
        .from('patients')
        .select('id, name, species, breed, identifiers, sex, date_of_birth')
        .eq('id', (consultData as any).patient_id)
        .single(),
      supabase
        .from('clinics')
        .select('name, address, phone, clinic_email, header_logo_url')
        .eq('id', (consultData as any).clinic_id)
        .single(),
      supabase
        .from('file_assets')
        .select('*')
        .eq('consult_id', consultId)
        .order('created_at', { ascending: false }),
      supabase
        .from('consult_assignments')
        .select('user_id')
        .eq('consult_id', consultId)
        .limit(1)
        .maybeSingle()
    ]);
    
    // Fetch assignment profile if exists
    let assignmentProfile = null;
    if (assignmentResult.data?.user_id) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('name, name_prefix')
        .eq('user_id', assignmentResult.data.user_id)
        .single();
      assignmentProfile = profileData;
    }
    
    cache.set(cacheKey, {
      data: {
        consult: consultData,
        patient: patientResult.data,
        clinic: clinicResult.data,
        diagnostics: diagnosticsResult.data || [],
        assignment: assignmentResult.data,
        assignmentProfile
      },
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error prefetching case summary:', error);
  } finally {
    prefetchingRef.delete(cacheKey);
  }
}

// Get cached data if available and fresh
export function getCachedData<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  return null;
}

// Set cache data
export function setCacheData(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
}

// Account settings cache interface
export interface AccountSettingsCacheData {
  profile: {
    name: string;
    email: string;
    user_type: string | null;
    practice_types: string[] | null;
    city: string | null;
    state_province: string | null;
    country: string | null;
    school_name: string | null;
    name_prefix: string | null;
  } | null;
  clinic: {
    name: string;
    clinic_email: string | null;
    phone: string | null;
    address: string | null;
    max_devices: number | null;
    subscription_tier: string | null;
  } | null;
  devices: any[];
  tokens: any[];
  referralCode: string | null;
  referrals: any[];
  credits: { amount: number }[];
}

// Prefetch account settings data on hover
export async function prefetchAccountSettings(userId: string, clinicId: string) {
  const cacheKey = `account-settings-${userId}`;
  
  // Skip if already cached and fresh
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return;
  
  // Skip if already prefetching
  if (prefetchingRef.has(cacheKey)) return;
  prefetchingRef.add(cacheKey);
  
  try {
    // Fetch all account data in parallel
    const [profileResult, clinicResult, devicesResult, referralsResult, creditsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('name, email, user_type, practice_types, city, state_province, country, school_name')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('clinics')
        .select('name, clinic_email, phone, address, max_devices, subscription_tier')
        .eq('id', clinicId)
        .maybeSingle(),
      supabase
        .from('device_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('revoked', false)
        .gte('last_active_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('last_active_at', { ascending: false }),
      supabase
        .from('referrals')
        .select('*')
        .eq('referrer_id', userId),
      supabase
        .from('user_credits')
        .select('amount')
        .eq('user_id', userId)
    ]);
    
    cache.set(cacheKey, {
      data: {
        profile: profileResult.data ? { ...profileResult.data, name_prefix: '' } : null,
        clinic: clinicResult.data,
        devices: devicesResult.data || [],
        tokens: [], // Token fetching removed - table may not exist
        referralCode: null, // Will be fetched separately if needed
        referrals: referralsResult.data || [],
        credits: creditsResult.data || []
      } as AccountSettingsCacheData,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error prefetching account settings:', error);
  } finally {
    prefetchingRef.delete(cacheKey);
  }
}
