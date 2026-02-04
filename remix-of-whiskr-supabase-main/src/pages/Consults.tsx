import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Stethoscope, Calendar, Clock, User, FileText, Search, ChevronLeft, ChevronRight, ArrowRight, 
  Dog, Cat, Bird, Rabbit, Fish, PawPrint, Syringe, Scissors, Activity, MoreVertical, 
  Play, Download, Copy, Trash2, RefreshCw, ChevronDown, Heart
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { QuickConsultDialog } from '@/components/consult/QuickConsultDialog';
import { AddPatientDialog } from '@/components/patient/AddPatientDialog';
import { isEuthanasiaConsult } from '@/utils/euthanasiaDetection';
import { ConsultsSkeleton } from '@/components/consult/ConsultsSkeleton';
import { getConsultEditorPath } from '@/utils/consultNavigation';

interface ChatMessage {
  role: string;
  content: string;
}

interface Consult {
  id: string;
  patient_id: string;
  status: string;
  visit_type?: 'wellness' | 'procedure' | 'sickness' | 'chronic' | null;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
  reason_for_visit?: string | null;
  soap_s?: string | null;
  soap_o?: string | null;
  soap_a?: string | null;
  soap_p?: string | null;
  case_notes?: string | null;
  final_treatment_plan?: string | null;
  exam_room?: string | null;
  clinic_location?: string | null;
  final_summary?: string | null;
  procedure_name?: string | null;
  procedure_indication?: string | null;
  procedure_date_time?: string | null;
  patient?: {
    name: string;
    species: string;
    breed: string | null;
  };
  chat_messages?: ChatMessage[];
}

