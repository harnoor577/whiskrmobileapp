import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export function ConsultWorkspaceSkeleton() {
  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="p-4 border-b bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-9 w-9" />
            <div>
              <Skeleton className="h-6 w-40 mb-1" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-9" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 grid md:grid-cols-3 gap-4 p-4">
        {/* Patient Info Panel */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-32 mb-1" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              <div className="space-y-2 pt-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-5 w-28 mb-3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        </div>

        {/* Chat Area */}
        <div className="md:col-span-2">
          <Card className="h-full">
            <CardContent className="p-4 space-y-4">
              {/* Chat messages skeleton */}
              <div className="space-y-4">
                <div className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                  <Skeleton className="h-20 flex-1 rounded-lg" />
                </div>
                <div className="flex gap-3 justify-end">
                  <Skeleton className="h-16 w-3/4 rounded-lg" />
                  <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                </div>
                <div className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                  <Skeleton className="h-24 flex-1 rounded-lg" />
                </div>
              </div>
              
              {/* Input area */}
              <div className="pt-4 border-t">
                <Skeleton className="h-20 w-full rounded-lg" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
