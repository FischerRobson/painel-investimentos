# Meus Investimentos

Painel pessoal de investimentos: carteira (ações, FIIs, exterior, cripto, renda fixa, moedas e bens),
projeção de renda fixa, simulador de aportes, pesquisa de ativos e cotações de moedas.
Frontend em uma página (PWA instalável no iPhone) e backend em **Quarkus** rodando no **AWS Lambda**.

## Arquitetura

```
Navegador / PWA ──HTTPS──► Lambda Function URL ──► Quarkus (Java 21, SnapStart)
                                                   ├── index.html, service worker, ícones
                                                   ├── /api/*  (token do Cognito validado pelo quarkus-oidc)
                                                   ├── S3: users/{sub}/carteira.json e historico.json
                                                   └── brapi · Yahoo · Fundamentus · Banco Central · AwesomeAPI · CoinGecko · FIPE
Login: Cognito (Google) com authorization code + PKCE; só e-mails da lista ALLOWED_EMAILS criam conta
```

| Camada | Pacote | Papel |
|---|---|---|
| Controller | `controller` | Recursos REST, validação de entrada, mapeamento de erros |
| Service | `service` | Regras de negócio, cache (`@CacheResult`), tolerância a falhas (`@Retry`) |
| Repository | `repository` | Documentos JSON com concorrência otimista por ETag: arquivo local ou S3 |
| Client | `client` | MicroProfile REST Clients, um por provedor externo |
| Model / DTO | `model`, `dto` | Dados do usuário (com Bean Validation) e contratos de resposta |

### Endpoints

| Endpoint | Descrição |
|---|---|
| `GET /api/data?symbols=&range=` | Ações/FIIs/exterior: cotação, gráfico, proventos e indicadores |
| `GET /api/crypto?coins=` | Cripto em reais |
| `GET /api/rates?from=AAAA-MM-DD` | CDI e IPCA (Banco Central), com fallback para as últimas taxas salvas |
| `GET /api/fx?days=` | Câmbio (USD, EUR, GBP, ARS, JPY) |
| `GET /api/fipe/{brands,models,years,price}` | Tabela FIPE |
| `GET/PUT /api/carteira` | Carteira do usuário (`If-Match` obrigatório no PUT; 412 em conflito) |
| `GET /api/historico`, `PUT /api/historico/{data}` | Foto diária do patrimônio |
| `GET /api/backup`, `POST /api/backup/import` | Exporta/importa tudo |
| `GET /api/benchmarks?range=&fx=&crypto=` | CDI, Ibovespa, IFIX (via XFIX11), câmbio e cripto em reais no período, para comparar a carteira |
| `GET /api/custos` | Custos da conta AWS pelo Cost Explorer (cache de 12 h: cada consulta custa US$ 0,01) |
| `GET /api/auth/config` | Configuração pública do login (sem token) |
| `GET /api/version` | Versão da API, a mesma do `pom.xml` (sem token) |

### Modo demonstração

O botão **"Modo demonstração"** (topo da página) faz o app mostrar dados fictícios, para testar ou apresentar
sem expor os dados reais. A página envia `X-Painel-Demo: 1` em toda chamada à API, e o `DemoFilter`
(`@ServerRequestFilter` pré-roteamento) responde com dados gerados pelo `DemoDataService`:
carteira, histórico, cotações, câmbio, cripto, taxas, FIPE, comparativo e custos. Gravações são aceitas e
descartadas, importar backup é recusado, o e-mail do usuário fica oculto e o service worker não guarda
essas respostas. O login continua exigido.

Erros das fontes externas voltam com HTTP 200 e `{"error": "..."}` (a página exibe a mensagem);
os endpoints de dados do usuário usam status HTTP normais (400, 404, 412, 428).

## Desenvolvimento local

Requer Java 21. Localmente não há login e os dados ficam em `data/` (fora do git).

```bash
./run.sh          # empacota se preciso e sobe em http://localhost:8765
./run.sh dev      # modo dev do Quarkus (live reload)
./mvnw verify     # testes
```

