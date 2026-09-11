ALTER TABLE "Container" ADD COLUMN "crt" TEXT, ADD COLUMN "micDta" TEXT,
ADD COLUMN "truckPlate" TEXT, ADD COLUMN "trailerPlate" TEXT,
ADD COLUMN "freightValue" TEXT, ADD COLUMN "freightCurrency" TEXT, ADD COLUMN "seal" TEXT;
CREATE TABLE "TripDocument" (
 "id" TEXT NOT NULL PRIMARY KEY, "filename" TEXT NOT NULL,
 "mimeType" TEXT NOT NULL, "content" BYTEA NOT NULL, "sha256" TEXT NOT NULL,
 "extracted" JSONB NOT NULL, "containerId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TripDocument_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TripDocument_sha256_key" ON "TripDocument"("sha256");
CREATE UNIQUE INDEX "TripDocument_containerId_key" ON "TripDocument"("containerId");
