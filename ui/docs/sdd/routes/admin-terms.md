# Rota `/admin/terms`

## Objetivo funcional

Administradores elaboram versões legais em HTML, editam identificação pública e
resumo, conferem a prévia e publicam um documento imutável. O resultado exige novo
aceite de todas as pessoas, inclusive do autor. A
[leitura e aceite](terms.md) é outra superfície, posterior à autenticação.

## Entradas e pré-condições

Sessão e `Person.isAdmin=true`. Aceite vigente é necessário; a única exceção é
configurar o primeiro documento quando a situação é `not-configured`. Pessoa comum
é redirecionada por guard administrativo. O menu restrito não ganha links; a ação
inicial `Configurar primeiro termo` fica na região principal da barreira.

`mockAuth=admin` e `mockTerms=admin|not-configured|publication-conflict|unsafe-html`
são seletores locais MSW, sem efeito em produção. Seleção de documento e página são
estado local, sem identificador legal em query pública.

## Elementos e conteúdo

Lista `Gestão de termos` com Table HeroUI, título, número publicado (ou travessão
para draft), estado e `Abrir rascunho/versão N`. `Criar versão` usa a vigente como
origem ou a minuta inicial fornecida pela API. Não publica nem preenche declarações.
Paginação tem 20 itens e botões anterior/próxima.

Editor de rascunho com título, responsável, e-mail de contato, resumo das alterações
e corpo HTML em TextArea. A identificação é inserida automaticamente no documento
pelo servidor. Instrução permite headings, parágrafos, negrito, itálico e listas.
Ações: salvar, visualizar prévia, publicar, excluir e voltar. Alteração invalida a
prévia anterior; salvar devolve os campos canônicos sanitizados.

Publicações abrem somente leitura com conteúdo, número/data e identificação
histórica; edição/correção requer outra versão. Prévia tem identificação explícita
de que ainda não está publicada. Aviso informa a remoção de conteúdo não permitido.

## Caminho feliz

1. Criar versão e preencher/revisar os campos.
2. Salvar com a revisão técnica recebida; manter draft até o sucesso confirmado.
3. Pedir prévia da revisão salva. Conferir HTML canônico e identificação.
4. Acionar publicar e confirmar AlertDialog que explica imutabilidade e novo aceite
   para todos, inclusive administradores.
5. Enviar revisão, hash da prévia e ID vigente observado; após commit, a própria
   aplicação entra na barreira jurídica. Confirmar os termos libera administração.

## Caminhos alternativos

Conflitos de edição/publicação preservam o draft e mostram ação explícita
`Recarregar versão atual`; não substituem a revisão nem republicam silenciosamente.
Falha mantém formulário/AlertDialog e permite retry/cancelar. Campos ficam
bloqueados durante mutation. Excluir exige confirmação e só fecha após `204`.

Voltar ou navegar com alterações não salvas exige confirmação para descartar;
`useBlocker` e `useReloadBlocker` também protegem navegação e atualização PWA. Um
novo requisito jurídico oculta a atividade sem descartar o estado recuperável.
Sair segue a política global de encerramento, sem transformar edição em aceite.

## Validações

| Campo/ação | Regra | Efeito |
| --- | --- | --- |
| Título | Obrigatório, até 160 caracteres | Salvar/publicar dependem de entrada válida |
| Responsável | Obrigatório, até 200 | Identificação por versão |
| E-mail | E-mail válido, até 254 | Sem contato inválido na publicação |
| Resumo | Obrigatório, até 1000 | Exibido na leitura |
| HTML | Não vazio após sanitização, até 256 KiB; documento final também | API rejeita excesso/vazio |
| Prévia | Revisão salva e sem alterações posteriores | Publicar desabilitado sem prévia atual |
| Revisão | `X-Resource-Version` exata | Conflito não sobrescreve edição |
| Publicação | Hash e vigente observados | Conflito exige nova conferência |

## Estados

Loading de lista/detalhe é anunciado; vazio mostra `Nenhum termo criado` com criação
permitida. Sucesso distingue rascunho e publicação. Erro de lista/criação/detalhe
oferece retry; erro de mutation preserva draft. Pending desabilita campos,
confirmações duplicadas e dismiss. Sem admin ou sem aceite vigente, os guards
substituem esta superfície conforme seus contratos; não há bypass de URL.

