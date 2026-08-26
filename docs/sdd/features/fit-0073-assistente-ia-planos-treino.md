# Feature Spec: Assistente de IA para criar planos de treino com triagem segura

> Documento autocontido para orientar a implementação e validar a demanda sem
> depender de conversa externa. Depois da entrega, permanece como registro
> histórico e não representa necessariamente o comportamento atual.
>
> Criar ou refinar este documento não autoriza implementação nem atualização dos
> SDDs vivos. Ao apresentá-lo, encerrar o trabalho e aguardar uma mensagem posterior
> e explícita do usuário autorizando a implementação desta feature.

## Contexto e resultado esperado

- Ticket: [FIT-0073](https://github.com/eduardodallmann/dall-fit/issues/73).
- Problema: a pessoa autenticada pode criar um plano vazio ou copiar/usar um plano
  global, mas ainda precisa conhecer a estrutura do editor e escolher cada
  exercício. A demanda original também reuniu uma conversa exploratória e uma
  planilha com vídeos, porém anexos não são uma fonte estável para implementação.
  Além disso, respostas sobre sintomas, condições de saúde e limitações são dados
  pessoais sensíveis e não podem ser entregues a um chatbot geral, usadas como
  diagnóstico ou enviadas a um provedor sem tratamento aprovado.
- Resultado: o dropdown Novo plano recebe a opção Me ajude a criar. Uma modal
  conduz uma conversa persistente, de uma pergunta por vez, coleta somente os dados
  necessários, aplica triagem determinística no backend e gera uma prévia usando
  exclusivamente um catálogo local versionado. A IA interpreta linguagem e propõe
  uma estrutura; não decide a segurança clínica, não acessa CRUD e não inventa
  exercícios. A gravação ocorre somente após confirmação explícita, cria uma árvore
  pessoal completa sem exposição parcial e é idempotente. Dois planos globais
  iniciais e o inventário deduplicado de 75 vídeos ficam definidos nesta spec, sem
  dependência da planilha.
- Decisão de provedor para o MVP:
  - criar uma porta de provedor substituível no backend;
  - entregar inicialmente um adapter Groq, com modelo configurável e
    llama-3.3-70b-versatile como valor avaliado nesta especificação;
  - exigir Zero Data Retention habilitado e aprovação formal do tratamento da conta
    antes de ativar dados reais em produção;
  - não entregar Gemini como fallback produtivo no MVP. A documentação de preços
    informa que dados do free tier podem ser usados para melhorar produtos, o que
    é incompatível com o envio automático de respostas de saúde sem outra base
    contratual, jurídica e de transparência;
  - manter a feature desabilitada em produção quando nenhum provedor aprovado
    estiver configurado.
- Referências locais:
  - docs/sdd/adr/ADR-0003-modelagem-dos-planos-de-treino.md;
  - docs/sdd/adr/ADR-0005-limites-concorrencia-e-midia-dos-planos.md;
  - docs/sdd/adr/ADR-0009-catalogo-pessoal-e-clonagem-duravel.md;
  - docs/sdd/features/fit-0058-planos-treino-pessoais.md;
  - docs/sdd/flows/gestao-planos-treino-pessoais.md;
  - docs/sdd/flows/gestao-planos-treino-globais.md;
  - api/docs/sdd/endpoints/personal-training-plans.md;
  - api/docs/sdd/endpoints/global-training-plans.md;
  - ui/docs/sdd/routes/training-plan.md.
- Fontes oficiais usadas para as decisões:
  - [Guia de Atividade Física para a População Brasileira](https://www.gov.br/saude/pt-br/centrais-de-conteudo/publicacoes/guias-e-manuais/2021/guia-de-atividade-fisica-para-a-populacao-brasileira.pdf/view);
  - [WHO Guidelines on physical activity and sedentary behaviour](https://www.who.int/publications/i/item/9789240015128);
  - [PAR-Q+ oficial](https://eparmedx.com/print-versions-of-par-q/);
  - [ACSM, atualização de diretrizes de treinamento resistido de 2026](https://acsm.org/resistance-training-guidelines-update-2026/);
  - [LGPD, Lei 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm);
  - [ANPD, guia de segurança da informação](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-vf.pdf);
  - [OWASP, Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/);
  - [Gemini models](https://ai.google.dev/gemini-api/docs/models),
    [pricing e uso de dados](https://ai.google.dev/gemini-api/docs/pricing) e
    [function calling](https://ai.google.dev/gemini-api/docs/function-calling);
  - [Groq models](https://console.groq.com/docs/models),
    [local tool calling](https://console.groq.com/docs/tool-use/local-tool-calling),
    [tratamento de dados](https://console.groq.com/docs/your-data) e
    [structured outputs](https://console.groq.com/docs/structured-outputs).
- Features relacionadas: FIT-0058 criou o catálogo pessoal, o ownership e a
  criação manual que esta demanda reutiliza. FIT-0028 e FIT-0030 definiram os
  limites e a concorrência do aggregate. Esta feature não altera a semântica de
  referências globais ou clonagem durável.

## Escopo

### Incluído

- opção Me ajude a criar no dropdown Novo plano da rota /training-plan;
- modal ampla, acessível e persistente com histórico de conversa, respostas rápidas,
  campo livre, pergunta pendente, preview e recuperação de falha;
- uma sessão ativa por pessoa, retomável por sete dias de inatividade;
- questionário estruturado em português para adultos, objetivo, experiência,
  disponibilidade, infraestrutura, preferências, tolerância e triagem;
- triagem conservadora e determinística no backend, com estados de esclarecimento,
  bloqueio profissional e emergência;
- defesa em camadas contra assunto fora do escopo, prompt injection, payload grande,
  repetição e tentativa de forçar catálogo ou CRUD;
- provider abstraction server-side, adapter Groq inicial, fake determinístico em
  local/teste, feature flag e kill switch;
- base de conhecimento e catálogo de exercícios em JSON versionado, validado no
  bootstrap, build e testes;
- 75 referências YouTube únicas deduplicadas das 88 linhas de origem;
- proposta estruturada, validação integral, preview, ajustes limitados ao escopo e
  confirmação idempotente;
- criação de plano pessoal completo no aggregate embutido e entrada owned no
  catálogo pessoal, sem ativação automática;
- dois planos globais versionados e idempotentes com 45 vídeos únicos;
- contratos compartilhados, endpoints, handlers MSW, fixtures, seeds, unitários,
  E2E da API e Playwright da UI;
- atualização dos SDDs vivos e ADR de IA, privacidade e dados temporários somente
  na futura implementação autorizada.

### Não incluído

- diagnóstico, prognóstico, tratamento, reabilitação, liberação médica ou
  substituição de médico, fisioterapeuta ou profissional de Educação Física;
- prescrição para menores, gestação, pós-parto, atletas de alto rendimento ou
  condições clínicas complexas;
- dieta, suplementação, medicamentos, nome de medicamento, laudo ou documento
  clínico;
- chatbot geral, busca autônoma na internet ou resposta a programação, notícias e
  outros assuntos sem relação com a criação do plano;
- criação de exercício, vídeo, URL, youtubeId, imagem ou catalogKey fora do catálogo
  aprovado;
- acesso do modelo a MongoDB, repositories, commands de gravação, browser, function
  calling genérico ou qualquer ferramenta de CRUD;
- adaptação clínica por tabelas universais de exercícios proibidos e substitutos;
- usar IMC isoladamente como veto ou concluir que máquinas são automaticamente
  seguras;
- ajuste automático diário, acompanhamento contínuo, chat depois da criação,
  histórico de versões do plano, compartilhamento ou cobrança;
- ativar automaticamente o plano criado;
- editar as referências globais existentes ou alterar o Workflow de clonagem;
- internacionalização nesta entrega;
- manter a planilha ou o PDF no repositório;
- criar screenshots de referência. A rota não possui referência visual aplicável.

## Projetos e documentação afetados

- API e endpoints:
  - criar o domínio training-plan-assistant, com controller de transporte, um
    command proprietário por endpoint, services coesos, port de provider e
    repository de sessão;
  - manter o modelo externo encapsulado por service; controller e command não
    chamam SDK, MongoDB ou Redis diretamente;
  - reutilizar o serviço pessoal de materialização apenas pela sua interface
    pública, preservando owner derivado da sessão e entrada owned;
  - criar api/docs/sdd/endpoints/training-plan-assistant.md com todos os branches,
    seeds e cURLs;
  - atualizar personal-training-plans.md para a materialização completa e
    global-training-plans.md para os dois modelos globais;
  - atualizar configuração, readiness somente se a política operacional aprovada
    decidir que a IA é dependência de prontidão. A decisão desta feature é não
    derrubar /ready quando o provedor estiver indisponível: o CRUD manual continua
    saudável e somente o assistente fica indisponível.
- UI e rotas:
  - alterar somente a rota existente /training-plan; não criar nova URL para a
    modal;
  - usar a instância Axios única, TanStack Query/Form, HeroUI e estilos próprios em
    styles.ts com tv;
  - acrescentar os estados e links reproduzíveis em
    ui/docs/sdd/routes/training-plan.md;
  - proteger navegação/reload enquanto houver mensagem, ajuste ou confirmação em
    voo; a sessão já persistida não transforma mero fechamento da modal em perda
    de trabalho.
- Fluxos:
  - atualizar docs/sdd/flows/gestao-planos-treino-pessoais.md com início, retomada,
    preview, confirmação e redirecionamento;
  - atualizar gestao-planos-treino-globais.md somente para documentar o bootstrap
    dos dois modelos, sem mudar o CRUD administrativo.
- Contratos em @dall-fit/types:
  - publicar status, pergunta, opções, mensagens públicas, preview, requests e
    responses consumidos pela UI;
  - manter detalhes de triagem, prompt, provider, token usage, regra interna e
    persistência exclusivos da API;
  - reutilizar TrainingPlanDetails, Exercise e BodyArea na resposta final onde
    forem semanticamente equivalentes;
  - nenhum contrato público expõe personId, ownerPersonId, prompt, candidate list,
    flags internas, custo, raw provider response ou idempotency hash.
- Decisões arquiteturais:
  - criar ADR para a fronteira de IA, seleção do primeiro provider, ZDR, JSON
    versionado, sessão sensível temporária e ausência de tools;
  - preservar ADR-0003 para aggregate embutido, ADR-0005 para limites/CAS e
    ADR-0009 para catálogo pessoal.
- Handlers e fixtures MSW:
  - cobrir ausência de sessão, coleta, esclarecimento, bloqueio, preview, provider
    indisponível, versão concorrente, desistência e confirmação;
  - o MSW simula respostas canônicas e nunca chama um modelo.
- Mocks de repositories/caches nos unitários da API:
  - mocks tipados para sessão, provider, relógio, materialização e idempotência;
  - regras puras de triagem, completude, seleção de catálogo e validação de proposta
    são testadas sem banco ou rede.
- Fixtures MongoDB/Redis nos E2E:
  - MongoDB efêmero cobre sessão, TTL lógico, índice de sessão ativa, ownership,
    versão, recibo de confirmação e materialização;
  - Redis efêmero cobre rate limit e circuit breaker quando participar do fluxo;
  - provider é substituído por adapter determinístico; E2E não envia dados à Groq.

## Requisitos funcionais

### Entrada, modal e retomada

1. O dropdown Novo plano mantém, nesta ordem, Criar novo plano, Copiar um plano e
   Me ajude a criar.
2. Me ajude a criar abre uma Modal HeroUI ampla. Backdrop e Escape não apagam nem
   abandonam a sessão; fechar apenas oculta a modal. A ação Desistir abre
   AlertDialog, explica a exclusão e exige confirmação.
3. Ao abrir, a UI consulta a sessão ativa. Se não existir, mostra aviso de caráter
   informativo e inicia uma sessão somente após a pessoa aceitar continuar. Se
   existir, restaura histórico, pergunta, respostas rápidas, estado e preview
   exatamente da versão canônica.
4. A UI exibe uma pergunta por vez. Respostas rápidas e campo livre são controles
   irmãos; o envio fica bloqueado enquanto a mutation estiver pendente. A pergunta
   atual e o botão de envio possuem nomes acessíveis.
5. Recarregar, fechar navegador, navegar para outra rota ou abrir em outro
   dispositivo não descarta a sessão. Uma nova montagem sempre lê a API; nenhuma
   resposta de saúde é persistida em localStorage, sessionStorage, cache PWA ou
   Analytics.
6. A UI mantém erro persistente e Tentar novamente em timeout, 429, 5xx ou falha de
   contrato, sem remover o texto ainda não confirmado. Cancelamento por navegação
   não é apresentado como erro.
7. Quando a triagem bloqueia, a modal mostra a mensagem canônica, não oferece gerar
   ou criar plano e mantém somente Desistir/Fechar e, quando aplicável, a orientação
   de atendimento.

### Contrato HTTP e concorrência

8. A fronteira autenticada singular deriva a pessoa da sessão e oferece:

| Método e path | Responsabilidade | Sucesso principal |
| --- | --- | --- |
| GET /training-plan-assistant/session | recuperar sessão ativa | 200 ou 204 |
| POST /training-plan-assistant/session | criar ou retomar | 201 nova ou 200 existente |
| POST /training-plan-assistant/session/messages | responder, corrigir ou pedir esclarecimento | 200 |
| POST /training-plan-assistant/session/drafts | gerar ou ajustar uma prévia | 200 |
| POST /training-plan-assistant/session/confirm | materializar o plano confirmado | 201 ou replay 200 |
| DELETE /training-plan-assistant/session | desistir e apagar dados sensíveis | 204 |

9. POST e DELETE exigem sessão, origem, CSRF e rate limit. GET devolve
   Cache-Control: private, no-store. Toda response segue ApiResponse/ApiError e
   x-request-id.
10. Mensagens e drafts exigem X-Resource-Version canônico. Versão antiga responde
    412 ASSISTANT_SESSION_VERSION_CONFLICT com a sessão preservada; a UI refaz a
    leitura e não mescla respostas silenciosamente.
11. Cada mensagem recebe clientMessageId UUID. Repetir o mesmo ID e mesmo conteúdo
    devolve o resultado anterior; reutilizá-lo com conteúdo diferente responde
    409 IDEMPOTENCY_KEY_REUSED. Draft e confirmação usam Idempotency-Key UUID com
    a mesma regra.
12. O contrato público da sessão contém id, version, status, messages, currentPrompt,
    availableAnswers, screeningOutcome público, draft quando houver, noticeVersion,
    createdAt, updatedAt e expiresAt. Não contém o objeto clínico estruturado nem
    configuração do provider.
13. Erros estáveis mínimos: ASSISTANT_DISABLED, ASSISTANT_SESSION_NOT_FOUND,
    ASSISTANT_SESSION_EXPIRED, ASSISTANT_SESSION_VERSION_CONFLICT,
    ASSISTANT_INVALID_STATE, ASSISTANT_MESSAGE_LIMIT_REACHED,
    ASSISTANT_PROVIDER_UNAVAILABLE, ASSISTANT_DRAFT_INVALID,
    ASSISTANT_SCREENING_BLOCKED, ASSISTANT_CATALOG_VERSION_MISMATCH e
    IDEMPOTENCY_KEY_REUSED. A UI decide por status e code.

### Sessão sensível e máquina de estados

14. training_plan_assistant_sessions é separada de training_plans e possui, no
    mínimo, id, personId, active, status, currentQuestionKey, answers, screening,
    messages, operationKeys, promptVersion, knowledgeVersion, catalogVersion,
    provider/model, generatedDraft, materialization, version, createdAt, updatedAt
    e expiresAt.
15. Um índice parcial único garante no máximo uma sessão active por personId.
    Todas as queries filtram personId; IDs de outra pessoa são indistinguíveis de
    ausência.
16. A inatividade expira em sete dias. Cada interação aceita renova expiresAt. O
    índice TTL faz limpeza física, mas toda leitura também compara o relógio e trata
    imediatamente uma sessão vencida como expirada, sem depender do atraso do TTL.
17. Estados persistidos e transições válidas:
    - collecting: existe pergunta obrigatória pendente;
    - clarifying: a última resposta não pôde ser validada ou precisa de detalhe;
    - ready: completude e triagem permitem solicitar proposta;
    - generating: uma geração idempotente está reservada;
    - preview: existe proposta integral validada;
    - blocked: avaliação profissional, emergência ou população fora do MVP;
    - completed: transição técnica imediatamente anterior à limpeza sensível.
18. Não há transição de blocked para ready na mesma sessão. A pessoa pode desistir;
    uma futura nova sessão começa sem herdar respostas anteriores.
19. São aceitas no máximo 40 mensagens da pessoa e 1.000 caracteres Unicode
    normalizados por mensagem. O histórico total e o contexto do provider possuem
    limites configurados; ultrapassar o limite não trunca silenciosamente resposta
    clínica nem muda a triagem.
20. Desistência remove sessão, mensagens, answers e draft. Confirmação bem-sucedida
    faz o mesmo imediatamente. Para replay seguro, persiste por 24 horas apenas um
    recibo não sensível com personId, hash da chave, catalogEntryId, trainingPlanId
    e expiração; ele não contém conversa, saúde, prompt ou proposta.

### Questionário estruturado

21. A v1 atende somente pessoa que confirma ter 18 anos ou mais. Idade inferior,
    recusa ou dúvida bloqueia a geração sem coletar outras respostas sensíveis.
22. Campos obrigatórios:
    - idade e confirmação de maioridade;
    - objetivo: saúde geral, condicionamento, emagrecimento, hipertrofia ou retorno
      à rotina;
    - experiência: nunca treinou, iniciante, intermediário ou avançado;
    - tempo sem treinar quando houve interrupção;
    - frequência semanal entre 2 e 6 dias;
    - minutos disponíveis por sessão entre 20 e 120;
    - local: academia completa, academia simples/de prédio ou outro;
    - equipamentos conhecidos;
    - preferências e movimentos que não deseja executar;
    - tolerância atual a caminhada, bicicleta e impacto;
    - dor, lesão ou limitação atual;
    - triagem de saúde completa;
    - ciência do caráter informativo, vinculada a noticeVersion.
23. Peso e altura não são coletados na v1 porque nenhuma regra determinística desta
    feature precisa deles. Uma evolução que os use deve voltar à especificação,
    explicar finalidade e nunca transformar IMC isolado em veto.
24. A API mantém answers estruturadas como fonte de verdade. O provider pode sugerir
    um valor extraído, mas somente o parser/schema do campo o confirma. Ambiguidade
    mantém o valor pendente.
25. Se uma mensagem responder vários campos com valores inequívocos, todos são
    validados e armazenados e a próxima pergunta é o primeiro campo pendente. Uma
    resposta válida nunca é perguntada de novo.
26. Correção explícita invalida dependências posteriores. Por exemplo, mudar
    frequência ou equipamentos descarta draft e refaz completude; mudar resposta
    de saúde recalcula a triagem antes de qualquer nova geração.
27. Depois de três respostas inválidas para o mesmo campo, o prompt oferece opções
    fechadas e a possibilidade de desistir. O sistema não inventa um default.
28. Perguntas sensíveis informam brevemente sua finalidade. A v1 não solicita nome
    de medicamento, diagnóstico detalhado, laudo, documento, foto ou contato de
    profissional.

### Triagem determinística e segurança

29. fitness-guidelines.v1.json define perguntas, opções, reformulações, população,
    completude, regras de triagem, avisos, mensagens de encaminhamento, limites de
    geração e fontes. Um schema Zod rejeita chave, enum, regra ou referência
    inconsistente antes de o serviço ficar disponível.
30. A sequência adapta conceitos do PAR-Q+ sem copiar o formulário nem afirmar que
    o substitui. O texto final precisa de revisão jurídica e de profissional de
    saúde/Educação Física antes da ativação produtiva.
31. Perguntas de saúde fechadas cobrem:
    - condição cardíaca ou pressão alta já informada por profissional;
    - dor/pressão no peito atual, em repouso, no cotidiano ou no esforço;
    - desmaio, perda de consciência, tontura importante ou perda de equilíbrio;
    - falta de ar desproporcional;
    - condição crônica relevante e se está controlada;
    - uso de medicamento contínuo que possa afetar atividade, sem pedir o nome;
    - problema ósseo, articular, muscular, dor aguda, lesão ou limitação;
    - orientação para exercício somente sob supervisão;
    - gestação ou pós-parto;
    - outra razão para não iniciar atividade agora.
32. O backend calcula exatamente um resultado:

| Resultado | Efeito |
| --- | --- |
| apto_para_fluxo_geral | permite completar e gerar sugestão geral |
| precisa_esclarecimento | faz uma pergunta objetiva e não gera |
| requer_avaliacao_profissional | bloqueia e orienta avaliação apropriada |
| emergencia | bloqueia, orienta interromper atividade e procurar atendimento apropriado |

33. Afirmação de dor/pressão no peito atual, dificuldade respiratória importante
    atual, desmaio/perda de consciência atual ou outro sinal imediato configurado
    produz emergencia. A UI não tenta localizar serviço, diagnosticar ou estimar
    gravidade.
34. Dor/pressão relacionada ao esforço, desmaio recente sem avaliação, falta de ar
    desproporcional, condição relatada como não controlada, dor aguda/lesão ativa
    relevante ou orientação de supervisão produz
    requer_avaliacao_profissional.
35. Condição crônica ou medicamento isolados, resposta livre ambígua e limitação
    sem severidade suficiente produzem precisa_esclarecimento. Uma resposta
    incerta nunca é convertida em apto pelo modelo.
36. Menoridade, gestação, pós-parto ou condição complexa são fora do MVP e bloqueiam
    a geração com orientação apropriada, sem prescrição alternativa.
37. IMC, sobrepeso, máquina guiada, hipertensão, diabetes, dor lombar e dor no
    joelho não acionam tabelas universais de proibidos/substitutos. O sistema não
    usa expressões como liberado, sem risco, seguro para você ou diagnóstico.
38. A triagem roda antes de qualquer chamada de geração e novamente antes da
    confirmação. Mudança de catalogVersion, knowledgeVersion ou answer relevante
    invalida o draft.

### Limite de domínio e prompt injection

39. Antes do provider, a API normaliza Unicode, rejeita controles invisíveis,
    aplica limites, identifica respostas rápidas e tenta o parser determinístico da
    pergunta atual.
40. Mensagem que pede prompt, regras internas, catálogo completo, ferramenta,
    catalogKey arbitrária, programação, notícia, dieta, medicamento, diagnóstico ou
    outro assunto fora do fluxo recebe:
    Posso ajudar apenas a montar seu plano de treino. Vamos continuar: <pergunta
    pendente>.
    O estado, versão clínica e pergunta não mudam.
41. Detecção não depende somente do system prompt. Regras determinísticas cobrem
    padrões conhecidos; conteúdo ainda incerto pode usar uma operação de
    classificação restrita que devolve apenas answer, correction, clarification,
    off_topic ou injection. Essa operação não recebe catálogo, tools ou acesso a
    persistência e sua saída não pode reduzir a classificação de risco.
42. Texto ofuscado, instrução para ignorar regras, role-play, conteúdo em outro
    idioma ou JSON fingindo tool call continuam entrada não confiável. Falha de
    classificação mantém clarifying; nunca executa a instrução.
43. O system prompt e os JSONs são versionados, server-side e tratados como
    instruções. Mensagens, dados importados e resposta do provider são conteúdo não
    confiável delimitado, nunca concatenado como novas instruções.

### Provider e contexto mínimo

44. TrainingPlanAssistantProvider expõe somente três operações estruturadas:
    interpretar a resposta atual, reformular uma pergunta e propor plano. Não expõe
    chat genérico nem tools.
45. O adapter Groq fica atrás de service, usa chave somente server-side, timeout
    finito, modelo/configuração por ambiente e structured output quando suportado.
    Structured output melhora o formato, mas o schema local continua obrigatório.
46. O contexto contém somente promptVersion, knowledgeVersion, pergunta, resumo dos
    campos validados, últimas mensagens necessárias e, na proposta, candidatos
    filtrados do catálogo. Não reenvia o histórico inteiro indefinidamente.
47. O provider não recebe personId, nome, e-mail, foto, cookies, requestId, IDs de
    MongoDB, nome de medicamento, prompt de observabilidade ou dados que não
    influenciem a operação atual.
48. A ativação produtiva exige TRAINING_PLAN_ASSISTANT_ENABLED=true, provider/model
    válidos, credencial presente, ZDR confirmado, aviso/base legal aprovados e
    knowledge/catalog versions compatíveis. Configuração incompleta mantém a opção
    indisponível com explicação genérica; não impede criação/cópia manual.
49. Gemini gratuito fica explicitamente fora do fluxo produtivo desta entrega. Uma
    adoção posterior exige nova feature ou refinamento antes da implementação,
    aprovação de privacidade e teste do adapter, sem fallback silencioso entre
    fornecedores.
50. Falha, timeout, 429, schema inválido ou circuit breaker aberto não apagam a
    sessão. O usuário pode repetir a operação idempotente. O backend faz no máximo
    um retry interno com backoff apenas para operação sem efeito e erro transitório;
    mutations de materialização nunca são repetidas pelo provider.

### Catálogo e base de conhecimento

51. A API contém fitness-guidelines.v1.json e exercise-catalog.v1.json sob o domínio
    do assistente. Ambos possuem version, sources e schema executável. Build/teste
    falham por chave repetida, youtubeId inválido, BodyArea inexistente, campo extra,
    regra pendente ou referência de seed ausente.
52. Cada entrada do catálogo possui:
    - key estável no formato youtube-short:<youtubeId>;
    - name normalizado com no máximo 40 caracteres;
    - type youtube-short nesta importação;
    - youtubeId de 11 caracteres;
    - bodyArea pertencente a BODY_AREAS;
    - equipment, movementPattern, level, impact, requiresSupport, goalTags,
      instructions, notes e active.
53. Os 88 registros de origem geram exatamente 75 entradas por unicidade de
    youtubeId. As 13 ocorrências excedentes não geram alias, exercício ou seed
    duplicado. O inventário integral está no apêndice A.
54. O catálogo é a única fonte para seeds e candidatos. Um seed referencia
    catalogKey; a proposta referencia catalogKey; somente a materialização converte
    a entrada em Exercise persistido.
55. Antes de gerar, um serviço determinístico filtra active, equipamento, nível,
    impacto, movimentos recusados, objetivo e demais limites. O modelo recebe
    somente os candidatos elegíveis e não pode reintroduzir um item filtrado.
56. A implementação completa os metadados das 75 entradas e exige revisão humana
    de bodyArea, equipamento, padrão de movimento, impacto e instruções. O título
    de origem é evidência de inventário, não autorização para inventar orientação
    clínica.
57. Nenhum runtime busca vídeo ou exercício na internet. A validação do catálogo
    confirma formato e unicidade local; a revisão de disponibilidade do conteúdo é
    uma atividade editorial separada e não autoriza substituir ID silenciosamente.

### Proposta, preview, ajuste e criação

58. A proposta lógica contém somente planName, description, workouts e exercícios
    com catalogKey, sets, repetitions, restSeconds ou durationMinutes.
59. O schema local rejeita integralmente a proposta quando:
    - há campo adicional, JSON incompleto ou tipo incompatível;
    - catalogKey não existe, está inativo ou não estava entre os candidatos;
    - youtubeId, URL, ID de domínio ou mídia aparece na saída;
    - tipo ou propriedades não correspondem ao catálogo;
    - frequência difere da resposta validada;
    - existe menos de um ou mais de sete exercícios por treino;
    - há duplicação acidental no mesmo treino;
    - nome, número, quantidade, descanso, duração ou tamanho excede os contratos
      vigentes;
    - estimativa de duração excede a disponibilidade sem explicação/ajuste;
    - o plano viola população, triagem ou regra versionada.
60. A montagem é conservadora para nunca treinou, iniciante e retorno após pausa,
    cobre grandes grupos ao longo da semana, não exige falha muscular e não presume
    superioridade universal de máquina ou peso livre. Cardio/mobilidade só entram
    quando houver entrada elegível no catálogo.
61. preview apresenta nome, descrição, treinos, exercícios, séries, repetições,
    descanso e duração estimada. O provider não grava nada e a UI não apresenta o
    rascunho como plano já criado.
62. Ajuste é permitido somente para frequência, duração, distribuição, preferência
    ou troca por outro candidato elegível. Pedido clínico, fora do escopo ou que
    exige item inexistente é recusado e preserva o último preview.
63. Criar plano exige preview ainda compatível com as versões registradas, triagem
    apta, X-Resource-Version atual e Idempotency-Key. O backend revalida tudo sem
    confiar na UI.
64. O serviço reserva trainingPlanId e catalogEntryId, materializa em uma única
    inserção o documento TrainingPlan completo com workouts/exercises embutidos e
    cria a entrada owned. Uma árvore sem catálogo nunca é listada. Falha intermediária
    compensa ou converge no retry com os mesmos IDs; não cria segundo aggregate.
65. O recibo único por pessoa+hash da confirmação faz o replay devolver o mesmo
    catalogEntryId/trainingPlanId. O plano nasce version 0, inativo e sem referência
    ao provider, prompt ou dados de saúde.
66. Depois da resposta canônica, a UI atualiza/invalida catálogo e navega para
    /training-plan/:catalogEntryId. A sessão sensível é removida antes do sucesso
    público; falha de limpeza impede declarar conclusão.

### Seeds globais

67. A mesma definição versionada do catálogo gera dois modelos globais. O comando é
    explícito, idempotente e nunca roda no startup. Local/teste usa o seed documentado;
    aplicação em ambiente publicado exige dry-run, ambiente validado e confirmação
    operacional exata, conforme documentação criada na implementação.
68. Cada modelo usa ID interno determinístico, ownerPersonId nulo e inserção
    set-on-insert. Repetição não duplica nem sobrescreve edição administrativa já
    existente. Divergência estrutural é reportada e exige decisão humana.
69. Todos os 45 IDs usados pelos dois modelos são distintos, existem no catálogo,
    têm type youtube-short, 3 séries, 12 repetições e 60 segundos de descanso.
70. Plano básico de musculação - 3 dias:

| Treino | Exercício | youtubeId | bodyArea |
| --- | --- | --- | --- |
| A — Pernas | Leg press sentado | n4rakmCKJkg | quadriceps |
| A — Pernas | Flexor sentado | 1XTX22zHV-U | hamstrings |
| A — Pernas | Cadeira extensora | T18xxjCw33I | quadriceps |
| A — Pernas | Cadeira abdutora | 46_uWo2yVKw | glutes |
| A — Pernas | Cadeira adutora | XMewm1W-ECY | adductor |
| A — Pernas | Panturrilha no leg sentado | sJgUYTJWncw | calf |
| B — Costas e bíceps | Puxada alta articulada | WiOlNR2g3rA | back |
| B — Costas e bíceps | Remada baixa com triângulo | EXAikbHGpJ4 | back |
| B — Costas e bíceps | Remada serrote com halter | Nfft0NAOMfo | back |
| B — Costas e bíceps | Crucifixo inverso na máquina | zZJK_aglDFY | shoulder |
| B — Costas e bíceps | Lombar na prancha | PH3atYH2vns | lower-back |
| B — Costas e bíceps | Rosca martelo com halteres | _YaUOyLeXOU | biceps |
| C — Peito e tríceps | Supino sentado na máquina | hqdrlc4Jgqc | chest |
| C — Peito e tríceps | Supino inclinado com halteres | erggHEES3tg | chest |
| C — Peito e tríceps | Crucifixo na máquina | FSe7LTfIFUg | chest |
| C — Peito e tríceps | Crucifixo inclinado com halteres | WRtKbvjUWyw | chest |
| C — Peito e tríceps | Supino reto com barra | 4h_WrfU9NTI | chest |
| C — Peito e tríceps | Tríceps com corda | YUnL8IFg7sc | triceps |

Descrição: Divisão simples para quem está começando ou retomando, com pernas,
costas/bíceps e peito/tríceps.

71. Plano completo de musculação - 5 dias:

| Treino | Exercício | youtubeId | bodyArea |
| --- | --- | --- | --- |
| A — Pernas | Leg press 45° | ZxiI-W391ds | quadriceps |
| A — Pernas | Mesa flexora | sEY9GRdpHVU | hamstrings |
| A — Pernas | Cadeira extensora | RKnynl1Xt7o | quadriceps |
| A — Pernas | Cadeira abdutora | YaGW1J7aIC8 | glutes |
| A — Pernas | Cadeira adutora | gSZXyLd8YNI | adductor |
| A — Pernas | Flexão plantar no Smith | 5WHXKjq7isA | calf |
| B — Costas | Puxada articulada | V2mOGF6yp6g | back |
| B — Costas | Remada curvada supinada | _c8NXVnlb8I | back |
| B — Costas | Remada baixa articulada | 5Nb-KZ6gOaQ | back |
| B — Costas | Puxada aberta supinada | dPsAetF50Bg | back |
| B — Costas | Crucifixo inverso no peck deck | h8-mLauzygA | shoulder |
| B — Costas | Hiperextensão lombar no aparelho | kRws_E6AoSQ | lower-back |
| C — Peito | Supino reto com halteres | K3M6pAbaUDw | chest |
| C — Peito | Crucifixo no crossover pela polia baixa | WXqdVnQd8Vc | chest |
| C — Peito | Crucifixo no crossover pela polia alta | 5jDnoAOKlYQ | chest |
| C — Peito | Crucifixo no peck deck | ueMZZ4iv_Rc | chest |
| C — Peito | Supino inclinado com barra | KKgvoYD15XM | chest |
| D — Bíceps | Rosca direta com barra reta | KiFCxrczVao | biceps |
| D — Bíceps | Rosca neutra no banco 45° | xOX9DRiQ3BQ | biceps |
| D — Bíceps | Rosca no cabo | o0dVK46WVIs | biceps |
| D — Bíceps | Rosca com barra | lKMu652A0H4 | biceps |
| D — Bíceps | Rosca neutra com halteres | NIlDUWXwC58 | biceps |
| E — Tríceps | Tríceps pulley com corda | GalcGw9Pfw8 | triceps |
| E — Tríceps | Tríceps francês com halter | jY5tG4O8BjM | triceps |
| E — Tríceps | Tríceps francês unilateral | TVlQeGLMjwc | triceps |
| E — Tríceps | Tríceps no cabo | qYCd9Qg9Nmc | triceps |
| E — Tríceps | Tríceps testa com barra | Ng4Vf2rmamE | triceps |

Descrição: Divisão por grupos musculares para pessoa com maior disponibilidade e
experiência.

## Requisitos não funcionais

- Acessibilidade:
  - modal e AlertDialog preservam foco, heading, descrição e retorno ao trigger;
  - histórico usa região com nome acessível e novos turnos são anunciados sem ler
    toda a conversa novamente;
  - perguntas rápidas são controles nomeados e o campo livre tem label persistente;
  - loading, bloqueio, erro e preview não dependem somente de cor;
  - teclado alcança responder, retry, ajustar, desistir, criar e fechar;
  - emergência usa linguagem direta sem animação ou interação que atrase a leitura.
- Performance:
  - resposta normal envia contexto mínimo, não o catálogo completo;
  - candidatos são filtrados antes da geração;
  - uma sessão contém no máximo 40 mensagens da pessoa e limites de payload/token;
  - timeout do Axios é 30 segundos para interpretação e 60 segundos para draft,
    sempre finito e com AbortSignal;
  - uma única operação por sessão fica em voo; a UI não faz polling do provider;
  - JSONs são carregados e validados uma vez por runtime aquecido.
- Segurança e privacidade:
  - LGPD trata respostas de saúde como dados sensíveis; ativação exige base legal,
    aviso, finalidade, retenção, subprocessadores e transferência internacional
    aprovados;
  - TLS e criptografia em repouso do banco/backup são gates de ambiente;
  - pessoa e IP recebem rate limits próprios: 20 mensagens, 5 drafts e 5
    confirmações por janela de dez minutos, além dos limites globais existentes;
  - chaves, prompts, respostas, histórico, triagem e raw provider payload nunca
    entram em logs, Analytics, tracing, error details ou fixtures;
  - sanitização registra somente sessionId técnico, status, questionKey, versões,
    contagens, provider/model, latência, token counts agregados e categoria de erro;
  - erros externos são traduzidos; stack e resposta do fornecedor não chegam à UI;
  - CSP não muda, pois o navegador não se conecta à Groq;
  - sessão, recibo e índices não permitem IDOR; CSRF e teardown de autenticação
    permanecem vigentes;
  - sessão expirada, desistida ou concluída é irrecuperável.
- Observabilidade:
  - métricas agregam início/terminal, latência, 429, timeout, erro de schema,
    bloqueio por categoria, tokens e custo estimado sem texto ou resposta clínica;
  - Analytics da UI emite apenas ações enumeradas assistant_open,
    assistant_message, assistant_retry, assistant_abandon, assistant_preview,
    assistant_adjust e assistant_confirm com outcome; não inclui pergunta, resposta,
    objetivo, diagnóstico, ID, tamanho de campo ou motivo clínico;
  - circuit breaker do provider não altera /ready e possui estado sanitizado.
- Resiliência e custo:
  - provider, modelo, timeout, token budget e feature flag são configuração validada;
  - falhas transitórias podem receber um retry interno seguro; a UI oferece retry
    explícito com a mesma chave;
  - circuit breaker compartilhado impede tempestade de chamadas e só degrada o
    assistente;
  - não depender de quota gratuita; orçamento e alerta operacional são definidos
    antes da ativação;
  - CRUD manual, referências e clones continuam disponíveis com IA desligada.
- Manutenibilidade:
  - prompts e JSONs possuem versão e testes de golden cases;
  - provider SDK não atravessa sua porta;
  - não criar abstrações vazias nem package compartilhado para regra exclusiva da
    API;
  - componentes exclusivos permanecem na rota até haver reutilização real.

## Critérios de aceite

### Cenário 1 — Iniciar e retomar coleta

- Forma de validar:
  http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=assistant-collecting
- Given: pessoa autenticada sem plano ativo e com sessão em coleta.
- When: abre Me ajude a criar, responde uma pergunta, recarrega e abre novamente.
- Then: histórico, resposta confirmada, versão e próxima pergunta são restaurados.
- And: backdrop/Escape não apagam dados e não há resposta sensível em storage.

### Cenário 2 — Resposta múltipla e correção

- Forma de validar:
  http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=assistant-multiple-answers
- Given: objetivo é a pergunta pendente.
- When: informa objetivo, frequência e duração na mesma mensagem e depois corrige
  frequência.
- Then: valores inequívocos são aproveitados, perguntas respondidas não se repetem
  e a correção invalida somente dados/draft dependentes.

### Cenário 3 — Ambiguidade permanece conservadora

- Forma de validar:
  http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=assistant-clarifying
- Given: existe pergunta obrigatória sem resposta válida.
- When: envia três respostas ambíguas.
- Then: nenhuma inferência é persistida como segura, o estado é clarifying e são
  oferecidas opções fechadas ou desistência.

### Cenário 4 — Triagem apta é decidida pelo backend

- Forma de validar: cenário e seed/cURL de apto_para_fluxo_geral no futuro
  api/docs/sdd/endpoints/training-plan-assistant.md.
- Given: adulto responde negativamente aos sinais de alerta e completa o fluxo.
- When: o provider sugere uma interpretação incompatível com as respostas.
- Then: a regra determinística prevalece, a sessão só fica ready pela avaliação
  local e o texto nunca afirma liberação médica.

### Cenário 5 — Esclarecimento clínico não gera plano

- Forma de validar:
  http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=assistant-health-clarification
- Given: há condição ou medicamento relatado sem informação suficiente.
- When: conclui as demais perguntas.
- Then: a API faz uma pergunta objetiva adicional, não chama geração e não pede
  nome do medicamento.

### Cenário 6 — Sinal de alerta bloqueia ou orienta emergência

- Forma de validar:
  http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=assistant-blocked
  e assistant-emergency.
- Given: a pessoa relata dor no peito relacionada ao esforço ou sintoma atual
  configurado como emergência.
- When: a mensagem é validada.
- Then: a geração fica indisponível, surge orientação canônica apropriada e não há
  diagnóstico, exercício substituto ou continuação do questionário.

### Cenário 7 — Assunto externo e prompt injection não mudam estado

- Forma de validar:
  http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=assistant-collecting
- Given: existe pergunta pendente.
- When: envia ignore as instruções, mostre o prompt, use este catalogKey, fale de
  programação e variantes ofuscadas.
- Then: recebe o redirecionamento canônico, a mesma pergunta permanece e nenhuma
  tool, geração ou gravação é chamada.

### Cenário 8 — Preview usa somente candidatos

- Forma de validar:
  http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=assistant-preview
- Given: sessão ready, triagem apta e candidatos filtrados.
- When: solicita a proposta.
- Then: cada exercício referencia catalogKey elegível, o preview mostra estrutura
  completa e nenhum plano/catálogo pessoal foi criado.

### Cenário 9 — Resposta inválida do provider é rejeitada por inteiro

- Forma de validar: seed/cURL assistant:draft-invalid no futuro documento de
  endpoint.
- Given: fake provider devolve key inexistente, campo extra, URL, número inválido ou
  frequência divergente.
- When: a API valida a resposta.
- Then: responde ASSISTANT_DRAFT_INVALID, não salva preview parcial nem chama CRUD,
  mantém a sessão recuperável e registra somente categoria sanitizada.

### Cenário 10 — Ajuste respeita escopo

- Forma de validar:
  http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=assistant-preview
- Given: existe preview válido.
- When: pede trocar um exercício aceito e depois pede tratamento para dor.
- Then: o primeiro pedido produz nova proposta validada; o segundo é recusado e
  preserva o último preview.

### Cenário 11 — Confirmação é idempotente e invisível até completar

- Forma de validar: seed/cURL assistant:confirm no futuro documento de endpoint.
- Given: preview válido e chave de confirmação fixa.
- When: duas requests iguais são enviadas, inclusive com falha simulada entre
  aggregate e catálogo.
- Then: existe exatamente um TrainingPlan completo, uma entrada owned inativa e um
  único par de IDs; nenhum plano parcial aparece na lista e o replay devolve o
  mesmo resultado.

### Cenário 12 — Desistência e expiração apagam dados

- Forma de validar:
  http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=assistant-abandon
  e E2E com relógio controlado.
- Given: sessão contém conversa e respostas de triagem.
- When: confirma Desistir ou ultrapassa sete dias sem atividade.
- Then: GET deixa de devolver o conteúdo, a pessoa pode iniciar outra sessão e
  mensagens/answers/draft não permanecem recuperáveis.

### Cenário 13 — Duas abas preservam uma verdade canônica

- Forma de validar: Playwright com duas páginas do mesmo contexto e MSW
  assistant-version-conflict.
- Given: ambas leem a versão N.
- When: enviam respostas diferentes.
- Then: uma avança para N+1, a outra recebe o conflito exato, refaz a leitura e não
  sobrescreve nem duplica a mensagem confirmada.

### Cenário 14 — Provedor indisponível não quebra o produto

- Forma de validar:
  http://localhost:3000/training-plan?mockAuth=person&mockTrainingPlans=assistant-provider-error
- Given: sessão válida e provider retorna 429, timeout ou 5xx.
- When: envia mensagem ou solicita draft.
- Then: loading termina, retry usa a mesma intenção, a sessão permanece, /ready e
  criação manual continuam operacionais e nenhum dado parcial nasce.

### Cenário 15 — Privacidade bloqueia configuração inadequada

- Forma de validar: teste de configuração e checklist operacional, sem link direto
  porque depende das credenciais/condições do ambiente.
- Given: flag ativa, mas ZDR, aprovação de privacidade ou credencial não estão
  confirmados.
- When: a API inicia ou a UI tenta começar uma sessão.
- Then: o assistente permanece desabilitado com erro genérico e nenhuma resposta é
  enviada ao provider.

### Cenário 16 — Catálogo contém 75 vídeos únicos

- Forma de validar: teste do loader e snapshot do catálogo.
- Given: inventário do apêndice A com 88 ocorrências.
- When: exercise-catalog.v1.json é validado.
- Then: existem 75 youtubeIds únicos de 11 caracteres, 13 ocorrências excedentes
  foram eliminadas, todas as entries têm metadata obrigatória e BodyArea válido.

### Cenário 17 — Dois modelos globais são idempotentes

- Forma de validar: seed/cURL assistant:global-training-plans no endpoint global.
- Given: catálogo v1 carregado.
- When: o comando é executado duas vezes.
- Then: existem somente os dois planos ownerPersonId nulo, com 3 e 5 workouts, 18 e
  27 exercícios, 45 IDs distintos e parâmetros 3x12/60; a segunda execução não
  sobrescreve edição administrativa.

### Cenário 18 — Acessibilidade da conversa e preview

- Forma de validar: Playwright nos viewports 390x844 e 1440x900.
- Given: sessão percorre coleta, erro, bloqueio e preview.
- When: a pessoa usa somente teclado e nomes acessíveis.
- Then: foco, anúncios, controles, retry, confirmação e retorno ao trigger são
  previsíveis, sem controle aninhado ou estado comunicado apenas por cor.

## Estratégia de entrega e compatibilidade

1. Introduzir primeiro schemas dos JSONs, catálogo v1, inventário deduplicado e
   testes. Qualquer vídeo sem metadata revisada impede a ativação.
2. Registrar ADR e adicionar configuração/feature flag com fake provider, mantendo
   produção desligada.
3. Criar sessão, máquina de estados, triagem e endpoints sem geração externa. Os
   cenários de segurança precisam passar com fake determinístico.
4. Implementar a porta e o adapter Groq, validar ZDR/configuração e executar
   somente testes de contrato sanitizados; não usar dados reais em teste.
5. Adicionar proposta, schema local, preview e ajustes sem materialização.
6. Integrar a confirmação ao serviço pessoal com IDs reservados e recibo
   idempotente; manter plano inativo.
7. Entregar modal, MSW e Playwright depois que o contrato HTTP estiver estável.
8. Adicionar o comando explícito dos dois globais a partir do catálogo; ele nunca
   roda automaticamente e não altera planos administrativos existentes.
9. Atualizar SDDs vivos, fontes oficiais transversais e catálogo de Analytics junto
   da implementação autorizada. A feature histórica não é alterada nessa fase.
10. Rollout: publicar com flag desligada, validar catálogo/configuração, aprovar
    privacidade e profissional responsável, habilitar em preview, observar custo e
    erros, e somente então habilitar produção. Kill switch desativa novas chamadas,
    mas ainda permite desistir e limpar sessões.
11. Não há migração de planos pessoais. Sessões só existem depois do rollout.
    Globais existentes permanecem intactos; os dois modelos usam IDs próprios.
12. Se Groq/ZDR/modelo ou revisão profissional não atenderem aos requisitos, parar
    antes da ativação e retornar à especificação; não trocar para Gemini gratuito
    nem afrouxar triagem silenciosamente.

## Plano de testes

Priorizar regras de negócio, decisões, caminhos alternativos, erros e riscos
observáveis. Não criar testes somente para aumentar cobertura de linhas.

- Unitários da API:
  - schemas e referências cruzadas dos dois JSONs;
  - 88 ocorrências, 75 IDs únicos, 13 duplicadas e 45 IDs dos seeds;
  - completude, próxima pergunta, múltiplas respostas, correção e três ambiguidades;
  - todos os resultados/branches da triagem e linguagem proibida;
  - filtro de domínio, injection, Unicode, tamanho e limite de turnos;
  - seleção determinística de candidatos;
  - provider adapter, timeout, retry, 429/5xx, circuit breaker e schema externo;
  - validação integral da proposta e invalidação por versão;
  - idempotência de mensagem, draft e confirmação;
  - materialização, compensação, recibo e limpeza sensível;
  - sanitização de logs e métricas.
- E2E da API, serial com MongoDB/Redis efêmeros:
  - autenticação, CSRF, rate limit, ownership/IDOR e índice de sessão única;
  - create/resume/message/draft/confirm/delete e todos os status/codes;
  - TTL lógico com relógio, limpeza, recibo de 24 horas e replay;
  - concorrência de versão em duas requests;
  - provider fake com falhas determinísticas, sem rede;
  - criação de árvore embutida, catálogo owned, ausência de ativo, falha
    intermediária e repetição;
  - comando dos dois globais, dry-run/proteção de ambiente e idempotência;
  - cURLs reproduzíveis no documento de endpoint.
- Unitários/componentes da UI:
  - dropdown, aviso inicial, modal, histórico e respostas rápidas;
  - recuperação, Escape/backdrop, AlertDialog e exclusão;
  - pending único, retry, cancelamento esperado e erro persistente;
  - conflito canônico sem merge;
  - coleta, clarifying, blocked, emergency, ready, preview e redirect;
  - storage/Analytics sem conteúdo sensível;
  - foco, live regions, labels e teclado.
- MSW e Playwright:
  - cenários 1, 2, 3, 5, 6, 7, 8, 10, 12, 13, 14 e 18;
  - MSW Browser e Axios reais, sem page.route ou provider real;
  - reload/reabertura, dois contexts, navegação protegida e redirecionamento final.
- Segurança:
  - ignore instructions, show prompt, tool call, catalogKey forçada, JSON/Markdown
    malicioso, Unicode ofuscado e payload grande;
  - prompt/provider output tratados como dados não confiáveis;
  - nenhuma tool disponível e nenhuma URL/ID inventado aceito;
  - nenhum conteúdo sensível em logger, ApiError, x-request-id, Analytics, cache ou
    fixtures;
  - configuração falha fechada sem ZDR/aprovação.
- Revisão profissional e operacional:
  - texto final de triagem, encaminhamento e emergência aprovado antes do rollout;
  - base legal, aviso, retenção, subprocessadores e transferência aprovados;
  - ZDR e modelo confirmados na conta real;
  - custo, quotas, kill switch e alertas validados sem conteúdo.
- Regressão:
  - criação manual, catálogo pessoal, referência global, clone, seleção ativa, CRUD
    global, CAS, SSE, autenticação, CSRF, PWA e Analytics existentes permanecem.
- Quality gates da implementação:
  - pnpm lint;
  - pnpm test;
  - pnpm test:coverage:ci;
  - pnpm build;
  - pnpm -C api test:e2e;
  - pnpm test:integration.

## Riscos e decisões

- Uma IA pode produzir JSON válido e ainda inadequado. Candidatos filtrados, regras
  locais, schema integral, preview e confirmação formam barreiras independentes; a
  saída do modelo nunca é autoridade.
- Triagem por modelo pode gerar falso negativo. A decisão é usar perguntas fechadas
  e motor determinístico; ambiguidade nunca reduz risco.
- O produto não pode afirmar que PAR-Q+ foi aplicado oficialmente. A decisão é
  adaptar o encadeamento, citar a fonte e exigir revisão de texto.
- Dados de saúde aumentam o impacto de vazamento. Minimização, sete dias, exclusão
  imediata, logs sem conteúdo e ZDR reduzem exposição, mas não substituem base
  legal e governança.
- Free tier de provedor pode mudar termos, quota ou uso de dados. A feature não
  depende de gratuidade e falha fechada quando a configuração aprovada deixa de
  existir.
- Um modelo configurado pode ser removido. O nome é ambiente e o adapter é
  substituível, mas mudar provider, tratamento de dados ou semântica clínica exige
  revalidação antes do rollout.
- Prompt injection não é resolvida por um texto de sistema. Parser, classificação
  restrita, ausência de tools, catálogo fechado, schema e autorização server-side
  limitam o impacto mesmo se o modelo obedecer a conteúdo malicioso.
- Persistir a conversa permite retomada, mas amplia retenção sensível. Sete dias é
  o equilíbrio desta feature; exportar ou conservar histórico não faz parte do MVP.
- Duas abas podem responder a mesma pergunta. CAS e idempotência preservam uma
  verdade; a UI não tenta adivinhar merge.
- Uma inserção do aggregate e outra do catálogo não formam transação distribuída.
  A árvore embutida é atômica, fica invisível sem catálogo e IDs reservados mais
  compensação/replay evitam duplicidade. Introduzir transações Mongo exige nova
  decisão compatível com a infraestrutura de testes.
- Metadados dos 75 vídeos não podem ser inferidos cegamente do título. A
  implementação exige revisão humana e falha se qualquer entrada permanecer
  incompleta.
- Seeds globais não devem sobrescrever trabalho administrativo. set-on-insert e IDs
  determinísticos preservam edições, mas uma divergência exige intervenção em vez
  de atualização automática.
- Timeout longo melhora a chance de resposta do provider, porém prende a interação.
  Limites de 30/60 segundos, AbortSignal, uma operação e retry explícito evitam
  pending infinito.

## Condições esperadas da entrega

- Critérios de aceite atendidos
- Contratos, endpoint, rota e fluxo afetados atualizados
- ADR de IA, privacidade e sessão sensível registrada
- Catálogo v1 autocontido com 75 vídeos e metadados revisados
- Dois modelos globais idempotentes com 45 IDs únicos
- Triagem determinística revisada e sem linguagem de diagnóstico/liberação
- Provider isolado, ZDR e gates de privacidade aprovados antes de produção
- Sessão retomável, ownership, TTL e exclusão sensível comprovados
- Preview obrigatório e materialização idempotente sem exposição parcial
- MSW, mocks unitários, E2E e Playwright atualizados conforme o impacto
- CRUD manual e fluxos existentes disponíveis com assistente desligado
- Código sem uso removido após revisão de API e UI
- Quality gates aplicáveis aprovados

## Apêndice A — Inventário deduplicado de vídeos

O inventário abaixo substitui a planilha como entrada da implementação. Título de
origem preserva rastreabilidade editorial; name no catálogo deve ser normalizado,
revisado e respeitar o limite público. Ocorrências maiores que 1 explicam as 13
linhas excedentes removidas por youtubeId.

| youtubeId | Título de origem | Ocorrências |
| --- | --- | ---: |
| h8-mLauzygA | Crucifixo Inverso - Peck Deck | 2 |
| _c8NXVnlb8I | Remada Curvada - Barra - Supinada | 2 |
| Nfft0NAOMfo | Remada Serrote - Halter | 1 |
| V2mOGF6yp6g | Puxada Articulada | 2 |
| kRws_E6AoSQ | Hiperextensão Lombar - Aparelho | 2 |
| 5WHXKjq7isA | Flexão Plantar - Smith | 2 |
| ssc8-WgGH1c | Leg Press 45 Unilateral | 1 |
| 8DksEpvZBNM | Agachamento - Barra - Livre | 1 |
| K3M6pAbaUDw | Supino Reto - Halter - Banco | 1 |
| GalcGw9Pfw8 | Tríceps Pulley - Cross Over - Corda - Polia Alta | 3 |
| gqQAu1Y7Q4k | Elevação Frontal - Corda - Polia Baixa | 1 |
| 19JmtPaN_k4 | Elevação Lateral - Polia Cruzada - Em Pé | 1 |
| WXqdVnQd8Vc | Crucifixo - Cross Over - Polia Baixa | 1 |
| 6pG7_UjjJzo | Prancha Alta - Isométrica | 1 |
| jY5tG4O8BjM | Tríceps francês com halter | 1 |
| Fxc0UMrgBmo | Elevação Lateral - Halter | 2 |
| 5jDnoAOKlYQ | Crucifixo - Cross Over - Polia Alta | 1 |
| ueMZZ4iv_Rc | Crucifixo - Peck Deck | 1 |
| erggHEES3tg | Supino - Halter - Banco Inclinado | 1 |
| _eehIUQuGB0 | Abdominal Infra - Alternado | 1 |
| _YaUOyLeXOU | Rosca Martelo - Duplo Halter - Em Pé | 1 |
| KiFCxrczVao | Rosca Direta - Barra Reta - Em pé | 2 |
| 5Nb-KZ6gOaQ | Remada Baixa - Máquina Articulada - Pegada Neutra | 1 |
| dPsAetF50Bg | Puxada Aberta - Supinada | 1 |
| Irb6l1iSmrU | Flexão Plantar - Máquina | 1 |
| YaGW1J7aIC8 | Abdutor - Cadeira Articulada | 1 |
| sEY9GRdpHVU | Flexora - Mesa/Cama Articulada | 2 |
| RKnynl1Xt7o | Extensora - Cadeira Articulada | 2 |
| XSqeC0u8Qdo | Flexor Vertical | 1 |
| ZxiI-W391ds | Leg Press 45º - Máquina Articulada | 2 |
| Mfu-m391YFs | Desenvolvimento - Duplo Halter - Pegada Neutra | 1 |
| vSCnLUN3z4g | Remada Baixa - Triângulo | 1 |
| hKnT97d10WM | Puxada Aberta - Pronada | 1 |
| tF4yilwuCzk | Supino Reto - Barra | 1 |
| KKgvoYD15XM | Supino - Barra - Banco Inclinado | 1 |
| NaISfa9G26s | Abdominal Supra - Solo | 1 |
| gSZXyLd8YNI | Adutor - Cadeira Articulada | 1 |
| O5qg1SS_M30 | Flexora Em Pé - Unilateral - Máquina Articulada | 1 |
| nTEntkr9X4g | ABDOMINAL 90 | 1 |
| T18xxjCw33I | EXTENSOR | 1 |
| alrantdX7z4 | LEG 45 | 1 |
| 46_uWo2yVKw | ABDUTOR CADEIRA | 1 |
| XMewm1W-ECY | ADUTOR CADEIRA | 1 |
| 1XTX22zHV-U | FLEXOR SENTADO | 1 |
| gGe_a1aCYCU | FLEXOR EM PÉ | 1 |
| bpoDDqwzVGQ | PANTURRILHA NA BARRA GUIADA | 1 |
| 55y8j6ZonjE | MANGUITO ROTADOR ELÁSTICO | 1 |
| WRtKbvjUWyw | CRUCIFIXO BANCO 30 HALTERES | 1 |
| hqdrlc4Jgqc | SUPINO SENTADO MÁQUINA | 1 |
| LZxcm2C-tck | DESENVOLVIMENTO ARTICULADO NEUTRO | 1 |
| r8I9a14aLD4 | ELEVAÇÃO FRONTAL HALTERES | 1 |
| LpGu57FI7B8 | ELEVAÇÃO LATERAL HALTERES | 1 |
| YUnL8IFg7sc | TRÍCEPS CORDA | 1 |
| TVlQeGLMjwc | TRÍCEPS FRANCÊS HALTER | 1 |
| FOEBktrbFhM | PUXADA ALTA ABERTA | 1 |
| WSo0G3ZUadY | PUXADA ALTA TRIÂNGULO | 1 |
| Ikak7TMeygc | REMADA ALTA BARRA | 1 |
| xOX9DRiQ3BQ | BÍCEPS BANCO 45 NEUTRO | 1 |
| o0dVK46WVIs | BICEPS CABO | 1 |
| PH3atYH2vns | LOMBAR NA PRANCHA | 1 |
| EXAikbHGpJ4 | REMADA BAIXA TRIÂNGULO | 2 |
| zZJK_aglDFY | CRUCIFIXO INVERSO MÁQUINA | 1 |
| n4rakmCKJkg | LEG SENTADO | 1 |
| sJgUYTJWncw | PANTURRILHA NO LEG SENTADO | 1 |
| vgXbs-Htp5s | FLEXOR DEITADO | 1 |
| FSe7LTfIFUg | CRUCIFIXO NA MÁQUINA | 1 |
| 4h_WrfU9NTI | SUPINO RETO BARRA | 1 |
| XENvpyrW1lg | DESENVOLVIMENTO COM BARRA | 1 |
| qYCd9Qg9Nmc | TRÍCEPS CABO | 1 |
| Ng4Vf2rmamE | TRÍCEPS TESTA BARRA | 1 |
| WiOlNR2g3rA | PUXADA ALTA ARTICULADA | 1 |
| p57O4yOkh3E | PULL FACE | 1 |
| lKMu652A0H4 | BÍCEPS COM BARRA | 1 |
| NIlDUWXwC58 | BÍCEPS COM HALTERES NEUTRO | 1 |
| S4i4bxvExVw | ABDOMINAL CHÃO | 1 |
