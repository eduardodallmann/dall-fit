# Rota `/training-plan/:catalogEntryId/workout/:workoutId`

Acesso direto sem sessão segue a
[retomada após autenticação](../base/02-rotas-e-comportamento.md#retomada-após-autenticação):
a UI apresenta o login e volta a esta rota após autenticar na mesma aba, com path,
parâmetros válidos e fragmento. Permissões e disponibilidade do recurso continuam
sendo verificadas; nenhum draft ou operação anterior é recuperado.

## Objetivo funcional

Exibir um workout próprio editável ou o conteúdo completo de uma referência
apresentada como modelo disponibilizado em leitura. A rota carrega detalhe da
entrada e workout em queries separadas.

## Modos

`owned` reutiliza `WorkoutEditor` com resource `personal`; criar, editar, excluir,
reordenar e manter imagens chamam endpoints pessoais, preservando drafts, fila CAS,
retry e signed URLs do editor administrativo. `global-reference` renderiza cards
sequenciais para os cinco discriminadores, incluindo imagem quando existente e
instrução/vídeo opcional em atividades por duração, sem inputs nem botões
edit/delete/move/upload. O modo é derivado exclusivamente do detalhe retornado.

O `hasUnsavedWork` compartilhado também registra o owner desta rota na fronteira
global de reload. Draft, debounce, fila, upload, item temporário, patch dirty e
falha/conflito recuperável adiam silenciosamente a ativação PWA; ao terminar o
último bloqueador, o reload confirmado prossegue se o documento estiver visível.

Loading usa skeleton; erro oferece retry; signed URL de plano próprio é renovada
pelo refetch já vigente. Breadcrumbs retornam a Meus planos e ao detalhe. SSE
global invalida a query da referência mesmo que o evento possua ID global e a
query use `catalogEntryId`.

No editor próprio, `Ctrl+Enter` no campo de nome confirma a edição pela mesma fila
e pelas mesmas validações do botão de salvar.

## Biblioteca de exercícios

Somente o modo próprio acrescenta `Copiar exercícios` ao final do menu `Adicionar
exercício`, depois dos cinco tipos. A ação abre uma modal sem mudar a rota.
Referências continuam somente leitura e o editor administrativo conserva o menu
original. O disparador mantém seus bloqueios estruturais e o limite de 50 itens.

`exercise-library/` compõe a modal com HeroUI, usando busca com debounce de 300 ms,
área do corpo de seleção única e paginação de 20 grupos. O filtro inicia em `Todas
as áreas`, usa os nomes de `BODY_AREAS` do editor e combina-se com a busca pelo
nome. Alterar busca ou área volta à página 1. A integração é o
[endpoint pessoal de biblioteca](../../../../api/docs/sdd/endpoints/exercise-library.md),
não o CRUD administrativo.

Cada linha mostra checkbox, nome, miniatura disponível, tipo e parte do corpo,
sem plano ou treino de origem. Pausas mostram `Não se aplica` e aparecem somente
sem restrição de área. Thumbnails YouTube não montam players; imagem privada usa
URL assinada, referrer restrito, renovação antes da expiração e fallback em falha.

Um grupo representa um nome normalizado, mesmo quando outros campos diferem. A
ocorrência do plano global atualizado mais recentemente fornece todos os campos;
IDs decrescentes desempatarão datas iguais. O filtro usa a área dessa ocorrência,
sem recuperar uma variação antiga de outra área.

### Seleção, estado e foco

- A seleção é independente da query da página e guarda referência da origem e
  ordem de marcação. Busca, área e página não a apagam. Ao reaparecer, um grupo
  continua marcado, sem duplicação ou mudança de posição. Desmarcar/marcar de
  novo move o grupo para o final da seleção.
- O rodapé permanece acessível com `X selecionados`, inclusive durante loading,
  vazio e erro. O total inclui itens ocultos. `Copiar N exercícios` confirma o
  conjunto inteiro, não apenas os resultados visíveis.
- A capacidade é `50 - quantidade atual do treino`, contando ocultos. No limite,
  desmarcados ficam desabilitados e marcados permitem remoção. Sem seleção, a
  confirmação fica desabilitada; sem resultados filtrados, uma seleção existente
  continua disponível para cópia.
- A modal informa que a seleção é mantida ao mudar área ou busca. Foco inicial na
  busca, labels e checkbox acessíveis, teclado e anúncio da contagem acompanham
  toda interação. Fechar devolve foco a `Adicionar exercício`.
- `Cancelar`, Escape e backdrop antes da submissão descartam somente a seleção da
  biblioteca. Seleção alterada participa do bloqueio de navegação/beforeunload e
  reload PWA já existente; abrir a modal vazia não bloqueia por si só.

### Cópia e recuperação

Confirmar enfileira um único POST na FIFO do plano, com versão obtida na cabeça da
fila. Nenhum exercício é inserido otimisticamente. Durante pending, a modal fica
aberta, confirmações/dismiss/filtros/busca ficam bloqueados e há feedback de espera.
O POST tem timeout finito de 60 s e nenhum retry automático.

Sucesso aplica o lote e sua versão ao workout, resumo do detalhe e listas já
cacheadas, invalida queries de Treinar, fecha a modal e anuncia a quantidade em
status inline. Os itens entram ao final na ordem de seleção, com IDs e imagens
próprias, editáveis pelas regras atuais de cada tipo. Sessões de execução já
capturadas permanecem independentes.

Falha conhecida anterior ao commit preserva seleção e mensagem persistente para
retry ou cancelamento. Erros são classificados por status e `code`. Seleção de
origem obsoleta exige `Atualizar biblioteca`: somente depois da releitura
bem-sucedida os grupos indicados são desmarcados para seleção explícita nova; os
demais permanecem. Limites de quantidade e tamanho recebem orientação própria.

`412 TRAINING_PLAN_VERSION_CONFLICT`, timeout, falha de rede e
`503 EXERCISE_COPY_RESULT_UNCERTAIN` suspendem a fila do destino. A modal oferece
`Recarregar treino e descartar rascunhos`, explicando a perda de drafts/seleção.
Somente uma leitura canônica bem-sucedida reinicia a fila, substitui o editor e
fecha a modal. A pessoa revisa o treino antes de iniciar outra cópia; não há merge
nem reenvio automático. Falha na recuperação mantém o contexto para nova tentativa.
Se fechar a modal sem recuperar, `Revisar treino antes de continuar` permite
reabri-la no estado de recuperação, mesmo com a adição normal desabilitada. Erros
de infraestrutura sem confirmação segura e resposta de sucesso sem versão válida
também exigem essa leitura; falhas de mídia conhecidas anteriores ao commit
continuam permitindo retry explícito com a seleção preservada.
Logout/troca de identidade cancelam requests e impedem callbacks de restaurarem
dados ou feedback da sessão anterior.

Lista global vazia mostra `Nenhum exercício disponível`; filtro sem resultado,
`Nenhum exercício encontrado`. Loading, retry de leitura, erro de cópia e seleção
não são confundidos. Consultas antigas não substituem resultados atuais e erros
de listagem não removem a seleção acumulada.

### Cenários da biblioteca

Link base reproduzível:
`http://localhost:3000/training-plan/74b000000000000000000001/workout/74b000000000000000000101?mockAuth=person&mockTrainingPlans=exercise-library`.

| Cenário | Seletor `mockTrainingPlans` | Given / When / Then |
| --- | --- | --- |
| seleção múltipla | `exercise-library` | biblioteca com duas páginas; marcar e paginar mantém total e ordem; confirmar copia também ocultos |
| área e busca | `exercise-library-body-area` | selecionar, filtrar Peito e buscar outro nome mantém `X selecionados`; limpar filtros reapresenta checkboxes marcados |
| agrupamento | `exercise-library-grouped` | lista já agrupada pela API; mesma identidade não é selecionada duas vezes |
| mídia | `exercise-library-media` | imagem existente e YouTube; miniaturas, fallback e cópia com identidade de asset independente |
| limite | `exercise-library-limit` | 48 itens; dois selecionados, inclusive ocultos, impedem marcar terceiro; sucesso completa 50 |
| origem obsoleta | `exercise-library-stale` | primeiro POST recusa origem; atualizar exige nova seleção antes do sucesso |
| falha de cópia | `exercise-library-copy-error` | primeiro POST falha antes do commit; mantém seleção e retry explícito conclui |
| conflito | `exercise-library-conflict` | primeira cópia conflita; leitura canônica explícita libera nova tentativa, sem replay |
| vazio e erro | `exercise-library-empty`, `exercise-library-error` | vazio não habilita confirmação; falha de leitura mostra retry sem apagar intenção |

Para testar cada linha, substituir somente o seletor do link base, abrir o menu e
a modal. Vitest em `exercise-library/index.test.tsx` cobre seleção/limites/retry;
Playwright em `tests/integration/routes/exercise-library.spec.ts` cobre o percurso
real em desktop e `390px`, com Vite e MSW Browser. Nenhuma request atinge a API real.

## Cenários e cobertura

- referência: `?mockAuth=person&mockTrainingPlans=personal-reference`, cards
  somente leitura e nenhuma escrita;
- próprio: `?mockAuth=person&mockTrainingPlans=personal-mixed`, editor completo;
- falha: `?mockAuth=person&mockTrainingPlans=detail-error`, retry.

Implementação em `personal-workout-page.tsx` e `workout-editor/`; MSW e Playwright
da rota pessoal cobrem ambos os modos.

## Referências visuais de layout

| Arquivo | Viewport | Estado MSW | Aspectos de layout relevantes |
| --- | ---: | --- | --- |
| `assets/training-plan-workout/desktop-1440-read-only.png` | `1440x900` | `personal-reference` | workout do modelo em leitura no desktop |
| `assets/training-plan-workout/mobile-390-read-only.png` | `390x844` | `personal-reference` | cards de leitura e mídia no mobile |
| `assets/training-plan-workout/desktop-1440-owned.png` | `1440x900` | `personal-mixed`, entrada própria | editor completo reutilizado pelo plano pessoal |
