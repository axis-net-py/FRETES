# GlobalSAT Tracking Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Ingerir posições GlobalSAT incrementalmente e acionar as geofences dos fretes vinculados por placa.

**Architecture:** Um cliente OAuth2 isolado converte respostas externas em tipos internos. Um serviço com bloqueio no PostgreSQL consulta posições atuais e históricas, processa-as em ordem e só avança o cursor após sucesso integral. GitHub Actions chama uma rota bearer a cada cinco minutos; o painel autenticado pode chamar a mesma sincronização.

**Tech Stack:** Next.js 15, TypeScript 5, Prisma 5/PostgreSQL, Zod, Node test runner, GitHub Actions e Vercel.

**Spec:** docs/superpowers/specs/2026-09-17-globalsat-integration-design.md

## Global Constraints

- Somente leitura; nunca chamar comandos GlobalSAT.
- Vínculo exato: Container.truckPlate, depois Driver.plate, ambos normalizados.
- Nunca expor credenciais, tokens ou coordenadas em logs/resumos públicos.
- No máximo três chamadas de relatório por minuto.
- GPS do celular mantém janela de 120 segundos.
- GlobalSAT usa incerteza fixa conservadora de 50 m.
- Cursor só avança após sucesso integral; celular permanece fallback.
- Cada tarefa segue RED-GREEN-REFACTOR e termina em commit.

---

### Task 1: Cliente HTTP GlobalSAT

**Files:**
- Create: src/lib/globalsat-client.ts
- Create: tests/globalsat-client.test.ts
- Modify: package.json
- Modify: .env.example

**Interfaces:**
- Produces: normalizePlate(value: string): string
- Produces: parseGlobalSatDate(value: string, gmtOffset: number): Date
- Produces: GlobalSatTarget, GlobalSatTrackedPosition, GlobalSatTrackingPage
- Produces: GlobalSatClient.listTargets() and getTrackingData()

- [ ] **Step 1: Write failing helper tests**

~~~ts
assert.equal(normalizePlate(" AAM-E814 "), "AAME814");
assert.equal(
  parseGlobalSatDate("17/09/2026 10:30:00", -3).toISOString(),
  "2026-09-17T13:30:00.000Z",
);
assert.throws(() => parseGlobalSatDate("invalid", -3));
~~~

- [ ] **Step 2: Verify RED**

Run: node --import tsx --test tests/globalsat-client.test.ts

Expected: module-not-found failure.

- [ ] **Step 3: Implement pure parsers and Zod schemas**

~~~ts
export type GlobalSatTarget = {
  id: number;
  plate: string;
  gmtOffset: number;
  position: {
    id: number;
    latitude: number;
    longitude: number;
    recordedAt: Date;
  } | null;
};
~~~

Report positions expose id, targetId, latitude, longitude and gpsTime. Reject invalid IDs, coordinates and dates.

- [ ] **Step 4: Run helper tests GREEN**

Run: node --import tsx --test tests/globalsat-client.test.ts

- [ ] **Step 5: Add failing OAuth/request tests**

With injected fetch assert POST oauth/access_token uses client_id, client_secret and grant_type=client_credentials; POST api/targets uses Bearer token; token is reused; 401 refreshes once and retries once.

- [ ] **Step 6: Run client tests RED**

Expected: GlobalSatClient missing.

- [ ] **Step 7: Implement client**

~~~ts
export class GlobalSatClient {
  constructor(
    config: { clientId: string; clientSecret: string; baseUrl?: string },
    fetcher: typeof fetch = fetch,
  );
  listTargets(): Promise<GlobalSatTarget[]>;
  getTrackingData(input: {
    targetIds: number[];
    fromId?: bigint;
    initialSince?: Date;
    limit: number;
  }): Promise<GlobalSatTrackingPage>;
}
~~~

Use form-urlencoded, one-item token array, cache until 60 seconds before expiration, AbortSignal.timeout(15000), one retry after 401 and sanitized GlobalSatError codes for AUTH, RATE_LIMITED, TIMEOUT, UPSTREAM and INVALID_RESPONSE.

- [ ] **Step 8: Test report fields**

Assert initial call sends id_targets, ini_date, limit=100, language=pt; incremental sends from_id instead of dates; 429 maps to RATE_LIMITED.

- [ ] **Step 9: Register test and env names**

Add test to npm test and append empty GLOBALSAT_CLIENT_ID, GLOBALSAT_CLIENT_SECRET and GLOBALSAT_SYNC_SECRET to .env.example. Run npm test, typecheck and lint.

- [ ] **Step 10: Commit**

~~~bash
git add src/lib/globalsat-client.ts tests/globalsat-client.test.ts package.json .env.example
git commit -m "feat: add secure GlobalSAT API client"
~~~

---

### Task 2: Idempotência e política de origem

**Files:**
- Modify: prisma/schema.prisma
- Create: prisma/migrations/20260917120000_globalsat_tracking/migration.sql
- Modify: src/lib/geofence-engine.ts
- Modify: tests/geofence.test.ts
- Modify: tests/integration.test.ts

