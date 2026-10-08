# Fleet Dashboard Remodel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the webapp dashboard into a high-visibility, Fleet-Centric Control Center where every truck in the fleet is prominently listed with real-time GPS tracking, status badges, freight history drawer, and instant document PDF access.

**Architecture:** 
- A backend fleet aggregator (`src/lib/fleet.ts`) unifies `Vehicle`, `Driver`, `Container`, `TripDocument`, and `Position` into rich `FleetVehicle` entities.
- An interactive Leaflet map component (`src/components/fleet-map-modal.tsx`) provides single-truck tracking with recent breadcrumb trails and an all-fleet overview map.
- A slide-over drawer (`src/components/fleet-history-drawer.tsx`) renders the timeline of past trips with direct PDF downloads.
- A redesigned dashboard layout (`src/components/dashboard.tsx`) presents a card grid with KPI metrics, status filters, search, and action buttons.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Prisma, PostgreSQL (Neon), Leaflet 1.9, OpenStreetMap, Tailwind CSS, Phosphor Icons.

**Spec:** User interview requirements:
1. Fleet-centric grid listing all trucks in the fleet.
2. Direct hyperlinks/actions in each truck card:
   - 🗺️ "Ver no Mapa" (interactive real-time GPS map with breadcrumb trail and destination).
   - 📄 "Documento Atual" (direct link/download for active trip PDF: MIC-DTA / CRT).
   - 📜 "Histórico" (slide-over drawer with past completed freights and historical PDF links).
   - 🏷️ Badges for truck status (Em Viagem, No Porto, Disponível) and GPS signal health (🟢 Sinal há 2m, 🟡 Atenção há 45m, 🔴 Sem sinal recente).
3. "Ver Toda a Frota no Mapa" button at the top plotting all trucks simultaneously.
4. Clean extensible architecture for future waypoint additions.

## Global Constraints

- Preserve all existing geofence and notification engine functionality.
- Do not break existing routes: `/api/documents/[id]`, `/api/containers/[id]`, `/api/integrations/globalsat/sync`.
- Use Leaflet on the client side only (`use client`, dynamic/client-only initialization) to avoid SSR issues in Next.js 15.
- Keep UI responsive and performant across desktop and mobile screens.

## Review Focus

1. **Truck without Active Freight:** A truck with no active containers must display status "Disponível", show assigned driver, show its latest known GPS position/signal health, and allow viewing past history without throwing null pointer errors.
2. **Truck without GPS Fixes:** A truck that has never sent a GPS fix must display "Sem sinal recente" badge gracefully without crashing map rendering.
3. **Trip without PDF Document:** A freight that has no linked `TripDocument` must show a disabled/empty doc indicator instead of a broken link.
4. **Leaflet Container Re-use / Cleanup:** Closing and reopening the map modal must properly remove and recreate the Leaflet map instance to prevent `Map container is already initialized` error.
5. **Driver / Plate Reconciliation:** Plates from drivers (`Driver.plate`) that do not yet have a record in `Vehicle` table must still be displayed in the fleet list.

---

### Task 1: Fleet Aggregator Core (`src/lib/fleet.ts`) and Unit Tests

**Files:**
- Create: `src/lib/fleet.ts`
- Create: `tests/fleet.test.ts`
- Modify: `src/lib/dashboard.ts`

**Interfaces:**
- Produces: `FleetVehicle`, `buildFleetData()`, `computeGpsHealth()`
- Consumes: Prisma models `Vehicle`, `Driver`, `Container`, `Position`

- [ ] **Step 1: Write the failing test for fleet aggregation**

Create `tests/fleet.test.ts` testing:
- `computeGpsHealth`: returns `ONLINE` (<30m), `ATTENTION` (<120m), `OFFLINE` (>120m or null).
- `deriveTruckStatus`: returns `EM_VIAGEM` if active container is `EM_TRANSITO` or `A_CAMINHO_DESTINO`, `NO_PORTO` if `CHEGADA_PORTAO` or `LIBERADO`, and `DISPONIVEL` if latest is `ENTREGUE` or no active container.
- `buildFleetVehicle`: aggregates truck plate, driver, active freight, past history, and latest position.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/fleet.test.ts`
Expected: FAIL (module `src/lib/fleet.ts` does not exist)

- [ ] **Step 3: Implement `src/lib/fleet.ts`**

Define:
- Types: `FleetVehicle`, `GpsHealth`, `TruckOperationalStatus`
- Functions: `computeGpsHealth(recordedAt: Date | string | null, now?: Date): { health: GpsHealth, ageMinutes: number, healthLabel: string }`
- `deriveTruckStatus(activeContainer?: { status: string } | null): { status: TruckOperationalStatus, statusLabel: string }`
- `aggregateFleet(vehicles: any[], drivers: any[], containers: any[], latestPositions: any[]): FleetVehicle[]`

- [ ] **Step 4: Update `src/lib/dashboard.ts` to include fleet vehicles**

Modify `src/lib/dashboard.ts` to query `Vehicle`, latest positions (via `DISTINCT ON ("driverId")`), and call `aggregateFleet` to return `fleet: FleetVehicle[]` in `getDashboard()`. Also ensure all driver plates exist in `Vehicle` table.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --import tsx --test tests/fleet.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/fleet.ts src/lib/dashboard.ts tests/fleet.test.ts
git commit -m "feat(fleet): implement fleet data aggregator and GPS health calculation"
```

