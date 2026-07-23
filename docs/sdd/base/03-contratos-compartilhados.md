# Contratos compartilhados

## Objetivo

`packages/types` publica o pacote interno `@dall-fit/types`. Ele evita duplicação e
divergência em estruturas conhecidas pela API e pela UI.

## Conteúdo permitido

- contratos de request e response;
- entidades e value objects puramente estruturais;
- IDs, paginação e erros serializáveis;
- enums ou constantes de domínio usados pelos dois projetos.

## Conteúdo proibido

- DTO exclusivo de transporte interno do backend;
- props, eventos ou tipos exclusivos de componentes React;
- serviços, validações com efeito colateral ou acesso a ambiente;
- modelos de banco de dados ou detalhes do ORM;
- respostas especulativas para endpoints ainda inexistentes.

## Convenções

1. O backend é o proprietário do contrato HTTP, mas qualquer alteração consumida
   pela UI atualiza `@dall-fit/types` na mesma mudança.
2. Tipos representam o payload serializado, não classes com decorators do Nest.
3. Datas atravessam HTTP como strings e devem indicar a semântica no tipo concreto.
4. Alterações incompatíveis exigem migração coordenada entre produtores e
   consumidores e, quando não forem locais e reversíveis, um ADR.
5. Exportações públicas são feitas apenas por `packages/types/src/index.ts`.
6. Usar `import type` quando não houver valor em runtime.

## Consumo

```ts
import { SortDirection, type ApiResponse, type Entity } from '@dall-fit/types';
```

O pacote é compilado por `pnpm install` e novamente antes dos comandos agregadores
da raiz. Durante desenvolvimento, execute `pnpm -C packages/types build` após mudar
uma exportação pública caso o consumidor esteja sendo iniciado isoladamente.

## Checklist de alteração

- [ ] O tipo é realmente compartilhado por API e UI
- [ ] O nome descreve o domínio, não uma implementação
- [ ] Request, response e códigos de erro continuam coerentes com o endpoint
- [ ] Produtor e consumidores foram atualizados atomicamente
- [ ] Testes e documentação de endpoint/rota/fluxo foram atualizados
- [ ] Typecheck, testes, cobertura e build passaram
