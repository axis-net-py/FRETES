# AXIS Fretes

Controle de fretes de containers com painel administrativo, rastreamento GPS por link privado e avisos por template da WhatsApp Cloud API. Interface em português, responsiva, com base Capacitor para futura distribuição Android/iOS.

## Funcionalidades

- Login administrativo com cookie HttpOnly, assinatura JWT de 12 horas e limite de tentativas persistente.
- Clientes com telefone internacional e autorização para receber avisos; motoristas com placa.
- Portão ativo de Paranaguá selecionado automaticamente para os fretes.
- Importação de PDF/JPG/PNG com conferência, reutilização de clientes, motoristas e veículos por placa normalizada; nomes ambíguos exigem seleção do operador.
- Estimativa de rota de caminhão com margem operacional positiva, armazenadas separadamente, e alternativa de prazo manual.
- Containers, busca, filtros, exportação CSV e avanço manual de etapas.
- Link privado por frete, válido por 7 dias, revogável ao gerar outro. A conclusão do frete revoga o link.
- Rastreamento voluntário: botão iniciar/parar e permissão do sistema operacional.
- Rastreamento GlobalSAT automático por placa para fretes ativos, com GPS do celular como alternativa.
- Entrada confiável no portão: posição recente, margem de precisão e atualização atômica no PostgreSQL.
- Registro de evento e notificação na mesma transação, com proteção contra posições concorrentes/repetidas.
- Histórico de avisos e tentativa manual para falhas ou configurações pendentes.
- Demonstração pública em `/demo`, com dados fictícios isolados do banco.
- Os dados operacionais exigem autenticação. O link do motorista só dá acesso ao próprio frete.

## Stack

Next.js 15 / React 19 / TypeScript / Tailwind CSS 3, Prisma 5 com PostgreSQL Neon, Capacitor 6, WhatsApp Cloud API da Meta e Vercel.

## Desenvolvimento

Requer Node.js 22 ou 24 e PostgreSQL. Nunca versione segredos.

```sh
npm ci
cp .env.example .env
# Preencha DATABASE_URL, ADMIN_PASSWORD e SESSION_SECRET
npm run db:deploy
npm run dev
```

Acesse `http://localhost:3000/login` ou `http://localhost:3000/demo`.

A senha administrativa é configurada em `ADMIN_PASSWORD`. Gere uma senha longa e um `SESSION_SECRET` aleatório com pelo menos 32 bytes. Altere ambos para revogar todas as sessões existentes. Não há cadastro público de administradores.

## Fluxo operacional

1. Cadastre cliente e autorização para avisos.
2. Cadastre motorista e caminhão.
3. Cadastre o portão com coordenadas verificadas no terminal. Exemplos visuais não são coordenadas homologadas.
4. Importe o documento ou crie um frete, associando cliente e motorista. O portão ativo de Paranaguá é automático.
5. Abra os detalhes do frete, gere um link e compartilhe-o pessoalmente com o motorista.
6. O motorista autoriza o GPS e inicia o rastreamento. A versão web precisa ficar aberta.
7. Uma posição válida dentro do portão avança `EM_TRANSITO` para `CHEGADA_PORTAO` e prepara um aviso.
8. As demais etapas são confirmadas manualmente no painel.

Chegada física **não equivale à liberação aduaneira ou autorização de retirada**. O evento GPS nunca marca automaticamente “Liberado”.

O servidor só aceita posições com até 120 segundos, no máximo 30 segundos no futuro, precisão até o menor valor entre 100 m e metade do raio. Toda a área de incerteza deve estar dentro do raio. Uma leitura inicial já dentro da área conta como chegada. GPS enviado pelo dispositivo não é prova antifraude.

Cada cadastro representa uma operação e tem código de container único. O MVP não modela múltiplas viagens históricas para o mesmo código; evolua para entidades separadas Container/Viagem se houver esse requisito.

## GlobalSAT

A integração é somente de leitura. Ela relaciona a placa do cavalo cadastrada no frete (ou, como alternativa, a placa do motorista) com o veículo GlobalSAT, importa posições em ordem cronológica e usa a mesma geofence do portão. O vínculo exige igualdade exata após remover espaços, hífens e pontuação.

Configure apenas como segredos do servidor:

| Variável | Conteúdo |
| --- | --- |
| `GLOBALSAT_CLIENT_ID` | Identificador OAuth fornecido pela GlobalSAT |
| `GLOBALSAT_CLIENT_SECRET` | Segredo OAuth fornecido pela GlobalSAT |
| `GLOBALSAT_SYNC_SECRET` | Valor aleatório com pelo menos 32 caracteres |

`GLOBALSAT_BASE_URL` usa `https://apis.rastreioglobalsat.com`. As credenciais do portal servem apenas para consultar a documentação; o OAuth usa `client_credentials`. O token retornado em objeto é reutilizado até próximo da expiração e persistido com AES-256-GCM, usando `SESSION_SECRET` no servidor. Uma resposta 401 permite uma renovação; falhas e limites são apresentados sem credenciais ou tokens.

