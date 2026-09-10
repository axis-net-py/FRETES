CREATE TABLE "Client" (
 "id" TEXT NOT NULL, "name" TEXT NOT NULL, "whatsapp" TEXT NOT NULL, "consent" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Driver" (
 "id" TEXT NOT NULL, "name" TEXT NOT NULL, "phone" TEXT NOT NULL, "plate" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Geofence" (
 "id" TEXT NOT NULL, "name" TEXT NOT NULL, "latitude" DOUBLE PRECISION NOT NULL, "longitude" DOUBLE PRECISION NOT NULL, "radiusM" INTEGER NOT NULL DEFAULT 300, "status" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Geofence_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Container" (
 "id" TEXT NOT NULL, "code" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'EM_TRANSITO', "origin" TEXT, "destination" TEXT, "clientId" TEXT NOT NULL, "driverId" TEXT, "geofenceId" TEXT, "trackingTokenHash" TEXT, "trackingExpiresAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Position" (
 "id" TEXT NOT NULL, "driverId" TEXT NOT NULL, "containerId" TEXT, "latitude" DOUBLE PRECISION NOT NULL, "longitude" DOUBLE PRECISION NOT NULL, "accuracyM" DOUBLE PRECISION, "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "GeofenceEvent" (
 "id" TEXT NOT NULL, "geofenceId" TEXT NOT NULL, "containerId" TEXT NOT NULL, "type" TEXT NOT NULL, "latitude" DOUBLE PRECISION NOT NULL, "longitude" DOUBLE PRECISION NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "GeofenceEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Notification" (
 "id" TEXT NOT NULL, "containerId" TEXT NOT NULL, "to" TEXT NOT NULL, "body" TEXT NOT NULL, "channel" TEXT NOT NULL DEFAULT 'whatsapp', "provider" TEXT NOT NULL, "status" TEXT NOT NULL, "error" TEXT, "providerRef" TEXT, "parameters" TEXT NOT NULL DEFAULT '[]', "attempts" INTEGER NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LoginAttempt" (
 "key" TEXT NOT NULL, "count" INTEGER NOT NULL DEFAULT 1, "expiresAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("key")
);
CREATE UNIQUE INDEX "Container_code_key" ON "Container"("code");
CREATE UNIQUE INDEX "Container_trackingTokenHash_key" ON "Container"("trackingTokenHash");
CREATE INDEX "Position_driverId_recordedAt_idx" ON "Position"("driverId", "recordedAt");
CREATE INDEX "GeofenceEvent_geofenceId_containerId_createdAt_idx" ON "GeofenceEvent"("geofenceId", "containerId", "createdAt");
CREATE UNIQUE INDEX "GeofenceEvent_geofenceId_containerId_type_key" ON "GeofenceEvent"("geofenceId", "containerId", "type");
ALTER TABLE "Container" ADD CONSTRAINT "Container_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Container" ADD CONSTRAINT "Container_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Position" ADD CONSTRAINT "Position_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GeofenceEvent" ADD CONSTRAINT "GeofenceEvent_geofenceId_fkey" FOREIGN KEY ("geofenceId") REFERENCES "Geofence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GeofenceEvent" ADD CONSTRAINT "GeofenceEvent_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

