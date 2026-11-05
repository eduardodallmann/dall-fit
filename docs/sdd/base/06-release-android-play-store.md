# Release Android e Play Store

## Responsabilidade e limites

O canal Android oficial é a Play Store e usa o application ID `com.dallfit.app`.
O repositório gera e verifica o Android App Bundle; upload, preenchimento legal,
submissão e promoção continuam ações manuais de uma pessoa autorizada na Play
Console. Não existe service account da Google Play no CI.

A primeira passagem usa teste interno e depois promove exatamente a mesma versão
para 100% da produção. Não há rollout percentual nem feature flag de offline.

## Identidade da release

- `versionCode` é um inteiro estritamente crescente e a identidade ordenável usada
  pelo Android, Play Store e política de compatibilidade;
- `versionName` é apresentação e precisa ser revisado em toda release;
- ambos vivem em `ui/android/app/build.gradle`;
- a build corrente usa `versionCode 3` e `versionName 1.1`, salvo
  se a Play Console já tiver consumido o código 2;
- código já aceito pela Play Console nunca é reutilizado para bytes diferentes;
- release corretiva incrementa `versionCode`; downgrade não é rollback suportado.

O artefato promovido é identificado conjuntamente por commit, versões,
fingerprint SHA-256 do certificado de upload e SHA-256 do AAB. O comando grava:

```text
ui/android/app/build/outputs/bundle/release/app-release.aab
ui/android/app/build/outputs/bundle/release/app-release.aab.sha256
ui/android/app/build/outputs/bundle/release/app-release.aab.metadata.json
```

## Chaves e certificados

Existem duas chaves distintas:

1. **app signing key própria**: identidade permanente importada no Play App Signing;
   nunca entra no GitHub, CI ou repositório e possui ao menos duas cópias offline
   cifradas sob controles separados;
2. **upload key**: assina o AAB enviado à Play Console; fica em armazenamento seguro
   local e nos secrets protegidos do GitHub. Pode ser redefinida na Play Console sem
   trocar a identidade instalada.

Gerar cada keystore em workstation autorizada com `keytool -genkeypair`, usando
prompts interativos para senhas. A app signing key precisa ter validade posterior ao
horizonte de manutenção do produto. Não fornecer senhas em argumentos de comando,
histórico de shell ou arquivo versionado.

Exportar somente certificados públicos quando necessário:

```bash
keytool -export -rfc -keystore /caminho/fora-do-repositorio/chave.jks \
  -alias alias-da-chave -file certificado-publico.pem
```

Durante o primeiro cadastro, seguir o fluxo vigente da Play Console para importar a
app signing key no Play App Signing. O certificado de **app signing** exibido pela
Play Console, não apenas o de upload, deve ser cadastrado no OAuth Android para
`com.dallfit.app`. Fingerprints de debug permanecem limitadas ao desenvolvimento.

Em perda ou comprometimento da upload key, gerar outra chave, exportar seu
certificado público e solicitar o reset na Play Console. Não trocar application ID,
app signing key ou mínimo da API como contingência.

## Configuração local

Valores `VITE_*` entram no bundle e são públicos. Nunca colocar token, senha, client
secret ou outra credencial em variável Vite.

O comando release exige:

```text
VITE_API_URL
VITE_GOOGLE_SERVER_CLIENT_ID
DALL_FIT_UPLOAD_KEYSTORE_PATH
DALL_FIT_UPLOAD_STORE_PASSWORD
DALL_FIT_UPLOAD_KEY_ALIAS
DALL_FIT_UPLOAD_KEY_PASSWORD
```

`VITE_API_URL` deve ser HTTPS público, sem credencial, localhost, loopback ou rede
privada. `VITE_GOOGLE_SERVER_CLIENT_ID` é o client OAuth Web/server público.
`VITE_ENABLE_API_MOCKS` deve estar ausente ou ser `false`.

Após exportar as variáveis somente na sessão local e apontar o path para uma upload
key fora do checkout, executar da raiz:

```bash
pnpm android:build:release
```

O script remove `ui/dist`, recompila a UI, sincroniza Capacitor, executa
`bundleRelease`, verifica a assinatura e grava checksum/metadados. Falha em qualquer
etapa não produz um artefato anunciado como publicável. Keystores `.jks`,
`.keystore` e `.p12` são ignorados também dentro de `ui/android`.

## GitHub Environment

Criar o environment `android-production`, limitar deployment à branch `main` e
configurar revisores obrigatórios. Registrar:

Variables públicas:

- `VITE_API_URL`;
- `VITE_GOOGLE_SERVER_CLIENT_ID`.

Secrets:

- `DALL_FIT_UPLOAD_KEYSTORE_BASE64`;
- `DALL_FIT_UPLOAD_STORE_PASSWORD`;
- `DALL_FIT_UPLOAD_KEY_ALIAS`;
- `DALL_FIT_UPLOAD_KEY_PASSWORD`.

