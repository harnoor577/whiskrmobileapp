import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const SUPABASE_URL = 'https://ifwieaefmubornheisld.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlmd2llYWVmbXVib3JuaGVpc2xkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyOTM4NzQsImV4cCI6MjA4NDg2OTg3NH0.BaiKFmzviWYu5Vp2YYUSzC2aj3X-7EDgmOGqKfb-Las';

// Create a custom storage that handles SSR
const customStorage = {
  getItem: async (key: string) => {
    try {
      if (typeof window === 'undefined') return null;
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      if (typeof window === 'undefined') return;
      await AsyncStorage.setItem(key, value);
    } catch {}
  },
  removeItem: async (key: string) => {
    try {
      if (typeof window === 'undefined') return;
      await AsyncStorage.removeItem(key);
    } catch {}
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: customStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export { SUPABASE_URL, SUPABASE_ANON_KEY };
