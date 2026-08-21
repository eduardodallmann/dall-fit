# Segurança do Workflow

O único endpoint de negócio é interno. Ele exige versão `1`, timestamp decimal de
13 dígitos com tolerância de cinco minutos e HMAC-SHA256 sobre método, pathname,
timestamp e hash SHA-256 do body. A comparação é constante e o body tem no máximo
512 bytes, com exatamente `cloneJobId` e `generation`.

API e Workflow recebem o mesmo `WORKFLOW_HMAC_SECRET`, com pelo menos 32 caracteres,
em variáveis separadas de cada projeto. Previews protegidos podem exigir também o
segredo Vercel de bypass, enviado apenas pela API. Logs nunca incluem segredo,
assinatura, snapshot, URL assinada, pathname privado ou binário.

O Workflow não expõe cookies, sessão de pessoa ou endpoint de leitura. Ownership e
estado são novamente conferidos no MongoDB; geração e `workflowRunId` impedem uma
execução antiga de assumir ou finalizar um retry novo.
