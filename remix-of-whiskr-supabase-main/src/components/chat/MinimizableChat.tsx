import { useState, useEffect } from 'react';
import { MessageSquare, Minimize2, Maximize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PatientMentionInput, PatientMentionText } from '@/components/ui/patient-mention';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { toLocalTime } from '@/lib/timezone';

interface MinimizableChatProps {
  unreadCount?: number;
}

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  content: string;
  read: boolean;
  created_at: string;
  sender?: { name: string; email: string };
}

interface UserProfile {
  user_id: string;
  name: string;
  email: string;
  roles: string[];
  unreadCount?: number;
}

export function MinimizableChat({ unreadCount = 0 }: MinimizableChatProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clinicId, isSupportAgent } = useAuth();
  
  const [isOpen, setIsOpen] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Don't show for support agents, on /messages page, or if no unread messages
  const shouldShow = !isSupportAgent && location.pathname !== '/messages' && unreadCount > 0;

  // Load users when opened
  useEffect(() => {
    if (shouldShow && isOpen && clinicId && user) {
      loadUsers();
    }
  }, [shouldShow, isOpen, clinicId, user]);

  // Load messages when user selected
  useEffect(() => {
    if (shouldShow && selectedUser && user) {
      loadMessages();
    }
  }, [shouldShow, selectedUser, user]);
  
  // Early return after all hooks
  if (!shouldShow) {
    return null;
  }

  const loadUsers = async () => {
    if (!clinicId || !user) return;

    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, name, email')
      .eq('clinic_id', clinicId)
      .eq('status', 'active')
      .neq('user_id', user.id)
      .order('name');

    if (profiles) {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', profiles.map(p => p.user_id));

      const usersWithRoles = profiles.map(profile => ({
        user_id: profile.user_id,
        name: profile.name,
        email: profile.email,
        roles: roles?.filter(r => r.user_id === profile.user_id).map(r => r.role) || [],
      }));

      setUsers(usersWithRoles);
    }
  };

  const loadMessages = async () => {
    if (!selectedUser || !user || !clinicId) return;

    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('clinic_id', clinicId)
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${selectedUser.user_id}),and(sender_id.eq.${selectedUser.user_id},recipient_id.eq.${user.id})`)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages(data);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !user || !clinicId) return;

    setSending(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          clinic_id: clinicId,
          sender_id: user.id,
          recipient_id: selectedUser.user_id,
          content: newMessage.trim(),
        })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setMessages(prev => [...prev, data]);
      }
      setNewMessage('');
    } catch (error: any) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleOpen = () => {
    setIsOpen(true);
  };

  const handleMaximize = () => {
    navigate('/messages');
  };

  const handleClose = () => {
    setIsOpen(false);
    setSelectedUser(null);
  };

  if (location.pathname === '/messages') {
    return null;
  }

  return (
    <>
      {/* Floating button (when closed) */}
      {!isOpen && (
        <Button
          onClick={handleOpen}
          className="fixed right-4 md:right-6 h-12 w-12 md:h-14 md:w-14 rounded-full shadow-lg z-50 floating-above-nav lg:bottom-6"
          size="icon"
        >
          <MessageSquare className="h-5 w-5 md:h-6 md:w-6" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 md:h-6 md:min-w-6 rounded-full px-1.5 text-xs font-bold"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      )}

      {/* Popup chat window (when open) */}
      {isOpen && (
        <Card className="fixed right-4 md:right-6 w-[calc(100vw-2rem)] sm:w-[380px] md:w-[420px] h-[70vh] sm:h-[500px] md:h-[600px] shadow-2xl z-50 flex flex-col border-2 border-primary/20 floating-above-nav lg:bottom-6">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-primary to-primary/90 rounded-t-lg">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary-foreground" />
              <h3 className="font-semibold text-primary-foreground">Team Messages</h3>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleMaximize}
                className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
                title="Open in full view"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex overflow-hidden">
            {!selectedUser ? (
              // User list
              <ScrollArea className="flex-1 p-2">
                <div className="space-y-1">
                  {users.map((userItem) => (
                    <button
                      key={userItem.user_id}
                      onClick={() => setSelectedUser(userItem)}
                      className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-accent/60 transition-all text-left"
                    >
                      <Avatar className="h-8 w-8 border border-primary/20">
                        <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground text-xs font-semibold">
                          {getInitials(userItem.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{userItem.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{userItem.email}</p>
                      </div>
                    </button>
                  ))}
                  {users.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No team members found
                    </p>
                  )}
                </div>
              </ScrollArea>
            ) : (
              // Messages view
              <div className="flex-1 flex flex-col">
                {/* Selected user header */}
                <div className="p-3 border-b flex items-center gap-2 bg-muted/30">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedUser(null)}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground text-xs font-semibold">
                      {getInitials(selectedUser.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{selectedUser.name}</p>
                  </div>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-3 bg-muted/10">
                  <div className="space-y-3">
                    {messages.map((message) => {
                      const isOwnMessage = message.sender_id === user?.id;
                      return (
                        <div
                          key={message.id}
                          className={cn(
                            'flex',
                            isOwnMessage ? 'justify-end' : 'justify-start'
                          )}
                        >
                          <div
                            className={cn(
                              'max-w-[80%] rounded-2xl p-2.5 text-sm shadow-sm',
                              isOwnMessage
                                ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground'
                                : 'bg-card border'
                            )}
                          >
                            <PatientMentionText text={message.content} isOwnMessage={isOwnMessage} />
                            <div className={cn(
                              'text-xs mt-1',
                              isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'
                            )}>
                              {formatDistanceToNow(toLocalTime(message.created_at), { addSuffix: true })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>

                {/* Input */}
                <form onSubmit={handleSendMessage} className="p-3 border-t bg-muted/30">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 relative">
                      <PatientMentionInput
                        value={newMessage}
                        onChange={setNewMessage}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage(e as any);
                          }
                        }}
                        disabled={sending}
                        placeholder="Type a message... Use @id to mention patients"
                        className="min-h-[40px] max-h-[120px]"
                      />
                    </div>
                    <Button
                      type="submit"
                      size="icon"
                      disabled={!newMessage.trim() || sending}
                      className="h-10 w-10 shrink-0"
                    >
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </Card>
      )}
    </>
  );
}
