-- Index on original_transaction_id for efficient App Store Server Notification lookups.
-- The webhook handler needs to find subscriptions by original_transaction_id to update
-- subscription status when Apple sends renewal/expiration/refund notifications.

create index if not exists idx_user_subscriptions_original_transaction_id
  on user_subscriptions (original_transaction_id)
  where original_transaction_id is not null;
