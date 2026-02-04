import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Shield, Download, CalendarIcon, Search, FileText, Edit, CheckCircle, Undo } from 'lucide-react';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

type AuditEvent = {
  id: string;
  event_type: string;
  event_at: string;
  user_email: string | null;
  patient_name: string | null;
  consult_id: string | null;
  details: Record<string, unknown> | null;
  entity_type: string | null;
  ip_address: string | null;
};

export default function AuditTrail() {
  const { userRole } = useAuth();
  const [page, setPage] = useState(1);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [userEmailSearch, setUserEmailSearch] = useState('');
  const [patientNameSearch, setPatientNameSearch] = useState('');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  // Access control
  if (userRole !== 'super_admin') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Super Admin Access Required</h2>
            <p className="text-muted-foreground">
              You don't have permission to view the compliance audit trail.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fetch audit data
  const { data: auditData, isLoading } = useQuery({
    queryKey: ['compliance-audit-trail', page, eventTypeFilter, userEmailSearch, patientNameSearch, dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from('compliance_audit_trail')
        .select('*', { count: 'exact' })
        .order('event_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (eventTypeFilter && eventTypeFilter !== 'all') {
        query = query.eq('event_type', eventTypeFilter);
      }
      if (userEmailSearch) {
        query = query.ilike('user_email', `%${userEmailSearch}%`);
      }
      if (patientNameSearch) {
        query = query.ilike('patient_name', `%${patientNameSearch}%`);
      }
      if (dateFrom) {
        query = query.gte('event_at', dateFrom.toISOString());
      }
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('event_at', endOfDay.toISOString());
      }

      const { data, count, error } = await query;
      if (error) throw error;
      return { events: data as AuditEvent[], totalCount: count || 0 };
    },
  });

  const totalPages = Math.ceil((auditData?.totalCount || 0) / PAGE_SIZE);

  // Export to CSV
  const handleExportCSV = async () => {
    let query = supabase
      .from('compliance_audit_trail')
      .select('*')
      .order('event_at', { ascending: false });

    if (eventTypeFilter && eventTypeFilter !== 'all') {
      query = query.eq('event_type', eventTypeFilter);
    }
    if (userEmailSearch) {
      query = query.ilike('user_email', `%${userEmailSearch}%`);
    }
    if (patientNameSearch) {
      query = query.ilike('patient_name', `%${patientNameSearch}%`);
    }
    if (dateFrom) {
      query = query.gte('event_at', dateFrom.toISOString());
    }
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte('event_at', endOfDay.toISOString());
    }

    const { data } = await query;
    if (!data || data.length === 0) return;

    const headers = ['Event Type', 'Date/Time', 'User Email', 'Patient Name', 'Entity Type', 'IP Address'];
    const csvContent = [
      headers.join(','),
      ...data.map(row => [
        row.event_type,
        row.event_at,
        row.user_email || '',
        row.patient_name || '',
        row.entity_type || '',
        row.ip_address || ''
      ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-trail-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getEventBadge = (eventType: string) => {
    switch (eventType) {
      case 'report_generated':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-700"><FileText className="h-3 w-3 mr-1" />Report</Badge>;
      case 'consult_initial':
        return <Badge variant="secondary" className="bg-green-100 text-green-700"><CheckCircle className="h-3 w-3 mr-1" />Initial</Badge>;
      case 'consult_edit':
        return <Badge variant="secondary" className="bg-amber-100 text-amber-700"><Edit className="h-3 w-3 mr-1" />Edit</Badge>;
      case 'consult_finalized':
        return <Badge variant="secondary" className="bg-purple-100 text-purple-700"><CheckCircle className="h-3 w-3 mr-1" />Finalized</Badge>;
      case 'consult_unfinalized':
        return <Badge variant="secondary" className="bg-red-100 text-red-700"><Undo className="h-3 w-3 mr-1" />Unfinalized</Badge>;
      default:
        return <Badge variant="outline">{eventType}</Badge>;
    }
  };

  const clearFilters = () => {
    setEventTypeFilter('all');
    setUserEmailSearch('');
    setPatientNameSearch('');
    setDateFrom(undefined);
    setDateTo(undefined);
    setPage(1);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Compliance Audit Trail
          </h1>
          <p className="text-muted-foreground mt-1">
            Track all clinical data access and modifications for HIPAA/PIPEDA compliance
          </p>
        </div>
        <Button onClick={handleExportCSV} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Event Type */}
            <Select value={eventTypeFilter} onValueChange={(v) => { setEventTypeFilter(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Event Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                <SelectItem value="report_generated">Report Generated</SelectItem>
                <SelectItem value="consult_initial">Consult Initial</SelectItem>
                <SelectItem value="consult_edit">Consult Edit</SelectItem>
                <SelectItem value="consult_finalized">Consult Finalized</SelectItem>
                <SelectItem value="consult_unfinalized">Consult Unfinalized</SelectItem>
              </SelectContent>
            </Select>

            {/* User Email Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search user email..."
                value={userEmailSearch}
                onChange={(e) => { setUserEmailSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>

            {/* Patient Name Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patient..."
                value={patientNameSearch}
                onChange={(e) => { setPatientNameSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>

            {/* Date From */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, 'MMM dd, yyyy') : 'From date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d); setPage(1); }} initialFocus />
              </PopoverContent>
            </Popover>

            {/* Date To */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, 'MMM dd, yyyy') : 'To date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d); setPage(1); }} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          {(eventTypeFilter !== 'all' || userEmailSearch || patientNameSearch || dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-3">
              Clear all filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Audit Events
              {auditData && <span className="text-muted-foreground font-normal ml-2">({auditData.totalCount} total)</span>}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : auditData?.events.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No audit events found matching your criteria.
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event Type</TableHead>
                      <TableHead>Date/Time</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Entity Type</TableHead>
                      <TableHead>IP Address</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditData?.events.map((event, idx) => (
                      <TableRow key={`${event.event_at}-${idx}`}>
                        <TableCell>{getEventBadge(event.event_type)}</TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(event.event_at), 'MMM dd, yyyy HH:mm:ss')}
                        </TableCell>
                        <TableCell className="text-sm">{event.user_email || '—'}</TableCell>
                        <TableCell className="text-sm font-medium">{event.patient_name || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{event.entity_type || '—'}</TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">{event.ip_address || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setPage(p => Math.max(1, p - 1))} 
                          className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (page <= 3) {
                          pageNum = i + 1;
                        } else if (page >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = page - 2 + i;
                        }
                        return (
                          <PaginationItem key={pageNum}>
                            <PaginationLink
                              onClick={() => setPage(pageNum)}
                              isActive={page === pageNum}
                              className="cursor-pointer"
                            >
                              {pageNum}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                          className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
