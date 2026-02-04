import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Bell, Volume2 } from 'lucide-react';
import { useNotificationPreferences } from '@/lib/notificationPreferences';
import { toast } from 'sonner';
import { playNotificationSound } from '@/lib/audioAlerts';

export function NotificationSettings() {
  const { preferences, updatePreferences } = useNotificationPreferences();

  const handleTestNotification = () => {
    toast.success('Test Notification', {
      description: 'This is how notifications will appear',
      duration: 5000,
    });
    if (preferences.audioEnabled) {
      playNotificationSound('consult');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Settings
        </CardTitle>
        <CardDescription>
          Configure how you receive updates about consults, tasks, and patients
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="notifications-enabled">Enable Notifications</Label>
            <p className="text-sm text-muted-foreground">
              Show toast notifications for updates
            </p>
          </div>
          <Switch
            id="notifications-enabled"
            checked={preferences.enabled}
            onCheckedChange={(checked) => updatePreferences({ enabled: checked })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="audio-enabled" className="flex items-center gap-2">
              <Volume2 className="h-4 w-4" />
              Audio Alerts
            </Label>
            <p className="text-sm text-muted-foreground">
              Play a sound when notifications appear
            </p>
          </div>
          <Switch
            id="audio-enabled"
            checked={preferences.audioEnabled}
            onCheckedChange={(checked) => updatePreferences({ audioEnabled: checked })}
            disabled={!preferences.enabled}
          />
        </div>

        <div className="border-t pt-4">
          <h4 className="text-sm font-medium mb-4">Notification Types</h4>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="consult-updates">Consult Updates</Label>
                <p className="text-sm text-muted-foreground">
                  SOAP notes completed or updated
                </p>
              </div>
              <Switch
                id="consult-updates"
                checked={preferences.showConsultUpdates}
                onCheckedChange={(checked) => updatePreferences({ showConsultUpdates: checked })}
                disabled={!preferences.enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="task-updates">Task Updates</Label>
                <p className="text-sm text-muted-foreground">
                  Task assignments and completions
                </p>
              </div>
              <Switch
                id="task-updates"
                checked={preferences.showTaskUpdates}
                onCheckedChange={(checked) => updatePreferences({ showTaskUpdates: checked })}
                disabled={!preferences.enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="patient-updates">Patient Updates</Label>
                <p className="text-sm text-muted-foreground">
                  Patient records created or modified
                </p>
              </div>
              <Switch
                id="patient-updates"
                checked={preferences.showPatientUpdates}
                onCheckedChange={(checked) => updatePreferences({ showPatientUpdates: checked })}
                disabled={!preferences.enabled}
              />
            </div>
          </div>
        </div>

        <Button 
          variant="outline" 
          onClick={handleTestNotification}
          disabled={!preferences.enabled}
          className="w-full"
        >
          Test Notification
        </Button>
      </CardContent>
    </Card>
  );
}
