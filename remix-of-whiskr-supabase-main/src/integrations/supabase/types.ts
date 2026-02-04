export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_feedback: {
        Row: {
          clinic_id: string
          consult_id: string | null
          content_text: string
          content_type: string
          created_at: string
          feedback_text: string | null
          feedback_type: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          clinic_id: string
          consult_id?: string | null
          content_text: string
          content_type: string
          created_at?: string
          feedback_text?: string | null
          feedback_type: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          clinic_id?: string
          consult_id?: string | null
          content_text?: string
          content_type?: string
          created_at?: string
          feedback_text?: string | null
          feedback_type?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "compliance_audit_trail"
            referencedColumns: ["consult_id"]
          },
          {
            foreignKeyName: "ai_feedback_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "consults"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          clinic_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          clinic_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          clinic_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      case_notes: {
        Row: {
          clinic_id: string
          consult_id: string
          created_at: string | null
          created_by: string
          id: string
          note: string
          updated_at: string | null
        }
        Insert: {
          clinic_id: string
          consult_id: string
          created_at?: string | null
          created_by: string
          id?: string
          note: string
          updated_at?: string | null
        }
        Update: {
          clinic_id?: string
          consult_id?: string
          created_at?: string | null
          created_by?: string
          id?: string
          note?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_notes_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_notes_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "compliance_audit_trail"
            referencedColumns: ["consult_id"]
          },
          {
            foreignKeyName: "case_notes_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "consults"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachments: Json | null
          clinic_id: string
          consult_id: string | null
          content: string
          created_at: string
          id: string
          role: string
          sender_name: string | null
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          clinic_id: string
          consult_id?: string | null
          content: string
          created_at?: string
          id?: string
          role: string
          sender_name?: string | null
          user_id: string
        }
        Update: {
          attachments?: Json | null
          clinic_id?: string
          consult_id?: string | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          sender_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "compliance_audit_trail"
            referencedColumns: ["consult_id"]
          },
          {
            foreignKeyName: "chat_messages_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "consults"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_roles: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["clinic_role"]
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["clinic_role"]
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["clinic_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_roles_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          address: string | null
          billing_cycle_start_date: string | null
          brand_colors: Json | null
          clinic_email: string | null
          complimentary_trial_granted: boolean | null
          complimentary_trial_granted_at: string | null
          complimentary_trial_granted_by: string | null
          consults_cap: number | null
          consults_used_this_period: number | null
          created_at: string
          data_residency: string | null
          header_logo_url: string | null
          id: string
          logo_url: string | null
          max_devices: number | null
          max_users: number | null
          name: string
          notification_80_sent: boolean | null
          notification_95_sent: boolean | null
          payment_failed_at: string | null
          phone: string | null
          retention_days: number | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          subscription_tier: string | null
          timezone: string | null
          trial_consults_cap: number | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          billing_cycle_start_date?: string | null
          brand_colors?: Json | null
          clinic_email?: string | null
          complimentary_trial_granted?: boolean | null
          complimentary_trial_granted_at?: string | null
          complimentary_trial_granted_by?: string | null
          consults_cap?: number | null
          consults_used_this_period?: number | null
          created_at?: string
          data_residency?: string | null
          header_logo_url?: string | null
          id?: string
          logo_url?: string | null
          max_devices?: number | null
          max_users?: number | null
          name: string
          notification_80_sent?: boolean | null
          notification_95_sent?: boolean | null
          payment_failed_at?: string | null
          phone?: string | null
          retention_days?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          timezone?: string | null
          trial_consults_cap?: number | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          billing_cycle_start_date?: string | null
          brand_colors?: Json | null
          clinic_email?: string | null
          complimentary_trial_granted?: boolean | null
          complimentary_trial_granted_at?: string | null
          complimentary_trial_granted_by?: string | null
          consults_cap?: number | null
          consults_used_this_period?: number | null
          created_at?: string
          data_residency?: string | null
          header_logo_url?: string | null
          id?: string
          logo_url?: string | null
          max_devices?: number | null
          max_users?: number | null
          name?: string
          notification_80_sent?: boolean | null
          notification_95_sent?: boolean | null
          payment_failed_at?: string | null
          phone?: string | null
          retention_days?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          timezone?: string | null
          trial_consults_cap?: number | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      consult_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          consult_id: string
          id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          consult_id: string
          id?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          consult_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consult_assignments_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "compliance_audit_trail"
            referencedColumns: ["consult_id"]
          },
          {
            foreignKeyName: "consult_assignments_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "consults"
            referencedColumns: ["id"]
          },
        ]
      }
      consult_audio_segments: {
        Row: {
          clinic_id: string
          confidence: number | null
          consult_id: string | null
          created_at: string | null
          duration_seconds: number | null
          id: string
          method: string | null
          sequence_number: number
          transcription: string
          user_id: string
        }
        Insert: {
          clinic_id: string
          confidence?: number | null
          consult_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          method?: string | null
          sequence_number: number
          transcription: string
          user_id: string
        }
        Update: {
          clinic_id?: string
          confidence?: number | null
          consult_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          method?: string | null
          sequence_number?: number
          transcription?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consult_audio_segments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consult_audio_segments_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "compliance_audit_trail"
            referencedColumns: ["consult_id"]
          },
          {
            foreignKeyName: "consult_audio_segments_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "consults"
            referencedColumns: ["id"]
          },
        ]
      }
      consult_transcription_segments: {
        Row: {
          clinic_id: string
          confidence: number | null
          consult_id: string
          created_at: string | null
          end_time: number
          id: string
          sequence_number: number
          speaker: string | null
          speaker_id: string | null
          start_time: number
          text: string
          updated_at: string | null
        }
        Insert: {
          clinic_id: string
          confidence?: number | null
          consult_id: string
          created_at?: string | null
          end_time: number
          id?: string
          sequence_number: number
          speaker?: string | null
          speaker_id?: string | null
          start_time: number
          text: string
          updated_at?: string | null
        }
        Update: {
          clinic_id?: string
          confidence?: number | null
          consult_id?: string
          created_at?: string | null
          end_time?: number
          id?: string
          sequence_number?: number
          speaker?: string | null
          speaker_id?: string | null
          start_time?: number
          text?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consult_transcription_segments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consult_transcription_segments_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "compliance_audit_trail"
            referencedColumns: ["consult_id"]
          },
          {
            foreignKeyName: "consult_transcription_segments_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "consults"
            referencedColumns: ["id"]
          },
        ]
      }
      consult_usage_notifications: {
        Row: {
          clinic_id: string
          consults_at_notification: number
          consults_cap: number
          email_sent_at: string | null
          id: string
          sent_at: string
          threshold_percentage: number
        }
        Insert: {
          clinic_id: string
          consults_at_notification: number
          consults_cap: number
          email_sent_at?: string | null
          id?: string
          sent_at?: string
          threshold_percentage: number
        }
        Update: {
          clinic_id?: string
          consults_at_notification?: number
          consults_cap?: number
          email_sent_at?: string | null
          id?: string
          sent_at?: string
          threshold_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "consult_usage_notifications_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      consults: {
        Row: {
          audio_duration_seconds: number | null
          case_notes: string | null
          client_education: string | null
          clinic_id: string
          clinic_location: string | null
          created_at: string
          discharge_summary: string | null
          duration_sec: number | null
          ended_at: string | null
          final_summary: string | null
          final_treatment_plan: string | null
          finalized_at: string | null
          finalized_by: string | null
          history_summary: string | null
          id: string
          last_analysis_at: string | null
          original_input: string | null
          owner_id: string
          patient_id: string
          plan_locked: boolean | null
          procedure_date_time: string | null
          procedure_indication: string | null
          procedure_name: string | null
          reason_for_visit: string | null
          regen_status: string | null
          soap_a: string | null
          soap_o: string | null
          soap_p: string | null
          soap_s: string | null
          started_at: string
          status: string | null
          timeline: Json | null
          transcription_confidence: number | null
          transcription_method: string | null
          updated_at: string
          version: number | null
          vet_user_id: string | null
          visit_type: string | null
        }
        Insert: {
          audio_duration_seconds?: number | null
          case_notes?: string | null
          client_education?: string | null
          clinic_id: string
          clinic_location?: string | null
          created_at?: string
          discharge_summary?: string | null
          duration_sec?: number | null
          ended_at?: string | null
          final_summary?: string | null
          final_treatment_plan?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          history_summary?: string | null
          id?: string
          last_analysis_at?: string | null
          original_input?: string | null
          owner_id: string
          patient_id: string
          plan_locked?: boolean | null
          procedure_date_time?: string | null
          procedure_indication?: string | null
          procedure_name?: string | null
          reason_for_visit?: string | null
          regen_status?: string | null
          soap_a?: string | null
          soap_o?: string | null
          soap_p?: string | null
          soap_s?: string | null
          started_at?: string
          status?: string | null
          timeline?: Json | null
          transcription_confidence?: number | null
          transcription_method?: string | null
          updated_at?: string
          version?: number | null
          vet_user_id?: string | null
          visit_type?: string | null
        }
        Update: {
          audio_duration_seconds?: number | null
          case_notes?: string | null
          client_education?: string | null
          clinic_id?: string
          clinic_location?: string | null
          created_at?: string
          discharge_summary?: string | null
          duration_sec?: number | null
          ended_at?: string | null
          final_summary?: string | null
          final_treatment_plan?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          history_summary?: string | null
          id?: string
          last_analysis_at?: string | null
          original_input?: string | null
          owner_id?: string
          patient_id?: string
          plan_locked?: boolean | null
          procedure_date_time?: string | null
          procedure_indication?: string | null
          procedure_name?: string | null
          reason_for_visit?: string | null
          regen_status?: string | null
          soap_a?: string | null
          soap_o?: string | null
          soap_p?: string | null
          soap_s?: string | null
          started_at?: string
          status?: string | null
          timeline?: Json | null
          transcription_confidence?: number | null
          transcription_method?: string | null
          updated_at?: string
          version?: number | null
          vet_user_id?: string | null
          visit_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consults_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consults_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consults_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      device_sessions: {
        Row: {
          clinic_id: string
          created_at: string
          device_fingerprint: string
          device_name: string | null
          id: string
          ip_address: string | null
          last_active_at: string
          revoked: boolean
          revoked_at: string | null
          revoked_by: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          device_fingerprint: string
          device_name?: string | null
          id?: string
          ip_address?: string | null
          last_active_at?: string
          revoked?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          device_fingerprint?: string
          device_name?: string | null
          id?: string
          ip_address?: string | null
          last_active_at?: string
          revoked?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_sessions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      extension_tokens: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extension_tokens_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      file_assets: {
        Row: {
          analysis_json: Json | null
          clinic_id: string
          confidence: number | null
          consult_id: string | null
          created_at: string
          created_by: string | null
          document_type: string | null
          id: string
          mime_type: string | null
          modality: string | null
          ocr_text: string | null
          patient_id: string | null
          pdf_path: string | null
          size_bytes: number | null
          storage_key: string
          type: string
        }
        Insert: {
          analysis_json?: Json | null
          clinic_id: string
          confidence?: number | null
          consult_id?: string | null
          created_at?: string
          created_by?: string | null
          document_type?: string | null
          id?: string
          mime_type?: string | null
          modality?: string | null
          ocr_text?: string | null
          patient_id?: string | null
          pdf_path?: string | null
          size_bytes?: number | null
          storage_key: string
          type: string
        }
        Update: {
          analysis_json?: Json | null
          clinic_id?: string
          confidence?: number | null
          consult_id?: string | null
          created_at?: string
          created_by?: string | null
          document_type?: string | null
          id?: string
          mime_type?: string | null
          modality?: string | null
          ocr_text?: string | null
          patient_id?: string | null
          pdf_path?: string | null
          size_bytes?: number | null
          storage_key?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_assets_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_assets_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "compliance_audit_trail"
            referencedColumns: ["consult_id"]
          },
          {
            foreignKeyName: "file_assets_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "consults"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_assets_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync: {
        Row: {
          attempted_at: string
          clinic_id: string
          consult_id: string
          id: string
          response: Json | null
          status: string | null
          target: string
        }
        Insert: {
          attempted_at?: string
          clinic_id: string
          consult_id: string
          id?: string
          response?: Json | null
          status?: string | null
          target: string
        }
        Update: {
          attempted_at?: string
          clinic_id?: string
          consult_id?: string
          id?: string
          response?: Json | null
          status?: string | null
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sync_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "compliance_audit_trail"
            referencedColumns: ["consult_id"]
          },
          {
            foreignKeyName: "integration_sync_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "consults"
            referencedColumns: ["id"]
          },
        ]
      }
      login_history: {
        Row: {
          created_at: string
          device_fingerprint: string | null
          device_name: string | null
          email: string
          failure_reason: string | null
          id: string
          ip_address: string | null
          login_time: string | null
          success: boolean
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_fingerprint?: string | null
          device_name?: string | null
          email: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          login_time?: string | null
          success: boolean
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_fingerprint?: string | null
          device_name?: string | null
          email?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          login_time?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      master_admin_backup_codes: {
        Row: {
          code: string
          created_at: string
          email: string
          id: string
          used: boolean
          used_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          email: string
          id?: string
          used?: boolean
          used_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          email?: string
          id?: string
          used?: boolean
          used_at?: string | null
        }
        Relationships: []
      }
      master_admin_notes: {
        Row: {
          admin_user_id: string
          clinic_id: string
          created_at: string | null
          id: string
          note: string
          updated_at: string | null
        }
        Insert: {
          admin_user_id: string
          clinic_id: string
          created_at?: string | null
          id?: string
          note: string
          updated_at?: string | null
        }
        Update: {
          admin_user_id?: string
          clinic_id?: string
          created_at?: string | null
          id?: string
          note?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "master_admin_notes_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      master_admin_otps: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          otp_code: string
          used: boolean
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          otp_code: string
          used?: boolean
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          otp_code?: string
          used?: boolean
          used_at?: string | null
        }
        Relationships: []
      }
      medication_profile_cache: {
        Row: {
          created_at: string
          drug_name_display: string
          drug_name_normalized: string
          expires_at: string
          id: string
          profile_json: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          drug_name_display: string
          drug_name_normalized: string
          expires_at: string
          id?: string
          profile_json: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          drug_name_display?: string
          drug_name_normalized?: string
          expires_at?: string
          id?: string
          profile_json?: Json
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          clinic_id: string
          content: string
          created_at: string
          id: string
          read: boolean
          recipient_id: string | null
          sender_id: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          content: string
          created_at?: string
          id?: string
          read?: boolean
          recipient_id?: string | null
          sender_id: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          content?: string
          created_at?: string
          id?: string
          read?: boolean
          recipient_id?: string | null
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          clinic_id: string
          consult_id: string | null
          created_at: string
          description: string
          id: string
          priority: string
          read: boolean
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          clinic_id: string
          consult_id?: string | null
          created_at?: string
          description: string
          id?: string
          priority?: string
          read?: boolean
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          clinic_id?: string
          consult_id?: string | null
          created_at?: string
          description?: string
          id?: string
          priority?: string
          read?: boolean
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "compliance_audit_trail"
            referencedColumns: ["consult_id"]
          },
          {
            foreignKeyName: "notifications_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "consults"
            referencedColumns: ["id"]
          },
        ]
      }
      owners: {
        Row: {
          address: string | null
          clinic_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          clinic_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          clinic_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owners_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          age: string | null
          alerts: string | null
          assigned_vet_id: string | null
          breed: string | null
          clinic_id: string
          created_at: string
          date_of_birth: string | null
          id: string
          identifiers: Json | null
          name: string
          owner_id: string
          sex: string | null
          species: string
          updated_at: string
          weight_kg: number | null
          weight_lb: number | null
        }
        Insert: {
          age?: string | null
          alerts?: string | null
          assigned_vet_id?: string | null
          breed?: string | null
          clinic_id: string
          created_at?: string
          date_of_birth?: string | null
          id?: string
          identifiers?: Json | null
          name: string
          owner_id: string
          sex?: string | null
          species: string
          updated_at?: string
          weight_kg?: number | null
          weight_lb?: number | null
        }
        Update: {
          age?: string | null
          alerts?: string | null
          assigned_vet_id?: string | null
          breed?: string | null
          clinic_id?: string
          created_at?: string
          date_of_birth?: string | null
          id?: string
          identifiers?: Json | null
          name?: string
          owner_id?: string
          sex?: string | null
          species?: string
          updated_at?: string
          weight_kg?: number | null
          weight_lb?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          city: string | null
          clinic_id: string
          country: string | null
          created_at: string
          dvm_role: string | null
          email: string
          id: string
          last_login_at: string | null
          mfa_enabled: boolean | null
          name: string
          name_prefix: string | null
          phone: string | null
          practice_types: string[] | null
          school_name: string | null
          state_province: string | null
          status: string | null
          unit_preference: string | null
          updated_at: string
          user_id: string
          user_tags: string[] | null
          user_type: string | null
        }
        Insert: {
          city?: string | null
          clinic_id: string
          country?: string | null
          created_at?: string
          dvm_role?: string | null
          email: string
          id?: string
          last_login_at?: string | null
          mfa_enabled?: boolean | null
          name: string
          name_prefix?: string | null
          phone?: string | null
          practice_types?: string[] | null
          school_name?: string | null
          state_province?: string | null
          status?: string | null
          unit_preference?: string | null
          updated_at?: string
          user_id: string
          user_tags?: string[] | null
          user_type?: string | null
        }
        Update: {
          city?: string | null
          clinic_id?: string
          country?: string | null
          created_at?: string
          dvm_role?: string | null
          email?: string
          id?: string
          last_login_at?: string | null
          mfa_enabled?: boolean | null
          name?: string
          name_prefix?: string | null
          phone?: string | null
          practice_types?: string[] | null
          school_name?: string | null
          state_province?: string | null
          status?: string | null
          unit_preference?: string | null
          updated_at?: string
          user_id?: string
          user_tags?: string[] | null
          user_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          clinic_id: string
          created_at: string | null
          id: string
          subscription: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string | null
          id?: string
          subscription: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string | null
          id?: string
          subscription?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_attempts: {
        Row: {
          action: string
          attempt_count: number
          created_at: string
          id: string
          identifier: string
          locked_until: string | null
          lockout_level: number | null
          lockout_reason: string | null
          updated_at: string
          window_start: string
        }
        Insert: {
          action: string
          attempt_count?: number
          created_at?: string
          id?: string
          identifier: string
          locked_until?: string | null
          lockout_level?: number | null
          lockout_reason?: string | null
          updated_at?: string
          window_start?: string
        }
        Update: {
          action?: string
          attempt_count?: number
          created_at?: string
          id?: string
          identifier?: string
          locked_until?: string | null
          lockout_level?: number | null
          lockout_reason?: string | null
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          inviter_name: string | null
          user_id: string
          uses_count: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          inviter_name?: string | null
          user_id: string
          uses_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          inviter_name?: string | null
          user_id?: string
          uses_count?: number
        }
        Relationships: []
      }
      referrals: {
        Row: {
          became_paying_at: string | null
          credit_amount: number | null
          credit_awarded: boolean
          id: string
          inviter_name: string | null
          referral_code: string
          referred_user_id: string
          referrer_id: string
          signed_up_at: string
        }
        Insert: {
          became_paying_at?: string | null
          credit_amount?: number | null
          credit_awarded?: boolean
          id?: string
          inviter_name?: string | null
          referral_code: string
          referred_user_id: string
          referrer_id: string
          signed_up_at?: string
        }
        Update: {
          became_paying_at?: string | null
          credit_amount?: number | null
          credit_awarded?: boolean
          id?: string
          inviter_name?: string | null
          referral_code?: string
          referred_user_id?: string
          referrer_id?: string
          signed_up_at?: string
        }
        Relationships: []
      }
      reports_generated: {
        Row: {
          clinic_id: string
          consented_at: string | null
          consult_id: string | null
          created_at: string
          device_fingerprint: string | null
          device_name: string | null
          id: string
          input_mode: string | null
          ip_address: string | null
          is_latest: boolean | null
          patient_id: string | null
          patient_name: string | null
          procedure_anesthetic_protocol: string | null
          procedure_client_comm: string | null
          procedure_details: string | null
          procedure_email_to_client: string | null
          procedure_follow_up: string | null
          procedure_indication: string | null
          procedure_medications: string | null
          procedure_name: string | null
          procedure_post_status: string | null
          procedure_pre_assessment: string | null
          procedure_pre_status: string | null
          procedure_summary: string | null
          regenerated_from: string | null
          regeneration_reason: string | null
          report_type: string
          soap_a: string | null
          soap_o: string | null
          soap_p: string | null
          soap_s: string | null
          transcription_length: number | null
          uploaded_files_count: number | null
          user_agent: string | null
          user_email: string | null
          user_id: string
          version_number: number | null
          wellness_client_education: string | null
          wellness_clinician_notes: string | null
          wellness_diet_nutrition: string | null
          wellness_findings: string | null
          wellness_owner_discussion: string | null
          wellness_physical_exam: string | null
          wellness_preventive_care: string | null
          wellness_recommendations: string | null
          wellness_summary: string | null
          wellness_vaccines: string | null
          wellness_visit_header: string | null
          wellness_vitals: string | null
        }
        Insert: {
          clinic_id: string
          consented_at?: string | null
          consult_id?: string | null
          created_at?: string
          device_fingerprint?: string | null
          device_name?: string | null
          id?: string
          input_mode?: string | null
          ip_address?: string | null
          is_latest?: boolean | null
          patient_id?: string | null
          patient_name?: string | null
          procedure_anesthetic_protocol?: string | null
          procedure_client_comm?: string | null
          procedure_details?: string | null
          procedure_email_to_client?: string | null
          procedure_follow_up?: string | null
          procedure_indication?: string | null
          procedure_medications?: string | null
          procedure_name?: string | null
          procedure_post_status?: string | null
          procedure_pre_assessment?: string | null
          procedure_pre_status?: string | null
          procedure_summary?: string | null
          regenerated_from?: string | null
          regeneration_reason?: string | null
          report_type: string
          soap_a?: string | null
          soap_o?: string | null
          soap_p?: string | null
          soap_s?: string | null
          transcription_length?: number | null
          uploaded_files_count?: number | null
          user_agent?: string | null
          user_email?: string | null
          user_id: string
          version_number?: number | null
          wellness_client_education?: string | null
          wellness_clinician_notes?: string | null
          wellness_diet_nutrition?: string | null
          wellness_findings?: string | null
          wellness_owner_discussion?: string | null
          wellness_physical_exam?: string | null
          wellness_preventive_care?: string | null
          wellness_recommendations?: string | null
          wellness_summary?: string | null
          wellness_vaccines?: string | null
          wellness_visit_header?: string | null
          wellness_vitals?: string | null
        }
        Update: {
          clinic_id?: string
          consented_at?: string | null
          consult_id?: string | null
          created_at?: string
          device_fingerprint?: string | null
          device_name?: string | null
          id?: string
          input_mode?: string | null
          ip_address?: string | null
          is_latest?: boolean | null
          patient_id?: string | null
          patient_name?: string | null
          procedure_anesthetic_protocol?: string | null
          procedure_client_comm?: string | null
          procedure_details?: string | null
          procedure_email_to_client?: string | null
          procedure_follow_up?: string | null
          procedure_indication?: string | null
          procedure_medications?: string | null
          procedure_name?: string | null
          procedure_post_status?: string | null
          procedure_pre_assessment?: string | null
          procedure_pre_status?: string | null
          procedure_summary?: string | null
          regenerated_from?: string | null
          regeneration_reason?: string | null
          report_type?: string
          soap_a?: string | null
          soap_o?: string | null
          soap_p?: string | null
          soap_s?: string | null
          transcription_length?: number | null
          uploaded_files_count?: number | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string
          version_number?: number | null
          wellness_client_education?: string | null
          wellness_clinician_notes?: string | null
          wellness_diet_nutrition?: string | null
          wellness_findings?: string | null
          wellness_owner_discussion?: string | null
          wellness_physical_exam?: string | null
          wellness_preventive_care?: string | null
          wellness_recommendations?: string | null
          wellness_summary?: string | null
          wellness_vaccines?: string | null
          wellness_visit_header?: string | null
          wellness_vitals?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_generated_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_generated_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "compliance_audit_trail"
            referencedColumns: ["consult_id"]
          },
          {
            foreignKeyName: "reports_generated_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "consults"
            referencedColumns: ["id"]
          },
        ]
      }
      support_agents: {
        Row: {
          added_by: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          added_by: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      support_ticket_reads: {
        Row: {
          last_read_at: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          ticket_id: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_reads_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_replies: {
        Row: {
          created_at: string
          id: string
          is_internal: boolean
          is_support_reply: boolean | null
          message: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_internal?: boolean
          is_support_reply?: boolean | null
          message: string
          ticket_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_internal?: boolean
          is_support_reply?: boolean | null
          message?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_replies_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string | null
          clinic_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          description: string
          id: string
          payload: Json | null
          priority: string
          refund_status: string | null
          related_consult_id: string | null
          resolved_at: string | null
          status: string
          subject: string
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          clinic_id: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          description: string
          id?: string
          payload?: Json | null
          priority?: string
          refund_status?: string | null
          related_consult_id?: string | null
          resolved_at?: string | null
          status?: string
          subject: string
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          clinic_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          description?: string
          id?: string
          payload?: Json | null
          priority?: string
          refund_status?: string | null
          related_consult_id?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_related_consult_id_fkey"
            columns: ["related_consult_id"]
            isOneToOne: false
            referencedRelation: "compliance_audit_trail"
            referencedColumns: ["consult_id"]
          },
          {
            foreignKeyName: "support_tickets_related_consult_id_fkey"
            columns: ["related_consult_id"]
            isOneToOne: false
            referencedRelation: "consults"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          clinic_id: string
          consult_id: string | null
          created_at: string
          created_by: string | null
          due_at: string | null
          id: string
          source: string | null
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          clinic_id: string
          consult_id?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          source?: string | null
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          clinic_id?: string
          consult_id?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          source?: string | null
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "compliance_audit_trail"
            referencedColumns: ["consult_id"]
          },
          {
            foreignKeyName: "tasks_consult_id_fkey"
            columns: ["consult_id"]
            isOneToOne: false
            referencedRelation: "consults"
            referencedColumns: ["id"]
          },
        ]
      }
      user_credits: {
        Row: {
          amount: number
          created_at: string
          id: string
          reason: string
          referral_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reason: string
          referral_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reason?: string
          referral_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_credits_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invitations: {
        Row: {
          accepted_at: string | null
          clinic_id: string
          clinic_role: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_at: string
          invited_by: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          clinic_id: string
          clinic_role?: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by: string
          role?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          clinic_id?: string
          clinic_role?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_invitations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_templates: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sections: Json
          system_template_id: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sections?: Json
          system_template_id: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sections?: Json
          system_template_id?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_templates_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      compliance_audit_trail: {
        Row: {
          consult_id: string | null
          details: Json | null
          entity_type: string | null
          event_at: string | null
          event_type: string | null
          id: string | null
          ip_address: string | null
          patient_name: string | null
          user_email: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_consults_to_cap: {
        Args: { additional_consults: number; clinic_uuid: string }
        Returns: undefined
      }
      add_trial_days: {
        Args: { clinic_uuid: string; days_to_add: number }
        Returns: undefined
      }
      can_add_user: { Args: { clinic_uuid: string }; Returns: boolean }
      can_edit_clinical_data: {
        Args: { _clinic_id: string; _user_id: string }
        Returns: boolean
      }
      check_requires_mfa: { Args: { p_email: string }; Returns: boolean }
      cleanup_expired_medication_cache: { Args: never; Returns: undefined }
      cleanup_expired_otps: { Args: never; Returns: undefined }
      cleanup_rate_limits: { Args: never; Returns: undefined }
      cleanup_stale_devices: { Args: never; Returns: undefined }
      count_active_devices: { Args: { _clinic_id: string }; Returns: number }
      count_user_active_devices: { Args: { _user_id: string }; Returns: number }
      delete_consult_cascade: {
        Args: { _clinic_id: string; _consult_id: string }
        Returns: undefined
      }
      delete_patient_cascade: {
        Args: { _clinic_id: string; _patient_id: string }
        Returns: undefined
      }
      find_duplicate_patient_ids: {
        Args: { clinic_uuid?: string }
        Returns: {
          clinic_id: string
          duplicate_count: number
          patient_id: string
          patient_ids: string[]
        }[]
      }
      generate_master_admin_backup_codes: {
        Args: { p_email: string }
        Returns: {
          code: string
        }[]
      }
      get_current_user_email: { Args: never; Returns: string }
      get_patient_identifier: { Args: { identifiers: Json }; Returns: string }
      get_user_clinic_id: { Args: never; Returns: string }
      get_user_total_credits: { Args: { user_uuid: string }; Returns: number }
      grant_complimentary_trial: {
        Args: { clinic_uuid: string; trial_days?: number }
        Returns: undefined
      }
      grant_super_admin_to_email: {
        Args: { email_address: string }
        Returns: undefined
      }
      has_clinic_role: {
        Args: {
          _clinic_id: string
          _role: Database["public"]["Enums"]["clinic_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_reached_consult_cap: {
        Args: { clinic_uuid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_trial_expired: { Args: { clinic_uuid: string }; Returns: boolean }
      unlock_master_admin_account: {
        Args: { p_email: string }
        Returns: undefined
      }
      update_consult_history_metadata: {
        Args: {
          p_consult_id: string
          p_device_fingerprint: string
          p_device_name: string
          p_ip_address: string
          p_user_agent: string
        }
        Returns: undefined
      }
      verify_master_admin_backup_code: {
        Args: { p_code: string; p_email: string }
        Returns: boolean
      }
      verify_master_admin_otp: {
        Args: { p_email: string; p_otp: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "standard" | "super_admin"
      clinic_role: "vet" | "vet_tech" | "receptionist"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "standard", "super_admin"],
      clinic_role: ["vet", "vet_tech", "receptionist"],
    },
  },
} as const
