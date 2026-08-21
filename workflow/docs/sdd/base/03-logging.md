# Logging e rastreabilidade

Toda classe usa `WorkflowLogger`, baseado em Consola, e registra mensagens no
formato `NomeDaClasse -> metodo -> etapa:`. Entrada, branches, dependências e saída
são representadas por objetos pequenos e sanitizados.

Podem aparecer IDs técnicos do job, geração, run, estado e contagens. Não podem
aparecer dados pessoais, segredo HMAC, headers de proteção, payload completo,
snapshot, nomes e descrições livres, keys ou conteúdo de imagens. Falhas registram
o nome/código estável, sem stack em respostas HTTP.

`LOG_LEVEL` aceita `silent`, `error`, `warn`, `log`, `info`, `debug` e `verbose`;
valor inválido interrompe o startup. Produção usa no mínimo `log`.
