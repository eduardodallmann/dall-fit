# ADR-0011: assistente de IA, triagem determinística e sessão sensível

- Status: `aceita`
- Responsáveis: Dall Fit

## Contexto

A criação manual de planos exige que a pessoa já saiba estruturar treinos. Um
assistente pode reduzir esse atrito, mas as respostas incluem dados de saúde e a
saída probabilística de um modelo não pode decidir risco, autorização clínica ou
persistir diretamente um plano.

## Alternativas consideradas

### Alternativa A — chat livre com geração e persistência direta

Tem menos etapas, porém amplia prompt injection, permite exercícios inexistentes,
mistura decisão clínica com geração e torna concorrência e retry ambíguos.

### Alternativa B — formulário sem modelo

Mantém a decisão determinística e previsível, mas não oferece interpretação
restrita, reformulação nem ajuste de uma proposta em linguagem natural.

### Alternativa C — máquina de estados local com provider restrito

Separa coleta, triagem, candidatos, proposta, validação, preview e confirmação. O
modelo recebe contexto mínimo e opera atrás de uma porta sem tools ou chat livre.

## Decisão

Adotar a alternativa C. A API mantém uma sessão MongoDB exclusiva por pessoa, com
CAS por `X-Resource-Version`, idempotência por operação, expiração lógica e TTL de
sete dias. Desistência e confirmação removem imediatamente conversa, respostas e
preview; replay da confirmação usa por 24 horas apenas um recibo não sensível.

O motor local calcula completude e triagem antes de qualquer proposta e novamente
na confirmação. Resultado ambíguo nunca reduz risco. Os JSONs versionados de
conhecimento, catálogo e seeds são validados no carregamento; o provider recebe
somente pergunta atual ou candidatos elegíveis e sua saída é rejeitada por schema
e regras locais antes de ser exposta.

O adapter Groq usa configuração server-side, timeout, budget de completion e saída
estruturada. Modelos compatíveis usam JSON Schema, com modo estrito quando
disponível; os demais usam JSON Object Mode, sempre seguido pelo schema local. Uma
falha transitória recebe no máximo um retry com backoff limitado. Produção falha
fechada sem feature flag, credencial, ZDR e aprovação de privacidade. O circuit
breaker é compartilhado no Redis e não participa de `/ready`. O provider fake
sustenta testes sem rede.

A confirmação reserva os IDs do aggregate e do catálogo, grava a árvore completa
com `set-on-insert` e só então cria a entrada `owned`, inativa. Uma árvore sem
entrada de catálogo permanece invisível; retry converge para os mesmos IDs.

## Consequências

### Positivas

- o modelo não decide triagem nem inventa IDs, mídia ou exercícios;
- reload, duas abas e retries preservam uma versão canônica;
- dados sensíveis têm retenção limitada e exclusão explícita;
- falha ou desligamento da IA não afeta criação, cópia ou CRUD manual;
- seeds globais são explícitos, idempotentes e não sobrescrevem edição existente.

### Negativas e riscos

- há coordenação sem transação distribuída entre aggregate, catálogo e recibo;
- a qualidade dos metadados e textos exige revisão editorial, jurídica e
  profissional antes do rollout;
- Redis, MongoDB e provider acrescentam modos de falha próprios;
- mudar provider, tratamento de dados ou semântica de triagem exige revalidação.

## Plano de adoção

- publicar com o assistente desabilitado;
- validar catálogo, configuração, ZDR, base legal e textos antes de preview;
- observar somente métricas agregadas, sem conversa ou resposta clínica;
- habilitar gradualmente e usar a flag como kill switch;
- executar os seeds globais somente pelo comando operacional documentado.

## Links relacionados

- [FIT-0073](../features/fit-0073-assistente-ia-planos-treino.md)
- [Gestão de planos pessoais](../flows/gestao-planos-treino-pessoais.md)
- [Gestão de planos globais](../flows/gestao-planos-treino-globais.md)
- [ADR-0003](ADR-0003-modelagem-dos-planos-de-treino.md)
- [ADR-0005](ADR-0005-limites-concorrencia-e-midia-dos-planos.md)
- [ADR-0009](ADR-0009-catalogo-pessoal-e-clonagem-duravel.md)
