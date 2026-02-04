import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { supabase } from '../../src/lib/supabase';
import { Button } from '../../src/components/ui/Button';
import { getSpeciesColor, getSpeciesIcon } from '../../src/utils/colors';
import { AddPatientModal } from '../../src/components/patient/AddPatientModal';
import { QuickConsultModal } from '../../src/components/consult/QuickConsultModal';
import { format, addDays, subDays, isSameDay, isToday, startOfDay } from 'date-fns';
import { DatePickerModal } from '../../src/components/ui/DatePickerModal';

interface Patient {
  id: string;
  name: string;
  species: string;
  breed?: string;
  created_at: string;
  identifiers?: { patient_id?: string };
  consults?: Array<{
    started_at?: string;
    chat_messages?: Array<{ content: string }>;
  }>;
  lastConsultDate?: string;
}

// Check if patient has euthanasia consult
const hasEuthanasiaConsult = (consults: any[]): boolean => {
  if (!consults || consults.length === 0) return false;
  
  const euthanasiaKeywords = ['euthanasia', 'euthanized', 'put to sleep', 'passed away', 'end of life', 'humane euthanasia'];
  
  return consults.some(consult => {
    const messages = consult.chat_messages || [];
    return messages.some((msg: any) => {
      const content = (msg.content || '').toLowerCase();
      return euthanasiaKeywords.some(keyword => content.includes(keyword));
    });
  });
};