---

### Task 2: Fleet Telemetry & Trail API Route (`src/app/api/fleet/[plate]/trail/route.ts`)

**Files:**
- Create: `src/app/api/fleet/[plate]/trail/route.ts`
- Create: `tests/fleet-trail-route.test.ts`

**Interfaces:**
- Produces: `GET /api/fleet/[plate]/trail` -> `{ truckPlate, current, trail, destination, origin }`
- Consumes: Prisma `Position`, `Container`, `Geofence`, `Driver`

- [ ] **Step 1: Write test for trail API route**

Create `tests/fleet-trail-route.test.ts` testing:
- Valid truck plate returns last 50 coordinates, current fix, destination geofence if active.
- Unknown truck plate returns 404 or empty trail gracefully.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/fleet-trail-route.test.ts`
Expected: FAIL (route does not exist)

- [ ] **Step 3: Implement route handler in `src/app/api/fleet/[plate]/trail/route.ts`**

Fetch:
- Latest positions for the driver/container associated with `plate` (up to 50 ordered by `recordedAt` asc for line drawing).
- Active container for destination geofence matching (latitude/longitude/name).
- Port of Paranaguá coordinates as origin reference.
- Return structured JSON response.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test tests/fleet-trail-route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/fleet/[plate]/trail/route.ts tests/fleet-trail-route.test.ts
git commit -m "feat(fleet): add GPS trail and waypoint telemetry API route"
```

---

### Task 3: Interactive Leaflet Map Modal (`src/components/fleet-map-modal.tsx`)

**Files:**
- Create: `src/components/fleet-map-modal.tsx`
- Modify: `src/app/globals.css` (add Leaflet modal and marker styles)

**Interfaces:**
- Produces: `<FleetMapModal />` component
  - Props:
    - `isOpen: boolean`
    - `onClose: () => void`
    - `mode: "single" | "all"`
    - `truck?: FleetVehicle`
    - `allTrucks?: FleetVehicle[]`

- [ ] **Step 1: Implement `<FleetMapModal />`**

- Use `'use client';`
- Import Leaflet dynamically or inside `useEffect` with container ref.
- Support `mode === "single"`:
  - Fetch trail from `/api/fleet/${truck.plate}/trail`.
  - Draw custom truck marker (SVG icon with plate pill).
  - Draw Polyline breadcrumb trail (emerald `#256450` with glow).
  - Draw Destination marker with circular geofence radius.
  - Draw Origin (Port of Paranaguá) marker.
  - Telemetry bar with coordinates, last ping timestamp, and Google Maps external link (`https://www.google.com/maps?q=${lat},${lng}`).
- Support `mode === "all"`:
  - Plot all trucks with known positions simultaneously.
  - Color-code markers: Green (Em Viagem), Amber (No Porto), Blue (Disponível).
  - Add popup with Plate, Driver, Container, and "Ver detalhes" button.
  - Fit map bounds to encompass all fleet markers.
- Ensure strict cleanup: call `map.remove()` on unmount or modal close.

- [ ] **Step 2: Add styles in `src/app/globals.css`**

Add CSS classes for `.fleet-map-container`, `.truck-marker-icon`, `.telemetry-bar`, `.map-modal-dialog`.

