import { supabase } from '@/integrations/supabase/client';
import { getClientIP, getDeviceFingerprint, getDeviceName } from '@/lib/deviceFingerprint';

// Type definitions for audit events
export type AuditAction = 
  | 'report_generation_consent'
  | 'consult_created'
  | 'consult_finalized'
  | 'consult_deleted'
  | 'patient_created'
  | 'patient_deleted'
  | 'login'
  | 'logout';

export type AuditEntityType = 'consult' | 'patient' | 'clinic' | 'user';

interface AuditEventParams {
  clinicId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  details?: Record<string, any>;
}

interface ReportConsentParams {
  clinicId: string;
  consultId: string;
  reportType: 'soap' | 'wellness' | 'procedure';
  patientId?: string;
  patientName?: string;
  inputMode?: string;
  transcriptionLength?: number;
  uploadedFilesCount?: number;
}

interface ReportGeneratedParams {
  clinicId: string;
  consultId: string;
  reportType: 'soap' | 'wellness' | 'procedure';
  patientId?: string;
  patientName?: string;
  inputMode?: string;
  transcriptionLength?: number;
  uploadedFilesCount?: number;
  // Regeneration tracking
  regenerationReason?: string;
  regeneratedFrom?: string;
  // Report content for versioning
  soapData?: { subjective?: string; objective?: string; assessment?: string; plan?: string };
  wellnessData?: Record<string, string>;
  procedureData?: Record<string, string>;
}

// Generic audit event logger
export const logAuditEvent = async (params: AuditEventParams): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('[AUDIT] No user found, skipping audit log');
      return;
    }

    const [ipAddress, deviceFingerprint] = await Promise.all([
      getClientIP(),
      getDeviceFingerprint()
    ]);
    const deviceName = getDeviceName();
    const userAgent = navigator.userAgent;

    await supabase.from('audit_events').insert({
      clinic_id: params.clinicId,
      user_id: user.id,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      ip_address: ipAddress,
      user_agent: userAgent,
      details: {
        ...params.details,
        device_fingerprint: deviceFingerprint,
        device_name: deviceName,
        user_email: user.email,
        logged_at: new Date().toISOString()
      }
    });

    console.log('[AUDIT] Event logged:', params.action, params.entityId);
  } catch (error) {
    console.error('[AUDIT] Failed to log event:', error);
    // Don't throw - audit failures shouldn't block user actions
  }
};

// Specific function for report generation consent (legacy - uses audit_events)
export const logReportGenerationConsent = async (params: ReportConsentParams): Promise<void> => {
  await logAuditEvent({
    clinicId: params.clinicId,
    action: 'report_generation_consent',
    entityType: 'consult',
    entityId: params.consultId,
    details: {
      report_type: params.reportType,
      consented_at: new Date().toISOString(),
      patient_id: params.patientId,
      patient_name: params.patientName,
      input_mode: params.inputMode,
      transcription_length: params.transcriptionLength || 0,
      uploaded_files_count: params.uploadedFilesCount || 0
    }
  });
};

