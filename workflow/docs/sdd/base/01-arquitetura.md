# Arquitetura do Workflow

`dall-fit-workflow` é uma aplicação Node/Nitro 2 independente, empacotada com o
preset `vercel` e integrada ao Vercel Workflow 4 por `workflow/nitro`. Em produção
ela é um Related Project do mesmo monorepo, com deploy e rollback próprios.

O handler Nitro valida transporte, chama um command e responde. O command reserva
o início e dispara a função durável. `TrainingPlanCloneService` concentra decisões;
`MongoTrainingPlanCloneRepository` encapsula o MongoDB e `CloneBlobService`, o Blob.
Repositories nunca recebem DTO HTTP. A aplicação usa a mesma base e o mesmo store
privado da API, mas não chama a API para executar steps.

```text
API --HTTP HMAC--> Nitro handler --> command --> Vercel Workflow
                                            ├── MongoDB (job/snapshot/destino)
                                            └── Vercel Blob (variantes copiadas)
```

Funções com `"use workflow"` orquestram; funções com `"use step"` fazem cada
efeito recuperável. Apenas IDs, geração e `workflowRunId` atravessam limites de
step. Cada `copy` privado usa OIDC, pathname determinístico e o `ifMatch` do ETag
capturado pela API. O catálogo destino só é publicado na finalização.
