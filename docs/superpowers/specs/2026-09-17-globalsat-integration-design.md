# Integração de rastreamento GlobalSAT

Data: 2026-09-17
Status: aprovado em conversa; aguardando revisão do documento

## Objetivo

Usar as posições dos rastreadores GlobalSAT para alimentar automaticamente o mecanismo de geofence do AXIS Fretes. Quando o caminhão associado a um frete possuir rastreador na GlobalSAT, o motorista não precisará manter o rastreamento do celular aberto. O rastreamento voluntário pelo celular continuará disponível como fallback.

A primeira versão será somente leitura. Ela não enviará comandos de bloqueio, desbloqueio, buzzer ou qualquer outra ação ao veículo.

## Restrições confirmadas

- A API GlobalSAT usa OAuth2 `client_credentials`.
- O endpoint de produção é `https://apis.rastreioglobalsat.com`.
- A consulta de veículos usa `POST /api/targets` e fornece `id_target`, `lic_plate` e a última posição.
- O histórico incremental usa `POST /api/reports/tracking_data`, com `from_id`, `id_targets`, `limit` e `NextStartID`.
- O relatório de posições aceita no máximo três requisições por minuto por IP.
- A GlobalSAT não documenta webhook para entrega automática de posições.
- O projeto está no plano Hobby da Vercel e não oferece execução confiável a cada minuto.
- A sincronização em segundo plano usará GitHub Actions a cada cinco minutos. A execução pode sofrer atrasos ocasionais impostos pelo GitHub.

## Arquitetura

### Cliente GlobalSAT

Um módulo exclusivamente de servidor será responsável por:

1. solicitar um `access_token` em `POST /oauth/access_token`;
2. manter o token apenas em memória até pouco antes da expiração;
3. consultar os veículos disponíveis;
4. normalizar placas removendo espaços, hífens, pontuação e diferenças de caixa;
5. usar a última posição de cada veículo encontrado para estabelecer o estado atual;
6. consultar posições incrementais dos veículos vinculados a fretes ativos;
7. validar respostas externas antes de entregá-las ao domínio.

O cliente usará timeouts e mensagens de erro sanitizadas. Tokens, credenciais e respostas integrais não serão registrados em logs.

### Vínculo veículo-frete

O vínculo será automático e determinístico:

1. usar `Container.truckPlate`, extraída do documento e confirmada no cadastro;
2. quando ausente, usar `Driver.plate`;
3. comparar com `lic_plate` da GlobalSAT após normalização;
4. ignorar veículos sem correspondência, sem tentar aproximação textual;
5. registrar no resultado da sincronização quais placas ativas não foram encontradas.

Não haverá associação por nome do motorista, porque nomes não são identificadores confiáveis de veículo.

### Persistência e idempotência

O banco receberá:

- uma identidade externa opcional na posição, composta por provedor e `id_tracked_position`;
- uma restrição única para impedir que a mesma posição seja processada duas vezes;
- um estado de integração GlobalSAT contendo o último `NextStartID` confirmado.

O cursor só avançará depois que todas as posições do lote forem processadas com sucesso. Se a execução falhar no meio, a próxima repetirá o lote, e a identidade externa impedirá duplicidade.

Na primeira execução, o integrador consultará a partir de uma janela inicial curta, suficiente para capturar o estado recente sem reprocessar todo o histórico da conta. Depois usará exclusivamente `from_id` e continuará paginando enquanto houver um lote completo, respeitando um limite máximo de páginas por execução para não exceder o tempo da função. Se uma nova placa for vinculada depois que o cursor global já tiver avançado, a posição mais recente retornada por `/api/targets` estabelecerá o estado inicial desse veículo, e as posições seguintes entrarão normalmente no fluxo incremental.

### Processamento de posições

As posições serão agrupadas por veículo e ordenadas por `id_tracked_position` antes do processamento. Cada posição válida será convertida para latitude, longitude e horário oficial do GPS.

A API não fornece precisão horizontal em metros. Para não tratar a coordenada como perfeita, o adaptador atribuirá uma incerteza conservadora fixa de 50 m. Com a política atual, uma entrada só será confirmada quando a coordenada, somada a essa margem, estiver inteiramente dentro do raio do portão; uma saída também continuará exigindo a margem externa adicional. Essa limitação será documentada e poderá ser revista somente se a GlobalSAT passar a fornecer precisão mensurada.

O mecanismo existente continuará responsável por:

- gravar a posição;
- detectar entrada no portão;
- exigir evidência sustentada para a saída;
- atualizar o estado do frete;
- calcular a previsão de chegada;
- criar a notificação correspondente uma única vez.

A validação temporal terá duas políticas internas:

- celular: mantém a tolerância restrita atual, pois a posição vem do dispositivo do usuário;
- GlobalSAT: aceita posições atrasadas do lote incremental, porque são obtidas pelo servidor autenticado, mas rejeita horários inválidos ou excessivamente futuros.

Essa diferença nunca será controlável por dados enviados pelo navegador. Somente o adaptador GlobalSAT poderá selecionar a política confiável.

Fretes entregues ou sem motorista, portão ou placa válida não receberão posições. O processamento tardio respeitará as proteções existentes contra posições fora de ordem e eventos duplicados.

