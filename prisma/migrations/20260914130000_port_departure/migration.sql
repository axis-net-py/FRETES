ALTER TABLE "Container" ADD COLUMN "transitHours" INTEGER,
ADD COLUMN "gateEnteredAt" TIMESTAMP(3), ADD COLUMN "exitCandidateAt" TIMESTAMP(3),
ADD COLUMN "lastGeofenceFixAt" TIMESTAMP(3), ADD COLUMN "departedAt" TIMESTAMP(3),
ADD COLUMN "estimatedArrivalAt" TIMESTAMP(3), ADD COLUMN "customerTrackingHash" TEXT,
ADD COLUMN "customerTrackingExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Container_customerTrackingHash_key" ON "Container"("customerTrackingHash");
ALTER TABLE "Notification" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'STATUS';
