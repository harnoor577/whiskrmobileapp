import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseClinicalSummaryResult {
  summary: string | null;
  loading: boolean;
  error: string | null;
  regenerate: () => void;
}

export function useClinicalSummary(
  consultId: string,
  existingSummary?: string | null
): UseClinicalSummaryResult {
  const [summary, setSummary] = useState<string | null>(existingSummary || null);
  const [loading, setLoading] = useState(!existingSummary);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!consultId) return;
    
    setLoading(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'generate-clinical-summary',
        { body: { consultId } }
      );

      if (invokeError) {
        throw invokeError;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.summary) {
        setSummary(data.summary);
      }
    } catch (err) {
      console.error('Error fetching clinical summary:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setLoading(false);
    }
  }, [consultId]);

  useEffect(() => {
    // Only fetch if we don't have an existing summary
    if (!existingSummary && consultId) {
      fetchSummary();
    }
  }, [consultId, existingSummary, fetchSummary]);

  const regenerate = useCallback(() => {
    setSummary(null);
    fetchSummary();
  }, [fetchSummary]);

  return { summary, loading, error, regenerate };
}