export default function PatientsScreen() {
  const router = useRouter();
  const { clinicId, user } = useAuthStore();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [showQuickConsult, setShowQuickConsult] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  
  const itemsPerPage = 10; // Mobile optimized

  const fetchPatients = useCallback(async () => {
    if (!clinicId) return;

    try {
      // Fetch patients with their consults
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
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const patientsWithConsults = data.map((patient: any) => ({
          ...patient,
          lastConsultDate: patient.consults?.[0]?.started_at || undefined,
          consults: patient.consults || [],
        }));
        setPatients(patientsWithConsults);
      }
    } catch (error) {
      console.error('Error fetching patients:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clinicId]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  // Filter patients by search and date
  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      const query = searchQuery.toLowerCase();
      const patientId = patient.identifiers?.patient_id || '';

      // Text search filter
      const matchesSearch =
        !searchQuery ||
        patient.name.toLowerCase().includes(query) ||
        patient.species.toLowerCase().includes(query) ||
        (patient.breed && patient.breed.toLowerCase().includes(query)) ||
        patientId.toLowerCase() === query;

      // Date filter - check if patient was seen or created on selected date
      const patientDate = patient.lastConsultDate
        ? startOfDay(new Date(patient.lastConsultDate))
        : startOfDay(new Date(patient.created_at));
      const matchesDate = isSameDay(patientDate, selectedDate);

      return matchesSearch && matchesDate;
    });
  }, [patients, searchQuery, selectedDate]);

  // Paginate
  const totalPages = Math.ceil(filteredPatients.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedPatients = filteredPatients.slice(startIndex, startIndex + itemsPerPage);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedDate]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPatients();
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    setSelectedDate((prev) =>
      direction === 'prev' ? subDays(prev, 1) : addDays(prev, 1)
    );
  };

  const goToToday = () => {
    setSelectedDate(startOfDay(new Date()));
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1ce881" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Patients</Text>
          <Text style={styles.subtitle}>Manage patient records</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowQuickConsult(true)}
        >
          <Ionicons name="add" size={24} color="#101235" />
        </TouchableOpacity>
      </View>

      {/* Date Stepper */}
      <View style={styles.dateStepperContainer}>
        <View style={styles.dateStepper}>
          <TouchableOpacity
            style={styles.dateNavButton}
            onPress={() => navigateDate('prev')}
          >
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={16} color="#ffffff" />
            <Text style={styles.dateText}>{format(selectedDate, 'MMM d, yyyy')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.dateNavButton, isToday(selectedDate) && styles.dateNavButtonDisabled]}
            onPress={() => navigateDate('next')}
            disabled={isToday(selectedDate)}
          >
            <Ionicons
              name="chevron-forward"
              size={20}
              color={isToday(selectedDate) ? 'rgba(255,255,255,0.4)' : '#ffffff'}
            />
          </TouchableOpacity>

          {!isToday(selectedDate) && (
            <TouchableOpacity style={styles.todayButton} onPress={goToToday}>
              <Text style={styles.todayText}>Today</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#64748b" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, species, breed, ID..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#64748b" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Patients List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1ce881" />
        }
      >
        {filteredPatients.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="paw" size={64} color="#e2e8f0" />
            <Text style={styles.emptyTitle}>
              {searchQuery
                ? 'No patients found'
                : `No patients on ${format(selectedDate, 'MMMM d, yyyy')}`}
            </Text>
            <Text style={styles.emptyText}>
              {searchQuery ? 'Try a different search' : 'Try selecting a different date'}
            </Text>
            <Button
              title="Add Patient"
              onPress={() => setShowAddPatient(true)}
              style={{ marginTop: 16 }}
              size="sm"
            />
          </View>
        ) : (
          <>
            {/* Results Count */}
            <Text style={styles.resultsCount}>
              {filteredPatients.length} patient{filteredPatients.length !== 1 ? 's' : ''} on{' '}
              {format(selectedDate, 'MMM d')}
            </Text>

            {/* Patient Cards */}
            <View style={styles.patientsList}>
              {paginatedPatients.map((patient) => {
                const isEuthanized = hasEuthanasiaConsult(patient.consults || []);
                const SpeciesIcon = getSpeciesIcon(patient.species);

                return (
                  <TouchableOpacity
                    key={patient.id}
                    style={styles.patientCard}
                    onPress={() => router.push(`/(tabs)/patients?id=${patient.id}`)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.patientCardHeader}>
                      <View style={styles.patientNameRow}>
                        <Text style={styles.patientName} numberOfLines={1}>
                          {patient.name}
                        </Text>
                        {isEuthanized && (
                          <View style={styles.passedBadge}>
                            <Ionicons name="heart" size={10} color="#9333ea" />
                            <Text style={styles.passedBadgeText}>Passed</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.speciesRow}>
                        <Ionicons
                          name={SpeciesIcon as any}
                          size={14}
                          color="#64748b"
                        />
                        <Text style={styles.speciesText}>{patient.species}</Text>
                      </View>
                    </View>

                    <View style={styles.patientCardContent}>
                      {patient.identifiers?.patient_id && (
                        <Text style={styles.patientMeta}>
                          <Text style={styles.metaLabel}>ID: </Text>
                          <Text style={styles.metaValue}>
                            {patient.identifiers.patient_id}
                          </Text>
                        </Text>
                      )}
                      <Text style={styles.patientMeta}>
                        <Text style={styles.metaLabel}>Breed: </Text>
                        <Text style={styles.metaValue}>
                          {patient.breed || 'Unknown'}
                        </Text>
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Pagination */}
            {totalPages > 1 && (
              <View style={styles.pagination}>
                <Text style={styles.paginationText}>
                  Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredPatients.length)} of{' '}
                  {filteredPatients.length}
                </Text>
                <View style={styles.paginationButtons}>
                  <TouchableOpacity
                    style={[styles.pageButton, currentPage === 1 && styles.pageButtonDisabled]}
                    onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={18}
                      color={currentPage === 1 ? '#cbd5e1' : '#64748b'}
                    />
                  </TouchableOpacity>
                  <Text style={styles.pageIndicator}>
                    {currentPage} / {totalPages}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.pageButton,
                      currentPage === totalPages && styles.pageButtonDisabled,
                    ]}
                    onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={currentPage === totalPages ? '#cbd5e1' : '#64748b'}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}

        {/* Bottom padding for tab bar */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Date Picker Modal */}
      <DatePickerModal
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        selectedDate={selectedDate}
        onSelectDate={(date) => {
          setSelectedDate(startOfDay(date));
          setShowDatePicker(false);
        }}
        maxDate={new Date()}
      />

      {/* Add Patient Modal */}
      <AddPatientModal
        visible={showAddPatient}
        onClose={() => setShowAddPatient(false)}
        onSuccess={() => {
          setShowAddPatient(false);
          fetchPatients();
        }}
      />

      {/* Quick Consult Modal */}
      <QuickConsultModal
        visible={showQuickConsult}
        onClose={() => setShowQuickConsult(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafbfc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafbfc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#101235',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1ce881',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Date Stepper
  dateStepperContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  dateStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1ce881',
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  dateNavButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
  },
  dateNavButtonDisabled: {
    opacity: 0.5,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  todayButton: {
    marginLeft: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  todayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  // Search
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: '#101235',
  },
  // Content
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  resultsCount: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 12,
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#101235',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
    textAlign: 'center',
  },
  // Patient Cards
  patientsList: {
    gap: 10,
  },
  patientCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  patientCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  patientNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101235',
    flexShrink: 1,
  },
  passedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(147, 51, 234, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  passedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9333ea',
  },
  speciesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  speciesText: {
    fontSize: 12,
    color: '#64748b',
  },
  patientCardContent: {
    gap: 2,
  },
  patientMeta: {
    fontSize: 13,
  },
  metaLabel: {
    color: '#64748b',
  },
  metaValue: {
    color: '#101235',
    fontWeight: '500',
  },
  // Pagination
  pagination: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paginationText: {
    fontSize: 12,
    color: '#64748b',
  },
  paginationButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageButtonDisabled: {
    backgroundColor: '#f8fafc',
  },
  pageIndicator: {
    fontSize: 13,
    color: '#64748b',
    minWidth: 50,
    textAlign: 'center',
  },
});
