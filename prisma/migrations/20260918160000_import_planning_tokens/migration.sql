ALTER TABLE "Container" ADD COLUMN "routeDurationSeconds" INTEGER,
  ADD COLUMN "operationalMarginSeconds" INTEGER,
  ADD COLUMN "truckVehicleId" TEXT,
  ADD COLUMN "trailerVehicleId" TEXT;

CREATE TABLE "Vehicle" (
  "id" TEXT NOT NULL,
  "plate" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Vehicle_plate_key" ON "Vehicle"("plate");

-- Preserve existing freight records; register normalized existing plates once.
INSERT INTO "Vehicle" ("id", "plate")
SELECT 'vehicle_' || md5(plate), plate FROM (
  SELECT DISTINCT upper(regexp_replace(coalesce("truckPlate", ''), '[^a-zA-Z0-9]', '', 'g')) AS plate FROM "Container"
  UNION
  SELECT DISTINCT upper(regexp_replace(coalesce("trailerPlate", ''), '[^a-zA-Z0-9]', '', 'g')) AS plate FROM "Container"
) plates WHERE plate <> '' ON CONFLICT DO NOTHING;
UPDATE "Container" c SET "truckVehicleId" = v.id FROM "Vehicle" v
WHERE v.plate = upper(regexp_replace(coalesce(c."truckPlate", ''), '[^a-zA-Z0-9]', '', 'g'));
UPDATE "Container" c SET "trailerVehicleId" = v.id FROM "Vehicle" v
WHERE v.plate = upper(regexp_replace(coalesce(c."trailerPlate", ''), '[^a-zA-Z0-9]', '', 'g'));
ALTER TABLE "Container" ADD CONSTRAINT "Container_truckVehicleId_fkey" FOREIGN KEY ("truckVehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Container" ADD CONSTRAINT "Container_trailerVehicleId_fkey" FOREIGN KEY ("trailerVehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IntegrationState" ADD COLUMN "encryptedToken" TEXT,
  ADD COLUMN "tokenExpiresAt" TIMESTAMP(3), ADD COLUMN "credentialFingerprint" TEXT;
