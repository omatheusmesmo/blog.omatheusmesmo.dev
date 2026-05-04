---
title: "Quarkus Native no Knative: Cold Start 5x Mais Rápido, 20x Menos Memória"
date: 2026-05-03T10:00:00-03:00
draft: false
tags: ["Java", "Quarkus", "Kubernetes", "Knative", "Serverless", "GraalVM", "Native Image", "k6"]
author: "Matheus Oliveira"
slug: "quarkus-native-knative-cold-start"
summary: "Quanto custa um cold start de 3 segundos em produção? Violações de SLO a cada scale-from-zero e 19x mais gasto em memória. Fiz benchmark de uma app Quarkus real em containers e os números fecham o argumento."
description: "Benchmark em containers de Quarkus JVM vs Native para Knative, focado em impacto em produção: cold start, custo de memória, SLA e trade-offs de throughput medidos com k6 e CPU pinning."
cover:
  image: "quarkus-native-knative-cold-start.png"
  alt: "Benchmark de cold start Quarkus Native no Knative"
  caption: "Mesma app, dois runtimes. Os números falam."
  relative: true
---

Escalar para zero para reduzir custos. Uma requisição chega. Seus usuários esperam 3 segundos pela JVM inicializar. Cada cold start após um período de inatividade é uma violação de P99. Para qualquer serviço com SLO abaixo de 3 segundos, isso não é um caso extremo. É uma garantia.

