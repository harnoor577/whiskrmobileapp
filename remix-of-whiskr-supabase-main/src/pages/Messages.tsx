import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Send, Users as UsersIcon, Loader2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useSearchParams } from 'react-router-dom';
import { PatientMentionInput, PatientMentionText } from '@/components/ui/patient-mention';
import { MessagesSkeleton } from '@/components/messages/MessagesSkeleton';
interface Message {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  content: string;
  read: boolean;
  created_at: string;
  sender?: {
    name: string;
    email: string;
  };
}

interface UserProfile {
  user_id: string;
  name: string;
  email: string;
  roles: string[];
}

export default function Messages() {
  const { user, clinicId } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  useEffect(() => {
    if (clinicId) {
      loadUsers();
    }
  }, [clinicId]);

  useEffect(() => {
    if (selectedUser) {
      loadMessages();
      markMessagesAsRead();
    }
  }, [selectedUser]);

  // Preselect user from query param ?with=<user_id>
  useEffect(() => {
    const withId = searchParams.get('with');
    if (!withId) return;
    if (selectedUser?.user_id === withId) return;

    const match = users.find(u => u.user_id === withId);
    if (match) {
      setSelectedUser(match);
    }
  }, [searchParams, users, selectedUser]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  // Real-time subscription for new messages
  useEffect(() => {
    if (!clinicId || !user) return;

    const channel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `clinic_id=eq.${clinicId}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          
          // If message is for current conversation, add it
          if (
            (newMsg.sender_id === selectedUser?.user_id && newMsg.recipient_id === user.id) ||
            (newMsg.sender_id === user.id && newMsg.recipient_id === selectedUser?.user_id)
          ) {
            // Fetch sender info
            const { data: senderProfile } = await supabase
              .from('profiles')
              .select('name, email')
              .eq('user_id', newMsg.sender_id)
              .single();

            setMessages(prev => [...prev, { ...newMsg, sender: senderProfile || undefined }]);

            // Mark as read if from other user
            if (newMsg.sender_id !== user.id) {
              await supabase
                .from('messages')
                .update({ read: true })
                .eq('id', newMsg.id);

              // Inform sidebar to refresh unread badge immediately
              window.dispatchEvent(new Event('messages:refresh-unread'));
            }
          }

          // Reload users to update unread counts
          loadUsers();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `clinic_id=eq.${clinicId}`,
        },
        (payload) => {
          const updatedMsg = payload.new as Message;
          
          // Update message read status in current conversation
          if (
            (updatedMsg.sender_id === selectedUser?.user_id && updatedMsg.recipient_id === user.id) ||
            (updatedMsg.sender_id === user.id && updatedMsg.recipient_id === selectedUser?.user_id)
          ) {
            setMessages(prev => 
              prev.map(msg => 
                msg.id === updatedMsg.id ? { ...msg, read: updatedMsg.read } : msg
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clinicId, user, selectedUser]);

  const loadUsers = async () => {
    if (!clinicId) return;

    try {
      // Run profiles, roles, and unread queries in parallel (3 parallel queries)
      const [profilesResult, rolesResult, unreadResult] = await Promise.all([
        // Query 1: Get profiles
        supabase
          .from('profiles')
          .select('user_id, name, email')
          .eq('clinic_id', clinicId)
          .eq('status', 'active')
          .neq('user_id', user?.id || '')
          .order('name'),
        // Query 2: Get all user roles
        supabase
          .from('user_roles')
          .select('user_id, role'),
        // Query 3: Get unread message counts
        supabase
          .from('messages')
          .select('sender_id')
          .eq('clinic_id', clinicId)
          .eq('recipient_id', user?.id || '')
          .eq('read', false)
      ]);

      if (profilesResult.error) throw profilesResult.error;

      // Build roles lookup map
      const rolesByUser = (rolesResult.data || []).reduce((acc, r) => {
        if (!acc[r.user_id]) acc[r.user_id] = [];
        acc[r.user_id].push(r.role);
        return acc;
      }, {} as Record<string, string[]>);

      // Build unread counts map
      const unreadByUser = (unreadResult.data || []).reduce((acc, msg) => {
        acc[msg.sender_id] = (acc[msg.sender_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Combine the data
      const usersWithRoles = (profilesResult.data || []).map((profile) => ({
        user_id: profile.user_id,
        name: profile.name,
        email: profile.email,
        roles: rolesByUser[profile.user_id] || [],
        unreadCount: unreadByUser[profile.user_id] || 0,
      }));

      setUsers(usersWithRoles);
    } catch (error: any) {
      console.error('Error loading users:', error);
      toast.error('Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async () => {
    if (!selectedUser || !user) return;

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('clinic_id', clinicId!)
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${selectedUser.user_id}),and(sender_id.eq.${selectedUser.user_id},recipient_id.eq.${user.id})`)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch sender profiles in one batched query to avoid N+1
      const senderIds = Array.from(new Set((data || []).map((m) => m.sender_id)));
      let profilesMap: Record<string, { name: string; email: string }> = {};
      if (senderIds.length > 0) {
        const { data: senderProfiles } = await supabase
          .from('profiles')
          .select('user_id, name, email')
          .in('user_id', senderIds);
        profilesMap = Object.fromEntries(
          (senderProfiles || []).map((p) => [p.user_id, { name: p.name, email: p.email }])
        );
      }

      const messagesWithSenders = (data || []).map((msg) => ({
        ...msg,
        sender: profilesMap[msg.sender_id],
      }));

      setMessages(messagesWithSenders);
    } catch (error: any) {
      console.error('Error loading messages:', error);
      toast.error('Failed to load messages');
    }
  };

  const markMessagesAsRead = async () => {
    if (!selectedUser || !user) return;

    try {
      await supabase
        .from('messages')
        .update({ read: true })
        .eq('clinic_id', clinicId!)
        .eq('sender_id', selectedUser.user_id)
        .eq('recipient_id', user.id)
        .eq('read', false);

      // Notify other parts of the app (e.g., sidebar) to refresh unread count
      window.dispatchEvent(new Event('messages:refresh-unread'));
      // Optimistically clear unread for this user in the local list
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === selectedUser.user_id ? ({ ...(u as any), unreadCount: 0 } as any) : u
        )
      );
    } catch (error) {
      console.error('Error marking messages as read:', error);
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

      // Get sender profile
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('name, email')
        .eq('user_id', user.id)
        .single();

      // Immediately add to local state
      if (data) {
        setMessages(prev => [...prev, { ...data, sender: senderProfile || undefined }]);
      }

      setNewMessage('');
    } catch (error: any) {
      console.error('Error sending message:', error);
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

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-500/10 text-red-500';
      case 'standard':
        return 'bg-gray-500/10 text-gray-500';
      case 'vet':
        return 'bg-blue-500/10 text-blue-500';
      case 'vet_tech':
        return 'bg-green-500/10 text-green-500';
      case 'receptionist':
        return 'bg-amber-500/10 text-amber-500';
      case 'super_admin':
        return 'bg-purple-500/10 text-purple-500';
      case 'standard':
        return 'bg-amber-500/10 text-amber-500';
      default:
        return 'bg-gray-500/10 text-gray-500';
    }
  };

  if (loading) {
    return <MessagesSkeleton />;
  }

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-6 rounded-lg border border-primary/20">
        <h1 className="text-3xl font-bold text-foreground">Team Messages</h1>
        <p className="text-muted-foreground mt-1">Communicate with your team members in real-time</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Users List */}
        <Card className="lg:col-span-1 flex flex-col shadow-md">
          <div className="p-4 border-b bg-muted/30">
            <h2 className="font-semibold flex items-center gap-2 text-foreground">
              <UsersIcon className="h-5 w-5 text-primary" />
              Team Members
            </h2>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {users.map((userItem) => (
                <button
                  key={userItem.user_id}
                  onClick={() => setSelectedUser(userItem)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left',
                    selectedUser?.user_id === userItem.user_id
                      ? 'bg-primary/10 border border-primary/30 shadow-sm'
                      : 'hover:bg-accent/60'
                  )}
                >
                  <Avatar className="h-10 w-10 border-2 border-primary/20">
                    <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground font-semibold">
                      {getInitials(userItem.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium truncate text-foreground">{userItem.name}</p>
                      {(userItem as any).unreadCount > 0 && (
                        <Badge variant="destructive" className="shrink-0">
                          {(userItem as any).unreadCount}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {userItem.roles.map((role) => {
                        const roleLabel = role === 'vet' ? 'DVM' 
                          : role === 'vet_tech' ? 'Vet Tech'
                          : role === 'receptionist' ? 'Receptionist'
                          : role === 'admin' ? 'Admin'
                          : role === 'super_admin' ? 'Super Admin'
                          : role === 'standard' ? 'Standard'
                          : 'Staff';
                        
                        return (
                          <Badge
                            key={role}
                            variant="outline"
                            className={`text-xs ${getRoleBadgeColor(role)}`}
                          >
                            {roleLabel}
                          </Badge>
                        );
                      })}
                    </div>
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
        </Card>

        {/* Messages Area */}
        <Card className="lg:col-span-2 flex flex-col shadow-md">
          {selectedUser ? (
            <>
              {/* Header */}
              <div className="p-4 border-b bg-gradient-to-r from-primary to-primary/90">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 border-2 border-primary-foreground/30">
                    <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground font-semibold">
                      {getInitials(selectedUser.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-primary-foreground">{selectedUser.name}</p>
                    <p className="text-xs text-primary-foreground/80">{selectedUser.email}</p>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4 bg-muted/20">
                <div className="space-y-4">
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
                            'max-w-[75%] rounded-2xl p-3 shadow-sm',
                            isOwnMessage
                              ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground'
                              : 'bg-card border'
                          )}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">
                            <PatientMentionText text={message.content} isOwnMessage={isOwnMessage} />
                          </p>
                          <div
                            className={cn(
                              'text-xs mt-1 flex items-center gap-2',
                              isOwnMessage
                                ? 'text-primary-foreground/70'
                                : 'text-muted-foreground'
                            )}
                          >
                            <span>
                              {formatDistanceToNow(new Date(message.created_at), {
                                addSuffix: true,
                              })}
                            </span>
                            {isOwnMessage && (
                              <span className="text-xs">
                                {message.read ? '· Read' : '· Delivered'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center py-12">
                      <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-3" />
                      <p className="text-muted-foreground">
                        No messages yet. Start a conversation!
                      </p>
                    </div>
                  )}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>

              {/* Input */}
              <form onSubmit={handleSendMessage} className="p-4 border-t bg-muted/30">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
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
                      className="min-h-[60px] max-h-[150px]"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    disabled={!newMessage.trim() || sending} 
                    className="self-end h-10 px-4 shadow-sm shrink-0"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-muted/10">
              <div className="text-center p-8">
                <MessageSquare className="h-20 w-20 text-muted-foreground/40 mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                  Select a team member to start messaging
                </p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Choose from your team on the left
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
