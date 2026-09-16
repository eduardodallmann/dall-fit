# ADR-0017: Assinatura e release Android pela Play Store

- Status: `aceita`
- Data: 2026-09-16
- Responsáveis: mantenedores do Dall Fit

## Contexto

O Dall Fit distribui a primeira versão nativa como Android App Bundle de
`com.dallfit.app` pela Play Store. O aplicativo conserva sessão, UUID, SQLite,
arquivos e pendências offline no sandbox; manter application ID e certificado de
assinatura é necessário para que updates preservem esse estado e sejam aceitos
pelo Android.

O repositório precisa produzir um AAB repetível sem versionar chave privada. A
automação também não deve receber autoridade para publicar ou promover releases na
Play Console. Foi decidido manter a chave de assinatura do aplicativo sob custódia
do proprietário, em vez de delegar sua geração ao Google.

## Alternativas consideradas

### Chave de assinatura gerada pelo Google

O Play App Signing geraria e guardaria a app signing key. Reduz a custódia local,
mas não atende à escolha de manter a identidade criptográfica original sob controle
do proprietário.

### Chave própria usada também para upload

Uma chave única simplifica a cerimônia inicial, mas amplia desnecessariamente a
exposição da identidade permanente do aplicativo a workstations e CI. Perder ou
comprometer essa chave tem impacto maior que perder uma upload key redefinível.

### Chave própria no Play App Signing e upload key separada

A chave permanente é importada uma vez no Play App Signing e permanece em backup
offline cifrado. Uma segunda chave assina os AAB enviados e pode ser redefinida na
Play Console. O CI recebe somente a upload key, em environment protegido.

## Decisão

Adotar chave própria de assinatura do aplicativo, importada no Play App Signing, e
uma upload key distinta. A app signing key nunca entra no GitHub, no runner ou no
repositório. Certificados públicos e fingerprints podem ser registrados.

O comando `pnpm android:build:release` é o caminho canônico local e do CI. Ele
valida configuração pública de produção, exige as quatro entradas de assinatura,
recria o bundle Web, sincroniza Capacitor, executa `bundleRelease`, verifica a
assinatura e gera checksum e metadados públicos.

O workflow `Android release bundle` é somente manual, executa a partir de `main`,
usa o GitHub Environment `android-production` e não possui credencial da Play
Console. Uma pessoa autorizada envia o AAB ao teste interno e promove exatamente a
mesma versão para 100% da produção depois do smoke documentado.

## Consequências

### Positivas

- a identidade criptográfica permanente não é exposta ao CI;
- perda da upload key pode ser recuperada sem trocar a app signing key;
- build local e CI seguem o mesmo caminho e produzem evidência verificável;
- publicação exige ação humana e não amplia permissões do GitHub Actions;
- a mesma assinatura distribuída preserva sandbox e updates.

### Negativas e riscos

- o proprietário precisa manter duas cópias offline cifradas da app signing key;
- perder a chave antes da importação ou custodiar incorretamente bloqueia a release;
- upload e promoção continuam manuais;
- liberar diretamente 100% da produção amplia o impacto de regressão, mitigado pelo
  teste interno obrigatório da mesma versão;
- a build não é bit a bit reproduzível após assinatura; commit, versão, certificado
  e SHA-256 identificam o artefato efetivamente promovido.

## Plano de adoção

1. Gerar e custodiar app signing key e upload key distintas.
2. Importar a app signing key no Play App Signing e cadastrar o certificado de
   distribuição no OAuth Android.
3. Configurar variables, secrets e revisão obrigatória do environment
   `android-production`.
4. Gerar AAB pelo workflow manual e conferir seus metadados.
5. Publicar no teste interno, concluir o smoke e promover o mesmo bundle para 100%
   da produção.

## Links relacionados

- [FIT-0093](../features/fit-0093-preparar-release-rollout-inicial-play-store.md)
- [runbook de release Android](../base/06-release-android-play-store.md)
- [ADR-0012](ADR-0012-capacitor-android-e-fronteira-de-plataforma.md)
- [ADR-0016](ADR-0016-compatibilidade-android-e-recuperacao-visivel.md)
- [assinatura oficial Android](https://developer.android.com/studio/publish/app-signing)
