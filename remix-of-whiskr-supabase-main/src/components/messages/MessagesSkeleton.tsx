import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export function MessagesSkeleton() {
  return (
    <div className="flex flex-col h-full gap-6 animate-fade-in">
      {/* Header */}
      <div className="bg-muted/30 p-6 rounded-lg border">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Users List */}
        <Card className="lg:col-span-1 flex flex-col">
          <div className="p-4 border-b">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5" />
              <Skeleton className="h-5 w-28" />
            </div>
          </div>
          <div className="p-2 space-y-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-28 mb-2" />
                  <div className="flex gap-1">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Messages Area */}
        <Card className="lg:col-span-2 flex flex-col">
          {/* Chat Header */}
          <div className="p-4 border-b">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div>
                <Skeleton className="h-5 w-32 mb-1" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 p-4 space-y-4">
            <div className="flex justify-start">
              <Skeleton className="h-16 w-3/4 rounded-2xl" />
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-12 w-2/3 rounded-2xl" />
            </div>
            <div className="flex justify-start">
              <Skeleton className="h-20 w-3/4 rounded-2xl" />
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-14 w-1/2 rounded-2xl" />
            </div>
          </div>

          {/* Input */}
          <div className="p-4 border-t">
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </Card>
      </div>
    </div>
  );
}
