import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { useNavigate, useLocation } from 'react-router-dom';
import { getConsultEditorPath } from '@/utils/consultNavigation';

export function useAssignmentNotifications() {
  const { user, clinicId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Track shown notifications to prevent duplicates
  const shownNotifications = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !clinicId) return;

    // Listen for new consult assignments
    const assignmentChannel = supabase
      .channel('assignment-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'consult_assignments'
        },
        async (payload: any) => {
          const assignment = payload.new;
          
          // Only show notification if assigned to current user
          if (assignment.user_id !== user.id) return;
          
          // Don't show notification if user assigned to themselves
          if (assignment.assigned_by === user.id) return;
          
          // Skip if we already showed this notification
          if (shownNotifications.current.has(assignment.id)) return;
          shownNotifications.current.add(assignment.id);
          
          // Skip if user is already on this consult page
          if (location.pathname.includes(assignment.consult_id)) return;
          
          // Get consult and patient info with data needed for smart navigation
          const { data: consult } = await supabase
            .from('consults')
            .select('id, status, soap_s, soap_o, soap_a, soap_p, case_notes, patient:patients(name)')
            .eq('id', assignment.consult_id)
            .single();
          
          if (!consult) return;
          
          // Get assigner name
          let assignerName = 'Someone';
          if (assignment.assigned_by) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('name')
              .eq('user_id', assignment.assigned_by)
              .single();
            
            if (profile) {
              assignerName = profile.name;
            }
          }
          
          const patientName = (consult.patient as any)?.name || 'a patient';
          
          // Determine the correct path using smart navigation
          const targetPath = getConsultEditorPath(consult);
          
          // Show toast with clickable link
          toast(
            `${assignerName} assigned you to ${patientName}'s Consultation`,
            {
              duration: 8000,
              action: {
                label: 'View Consult',
                onClick: () => navigate(targetPath)
              },
            }
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(assignmentChannel);
    };
  }, [user, clinicId, navigate, location.pathname]);
}
