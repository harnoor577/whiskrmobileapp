import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Calendar, Stethoscope, Shield, Syringe, Heart, Mail } from 'lucide-react';
import { FeedbackButtons } from '@/components/feedback/FeedbackButtons';

interface WellnessFormatDisplayProps {
  message: {
    id: string;
    content: string;
    created_at: string;
  };
  consultId?: string;
}

export function WellnessFormatDisplay({ message, consultId }: WellnessFormatDisplayProps) {
  const content = message.content;

  // Extract sections using markdown headers
  const sections = extractSections(content);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Visit Header */}
      {sections.header && (
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Stethoscope className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Wellness Visit Record</h3>
            </div>
            <div className="space-y-2 text-sm">
              {parseKeyValueLines(sections.header)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pre-Vaccine Checklist */}
      {sections.preVaccineChecklist && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold">Pre-Vaccine Checklist</h3>
            </div>
            {sections.preVaccineChecklist.includes('⚠️') ? (
              <Alert variant="destructive" className="mb-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {extractContraindication(sections.preVaccineChecklist)}
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-1 text-sm">
              {parseChecklistItems(sections.preVaccineChecklist)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vitals & PE */}
      {sections.vitalsAndPE && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Heart className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold">Vitals & Physical Exam</h3>
            </div>
            <div className="space-y-3 text-sm">
              {renderVitalsAndPE(sections.vitalsAndPE)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vaccines Administered */}
      {sections.vaccines && (
        <Card className="bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Syringe className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold">Vaccines Administered</h3>
            </div>
            {sections.vaccines.toLowerCase().includes('no vaccines') ? (
              <p className="text-sm text-muted-foreground italic">{sections.vaccines.trim()}</p>
            ) : (
              <div className="space-y-3">
                {parseVaccines(sections.vaccines)}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Preventive Care Plan */}
      {sections.preventiveCare && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold">Preventive Care Plan</h3>
            </div>
            <div className="prose prose-sm max-w-none">
              {renderMarkdownSection(sections.preventiveCare)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Discharge Instructions */}
      {sections.dischargeInstructions && (
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="pt-6">
            <h3 className="text-base font-semibold mb-3">Discharge Instructions</h3>
            <div className="prose prose-sm max-w-none">
              {renderMarkdownSection(sections.dischargeInstructions)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next Due & Reminders */}
      {sections.nextDue && (
        <Card className="bg-secondary/20">
          <CardContent className="pt-6">
            <h3 className="text-base font-semibold mb-3">Next Due & Reminders</h3>
            <div className="space-y-2 text-sm">
              {parseReminderLines(sections.nextDue)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Client Education */}
      {sections.clientEducation && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-base font-semibold mb-3">Client Education</h3>
            <p className="text-sm leading-relaxed">{sections.clientEducation.replace(/[*_]/g, '').trim()}</p>
          </CardContent>
        </Card>
      )}

      {/* Email to Client (if present) */}
      {sections.emailToClient && (
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <Mail className="h-5 w-5 text-blue-600" />
              <h3 className="text-base font-semibold">Email to Client</h3>
            </div>
            <div className="prose prose-sm max-w-none">
              {renderMarkdownSection(sections.emailToClient)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Signature Block */}
      {sections.signature && (
        <div className="text-sm text-muted-foreground border-t pt-3">
          {renderSignature(sections.signature)}
        </div>
      )}

      {/* Feedback */}
      <FeedbackButtons 
        contentType="soap_note"
        contentText={content}
        consultId={consultId}
      />
    </div>
  );
}

// Helper functions
function extractSections(content: string) {
  const sections: Record<string, string> = {};

  // Match major sections by headers
  const headerRegex = /^##?\s+(.+?)$/gm;
  const matches = [...content.matchAll(headerRegex)];

  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const nextMatch = matches[i + 1];
    const sectionTitle = currentMatch[1].toLowerCase();
    const start = currentMatch.index! + currentMatch[0].length;
    const end = nextMatch ? nextMatch.index : content.length;
    const sectionContent = content.slice(start, end).trim();

    // Map sections to keys
    if (sectionTitle.includes('visit header') || sectionTitle.includes('patient:')) {
      sections.header = sectionContent;
    } else if (sectionTitle.includes('pre-vaccine checklist')) {
      sections.preVaccineChecklist = sectionContent;
    } else if (sectionTitle.includes('vitals') || sectionTitle.includes('physical exam')) {
      sections.vitalsAndPE = sectionContent;
    } else if (sectionTitle.includes('vaccines administered') || sectionTitle.includes('vaccines planned')) {
      sections.vaccines = sectionContent;
    } else if (sectionTitle.includes('preventive care')) {
      sections.preventiveCare = sectionContent;
    } else if (sectionTitle.includes('discharge')) {
      sections.dischargeInstructions = sectionContent;
    } else if (sectionTitle.includes('next due') || sectionTitle.includes('reminders')) {
      sections.nextDue = sectionContent;
    } else if (sectionTitle.includes('client education')) {
      sections.clientEducation = sectionContent;
    } else if (sectionTitle.includes('email')) {
      sections.emailToClient = sectionContent;
    } else if (sectionTitle.includes('signature') || sectionTitle.includes('clinician')) {
      sections.signature = sectionContent;
    }
  }

  return sections;
}

function parseKeyValueLines(text: string) {
  const lines = text.split('\n').filter(l => l.trim());
  return lines.map((line, idx) => {
    const [key, ...valueParts] = line.split(':');
    const value = valueParts.join(':').trim();
    if (key && value) {
      return (
        <div key={idx} className="flex gap-2">
          <span className="font-medium text-foreground">{key.replace(/[*_]/g, '').trim()}:</span>
          <span className="text-muted-foreground">{value.replace(/[*_]/g, '')}</span>
        </div>
      );
    }
    return <div key={idx}>{line.replace(/[*_]/g, '')}</div>;
  });
}

function parseChecklistItems(text: string) {
  const lines = text.split('\n').filter(l => l.trim());
  return lines.map((line, idx) => {
    if (line.includes('✓') || line.includes('✔')) {
      return (
        <div key={idx} className="flex items-center gap-2 text-green-600">
          <span className="text-lg">✓</span>
          <span>{line.replace(/[✓✔]/g, '').trim()}</span>
        </div>
      );
    }
    if (line.includes('⚠️')) return null; // Handled separately in Alert
    return <div key={idx}>{line}</div>;
  });
}

function extractContraindication(text: string) {
  const match = text.match(/⚠️\s*\*\*CONTRAINDICATION.*?\*\*:?\s*(.+)/i);
  return match ? match[1] : 'Contraindication noted';
}

function renderVitalsAndPE(text: string) {
  // Split into vitals and PE sections if both present
  const parts = text.split(/Physical Exam:|PE:/i);
  
  return (
    <>
      <div className="space-y-1">
        <h4 className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-2">Vitals</h4>
        {parseKeyValueLines(parts[0])}
      </div>
      {parts[1] && (
        <div className="space-y-1 mt-4">
          <h4 className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-2">Physical Exam</h4>
          <div className="text-sm">
            {parts[1].split('\n').filter(l => l.trim()).map((line, idx) => (
              <div key={idx} className="py-0.5">{line.replace(/^[-*]\s*/, '').replace(/[*_]/g, '').trim()}</div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function parseVaccines(text: string) {
  const lines = text.split('\n').filter(l => l.trim() && l.includes(','));
  
  return lines.map((line, idx) => {
    // Parse vaccine line: Name (Type), Dose, Route Site, Manufacturer, Lot, Exp, VIS
    const cleanLine = line.replace(/^[-*]\s*/, '').trim();
    const isCoreMatch = cleanLine.match(/\(Core\)/i);
    const isCore = !!isCoreMatch;
    
    return (
      <div key={idx} className="flex items-start gap-2 p-3 bg-background rounded-lg border">
        <Syringe className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{cleanLine.split(',')[0].replace(/\(Core\)/i, '').replace(/\(Non-core\)/i, '').trim()}</span>
            <Badge variant={isCore ? 'default' : 'secondary'} className="text-xs">
              {isCore ? 'Core' : 'Non-core'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{cleanLine.split(',').slice(1).join(',').trim()}</p>
        </div>
      </div>
    );
  });
}

function parseReminderLines(text: string) {
  const lines = text.split('\n').filter(l => l.trim());
  return lines.map((line, idx) => {
    // Clean asterisks and markdown
    const cleanLine = line.replace(/[*_]/g, '').replace(/^[-*]\s*/, '').trim();
    
    if (cleanLine.toLowerCase().includes('due:') || cleanLine.includes('Due:')) {
      return (
        <div key={idx} className="flex items-center gap-2 p-2 bg-secondary/30 rounded">
          <Calendar className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm">{cleanLine}</span>
        </div>
      );
    }
    return <div key={idx} className="text-sm">{cleanLine}</div>;
  });
}

function renderMarkdownSection(text: string) {
  const lines = text.split('\n');
  return lines.map((line, idx) => {
    // Clean all markdown characters
    const cleanLine = line.replace(/[*_]/g, '');
    
    if (line.startsWith('###')) {
      return <h4 key={idx} className="font-semibold text-sm mt-3 mb-1">{cleanLine.replace(/###/g, '').trim()}</h4>;
    }
    if (line.match(/^\*\*.*\*\*$/)) {
      return <p key={idx} className="font-medium text-sm mt-2">{cleanLine}</p>;
    }
    if (line.startsWith('-') || line.startsWith('*')) {
      return <li key={idx} className="ml-4 text-sm">{cleanLine.replace(/^[-*]\s*/, '')}</li>;
    }
    if (cleanLine.trim()) {
      return <p key={idx} className="text-sm leading-relaxed">{cleanLine}</p>;
    }
    return null;
  });
}

function renderSignature(text: string) {
  const lines = text.split('\n').filter(l => l.trim());
  return (
    <div className="text-right space-y-1">
      {lines.map((line, idx) => (
        <div key={idx}>{line.replace(/[*_]/g, '')}</div>
      ))}
    </div>
  );
}