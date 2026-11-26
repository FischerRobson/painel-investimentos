# Meus Investimentos

Painel pessoal de investimentos: carteira (ações, FIIs, exterior, cripto, renda fixa, moedas e bens),
orçamento mensal (entradas × saídas com metas por área), projeção de renda fixa, simulador de aportes, pesquisa de ativos, cotações de moedas e um glossário de termos financeiros.
Frontend em React (PWA instalável no iPhone) e backend em **Quarkus** rodando no **AWS Lambda**.

## Arquitetura

```
Navegador / PWA ──HTTPS──► Lambda Function URL ──► Quarkus (Java 21, SnapStart)
                                                   ├── /*  (app React: build do Vite servido pelo Quinoa, service worker e ícones)
                                                   ├── /api/*  (token do Cognito validado pelo quarkus-oidc)
                                                   ├── S3: users/{sub}/carteira.json, historico.json, positions/, precos.json e budget/
                                                   └── brapi · Yahoo · Fundamentus · Banco Central · AwesomeAPI · CoinGecko · FIPE
EventBridge Scheduler (18h, Brasília, dias úteis) ──invoke──► POST /internal/snapshots (posições do dia de todos os usuários)
Login: Cognito (Google) com authorization code + PKCE; só e-mails da lista ALLOWED_EMAILS criam conta
```

| Camada | Pacote | Papel |
|---|---|---|
| Controller | `controller` | Recursos REST, validação de entrada, mapeamento de erros |
| Service | `service` | Regras de negócio, cache (`@CacheResult`), tolerância a falhas (`@Retry`) |
| Snapshot | `snapshot` | Posições do dia (dias de pregão da B3): avaliação no servidor, PV/PPV/PnL, valor anterior quando uma cotação falha |
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
| `GET/PUT /api/budget/settings` | Metas do orçamento em % da renda líquida (somam 100%; `If-Match` no PUT) |
| `GET/PUT /api/budget/months/{AAAA-MM}` | Entradas e saídas do mês (`If-Match` no PUT; mês sem dados volta vazio e sem ETag) |
| `GET /api/budget/summary?to=AAAA-MM&months=12` | Entradas, saídas e gasto por área dos últimos meses (até 24) |
| `GET/PUT /api/budget/rules` | Regras de descrição "de → para" (`If-Match` no PUT) |
| `GET/PUT /api/budget/recurring` | Regras de lançamentos recorrentes e o que já foi criado em cada mês (`If-Match` no PUT) |
| `POST /api/budget/import/preview?name=` | Lê um extrato/fatura (corpo binário, até 5 MB) e devolve os lançamentos sugeridos, sem gravar |
| `POST /api/budget/import/commit` | Grava os lançamentos escolhidos na prévia (ignora os já importados) e registra a data da importação |
| `GET /api/budget/import/last` | Quando foi a última importação, de qual arquivo e quantos lançamentos entraram (`budget/last-import.json`) |
| `GET /api/historico` | Totais de cada dia (gerados pelo servidor, só leitura) |
| `GET /api/positions` · `GET /api/positions/{AAAA-MM-DD}` | Dias com posições salvas · posições de um dia |
| `POST /internal/snapshots` | Gera a foto do dia para todos os usuários; chamado pelo agendamento com o header `X-Snapshot-Token` |
| `GET /api/backup`, `POST /api/backup/import` | Exporta/importa tudo |
| `GET /api/benchmarks?range=&fx=&crypto=` | CDI, Ibovespa, IFIX (via XFIX11), câmbio e cripto em reais no período, para comparar a carteira |
| `GET /api/custos` | Custos da conta AWS pelo Cost Explorer (cache de 12 h: cada consulta custa US$ 0,01) |
| `GET /api/brapi/uso` | Consumo do plano da brapi (usadas, restantes, janela), mostrado na página Custos; cache de 10 min, não gasta cota |
| `GET /api/auth/config` | Configuração pública do login (sem token) |
| `GET /api/version` | Versão da API, a mesma do `pom.xml` (sem token) |