export default function Consults() {
  const { clinicId } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();
  const [consults, setConsults] = useState<Consult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const itemsPerPage = 10;

  // Calculate active filters count
  const activeFiltersCount = [searchQuery, dateFrom, dateTo].filter(Boolean).length;

  useEffect(() => {
    loadConsults();
    
    // Set up real-time subscription for patient and consult updates
    const channel = supabase
      .channel('consults-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'patients',
          filter: `clinic_id=eq.${clinicId}`
        },
        () => {
          console.log('Patient updated, reloading consults');
          loadConsults();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'consults',
          filter: `clinic_id=eq.${clinicId}`
        },
        (payload) => {
          console.log('Consult changed:', payload);
          loadConsults();
        }
      )
      .subscribe();
    
    // Reload when page becomes visible (user navigates back)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('Page visible, reloading consults');
        loadConsults();
      }
    };
    
    // Also reload when window gains focus
    const handleFocus = () => {
      console.log('Window focused, reloading consults');
      loadConsults();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [clinicId]);

  const loadConsults = async () => {
    if (!clinicId) return;

    try {
      // Fetch consults with chat messages for procedure extraction
      const { data: consultRows, error } = await supabase
        .from('consults')
        .select(`
          *,
          chat_messages(role, content)
        `)
        .eq('clinic_id', clinicId)
        .order('started_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      let result: Consult[] = (consultRows as any) || [];

      // Manually join patient info to avoid FK dependency
      if (result.length > 0) {
        const patientIds = Array.from(new Set(result.map((r: any) => r.patient_id).filter(Boolean)));
        if (patientIds.length > 0) {
          const { data: patients, error: pErr } = await supabase
            .from('patients')
            .select('id, name, species, breed')
            .in('id', patientIds);
          if (pErr) throw pErr;
          const pMap = new Map((patients || []).map((p: any) => [p.id, p]));
          result = result.map((r: any) => ({ ...r, patient: pMap.get(r.patient_id) }));
        }
      }

      setConsults(result);
    } catch (error) {
      console.error('Error loading consults:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAnimalIcon = (species: string) => {
    const speciesLower = species?.toLowerCase() || '';
    if (speciesLower.includes('dog') || speciesLower.includes('canine')) return Dog;
    if (speciesLower.includes('cat') || speciesLower.includes('feline')) return Cat;
    if (speciesLower.includes('bird') || speciesLower.includes('avian')) return Bird;
    if (speciesLower.includes('rabbit') || speciesLower.includes('bunny')) return Rabbit;
    if (speciesLower.includes('fish')) return Fish;
    return PawPrint;
  };

  const getStatusColor = (status: string) => {
    return status === 'finalized' 
      ? 'bg-success/10 text-success border-success/20'
      : 'bg-warning/10 text-warning border-warning/20';
  };

  const getVisitTypeConfig = (visitType?: string) => {
    const configs = {
      wellness: { 
        color: 'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-950 dark:text-teal-200 dark:border-teal-800',
        icon: Syringe,
        label: 'Wellness / Vaccine'
      },
      procedure: { 
        color: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800',
        icon: Scissors,
        label: 'Procedure'
      },
      sickness: { 
        color: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800',
        icon: Activity,
        label: 'Sickness / Emergency'
      },
      chronic: { 
        color: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
        icon: Clock,
        label: 'Chronic Illness'
      },
      euthanasia: { 
        color: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-800',
        icon: Heart,
        label: 'Euthanasia'
      }
    };
    
    // If no visit_type specified, don't show a badge at all
    if (!visitType) return null;
    
    return configs[visitType as keyof typeof configs] || null;
  };

  const inferVisitType = (consult: Consult): 'wellness' | 'procedure' | 'sickness' | 'chronic' | null => {
    // PRIORITY 1: If doctor manually selected visit type, USE IT (don't override)
    if (consult.visit_type) return consult.visit_type;

    // PRIORITY 2: Only run AI inference if visit_type is NULL

    // Combine all text fields for analysis
    const allText = [
      consult.reason_for_visit,
      consult.soap_a,
      consult.soap_p,
      consult.final_summary
    ].filter(Boolean).join(' ').toLowerCase();

    // Procedure keywords
    const procedureKeywords = [
      'surgery', 'surgical', 'procedure', 'operation', 'spay', 'neuter', 'castration',
      'dental', 'extraction', 'cleaning', 'anesthesia', 'sedation', 'biopsy',
      'removal', 'repair', 'suture', 'incision', 'laceration repair'
    ];

    // Sickness/Emergency keywords
    const sicknessKeywords = [
      'vomiting', 'diarrhea', 'emergency', 'trauma', 'injury', 'acute', 'seizure',
      'poisoning', 'toxicity', 'collapse', 'bleeding', 'fracture', 'laceration',
      'difficulty breathing', 'dyspnea', 'pain', 'fever', 'infection'
    ];

    // Chronic keywords
    const chronicKeywords = [
      'chronic', 'diabetes', 'kidney disease', 'renal', 'heart disease', 'cardiac',
      'arthritis', 'osteoarthritis', 'thyroid', 'cushings', 'addisons',
      'ongoing', 'long-term', 'management', 'monitoring'
    ];

    // Wellness keywords
    const wellnessKeywords = [
      'vaccine', 'vaccination', 'wellness', 'checkup', 'check-up', 'annual',
      'preventive', 'preventative', 'physical exam', 'routine', 'healthy'
    ];

    // Count matches for each category
    const procedureScore = procedureKeywords.filter(kw => allText.includes(kw)).length;
    const sicknessScore = sicknessKeywords.filter(kw => allText.includes(kw)).length;
    const chronicScore = chronicKeywords.filter(kw => allText.includes(kw)).length;
    const wellnessScore = wellnessKeywords.filter(kw => allText.includes(kw)).length;

    // Return the category with highest score
    const scores = [
      { type: 'procedure' as const, score: procedureScore },
      { type: 'sickness' as const, score: sicknessScore },
      { type: 'chronic' as const, score: chronicScore },
      { type: 'wellness' as const, score: wellnessScore }
    ];

    const maxScore = Math.max(...scores.map(s => s.score));
    if (maxScore === 0) return null; // No clear match

    const winner = scores.find(s => s.score === maxScore);
    return winner ? winner.type : null;
  };

  const extractProcedureInfo = (consult: Consult): string | null => {
    // Priority 1: Use stored procedure fields if available
    if (consult.procedure_name || consult.procedure_indication) {
      const name = consult.procedure_name || '';
      const indication = consult.procedure_indication || '';
      return [name, indication].filter(Boolean).join(' - ');
    }
    
    // Priority 2: Try to extract from chat messages (procedural notes)
    const assistantMessages = (consult.chat_messages || []).filter(m => m.role === 'assistant');
    for (const msg of assistantMessages) {
      // Look for procedure name and indication with various formats
      // Handle markdown list formatting with leading dashes
      const patterns = [
        /[-\s]*\*\*Procedure\s+[Nn]ame\s+and\s+[Ii]ndication\*\*:\s*(.+?)(?:\n|$)/i,
        /[-\s]*Procedure\s+[Nn]ame\s+and\s+[Ii]ndication:\s*(.+?)(?:\n|$)/i,
        /[-\s]*\*\*Procedure:\*\*\s*(.+?)(?:\n|$)/i,
        /Procedure\s+[Nn]ame\s+and\s+[Ii]ndication\s*[:\-]\s*(.+?)(?:\n|$)/i
      ];
      
      for (const pattern of patterns) {
        const match = msg.content.match(pattern);
        if (match) {
          return match[1].trim();
        }
      }
    }
    
    // Priority 3: Fallback to other fields
    const source = [
      consult.final_treatment_plan || '',
      consult.soap_p || '',
      consult.final_summary || ''
    ].filter(Boolean).join('\n');

    if (source) {
      const nameMatch = source.match(/(?:procedure(?: name)?|surgery|operation)\s*(?:name)?\s*(?:and\s+indication)?\s*[:\-]\s*(.+?)(?:\n|$)/i);
      if (nameMatch) {
        return nameMatch[1].trim();
      }
      // Get first meaningful line
      const firstLine = source.split('\n').find(l => l.trim().length > 10);
      if (firstLine) {
        return firstLine.trim();
      }
    }
    return null;
  };

  const getContextSnippet = (consult: Consult) => {
    // Check for euthanasia first - takes priority over all other visit types
    if (isEuthanasiaConsult(consult)) {
      return ''; // Show nothing, the badge provides sufficient context
    }

    const inferredType = inferVisitType(consult);
    const visit_type = inferredType || consult.visit_type || null;
    const { reason_for_visit, soap_a } = consult;

    const truncate = (text: string, max: number) =>
      text.length > max ? `${text.slice(0, max)}...` : text;

    // Wellness/Vaccine: show only the tag, no snippet text
    if (visit_type === 'wellness') {
      return '';
    }

    // Procedure: extract procedure name and indication
    if (visit_type === 'procedure') {
      const procedureInfo = extractProcedureInfo(consult);
      if (procedureInfo) {
        return `Procedure: ${truncate(procedureInfo, 120)}`;
      }
      return 'Procedure details pending';
    }

    // Sickness / Emergency / Chronic: show presenting complaint; optionally working diagnosis if available
    const complaint = reason_for_visit?.trim();
    const diagnosisLine = (soap_a || '')
      .split('\n')
      .find(l => l.trim().length > 0);

    if (complaint && diagnosisLine) {
      return `Presenting Complaint: ${truncate(complaint, 70)} • Working Diagnosis: ${truncate(diagnosisLine.trim(), 40)}`;
    }
    if (complaint) {
      return `Presenting Complaint: ${truncate(complaint, 120)}`;
    }
    if (diagnosisLine) {
      return `Working Diagnosis: ${truncate(diagnosisLine.trim(), 120)}`;
    }

    // Ultimate fallback
    return 'Presenting complaint pending';
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    return `${mins} min`;
  };

  const formatTime12Hour = (dateString: string) => {
    return format(new Date(dateString), 'hh:mm a');
  };

  // Filter consults based on search and date filters
  const filteredConsults = consults.filter((consult) => {
    const matchesSearch = searchQuery === '' || 
      consult.patient?.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    const consultDate = new Date(consult.started_at);
    const matchesDateFrom = dateFrom === '' || consultDate >= new Date(dateFrom);
    const matchesDateTo = dateTo === '' || consultDate <= new Date(dateTo + 'T23:59:59');
    
    return matchesSearch && matchesDateFrom && matchesDateTo;
  });

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFrom, dateTo]);

  // Paginate filtered results
  const totalPages = Math.ceil(filteredConsults.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedConsults = filteredConsults.slice(startIndex, endIndex);

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    
    if (totalPages <= 7) {
      // Show all pages if 7 or fewer
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      if (currentPage > 3) {
        pages.push('...');
      }
      
      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('...');
      }
      
      // Always show last page
      pages.push(totalPages);
    }
    
    return pages;
  };

  if (loading) {
    return <ConsultsSkeleton />;
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Consultations</h1>
            <p className="text-muted-foreground mt-1 text-sm">View and manage your patient consultation records</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                setLoading(true);
                loadConsults();
              }}
              disabled={loading}
              title="Refresh consultations"
              className="h-9 w-9 md:h-10 md:w-auto md:px-4"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline ml-2">Refresh</span>
            </Button>
            {permissions.canCreateConsult ? (
              <QuickConsultDialog 
                trigger={
                  <Button className="gap-2 h-9 md:h-10">
                    <Stethoscope className="h-4 w-4" />
                    <span className="hidden sm:inline">Start Consult</span>
                  </Button>
                }
              />
            ) : (
              <AddPatientDialog />
            )}
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <Card className="border-border/50 shadow-sm">
        {/* Mobile: Collapsible trigger */}
        <div className="md:hidden">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full p-3 flex items-center justify-between text-sm font-medium hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <span>Filters</span>
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {activeFiltersCount}
                </Badge>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Filter content - always visible on desktop, collapsible on mobile */}
        <CardContent className={`p-4 md:pt-6 ${!showFilters ? 'hidden md:block' : 'block'}`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground pl-1">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by patient name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-background"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground pl-1">From Date</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground pl-1">To Date</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-background"
              />
            </div>
          </div>
          {(searchQuery || dateFrom || dateTo) && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                Clear all filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {consults.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-primary/10 p-4 mb-4">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No consultations yet</h3>
            <p className="text-muted-foreground mb-6 text-center max-w-sm">
              {permissions.canCreateConsult 
                ? 'Start your first consultation to begin building patient records'
                : 'Add patients to prepare them for consultations'}
            </p>
            {permissions.canCreateConsult ? (
              <QuickConsultDialog />
            ) : (
              <AddPatientDialog />
            )}
          </CardContent>
        </Card>
      ) : filteredConsults.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No consults found</h3>
            <p className="text-muted-foreground mb-6 text-center max-w-sm">
              Try adjusting your search criteria or date range
            </p>
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => {
                setSearchQuery('');
                setDateFrom('');
                setDateTo('');
              }}
            >
              Clear All Filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 md:space-y-3">
          {paginatedConsults.map((consult, index) => {
            const AnimalIcon = getAnimalIcon(consult.patient?.species || '');
            const isEuthanasia = isEuthanasiaConsult(consult);
            const inferredType = inferVisitType(consult);
            // If euthanasia, show euthanasia badge; otherwise show visit type
            const displayType = isEuthanasia ? 'euthanasia' : (inferredType || consult.visit_type);
            const visitConfig = getVisitTypeConfig(displayType);
            const VisitIcon = visitConfig?.icon;
            const isDraft = consult.status === 'draft';
            
            return (
              <Card 
                key={consult.id}
                className="group hover:shadow-lg hover:scale-[1.01] transition-all duration-200 cursor-pointer border-border/50"
                onClick={() => navigate(getConsultEditorPath(consult))}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <CardContent className="p-3 md:p-4">
                  {/* Top Row: Identity + Status */}
                  <div className="flex items-start justify-between mb-2 md:mb-3">
                    <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                      {/* Pet Avatar/Icon */}
                      <div className="flex-shrink-0">
                        <AnimalIcon className="h-6 w-6 md:h-8 md:w-8 text-primary" />
                      </div>
                      
                      {/* Patient Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                          <span className="font-semibold text-base md:text-lg line-clamp-1">
                            {consult.patient?.name || "Unknown Patient"}
                          </span>
                          {consult.patient?.breed && (
                            <span className="text-xs md:text-sm text-muted-foreground hidden sm:inline">
                              • {consult.patient.breed}
                            </span>
                          )}
                          {visitConfig && (
                            <Badge 
                              variant="outline" 
                              className={`${visitConfig.color} flex items-center gap-1 text-xs py-0 h-5`}
                            >
                              {VisitIcon && <VisitIcon className="h-3 w-3" />}
                              <span className="hidden sm:inline">{visitConfig.label}</span>
                              <span className="sm:hidden">{visitConfig.label.split(' ')[0]}</span>
                            </Badge>
                          )}
                        </div>
                        
                        {/* Location (if available) - hide on very small screens */}
                        {(consult.clinic_location || consult.exam_room) && (
                          <div className="text-xs text-muted-foreground mt-1 hidden sm:block">
                            {[consult.clinic_location, consult.exam_room]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Status Badge + Quick Actions */}
                    <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
                      {/* Quick Actions Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 w-7 md:h-8 md:w-8 p-0"
                            aria-label={`Consult actions for ${consult.patient?.name}`}
                          >
                            <MoreVertical className="h-3.5 w-3.5 md:h-4 md:w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 bg-background z-50">
                          {permissions.isDVM && isDraft && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/consults/${consult.id}`);
                            }}>
                              <Play className="mr-2 h-4 w-4" />
                              Continue Consultation
                            </DropdownMenuItem>
                          )}
                          
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/patients/${consult.patient_id}`);
                          }}>
                            <User className="mr-2 h-4 w-4" />
                            View Patient
                          </DropdownMenuItem>
                          
                          {permissions.isDVM && !isDraft && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                toast.info("Export feature coming soon");
                              }}>
                                <Download className="mr-2 h-4 w-4" />
                                Export
                              </DropdownMenuItem>
                            </>
                          )}
                          
                          {permissions.isDVM && isDraft && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toast.info("Delete feature coming soon");
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete Draft
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      
                      <Badge variant="outline" className={`${getStatusColor(consult.status)} text-xs h-5 px-1.5 md:px-2`}>
                        {consult.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                  
                  {/* Context Snippet */}
                  {getContextSnippet(consult) && (
                    <div className="text-xs md:text-sm text-foreground mb-2 md:mb-3 line-clamp-2">
                      {getContextSnippet(consult)}
                    </div>
                  )}
                  
                  {/* Date & Time - stack on very small screens */}
                  <div className="flex flex-col xs:flex-row items-start xs:items-center gap-1.5 xs:gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3 w-3 md:h-3.5 md:w-3.5" />
                      <span>{format(new Date(consult.started_at), 'MMM dd, yyyy')}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 md:h-3.5 md:w-3.5" />
                      <span>{formatTime12Hour(consult.started_at)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Card className="mt-4 md:mt-6 border-border/50">
          <CardContent className="py-3 md:py-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-3">
              <p className="text-xs md:text-sm text-muted-foreground text-center md:text-left">
                Showing <span className="font-medium text-foreground">{startIndex + 1}</span> to{' '}
                <span className="font-medium text-foreground">{Math.min(endIndex, filteredConsults.length)}</span> of{' '}
                <span className="font-medium text-foreground">{filteredConsults.length}</span> results
              </p>
              
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="h-8 w-8 md:h-9 md:w-9 p-0"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </Button>

                {getPageNumbers().map((pageNum, idx) => (
                  pageNum === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 md:px-3 text-muted-foreground text-sm">
                      {pageNum}
                    </span>
                  ) : (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setCurrentPage(pageNum as number)}
                      className={`h-8 w-8 md:h-9 md:w-9 p-0 text-sm ${
                        currentPage === pageNum 
                          ? 'bg-primary text-primary-foreground shadow-sm' 
                          : 'hover:bg-muted'
                      }`}
                    >
                      {pageNum}
                    </Button>
                  )
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 w-8 md:h-9 md:w-9 p-0"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}