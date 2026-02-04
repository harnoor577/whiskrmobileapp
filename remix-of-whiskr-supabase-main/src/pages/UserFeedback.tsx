import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ThumbsUp, ThumbsDown, Check, X } from "lucide-react";
import { FeedbackSkeleton } from '@/components/feedback/FeedbackSkeleton';
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

export default function UserFeedback() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('pending');

  // Check if user is super admin
  const { data: isSuperAdmin, isLoading: loadingRole } = useQuery({
    queryKey: ['is-super-admin', user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'super_admin')
        .single();
      
      return !error && data;
    },
    enabled: !!user,
  });

  const { data: feedback, isLoading } = useQuery({
    queryKey: ['ai-feedback', activeTab],
    queryFn: async () => {
      const { data: feedback, error } = await supabase
        .from('ai_feedback')
        .select('*, clinics(name)')
        .eq('status', activeTab)
        .order('created_at', { ascending: false });
      
      if (error || !feedback) throw error;

      const feedbackWithProfiles = await Promise.all(
        feedback.map(async (item) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('name, email')
            .eq('user_id', item.user_id)
            .single();
          return { ...item, profiles: profile };
        })
      );
      
      return feedbackWithProfiles;
    },
    enabled: !!isSuperAdmin,
  });

  const updateFeedback = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'denied' }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('ai_feedback')
        .update({
          status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-feedback'] });
      toast({
        title: "Feedback updated",
        description: "The feedback status has been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update feedback.",
        variant: "destructive",
      });
      console.error('Error updating feedback:', error);
    },
  });

  if (loadingRole) {
    return <FeedbackSkeleton />;
  }

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto p-6 max-w-5xl">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Access denied. Super admin privileges required.</p>
            <Button className="mt-4" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">User Feedback</h1>
        <p className="text-muted-foreground">Review and manage AI feedback from users</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="denied">Denied</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {isLoading ? (
            <FeedbackSkeleton />
          ) : feedback?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No {activeTab} feedback</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {feedback?.map((item) => (
                <Card key={item.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex gap-2 items-center">
                          {item.feedback_type === 'positive' ? (
                            <ThumbsUp className="h-4 w-4 text-green-600" />
                          ) : (
                            <ThumbsDown className="h-4 w-4 text-red-600" />
                          )}
                          <Badge variant="outline" className="capitalize">
                            {item.content_type.replace('_', ' ')}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <div><strong>From:</strong> {item.profiles.name} ({item.profiles.email})</div>
                          <div><strong>Clinic:</strong> {item.clinics.name}</div>
                          <div><strong>Date:</strong> {format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}</div>
                        </div>
                      </div>
                      {activeTab === 'pending' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateFeedback.mutate({ id: item.id, status: 'approved' })}
                            disabled={updateFeedback.isPending}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateFeedback.mutate({ id: item.id, status: 'denied' })}
                            disabled={updateFeedback.isPending}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Deny
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {item.feedback_text && (
                      <div>
                        <div className="font-medium text-sm mb-1">User Comment:</div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {item.feedback_text}
                        </p>
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-sm mb-1">AI-Generated Content:</div>
                      <div className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap">
                        {item.content_text}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}