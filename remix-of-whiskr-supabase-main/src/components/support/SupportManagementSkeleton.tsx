import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function SupportManagementSkeleton() {
  return (
    <div className="container mx-auto p-6 max-w-7xl animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      {/* Agents Section */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-5 w-36" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-48 rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filter */}
      <div className="mb-4">
        <Skeleton className="h-10 w-[200px]" />
      </div>

      {/* Ticket Cards */}
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <Skeleton className="h-6 w-72" />
                  <div className="flex gap-2 flex-wrap">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-18" />
                  </div>
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Skeleton className="h-10 w-[180px]" />
                  <Skeleton className="h-10 w-[150px]" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-2/3 mb-4" />
              <Skeleton className="h-9 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