### Glossário

A página **Glossário** (`/glossario`) explica termos como Selic, CDI, CDB, P/VP e come-cotas, com exemplo
e "por que importa". O conteúdo fica em `src/main/webui/public/glossario.json` (público, sem
login, funciona offline). Para incluir um termo, adicione um item em `termos` com `id`, `nome`, `categoria`,
`resumo` e, se quiser, `sigla`, `outrosNomes` (entram na busca), `exemplo`, `importa` e `relacionados`
(ids de outros termos). O CI confere ids, categorias e relacionados. Link direto: `/glossario#selic`.

### Orçamento

A página **Orçamento** (`/orcamento`, link direto para um mês: `/orcamento#2026-11`) controla entradas e saídas
mês a mês, divididas em cinco áreas com uma meta em % da **renda líquida** (as entradas do mês):
Custos fixos, Conforto, Prazeres, Educação e Liberdade financeira. As metas somam 100% e começam em 50/10/10/5/25.

- **Saídas** têm data, descrição, valor e área. Gastos do cartão entram no **mês da fatura**; a data mostrada é a da compra.
- **Liberdade financeira** não recebe lançamentos manuais (o servidor recusa): ela virá dos aportes da Carteira.
- **Dados**: `users/{sub}/budget/settings.json` (metas) e `users/{sub}/budget/months/AAAA-MM.json` (um arquivo por mês),
  com a mesma concorrência otimista por ETag da carteira. O backup inclui o orçamento no campo `budget`.

#### Importação de extrato e fatura

O painel **Importar extrato ou fatura** aceita, do BTG Pactual, o extrato da conta corrente (XLSX, XLS ou PDF; a
planilha é a leitura mais confiável) e a fatura do cartão (PDF). O fluxo tem dois passos: a **prévia** lê o arquivo
e lista tudo; o usuário desmarca o que não quer, ajusta a área e confirma.

- Cada lançamento leva o **meio** (`method`): `creditCard` (Cartão), `creditPix` (Pix no crédito), `pix`,
  `debitCard` (Débito), `transfer`, `bill` (boleto/conta) ou `other`. Aparece como etiqueta nas tabelas.
- Vêm **desmarcados**: o pagamento da fatura (os gastos entram pela fatura), transferências de/para o próprio
  titular e estornos do cartão.
- **Regras de descrição (de → para)**: "quando a descrição contém X, troca por Y" e, opcionalmente, fixa a área
  (ex.: `Auto Posto Major` → `Combustível`, Custos fixos). Sem diferenciar maiúsculas e acentos; o trecho mais longo
  vence. Valem na prévia da importação (a descrição original aparece como "era: …") e podem ser aplicadas aos
  lançamentos do mês aberto. Ficam em `users/{sub}/budget/rules.json` e entram no backup. O botão ⇄ em qualquer
  lançamento cria a regra já preenchida.
- **Área sugerida** (sem regra): a mesma de uma saída com a mesma descrição nos últimos 6 meses; senão, pela categoria do banco.
- **Fatura**: tudo entra no mês da fatura, com a data da compra. Compras parceladas `(n/N)` podem lançar as
  parcelas futuras nos meses seguintes.
- **Sem duplicar**: cada lançamento importado guarda um `importKey` (hash de data, hora, descrição, valor e
  parcela). Reimportar o mesmo período, mesmo em outro formato, marca os itens como "já importado".

Arquitetura (`br.com.painel.statement`): `document/` transforma o arquivo em texto com posição (`PdfText`, PDFBox)
ou linhas de células (`SheetRows`, Apache POI, XLS e XLSX); `parser/` tem uma estratégia por layout
(`StatementParser`: `supports` + `parse`). O `StatementParsers` recebe todos os beans via CDI e usa o primeiro
que reconhece o arquivo. **Novo formato** = nova classe `@ApplicationScoped` que implementa `StatementParser`,
sem mexer no resto. O `StatementImportService` aplica regras (desmarcar, área, duplicados) e grava os meses.

