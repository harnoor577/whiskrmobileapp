-- Add explicit restrictive policies to prevent UPDATE and DELETE on audit_events
-- This makes the immutability of audit logs explicit and clear

-- Explicit policy: No one can update audit events (immutable logs)
CREATE POLICY "Audit events are immutable - no updates allowed"
ON public.audit_events
FOR UPDATE
TO authenticated
USING (false);

-- Explicit policy: No one can delete audit events (permanent records)
CREATE POLICY "Audit events are permanent - no deletes allowed"
ON public.audit_events
FOR DELETE
TO authenticated
USING (false);