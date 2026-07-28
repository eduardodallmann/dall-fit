# Fluxos ponta a ponta

Cada arquivo descreve uma jornada funcional que atravessa API e UI. Use
`../templates/flow-spec.md`.

Índice atual:

- [`Login com Google`](login-google.md): entrada pública, autenticação, cadastro e
  acesso à rota privada.

Fluxos registram sequência, decisões e dados compartilhados, mas referenciam a
documentação detalhada de endpoints e rotas sem duplicá-la.

Quando o flow possuir jornada observável no frontend, seus cenários relevantes são
automatizados em `ui/tests/integration/flows/<flow>.spec.ts` com Playwright e MSW
Browser. Essa suíte valida a jornada da UI; os endpoints reais participantes
continuam cobertos pelos E2E da API.
