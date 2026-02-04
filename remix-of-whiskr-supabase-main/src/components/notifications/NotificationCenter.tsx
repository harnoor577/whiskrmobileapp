import { useState } from 'react';
import { Bell, Check, X, Stethoscope, ClipboardList, User, CreditCard, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications, type NotificationEvent } from '@/hooks/use-notifications';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function NotificationCenter() {
  const { notifications, unreadCount, markAsRead, clearNotification, clearAllNotifications } = useNotifications();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>('all');

  const handleNotificationClick = (notification: NotificationEvent) => {
    markAsRead(notification.id);
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'consult':
      case 'diagnostic':
        return <Stethoscope className="h-4 w-4" />;
      case 'task':
        return <ClipboardList className="h-4 w-4" />;
      case 'patient':
        return <User className="h-4 w-4" />;
      case 'billing':
        return <CreditCard className="h-4 w-4" />;
      case 'support':
      case 'system':
        return <Bell className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case 'consult':
        return 'text-blue-500';
      case 'diagnostic':
        return 'text-purple-500';
      case 'task':
        return 'text-orange-500';
      case 'patient':
        return 'text-green-500';
      case 'support':
        return 'text-cyan-500';
      case 'system':
        return 'text-amber-500';
      case 'billing':
        return 'text-red-500';
      default:
        return 'text-muted-foreground';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'high':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'medium':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'low':
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const filterNotifications = (type: string) => {
    if (type === 'all') return notifications;
    return notifications.filter(n => n.type === type);
  };

  const sortedNotifications = (notifs: NotificationEvent[]) => {
    return [...notifs].sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      const aPriority = priorityOrder[a.priority] ?? 2;
      const bPriority = priorityOrder[b.priority] ?? 2;
      
      if (aPriority !== bPriority) return aPriority - bPriority;
      return b.timestamp.getTime() - a.timestamp.getTime();
    });
  };

  const getTabCount = (type: string) => {
    if (type === 'all') return notifications.length;
    return notifications.filter(n => n.type === type).length;
  };

  const filteredNotifications = sortedNotifications(filterNotifications(activeTab));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-semibold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[420px] bg-background border-border z-50 p-0">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-lg">Notifications</h3>
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  clearAllNotifications();
                }}
                className="h-auto p-1 text-xs hover:text-destructive"
              >
                Clear All
              </Button>
            )}
          </div>
        </div>
        
        <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0">
            <TabsTrigger value="all" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              All {getTabCount('all') > 0 && `(${getTabCount('all')})`}
            </TabsTrigger>
            <TabsTrigger value="support" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Support {getTabCount('support') > 0 && `(${getTabCount('support')})`}
            </TabsTrigger>
            <TabsTrigger value="consult" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Consults {getTabCount('consult') > 0 && `(${getTabCount('consult')})`}
            </TabsTrigger>
            <TabsTrigger value="billing" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Billing {getTabCount('billing') > 0 && `(${getTabCount('billing')})`}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value={activeTab} className="m-0">
            <ScrollArea className="h-[450px]">
              {filteredNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Bell className="h-12 w-12 text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">No notifications</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">You're all caught up!</p>
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  {filteredNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={cn(
                        "group relative flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                        !notification.read && "bg-accent/50",
                        "hover:bg-accent"
                      )}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className={cn("mt-0.5 flex-shrink-0", getIconColor(notification.type))}>
                        {getIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={cn(
                              "text-sm font-medium",
                              !notification.read && "font-semibold"
                            )}>
                              {notification.title}
                            </p>
                            <Badge variant="outline" className={cn("text-xs px-1.5 py-0", getPriorityColor(notification.priority))}>
                              {notification.priority}
                            </Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              clearNotification(notification.id);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {notification.description}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-500" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
