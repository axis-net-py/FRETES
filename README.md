# Container Track

Webapp (PWA) para controle de frete de container. Quando o motorista entra na geofence do
portão de liberação do porto, o status do container muda e o cliente recebe automaticamente
uma mensagem no WhatsApp.

Preparado para virar app Android/iOS via Capacitor, reaproveitando a mesma base de código.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- Prisma + SQLite (troque `datasource` para Postgres em produção)
- Capacitor 6 (`@capacitor/geolocation`) para o build nativo
- Provider de WhatsApp plugável: `console` (dev), `twilio`, `meta` (Cloud API)

## Rodando localmente

```bash
cp .env.example .env
npm install
npm run db:push
npm run db:seed   # cliente, motorista, container e geofence de exemplo
npm run dev
```

Telas:

- `/` painel de containers, geofences e histórico de mensagens
- `/cadastro` clientes, motoristas, containers e geofences
- `/motorista` rastreamento GPS do motorista (envia posição a cada 15 s)

Para simular a chegada ao portão sem GPS real:

```bash
node scripts/simulate-position.mjs seed-driver -23.94215 -46.31056
```

## Como o disparo funciona

1. O app do motorista envia posições para `POST /api/positions`.
2. `src/lib/geofence-engine.ts` compara a posição com as geofences ativas (haversine).
3. Na primeira posição dentro do raio registra um evento `ENTER`, atualiza o status do
   container e dispara o WhatsApp. Só volta a disparar depois de um evento `EXIT`
   (distância maior que raio + `GEOFENCE_EXIT_BUFFER_M`), evitando mensagens repetidas.
4. Todo envio fica registrado na tabela `Notification` com status e erro do provider.

## WhatsApp

Configure `WHATSAPP_PROVIDER` no `.env`:

- `console`: apenas loga a mensagem (padrão, para desenvolvimento)
- `twilio`: exige `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`
- `meta`: exige `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`

Em produção, as duas APIs exigem template aprovado para iniciar conversa fora da janela de
24 h — o envio de texto livre implementado aqui funciona dentro da janela e no sandbox.

## Build Android / iOS

O app nativo carrega a aplicação Next.js hospedada (mesma base de código):

```bash
export CAPACITOR_SERVER_URL="https://seu-dominio.com"
npx cap add android      # e/ou: npx cap add ios
npx cap sync
npx cap open android
```

Permissões necessárias:

- Android: `ACCESS_FINE_LOCATION` e, para rastreio com a tela apagada,
  `ACCESS_BACKGROUND_LOCATION` + foreground service
- iOS: `NSLocationWhenInUseUsageDescription` e `NSLocationAlwaysAndWhenInUseUsageDescription`

Para rastreio em background contínuo, troque `@capacitor/geolocation` por um plugin de
background location (ex: `@capacitor-community/background-geolocation`) mantendo a
interface de `src/lib/location-client.ts`.