A compilação nativa do Quarkus resolve isso. Construí o [quarkus-cloud-native](https://github.com/omatheusmesmo/quarkus-cloud-native), uma API de recebimento de webhooks com PostgreSQL, e fiz benchmark em containers usando o mesmo caminho de startup que o Knative segue em produção. Os números abaixo são reais, reproduzíveis, e importam além do benchmark em si.

## Por Que Isso Importa em Produção

Antes dos números, o contexto. O Knative Serving escala pods para zero quando ociosos. Quando chega uma requisição, acontece um cold start:

1. O Activator do Knative recebe a requisição
2. O Pod é agendado em um nó
3. A imagem do container é baixada
4. O container inicia e a app é inicializada
5. A primeira requisição é atendida

Com app JVM, só o passo 4 leva 2-3 segundos. Cada cold start é um usuário esperando. Nos picos de tráfego após períodos de inatividade (exatamente quando scale-to-zero mais ajuda), cada pod novo é um cold start.

**Impacto no SLA.** Um cold start de container de 3.541ms significa que cada evento scale-from-zero no JVM viola um SLO de 3s imediatamente. Os 642ms do Native cabem na maioria dos orçamentos de SLO "rápidos". A diferença aparece nos dashboards de P99, não em load tests rodados contra instâncias quentes.

**Impacto no custo.** Com 241 MB RSS por pod JVM, um nó de 16 GB comporta cerca de 66 pods. Com 12 MB RSS por pod Native, o mesmo nó comporta mais de 1.300 pods. Rodando 500 réplicas, JVM precisa de ~8 nós enquanto Native precisa de menos de 1. Isso não é uma otimização marginal. É um orçamento de infraestrutura diferente.

## A App

Uma API de recebimento de webhooks, o tipo de workload que encaixa bem em serverless:

- **Quarkus 3.35.1** + JDK 25 + Mandrel 25.0.2
- Hibernate ORM com Panache + PostgreSQL 18
- REST + Jackson + Bean Validation
- SmallRye Health, OpenAPI, Micrometer
- I/O bloqueante em 4 vCPUs fixados

```java
@Entity
public class Webhook extends PanacheEntity {

    @Column(nullable = false)
    public String source;

    @Column(nullable = false)
    public String eventType;

    @Column(columnDefinition = "TEXT")
    public String payload;

    public Instant receivedAt;
    public String processingMode;
}
```

DTOs de entrada e saída com Bean Validation e factory methods:

```java
public record WebhookRequest(
    @NotBlank @Size(max = 255) String source,
    @NotBlank @Size(max = 100) String eventType,
    String payload
) {}

public record WebhookResponse(
    Long id, String source, String eventType,
    String payload, Instant receivedAt, String processingMode
) {
    public static WebhookResponse from(Webhook w) {
        return new WebhookResponse(w.id, w.source,
            w.eventType, w.payload, w.receivedAt, w.processingMode);
    }
}
```

Quatro endpoints (listar, buscar por ID, criar, deletar) acessando PostgreSQL a cada requisição.

## O Benchmark

Um comando: `make compare`. Roda um benchmark baseado em containers seguindo o mesmo caminho que o Knative usa em produção:

1. Builda imagens Docker para JVM e Native
2. Limpa page cache do SO (`sudo`) para garantir cold start real
3. `docker run --cpuset-cpus` inicia cada container com CPU pinning
4. Aguarda health check (`/q/health`) para medir **startup do container**
5. Extrai "started in Xs" dos logs para medir **init da app**
6. Repete 5 vezes (1a = cold, 2-5 = warm)
7. Mede memória RSS via `docker stats`
8. Roda k6 com 500 VUs por 60 segundos
9. Salva JSON com timestamp e info da máquina em `metrics/`

### Duas Métricas de Startup

- **Start do container:** `docker run` até health check 200 OK. Realista para produção: inclui criação do container, init da app e health probe. O que os usuários do Knative realmente sentem.
- **Log do Quarkus:** "started in Xs" dos logs do container. Só a app, elimina overhead do container. Útil para comparar runtimes diretamente.

### CPU Pinning

- **Container da app:** cpuset 2-5 (4 vCPUs), igual ao default do Quarkus Benchmark Lab
- **PostgreSQL:** cpuset 0-1 (2 threads)
- **Gerador de carga k6:** cpuset 6-11 (6 threads)

Isso segue a metodologia do [Quarkus Benchmark Lab](https://quarkus.io/blog/quarkus-benchmark-lab/): conjuntos de CPU separados eliminam interferências entre componentes.

### Teste de Carga k6

```javascript
export const options = {
  scenarios: {
    readHeavy: {
      executor: 'constant-vus',
      vus: __ENV.K6_VUS || 500,
      duration: __ENV.K6_DURATION || '60s',
    }
  },
};
```

Mix de workload: 60% leituras (`GET /api/webhooks`), 25% escritas (`POST /api/webhooks`), 15% info do sistema. Realista para um receptor de webhooks.

## Os Números

Medições reais. AMD Ryzen 5 5600GT, 12 cores, 30 GB RAM. CPU-pinned. Page cache limpo entre runs de cold start.

| Métrica | JVM | Native | vs JVM |
|---|---|---|---|
| **Cold start: container** | 3.541 ms | 642 ms | **5.5x mais rápido** |
| **Cold start: log Quarkus** | 2.718 ms | 174 ms | **15.6x mais rápido** |
| **Média quente: container** | 2.400 ms | 301 ms | **8.0x mais rápido** |
| **Média quente: log Quarkus** | 1.990 ms | 48 ms | **41.5x mais rápido** |
| **Memória RSS** | 241 MB | 12 MB | **20.1x menor** |
| **Heap usado** | 26 MB | 9 MB | 2.9x menor |
| **Imagem do container** | 185,2 MB | 37,9 MB | **4.9x menor** |
| **Requisições/s** | 408 | 260 | 1.6x JVM |
| **Latência P50** | 1.039 ms | 1.581 ms | 1.5x JVM |
| **Latência P90** | 2.310 ms | 4.077 ms | 1.8x JVM |
| **Latência P99** | 4.265 ms | 7.118 ms | 1.7x JVM |

### Lendo os Números de Cold Start

As duas métricas contam histórias diferentes. Start do container (3.541ms JVM vs 642ms Native) é o que os usuários sentem: desde o Activator do Knative receber a requisição até o primeiro health probe bem-sucedido. Log do Quarkus (2.718ms vs 174ms) é o tempo puro de init da app, eliminando o overhead do container. Ambas importam para decisões diferentes.

Algo que os números warm não mostram: cada run "warm" ainda é um `docker run` novo com um processo JVM novo. "Warm" significa apenas que o page cache do SO guarda os JARs do JDK em memória. Num pod Knative novo sem page cache, o cold start do JVM seria ainda maior. O Native não tem esse problema. O binário é autocontido e sempre do mesmo tamanho. Cold start e warm start são essencialmente iguais.

### Lendo os Números de Throughput

Com 500 VUs, ambos os modos estão sob pressão. JVM processa 408 req/s, Native 260 req/s (vantagem 1.6x para JVM). O banco é o gargalo: toda requisição acessa PostgreSQL, então a diferença vem principalmente de otimização JIT e comportamento de GC, não de compute puro. O Native usa Serial GC com heap menor, o que fica evidente nesse nível de carga.

Em produção, 500 conexões concorrentes a um único pod é extremo. Escalabilidade horizontal cuida disso antes de um pod atingir a saturação. A pergunta relevante para workloads scale-to-zero não é "qual modo aguenta 500 VUs melhor", mas "qual modo se recupera do idle mais rápido".

## Tamanho do Container

Native: **37,9 MB** (micro image) vs JVM: **185,2 MB** (UBI9 + OpenJDK 25 runtime).

No Knative, o tamanho da imagem afeta diretamente o cold start. O nó precisa baixar a imagem antes de iniciar o pod. Uma imagem 4.9x menor significa pulls mais rápidos em nós frios. Em clusters com eventos frequentes de scale-from-zero em nós frios, essa diferença se multiplica.

A imagem nativa usa `quay.io/quarkus/ubi9-quarkus-micro-image`, uma base mínima sem distribuição JDK. O binário é a app.

## Isso É Realista Para Produção?

Nosso benchmark segue a metodologia do [Quarkus Benchmark Lab](https://quarkus.io/blog/quarkus-benchmark-lab/):

- Medições baseadas em container (`docker run` até health check)
- CPU pinning com `--cpuset-cpus` (4 vCPUs para app, igual ao `ActiveProcessorCount=4`)
- Conjuntos de CPU separados para app, BD e gerador de carga
- Limpeza de page cache do SO para cold start real

O que não é simulado:

- Tempo de pull da imagem (Native faz pull 4.9x mais rápido, o ratio se mantém)
- Sidecar queue proxy do Knative (adiciona latência igual nos dois modos)
- Overhead do scheduler K8s e containerd (igual para ambos)
- Service mesh e network overlay (igual para ambos)

Esses overheads de infraestrutura somam igual nos dois modos. Os ratios relativos (5.5x cold start de container, 15.6x init da app, 20.1x memória, 4.9x imagem) são confiáveis. Números absolutos num cluster real seriam maiores, mas as proporções se mantêm.

## Deploy no Knative

O Quarkus gera o manifest Knative automaticamente:

```properties
quarkus.kubernetes.deployment-target=knative
quarkus.container-image.group=omatheusmesmo
```

```shell
make native-image   # Build da imagem container nativa
make deploy-knative # Aplica knative.yml no cluster
```

O `knative.yml` em `target/kubernetes/` está pronto para aplicar. O Quarkus gera os recursos Service, Configuration e Route.

## Métricas Versionadas

Cada `make compare` salva um JSON com timestamp em `metrics/`:

```json
{
  "date": "2026-05-03T23:34:43",
  "methodology": "container-based",
  "machine": {
    "cpu": "AMD Ryzen 5 5600GT with Radeon Graphics",
    "cores": "12",
    "memoryGb": "30",
    "os": "Arch Linux",
    "docker": "29.4.1"
  },
  "benchmarkConfig": {
    "vus": 500,
    "duration": "60s",
    "appCpus": "2-5",
    "dbCpus": "0-1",
    "k6Cpus": "6-11"
  },
  "jvm": {
    "startup": { "coldStartMs": 3222, "appColdStartMs": 2558 },
    "memory": { "rssMb": 231 },
    "k6": { "rps": 441, "p50Ms": 957.4, "p99Ms": 3818.7 }
  },
  "native": {
    "startup": { "coldStartMs": 640, "appColdStartMs": 212 },
    "memory": { "rssMb": 12 },
    "k6": { "rps": 235, "p50Ms": 1707.9, "p99Ms": 7355.5 }
  }
}
```

Essas métricas são versionadas no git. Execute `make compare` após upgrades do Quarkus ou Mandrel para acompanhar a evolução.

## Reproduza Você Mesmo

```shell
git clone https://github.com/omatheusmesmo/quarkus-cloud-native
cd quarkus-cloud-native
sdk env install
make db-up
make jvm-image
make native-image
make compare
```

Você precisa do [Mandrel 25.0.2](https://github.com/graalvm/mandrel/releases) para builds nativos e do [k6](https://k6.io/docs/get-started/installation/) para teste de carga.

## Conclusão

Para workloads scale-to-zero no Knative, a escolha se resume ao que você quer otimizar.

JVM ganha em throughput (1.6x com 500 VUs) e latência de cauda sob carga sustentada. Se você roda serviços always-on com tráfego alto e consistente, a vantagem do JIT é real.

Native ganha em cold start (5.5x de container, 15.6x de init da app), footprint de memória (20.1x) e tamanho do container (4.9x). No Knative, essas três métricas se traduzem diretamente em conformidade com SLA, custo em cloud e velocidade de scale-out.

Se seu serviço escala para zero, Native é o runtime certo. O benchmark fecha o argumento com números reais.

## Recursos

- [Código-fonte completo](https://github.com/omatheusmesmo/quarkus-cloud-native)
- [Guia Native Image do Quarkus](https://quarkus.io/guides/building-native-image)
- [Guia Kubernetes do Quarkus](https://quarkus.io/guides/kubernetes)
- [Quarkus Benchmark Lab](https://quarkus.io/blog/quarkus-benchmark-lab/)
- [Documentação Knative Serving](https://knative.dev/docs/serving/)
- [k6 Load Testing](https://k6.io/docs/)
- [Mandrel (downstream do GraalVM)](https://github.com/graalvm/mandrel)
