import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Download, AlertTriangle, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { copyToClipboard, isIOS } from '@/utils/clipboard';
import { CopyFallbackDialog } from '@/components/ui/CopyFallbackDialog';
import { useIsMobile } from '@/hooks/use-mobile';

interface BackupCodesDisplayProps {
  codes: string[];
  onClose: () => void;
}

export function BackupCodesDisplay({ codes, onClose }: BackupCodesDisplayProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyDialogText, setCopyDialogText] = useState("");
  const [copyDialogTitle, setCopyDialogTitle] = useState("");

  const copyCode = async (code: string, index: number) => {
    const success = await copyToClipboard(code);
    if (success) {
      setCopiedIndex(index);
      toast.success('Code copied to clipboard');
      setTimeout(() => setCopiedIndex(null), 2000);
    } else {
      if (isMobile || isIOS()) {
        setCopyDialogText(code);
        setCopyDialogTitle("Copy Backup Code");
        setShowCopyDialog(true);
      } else {
        toast.error('Failed to copy code');
      }
    }
  };

  const downloadCodes = () => {
    const content = `WHISKR - MASTER ADMIN BACKUP CODES
Generated: ${new Date().toLocaleString()}

IMPORTANT: Store these codes in a secure location. Each code can only be used once.

${codes.map((code, i) => `${i + 1}. ${code}`).join('\n')}

---
These codes bypass email verification for emergency access only.
If you lose access to your email, use one of these codes to log in.
After using a code, generate new ones immediately.
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `growdvm-ai-backup-codes-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Backup codes downloaded');
  };

  const printCodes = () => {
    const content = `
      <html>
        <head>
          <title>GrowDVM AI - Backup Codes</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
            }
            h1 { color: #1E40AF; }
            .warning {
              background: #FEF2F2;
              border-left: 4px solid #EF4444;
              padding: 15px;
              margin: 20px 0;
            }
            .codes {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 10px;
              margin: 20px 0;
            }
            .code {
              background: #F3F4F6;
              padding: 15px;
              border-radius: 8px;
              font-family: monospace;
              font-size: 16px;
              font-weight: bold;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 2px solid #E5E7EB;
              font-size: 12px;
              color: #6B7280;
            }
          </style>
        </head>
        <body>
          <h1>GrowDVM AI - Master Admin Backup Codes</h1>
          <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          
          <div class="warning">
            <strong>⚠️ IMPORTANT SECURITY INFORMATION</strong>
            <ul>
              <li>Store these codes in a secure physical location</li>
              <li>Each code can only be used once</li>
              <li>These codes bypass email verification</li>
              <li>Generate new codes after using one</li>
            </ul>
          </div>

          <h2>Your Backup Codes:</h2>
          <div class="codes">
            ${codes.map((code, i) => `<div class="code">${i + 1}. ${code}</div>`).join('')}
          </div>

          <div class="footer">
            <p>GrowDVM — Secure Veterinary Practice Management</p>
            <p>For support, contact: support@whiskr.ai</p>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(content);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <div className="p-2 rounded-full bg-blue-100">
            <Shield className="h-5 w-5 text-blue-600" />
          </div>
          <CardTitle>Your Backup Codes</CardTitle>
        </div>
        <CardDescription>
          Save these 10 backup codes in a secure location. Each can be used once for emergency access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Critical:</strong> These codes are only shown once. Download or print them now. If you lose these codes and your email access, you will be locked out.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-2 gap-3">
          {codes.map((code, index) => (
            <div
              key={index}
              className="relative group bg-muted p-3 rounded-lg font-mono text-sm font-bold flex items-center justify-between hover:bg-muted/80 transition-colors"
            >
              <span className="text-muted-foreground mr-2">{index + 1}.</span>
              <span className="flex-1">{code}</span>
              <Button
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => copyCode(code, index)}
              >
                {copiedIndex === index ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button onClick={downloadCodes} variant="outline" className="flex-1">
            <Download className="h-4 w-4 mr-2" />
            Download as Text
          </Button>
          <Button onClick={printCodes} variant="outline" className="flex-1">
            Print Codes
          </Button>
        </div>

        <Alert>
          <AlertDescription className="text-sm">
            <strong>Best Practices:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Print and store in a secure physical location (safe, locked drawer)</li>
              <li>Never store in plaintext on your computer or cloud storage</li>
              <li>Each code works only once - cross them off as you use them</li>
              <li>Generate new codes after using 2 or more</li>
            </ul>
          </AlertDescription>
        </Alert>

        <Button onClick={onClose} className="w-full">
          I've Saved My Backup Codes
        </Button>
      </CardContent>

      {/* Copy Fallback Dialog for Mobile */}
      <CopyFallbackDialog
        open={showCopyDialog}
        onOpenChange={setShowCopyDialog}
        title={copyDialogTitle}
        text={copyDialogText}
      />
    </Card>
  );
}
