# Dall Fit

Monorepo da plataforma Dall Fit.

## Projetos

- `api/`: backend NestJS.
- `ui/`: frontend React + Vite.
- `packages/types/`: contratos TypeScript compartilhados entre backend e frontend.
- `docs/sdd/`: decisões e especificações que atravessam o monorepo.

## Primeiros comandos

```bash
pnpm install
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
```

Consulte [`docs/sdd/README.md`](docs/sdd/README.md) antes de alterar arquitetura,
contratos ou comportamento funcional.