// New function for logging to reports_generated table
export const logReportGenerated = async (params: ReportGeneratedParams): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('[REPORT_LOG] No user found, skipping report log');
      return;
    }

    const [ipAddress, deviceFingerprint] = await Promise.all([
      getClientIP(),
      getDeviceFingerprint()
    ]);
    const deviceName = getDeviceName();
    const userAgent = navigator.userAgent;

    // Build the insert payload
    const insertPayload: Record<string, unknown> = {
      clinic_id: params.clinicId,
      user_id: user.id,
      consult_id: params.consultId,
      patient_id: params.patientId || null,
      report_type: params.reportType,
      consented_at: new Date().toISOString(),
      ip_address: ipAddress,
      device_fingerprint: deviceFingerprint,
      device_name: deviceName,
      user_agent: userAgent,
      user_email: user.email,
      patient_name: params.patientName || null,
      input_mode: params.inputMode || null,
      transcription_length: params.transcriptionLength || 0,
      uploaded_files_count: params.uploadedFilesCount || 0,
      // Regeneration tracking
      regeneration_reason: params.regenerationReason || null,
      regenerated_from: params.regeneratedFrom || null,
    };

    // Add SOAP data if provided (using correct DB column names: soap_s, soap_o, soap_a, soap_p)
    if (params.soapData) {
      insertPayload.soap_s = params.soapData.subjective || null;
      insertPayload.soap_o = params.soapData.objective || null;
      insertPayload.soap_a = params.soapData.assessment || null;
      insertPayload.soap_p = params.soapData.plan || null;
    }

    // Add wellness data if provided
    if (params.wellnessData) {
      insertPayload.wellness_visit_header = params.wellnessData.visitHeader || null;
      insertPayload.wellness_vitals = params.wellnessData.vitals || null;
      insertPayload.wellness_physical_exam = params.wellnessData.physicalExam || null;
      insertPayload.wellness_vaccines = params.wellnessData.vaccines || null;
      insertPayload.wellness_preventive_care = params.wellnessData.preventiveCare || null;
      insertPayload.wellness_diet_nutrition = params.wellnessData.dietNutrition || null;
      insertPayload.wellness_recommendations = params.wellnessData.recommendations || null;
      insertPayload.wellness_client_education = params.wellnessData.clientEducation || null;
      insertPayload.wellness_clinician_notes = params.wellnessData.clinicianNotes || null;
      insertPayload.wellness_owner_discussion = params.wellnessData.ownerDiscussion || null;
    }

    // Add procedure data if provided
    if (params.procedureData) {
      insertPayload.procedure_summary = params.procedureData.procedureSummary || null;
      insertPayload.procedure_pre_assessment = params.procedureData.preProcedureAssessment || null;
      insertPayload.procedure_anesthetic_protocol = params.procedureData.anestheticProtocol || null;
      insertPayload.procedure_details = params.procedureData.procedureDetails || null;
      insertPayload.procedure_medications = params.procedureData.medicationsAdministered || null;
      insertPayload.procedure_post_status = params.procedureData.postProcedureStatus || null;
      insertPayload.procedure_follow_up = params.procedureData.followUpInstructions || null;
      insertPayload.procedure_client_comm = params.procedureData.clientCommunication || null;
      insertPayload.procedure_email_to_client = params.procedureData.emailToClient || null;
    }

    await supabase.from('reports_generated').insert(insertPayload as any);

    console.log('[REPORT_LOG] Report generation logged:', params.reportType, params.consultId);
  } catch (error) {
    console.error('[REPORT_LOG] Failed to log report generation:', error);
    // Don't throw - logging failures shouldn't block user actions
  }
};

// Update consult_history metadata with client-side device information
// This fills in IP/device data that server-side triggers can't capture
export const updateConsultHistoryMetadata = async (consultId: string): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('[AUDIT] No user found, skipping consult history metadata update');
      return;
    }

    const [ipAddress, deviceFingerprint] = await Promise.all([
      getClientIP(),
      getDeviceFingerprint()
    ]);
    const deviceName = getDeviceName();
    const userAgent = navigator.userAgent;

    // Call the RPC function to update the most recent snapshot
    const { error } = await supabase.rpc('update_consult_history_metadata', {
      p_consult_id: consultId,
      p_ip_address: ipAddress,
      p_device_fingerprint: deviceFingerprint,
      p_device_name: deviceName,
      p_user_agent: userAgent
    });

    if (error) {
      console.error('[AUDIT] Failed to update consult history metadata:', error);
    } else {
      console.log('[AUDIT] Consult history metadata updated for:', consultId);
    }
  } catch (error) {
    console.error('[AUDIT] Error updating consult history metadata:', error);
    // Don't throw - audit failures shouldn't block user actions
  }
};
