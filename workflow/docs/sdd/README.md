# SDD do Workflow

Este diretório é a fonte de verdade da aplicação Nitro que executa processos
duráveis. Decisões transversais permanecem no SDD da raiz; detalhes de runtime,
segurança, ambiente, testes, endpoint interno e steps pertencem a este projeto.

## Leitura obrigatória

- [`Arquitetura`](base/01-arquitetura.md)
- [`Segurança`](base/02-seguranca.md)
- [`Logging`](base/03-logging.md)
- [`Testes e qualidade`](base/04-testes-e-qualidade.md)
- [`Ambiente e deploy`](base/05-ambiente-e-deploy.md)
- [`Endpoint de início de clone`](endpoints/training-plan-clone-runs.md)
- [`Workflow de clonagem`](workflows/training-plan-clone.md)

O projeto não importa código interno da API ou da UI. O contrato de bridge é
versionado e os dados duráveis compartilhados ficam somente no MongoDB e no Blob.
