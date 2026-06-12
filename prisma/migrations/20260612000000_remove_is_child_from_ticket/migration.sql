-- Remove the `is_child` flag from tickets.
-- This only drops a single column; all rows and other columns are preserved.
ALTER TABLE "tickets" DROP COLUMN "is_child";