**Interfaces:**
- Produces: PositionSource = "DEVICE" | "GLOBALSAT"
- Produces: ProcessPositionOptions = { source?: PositionSource; externalId?: string }
- Changes: processPosition(input, options?)
- Produces: IntegrationState Prisma model.

- [ ] **Step 1: Write failing time-policy tests**

~~~ts
validPositionTime(recordedAt, source, now)
~~~

Assert ten-minute-old fails for DEVICE and passes for GLOBALSAT; invalid or 31-seconds-future fails for both.

- [ ] **Step 2: Verify RED**

Run focused geofence test; expect missing helper.

- [ ] **Step 3: Implement policy**

Default DEVICE preserves -30s..120s. GLOBALSAT accepts historical fixes but rejects >30s future. /api/positions cannot accept source from JSON.

- [ ] **Step 4: Run focused test GREEN**

- [ ] **Step 5: Write failing database duplicate test**

Call processPosition twice with source GLOBALSAT and externalId 813902583. Assert one Position and no repeated event/notification.

- [ ] **Step 6: Add schema and migration**

~~~prisma
source     String @default("DEVICE")
externalId String?
@@unique([source, externalId])

model IntegrationState {
  provider        String   @id
  cursor          BigInt?
  lockedUntil     DateTime?
  lastStartedAt   DateTime?
  lastSucceededAt DateTime?
  lastError       String?
  lastSummary     Json?
  updatedAt       DateTime @updatedAt
}
~~~

Migration adds columns/default/index/table without destructive changes.

- [ ] **Step 7: Implement idempotency inside row lock**

After SELECT FOR UPDATE, return without side effects when source/externalId exists. Store fields on create and preserve lastGeofenceFixAt ordering.

- [ ] **Step 8: Generate and verify**

Run prisma generate, npm test and typecheck.

- [ ] **Step 9: Commit**

~~~bash
git add prisma src/lib/geofence-engine.ts tests/geofence.test.ts tests/integration.test.ts
git commit -m "feat: support idempotent trusted GPS positions"
~~~

---

### Task 3: Serviço de sincronização

**Files:**
- Create: src/lib/globalsat-sync.ts
- Create: tests/globalsat-sync.test.ts
- Modify: package.json

**Interfaces:**
- Consumes: GlobalSatClient, normalizePlate, processPosition, Prisma.
- Produces: GlobalSatSyncSummary and syncGlobalSat(deps?).

- [ ] **Step 1: Write failing plate matching tests**

~~~ts
matchActiveTrips(
  trips: ActiveTrip[],
  targets: GlobalSatTarget[],
): Array<{ trip: ActiveTrip; target: GlobalSatTarget }>
~~~

Assert truckPlate wins over driver plate, formatting is ignored, approximate strings do not match and unmatched plates are reported.

- [ ] **Step 2: Verify RED**

Run focused sync test; expect module missing.

- [ ] **Step 3: Implement summary contract**

~~~ts
export type GlobalSatSyncSummary = {
  status: "completed" | "already_running";
  activeTrips: number;
  matchedTrips: number;
  unmatchedPlates: string[];
  receivedPositions: number;
  processedPositions: number;
  duplicatePositions: number;
  previousCursor: string | null;
  nextCursor: string | null;
  startedAt: string;
  finishedAt: string;
};
~~~

Never include coordinates.

- [ ] **Step 4: Write failing lock/cursor tests**

Assert live lock returns already_running; lock is two minutes; API/position failure preserves cursor; success saves cursor; stored errors are fixed categories.

- [ ] **Step 5: Implement atomic lock repository**

Upsert GLOBALSAT then conditionally update expired/null lock. Release in finally. Save success timestamp, summary and cursor only after complete success.

- [ ] **Step 6: Write failing ingestion tests**

Assert only EM_TRANSITO/CHEGADA_PORTAO with driver/gate/plate; current position uses accuracy 50/external ID; report positions sorted; limit 100; max two pages; cursor or 15-minute initial window; duplicate accounting; no report call without matches.

- [ ] **Step 7: Implement orchestration**

~~~ts
syncGlobalSat(deps: {
  client?: GlobalSatClient;
  repository?: GlobalSatSyncRepository;
  process?: typeof processPosition;
  now?: () => Date;
} = {}): Promise<GlobalSatSyncSummary>
~~~

Fetch targets once and up to two history pages. Combine history with current snapshots, remove repeated external IDs, order fixes chronologically per trip and only then process them. Convert gpsTime with target gmtOffset. Call processPosition with source GLOBALSAT, externalId and accuracyM 50.

- [ ] **Step 8: Register and verify**

Add focused test to npm test; run npm test, typecheck and lint.

- [ ] **Step 9: Commit**

~~~bash
git add src/lib/globalsat-sync.ts tests/globalsat-sync.test.ts package.json
git commit -m "feat: synchronize GlobalSAT positions"
~~~

---

### Task 4: Rotas protegidas

**Files:**
- Create: src/lib/sync-secret.ts
- Create: src/app/api/integrations/globalsat/cron/route.ts
- Create: src/app/api/integrations/globalsat/sync/route.ts
- Create: tests/globalsat-routes.test.ts
- Modify: src/middleware.ts
- Modify: package.json

