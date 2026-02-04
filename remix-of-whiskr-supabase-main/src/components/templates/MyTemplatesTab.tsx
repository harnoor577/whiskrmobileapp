import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clipboard, Heart, Stethoscope, Pencil, RotateCcw, Check, Loader2 } from 'lucide-react';
import { UserTemplate, UserTemplateSection, useUserTemplates } from '@/hooks/use-user-templates';
import { TemplateEditDialog } from './TemplateEditDialog';
import { TemplatesSkeleton } from './TemplatesSkeleton';

const typeConfig = {
  soap: {
    icon: Clipboard,
    color: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    badgeColor: 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20',
  },
  wellness: {
    icon: Heart,
    color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    badgeColor: 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20',
  },
  procedure: {
    icon: Stethoscope,
    color: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
    badgeColor: 'bg-purple-500/10 text-purple-600 hover:bg-purple-500/20',
  },
};

export function MyTemplatesTab() {
  const {
    userTemplates,
    isLoading,
    initializeTemplates,
    updateTemplate,
    setActiveTemplate,
    resetTemplate,
  } = useUserTemplates();

  const [editingTemplate, setEditingTemplate] = useState<UserTemplate | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Auto-initialize templates on first load if none exist
  useEffect(() => {
    if (!isLoading && userTemplates.length === 0 && !initialized) {
      setInitialized(true);
      initializeTemplates.mutate();
    }
  }, [isLoading, userTemplates.length, initialized, initializeTemplates]);

  const handleSaveTemplate = async (id: string, sections: UserTemplateSection[], name: string) => {
    await updateTemplate.mutateAsync({ id, sections, name });
  };

  if (isLoading || initializeTemplates.isPending) {
    return (
      <div className="py-12">
        <TemplatesSkeleton />
      </div>
    );
  }

  if (userTemplates.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No templates found. Initializing...</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {userTemplates.map((template) => {
          const config = typeConfig[template.type];
          const Icon = config.icon;
          const enabledSections = template.sections.filter(s => s.enabled).length;

          return (
            <Card key={template.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className={`p-2.5 rounded-lg border ${config.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-2">
                    {template.is_active && (
                      <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
                        <Check className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    )}
                    <Badge variant="outline" className={config.badgeColor}>
                      {template.type.toUpperCase()}
                    </Badge>
                  </div>
                </div>
                <h3 className="font-semibold text-lg mt-3">{template.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {enabledSections} of {template.sections.length} sections enabled
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingTemplate(template)}
                  >
                    <Pencil className="h-4 w-4 mr-1.5" />
                    Edit
                  </Button>
                  {!template.is_active && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveTemplate.mutate({ id: template.id, type: template.type })}
                      disabled={setActiveTemplate.isPending}
                    >
                      {setActiveTemplate.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : (
                        <Check className="h-4 w-4 mr-1.5" />
                      )}
                      Set Active
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => resetTemplate.mutate(template)}
                    disabled={resetTemplate.isPending}
                  >
                    <RotateCcw className="h-4 w-4 mr-1.5" />
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <TemplateEditDialog
        template={editingTemplate}
        open={!!editingTemplate}
        onOpenChange={(open) => !open && setEditingTemplate(null)}
        onSave={handleSaveTemplate}
      />
    </>
  );
}
