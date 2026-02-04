import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clipboard, Heart, Stethoscope, Eye } from 'lucide-react';
import { SystemTemplate } from '@/data/systemTemplates';

interface TemplateCardProps {
  template: SystemTemplate;
  onView: (template: SystemTemplate) => void;
}

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

export function TemplateCard({ template, onView }: TemplateCardProps) {
  const config = typeConfig[template.type];
  const Icon = config.icon;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className={`p-2.5 rounded-lg border ${config.color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <Badge variant="outline" className={config.badgeColor}>
            {template.type.toUpperCase()}
          </Badge>
        </div>
        <h3 className="font-semibold text-lg mt-3">{template.name}</h3>
        <p className="text-sm text-muted-foreground">{template.description}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {template.sections.length} sections
          </span>
          <Button variant="outline" size="sm" onClick={() => onView(template)}>
            <Eye className="h-4 w-4 mr-1.5" />
            View
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
