/**
 * Formats a display name with an optional prefix (e.g., "Dr.", "Mr.", "Ms.")
 * @param name - The user's full name
 * @param prefix - The name prefix (e.g., "Dr.", "Mr.", "Ms.", "Mrs.", or "None"/empty)
 * @param shortened - If true, returns only the first name (for mobile displays)
 * @returns The formatted display name with prefix, or just the name if no valid prefix
 */
export function formatDisplayName(
  name: string | null | undefined,
  prefix: string | null | undefined,
  shortened: boolean = false
): string {
  if (!name) return 'Unknown';
  
  // Extract first name if shortened is requested
  const displayName = shortened 
    ? name.trim().split(/\s+/)[0] || name 
    : name;
  
  // If prefix is "None", empty, or null, return just the name
  if (!prefix || prefix === 'None' || prefix === '') {
    return displayName;
  }
  
  return `${prefix} ${displayName}`;
}