Para cálculo automático, configure `OPENROUTESERVICE_API_KEY` e `ROUTE_OPERATIONAL_MARGIN_HOURS` (padrão 4; maior que zero e até 240). O total é arredondado para cima. Alterar destino ou prazo manualmente limpa os componentes da estimativa anterior.

Os testes de integração exigem uma URL PostgreSQL em `.env.test` apontando para um schema cujo nome começa com `fretes_qa_`, com migrações aplicadas e `WHATSAPP_PROVIDER=disabled`. Nunca use o banco operacional: `npm run test:integration` cria e remove somente dados de teste, usando provedores simulados. As novas tabelas e colunas são aditivas; aplique com `npm run db:deploy` antes de publicar o código.

O painel autenticado solicita uma sincronização ao abrir e depois a cada minuto. Para manter a atualização sem o painel aberto, o workflow `.github/workflows/globalsat-sync.yml` chama a rota protegida a cada cinco minutos. Cadastre estes secrets no repositório GitHub:

| Secret | Conteúdo |
| --- | --- |
| `APP_URL` | URL pública do sistema, sem barra final |
| `GLOBALSAT_SYNC_SECRET` | Exatamente o mesmo valor configurado no servidor |

A GlobalSAT não informa precisão horizontal neste endpoint; por segurança, cada posição importada usa uma incerteza conservadora de 50 metros. Falhas preservam o cursor anterior, e posições repetidas não criam novos eventos.

## WhatsApp

A publicação inicial usa `WHATSAPP_PROVIDER=disabled`: **nenhuma mensagem real é enviada**. Configure na Vercel:

| Variável                      | Conteúdo                                       |
| ----------------------------- | ---------------------------------------------- |
| WHATSAPP_PROVIDER             | meta                                           |
| META_WHATSAPP_TOKEN           | Token de usuário de sistema                    |
| META_WHATSAPP_PHONE_NUMBER_ID | ID do número remetente                         |
| META_WHATSAPP_TEMPLATE        | Nome do template aprovado                      |
| META_GRAPH_VERSION            | Versão suportada da Graph API da sua aplicação |
| META_TEMPLATE_LANGUAGE        | pt_BR, ou idioma exato aprovado                |

O template deve ter quatro parâmetros de corpo, nesta ordem: nome do cliente, código do container, status, nome do portão. Exemplo:

> Olá {{1}}, atualização do container {{2}}: {{3}}. Local: {{4}}.

Após configurar e redeployar, use “Tentar envio” no histórico para avisos pendentes que ainda sejam relevantes.

Estados: PENDING (na fila), UNCONFIGURED (faltam credenciais), NO_CONSENT (sem autorização), SENDING (em processamento), ACCEPTED (Meta aceitou), FAILED (Meta recusou) e UNKNOWN (resultado incerto). ACCEPTED **não confirma entrega**; não há webhook de recibos nesta versão. Timeouts não são reenviados automaticamente, porque a API pode ter aceitado a mensagem. Registros SENDING interrompidos também precisam de conferência manual. Isso evita prometer entrega “exatamente uma vez” para uma API externa.

Referências: [exemplos oficiais da Meta](https://github.com/fbsamples/whatsapp-api-examples) e [templates](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/).

## Android e iOS

Veja [docs/MOBILE.md](docs/MOBILE.md). A camada GPS em `src/lib/location-client.ts` usa a API web ou o plugin nativo conforme a plataforma. O Capacitor carrega a aplicação HTTPS hospedada; o shell local informa quando a URL não foi configurada.

**Não inclui binários, publicação nas lojas nem rastreamento confiável em segundo plano.** É necessário integrar o serviço nativo de background, permissões, ciclo de vida e testes físicos antes de usar com tela bloqueada.

## Verificação

```sh
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
```

O teste de integração cria registros prefixados TEST em um banco configurado, testa concorrência, isolamento e expiração, e remove exclusivamente esses registros ao final. Exige WhatsApp desativado. Use um banco dedicado para CI. A demonstração não semeia dados de produção.

## Deploy

Projeto Vercel: `fretes`, equipe `allaneggert1-9773s-projects`. Banco Neon: `broad-poetry-07372214`, região São Paulo.

Configure segredos por ambiente, execute `npm run db:deploy` contra o banco correspondente e publique:

```sh
vercel deploy --yes --no-wait --scope allaneggert1-9773s-projects
```

As migrations não são executadas automaticamente em cada build. Não use SQLite no filesystem efêmero da Vercel. Antes de promover uma preview para produção, configure as mesmas variáveis no ambiente Production e escolha um banco apropriado. Previews protegidas pela Vercel exigem acesso à equipe, inclusive para abrir o link do motorista.

## Limites operacionais

Este MVP é para uma única transportadora e um administrador. Não inclui multiempresa, recuperação de senha por e-mail, trilha completa de auditoria, GPS antifraude, captura offline, recibos de entrega do WhatsApp ou limpeza automática de histórico de posições. Defina retenção de dados e acrescente esses controles conforme a escala da operação.
