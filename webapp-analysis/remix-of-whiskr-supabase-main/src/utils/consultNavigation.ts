/**
 * Determines the appropriate editor path for a consult based on its status and data
 */
export function getConsultEditorPath(consult: {
  id: string;
  status?: string | null;
  soap_s?: string | null;
  soap_o?: string | null;
  soap_a?: string | null;
  soap_p?: string | null;
  case_notes?: string | null;
  original_input?: string | null;
}): string {
  // Final consults go to case summary
  if (consult.status === 'finalized') {
    return `/case-summary/${consult.id}`;
  }
  
  // Check for existing SOAP data
  const hasSOAP = consult.soap_s || consult.soap_o || consult.soap_a || consult.soap_p;
  
  // Check for wellness or procedure data in case_notes
  let hasWellness = false;
  let hasProcedure = false;
  
  if (consult.case_notes) {
    try {
      const parsed = JSON.parse(consult.case_notes);
      hasWellness = !!parsed.wellness;
      hasProcedure = !!parsed.procedure;
    } catch {
      // Not valid JSON, ignore
    }
  }
  
  // Route to appropriate editor based on existing data
  if (hasSOAP) return `/soap-editor/${consult.id}`;
  if (hasWellness) return `/wellness-editor/${consult.id}`;
  if (hasProcedure) return `/procedure-editor/${consult.id}`;
  
  // Draft with no report data - go to SOAP editor (will auto-generate if original_input exists)
  return `/soap-editor/${consult.id}`;
}
