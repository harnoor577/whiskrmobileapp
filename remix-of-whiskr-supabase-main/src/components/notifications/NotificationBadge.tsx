import { Badge } from '@/components/ui/badge';

interface NotificationBadgeProps {
  count: number;
}

export function NotificationBadge({ count }: NotificationBadgeProps) {
  if (count === 0) return null;

  return (
    <Badge 
      variant="destructive" 
      className="ml-2 h-5 min-w-5 rounded-full px-1.5 text-xs font-semibold"
    >
      {count > 99 ? '99+' : count}
    </Badge>
  );
}
