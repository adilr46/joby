-- Application outcome semantics.
--
-- `kind` stays as the coarse Y_n world-response bucket. `canonical_type` carries the more precise
-- outcome meaning accepted at the boundary (for example `offer_declined` versus `no_response`),
-- and `feedback` preserves verbatim recruiter/interviewer feedback as Application history.

ALTER TABLE application_outcome
  ADD COLUMN canonical_type text CHECK (
    canonical_type IS NULL OR canonical_type IN (
      'interview_progress',
      'interview_only',
      'offer_received',
      'hired',
      'offer_declined',
      'rejected',
      'no_response'
    )
  ),
  ADD COLUMN feedback text;