### Endpoint de sincronização

Será criado um endpoint interno de sincronização que:

- aceita somente `POST`;
- exige um segredo independente em `Authorization: Bearer ...`;
- compara o segredo em tempo constante;
- executa apenas uma sincronização por vez por meio de bloqueio no banco;
- retorna somente contagens, placas não encontradas e erros sanitizados;
- nunca retorna credenciais, token OAuth ou posições completas.

O endpoint ficará fora da autenticação administrativa por cookie somente porque será chamado pelo GitHub Actions. Sua proteção será o segredo dedicado, não uma URL secreta.

### Agendamento híbrido

Um workflow do GitHub Actions chamará o endpoint a cada cinco minutos e também permitirá execução manual. O workflow lerá a URL de produção e o segredo de sincronização dos GitHub Actions Secrets.

Enquanto o painel administrativo estiver aberto, ele poderá solicitar uma sincronização adicional, no máximo uma vez por minuto. Essa chamada passará por uma rota autenticada pelo cookie administrativo e reutilizará o mesmo serviço interno; o navegador nunca receberá o segredo do agendador nem as credenciais GlobalSAT.

Chamadas concorrentes serão consolidadas pelo bloqueio no banco. A sincronização pelo painel não substitui a execução em segundo plano.

## Variáveis e segredos

Vercel, somente no servidor:

- `GLOBALSAT_CLIENT_ID`
- `GLOBALSAT_CLIENT_SECRET`
- `GLOBALSAT_SYNC_SECRET`

GitHub Actions Secrets:

- `GLOBALSAT_SYNC_URL`
- `GLOBALSAT_SYNC_SECRET`

O repositório conterá apenas nomes e exemplos vazios. Como os segredos enviados na conversa foram expostos, deverão ser regenerados após a primeira validação e atualizados diretamente na Vercel.

## Observabilidade e falhas

Cada execução retornará e registrará apenas:

- horário de início e término;
- quantidade de veículos ativos, encontrados e não encontrados;
- posições recebidas, ignoradas e processadas;
- cursor anterior e novo;
- categoria sanitizada do erro.

Comportamento por falha:

- `401` da GlobalSAT: renovar o token uma vez e repetir a requisição;
- `429`: encerrar sem avançar o cursor e aguardar a próxima execução;
- timeout ou erro `5xx`: encerrar sem avançar o cursor;
- payload inválido: encerrar o lote e preservar o cursor;
- placa não encontrada: informar no resumo e continuar com os outros veículos;
- posição duplicada: ignorar de forma idempotente;
- nenhum frete ativo com placa: concluir sem consultar histórico.

O painel exibirá o estado da última sincronização, mas a ausência momentânea da GlobalSAT não bloqueará o restante do sistema.

## Privacidade e segurança

- As credenciais GlobalSAT ficam somente em variáveis de ambiente do servidor.
- Posições GPS continuam privadas e não serão adicionadas à página pública do cliente.
- O endpoint público do cliente continuará mostrando apenas etapa, origem, destino e previsão.
- O integrador terá somente leitura de veículos e posições.
- Nenhum endpoint de comandos da GlobalSAT será usado.
- Logs não conterão coordenadas precisas, tokens ou segredos.
- O rastreamento pelo celular e seus links privados existentes permanecerão compatíveis.

## Testes

O desenvolvimento seguirá teste primeiro e cobrirá:

- autenticação OAuth2 e renovação após `401`;
- validação dos formatos de resposta documentados;
- normalização e correspondência exata de placas;
- conversão dos horários e coordenadas GlobalSAT;
- paginação incremental com `NextStartID`;
- preservação do cursor quando um lote falhar;
- idempotência de posições repetidas;
- processamento ordenado de posições;
- separação entre política temporal do celular e da GlobalSAT;
- autenticação do endpoint de sincronização;
- bloqueio de execuções concorrentes;
- ausência de dados GPS na resposta pública do cliente;
- integração completa com entrada e saída da geofence usando respostas GlobalSAT simuladas.

Também serão executados typecheck, lint, testes unitários, testes de integração e build de produção.

## Implantação e validação

1. Publicar as migrations e o código sem habilitar o workflow.
2. Configurar os três segredos na Vercel.
3. Configurar URL e segredo nos GitHub Actions Secrets.
4. Executar uma sincronização manual e conferir o resumo de placas encontradas e não encontradas.
5. Confirmar no banco uma posição real e, quando possível, testar um veículo próximo ao portão.
6. Habilitar o agendamento de cinco minutos.
7. Regenerar as credenciais expostas e atualizar a Vercel.

O deploy só será considerado concluído depois que o workflow, o endpoint e os logs de produção confirmarem uma sincronização real. Se não houver veículo transmitindo durante a validação, o resultado será registrado como integração configurada, mas a validação de posição real permanecerá explicitamente pendente.

## Fora do escopo

- mapa em tempo real para o cliente;
- envio de comandos aos veículos;
- bloqueio ou desbloqueio remoto;
- alteração de cadastros na GlobalSAT;
- associação manual por IMEI;
- promessa de atualização exata a cada cinco minutos;
- remoção imediata do rastreamento pelo celular.
