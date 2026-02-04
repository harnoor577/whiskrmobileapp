export type UserRole = 'super_admin' | 'admin' | 'user';
export type ClinicRole = 'vet' | 'vet_tech' | 'receptionist' | 'admin';

export interface User {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
  };
}

export interface Session {
  user: User;
  access_token: string;
  refresh_token: string;
}

export interface Patient {
  id: string;
  name: string;
  species: string;
  breed?: string;
  age?: number;
  weight?: number;
  owner_name?: string;
  owner_phone?: string;
  owner_email?: string;
  clinic_id: string;
  created_at: string;
  updated_at?: string;
}

export interface Consult {
  id: string;
  patient_id: string;
  clinic_id: string;
  chief_complaint?: string;
  status: 'draft' | 'in_progress' | 'completed' | 'finalized';
  soap_note?: SOAPNote;
  created_at: string;
  updated_at?: string;
  created_by: string;
}

export interface SOAPNote {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
}

export interface Clinic {
  id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  clinic_id: string;
  name?: string;
  name_prefix?: string;
}
