# Importação de viagens

## Gemini

Configurar GEMINI_API_KEY como segredo na Vercel Production. Gemini tem prioridade quando a chave está presente; sem ela, mantém OpenAI. GEMINI_DOCUMENT_MODEL opcional (padrão gemini-2.5-flash). As cotas e o faturamento são definidos pelo projeto Google; a presença da chave não comprova plano gratuito nem faturamento ativo.

GEMINI_DATA_MODE assume teste. A interface e o servidor exigem declaração de documento fictício/anonimizado sem dados pessoais/confidenciais antes de enviar ao Google. Somente definir GEMINI_DATA_MODE=paid após confirmar que o projeto tem faturamento ativo, para liberar documentos reais segundo os termos do provedor. Isso não ativa faturamento no Google. Termos: https://ai.google.dev/gemini-api/terms . A API envia o documento inline, sem criar arquivo remoto pela Files API.

Testado com PDF fictício: distinção entre transportadora/destinatário, CRT/MIC-DTA, cavalo/carreta e frete/FOB. Testes automatizados cobrem formato inválido de resposta, truncamento e cota 429, sem incluir a chave em erros. Nunca versionar chaves ou documentos reais de teste.

Página /importar, acessível somente com sessão administrativa. PDF/JPG/PNG até 4 MB, uma viagem por arquivo. Original armazenado privadamente no PostgreSQL, download autenticado. Hash SHA-256 impede duplicação do mesmo arquivo. Conferência obrigatória antes da transação que cria cliente/motorista (ou reutiliza IDs selecionados) e frete. Dados extraídos não autorizam WhatsApp. Placas são registradas na viagem, preservando o histórico do cadastro do motorista.

Configurar OPENAI_API_KEY na Vercel (Production), opcional DOCUMENT_EXTRACTION_MODEL (padrão gpt-4.1-mini). Redeploy. A API Responses recebe o PDF/imagem com store:false, sem ferramenta de execução. Documentação: https://developers.openai.com/api/docs/guides/file-inputs . Uso do serviço tem cobrança independente da assinatura do ChatGPT. Sem chave, apenas upload e preenchimento manual ficam operantes; não simula extração. Não usar credenciais da GlobalSAT para OCR.

Limite compartilhado de 30 novas leituras por hora. Campos ausentes permanecem vazios. MIC/DTA e CRT são distintos; frete não é valor FOB. Um container por registro, mantendo a restrição de código único já existente no sistema. Viagens recorrentes do mesmo container requerem evolução separada do modelo.

Validação com provedor real depende de chave e crédito de API. Não afirmar OCR validado apenas com testes de esquema. Configurar e testar documentos reais antes de confiar no preenchimento automático. A tela sempre permite corrigir os valores antes de salvar.
