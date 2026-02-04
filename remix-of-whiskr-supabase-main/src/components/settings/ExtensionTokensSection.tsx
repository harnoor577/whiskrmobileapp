import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Key, Trash2, Copy, Check, ExternalLink, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { getCachedData, AccountSettingsCacheData } from "@/hooks/use-prefetch";

interface ExtensionToken {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export function ExtensionTokensSection() {
  const { user } = useAuth();
  const [tokens, setTokens] = useState<ExtensionToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  // Dialog states
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [selectedToken, setSelectedToken] = useState<ExtensionToken | null>(null);

  // New token data
  const [newTokenName, setNewTokenName] = useState("whiskr Extension");
  const [generatedToken, setGeneratedToken] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Check if data was prefetched
    const cached = getCachedData<AccountSettingsCacheData>(`account-settings-${user.id}`);
    if (cached?.tokens && cached.tokens.length > 0) {
      setTokens(cached.tokens as ExtensionToken[]);
      setLoading(false);
      return;
    }
    fetchTokens();
  }, [user]);

  const fetchTokens = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("extension_tokens")
        .select("id, name, created_at, last_used_at, revoked_at")
        .eq("user_id", user.id)
        .is("revoked_at", null) // Only show active tokens
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTokens((data as ExtensionToken[]) || []);
    } catch (error) {
      console.error("Error fetching tokens:", error);
      toast.error("Failed to load API tokens");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateToken = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-extension-token", {
        body: { name: newTokenName },
      });

      if (error) throw error;

      if (data?.token) {
        setGeneratedToken(data.token);
        setShowGenerateDialog(false);
        setShowTokenDialog(true);
        fetchTokens(); // Refresh the list
        toast.success("API token generated successfully");
      }
    } catch (error: any) {
      console.error("Error generating token:", error);
      toast.error("Failed to generate API token");
    } finally {
      setGenerating(false);
    }
  };

  const handleRevokeToken = async () => {
    if (!selectedToken) return;

    setRevoking(selectedToken.id);
    try {
      const { error } = await supabase.functions.invoke("revoke-extension-token", {
        body: { tokenId: selectedToken.id },
      });

      if (error) throw error;

      toast.success(`Token "${selectedToken.name}" has been revoked`);
      setShowRevokeDialog(false);
      setSelectedToken(null);
      fetchTokens(); // Refresh the list
    } catch (error: any) {
      console.error("Error revoking token:", error);
      toast.error("Failed to revoke token");
    } finally {
      setRevoking(null);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedToken);
      setCopied(true);
      toast.success("Token copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy token");
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return format(new Date(dateStr), "MMM d, yyyy h:mm a");
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            whiskr Extension
          </CardTitle>
          <CardDescription>Manage API tokens for the whiskr Chrome Extension integration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg border">
            <p className="text-sm text-muted-foreground">
              API tokens allow the whiskr Chrome Extension to securely access your finalized SOAP notes and auto-fill
              them in your PMS. Each token provides read-only access to your clinic's finalized consults.
            </p>
          </div>

          <Button
            onClick={() => {
              setNewTokenName("");
              setShowGenerateDialog(true);
            }}
            className="w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Generate New Token
          </Button>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tokens.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No active API tokens</p>
              <p className="text-sm">Generate a token to use with the Chrome Extension</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tokens.map((token) => (
                    <TableRow key={token.id}>
                      <TableCell className="font-medium">{token.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(token.created_at)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(token.last_used_at)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedToken(token);
                            setShowRevokeDialog(true);
                          }}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ExternalLink className="h-3 w-3" />
              Chrome Extension installation coming soon
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Generate Token Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate API Token</DialogTitle>
            <DialogDescription>
              Create a new API token for the Chrome Extension. The token will only be shown once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tokenName">Token Name</Label>
              <Input
                id="tokenName"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                placeholder="e.g., EzyVet, Idexx Neo ...."
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">A friendly name to identify this token</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerateToken} disabled={generating || !newTokenName.trim()}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Token"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show Token Dialog */}
      <Dialog
        open={showTokenDialog}
        onOpenChange={(open) => {
          if (!open) {
            setGeneratedToken("");
            setCopied(false);
          }
          setShowTokenDialog(open);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Your API Token</DialogTitle>
            <DialogDescription>Copy this token now. It will not be shown again.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-lg font-mono text-sm break-all">{generatedToken}</div>
            <Button onClick={copyToClipboard} className="w-full" variant="outline">
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </>
              )}
            </Button>
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-sm text-yellow-600 dark:text-yellow-500 font-medium">
                ⚠️ Save this token in a secure location
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                You won't be able to see it again. If lost, generate a new token.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowTokenDialog(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Token Confirmation */}
      <AlertDialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Token</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke "{selectedToken?.name}"? This action cannot be undone. The Chrome
              Extension will no longer be able to access your SOAP notes with this token.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeToken}
              disabled={!!revoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revoking ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Revoking...
                </>
              ) : (
                "Revoke Token"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
