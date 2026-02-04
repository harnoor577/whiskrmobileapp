import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';

// Note: consult_usage_notifications table doesn't exist yet
// This hook is disabled until the database migration is run
export function useConsultLimitNotifications() {
  const { clinicId, user } = useAuth();
  
  // For now, return null since the table doesn't exist
  return { pendingNotification: null, sendNotification: { mutate: () => {}, isPending: false } };
}
