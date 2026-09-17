ALTER TABLE "Position"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'DEVICE',
ADD COLUMN "externalId" TEXT;

CREATE UNIQUE INDEX "Position_source_externalId_key"
ON "Position"("source", "externalId");

CREATE TABLE "IntegrationState" (
    "provider" TEXT NOT NULL,
    "cursor" BIGINT,
    "lockedUntil" TIMESTAMP(3),
    "lastStartedAt" TIMESTAMP(3),
    "lastSucceededAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastSummary" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationState_pkey" PRIMARY KEY ("provider")
);
