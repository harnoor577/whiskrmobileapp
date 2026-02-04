import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  isAfter,
} from 'date-fns';

interface DatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  maxDate?: Date;
  minDate?: Date;
}

export function DatePickerModal({
  visible,
  onClose,
  selectedDate,
  onSelectDate,
  maxDate,
  minDate,
}: DatePickerModalProps) {
  const [currentMonth, setCurrentMonth] = useState(selectedDate);

  const renderHeader = () => {
    return (
      <View style={styles.calendarHeader}>
        <TouchableOpacity
          onPress={() => setCurrentMonth(subMonths(currentMonth, 1))}
          style={styles.navButton}
        >
          <Ionicons name="chevron-back" size={24} color="#64748b" />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{format(currentMonth, 'MMMM yyyy')}</Text>
        <TouchableOpacity
          onPress={() => setCurrentMonth(addMonths(currentMonth, 1))}
          style={styles.navButton}
        >
          <Ionicons name="chevron-forward" size={24} color="#64748b" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderDays = () => {
    const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    return (
      <View style={styles.daysRow}>
        {days.map((day) => (
          <View key={day} style={styles.dayLabel}>
            <Text style={styles.dayLabelText}>{day}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const cloneDay = day;
        const isCurrentMonth = isSameMonth(day, monthStart);
        const isSelected = isSameDay(day, selectedDate);
        const isDisabled =
          (maxDate && isAfter(day, maxDate)) ||
          (minDate && isAfter(minDate, day)) ||
          !isCurrentMonth;

        days.push(
          <TouchableOpacity
            key={day.toString()}
            style={[
              styles.cell,
              isSelected && styles.cellSelected,
              isDisabled && styles.cellDisabled,
            ]}
            onPress={() => !isDisabled && onSelectDate(cloneDay)}
            disabled={isDisabled}
          >
            <Text
              style={[
                styles.cellText,
                !isCurrentMonth && styles.cellTextOtherMonth,
                isSelected && styles.cellTextSelected,
                isDisabled && styles.cellTextDisabled,
              ]}
            >
              {format(day, 'd')}
            </Text>
          </TouchableOpacity>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <View key={day.toString()} style={styles.row}>
          {days}
        </View>
      );
      days = [];
    }
    return <View>{rows}</View>;
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Select Date</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Calendar */}
          <View style={styles.calendar}>
            {renderHeader()}
            {renderDays()}
            {renderCells()}
          </View>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickButton}
              onPress={() => onSelectDate(new Date())}
            >
              <Text style={styles.quickButtonText}>Today</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 340,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#101235',
  },
  closeButton: {
    padding: 4,
  },
  calendar: {
    padding: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  navButton: {
    padding: 8,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#101235',
  },
  daysRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dayLabel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  dayLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    margin: 2,
  },
  cellSelected: {
    backgroundColor: '#1ce881',
  },
  cellDisabled: {
    opacity: 0.3,
  },
  cellText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#101235',
  },
  cellTextOtherMonth: {
    color: '#cbd5e1',
  },
  cellTextSelected: {
    color: '#101235',
    fontWeight: '700',
  },
  cellTextDisabled: {
    color: '#cbd5e1',
  },
  quickActions: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  quickButton: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  quickButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1ce881',
  },
});
