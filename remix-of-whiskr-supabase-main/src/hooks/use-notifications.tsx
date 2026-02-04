import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from '@/components/ui/sonner';
import { useNavigate } from 'react-router-dom';
import { playNotificationSound } from '@/lib/audioAlerts';
import { useNotificationPreferences } from '@/lib/notificationPreferences';

export interface NotificationEvent {
  id: string;
  type: 'consult' | 'task' | 'patient' | 'diagnostic' | 'support' | 'system' | 'billing';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  description: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  consultId?: string;
}

export function useNotifications() {
  const { clinicId, user } = useAuth();
  const navigate = useNavigate();
  const { preferences } = useNotificationPreferences();
  
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Load notifications from database
  const loadNotifications = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error loading notifications:', error);
      return;
    }

    if (data) {
      const parsed = data.map(n => ({
        id: n.id,
        type: n.type as NotificationEvent['type'],
        priority: n.priority as NotificationEvent['priority'],
        title: n.title,
        description: n.description,
        timestamp: new Date(n.created_at),
        read: n.read,
        actionUrl: n.action_url || undefined,
        consultId: n.consult_id || undefined,
      }));
      setNotifications(parsed);
      setUnreadCount(parsed.filter(n => !n.read).length);
    }
  }, [user]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const addNotification = useCallback(async (notification: Omit<NotificationEvent, 'id' | 'timestamp' | 'read'>) => {
    if (!user || !clinicId) return;

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: user.id,
        clinic_id: clinicId,
        type: notification.type,
        priority: notification.priority || 'medium',
        title: notification.title,
        description: notification.description,
        action_url: notification.actionUrl,
        consult_id: notification.consultId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding notification:', error);
      return null;
    }

    if (data) {
      const newNotification: NotificationEvent = {
        id: data.id,
        type: data.type as NotificationEvent['type'],
        priority: data.priority as NotificationEvent['priority'],
        title: data.title,
        description: data.description,
        timestamp: new Date(data.created_at),
        read: false,
        actionUrl: data.action_url || undefined,
        consultId: data.consult_id || undefined,
      };
      
      return newNotification;
    }

    return null;
  }, [user, clinicId]);

  const markAsRead = useCallback(async (id: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .eq('user_id', user.id);

    if (!error) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  }, [user]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);

    if (!error) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    }
  }, [user]);

  const clearNotification = useCallback(async (id: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (!error) {
      setNotifications(prev => {
        const filtered = prev.filter(n => n.id !== id);
        setUnreadCount(filtered.filter(n => !n.read).length);
        return filtered;
      });
    }
  }, [user]);

  const clearAllNotifications = useCallback(async () => {
    if (!user) return;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', user.id);

    if (!error) {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [user]);

  const showToast = useCallback((notification: NotificationEvent) => {
    if (!preferences.enabled) return;

    toast.success(notification.title, {
      description: notification.description,
      action: notification.actionUrl ? {
        label: 'View',
        onClick: () => {
          navigate(notification.actionUrl!);
          markAsRead(notification.id);
        },
      } : undefined,
      duration: 5000,
    });

    if (preferences.audioEnabled) {
      playNotificationSound(notification.type);
    }
  }, [preferences, navigate, markAsRead]);

  // Realtime listener for new notifications
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('user-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          const newNotification: NotificationEvent = {
            id: payload.new.id,
            type: payload.new.type,
            priority: payload.new.priority,
            title: payload.new.title,
            description: payload.new.description,
            timestamp: new Date(payload.new.created_at),
            read: false,
            actionUrl: payload.new.action_url || undefined,
            consultId: payload.new.consult_id || undefined,
          };

          setNotifications(prev => [newNotification, ...prev].slice(0, 50));
          setUnreadCount(prev => prev + 1);
          showToast(newNotification);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, showToast]);

  // Realtime listeners for events that trigger notifications
  useEffect(() => {
    if (!clinicId || !user) return;

    const channel = supabase
      .channel('clinic-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'consult_assignments',
        },
        async (payload: any) => {
          if (payload.new.user_id !== user.id) return;
          if (!preferences.showConsultUpdates) return;

          const { data: consultData } = await supabase
            .from('consults')
            .select('id, patient_id, patients!inner(name)')
            .eq('id', payload.new.consult_id)
            .single();

          if (consultData) {
            const patientName = (consultData.patients as any)?.name || 'Patient';
            await addNotification({
              type: 'consult',
              priority: 'high',
              title: 'Assigned to Consultation',
              description: `You've been assigned to ${patientName}'s consultation`,
              actionUrl: `/consult/${consultData.id}`,
              consultId: consultData.id,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_ticket_replies',
        },
        async (payload: any) => {
          if (!preferences.enabled) return;

          const { data: ticket } = await supabase
            .from('support_tickets')
            .select('id, subject, user_id')
            .eq('id', payload.new.ticket_id)
            .single();

          if (!ticket) return;

          if (ticket.user_id === user.id && payload.new.is_support_reply) {
            await addNotification({
              type: 'support',
              priority: 'high',
              title: 'Support Reply Received',
              description: `New reply on: "${ticket.subject}"`,
              actionUrl: '/support',
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'consults',
          filter: `clinic_id=eq.${clinicId}`,
        },
        async (payload: any) => {
          if (!preferences.showConsultUpdates) return;
          if (payload.new.vet_user_id === user.id) return;

          const statusChanged = payload.old.status !== 'finalized' && payload.new.status === 'finalized';
          const soapUpdated = 
            payload.old.soap_s !== payload.new.soap_s ||
            payload.old.soap_o !== payload.new.soap_o ||
            payload.old.soap_a !== payload.new.soap_a ||
            payload.old.soap_p !== payload.new.soap_p;

          if (statusChanged || soapUpdated) {
            const { data } = await supabase
              .from('consults')
              .select('patient_id, patients!inner(name)')
              .eq('id', payload.new.id)
              .single();

            const patientName = (data?.patients as any)?.name || 'Patient';

            if (statusChanged) {
              await addNotification({
                type: 'consult',
                priority: 'medium',
                title: 'Consult Completed',
                description: `${patientName}'s consultation has been finalized`,
                actionUrl: `/consult/${payload.new.id}`,
                consultId: payload.new.id,
              });
            } else if (soapUpdated) {
              await addNotification({
                type: 'consult',
                priority: 'medium',
                title: 'SOAP Note Updated',
                description: `${patientName}'s SOAP note has been modified`,
                actionUrl: `/consult/${payload.new.id}`,
                consultId: payload.new.id,
              });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'clinics',
          filter: `id=eq.${clinicId}`,
        },
        async (payload: any) => {
          if (!preferences.enabled) return;

          const oldUsed = payload.old.consults_used_this_period || 0;
          const newUsed = payload.new.consults_used_this_period || 0;
          const cap = payload.new.subscription_status === 'trial' 
            ? payload.new.trial_consults_cap 
            : payload.new.consults_cap;
          const isUnlimited = payload.new.subscription_tier === 'enterprise';

          if (newUsed <= oldUsed || isUnlimited) return;

          if (oldUsed < cap * 0.8 && newUsed >= cap * 0.8) {
            await addNotification({
              type: 'billing',
              priority: 'high',
              title: 'Consult Limit Warning',
              description: `You've used ${newUsed} of ${cap} consults (80%). Upgrade to continue.`,
              actionUrl: '/billing',
            });
          }

          if (oldUsed < cap * 0.9 && newUsed >= cap * 0.9) {
            await addNotification({
              type: 'billing',
              priority: 'urgent',
              title: 'Consult Limit Critical',
              description: `You've used ${newUsed} of ${cap} consults (90%). Upgrade now!`,
              actionUrl: '/billing',
            });
          }

          if (oldUsed < cap && newUsed >= cap) {
            await addNotification({
              type: 'billing',
              priority: 'urgent',
              title: 'Consult Limit Reached',
              description: `You've reached your limit of ${cap} consults. Upgrade to continue.`,
              actionUrl: '/billing',
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clinicId, user, preferences, addNotification]);

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAllNotifications,
  };
}
