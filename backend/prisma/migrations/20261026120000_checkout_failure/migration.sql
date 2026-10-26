ALTER TYPE "CheckoutSessionStatus" ADD VALUE 'FAILED';

ALTER TABLE "checkout_sessions" ADD COLUMN "failure_reason" TEXT;
