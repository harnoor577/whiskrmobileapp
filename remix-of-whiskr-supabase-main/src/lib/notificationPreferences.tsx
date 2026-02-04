import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface NotificationPreferences {
  enabled: boolean;
  audioEnabled: boolean;
  showConsultUpdates: boolean;
  showTaskUpdates: boolean;
  showPatientUpdates: boolean;
}

interface NotificationPreferencesContextType {
  preferences: NotificationPreferences;
  updatePreferences: (updates: Partial<NotificationPreferences>) => void;
}

const defaultPreferences: NotificationPreferences = {
  enabled: true,
  audioEnabled: false,
  showConsultUpdates: true,
  showTaskUpdates: true,
  showPatientUpdates: true,
};

const NotificationPreferencesContext = createContext<NotificationPreferencesContextType | undefined>(undefined);

export function NotificationPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => {
    const stored = localStorage.getItem('notificationPreferences');
    return stored ? { ...defaultPreferences, ...JSON.parse(stored) } : defaultPreferences;
  });

  useEffect(() => {
    localStorage.setItem('notificationPreferences', JSON.stringify(preferences));
  }, [preferences]);

  const updatePreferences = (updates: Partial<NotificationPreferences>) => {
    setPreferences(prev => ({ ...prev, ...updates }));
  };

  return (
    <NotificationPreferencesContext.Provider value={{ preferences, updatePreferences }}>
      {children}
    </NotificationPreferencesContext.Provider>
  );
}

export function useNotificationPreferences() {
  const context = useContext(NotificationPreferencesContext);
  if (!context) {
    throw new Error('useNotificationPreferences must be used within NotificationPreferencesProvider');
  }
  return context;
}
