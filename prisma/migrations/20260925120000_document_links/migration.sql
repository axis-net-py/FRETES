CREATE TABLE "DocumentLink" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "containerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentLink_documentId_containerId_key" ON "DocumentLink"("documentId", "containerId");
CREATE INDEX "DocumentLink_containerId_idx" ON "DocumentLink"("containerId");
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "TripDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve existing single-freight attachments as links.
INSERT INTO "DocumentLink" ("id", "documentId", "containerId", "createdAt")
SELECT 'doclink_' || md5("id" || "containerId"), "id", "containerId", CURRENT_TIMESTAMP
FROM "TripDocument" WHERE "containerId" IS NOT NULL ON CONFLICT DO NOTHING;

ALTER TABLE "TripDocument" DROP CONSTRAINT "TripDocument_containerId_fkey";
DROP INDEX "TripDocument_containerId_key";
ALTER TABLE "TripDocument" DROP COLUMN "containerId";
