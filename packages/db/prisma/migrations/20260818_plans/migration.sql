-- Roles, plans, subscriptions and billing history.
DO $$ BEGIN CREATE TYPE "Role" AS ENUM ('USER','ADMIN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SubscriptionStatus" AS ENUM ('active','grace','expired','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" "Role" NOT NULL DEFAULT 'USER';

CREATE TABLE IF NOT EXISTS "Plan" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "priceMinor" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "promoPriceMinor" INTEGER,
  "promoEndsAt" TIMESTAMP,
  "intervalDays" INTEGER NOT NULL DEFAULT 30,
  "imageQuota" INTEGER NOT NULL DEFAULT 2,
  "videoQuota" INTEGER NOT NULL DEFAULT 2,
  "maxVideoSeconds" INTEGER NOT NULL DEFAULT 10,
  "websiteQuota" INTEGER NOT NULL DEFAULT 1,
  "gameQuota" INTEGER NOT NULL DEFAULT 1,
  "documentQuota" INTEGER NOT NULL DEFAULT 5,
  "features" JSONB,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Subscription" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "planId" TEXT NOT NULL REFERENCES "Plan"("id"),
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
  "startedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "expiresAt" TIMESTAMP,
  "graceDays" INTEGER NOT NULL DEFAULT 3,
  "cancelledAt" TIMESTAMP,
  "externalRef" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "Subscription_userId_status_idx" ON "Subscription" ("userId","status");

CREATE TABLE IF NOT EXISTS "BillingEvent" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "planCode" TEXT,
  "amountMinor" INTEGER,
  "currency" TEXT,
  "provider" TEXT,
  "externalRef" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "BillingEvent_userId_createdAt_idx" ON "BillingEvent" ("userId","createdAt");
