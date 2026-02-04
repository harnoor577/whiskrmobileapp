import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Search, Mail, Loader2, User, Building2, Clock } from "lucide-react";
import { format } from "date-fns";

interface UserResult {
  user_id: string;
  name: string;
  email: string;
  clinic_name: string;
  last_login_at: string | null;
  status: string | null;
}

export function UserPasswordReset() {
  const [searchEmail, setSearchEmail] = useState("");
  const [searchTriggered, setSearchTriggered] = useState(false);

  const { data: users, isLoading, refetch } = useQuery({
    queryKey: ["admin-user-search", searchEmail],
    queryFn: async () => {
      if (!searchEmail.trim()) return [];
      
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          user_id,
          name,
          email,
          last_login_at,
          status,
          clinics:clinic_id (name)
        `)
        .ilike("email", `%${searchEmail.trim()}%`)
        .limit(10);

      if (error) throw error;

      return (data || []).map((profile: any) => ({
        user_id: profile.user_id,
        name: profile.name,
        email: profile.email,
        clinic_name: profile.clinics?.name || "Unknown Clinic",
        last_login_at: profile.last_login_at,
        status: profile.status,
      })) as UserResult[];
    },
    enabled: searchTriggered && searchEmail.trim().length > 0,
  });

  const sendResetEmail = useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.functions.invoke("send-auth-email", {
        body: {
          email,
          type: "recovery",
          origin: window.location.origin,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, email) => {
      toast.success(`Password reset email sent to ${email}`);
    },
    onError: (error: any) => {
      toast.error(`Failed to send reset email: ${error.message}`);
    },
  });

  const handleSearch = () => {
    setSearchTriggered(true);
    refetch();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          User Password Reset
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Search by email address..."
            value={searchEmail}
            onChange={(e) => setSearchEmail(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
          />
          <Button onClick={handleSearch} disabled={isLoading || !searchEmail.trim()}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span className="ml-2">Search</span>
          </Button>
        </div>

        {searchTriggered && users && users.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No users found matching "{searchEmail}"
          </p>
        )}

        {users && users.length > 0 && (
          <div className="space-y-3">
            {users.map((user) => (
              <div
                key={user.user_id}
                className="flex items-center justify-between p-4 border rounded-lg bg-card"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{user.name}</span>
                    <Badge variant={user.status === "active" ? "default" : "secondary"}>
                      {user.status || "unknown"}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium text-primary">{user.email}</p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {user.clinic_name}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {user.last_login_at
                        ? format(new Date(user.last_login_at), "MMM d, yyyy h:mm a")
                        : "Never logged in"}
                    </span>
                  </div>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={sendResetEmail.isPending}
                    >
                      {sendResetEmail.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Mail className="h-4 w-4 mr-2" />
                      )}
                      Send Reset Email
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Send Password Reset Email?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will send a password reset email to{" "}
                        <strong>{user.email}</strong>. The user will receive a link to
                        create a new password.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => sendResetEmail.mutate(user.email)}
                      >
                        Send Reset Email
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
