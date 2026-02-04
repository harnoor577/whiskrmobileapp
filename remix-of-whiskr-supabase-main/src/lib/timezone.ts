import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

/**
 * Get the user's local timezone from browser
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Format a date string in the user's local timezone
 * @param date - ISO date string or Date object
 * @param formatStr - date-fns format string (default: 'MMM d, yyyy h:mm a')
 * @param timezone - Optional timezone (defaults to user's browser timezone)
 */
export function formatInLocalTime(
  date: string | Date,
  formatStr: string = 'MMM d, yyyy h:mm a',
  timezone?: string
): string {
  const tz = timezone || getUserTimezone();
  return formatInTimeZone(date, tz, formatStr);
}

/**
 * Convert a UTC date to user's local timezone
 * @param date - UTC date string or Date object
 * @param timezone - Optional timezone (defaults to user's browser timezone)
 */
export function toLocalTime(date: string | Date, timezone?: string): Date {
  const tz = timezone || getUserTimezone();
  return toZonedTime(date, tz);
}

/**
 * Get current date/time in user's local timezone as ISO string
 */
export function nowInLocalTimezone(): string {
  const tz = getUserTimezone();
  const now = new Date();
  return toZonedTime(now, tz).toISOString();
}