Próximas etapas: aportes automáticos vindos da Carteira (com correção do valor) e lançamentos recorrentes.

### Orçamento: recorrentes, próximos meses e avisos

- **Lançamentos recorrentes** (aluguel, assinaturas, salário): regras em `users/{sub}/budget/recurring.json`
  (`GET`/`PUT /api/budget/recurring`, com ETag, e no backup). Ao abrir um mês atual ou passado, a página cria os
  lançamentos que faltam, com id `rec-{regra}-{mês}` (nunca duplica); o mês é gravado antes de a regra ser marcada em
  `generated`, e um lançamento apagado não volta. O botão ↻ de um lançamento cria a regra a partir dele, começando no mês seguinte.
- **Próximos meses**: o que já está comprometido nos 6 meses seguintes, somando as parcelas do cartão lançadas nas
  importações, os recorrentes (previstos até serem criados) e outros lançamentos.
- **Avisos de gasto** (só no mês atual): área que passou da meta, que já usou 80% dela ou que, no ritmo do mês, vai passar
  (custos fixos ficam fora do ritmo; ele só vale depois do dia 5).
- **VR**: o gasto pago com VR no mês aparece ao lado das entradas e saídas, fora das metas.

### Operações e imposto de renda

**A carteira só muda por operações.** Nada se inclui, altera ou remove direto nas tabelas: ações, FIIs, ETFs, BDRs,
exterior e cripto mudam por compra, venda, desdobramento, grupamento e bonificação; renda fixa por **aplicação** e
**resgate** (parcial ou total); moedas por compra e venda. Bens e proventos continuam como antes.

Tudo se lança num formulário só, na página Operações (moedas, na página Moedas): primeiro a classe (ações, FIIs e
exterior; cripto; renda fixa), depois a operação. Na compra o ticker é digitado; na **venda, no evento e no resgate o
ativo é escolhido na lista do que você tem**, com a quantidade disponível na data (botão "Tudo"; vender mais do que tem
não passa). Na Carteira, a quantidade de um ativo e o "Resgatar" de um título abrem esse formulário já no caso certo
(`/operacoes?classe=rv|cripto|rf&mov=entrada|saida|evento&ativo=...`).

- Cada operação guarda a data, a **quantidade** do ativo (na renda fixa, o principal em reais que entra ou sai), o
  **valor** em reais que saiu ou entrou na conta (`valor`) e o **valor presente** da posição no dia, logo antes da
  operação (`valorPresente`; na renda fixa, o título líquido na curva, que pode ser trocado pelo do extrato). O servidor
  grava quando recebeu cada uma (`registrado`).
- **Operação lançada não se edita nem se apaga**: um erro se desfaz com um **estorno** (`tipo: "estorno"`, `estorna`:
  id da original, com motivo opcional). As duas ficam no histórico; a estornada aparece riscada e sai de todas as contas.
  Na página Operações, estornar uma compra ou venda devolve os dados no formulário para lançar a versão corrigida.
- O servidor (`WalletLedger`) recusa um `PUT /api/carteira` que altere ou remova operações salvas e monta `acoesFiis`,
  `cripto`, `rendaFixa` e `moedas` a partir delas. Ativos de antes das operações (sem nenhuma) ficam como estavam até
  ganhar um saldo inicial; não podem ser mudados à mão. Títulos de renda fixa antigos viram, sozinhos, uma aplicação de
  saldo inicial com os mesmos dados ao abrir a Carteira; moedas antigas pedem quanto custaram.

Tudo fica no próprio `carteira.json` (`operacoes` e `proventos`), então a foto diária e a Carteira continuam lendo as
listas de sempre. Ativos que já estavam na carteira pedem um saldo inicial (data e preço médio).

