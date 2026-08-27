# Endpoints

Este diretório contém a documentação HTTP viva. Use
`../templates/endpoint-spec.md` para novas operações.

Cada documento explica humanamente todo o fluxo interno do endpoint, seguindo
Controller → Command → Services → Repositories/integrações até a response. Símbolos
e arquivos são referenciados por link; implementações não são copiadas. Todos os
caminhos felizes, alternativos e de erro conhecidos devem ser detalhados.

Cada cenário começa com o seed necessário e o cURL que o reproduz localmente,
conforme `../base/05-seeds-e-curls-de-cenario.md`.

O código segue `../base/06-logging-e-rastreabilidade.md`, mas estes documentos não
reproduzem sequências ou mensagens de log. Observabilidade aparece em um endpoint
somente quando constituir requisito funcional excepcional.

Índice atual:

- [`Autenticação`](auth.md): início/callback Google e bypass restrito local/teste.
- [`GET /auth/me`](current-person.md): pessoa vinculada à sessão.
- [`Probes operacionais`](operational.md): liveness e readiness de MongoDB/Redis.
- [`Planos de treino globais`](global-training-plans.md): operações
  administrativas, editor e métricas de impacto.
- [`Planos de treino pessoais`](personal-training-plans.md): catálogo, referência,
  ativação e editor próprio.
- [`Jobs de clonagem`](training-plan-clone-jobs.md): start, retry e cancelamento
  durável.
- [`GET /realtime/events`](realtime-events.md): stream autenticado de invalidações.
- [`Treinar`](training.md): plano ativo, sessão Redis versionada, séries, timers e
  conclusão durável.