Opcional: crie um `.env` com `BRAPI_TOKEN=...` (token grátis em brapi.dev). Sem ele, as cotações vêm só do Yahoo.

## Fluxo de trabalho e deploy

1. Crie uma branch, faça as alterações, **suba a versão no `pom.xml`** e abra um Pull Request para a `master`.
2. O workflow **CI** roda em todo PR: versão, testes, pacote do Lambda, `cfn-lint` dos templates e checagem do frontend.
3. Depois do merge, rode **Actions → Deploy → Run workflow** (só funciona na `master`). Ele recusa versão já
   publicada, testa de novo, faz o deploy com o SAM e confere se a página responde, se a API exige login e se
   a versão no ar é a nova. No fim cria a tag `vX.Y.Z` e o release no GitHub, com as mudanças desde o anterior.

### Versionamento

A versão da API é a `<version>` do `pom.xml`, no formato `X.Y.Z` (veja com `./versao.sh`):
**Z** para correções, **Y** para funcionalidades novas, **X** para mudanças que quebram a API ou os dados salvos.

- **PR**: o check *Versão (maior que a da master)* falha se a versão não for maior que a da `master`.
  Ele é obrigatório na proteção da branch, então sem subir a versão não há merge.
- **Deploy**: a tag `vX.Y.Z` marca o que foi publicado; uma versão com tag não é publicada de novo.
- **Lambda**: cada versão publicada da função leva `vX.Y.Z` na descrição (parâmetro `AppVersion` do template),
  então o console da AWS mostra que versão do app cada uma roda, como a tag de uma imagem de container.
- **Página**: o topo mostra a versão no ar, lida de `GET /api/version`.

Dependências: o Dependabot abre um PR por mês para Maven e outro para as GitHub Actions. Esses PRs também
precisam subir a versão (patch) antes do merge. O SAM CLI do deploy tem versão e SHA-256 fixos no
`deploy.yml`; para atualizar, troque os dois.

O GitHub acessa a AWS por OIDC (credenciais temporárias, sem chave guardada). Configuração do environment
`production` do repositório:

| Tipo | Nome | Conteúdo |
|---|---|---|
| Variable | `AWS_DEPLOY_ROLE_ARN` | Output `DeployRoleArn` do stack `painel-github-oidc` |
| Variable | `AWS_CFN_EXEC_ROLE_ARN` | Output `CloudFormationExecRoleArn` do stack `painel-github-oidc` |
| Secret | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Cliente OAuth do Google (tipo "Aplicativo da Web") |
| Secret | `ALLOWED_EMAILS` | E-mails que podem entrar, separados por vírgula |
| Secret | `BRAPI_TOKEN` | Token da brapi.dev (opcional) |

### Infraestrutura (CloudFormation)

- `template.yaml` (SAM): Lambda + Function URL + SnapStart, bucket S3 de dados (privado, versionado,
  mantido se o stack for apagado), Cognito com Google, gatilho que restringe e-mails e logs com retenção de 14 dias.
- `infra/github-oidc.yaml`: provedor OIDC do GitHub, papel de deploy (só este repositório, environment
  `production`) e papel de execução do CloudFormation restrito aos recursos `painel-investimentos-*`.
  Deploy único e manual:

```bash
aws cloudformation deploy --template-file infra/github-oidc.yaml --stack-name painel-github-oidc \
  --capabilities CAPABILITY_NAMED_IAM --parameter-overrides \
  GitHubOwner=<dono> GitHubOwnerId=<id do dono> GitHubRepoName=<repositório> GitHubRepoId=<id do repositório>
```

Os IDs saem de `gh api repos/<dono>/<repositório> --jq '.owner.id, .id'`. O GitHub manda no token OIDC o
`sub` com esses IDs imutáveis (`repo:dono@id/repo@id:environment:production`).

O cliente OAuth do Google precisa ter como URI de redirecionamento
`https://painel-<id da conta AWS>.auth.<região>.amazoncognito.com/oauth2/idpresponse` (output `GoogleRedirectUri`).

Deploy manual (sem o GitHub), com `deploy.env` preenchido a partir de `deploy.env.example`: `./deploy.sh`.
