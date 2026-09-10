# Preparação Android / iOS

A mesma interface é hospedada via HTTPS e aberta no WebView do Capacitor. O backend, as credenciais do WhatsApp e o banco continuam exclusivamente no servidor.

## Criar projetos nativos

```sh
npm ci
# PowerShell:
$env:CAPACITOR_SERVER_URL="https://SEU-DEPLOY.vercel.app"
npx cap add android
npx cap add ios
npx cap sync
npx cap open android
# iOS exige macOS e Xcode:
npx cap open ios
```

Não use um deploy protegido por login da equipe Vercel para distribuir o aplicativo aos motoristas. A URL precisa ser acessível aos usuários pretendidos e manter a autenticação própria do AXIS Fretes.

O plugin `@capacitor/geolocation` em `src/lib/location-client.ts` solicita permissão apenas depois da ação explícita “Iniciar rastreamento”. O link privado contém o token no fragmento, é removido da barra de endereço após a leitura e é mantido na sessão do WebView. Não inclua esse link em logs ou serviços de analytics.

## Permissões

No AndroidManifest.xml, configure ACCESS_COARSE_LOCATION e ACCESS_FINE_LOCATION conforme a documentação do plugin. No iOS, configure NSLocationWhenInUseUsageDescription e a descrição de uso exigida pelo plugin. Use uma explicação clara: “Sua localização registra a chegada ao portão do frete que você está transportando.”

## Etapa necessária para background

O plugin atual não implementa acompanhamento contínuo com o aplicativo fechado ou a tela bloqueada. Antes da distribuição:

1. Escolha e avalie um plugin de localização em segundo plano compatível com a versão de Capacitor.
2. Preserve a interface `watchPosition(onFix, onError)` e `WatchHandle.clear()`.
3. Implemente serviço foreground do Android com notificação persistente, permissões de background quando necessárias e tratamento das restrições de bateria.
4. Configure Background Modes / Location Updates no iOS e permissões apropriadas.
5. Envie timestamp original e precisão; preserve o Bearer token por frete em armazenamento seguro nativo.
6. Trate início/parada, mudança de permissão, expiração de link, perda de rede e retomada. Não reenvie coordenadas antigas como se fossem atuais.
7. Teste em aparelhos físicos: tela bloqueada, economia de bateria, permissão aproximada, app encerrado, rede intermitente e chegada com margem de erro.
8. Prepare política de privacidade, descrição das permissões, ícones nativos e materiais das lojas.

Na versão web, mantenha a aba e a tela abertas. Não há service worker prometendo captura de GPS em background.

Referência: [documentação do Capacitor](https://capacitorjs.com/docs).
