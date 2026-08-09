---
title: "Observabilidade na Prática: Sistemas Distribuídos, Custo e Produção"
date: 2026-08-09T12:00:00-03:00
draft: false
tags: ["Observabilidade", "OpenTelemetry", "Quarkus", "Go", "NestJS", "Angular", ".NET", "gRPC", "Kafka", "Grafana", "SLO"]
author: "Matheus Oliveira"
slug: "observabilidade-distribuida-producao"
summary: "Parte 2 de 2. Um clique no navegador atravessando cinco sistemas e quatro linguagens em um trace, e o que muda quando isso vai para produção: tail sampling, cardinalidade, exemplars e SLOs."
description: "Propagação de contexto entre Java, Go, .NET, Node e o navegador, por HTTP, gRPC e Kafka. Tail sampling no collector, explosão de cardinalidade, exemplars ligando métrica a trace, testes que asseram em spans e SLOs com error budget."
cover:
  image: "cover.png"
  alt: "One trace threading through five lanes, from browser to Angular, Java, .NET, Go and Node, over HTTP, gRPC and Kafka"
  caption: "Four languages. Three transports. One id."
  relative: true
---

> **Parte 2 de 2.** A
> [parte 1](/posts/observabilidade-quarkus-opentelemetry/) cobriu por que instrumentar
> e como fazer isso em um serviço Quarkus. Aqui o sistema vira cinco serviços em quatro
> linguagens, e depois vamos para o que muda em produção.
>
> Todos os números vieram de medições no repo
> [observability-arena](https://github.com/omatheusmesmo/observability-arena).

## O mesmo conceito nas outras linguagens

O trace da demo atravessa quatro runtimes. O que muda em cada um não é o conceito, é
quanto do mecanismo fica visível.

### Go: onde não existe mágica

Go é a única stack sem monkey patching, sem agent, sem build-time weaving. Você passa
`context.Context` na mão, de função em função, ou o trace quebra.

```go
func authorize(ctx context.Context, req PaymentRequest, ...) (PaymentResult, error) {
    ctx, span := tracer.Start(ctx, "authorize payment")
    defer span.End()

    span.SetAttributes(attribute.Int64("payment.order_id", req.OrderID))

    auth, err := callProvider(ctx, req, chaos, m)  // ← o ctx viajando
    ...
}
```

Isso inverte o valor didático. No Quarkus você vê o resultado e confia. Em Go você vê
o mecanismo: **o `ctx` atravessando a pilha É a propagação de contexto**, escrita por
extenso.

E o modo de falha ensina junto: solte o `ctx` em qualquer ponto e os spans filhos se
desprendem do trace. Nada dá erro, nada emite warning, eles só param de aparecer sob
o pai.

Duas armadilhas que valem a pena:

- No servidor, tudo depende de `otelhttp.NewHandler`. É ele que lê o `traceparent` que
  chega e abre o span do servidor.
- O propagador precisa ser registrado explicitamente. Sem `otel.SetTextMapPropagator`,
  o `traceparent` vindo do Java é ignorado e o serviço abre um trace novo. Uma
  requisição vira dois traces desconexos, e é assim que tracing distribuído falha em
  silêncio.

### NestJS: a ordem do import decide tudo

```ts
// PRIMEIRA linha de main.ts. Não é estilo, é requisito.
import './instrumentation';
```

O OpenTelemetry instrumenta Node fazendo monkey patching dos exports. Se o Fastify ou
o kafkajs forem carregados antes do SDK iniciar, o SDK aplica patch em uma cópia que
ninguém usa. A aplicação parece instrumentada, não emite erro nenhum, e produz traces
vazios.

Com CommonJS (Nest 11) esse import basta, porque `require()` é síncrono e ordenado.
Com **ESM**, que vira padrão no Nest 12, essa garantia desaparece: imports são içados
e avaliados antes do corpo do módulo. Lá você precisa carregar de fora do grafo:

```bash
node --import ./dist/instrumentation.js dist/main.js
```

### .NET: a plataforma já tinha a abstração

O serviço de estoque é .NET 10 com gRPC, e ele repete um padrão que vale notar:
**algumas plataformas já têm uma camada de instrumentação, e o OpenTelemetry se
conecta a ela em vez de substituí-la.**

No Quarkus essa camada é o Micrometer. No .NET são o `ActivitySource` e o `Meter`, do
`System.Diagnostics`, que fazem parte da biblioteca padrão:

```csharp
public static readonly ActivitySource ActivitySource = new(ServiceName);

// Um Activity no .NET é o que a especificação do OpenTelemetry chama de Span.
using var activity = Telemetry.ActivitySource.StartActivity("reserve stock");
activity?.SetTag("order.id", request.OrderId);
```

Uma biblioteca pode emitir spans sem depender do OpenTelemetry, e uma aplicação que
nunca configura OpenTelemetry não paga nada por eles. O SDK apenas se inscreve.

A armadilha equivalente aqui: **sem alguém inscrito na `ActivitySource`, o
`StartActivity` devolve `null` e todo span some em silêncio.** É a razão número um de
"meus spans customizados não aparecem" em .NET, e é por isso que o teste desse serviço
registra um `ActivityListener` explicitamente.

E nos logs, `ILogger` com placeholders estruturados, nunca interpolação:

```csharp
logger.LogInformation("Reserved {Quantity} of {Sku} for order {OrderId}",
    request.Quantity, request.Sku, request.OrderId);
```

O provider do OpenTelemetry envia os placeholders como atributos. Interpolar a string
produziria uma linha legível e não filtrável.

### gRPC: quando propagar demais quebra a propagação

Esse serviço entrou no repo por causa da fronteira, não da linguagem. gRPC leva o
contexto na **metadata da chamada**, não em header HTTP. Mesma string de 55
caracteres, envelope diferente.

E é a fronteira com o sintoma mais confuso do repositório: dois serviços perfeitamente
instrumentados, telemetria limpa nos dois, e **dois traces desconexos**.

Um middleware de quatro linhas perguntando o que realmente chega resolve em um restart:

```
traceparent=00-ba7ee5ef...-ce2e845b...-01,00-ba7ee5ef...-cf9e9638...-01,00-ba7ee5ef...-3b047e1f...-01
activityParent=(null)
```

**Três valores de traceparent, separados por vírgula.** A especificação do W3C permite
exatamente um. O .NET viu um header malformado, descartou e começou um trace novo,
que é precisamente o que a spec manda fazer.

Basta duas fontes injetando na mesma chamada para quebrar, e é fácil chegar a três: a
instrumentação do `quarkus-opentelemetry`, o cliente gRPC baseado em Vert.x (que a
documentação recomenda em geral, e que aqui injeta uma segunda vez), e qualquer
interceptor manual escrito para "resolver" o problema.

Daí a configuração no repositório, que é uma linha **não** escrita:

```properties
# quarkus.grpc.clients.inventory.use-quarkus-grpc-client=true  <- não faça isso aqui
```

A regra que fica: **quando a propagação quebra, o instinto é adicionar mais propagação,
e isso piora.** Um `traceparent` duplicado é pior que um ausente, porque cada componente
isolado parece correto. Antes de mexer no código, veja o que realmente chega.

### Angular: fechando o trace no navegador

O momento mais forte da demo é um trace único que **começa no clique do usuário e
termina na query do Postgres**.

![Trace do storefront até o banco: 44 spans, do clique ao SELECT](12-trace-navegador-banco.png)

Leia de cima para baixo: `storefront GET` em azul é o navegador. Abaixo,
`orders-api GET /orders`. E abaixo dele, a escada de `SELECT orders.order_items` da
parte 1.

Um LCP ruim deixa de ser "o front está lento" e vira "o `GET /orders` gastou o tempo
num N+1 na tabela de pedidos". Mesmos dados, conversa completamente diferente entre os
times.

#### Use o SDK do OpenTelemetry, não um SDK de fornecedor

O storefront usa `@opentelemetry/sdk-trace-web`, e não um SDK de fornecedor. O Grafana
Faro é o candidato natural e é um bom produto, com Core Web Vitals e captura de erros
prontos. Dois motivos pesaram contra, e no fundo são o mesmo:

**O Faro não fala OTLP.** Ele posta um payload próprio para um receiver próprio.
Apontar para a porta OTLP do collector falha com um `TypeError: Failed to fetch` seco,
e fazer funcionar exige rodar um receiver extra numa porta extra só para traduzir de
volta para OTLP.

**E ele não é CNCF.** É Grafana Labs, sob AGPL. Todo o resto do repositório trafega
por OTLP em componentes neutros, e o navegador era o único lugar que não.

```ts
const provider = new WebTracerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'storefront',
    [ATTR_SERVICE_NAMESPACE]: 'observability-arena',   // o navegador é parte do sistema
  }),
  spanProcessors: [new BatchSpanProcessor(
    new OTLPTraceExporter({ url: environment.otlpTracesUrl }),
  )],
});

provider.register();   // instala o provider E o propagador W3C

registerInstrumentations({
  instrumentations: [new FetchInstrumentation({
    propagateTraceHeaderCorsUrls: [/localhost:8080/],   // quem recebe o traceparent
  })],
});
```

São duas peças, e as duas falham caladas se faltarem. O `register()` instala o
propagador W3C: sem ele os spans são criados e **nenhum traceparent é injetado**. E o
`FetchInstrumentation` é quem de fato injeta o header nas chamadas: sem
`propagateTraceHeaderCorsUrls` listando a origem, a chamada é traceada mas sai **sem
contexto**, e você acaba com um trace no front e outro no back que nunca se encontram.

O `service.namespace` ali não é enfeite. Sem ele o navegador aparece no backend como um
serviço solto, fora do sistema a que pertence.

#### Três armadilhas, todas silenciosas

**1. `traceparent` não é header seguro por padrão no CORS.** Se a API não liberar, o
navegador remove sem avisar. Sem erro no console, sem requisição falhando.

```properties
quarkus.http.cors.headers=traceparent,tracestate,baggage,content-type
```

**2. O collector também precisa de CORS.** O navegador fala
direto com o collector, e sem CORS lá o SDK do navegador falha com o mesmo
`Failed to fetch` genérico. **São dois lugares distintos**, e acertar um só ainda te
deixa sem telemetria de frontend.

**3. A sua própria amostragem te esconde os traces.** Um `GET /orders` rápido e sem erro
cai na política de 10% do gateway. Com poucos cliques, a chance de não sobrar nada é
alta, e a leitura natural é que o navegador não está exportando. Está.

Essa última é a mais traiçoeira das três, porque tudo está funcionando **exatamente
como configurado**.

---

## Troubleshooting de verdade: a demo em ação

> As queries usadas nesta seção estão todas em
> [QUERIES.md](https://github.com/omatheusmesmo/observability-arena/blob/main/QUERIES.md),
> validadas contra essa stack.

### O incidente que abre a parte 1

Vamos degradar o serviço de pagamentos de propósito e reproduzir a cena das 14h32 que abre a
parte 1:

```bash
docker compose --profile distributed up -d
CHAOS_LATENCY_MS=2000 docker compose --profile distributed up -d payments
k6 run load/scenario-03-cascading-failure.js
```

Resultado:

```
p95            2062ms
failure rate   0.00%
```

**Repare no zero.** Nenhum erro. Todo dashboard de disponibilidade está verde. E todo
usuário está esperando dois segundos.

Degradação aparece como latência muito antes de aparecer como erro. Se o seu
alertamento só conhece taxa de erro, essa é a janela em que você está cego.

#### Como esse incidente é investigado sem trace distribuído

É aqui que o esforço fica visível, porque a diferença deixa de ser de conforto e passa a
ser de horas.

Sem trace, você tem cinco fontes independentes e nenhuma costura entre elas. A
investigação vira isto:

1. **Abrir quatro dashboards** e comparar por relógio de parede. Cada time olha o seu, e
   cada um está tecnicamente certo: o `payments` tem 0% de erro, o `inventory` está
   normal, o banco está normal.
2. **Grepar log em quatro serviços** por janela de tempo, porque não existe um id em
   comum. Você filtra "14h32 a 14h34" em cada um e tenta casar linhas por proximidade.
   Com dez requisições por segundo, há centenas de candidatas em cada lado.
3. **Confiar que os relógios batem.** Alguns milissegundos de deriva entre máquinas e a
   ordem dos eventos que você reconstruiu está errada, sem nada avisando.
4. **Acusar o componente errado.** O `orders-api` é quem grita: pool de conexões
   esgotado, requisições enfileirando, requisições que nem tocam em pagamento
   começando a falhar. Todo sinal aponta para ele. Ele é a vítima.

O resultado típico é a sala de guerra: quatro times, três horas, e a resposta saindo de
alguém que **lembrou** de um deploy no provedor de pagamento. Conhecimento tribal, não
dado.

Com o trace, a mesma pergunta leva quinze segundos e não exige ninguém lembrar de nada:
você abre uma requisição lenta e lê onde o tempo ficou.

![Waterfall de um checkout iniciado no navegador, atravessando cinco sistemas](13-ciclo-completo.png)

**Esse print é o artigo inteiro em uma imagem.** Um clique no navegador, cinco
sistemas, quatro linguagens, e um único trace id costurando tudo.

Leia de cima para baixo:

```
storefront    POST                    82,00ms   ← navegador (Angular)
└── orders-api  POST /checkout        78,83ms   ← Java
    ├── InventoryService/Reserve      29,63ms   ← gRPC ────► .NET
    │   └── reserve stock             27,38ms
    │       └── warehouse.reserve     27,21ms
    ├── POST /payments                35,84ms   ← HTTP ────► Go
    │   └── authorize payment         34,56ms
    │       └── provider.authorize    34,51ms
    ├── orders publish                 0,06ms   ← Kafka ───► Node
    │   └── process orders            15,41ms
    │       └── notify customer       15,28ms
    └── INSERT / SELECT                         ← JDBC ────► Postgres
```

Cada cor é um sistema, e **cada mudança de cor é um transporte diferente carregando o
mesmo contexto**. Verde é o `inventory`, alcançado por **gRPC**, onde o contexto viaja
na metadata da chamada. Azul é o `payments`, por **HTTP**. O verde claro lá embaixo é o
`notifications`, e o que vem antes dele é o **Kafka**: `orders publish` com 60
microssegundos, seguido de `process orders` com 15,41ms. O produtor terminou e devolveu;
o consumidor rodou depois, em outro processo e em outra linguagem.

Ninguém combinou nada entre esses cinco serviços. Não há registro central, não há banco
compartilhado, não há acordo entre times. Existe uma string de 55 caracteres que cada um
passa adiante, por três transportes diferentes.

O mesmo fluxo sem o navegador, para comparar, e o mapa do sistema derivado dele:

![Waterfall do checkout entre os quatro serviços de backend](05-trace-distribuido.png)


![Node graph mostrando o grafo de chamadas com o tempo gasto em cada nó](11-node-graph.png)

Ninguém desenhou esse diagrama. Ele foi inferido das relações pai-filho entre spans.

O trace responde de imediato: o tempo está dentro de `provider.authorize`, no serviço
Go, e todo o resto acima está apenas esperando.

E o detalhe que confunde os três times: **o banco nunca foi o problema, mas o
`orders-api` realmente ficou sem conexões.** Ele segura a transação enquanto espera o
pagamento, então uma chamada lenta vira conexão retida, e requisições que não tocam em
pagamento nenhum começam a falhar também.

O componente que quebra mais alto raramente é o que quebrou.

### Do trace para o log, e de volta

![Loki filtrado por trace_id, mostrando cinco linhas de log vindas dos quatro serviços de backend](08-logs-correlacionados.png)

Um filtro por `trace_id` devolve o checkout inteiro, e cada linha veio de um serviço
diferente, por um mecanismo diferente:

| Serviço | Mecanismo |
|---|---|
| `orders-api` | MDC preenchido pela ponte Micrometer/OTel |
| `inventory` | `ILogger` ligado ao pipeline OTel do .NET |
| `payments` | bridge `otelslog`, lendo o contexto do `ctx` |
| `notifications` | `PinoInstrumentation` injetando nas linhas do Pino |

Nenhum deles escreve `trace_id` na mão. Correlação não é um truque de uma stack só, é
configuração.


### "Mas e log estruturado em JSON?"

Essa é a pergunta que quase todo mundo faz aqui, e ela tem uma inversão dentro.

**Via OTLP o log já é estruturado, e melhor que JSON.** O modelo de dados do OpenTelemetry
tem atributos tipados, `severity_number`, `trace_id` e o Resource como campos de primeira
classe do protocolo. Aqueles `order_id` e `code_function_name` que aparecem no painel de
campos do Loki não vieram de ninguém parsear JSON: vieram do protocolo. JSON no console é
um jeito de espremer estrutura dentro de um fluxo de bytes, que é o problema que o OTLP
já não tem.

Então JSON no stdout não serve ao pipeline. Serve ao **outro canal**, e é aí que mora
uma armadilha que não é culpa de ninguém: ela vem do exemplo mínimo da documentação.

A doc do `otelslog` mostra como criar o logger, e o passo natural seguinte é instalá-lo
como padrão:

```go
slog.SetDefault(slog.New(otelslog.NewHandler(serviceName)))
```

Está certo, e faz exatamente o que promete. O detalhe é a palavra **substitui**: a partir
dessa linha, `slog` tem um destino só. Derrube o collector e mande uma requisição: ela
responde **200**, o pagamento é processado, e `docker logs` vem **completamente vazio**.
Nem a linha de startup. Um serviço saudável, servindo tráfego, mudo no único canal que
sobra justamente quando o que quebrou foi a observabilidade.

Não é defeito do Go nem da biblioteca. É o que acontece quando você trata um exemplo
mínimo como configuração final, e vale como regra geral: **todo destino único de
telemetria é um ponto único de cegueira.**

O log por OTLP é o que você consulta. O log no stdout é o que **sobrevive**. Os dois,
sempre, e o do stdout em JSON porque ninguém agrega prosa.

E aqui o Go cobra o preço de não ter mágica, coerente com o resto desta seção: `slog` não
tem handler de fan-out na biblioteca padrão, então são umas 65 linhas para entregar o
mesmo registro aos dois destinos e copiar o trace id para o lado que não conhece spans.
Nos outros três é configuração: `quarkus-logging-json`, `AddJsonConsole()` no .NET, e o
Pino já escreve JSON por default.

---

## Produção: onde a conta chega

Tudo até aqui funciona numa máquina. Esta seção é sobre o que muda quando são quarenta
serviços e a fatura chega no fim do mês.

### O erro estrutural: cada app falando com o backend

O erro mais comum em empresa não é técnico, é de desenho. Cada aplicação exporta
telemetria direto para o backend de observabilidade.

Funciona em tutorial. Com quarenta serviços, significa que mudar a política de
amostragem é um ticket para quarenta times, trocar de fornecedor é um projeto de
migração, e um dado sensível vazado no trace precisa ser corrigido em quarenta
repositórios.

O desenho que o mercado consolidou:

```
aplicações ──► agent ──► gateway ──► backend
               (enriquece)  (amostra, redige)
```

As aplicações nunca falam com o backend. A política vive em um lugar só. Isso não é
preciosismo: é a diferença entre "vamos mudar a amostragem" ser quatro linhas de YAML
ou ser um trimestre.

### O que o collector realmente é

Vale parar aqui, porque o collector costuma ser tratado como encanamento e ele é o
componente onde mora quase toda decisão que importa depois que a instrumentação está
pronta.

Ele é um processo com quatro tipos de peça, e um pipeline é a ligação entre elas:

| Peça | Faz o quê | Exemplos aqui |
|---|---|---|
| **receiver** | por onde o dado entra | `otlp` em gRPC 4317 e HTTP 4318 |
| **processor** | transforma no caminho | `memory_limiter`, `tail_sampling`, `attributes` |
| **exporter** | por onde sai | `otlp` para o próximo salto |
| **connector** | consome um sinal e emite **outro** | `spanmetrics`, `servicegraph` |

O connector é a peça que quase ninguém usa e é a mais interessante: ele liga a saída de
um pipeline na entrada de outro, e é assim que traces viram métricas sem que ninguém
instrumente métrica nenhuma.

```yaml
traces:
  receivers: [otlp]
  processors: [memory_limiter, tail_sampling, attributes/redact, batch]
  exporters: [otlp, spanmetrics, servicegraph]

metrics:
  receivers: [otlp, spanmetrics, servicegraph]   # ← os mesmos nomes, do outro lado
  processors: [memory_limiter, batch]
  exporters: [otlp]
```

É por isso que o mapa de serviços que você viu acima existe sem ninguém ter desenhado nada, e
por que o painel de RED funciona até para serviço que nunca configurou um SDK de
métricas. Se as abas de Service Graph do seu Grafana estão vazias, quase sempre é isso
que falta: a funcionalidade existe, o dado não.

#### A ordem dos processors não é estilo

A documentação do OpenTelemetry é específica quanto a isso, e cada posição tem um
motivo:

1. **`memory_limiter` primeiro, sempre.** Ele recusa dado quando a memória aperta.
   Colocado no fim, os processors anteriores já acumularam o que não vai ser entregue, e
   aí o collector morre de OOM levando junto a telemetria que explicaria o incidente.
2. **Amostragem e filtro antes de enriquecer**, para não gastar CPU em dado que vai ser
   descartado.
3. **Enriquecimento antes do `batch`**, porque o batch **limpa o contexto da requisição**.
   Um processor que depende dele (`k8sattributes`, por exemplo) colocado depois passa a
   não achar nada, silenciosamente.
4. **`batch` por último.**

#### Por que dois níveis, e não um

O agent roda colado na carga de trabalho: um DaemonSet no Kubernetes, um sidecar aqui.
Ele fica deliberadamente burro, e faz só o que exige estar perto: descobrir host e
container, e encaminhar.

O gateway é onde a política mora, e a divisão não é gosto: **um agent nunca vê mais do
que o próprio pedaço do trace**. É isso que empurra o tail sampling para cima, como a
próxima seção mostra com números. Redação de dado sensível segue o mesmo raciocínio: uma
vez, num lugar, em vez de em quatro bases de código.

#### O que evita perder dado

Duas configurações no exporter fazem a diferença entre uma reinicialização do backend
ser um susto ou um buraco no gráfico:

```yaml
exporters:
  otlp:
    retry_on_failure:
      enabled: true
    sending_queue:
      enabled: true
      queue_size: 5000
```

A fila absorve indisponibilidade curta do próximo salto, e o retry cuida do resto. Sem
elas, um backend fora do ar por trinta segundos vira trinta segundos de telemetria que
nunca existiu, e o pior momento para descobrir isso é depois.

Vale a ressalva honesta: a fila padrão é **em memória**. Se o collector reiniciar, o que
estava nela morre. Existe fila persistente em disco, e é o próximo passo quando a perda
passa a ter custo real.

### Amostrar menos é a resposta errada

Com 100% de amostragem, um serviço movimentado gasta mais com telemetria do que
servindo tráfego. A correção ingênua é amostrar menos, e ela descarta erros e
requisições lentas na mesma proporção que as chatas.

Tail sampling resolve, e **só funciona no gateway**, porque a decisão precisa do trace
completo e os spans chegam de agents diferentes:

```yaml
tail_sampling:
  decision_wait: 10s
  policies:
    - name: keep-errors      # nunca descarte uma falha
    - name: keep-slow        # nunca descarte algo lento
    - name: keep-checkout    # caminho de receita, sempre
    - name: sample-the-rest  # 10% do resto
```

Medido na demo, com parte do tráfego degradado de propósito:

```
keep-slow        sampled=true      39    ← 100% dos lentos
keep-checkout    sampled=true     110    ← 100% dos checkouts
sample-the-rest  sampled=true    1646    ← 10% do resto
sample-the-rest  sampled=false  12828
```

Cerca de **12% armazenado, uma redução de 88%**. Mas repare **quais** 10%: todos os
lentos, todos os checkouts, e uma amostra uniforme do tráfego sem graça.

Com head sampling a 10% você teria descartado nove de cada dez traces lentos, e o
incidente do começo do artigo seria indepurável. É essa assimetria que paga a
complexidade do gateway.

#### E o sampler do serviço, então?

Ele continua existindo, e a configuração no Quarkus é trivial:

```properties
quarkus.otel.traces.sampler=traceidratio   # build time
quarkus.otel.traces.sampler.arg=0.5        # runtime: 1.0 tudo, 0.0 nada
```

Repare na assimetria, que é a mesma armadilha de build time da parte 1: **escolher o
sampler é build time, ajustar a taxa é runtime**. Trocar `traceidratio` por outro sampler
via variável de ambiente não faz efeito e não avisa. Mas girar o `sampler.arg` durante um
incidente funciona, e é isso que te deixa abrir a torneira sem redeploy.

O default sensato em produção é `parentbased_always_on`: cada serviço respeita a decisão
de quem chamou, então **um trace nunca fica pela metade**, e o controle de volume fica
inteiro no gateway. Head sampling em cada serviço, com taxas diferentes, é como se
produzem traces que terminam no meio sem ninguém entender por quê.

A exceção é serverless, onde existe `quarkus.otel.simple=true`: exporta direto, sem
batching, porque um processo que morre em segundos não tem tempo de esvaziar um batch.

### O erro que derruba o backend de métricas

```java
Counter.builder("orders.checkout")
    .tag("order.status", order.status)          // 3 valores possíveis
    .tag("order.id", String.valueOf(order.id)); // um por pedido, para sempre
```

Os dois são strings. Os dois se leem igual. Os dois passam em code review. Só um deles
é um label de métrica.

Medido:

```
sem a tag,  10 checkouts  ->  1 série
com a tag, +60 checkouts  -> 61 séries
```

Dez pedidos compartilham uma série. Sessenta pedidos criam sessenta. A relação é linear
e não tem teto, e cada série ocupa memória e disco por toda a janela de retenção.

A regra: **se você não consegue nomear todos os valores possíveis de um label, ele não
é um label.** `status`, `provider`, `region`: nomeáveis, tudo bem. `order.id`,
`user.id`, `url` com query string, texto de mensagem de erro: ilimitados, e pertencem
aos spans.

O perverso é que nada quebra quando você adiciona o label. O build passa, os testes
passam, o dashboard fica até **melhor**, porque agora dá para filtrar por pedido. A
degradação é gradual e aparece semanas depois, num sistema de outro time.

![Painel de cardinalidade: a contagem de séries de orders_checkout_total salta de 1 para 61 numa vertical](14-perses-cardinalidade.png)

É literalmente uma parede subindo. À esquerda, `orders_checkout_total` saindo de uma
série para sessenta e uma no instante em que o label entrou. À direita, o ranking das
métricas mais caras da stack, que é o painel que responde "quem está me custando".

Acompanhar isso depois de cada deploy é barato e quase ninguém faz. Um degrau ali
significa que alguém adicionou um label.

### Exemplars: o link que fecha o ciclo entre os sinais

Até aqui os quatro sinais foram apresentados como coisas separadas que você correlaciona
na mão. Exemplars quebram isso.

Um exemplar é um ponteiro que viaja **dentro** da métrica: junto com o valor do
histograma, vai o trace id de uma requisição que produziu aquele valor. No gráfico, ele
aparece como um pontinho na linha. Você clica e cai no trace.

No collector, é uma linha:

```yaml
connectors:
  spanmetrics:
    exemplars:
      enabled: true
```

Medido na demo:

```
trace_id: e6110809ee54503136f18948524daa75   valor: 1.820741
```

Aquele número é a duração em milissegundos de uma requisição real, e aquele id leva ao
trace dela.

Pense no que isso muda no fluxo de investigação. Sem exemplars, você vê um pico no p99,
anota o horário, vai para o Tempo, filtra por serviço e janela de tempo, e procura algo
que pareça lento. Com exemplars, você **clica no pico**.

É a diferença entre "existem requisições lentas nesse intervalo" e "esta requisição
aqui, com este id". E é surpreendentemente pouco usado, considerando que é uma linha de
configuração.

Vale a ressalva: exemplars só existem se a métrica for derivada de spans, ou se o SDK
anexar o contexto ativo ao registrar o valor. Uma métrica de negócio incrementada fora
de um span não tem a quem apontar.

### Dashboards como código

O painel acima não foi montado clicando. Ele é um arquivo YAML no repositório, servido
pelo **Perses**, o projeto sandbox da CNCF para visualização.

Vale explicar por que existem **dois** na stack, porque isso confunde com razão.

O Grafana é o que aparece em todo screenshot de investigação deste artigo, e ele está
aqui por um motivo que nada substitui hoje: **é a ferramenta de exploração**. Clicar de
uma métrica para um exemplar, do exemplar para o trace, do span para o log, tudo sem
escrever query. Esse fluxo é o produto.

O Perses faz outra coisa: **dashboard versionado**. Os painéis que você quer idênticos
em todo ambiente, revisados em pull request, restaurados por `git checkout`.

Isso também fecha a última lacuna de neutralidade: coleta e transporte são CNCF
(OpenTelemetry), armazenamento é CNCF (Prometheus), e a visualização era o buraco,
porque o Grafana é da Grafana Labs sob AGPL. O Perses é sandbox da CNCF.

Não é "trocar Grafana por Perses". É explorar no Grafana e versionar no Perses, e na
prática os dois leem exatamente as mesmas fontes de dados.

![Dashboard Golden Signals servido pelo Perses a partir de YAML versionado: throughput, p95 dos quatro serviços, autorizações de pagamento e heap da JVM](10-perses-dashboard.png)

Os quatro painéis vêm de um arquivo no repositório.

Na prática o ganho é outro e mais imediato: o provisionamento sobrescreve o banco a
cada ciclo, então **clicar na interface não consegue criar divergência**. O repositório
é a fonte da verdade por construção, e quem clona recebe dashboards funcionando em vez
de uma tela vazia.

### O ponto cego: o próprio pipeline

Uma última: **o próprio collector precisa ser observado**. Ele é o componente mais
propenso a descartar dados em silêncio sob carga, e um collector cego no meio do
pipeline anula tudo que veio antes.

```promql
rate(otelcol_exporter_send_failed_spans[5m])
```

E do outro lado do painel, as métricas que descrevem o negócio e não a infraestrutura:

![Latência p95 e taxa de autorizações de pagamento por provedor](09-metricas-negocio.png)

"p99 do handler HTTP" é um proxy. "Taxa de falha de autorização por provedor" é o que
alguém é acordado às três da manhã para resolver. Auto-instrumentação nunca vai inventar
a segunda.

Spans que o collector falhou em exportar são spans que deixaram de existir. Perda
silenciosa de telemetria se parece exatamente com um sistema saudável.

---

## Testar a observabilidade

Uma pergunta que quase ninguém faz: **como você sabe que sua instrumentação continua
funcionando?**

A resposta honesta na maioria dos projetos é "quando alguém precisa dela e descobre que
não está lá". Instrumentação quebra silenciosamente, e este artigo inteiro é uma lista
de exemplos disso.

A demo tem 29 testes, e vários deles não verificam a resposta HTTP. Verificam a árvore
de spans:

```go
// O filho precisa carregar o trace id do pai. Solte o ctx em qualquer ponto da cadeia
// e essa asserção quebra, que é exatamente o modo de falha que ninguém percebe.
if child.SpanContext().TraceID() != parent.SpanContext().TraceID() {
    t.Error("child span detached from the parent trace")
}
```

No .NET, o teste registra um `ActivityListener` explicitamente, o que documenta no
código a dependência descrita lá em cima: sem inscrito, não há span.

No Angular, o teste assere que o header segue o formato W3C:

```ts
expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
```

E no Java, um teste existe **especificamente para impedir uma melhoria**:

```java
@Test
void leavesTimersAloneBecauseTheUnitWouldSilentlyDisagree() {
    // renomear isso para http.server.request.duration alegaria segundos
    // enquanto grava milissegundos
}
```

Se alguém no futuro "completar" o mapeamento de convenções, o teste falha e explica por
que aquilo é uma regressão, não um progresso.

O princípio: **se a árvore de spans é o produto do serviço, é nela que o teste deve
falar**. Uma resposta correta com spans desconectados é um serviço que vai ser
indepurável em produção, e nenhum teste de API pega isso.

O caso mais claro veio do serviço .NET. O bug daquela fronteira era de transporte, e os
testes usam um serviço gRPC real em processo em vez de um stub mockado justamente por
isso: um mock teria passado por cima do problema sem piscar.

---

## O que alertar: SLO em vez de sintoma

Se alerta de CPU é ruim, o que se coloca no lugar? O substituto tem nome, e na verdade
tem quatro.

A sopa de siglas atrapalha mais do que ajuda, então vale fixar as quatro de uma vez.
Elas formam uma escada, e cada degrau tem um dono diferente:

| Sigla | O que é | Quem se importa |
|---|---|---|
| **SLI** | a **medida**: "% de requisições abaixo de 300ms" | quem instrumenta |
| **SLO** | a **meta interna** para o SLI: "99,9% em 30 dias" | o time de engenharia |
| **SLA** | o **contrato** com o cliente, com multa se furar | jurídico e comercial |
| **Error budget** | o que sobra do SLO: 0,1%, ou 43 minutos por mês | quem decide o que priorizar |

A confusão comum é achar que SLO e SLA são a mesma coisa com nomes diferentes. Não são,
e a diferença é deliberada: **o SLO é sempre mais rigoroso que o SLA.** Se o contrato
promete 99,5%, a meta interna é 99,9%, para que a equipe seja acordada antes de o cliente
ter direito a desconto. A folga entre os dois é o espaço para consertar sem
consequência comercial.

O SLI é o único dos quatro que é técnico. Os outros três são decisões de negócio
tomadas em cima dele, e é por isso que um SLI mal escolhido contamina tudo o que vem
depois: se você mede a média em vez do percentil, seu SLO estará verde enquanto a cauda
sofre.

E o **error budget** é a peça que muda o comportamento do time. Ele transforma
"tivemos erros?", que é uma pergunta de culpa, em "quanto do orçamento já gastamos?",
que é uma pergunta de planejamento. Orçamento sobrando é permissão para arriscar um
deploy; orçamento no fim é sinal de parar e estabilizar.

Em números: SLO de 99,9% em 30 dias dá 0,1% de orçamento. Com um milhão de requisições,
você pode falhar mil vezes antes de estourar.

Com as métricas que este repo já produz:

```promql
sum(rate(http_server_requests_milliseconds_count{http_response_status_code!~"5.."}[30d]))
/
sum(rate(http_server_requests_milliseconds_count[30d]))
```

E o que realmente vale alertar não é o SLO em si, é a **velocidade de queima**. Se você
alerta quando o orçamento acaba, avisou tarde. Se alerta a cada erro isolado, o time
para de ler.

Burn rate é quantas vezes mais rápido que o aceitável você está gastando:

```promql
(
  sum(rate(http_server_requests_milliseconds_count{http_response_status_code=~"5.."}[1h]))
  /
  sum(rate(http_server_requests_milliseconds_count[1h]))
) / 0.001
```

Um resultado de 14,4 significa que, nesse ritmo, o orçamento de 30 dias acaba em dois
dias. A prática consolidada é usar duas janelas: uma longa para confiança, uma curta
para reagir rápido, e alertar só quando as duas concordam. Isso corta o falso positivo
de um pico de trinta segundos.

Repare no que isso resolve: **o alerta passa a falar de usuário, não de máquina**. CPU
a 95% com todos os SLOs verdes não acorda ninguém. E deve ser assim, porque CPU alta
não é um problema, é uma observação.

O repositório traz as métricas e as queries, e não traz as regras de alerta: montar
janela dupla é assunto de Grafana Alerting ou Prometheus Alertmanager, e daria outro
artigo.

---

## Quatro runtimes, dois modelos de profiling

A parte 1 tratou o quarto sinal dentro da JVM. Entre runtimes ele é o que mais varia.
Terminada a demo, os quatro serviços de backend ficaram assim, e a divisão não foi por
gosto:

| Serviço | Como | Modelo |
|---|---|---|
| `orders-api` (Java) | JFR, nativo da JVM | grava local, coleta sob demanda |
| `payments` (Go) | Pyroscope, biblioteca | streaming contínuo |
| `notifications` (Node) | Pyroscope, biblioteca | streaming contínuo |
| `inventory` (.NET) | **nenhum** | ver abaixo |

**Quando a plataforma já tem o mecanismo, use o mecanismo.** A JVM tem JFR, e a
extensão `quarkus-jfr` acrescenta o evento que permite sair de um trace id e chegar na
thread e na janela de tempo correspondentes dentro da gravação. Go e Node não têm
equivalente, então lá é biblioteca mesmo, e o modelo mudaria: em vez de gravar local e
dumpar sob demanda, elas amostram e empurram continuamente.

Repare no que essa diferença significa para o custo. O JFR não manda nada para lugar
nenhum: é um buffer circular limitado, em disco local, que você lê quando precisa. Ele
não cria série temporal, não pesa no backend de métricas e não tem cardinalidade. O
modelo de streaming tem um serviço a mais para operar e uma conta de armazenamento
proporcional ao tempo ligado.

O .NET ficou sem, e é uma lacuna honesta. Ele **tem** EventPipe, o equivalente nativo do
JFR, e existe um profiler Pyroscope para .NET. Nenhum dos dois cabe aqui: o profiler
exige bibliotecas nativas e uma imagem base com glibc completo, enquanto essa é
*chiseled* de propósito. Fica documentado como lacuna em vez de configurado pela metade,
porque configuração que não faz nada é pior que configuração ausente: a próxima pessoa
vai achar que está coberto.

E a diferença entre os dois modelos fica visível sem ler configuração nenhuma. Basta
perguntar ao Pyroscope quem está reportando:

```json
{"names":["notifications", "payments", "pyroscope"]}
```

Dois dos quatro. `orders-api` grava local e `inventory` não grava, e a lista denuncia
isso mais rápido que qualquer documentação.

O lado prático do streaming é este, e é onde ele ganha do JFR: o perfil vira consulta no
Grafana, ao lado dos outros sinais, sem terminal e sem copiar arquivo de container.

![Flame graph e top table do serviço payments, consultados no Grafana pela fonte Pyroscope](15-pyroscope-flamegraph.png)

Você escolhe um tipo de perfil e um seletor de labels, igual a qualquer datasource:

```
process_cpu:cpu:nanoseconds:cpu:nanoseconds   {service_name="payments"}
```

E aí aparece o recurso que o modelo local não tem: o tipo de consulta **Diff**, que pega
duas janelas de tempo e pinta o flame graph pela diferença, vermelho para o que cresceu.
Depois de um deploy, a pergunta raramente é "onde está a CPU", é "o que mudou". É o
equivalente do exemplar para perfis, e é a razão de guardar profile por mais que alguns
minutos.


---

## Seguindo a documentação oficial: o checklist

A documentação do OpenTelemetry tem recomendações explícitas de instrumentação. Este é o
estado do repositório contra elas, e serve como lista de verificação para o seu:

| Recomendação | Estado | Como |
|---|---|---|
| Nomes de span com baixa cardinalidade | ok | `authorize payment`, nunca `authorize order 1019` |
| `service.name` em todo serviço | ok | os cinco |
| `service.version` e ambiente | ok | permite perguntar "começou no último deploy?" |
| `service.namespace` | ok | agrupa os cinco como um sistema |
| `recordException` + `setStatus(ERROR)` | ok | nos quatro backends |
| Log num canal que não dependa do collector | ok | OTLP mais JSON no stdout |
| Não criar spans demais | ok | eventos em vez de spans para operações internas |
| `schema_url` declarado | **parcial** | só no Go |
| `isRecording()` antes de atributo caro | **ausente** | deliberado, ver abaixo |

Duas merecem explicação, porque a decisão importa mais que o item.

**`recordException` mais `setStatus` andam juntos**, e a doc é explícita. Um span que
falha reportando `Ok` faz todo dashboard de taxa de erro mentir e, pior, faz a política
de tail sampling que guarda erros não guardar nada. É o item mais fácil de esquecer,
porque o `try/catch` já está lá e parece completo.

**`isRecording()`** evita calcular atributos caros em spans que serão descartados. Está
ausente de propósito: nenhum atributo aqui é caro, são ids e strings que já existem.
Numa aplicação que serializa um objeto grande para virar atributo, seria obrigatório.

O `schema_url` parcial é dívida assumida. Ele documenta contra qual versão da convenção
você escreveu, e sem ele um consumidor não sabe se o `http.request.method` daquele span
significa o que ele acha que significa.

---

## Por onde começar na segunda-feira

Se você chegou até aqui convencido, o próximo obstáculo é achar que precisa de tudo
isso de uma vez. Não precisa. A ordem abaixo é por retorno sobre esforço, e cada passo
funciona sozinho.

**Passo 1, uma tarde: um serviço, traces apenas.** Escolha o serviço onde ficam os
incidentes. Adicione a extensão, aponte para um Grafana LGTM local, e ligue a
instrumentação do banco. No Quarkus são três linhas e um `quarkus dev`. Você já vai
enxergar coisas que não sabia.

**Passo 2, algumas horas: correlacione os logs.** Não escreva `trace_id` na mão em
lugar nenhum: em toda stack isso é configuração. Quando um log clicável levar ao trace
e vice-versa, o valor fica óbvio para o time inteiro, e é aqui que a adoção costuma
virar.

**Passo 3, a segunda aplicação.** É onde a mágica aparece, porque a propagação de
contexto atravessa sem ninguém combinar nada. Escolha o serviço que o primeiro mais
chama. Se algo der errado, releia a seção das armadilhas silenciosas: quase sempre é
CORS ou propagador não registrado.

**Passo 4, atributos de negócio.** Auto-instrumentação te dá rota e status. Só você
sabe que existe `order.id`, `tenant`, `payment.provider`. É uma linha por span, e é o
que transforma trace em resposta em vez de gráfico bonito.

**Passo 5, e só agora: o collector.** Quando forem três ou quatro serviços, coloque
agent e gateway no meio. Aí você ganha amostragem, redação de dados sensíveis e
liberdade de trocar de backend. Antes disso é complexidade sem retorno.

Repare no que **não** está na lista: não tem "escolha um fornecedor". Essa decisão
deixou de ser a primeira e virou a última, e reversível. É esse o presente que a
padronização te dá.

---

## O repositório

Tudo neste artigo está em
[observability-arena](https://github.com/omatheusmesmo/observability-arena): cinco
serviços (Quarkus 3.33 LTS com Java 25, Go 1.26, .NET 10 com gRPC, NestJS 11 e Angular
22), nove cenários de falha plantada, scripts k6, dashboards versionados e a topologia
completa de collectors. Todos os números deste texto foram medidos lá.

O caminho mais curto continua sendo:

```bash
cd services/orders-api && quarkus dev
```

---

## O que fica

Observabilidade não é sobre ter dados. Todo mundo já tem dados, aos terabytes. É sobre
conseguir responder perguntas que você não sabia que faria.

O incidente das 14h32 que abre a parte 1 não se resolve com mais dashboards. Ele se
resolve quando alguém abre um trace e vê, em quinze segundos, que os dois segundos
estão dentro de `provider.authorize`, e que o `orders-api` só estava esperando.

Se você levar uma frase daqui, que seja esta: **quase toda falha de observabilidade é
silenciosa**. O `traceparent` bloqueado pelo CORS, o propagador não registrado, o
import fora de ordem, a propriedade build time num profile errado, o label de alta
cardinalidade. Nenhuma delas gera erro. Todas geram um sistema que parece instrumentado
e não responde quando você precisa.

A boa notícia é que a lista de armadilhas é curta e agora está escrita. E o custo de
entrada nunca foi tão baixo: um comando sobe a stack inteira, e a instrumentação que
você escrever hoje continua valendo se trocar tudo o que está por baixo dela.
