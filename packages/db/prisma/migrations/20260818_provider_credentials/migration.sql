-- Settings-managed provider credentials.
-- The key column holds AES-256-GCM ciphertext; key_hint holds a masked form
-- that is safe to display. Plaintext is never stored.
ALTER TABLE "ProviderConfig" ADD COLUMN IF NOT EXISTS "baseUrl" TEXT;
ALTER TABLE "ProviderConfig" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "ProviderConfig" ADD COLUMN IF NOT EXISTS "encryptedApiKey" TEXT;
ALTER TABLE "ProviderConfig" ADD COLUMN IF NOT EXISTS "keyHint" TEXT;
ALTER TABLE "ProviderConfig" ADD COLUMN IF NOT EXISTS "costWeight" INTEGER NOT NULL DEFAULT 10;
