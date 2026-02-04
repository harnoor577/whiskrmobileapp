import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Clipboard, Heart, Stethoscope } from 'lucide-react';
import { SystemTemplate } from '@/data/systemTemplates';

interface TemplateViewDialogProps {
  template: SystemTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const typeConfig = {
  soap: {
    icon: Clipboard,
    color: 'bg-blue-500/10 text-blue-600',
  },
  wellness: {
    icon: Heart,
    color: 'bg-emerald-500/10 text-emerald-600',
  },
  procedure: {
    icon: Stethoscope,
    color: 'bg-purple-500/10 text-purple-600',
  },
};

export function TemplateViewDialog({ template, open, onOpenChange }: TemplateViewDialogProps) {
  if (!template) return null;

  const config = typeConfig[template.type];
  const Icon = config.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{template.name}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {template.description}
              </p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-3 mt-4">
            {template.sections.map((section, index) => (
              <div
                key={section.id}
                className="p-3 rounded-lg border bg-muted/30"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {index + 1}
                  </Badge>
                  <h4 className="font-medium text-sm">{section.label}</h4>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 ml-7">
                  {section.description}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
