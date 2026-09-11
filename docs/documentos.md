# Importação de viagens

Página /importar, acessível somente com sessão administrativa. PDF/JPG/PNG até 4 MB, uma viagem por arquivo. Original armazenado privadamente no PostgreSQL, download autenticado. Hash SHA-256 impede duplicação do mesmo arquivo. Conferência obrigatória antes da transação que cria cliente/motorista (ou reutiliza IDs selecionados) e frete. Dados extraídos não autorizam WhatsApp. Placas são registradas na viagem, preservando o histórico do cadastro do motorista.

Configurar OPENAI_API_KEY na Vercel (Production), opcional DOCUMENT_EXTRACTION_MODEL (padrão gpt-4.1-mini). Redeploy. A API Responses recebe o PDF/imagem com store:false, sem ferramenta de execução. Documentação: https://developers.openai.com/api/docs/guides/file-inputs . Uso do serviço tem cobrança independente da assinatura do ChatGPT. Sem chave, apenas upload e preenchimento manual ficam operantes; não simula extração. Não usar credenciais da GlobalSAT para OCR.

Limite compartilhado de 30 novas leituras por hora. Campos ausentes permanecem vazios. MIC/DTA e CRT são distintos; frete não é valor FOB. Um container por registro, mantendo a restrição de código único já existente no sistema. Viagens recorrentes do mesmo container requerem evolução separada do modelo.

Validação com provedor real depende de chave e crédito de API. Não afirmar OCR validado apenas com testes de esquema. Configurar e testar documentos reais antes de confiar no preenchimento automático. A tela sempre permite corrigir os valores antes de salvar.