`DALL_FIT_UPLOAD_KEYSTORE_BASE64` é apenas uma representação transportável do
keystore, não criptografia adicional. Seu sigilo depende do environment protegido.
O workflow reconstrói o arquivo em `$RUNNER_TEMP`, usa permissão `0600` e o remove
em step `always()`. A app signing key não é configurada nesse environment.

O workflow `Android release bundle` só aceita disparo manual, exige `main`, executa
os quality gates e testes Android locais, chama o mesmo comando release e retém por
14 dias um artifact com somente AAB, checksum e JSON de metadados públicos.

## Checklist da Play Console

Antes do primeiro upload, a pessoa responsável confere:

- conta de desenvolvedor e identidade verificadas;
- aplicativo criado como `com.dallfit.app` e nome `Dall Fit`;
- app signing key própria importada no Play App Signing e backups testados;
- upload certificate aceito e fingerprint do app signing certificate cadastrado no
  OAuth Android;
- ficha da loja, ícone, screenshots e textos revisados sem dado pessoal;
- política de privacidade publicada em URL estável;
- formulário de segurança dos dados revisado contra o comportamento implementado;
- classificação de conteúdo, público-alvo, anúncios, acesso para revisão, países e
  preço preenchidos pelo proprietário;
- target API, permissões e avisos automáticos sem bloqueio pendente;
- `ANDROID_PLAY_STORE_URL` da API apontando para a listagem HTTPS oficial;
- `ANDROID_MIN_VERSION_CODE` ainda compatível com a build distribuída.

O formulário de segurança dos dados precisa considerar autenticação, dados de
treino, transporte HTTPS, armazenamento privado local, notificações opcionais e a
ausência de analytics/diagnósticos offline persistidos. O checklist não substitui
revisão jurídica ou as respostas atuais exigidas pela Play Console.

## Smoke obrigatório no teste interno

Instalar pela própria Play Store em um aparelho API 29 e em um aparelho API 33+
ou 36; pelo menos um deles deve ser físico. Usar somente conta de teste autorizada e
registrar versão, modelo/API, track e resultado sem credencial ou dado pessoal.

1. **Instalação limpa e online**: abrir, autenticar pelo Credential Manager, navegar,
   preparar o plano, executar e confirmar sync.
2. **Primeira preparação e modo avião**: preparar online, ativar modo avião,
   iniciar/finalizar workout e confirmar terminal pendente local.
3. **Reconexão em foreground**: restaurar rede e confirmar envio único.
4. **Aplicativo fechado**: criar nova pendência, encerrar o app, restaurar rede e
   aguardar concessão best-effort do WorkManager; adiamento preserva a fila.
5. **Notificação**: em API 33+, repetir com permissão recusada e concedida; a decisão
   não muda treino nem sync. Em API 29, nenhum prompt runtime deve aparecer.
6. **Atualização**: instalar uma build anterior autorizada, criar pendência,
   atualizar pelo teste interno e confirmar migration antes da retomada.
7. **Reinstalação**: criar sessão/UUID/plano/fila, desinstalar e reinstalar; tudo
   começa limpo e exige novo login/preparo.
8. **Backup/transferência**: quando o laboratório oferecer o mecanismo, confirmar
   que shared preferences, database, files e secure storage não retornam.
9. **Atualização obrigatória**: elevar a política apenas em ambiente controlado,
   confirmar abertura da listagem oficial e restaurar o mínimo compatível.

Qualquer falha interrompe a promoção. Se a Play Console já consumiu aquele
`versionCode`, a correção usa código maior.

## Promoção e pós-release

Depois do smoke e dos formulários sem bloqueio, promover a mesma release do teste
interno para produção, selecionar 100% do público dos países definidos e revisar o
resumo antes de confirmar. Não recompilar entre tracks.

Após a disponibilidade, confirmar instalação limpa pela listagem pública, login,
consulta de compatibilidade e um sync controlado. A política mínima só é elevada
depois que a build correspondente estiver disponível e validada. Incidente posterior
usa release corretiva crescente; troca de chave, downgrade do SQLite ou redução do
mínimo não substituem a correção.

## Compatibilidade da barreira de termos

A build corrente compreende `terms-required` e migra SQLite para schema 6 sem
fabricar aceites ou remover treinos. Distribuir e validar essa build antes de
qualquer elevação do mínimo público. Não alterar `ANDROID_MIN_VERSION_CODE`
automaticamente no build ou na publicação do termo. O smoke inclui aceite inicial,
modo avião com prova confirmada, nova publicação, Worker pausado com fila preservada
e retomada depois do aceite online. O proprietário revisa/publica a minuta inicial
pela [gestão de termos](../../../api/docs/sdd/endpoints/admin-terms.md).
