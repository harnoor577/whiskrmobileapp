import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useIsMobile } from '@/hooks/use-mobile';
import { Patient } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, ChevronLeft, ChevronRight, Dog, Cat, Bird, Rabbit, Fish, PawPrint, Heart, CalendarIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { QuickConsultDialog } from '@/components/consult/QuickConsultDialog';
import { AddPatientDialog } from '@/components/patient/AddPatientDialog';
import { hasEuthanasiaConsult } from '@/utils/euthanasiaDetection';
import { PatientsSkeleton } from '@/components/patient/PatientsSkeleton';
import { getCachedData, setCacheData, prefetchPatientDetail } from '@/hooks/use-prefetch';
import { format, addDays, subDays, isSameDay, isToday, startOfDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type PatientWithLastConsult = Patient & {
  lastConsultDate?: string;
  consults?: any[];
};

const getAnimalIcon = (species: string) => {
  const speciesLower = species.toLowerCase();
  if (speciesLower.includes('dog') || speciesLower.includes('canine')) return Dog;
  if (speciesLower.includes('cat') || speciesLower.includes('feline')) return Cat;
  if (speciesLower.includes('bird') || speciesLower.includes('avian')) return Bird;
  if (speciesLower.includes('rabbit') || speciesLower.includes('bunny')) return Rabbit;
  if (speciesLower.includes('fish')) return Fish;
  return PawPrint;
};

export default function Patients() {
  const { clinicId } = useAuth();
  const { canCreatePatient, canCreateConsult } = usePermissions();
  const isMobile = useIsMobile();
  const [patients, setPatients] = useState<PatientWithLastConsult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [calendarOpen, setCalendarOpen] = useState(false);
  
  // Responsive items per page
  // Mobile: 10 (1 per row), Tablet: 12 (2 per row, 6 rows), Desktop: 15 (3 per row, 5 rows)
  const getItemsPerPage = () => {
    if (typeof window === 'undefined') return 15;
    const width = window.innerWidth;
    if (width < 640) return 10; // mobile
    if (width < 1024) return 12; // tablet
    return 15; // desktop
  };
  
  const [itemsPerPage, setItemsPerPage] = useState(getItemsPerPage());
  
  useEffect(() => {
    const handleResize = () => {
      setItemsPerPage(getItemsPerPage());
      setCurrentPage(1); // Reset to first page on resize
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!clinicId) return;

    const fetchPatients = async () => {
      // Check cache first for instant display
      const cacheKey = `patients-${clinicId}`;
      const cachedData = getCachedData<any[]>(cacheKey);
      
      if (cachedData) {
        const patientsWithConsults: PatientWithLastConsult[] = cachedData.map((patient: any) => ({
          ...patient,
          lastConsultDate: patient.consults?.[0]?.started_at || undefined,
          consults: patient.consults || []
        }));
        setPatients(patientsWithConsults);
        setLoading(false);
      }

      try {
        // Single optimized query: fetch patients with their consults in one request
        const { data, error } = await supabase
          .from('patients')
          .select(`
            *,
            consults (
              started_at,
              chat_messages (content)
            )
          `)
          .eq('clinic_id', clinicId)
          .order('started_at', { referencedTable: 'consults', ascending: false });

        if (error) throw error;
        
        if (data) {
          // Update cache
          setCacheData(cacheKey, data);
          
          const patientsWithConsults: PatientWithLastConsult[] = data.map((patient: any) => ({
            ...patient,
            lastConsultDate: patient.consults?.[0]?.started_at || undefined,
            consults: patient.consults || []
          }));
          setPatients(patientsWithConsults);
        } else {
          setPatients([]);
        }
      } catch (error) {
        console.error('Error fetching patients:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPatients();
  }, [clinicId]);

  const filteredPatients = patients.filter((patient) => {
    const query = searchQuery.toLowerCase();
    const patientId = (patient.identifiers as any)?.patient_id || '';
    
    // Text search filter
    const matchesSearch = 
      patient.name.toLowerCase().includes(query) ||
      patient.species.toLowerCase().includes(query) ||
      (patient.breed && patient.breed.toLowerCase().includes(query)) ||
      patientId.toLowerCase() === query;
    
    // Date filter - check if patient was seen or created on selected date
    const patientDate = patient.lastConsultDate 
      ? startOfDay(new Date(patient.lastConsultDate))
      : startOfDay(new Date(patient.created_at!));
    const matchesDate = isSameDay(patientDate, selectedDate);
    
    return matchesSearch && matchesDate;
  });

  // Sort patients by most recently added
  const sortedPatients = [...filteredPatients].sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Reset to page 1 when search or date changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedDate]);

  // Paginate sorted results
  const totalPages = Math.ceil(sortedPatients.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPatients = sortedPatients.slice(startIndex, endIndex);

  if (loading) {
    return <PatientsSkeleton />;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Patients</h1>
          <p className="text-sm text-muted-foreground hidden sm:block">Manage your clinic's patient records</p>
        </div>
        {canCreateConsult ? (
          <QuickConsultDialog 
            trigger={
              <Button className="gap-2 w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                <span>Start Consult</span>
              </Button>
            }
          />
        ) : (
          <AddPatientDialog />
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {/* Date Stepper - primary background with white text */}
        <div className="flex items-center gap-0.5 bg-primary rounded-md px-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:bg-white/20 hover:text-white"
            onClick={() => setSelectedDate(prev => subDays(prev, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className="min-w-[120px] justify-center gap-2 text-sm font-medium text-white hover:bg-white/20 hover:text-white"
              >
                <CalendarIcon className="h-4 w-4" />
                {format(selectedDate, 'MMM d, yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    setSelectedDate(startOfDay(date));
                    setCalendarOpen(false);
                  }
                }}
                disabled={(date) => date > new Date()}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:bg-white/20 hover:text-white disabled:text-white/50"
            onClick={() => setSelectedDate(prev => addDays(prev, 1))}
            disabled={isToday(selectedDate)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          
          {!isToday(selectedDate) && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 ml-0.5 text-white hover:bg-white/20 hover:text-white border border-white/30"
              onClick={() => setSelectedDate(startOfDay(new Date()))}
            >
              Today
            </Button>
          )}
        </div>

        {/* Search Box */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, species, breed, or patient ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {paginatedPatients.map((patient) => {
          const AnimalIcon = getAnimalIcon(patient.species);
          const isEuthanized = hasEuthanasiaConsult(patient.consults || []);
          return (
            <Link 
              key={patient.id} 
              to={`/patients/${patient.id}`}
              onMouseEnter={() => clinicId && prefetchPatientDetail(patient.id, clinicId)}
              onTouchStart={() => clinicId && prefetchPatientDetail(patient.id, clinicId)}
            >
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="truncate">{patient.name}</span>
                      {isEuthanized && (
                        <Badge 
                          variant="outline" 
                          className="bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-800 text-xs flex items-center gap-1 shrink-0"
                        >
                          <Heart className="h-3 w-3" />
                          Passed
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 ml-2 shrink-0">
                      <AnimalIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-normal text-muted-foreground">
                        {patient.species}
                      </span>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-1 text-xs">
                    {((patient.identifiers as any)?.patient_id) && (
                      <div className="truncate">
                        <span className="text-muted-foreground">ID:</span>{' '}
                        <span className="font-medium">{(patient.identifiers as any).patient_id}</span>
                      </div>
                    )}
                    <div className="truncate">
                      <span className="text-muted-foreground">Breed:</span>{' '}
                      {patient.breed || 'Unknown'}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {filteredPatients.length === 0 && (
        <Card className="shadow-md">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              {searchQuery
                ? 'No patients found matching your search'
                : `No patients seen on ${format(selectedDate, 'MMMM d, yyyy')}`}
            </p>
            {canCreateConsult ? (
              <QuickConsultDialog />
            ) : (
              <AddPatientDialog />
            )}
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Card className="mt-6 border-border/50">
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
                Showing <span className="font-medium text-foreground">{startIndex + 1}</span> to{' '}
                <span className="font-medium text-foreground">{Math.min(endIndex, sortedPatients.length)}</span> of{' '}
                <span className="font-medium text-foreground">{sortedPatients.length}</span> patients
              </p>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="h-9"
                >
                  {isMobile ? (
                    <ChevronLeft className="h-4 w-4" />
                  ) : (
                    <>
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Previous
                    </>
                  )}
                </Button>
                <span className="text-xs sm:text-sm text-muted-foreground px-2 whitespace-nowrap">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="h-9"
                >
                  {isMobile ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <>
                      Next
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}