As contas ficam em `src/main/webui/src/motor/operacoes.ts`, com testes no Vitest:
- **Preço médio**: inclui as taxas; venda não muda o preço médio. Day trade (compra e venda no mesmo dia) é apurado à parte.
- **IR mensal**: ações com isenção até R$ 20 mil de vendas no mês e 15%; ETF e BDR com 15% sem isenção; day trade 20%;
  FII 20%; prejuízo compensado por categoria; IRRF abatido. Cripto com isenção até R$ 35 mil e 15%. DARF 6015 e 4600
  no último dia útil do mês seguinte (abaixo de R$ 10, acumula).
- **Exterior**: 15% sobre o ganho anual em reais (Lei 14.754/2023), com o câmbio de cada operação.
- **Declaração**: bens e direitos em 31/12 pelo custo e rendimentos isentos e de tributação exclusiva.
- **Rentabilidade sem aportes** (TWR) no painel de evolução da Carteira, comparada com o CDI do período.

### VR (cartões de benefício)

Aba do Orçamento (`/orcamento/vr`) que controla o vale-refeição, o vale-alimentação ou outro cartão de benefício como
conta: saldo inicial, crédito de cada mês, gastos, estornos e ajustes (para bater com o app do cartão). Mostra o saldo
acumulado, o extrato do mês com o saldo depois de cada lançamento, quanto do crédito do mês ainda dá para gastar por
dia até o próximo crédito e o histórico mês a mês. Fica em `users/{sub}/budget/vr.json` (`GET`/`PUT /api/budget/vr`,
com ETag) e entra no backup. Contas em `src/main/webui/src/motor/vr.ts`.

### Alugar × Financiar, Monte Carlo e rebalanceamento

- **Alugar × Financiar** (`motor/moradia.ts`): SAC ou Price, CET e aluguel de equilíbrio. Os dois lados gastam o mesmo por
  mês e quem paga menos investe a diferença. Não trata TR/IPCA no saldo, FGTS nem os custos de vender o imóvel.
- **Monte Carlo** (`motor/montecarlo.ts`): 2.000 sorteios com semente fixa de inflação e juro real (reversão à média), com
  pós-fixado, IPCA+ e prefixado nos mesmos cenários. As médias e variações são premissas editáveis, não previsões.
- **Rebalancear vendendo** (página Saúde, `motor/rebalancear.ts`): vende o que passa da meta além da tolerância. O IR é a
  diferença entre as apurações da página Operações com e sem as vendas. Não vende a reserva de emergência nem título sem
  liquidez diária, e fica suspenso se algum ativo estiver sem cotação.

### Modo demonstração

O botão **"Modo demonstração"** (topo da página) faz o app mostrar dados fictícios, para testar ou apresentar
sem expor os dados reais. A página envia `X-Painel-Demo: 1` em toda chamada à API, e o `DemoFilter`
(`@ServerRequestFilter` pré-roteamento) responde com dados gerados pelo `DemoDataService`:
carteira, histórico, orçamento, cotações, câmbio, cripto, taxas, FIPE, comparativo e custos. Gravações são aceitas e
descartadas, importar backup é recusado, o e-mail do usuário fica oculto e o service worker não guarda
essas respostas. O login continua exigido.

### Posições do dia

Às **18h (horário de Brasília), de segunda a sexta**, o EventBridge Scheduler (evento `DailySnapshot` no `template.yaml`)
invoca a função com um evento no formato da Function URL para `POST /internal/snapshots`. O `SnapshotService`
percorre `users/` no S3 e, para cada carteira, avalia no servidor ações/FIIs (brapi, com o Yahoo de reserva),
cripto (CoinGecko), moedas (AwesomeAPI), renda fixa (CDI/IPCA do Banco Central, mesmas regras do `rfCalc`
da página) e bens (FIPE). Feriados da B3 (calculados em `util/B3Calendar`, incluindo Carnaval, Sexta-feira Santa,
Corpus Christi, 24/12 e 31/12) são pulados.

