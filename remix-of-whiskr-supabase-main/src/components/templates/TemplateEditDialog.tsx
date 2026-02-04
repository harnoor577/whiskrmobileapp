import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, GripVertical } from 'lucide-react';
import { UserTemplate, UserTemplateSection } from '@/hooks/use-user-templates';

interface TemplateEditDialogProps {
  template: UserTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, sections: UserTemplateSection[], name: string) => Promise<void>;
}

export function TemplateEditDialog({
  template,
  open,
  onOpenChange,
  onSave,
}: TemplateEditDialogProps) {
  const [sections, setSections] = useState<UserTemplateSection[]>([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (template) {
      setSections([...template.sections]);
      setName(template.name);
    }
  }, [template]);

  const handleToggleSection = (sectionId: string) => {
    setSections(prev =>
      prev.map(s =>
        s.id === sectionId ? { ...s, enabled: !s.enabled } : s
      )
    );
  };

  const handleSave = async () => {
    if (!template) return;
    
    // Ensure at least one section is enabled
    const enabledCount = sections.filter(s => s.enabled).length;
    if (enabledCount === 0) {
      return;
    }

    setSaving(true);
    try {
      await onSave(template.id, sections, name);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = sections.filter(s => s.enabled).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Template</DialogTitle>
          <DialogDescription>
            Customize which sections appear in your reports. Disabled sections won't be generated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Template name"
            />
          </div>

          <div className="space-y-2">
            <Label>Sections ({enabledCount} of {sections.length} enabled)</Label>
            <ScrollArea className="h-[300px] rounded-md border p-4">
              <div className="space-y-3">
                {sections.map((section) => (
                  <div
                    key={section.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30"
                  >
                    <GripVertical className="h-5 w-5 text-muted-foreground mt-0.5 cursor-grab" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{section.label}</span>
                        <Switch
                          checked={section.enabled}
                          onCheckedChange={() => handleToggleSection(section.id)}
                          disabled={section.enabled && enabledCount === 1}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {section.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || enabledCount === 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
