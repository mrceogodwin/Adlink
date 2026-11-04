CREATE TABLE IF NOT EXISTS payout_request_items (
  payout_request_id uuid NOT NULL REFERENCES payout_requests(id) ON DELETE CASCADE,
  earning_id uuid NOT NULL UNIQUE REFERENCES publisher_earnings(id),
  PRIMARY KEY (payout_request_id, earning_id)
);
