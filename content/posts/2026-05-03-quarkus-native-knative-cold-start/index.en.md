---
title: "Quarkus Native on Knative: 5x Faster Cold Start, 20x Less Memory"
date: 2026-05-03T10:00:00-03:00
draft: false
tags: ["Java", "Quarkus", "Kubernetes", "Knative", "Serverless", "GraalVM", "Native Image", "k6"]
author: "Matheus Oliveira"
slug: "quarkus-native-knative-cold-start"
summary: "What does a 3-second cold start cost you in production? SLO breaches on every scale-from-zero event and 19x more cloud spend on memory. I benchmarked a real Quarkus app in containers and the numbers make the case."
description: "A container-based benchmark of Quarkus JVM vs Native for Knative deployments, focused on production impact: cold start, memory cost, SLA, and throughput trade-offs measured with k6 and CPU pinning."
cover:
  image: "quarkus-native-knative-cold-start.png"
  alt: "Quarkus Native on Knative cold start benchmark"
  caption: "Same app, two runtimes. The numbers speak."
  relative: true
---

Scale to zero to cut costs. A request comes in. Your users wait 3 seconds for the JVM to boot. Every cold start after a quiet period is a P99 breach. For a service with any SLO under 3 seconds, that is not an edge case. It is a guarantee.

