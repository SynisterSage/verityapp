-- Track one-time post-call review push delivery state per call.
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS review_push_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_calls_review_push_sent_at
  ON calls(review_push_sent_at)
  WHERE review_push_sent_at IS NOT NULL;
