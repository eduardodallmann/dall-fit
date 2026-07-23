# Endpoints

Este diretório contém a documentação HTTP viva. Use
`../templates/endpoint-spec.md` para novas operações.

Cada documento explica humanamente todo o fluxo interno do endpoint, seguindo
Controller → Command → Services → Repositories/integrações até a response. Símbolos
e arquivos são referenciados por link; implementações não são copiadas. Todos os
caminhos felizes, alternativos e de erro conhecidos devem ser detalhados.

Cada cenário começa com o seed necessário e o cURL que o reproduz localmente,
conforme `../base/05-seeds-e-curls-de-cenario.md`.

Cada etapa registra também as mensagens e os dados sanitizados de entrada, retorno
de dependência, branch e saída conforme
`../base/06-logging-e-rastreabilidade.md`.

Índice atual:

- [`GET /`](root.md): resposta inicial do scaffold.