- **Posições**: `users/{sub}/positions/AAAA-MM-DD.json`, uma linha por ativo (bens ficam de fora): `notional`
  (quantidade; na renda fixa, o valor aplicado), `price` (em reais; na renda fixa, o valor líquido na curva por real
  aplicado), `pv` = price × notional, `ppv` = pv do último dia salvo e `pnl` = notional do dia anterior × variação do
  preço (compra e venda não contam como lucro; `null` sem preço). A Carteira mostra a tabela ao clicar num dia do gráfico.
- **Totais**: `historico.json` guarda os totais do dia (`i` = investimentos, usado pelo gráfico; `t` inclui os bens).

- **Cotação que falha**: usa o último valor conhecido, guardado em `precos.json` a cada foto (para bens, o
  último valor FIPE salvo na carteira). O dia fica marcado em `stale` (`[{"asset": "BTC", "since": "2026-11-03"}]`);
  sem nenhum valor anterior, o ativo vai para `missing`. O gráfico destaca esses dias e lista o motivo.
- **Proteção**: `/internal/*` fica fora de `/api/*`, então não pede token do Cognito; exige o header
  `X-Snapshot-Token` igual a `PAINEL_SNAPSHOT_TOKEN` (a parte aleatória do id do stack, só visível dentro da conta).
  Sem o token certo, responde 404.
- **Local**: o `@Scheduled` do Quarkus roda no mesmo horário (`painel.snapshot.cron`). Para gerar na hora:
  `curl -X POST localhost:8765/internal/snapshots` (localmente não há token).

### Logs dos provedores

Toda chamada a um provedor externo (brapi, Yahoo, Fundamentus, Banco Central, AwesomeAPI, CoinGecko, FIPE,
Cost Explorer, SSM) passa por `ProviderCall` e gera uma linha SLF4J, em inglês:

```
provider=coingecko operation=price bitcoin,ethereum outcome=success durationMs=212
provider=awesomeapi operation=last USD-BRL,... outcome=error durationMs=48 error="Connection refused"
```

Respostas que vêm do cache não geram log. No CloudWatch: filtre por `provider=` ou `outcome=error`.

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

### Frontend (React)

O frontend é **React + TypeScript** em `src/main/webui` (Vite, React Router, TanStack Query, Chart.js), servido na raiz
(`/`). Até a versão 1.x ele era um `index.html` com JavaScript inline; a migração terminou na 2.0.0, com a mesma tela,
as mesmas URLs e as mesmas chaves do localStorage (quem estava logado continua logado).

- O **Quinoa** roda o build do Vite no `mvn package` com um Node próprio (baixado em `.quinoa/`), então o build não
  depende do Node da máquina. No `./run.sh dev` ele sobe o Vite com hot reload. Rotas sem arquivo (`/carteira`,
  `/orcamento`...) devolvem o `index.html` do React; `/api`, `/internal` e `/q` continuam com o Quarkus.
- **Motor financeiro**: as contas puras ficam em `src/main/webui/src/motor/motor.ts`, com testes no Vitest.
- **Offline**: `public/sw.js` guarda o app (index.html e assets do build) e as últimas respostas da API.
- Arquivos estáticos (`sw.js`, `manifest.json`, ícones e `glossario.json`) ficam em `src/main/webui/public`.

```bash
cd src/main/webui
npm ci
npm test              # Vitest: motor financeiro, contas das páginas e cliente da API
npm run typecheck     # TypeScript strict

cd ../../../e2e       # ponta a ponta (Playwright), em modo demonstração, contra o jar empacotado
npm ci && npx playwright install --only-shell chromium
npx playwright test
```

## Fluxo de trabalho e deploy

1. Crie uma branch, faça as alterações, **suba a versão no `pom.xml`** e abra um Pull Request para a `master`.
2. O workflow **CI** roda em todo PR: versão, testes, pacote do Lambda, `cfn-lint` dos templates, frontend (tipos, Vitest, service worker, manifest e glossário) e testes de ponta a ponta com Playwright.
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
| Variable | `ALLOWED_EMAILS` | E-mails que podem criar conta, separados por vírgula. Para liberar alguém, edite a variable e rode o Deploy |
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
