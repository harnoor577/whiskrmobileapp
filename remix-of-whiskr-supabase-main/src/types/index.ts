// Account-level roles (for billing/admin access)
export type UserRole = 'admin' | 'standard' | 'super_admin';

// Clinic-level roles (for day-to-day work)
export type ClinicRole = 'vet' | 'vet_tech' | 'receptionist';

export interface User {
  id: string;
  email: string;
  role?: UserRole;
}

export interface Profile {
  id: string;
  user_id: string;
  clinic_id: string;
  name: string;
  email: string;
  phone?: string;
  status: 'active' | 'inactive' | 'suspended';
  last_login_at?: string;
}

export interface Clinic {
  id: string;
  name: string;
  logo_url?: string;
  address?: string;
  phone?: string;
  timezone: string;
  header_logo_url?: string;
  brand_colors?: {
    primary: string;
    secondary: string;
  };
  data_residency: 'us' | 'ca';
  retention_days: number;
  subscription_status?: string;
  subscription_tier?: string;
  trial_ends_at?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  max_users?: number;
}

export interface Owner {
  id: string;
  clinic_id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface Patient {
  id: string;
  clinic_id: string;
  owner_id: string;
  name: string;
  species: string;
  breed?: string;
  sex?: string;
  date_of_birth?: string;
  alerts?: string;
  identifiers?: any;
  created_at?: string;
  updated_at?: string;
}

export interface Consult {
  id: string;
  clinic_id: string;
  patient_id: string;
  owner_id: string;
  vet_user_id?: string;
  status?: string;
  started_at: string;
  ended_at?: string;
  duration_sec?: number;
  soap_s?: string;
  soap_o?: string;
  soap_a?: string;
  soap_p?: string;
  history_summary?: string;
  version: number;
  finalized_at?: string;
  finalized_by?: string;
  reason_for_visit?: string;
  patient?: Patient;
}

export interface Task {
  id: string;
  clinic_id: string;
  consult_id?: string;
  title: string;
  due_at?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  source: 'ai' | 'manual';
  assigned_to?: string;
}
