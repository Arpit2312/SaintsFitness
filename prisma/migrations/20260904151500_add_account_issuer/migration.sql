-- Add the "issuer" column required by better-auth@1.7.2's Account schema
-- (see node_modules/@better-auth/core/dist/db/schema/account.mjs). It was
-- missing from the Task 4 schema, which was written before the actual
-- better-auth package was installed and inspected. Without it, every
-- credential-account lookup in better-auth's internal adapter
-- (findCredentialAccount / updatePassword / findAccountByKey in
-- node_modules/better-auth/dist/db/internal-adapter.mjs) fails to match any
-- row, causing all password sign-ins to 401 regardless of correct
-- credentials.
--
-- Added nullable first, then backfilled, then constrained NOT NULL, because
-- an existing (currently broken/unusable) seeded Account row predates this
-- column and Postgres cannot add a NOT NULL column with no default to a
-- non-empty table in one step.

-- AlterTable
ALTER TABLE "Account" ADD COLUMN "issuer" TEXT;

-- Backfill: better-auth's local credential issuer format is
-- `local:${encodeURIComponent(providerId)}` (createLocalAccountIssuer in
-- node_modules/@better-auth/core/dist/db/schema/account.mjs). This app only
-- uses the "credential" provider (no OAuth providers configured), and
-- providerId values never contain characters that need percent-encoding,
-- so `'local:' || "providerId"` reproduces exactly what better-auth would
-- have written had this column existed at row-creation time.
UPDATE "Account" SET "issuer" = 'local:' || "providerId" WHERE "issuer" IS NULL;

-- AlterTable
ALTER TABLE "Account" ALTER COLUMN "issuer" SET NOT NULL;