## Integrações

[Endpoints administrativos](../../../../api/docs/sdd/endpoints/admin-terms.md)
pertencem à API. Services usam o único Axios e o AbortSignal das queries; mutations
usam CSRF Web ou Bearer nativo. Lista, detalhe e prévia têm chaves de termos no
QueryClient global. Revisões retornadas atualizam o documento canônico. Responses
atrasadas de criação, recarga e publicação só afetam a geração corrente.

## Navegação

Entrada pelo menu `Gestão de termos` quando liberado ou pela ação inicial de
configuração. `Voltar às versões` fecha detalhe após respeitar dirty/pending.
Navegação do browser também passa pelo blocker. Após publicação, ler/aceitar na
barreira mantém a sessão e permite voltar à administração.

## Acessibilidade e interação

TextField/Label/Input/TextArea compõem campos nomeados; Table tem cabeçalhos e row
header; confirmações usam AlertDialog HeroUI. Source editor tem fonte monoespaçada;
texto legal usa o renderer da leitura com 16 px e headings/listas. Ações quebram
linha em mobile, tabela usa ScrollContainer e o shell conserva breakpoint `768px`.
Alertas anunciam conflito/falha, e o texto enviado jamais vira HTML antes de passar
pela API canônica.

## Analytics

Path normalizado `/admin/terms`. Leitura, páginas, abertura de confirmações,
cancelamento e retry usam ações enumeradas de termos. Edição registra primeiro foco
e término por campo como `ui_field_focused/completed`, `form=terms_editor`, somente
nome enumerado e estado `empty|valid|invalid`. Valor nunca sai do formulário.
Criar/salvar/preview/publicar/excluir emitem operação com um início e um terminal.
Não enviar HTML, nome/e-mail do responsável, resumo, hash, ID, revisão, número
jurídico, payload ou erro arbitrário. Falha da coleta é absorvida.

## Cenários funcionais

### Cenário 6 — Administração da primeira versão

- Link para testar: `http://localhost:3000/admin/terms?mockAuth=admin&mockTerms=not-configured`.
- Given: nenhuma publicação e admin autenticado.
- When: cria, edita responsável/contato, salva, visualiza e confirma publicação.
- Then: uma versão imutável e bloqueio do próprio autor até aceite explícito.

### Cenário 7 — Responsável e contato pertencem à versão

- Link para testar: `http://localhost:3000/admin/terms?mockAuth=admin&mockTerms=admin`.
- When: cria versão por cópia e altera identificação.
- Then: nova leitura usa os novos dados; documento anterior conserva os originais.

### Cenário 8 — Publicações e edições concorrentes

- Link para testar: `http://localhost:3000/admin/terms?mockAuth=admin&mockTerms=publication-conflict`.
- When: tenta publicar com outro vencedor vigente.
- Then: conflito recuperável, formulário preservado e sem publicação silenciosa.

### Cenário 12 — HTML seguro e prévia fiel

- Link para testar: `http://localhost:3000/admin/terms?mockAuth=admin&mockTerms=unsafe-html`.
- When: salva conteúdo não permitido e pede prévia.
- Then: a API canônica remove conteúdo proibido, informa a filtragem e conserva destaque permitido.

## Estrutura técnica relevante

`src/routes/terms/admin/index.tsx`, `editor/index.tsx`, `document/index.tsx`,
`service.ts`, `analytics.ts` e `styles.ts`. Árvore manual do Router e layout admin
existentes. HeroUI Table, Alert, AlertDialog, TextField, Input, TextArea e Button;
formulário TanStack Form, servidor TanStack Query e `tv` de `@heroui/styles`.

## Cobertura automatizada

O cenário 6 é exercitado em `tests/integration/routes/terms.spec.ts`, usando Vite e
MSW Browser. Identificação histórica, CAS, sanitização e publicação concorrente
real são cobertos separadamente pelos unitários/E2E da API. Mocks usam responsáveis
sintéticos; não incluem os dados reais da minuta. A fronteira de Analytics testa
projeção das propriedades permitidas. Não há referência visual para este slug.
