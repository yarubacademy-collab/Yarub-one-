-- Separate STT model for speech providers.
ALTER TABLE "ProviderConfig" ADD COLUMN IF NOT EXISTS "sttModel" TEXT;

-- Credit grants. Debits are derived from "UsageLog", never stored twice.
CREATE TABLE IF NOT EXISTS "CreditGrant" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "credits"   DECIMAL(14,4) NOT NULL,
  "reason"    TEXT NOT NULL,
  "source"    TEXT NOT NULL DEFAULT 'manual',
  "expiresAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "CreditGrant_userId_createdAt_idx"
  ON "CreditGrant" ("userId", "createdAt");
