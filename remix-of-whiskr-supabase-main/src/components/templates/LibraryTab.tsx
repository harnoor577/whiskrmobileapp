import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clipboard, Heart, Stethoscope, Eye, Check, Plus, Loader2 } from 'lucide-react';
import { systemTemplates, SystemTemplate } from '@/data/systemTemplates';
import { TemplateViewDialog } from './TemplateViewDialog';
import { useUserTemplates } from '@/hooks/use-user-templates';

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

export function LibraryTab() {
  const [viewTemplate, setViewTemplate] = useState<SystemTemplate | null>(null);
  const { addTemplate, isTemplateAdded } = useUserTemplates();

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {systemTemplates.map((template) => {
          const config = typeConfig[template.type];
          const Icon = config.icon;
          const isAdded = isTemplateAdded(template.id);

          return (
            <Card key={template.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className={`p-2.5 rounded-lg border ${config.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdded && (
                      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                        <Check className="h-3 w-3 mr-1" />
                        Added
                      </Badge>
                    )}
                    <Badge variant="outline" className={config.badgeColor}>
                      {template.type.toUpperCase()}
                    </Badge>
                  </div>
                </div>
                <h3 className="font-semibold text-lg mt-3">{template.name}</h3>
                <p className="text-sm text-muted-foreground">{template.description}</p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewTemplate(template)}
                  >
                    <Eye className="h-4 w-4 mr-1.5" />
                    View
                  </Button>
                  {!isAdded && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => addTemplate.mutate(template)}
                      disabled={addTemplate.isPending}
                    >
                      {addTemplate.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : (
                        <Plus className="h-4 w-4 mr-1.5" />
                      )}
                      Add to My Templates
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {template.sections.length} sections
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <TemplateViewDialog
        template={viewTemplate}
        open={!!viewTemplate}
        onOpenChange={(open) => !open && setViewTemplate(null)}
      />
    </>
  );
}
