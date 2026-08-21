# Ambiente e deploy

Desenvolvimento local usa `pnpm -C workflow dev`, porta `5000` e a API aponta
`WORKFLOW_BASE_URL` para essa origem. O projeto Vercel configura Root Directory
`workflow`, instala pelo lockfile da raiz e executa `pnpm build` do pacote.

| Variável               | Regra                                             |
| ---------------------- | ------------------------------------------------- |
| `PORT`                 | `5000` localmente                                 |
| `LOG_LEVEL`            | nível validado do logger                          |
| `MONGODB_URI`          | cluster compartilhado com a API                   |
| `BLOB_STORE_ID`        | store privado compartilhado; autorização por OIDC |
| `WORKFLOW_HMAC_SECRET` | segredo compartilhado, mínimo 32 caracteres       |

OIDC autoriza o SDK do Blob no projeto Workflow. A API descobre o deployment pelo
nome configurado em `WORKFLOW_PROJECT_NAME` e `@vercel/related-projects`, mantendo
`WORKFLOW_BASE_URL` como fallback local. Cada projeto configura separadamente o
segredo HMAC, MongoDB e permissões Blob. Deploy e rollback do Workflow não exigem
republicar API/UI, mas o bridge versionado precisa permanecer compatível.
