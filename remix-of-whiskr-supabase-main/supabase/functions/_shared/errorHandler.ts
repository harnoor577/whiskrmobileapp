/**
 * Centralized error sanitization for edge functions
 * Prevents detailed error messages from leaking to clients
 */

export interface SanitizedError {
  error: string;
  code: string;
}

/**
 * Sanitizes errors for client response
 * Logs full error details server-side for debugging
 * Returns generic message to prevent information disclosure
 */
export function sanitizeError(error: unknown, context?: string): SanitizedError {
  // Log full error details server-side only
  const logPrefix = context ? `[${context}]` : '[FUNCTION]';
  console.error(`${logPrefix} Error:`, error);
  
  // Return generic error to client
  return {
    error: 'An error occurred processing your request',
    code: 'INTERNAL_ERROR'
  };
}

/**
 * Sanitizes validation errors
 * Returns field-level errors without exposing implementation details
 */
export function sanitizeValidationError(errors: Array<{ path: string[]; message: string }>): SanitizedError {
  console.error('[VALIDATION] Validation failed:', errors);
  
  const fieldNames = errors.map(e => e.path.join('.')).join(', ');
  return {
    error: `Validation failed for: ${fieldNames}`,
    code: 'VALIDATION_ERROR'
  };
}
