ALTER TABLE "Geofence" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'CHECKPOINT',
  ADD COLUMN "notifyOnEnter" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyOnExit" BOOLEAN NOT NULL DEFAULT false;

-- The pre-existing Paranaguá gate drives the port exit flow.
UPDATE "Geofence" SET "kind" = 'PORT_EXIT', "notifyOnEnter" = false, "notifyOnExit" = true
WHERE "name" LIKE '%Paranaguá%' AND "kind" = 'CHECKPOINT';
