import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

/**
 * Hook to monitor consults and send notifications when diagnostics are needed
 * Checks for specific indicators like file_assets being uploaded or notes mentioning diagnostics
 */
export function useDiagnosticNotifications() {
  const { clinicId } = useAuth();
  const navigate = useNavigate();

  const checkForDiagnosticNeeds = useCallback(async (consultId: string) => {
    if (!clinicId) return;

    try {
      // Get consult details
      const { data: consult, error: consultError } = await supabase
        .from('consults')
        .select('id, patient_id, soap_a, soap_p, status, patients!inner(name)')
        .eq('id', consultId)
        .single();

      if (consultError || !consult) return;

      // Check if consult is still open
      if (consult.status === 'finalized') return;

      // Check for diagnostic indicators - more specific keywords
      const soapContent = `${consult.soap_a || ''} ${consult.soap_p || ''}`.toLowerCase();
      const needsDiagnostics = 
        soapContent.includes('x-ray') ||
        soapContent.includes('radiograph') ||
        soapContent.includes('blood work') ||
        soapContent.includes('cbc') ||
        soapContent.includes('chemistry panel') ||
        soapContent.includes('ultrasound') ||
        soapContent.includes('urinalysis') ||
        soapContent.includes('fecal') ||
        (soapContent.includes('pending') && soapContent.includes('result')) ||
        (soapContent.includes('await') && soapContent.includes('result')) ||
        (soapContent.includes('diagnostic') && (soapContent.includes('pending') || soapContent.includes('due')));

      if (needsDiagnostics) {
        // Determine diagnostic type from content
        let diagnosticType = 'Diagnostic Results';
        
        if (soapContent.includes('x-ray') || soapContent.includes('radiograph')) {
          diagnosticType = 'X-Ray Report';
        } else if (soapContent.includes('cbc')) {
          diagnosticType = 'CBC Bloodwork Report';
        } else if (soapContent.includes('chemistry') || soapContent.includes('blood work')) {
          diagnosticType = 'Blood Work Report';
        } else if (soapContent.includes('ultrasound') || soapContent.includes('echo')) {
          diagnosticType = 'Ultrasound Report';
        } else if (soapContent.includes('urinalysis') || soapContent.includes('urine')) {
          diagnosticType = 'Urinalysis Report';
        } else if (soapContent.includes('fecal')) {
          diagnosticType = 'Fecal Test Report';
        }

        // Send notification via edge function
        const { error } = await supabase.functions.invoke('notify-diagnostics-needed', {
          body: {
            consultId: consult.id,
            clinicId,
            patientName: (consult.patients as any).name,
            diagnosticType
          }
        });

        if (error) {
          console.error('Error sending diagnostic notification:', error);
        } else {
          console.log('Diagnostic notification sent for consult:', consultId);
        }
      }
    } catch (error) {
      console.error('Error checking for diagnostic needs:', error);
    }
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId) return;

    // Subscribe to consult updates
    const channel = supabase
      .channel('diagnostic-checks')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'consults',
          filter: `clinic_id=eq.${clinicId}`
        },
        (payload) => {
          const newConsult = payload.new;
          
          // Check if SOAP Assessment or Plan was updated
          if (newConsult.soap_a || newConsult.soap_p) {
            checkForDiagnosticNeeds(newConsult.id);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'file_assets',
          filter: `clinic_id=eq.${clinicId}`
        },
        (payload) => {
          const newFile = payload.new;
          
          // If a diagnostic file was uploaded, check the associated consult
          if (newFile.consult_id && newFile.type === 'diagnostic') {
            checkForDiagnosticNeeds(newFile.consult_id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clinicId, checkForDiagnosticNeeds]);

  return { checkForDiagnosticNeeds };
}