Quarkus native compilation solves this. I built [quarkus-cloud-native](https://github.com/omatheusmesmo/quarkus-cloud-native), a webhook receiver API backed by PostgreSQL, and benchmarked it in containers using the same startup path Knative follows in production. The numbers below are real, reproducible, and matter beyond the benchmark.

## Why This Matters in Production

Before the numbers, the context. Knative Serving scales pods to zero when idle. When a request arrives, a cold start happens:

1. Knative Activator receives the request
2. Pod is scheduled onto a node
3. Container image is pulled
4. Container starts and app initializes
5. First request is served

With a JVM app, step 4 alone takes 2-3 seconds. Every cold start is a user who waits. At traffic peaks following quiet periods (exactly when scale-to-zero helps most), every new pod is a cold start.

**SLA impact.** A 3,541ms container cold start means every scale-from-zero event on JVM breaches a 3s SLO immediately. Native's 642ms cold start stays within most "fast" SLO budgets. The difference shows up in your P99 dashboards, not in load tests run against warm instances.

**Cost impact.** At 241 MB RSS per JVM pod, a 16 GB node fits roughly 66 pods. At 12 MB RSS per Native pod, the same node fits over 1,300 pods. Running 500 replicas, JVM needs around 8 nodes while Native needs fewer than 1. That is not a marginal optimization. It is a different infrastructure budget.

## The App

A webhook receiver API, the kind of workload that fits serverless well:

- **Quarkus 3.35.1** + JDK 25 + Mandrel 25.0.2
- Hibernate ORM with Panache + PostgreSQL 18
- REST + Jackson + Bean Validation
- SmallRye Health, OpenAPI, Micrometer
- Blocking I/O on 4 pinned vCPUs

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

Input and output DTOs with Bean Validation and factory methods:

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

Four endpoints (list, get by ID, create, delete) hitting PostgreSQL on every request.

## The Benchmark

One command: `make compare`. It runs a container-based benchmark following the same path Knative uses in production:

1. Builds Docker images for both JVM and Native
2. Drops OS page cache (`sudo`) to ensure true cold start
3. `docker run --cpuset-cpus` starts each container with CPU pinning
4. Waits for health check (`/q/health`) to measure **container startup**
5. Parses "started in Xs" from container logs to measure **app init**
6. Repeats 5 times (1st = cold, 2-5 = warm)
7. Measures RSS memory via `docker stats`
8. Runs k6 with 500 VUs for 60 seconds
9. Saves timestamped JSON with machine info to `metrics/`

### Two-Level Startup Metrics

- **Container start:** `docker run` to health check 200 OK. Production-realistic: includes container creation, app init, and health probe. What Knative users actually experience.
- **Quarkus log:** "started in Xs" from container logs. App-only, eliminates container overhead. Useful for comparing runtimes directly.

### CPU Pinning

- **App container:** cpuset 2-5 (4 vCPUs), matching the Quarkus Benchmark Lab default
- **PostgreSQL:** cpuset 0-1 (2 threads)
- **k6 load generator:** cpuset 6-11 (6 threads)

This follows the [Quarkus Benchmark Lab](https://quarkus.io/blog/quarkus-benchmark-lab/) methodology: separate CPU sets eliminate interference between components.

### k6 Load Test

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

Workload mix: 60% reads (`GET /api/webhooks`), 25% writes (`POST /api/webhooks`), 15% system info. Realistic for a webhook receiver.

## The Numbers

Real measurements. AMD Ryzen 5 5600GT, 12 cores, 30 GB RAM. CPU-pinned. Page cache dropped between cold start runs.

| Metric | JVM | Native | vs JVM |
|---|---|---|---|
| **Cold start: container** | 3,541 ms | 642 ms | **5.5x faster** |
| **Cold start: Quarkus log** | 2,718 ms | 174 ms | **15.6x faster** |
| **Warm avg: container** | 2,400 ms | 301 ms | **8.0x faster** |
| **Warm avg: Quarkus log** | 1,990 ms | 48 ms | **41.5x faster** |
| **RSS memory** | 241 MB | 12 MB | **20.1x less** |
| **Heap used** | 26 MB | 9 MB | 2.9x less |
| **Container image** | 185.2 MB | 37.9 MB | **4.9x smaller** |
| **Requests/s** | 408 | 260 | 1.6x JVM |
| **P50 latency** | 1,039 ms | 1,581 ms | 1.5x JVM |
| **P90 latency** | 2,310 ms | 4,077 ms | 1.8x JVM |
| **P99 latency** | 4,265 ms | 7,118 ms | 1.7x JVM |

### Reading the Cold Start Numbers

The two cold start metrics tell different stories. Container start (3,541ms JVM vs 642ms Native) is what users experience: from the Knative Activator receiving the request to the first successful health probe. Quarkus log (2,718ms vs 174ms) is the pure app init time, eliminating container and Docker overhead. Both ratios matter for different decisions.

Something the warm numbers do not show: each "warm" run is still a fresh `docker run` with a new JVM process. "Warm" only means the OS page cache holds the JDK JARs in memory. On a fresh Knative node with no page cache, the JVM cold start would be higher still. Native does not have this problem. The binary is self-contained and always the same size. Cold start and warm start are essentially the same.

### Reading the Throughput Numbers

At 500 VUs, both modes are under pressure. JVM handles 408 req/s, Native handles 260 req/s (1.6x JVM advantage). The database is the bottleneck: every request hits PostgreSQL, so the difference is mostly JIT optimization and GC behavior, not raw compute. Native uses Serial GC with a smaller heap, which shows clearly at this load level.

In production, 500 concurrent connections to a single pod is extreme. Horizontal scaling handles this before a single pod reaches saturation. The relevant question for scale-to-zero workloads is not "which mode handles 500 VUs better" but "which mode recovers from idle faster."

## Container Size

Native: **37.9 MB** (micro image) vs JVM: **185.2 MB** (UBI9 + OpenJDK 25 runtime).

On Knative, image size directly affects cold start. The node must pull the image before the pod starts. A 4.9x smaller image means faster pulls on fresh nodes. In a cluster with frequent scale-from-zero events on cold nodes, this difference compounds.

The native image uses `quay.io/quarkus/ubi9-quarkus-micro-image`, a minimal base with no JDK distribution. The binary is the app. Nothing else.

## Is This Realistic for Production?

Our benchmark follows the [Quarkus Benchmark Lab](https://quarkus.io/blog/quarkus-benchmark-lab/) methodology:

- Container-based measurements (`docker run` to health check)
- CPU pinning with `--cpuset-cpus` (4 vCPUs for app, matching `ActiveProcessorCount=4`)
- Separate CPU sets for app, DB, and load generator
- OS page cache drop for true cold start

What is not simulated:

- Image pull time (Native pulls 4.9x faster, ratio holds)
- Knative queue proxy sidecar (adds equal latency to both)
- K8s scheduler and containerd overhead (equal for both)
- Service mesh and network overlay (equal for both)

Infrastructure overheads add equally to both modes. The relative ratios (5.5x container cold start, 15.6x app init, 20.1x memory, 4.9x image) are reliable. Absolute numbers in a real cluster would be higher, but the proportions hold.

## Knative Deployment

Quarkus generates the Knative manifest automatically:

```properties
quarkus.kubernetes.deployment-target=knative
quarkus.container-image.group=omatheusmesmo
```

```shell
make native-image   # Build native container image
make deploy-knative # Apply knative.yml to cluster
```

The `knative.yml` in `target/kubernetes/` is ready to apply. Quarkus generates the Service, Configuration, and Route resources.

## Versioned Metrics

Every `make compare` saves a timestamped JSON to `metrics/`:

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

These metrics are versioned in git. Run `make compare` after Quarkus or Mandrel upgrades to track changes over time.

## Reproduce It Yourself

```shell
git clone https://github.com/omatheusmesmo/quarkus-cloud-native
cd quarkus-cloud-native
sdk env install
make db-up
make jvm-image
make native-image
make compare
```

You need [Mandrel 25.0.2](https://github.com/graalvm/mandrel/releases) for native builds and [k6](https://k6.io/docs/get-started/installation/) for load testing.

## The Bottom Line

For scale-to-zero workloads on Knative, the choice comes down to what you optimize for.

JVM wins on throughput (1.6x at 500 VUs) and tail latency under sustained load. If you run always-on services with consistent high traffic, JVM's JIT advantage is real.

Native wins on cold start (5.5x container, 15.6x app init), memory footprint (20.1x), and container size (4.9x). On Knative, those three metrics directly translate to SLA compliance, cloud cost, and scale-out speed.

If your service scales to zero, Native is the right runtime. The benchmark makes that case with actual numbers.

## Resources

- [Full source code](https://github.com/omatheusmesmo/quarkus-cloud-native)
- [Quarkus Native Image Guide](https://quarkus.io/guides/building-native-image)
- [Quarkus Kubernetes Guide](https://quarkus.io/guides/kubernetes)
- [Quarkus Benchmark Lab](https://quarkus.io/blog/quarkus-benchmark-lab/)
- [Knative Serving Documentation](https://knative.dev/docs/serving/)
- [k6 Load Testing](https://k6.io/docs/)
- [Mandrel (GraalVM downstream)](https://github.com/graalvm/mandrel)
