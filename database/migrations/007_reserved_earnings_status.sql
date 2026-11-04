-- Allow earnings to be reserved while a payout request is awaiting review.
ALTER TABLE publisher_earnings DROP CONSTRAINT IF EXISTS publisher_earnings_status_check;
ALTER TABLE publisher_earnings
  ADD CONSTRAINT publisher_earnings_status_check
  CHECK (status IN ('pending','available','reserved','paid','reversed'));