**Interfaces:**
- Produces: validSyncSecret(header: string | null): boolean
- Cron POST is bearer-protected.
- Admin POST is protected by existing cookie middleware.

- [ ] **Step 1: Write failing constant-time secret tests**

Correct bearer passes; missing/malformed/altered fail. Require SHA-256 digest plus timingSafeEqual.

- [ ] **Step 2: Verify RED**

Run focused routes test.

- [ ] **Step 3: Implement verifier**

Reject missing/shorter-than-32 config. Hash both sides and compare. Never log values.

- [ ] **Step 4: Write failing route tests**

Cron without bearer returns 401/no sync; valid returns summary; admin delegates; upstream rate limit gives generic 503; unexpected gives generic 500; no-store always.

- [ ] **Step 5: Implement routes/middleware**

Return 200 complete, 202 already running. Exempt only /api/integrations/globalsat/cron from cookie middleware; handler owns bearer auth. Keep admin path protected.

- [ ] **Step 6: Verify and commit**

Run npm test, typecheck, lint; commit exact route, verifier, middleware and test files with message feat: expose protected GlobalSAT sync routes.

---

### Task 5: Agendamento e painel

**Files:**
- Create: .github/workflows/globalsat-sync.yml
- Modify: src/lib/dashboard.ts
- Modify: src/components/dashboard.tsx
- Modify: tests/globalsat-sync.test.ts

**Interfaces:**
- Workflow consumes GLOBALSAT_SYNC_URL and GLOBALSAT_SYNC_SECRET secrets.
- Dashboard exposes only lastSucceededAt, lastError, matchedTrips and unmatchedPlates.
- Dashboard calls admin sync at most once per minute.

- [ ] **Step 1: Write failing sanitized-state test**

Assert the four allowed fields exist and cursor, lock, token, credentials and coordinates do not.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement sanitized dashboard state**

Read IntegrationState GLOBALSAT; parse allowed fields; default safely.

- [ ] **Step 4: Implement browser trigger**

Keep 30-second router refresh. Separate effect POSTs admin sync at mount/every 60 seconds outside demo, with AbortController cleanup. Accept 202 and show only generic failure. Render timestamp/first-sync/unmatched count.

- [ ] **Step 5: Add workflow**

Create schedule cron "*/5 * * * *", workflow_dispatch and concurrency group globalsat-production-sync. In one Ubuntu job, assert both secrets nonempty and curl POST GLOBALSAT_SYNC_URL with Bearer GLOBALSAT_SYNC_SECRET, max-time 55, retry 2 and fail-with-body. GitHub expressions must reference secrets.GLOBALSAT_SYNC_URL and secrets.GLOBALSAT_SYNC_SECRET; no literal values.

- [ ] **Step 6: Verify and commit**

Run npm test, typecheck, lint and build. Commit workflow/dashboard/tests with message feat: schedule and surface GlobalSAT synchronization.

---

### Task 6: Integração, documentação e entrega

**Files:**
- Modify: README.md
- Modify: tests/integration.test.ts
- Modify: tests/http-smoke.mjs

**Interfaces:**
- Validates GlobalSAT-shaped positions through real geofence behavior.
- Documents deployment inputs and operational limits.

- [ ] **Step 1: Write failing end-to-end integration case**

Matching target/freight; one inside plus two outside fixes separated by 30 seconds. Assert one ENTER/EXIT, A_CAMINHO_DESTINO, correct departedAt, one notification, one Position per external ID, and no GPS/source/driver/client fields in customer response.

- [ ] **Step 2: Verify RED**

Run npm run test:integration.

- [ ] **Step 3: Complete test seam and cleanup**

Use dependency injection, no production flags. Cleanup only TEST records and test integration state.

- [ ] **Step 4: Extend HTTP smoke**

Anonymous admin sync returns 401; cron without bearer returns 401; no real upstream call.

- [ ] **Step 5: Document operations**

README lists three Vercel variables, two GitHub secrets, cron path, plate rule, five-minute cadence/delay, rate limit, 50 m assumption, phone fallback and credential rotation.

- [ ] **Step 6: Full verification**

~~~bash
npx prisma validate
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
git diff --check
~~~

- [ ] **Step 7: Secret scan**

Fixed-string search for both supplied API secrets across tracked files, excluding .git/node_modules. Expect zero matches and never print production env values.

- [ ] **Step 8: Commit**

Commit README/integration/smoke changes with message docs: document GlobalSAT tracking operations.

- [ ] **Step 9: PR and CI**

Push branch, open PR to main, wait for lint/tests/build, inspect complete diff for secrets, merge only green.

- [ ] **Step 10: Production**

Apply migration; configure three Vercel variables and two GitHub secrets; redeploy; run workflow manually; inspect sanitized logs/dashboard; verify real matched plate/position if transmitting; rotate exposed credentials, update Vercel, redeploy and rerun. If no tracker transmits, leave only real-position validation pending.
