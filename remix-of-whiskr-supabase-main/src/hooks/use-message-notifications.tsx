import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export function useMessageNotifications() {
  const { user, clinicId } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || !clinicId) return;

    // Listen for new chat messages (AI/consult chat)
    const messageChannel = supabase
      .channel('chat-message-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `clinic_id=eq.${clinicId}`
        },
        async (payload: any) => {
          const newMessage = payload.new;
          
          // Don't show notification for own messages
          if (newMessage.user_id === user.id) return;
          
          // Calculate duration based on message length (5-10 seconds)
          const messageLengthFactor = Math.min((newMessage.content?.length || 0) / 100, 5);
          const duration = 5000 + (messageLengthFactor * 1000);
          
          // Get sender name
          const senderName = newMessage.sender_name || 'Someone';
          
          // Get patient info if available
          let patientName = '';
          if (newMessage.consult_id) {
            const { data: consult } = await supabase
              .from('consults')
              .select('patient_id, patients(name)')
              .eq('id', newMessage.consult_id)
              .single();
            
            if (consult?.patients) {
              patientName = ` for ${(consult.patients as any).name}`;
            }
          }
          
          // Show toast with clickable link
          toast(
            `${senderName} sent a message${patientName}`,
            {
              description: (newMessage.content || '').substring(0, 100) + ((newMessage.content || '').length > 100 ? '...' : ''),
              duration,
              action: newMessage.consult_id ? {
                label: 'View',
                onClick: () => navigate(`/consults/${newMessage.consult_id}`)
              } : undefined,
            }
          );
        }
      )
      .subscribe();

    // Listen for direct team messages (/messages)
    const teamMessageChannel = supabase
      .channel('team-message-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `clinic_id=eq.${clinicId}`
        },
        async (payload: any) => {
          const msg = payload.new;
          // Only notify recipient and ignore own messages
          if (msg.recipient_id !== user.id || msg.sender_id === user.id) return;

          // Duration based on message length
          const messageLengthFactor = Math.min((msg.content?.length || 0) / 100, 5);
          const duration = 5000 + (messageLengthFactor * 1000);

          // Fetch sender name
          const { data: profile } = await supabase
            .from('profiles')
            .select('name')
            .eq('user_id', msg.sender_id)
            .single();

          const senderName = profile?.name || 'Someone';

          toast(`${senderName} sent you a message`, {
            description: (msg.content || '').substring(0, 100) + ((msg.content || '').length > 100 ? '...' : ''),
            duration,
            action: {
              label: 'Open',
              onClick: () => navigate(`/messages?with=${msg.sender_id}`)
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(teamMessageChannel);
    };
  }, [user, clinicId, navigate]);
}