- [ ] **Step 3: Verify build / typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/fleet-map-modal.tsx src/app/globals.css
git commit -m "feat(ui): add interactive Leaflet map modal for single truck and whole fleet"
```

---

### Task 4: Freight History Slide-over Drawer (`src/components/fleet-history-drawer.tsx`)

**Files:**
- Create: `src/components/fleet-history-drawer.tsx`
- Modify: `src/app/globals.css` (drawer transition & timeline styles)

**Interfaces:**
- Produces: `<FleetHistoryDrawer />`
  - Props:
    - `isOpen: boolean`
    - `onClose: () => void`
    - `truck: FleetVehicle | null`
    - `onNewFreight?: (plate: string) => void`

- [ ] **Step 1: Implement `<FleetHistoryDrawer />`**

- Slide-over panel with smooth right-to-left transition and backdrop blur.
- Header: Truck Plate, Carreta Plate, Assigned Driver, Total Completed Trips count.
- If truck has no trips: empty state "Nenhum frete concluído anteriormente".
- Timeline of completed trips:
  - Container code with badge `ENTREGUE`.
  - Departure date and Delivery date.
  - Origin ➔ Destination.
  - Tax details: CRT and MIC-DTA.
  - Direct Document Download Link: If `trip.document` exists, render button `📄 Baixar ${trip.document.filename}` linking to `/api/documents/${trip.document.id}` target="_blank".
- Quick Action: If truck is `DISPONIVEL`, provide button `+ Vincular Novo Frete` linking to `/cadastro?tab=containers&truckPlate=${truck.plate}`.

- [ ] **Step 2: Add styles in `src/app/globals.css`**

Add drawer slide-over animation, backdrop blur, and timeline card styling.

- [ ] **Step 3: Verify build / typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/fleet-history-drawer.tsx src/app/globals.css
git commit -m "feat(ui): implement freight history slide-over drawer with PDF links"
```

---

### Task 5: Fleet-Centric Dashboard Re-architecture (`src/components/dashboard.tsx`)

**Files:**
- Modify: `src/components/dashboard.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `data.fleet: FleetVehicle[]`, `<FleetMapModal />`, `<FleetHistoryDrawer />`
- Produces: Complete Fleet Control Center dashboard view.

- [ ] **Step 1: Build Fleet Cards Grid & Header Controls**

In `src/components/dashboard.tsx`:
- Add View Switcher: `Frota (Padrão)` vs `Containers / Tabela` (allows toggling between new fleet view and legacy container table).
- KPI Metrics Bar:
  - `Frota Total` (e.g. 12 caminhões)
  - `Em Viagem` (caminhões com frete ativo em rota)
  - `No Porto / Aduana` (caminhões em checkpoint de controle)
  - `Disponíveis` (caminhões prontos para novo frete)
- Search Bar: Instant filtering by truck plate, trailer plate, driver name, active container code, destination city.
- Status Filter Pills: `Todos`, `Em Viagem`, `No Porto`, `Disponíveis`.
- Header Button: 🗺️ `Ver Toda a Frota no Mapa` (opens `<FleetMapModal mode="all" />`).

- [ ] **Step 2: Implement `<TruckCard />` component**

For each truck in the grid:
- Card Header:
  - Plate icon + Cavalo Plate (e.g. `AAME593`) + Carreta Plate (`AASV276`).
  - Truck Status Badge (`EM_VIAGEM`, `NO_PORTO`, `DISPONIVEL`).
  - GPS Health Badge: 🟢 `Sinal há 3m` / 🟡 `Atenção: há 45m` / 🔴 `Sem sinal`.
- Driver Info: Name, phone, icon.
- Active Freight Section:
  - If active freight exists: Container code, Origem ➔ Destino, CRT / MIC-DTA.
  - If available: "Pronto para próxima viagem".
- Card Action Hyperlinks:
  - 🗺️ `Ver no Mapa`: Opens `<FleetMapModal mode="single" truck={truck} />`.
  - 📄 `Documento`: If active freight has PDF, direct link `/api/documents/${doc.id}` (target="_blank"); otherwise disabled indicator.
  - 📜 `Histórico (${truck.totalTripsCompleted} viagens)`: Opens `<FleetHistoryDrawer truck={truck} />`.

- [ ] **Step 3: Wire modals and drawer state**

State variables:
- `mapTruck: FleetVehicle | null`
- `allFleetMapOpen: boolean`
- `historyTruck: FleetVehicle | null`
- `searchQuery: string`
- `statusFilter: string`
- `dashboardView: "fleet" | "containers" | "messages"`

- [ ] **Step 4: Verify build and typecheck**

Run: `npm run typecheck && npm run build`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard.tsx src/app/globals.css
git commit -m "feat(dashboard): remodel dashboard into fleet-centric control center with map and history"
```

---

### Task 6: Seed Missing Fleet Vehicles & End-to-End Verification

**Files:**
- Modify Neon DB: Insert missing driver plates into `Vehicle` table so all 12 trucks are recognized.
- Run complete test suite: `npm test`
- Build verification: `npm run build`

- [ ] **Step 1: Ensure all 12 driver truck plates exist in `Vehicle` table**

Execute upsert for `ABBJ596`, `AARG542`, `AAME899`, `AAYE568`, `AAME814` via Neon SQL.

- [ ] **Step 2: Run all unit and integration tests**

Run: `npm test`
Expected: ALL PASS.

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: 0 errors, production build succeeds.

- [ ] **Step 4: Final commit & push to main**

```bash
git add .
git commit -m "feat: complete fleet dashboard remodel with real-time GPS map, history, and document access"
git push origin main
```

