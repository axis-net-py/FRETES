# Saída do porto e acompanhamento do cliente

Novo frete usa origem Porto de Paranaguá, portão de saída e duração prevista em horas (1–720), incluindo paradas e fronteira. As coordenadas e o raio precisam ser definidos para o portão efetivamente utilizado; nenhuma coordenada aproximada foi cadastrada automaticamente.

Uma posição válida dentro da área registra ENTER e espera de liberação, sem WhatsApp. Após essa entrada, exige posições fora do raio mais 50 metros, descontada a margem de erro do GPS, com intervalo de pelo menos 30 segundos. Intervalos sem amostras de mais de 120 segundos reiniciam a confirmação. Reentrada ou posição ambígua cancela a candidatura à saída. Duplicatas e posições fora de ordem não avançam o processo. Amostras com mais de 120 segundos ou mais de 30 segundos no futuro são ignoradas. Eventos e notificação são gravados atomicamente, com bloqueio por viagem para impedir concorrência.

A saída confirmada cria EXIT e A_CAMINHO_DESTINO. Previsão = primeiro ponto da saída confirmada + duração planejada. Sem duração, exibe previsão a confirmar; não inventa rota nem horário. Operador pode ajustar duração total desde a saída em Detalhes do frete, atualizando a previsão na página do cliente. A previsão não consulta trânsito em tempo real. Saída da área não atesta desembaraço aduaneiro e depende de delimitação apropriada no lado da via de saída.

WhatsApp: configurar META_WHATSAPP_DEPARTURE_TEMPLATE com seis parâmetros: nome do cliente, container, estado, destino, previsão e link completo. O antigo template de quatro parâmetros não é reutilizado. Avisos antigos de chegada pendentes são cancelados ao tentar reenviar. Consentimento e número do cliente continuam obrigatórios. Falhas e limites do provedor continuam visíveis no painel.

Link /acompanhar com token no fragmento, enviado à API por Bearer. Banco guarda somente hash e validade de 30 dias. Página pública divulga apenas container, etapa, origem/destino e datas; não divulga documentos, valores, cliente ou motorista, nem posição exata. Link do motorista não dá acesso à página do cliente e vice-versa. Operador pode gerar novo link após saída, revogando o anterior; novas etapas são consultadas a cada 30 segundos. Atualizações posteriores de ETA/status aparecem nessa página; somente a saída gera o WhatsApp automaticamente nesta versão.

GlobalSAT ainda depende das credenciais para receber posições dos rastreadores. O motor atual recebe posições pelo endpoint autenticado do motorista. Integração GlobalSAT deve preservar timestamp original e adaptar qualidade/frequência de posições antes de habilitar a automação. A interface do motorista mantém GPS durante a espera e só encerra após saída.

Validação: testes com banco real e registros descartáveis cobrem fora sem entrada, entrada sem mensagem, oscilação no limite, posições fora de ordem, concorrência na saída, mensagem única, cálculo de ETA, expiração e isolamento dos tokens do cliente. Nenhum WhatsApp real é enviado pelos testes.
