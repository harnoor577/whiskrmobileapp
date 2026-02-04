import { Skeleton } from '@/components/ui/skeleton';

export function LoginHistorySkeleton() {
  return (
    <div className="overflow-x-auto animate-fade-in">
      {/* Table Header */}
      <div className="grid grid-cols-5 gap-4 pb-4 border-b">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
      
      {/* Table Rows */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="grid grid-cols-5 gap-4 py-4 border-b">
          <Skeleton className="h-5 w-20" />
          <div className="flex flex-col gap-1">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-12" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-6 w-24 rounded" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
