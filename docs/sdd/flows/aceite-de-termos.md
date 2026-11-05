# Fluxo de publicação e aceite de termos

## Objetivo funcional

Administradores publicam condições identificadas por versão. Pessoas adultas
confirmam idade e concordância depois da autenticação e antes de usar negócio.
Documento, recibo e bloqueio têm o mesmo significado na Web/PWA e no Android.

## Entrada e pré-condições

Sessão autenticada não implica concordância. Nenhuma versão publicada fecha negócio
até a configuração; só administrador entra na gestão inicial. Uma publicação nova
exige novo recibo de toda a base, sem expirar sessões nem alterar recibos antigos.

## Rotas e endpoints participantes

| Ordem | Etapa | Rota | API proprietária |
| --- | --- | --- | --- |
| 1 | Autenticar | `/` | [Auth](../../../api/docs/sdd/endpoints/auth.md) |
| 2 | Verificar situação | Layout privado | [GET /terms/access](../../../api/docs/sdd/endpoints/terms.md) |
| 3 | Configurar/publicar | [/admin/terms](../../../ui/docs/sdd/routes/admin-terms.md) | [Admin terms](../../../api/docs/sdd/endpoints/admin-terms.md) |
| 4 | Ler e aceitar | `/dash` ou [/terms](../../../ui/docs/sdd/routes/terms.md) | [Terms](../../../api/docs/sdd/endpoints/terms.md) |
| 5 | Retomar negócio | Destino autorizado | Política transversal de aceite |
| 6 | Consultar histórico | `/terms` | Próprios recibos e publicação exata |

## Sequência e decisões

1. O admin cria rascunho explícito, confere identificação por versão, salva e pede
   prévia canônica. O HTML é restrito e sanitizado antes da persistência/renderização.
2. Publicação confronta revisão, hash da prévia e vigente observada. CAS e índice
   único atribuem um número crescente; o documento publicado não pode mudar.
3. Um evento mínimo de termos avisa sessões conectadas. Consultas de reconciliação
   e bloqueio HTTP mantêm a autoridade mesmo se o aviso best-effort se perder.
4. A pessoa autenticada sem recibo vigente recebe leitura em `/dash`; menu conserva
   identidade, tema e saída. URL direta não monta negócio. Tela já aberta fica
   oculta com efeitos pausados e estado recuperável preservado.
5. Após duas declarações e confirmação, o servidor grava primeiro recibo por
   pessoa/versão com data/canal verificados e relê a situação. Repetição conserva a
   evidência original. Uma corrida nunca aceita a publicação nova implicitamente.
6. Somente resposta confirmada libera o destino preservado e revalida permissão.
   Uma nova exigência repete leitura e declarações. Histórico continua consultável.
7. Android grava comprovante mínimo no mesmo SQLite, vinculado à conta. Sem conexão,
   permite treino local com prova confirmada e nenhum requisito posterior conhecido.
   Sem prova ou com exigência conhecida, precisa verificar/aceitar online.
8. Foreground e Worker classificam `TERMS_ACCEPTANCE_REQUIRED` como `terms-required`,
   persistem a referência mínima, liberam claim e pausam a fila sem loop. Conservam
   credencial, sessão, snapshots e ordem. Após aceite, o mesmo motor retoma a fila.

## Dados compartilhados

| Dado | Origem | Consumidores | Persistência |
| --- | --- | --- | --- |
| HTML seguro/hash | Service de conteúdo | Leitura e prévia | Um documento por publicação MongoDB |
| Identificação pública | Admin por versão | Leitura/cópia | No mesmo documento imutável |
| Recibo | API e sessão verificada | Gate, histórico e prova nativa | MongoDB, único pessoa/versão |
| Referência mínima | Consulta, evento ou erro HTTP | Gate e motor nativo | Memória da geração; SQLite por conta |
| Destino | Navegação efetiva validada | Router após aceite | Intenção temporária da aba |

## Estados e exceções

- `accepted`, `required` e `not-configured` são situações jurídicas, independentes
  da validade da sessão. Falha necessária de verificação fecha acesso.
- Declarações falsas/ausentes e campos injetados são rejeitados; não há menoridade,
  aptidão clínica, consentimento amplo de saúde nem autorização de responsável.
- Conflito administrativo conserva rascunho; documento publicado se corrige somente
  por outra versão. Retry de aceite ou publicação não duplica efeitos.
- `401`, CSRF, admin, compatibilidade e lease mantêm significados próprios.
  Snapshot preserva prioridade de compatibilidade antes do aceite e não renova
  lease nem grava execução quando os termos recusam acesso.
- Logout/troca de conta remove estado da geração e comprovante da conta quando a
  política nativa limpa seus dados; respostas tardias não contaminam outra conta.

## Cenários funcionais

- Primeiro login: `http://localhost:3000/?mockAuth=unauthenticated&mockTerms=required`.
- Destino pendente: `http://localhost:3000/training-plan?mockTerms=required`.
- Atualização: `http://localhost:3000/training?mockTerms=updated`.
- Bootstrap: `http://localhost:3000/dash?mockAuth=admin&mockTerms=not-configured`.
- Histórico: `http://localhost:3000/terms?mockTerms=accepted`.

Em cada cenário, a pessoa deve observar leitura e decisões antes da liberação;
consulta, login e scroll nunca produzem recibo. Android não possui URL isolada para
modo avião/Worker: exige o runtime e seu storage privado.

## Cobertura automatizada

Unitários de termos da API e política da UI protegem regras e falhas. O Playwright
em `ui/tests/integration/routes/terms.spec.ts` percorre login, retorno, publicação,
conflito de aceite, cópia e teclado usando MSW Browser; não cobre a API real.
`api/test/terms.e2e-spec.ts` e o E2E de snapshot usam MongoDB/Redis efêmeros reais.
`TermsAccessTest.java` cobre migração v5→v6, prova/conta, requisito persistido e
pausa/retomada da fila pelo motor usado no Worker. Testes Java de migrações anteriores
continuam cobrindo os caminhos aditivos. Smoke de distribuição/Google/Play Store
permanece no processo proprietário de release Android.

A recusa jurídica do Worker só grava o requisito e libera o claim em uma mesma
transação se execução, revisão e sequência ainda identificarem o item em voo.
Resposta atrasada de uma fila removida por troca de conta não cria requisito na
conta seguinte. O teste instrumentado de termos protege esse caminho.
