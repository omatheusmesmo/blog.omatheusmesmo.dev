---
title: "Virtual Threads: A Pocket Guide"
date: 2026-08-23T12:00:00-03:00
tags: ["Java", "Virtual Threads", "Loom", "Quarkus", "Performance", "Concurrency", "JVM", "Java 25"]
author: "Matheus Oliveira"
slug: "virtual-threads-pocket-guide"
summary: "What virtual threads solve, what they break, what happens when your database slows down, and why Java 25 made all of this far simpler than it was in 2023."
description: "A practical guide to Java virtual threads: pinning and how to detect it, what happens to blocking calls against a degraded resource, the semaphore pattern, the Java 21 to 25 timeline, and the 2023 advice that is already dead."
cover:
  image: "cover.png"
  alt: "SNES-style pixel art status screen showing eight stacked carriers: seven running in blue and one in red, locked behind a padlock, with threads queued up behind it"
  caption: "A million threads. Eight carriers. One lock."
  relative: true
---

> A pocket guide, not a tutorial. The goal is for you to decide **when to use them**,
> **what will break**, and **what to measure**, without reading the eight articles in the
> references. If you want a code walkthrough, the
> [official Quarkus guide](https://quarkus.io/guides/virtual-threads) does that better.
>
> Everything here assumes **Java 25**. Where behavior changed since Java 21, I say so
> explicitly.
>
> Every code sample in this post was compiled and executed on **Java 25.0.2** and
> **Quarkus 3.38.3**. The memory and `ThreadLocal` numbers are my own measurements, not
> quotes. Where I did not measure, I say so.

## The day the database got slow

You enabled virtual threads. Throughput went up, latency went down, the team celebrated.

Three weeks later, on a Tuesday, an unindexed query ships to production and the database
starts answering in 30 seconds instead of 50 milliseconds. The pod dies with
`OutOfMemoryError`.

Before virtual threads, that same incident would have timed out clients and filled the
dashboard with 503s. Ugly, but the process would have stayed up.

Those two things are the same thing, and understanding why is the main subject of this
post.

---

## The model in ninety seconds

A **platform thread** is a thin wrapper around an operating system thread. It costs
roughly 1 MB of stack in native memory. You can have a few thousand before the system
complains.

A **virtual thread** is managed by the JVM, not the OS. To run, it is **mounted** on a
platform thread, which in that role is called a **carrier**. When the virtual thread
blocks on I/O, it **unmounts**: its state is copied to the heap and the carrier is free
to run another virtual thread.

By default, the number of carriers equals the number of available processors. Four vCPUs
means four carriers. Remember that number, it comes back.

The most important sentence in [JEP 444](https://openjdk.org/jeps/444), and the one that
cuts through most of the hype:

> Virtual threads are not faster threads: they do not run code any faster than platform
> threads. They exist to provide **scale** (higher throughput), not **speed** (lower
> latency).

The reasoning is **Little's Law**: concurrency = throughput x latency. If your average
latency is 50ms and you want 2,000 req/s, you need 100 requests in flight at once. In the
thread-per-request model, that is 100 threads. Scale to 20,000 req/s and it is 1,000
threads at 1 MB each.

The bottleneck was never CPU or network. It was **the number of OS threads**, which ran
out long before any other resource. Virtual threads do not speed anything up, they remove
that specific ceiling.

### When they help, per the specification

JEP 444 is precise about the condition:

> Virtual threads can significantly improve application throughput when: the number of
> concurrent tasks is **high (more than a few thousand)**, and the workload is **not
> CPU-bound**.

Below a few thousand concurrent tasks, do not expect a throughput win. That does not mean
they are worthless: in many cases the real gain is **ergonomic**, you write imperative
code at a scheduling cost close to the reactive model. But be honest about what you are
buying.

---

## The timeline, Java 21 to 25

A lot of what was written about virtual threads is from 2023 and **aged badly**. This
table is the summary of what changed.

| Version | What landed | What it meant in practice |
|---|---|---|
| **21** (LTS, Sep 2023) | [JEP 444](https://openjdk.org/jeps/444): virtual threads final | Blocking inside `synchronized` **pins** the carrier. Half the Java ecosystem used `synchronized`. Adoption was a minefield. |
| **24** (Mar 2025) | [JEP 491](https://openjdk.org/jeps/491): synchronize without pinning | The number one failure mode died. `synchronized` stopped pinning. `-Djdk.tracePinnedThreads` was **removed**. |
| **25** (LTS, Sep 2025) | [JEP 506](https://openjdk.org/jeps/506): Scoped Values final | The official `ThreadLocal` replacement, which is the second most common trap. Structured Concurrency is still in preview. |

Java 25 is the first LTS that carries both fixes. If you are on Java 21 and postponed
virtual threads because "they caused problems", the specific problem you postponed
probably does not exist anymore.

### 2023 advice you will still find, and should ignore

- **"Use `-Djdk.tracePinnedThreads` to find pinning."** The property was removed in Java
  24. Setting it on the command line does nothing.
- **"Replace every `synchronized` with `ReentrantLock`."** Unnecessary. JEP 491 is
  explicit: you need not revert what you already migrated, and for new code *"use
  `synchronized` where practical, since it is more convenient and less error prone"*.
- **"Watch out for pinning in your JDBC driver."** It was the dominant problem in 2023.
  Today it is nearly irrelevant.

---

## Pinning: what it is, what is left, how to find it

**Pinning** is when the virtual thread **cannot** unmount from its carrier. The carrier
blocks along with it, exactly as if you were using platform threads. You paid for the
abstraction and got none of the benefit.

### What still pins on Java 25

| Situation | Java 21 | Java 25 |
|---|---|---|
| Blocking I/O inside `synchronized` | pins | **fixed** |
| `Object.wait()` inside `synchronized` | pins | **fixed** |
| Native code (JNI or Foreign Function & Memory) calling back into Java and blocking | pins | **still pins** |
| Class loading whose initializer blocks | pins | **still pins** |

The second case is a subset of the first: class loading goes through native code. It only
bites you if a static initializer performs a blocking operation, which is rare but does
happen in code with lazy initialization.

In practice, very little is left on Java 25, and what is left is narrow.

### File I/O is not pinning, and the difference matters

This is worth untangling, because the confusion is widespread, including in good articles.

Local disk file I/O **does not unmount** the virtual thread. That much is true, and the
root cause is in
[State of Loom](https://cr.openjdk.org/~rpressler/loom/loom/sol1_part1.html): the JDK uses
buffered I/O for files, which **always reports available bytes** even when the read will
block. The OS cannot tell you, so it cannot be made non-blocking. And there is no
production-ready `io_uring` integration in the JDK.

But that is **not pinning**, and JEP 444 is explicit about separating the two categories:

> some blocking operations in the JDK do not unmount the virtual thread [...] because of
> limitations at either the OS level (e.g., many filesystem operations) or the JDK level
> (e.g., `Object.wait()`). The implementations of these blocking operations **compensate
> for the capture** of the OS thread by temporarily expanding the parallelism of the
> scheduler.

In other words: the JVM knows these operations capture the carrier and **creates extra
carriers** to compensate, via `ForkJoinPool.ManagedBlocker`. The pool grows beyond the
processor count, and you can cap that with `jdk.virtualThreadScheduler.maxPoolSize`.

Pinning is the category where **no rescue exists**, and it is only the two situations in
the table above.

The practical difference is enormous, and it is the subject of the next section.

### Why pinning is worse than compensated capture

The sentence that closes the contrast comes a few lines later in the same JEP:

> The scheduler does **not** compensate for pinning by expanding its parallelism.

Read the two together. The JVM has a rescue mechanism for a captured carrier, and it
**deliberately does not run** for pinning. Reading a file grows the pool. Pinning does
nothing: the carrier leaves the pool and nobody replaces it.

Combine that with the fact that the carrier pool is sized to your vCPU count, and you have
the recipe for the most famous incident in this space.

### The Netflix case, in one paragraph

Java 21, Spring Boot 3, embedded Tomcat, 4 vCPUs, therefore 4 carriers. Instances started
**refusing to serve traffic**, with no error, no exception, nothing in the logs. Six
threads were contending for the same `ReentrantLock` (from Zipkin). Four of them were
virtual threads pinned by a `synchronized` block in the tracing library. In the heap dump,
**nobody held the lock**: the fifth virtual thread had already been signaled to take it,
but there was no free carrier for it to even wake up on.

A classic deadlock, except with one lock on one side and a semaphore with four permits
(the ForkJoinPool) on the other.

Two structural lessons worth more than the bug itself:

**The failure shows up as silence, not slowness.** It does not appear on a dashboard. The
JVM stays alive and quiet.

**Four simultaneous pins were enough.** With a pool of 200 worker threads, exhausting
everything would take far more. Virtual threads did not invent pinning: they shrank the
pool underneath until it fit inside an accident.

### How to detect it

In production, the JFR event `jdk.VirtualThreadPinned` is **enabled by default**, with a
20ms threshold. Alerting on it is the cheapest thing you can do:

```bash
-XX:StartFlightRecording=settings=profile,dumponexit=true
```

In tests, Quarkus ships a JUnit extension that **fails the test** on pinning. It is
excellent for evaluating a third-party library before choosing between worker threads and
virtual threads:

```xml
<dependency>
    <groupId>io.quarkus.junit</groupId>
    <artifactId>junit-virtual-threads</artifactId>
    <scope>test</scope>
</dependency>
```

```java
@QuarkusTest
@VirtualThreadUnit
@ShouldNotPin
class ReportResourceTest {
    // ...
}
```

### Proof that the 2023 advice is dead

A passing test proves nothing if the tool never fails. So I inverted it: I took the
canonical pinning example that appears in every 2023 tutorial and asserted, via
`@ShouldPin`, that it **should** pin.

```java
@Path("/pin")
@RunOnVirtualThread
public class PinResource {

    private final Object monitor = new Object();

    @GET
    public String pins() throws Exception {
        synchronized (monitor) {
            Thread.sleep(200);
        }
        return "ok";
    }
}
```

```java
@QuarkusTest
@VirtualThreadUnit
@ShouldPin   // asserts that THIS pins
class PinTest {
    @Test
    void syncPlusSleepStillPins() {
        given().when().get("/pin").then().statusCode(200);
    }
}
```

Result on Java 25.0.2 and Quarkus 3.38.3:

```
[ERROR] PinTest.syncPlusSleepStillPins
        The test syncPlusSleepStillPins() was expected to pin
        the carrier thread, it didn't
```

`synchronized` around a blocking operation, the example that practically defined the fear
of virtual threads for two years, **does not pin anymore**. And the same test proves the
extension is not decorative: it really measures, through JFR events, and reports when
reality disagrees with your assertion.

And know this: **`jstack` does not show virtual threads.** That is exactly what fooled the
Netflix team, who saw "a perfectly idle JVM" while the application was frozen. Use:

```bash
jcmd <pid> Thread.dump_to_file -format=json /tmp/dump.json
```

That dump shows virtual threads and **does not pause the application**. On a related note:
`ThreadMXBean.findDeadlockedThreads()` is blind to virtual threads, so your current
deadlock detector would not have caught the case above.

---

## The degraded resource: where virtual threads actually bite

This is the section I wish I had read before enabling virtual threads anywhere.

Go back to Little's Law and read it **backwards**. Concurrency = throughput x latency.
Latency is not a constant you own: it is decided by the resource on the other side.

Assume a steady 2,000 req/s against a database:

| | Latency | Required concurrency |
|---|---|---|
| Normal day | 50 ms | 100 requests in flight |
| Degraded database | 30 s | **60,000 requests in flight** |

The arrival rate did not change. What changed is how long each request stays alive. And
the required concurrency went up 600x on its own.

### What the thread pool was secretly doing

With a pool of 200 platform threads, concurrency **stops at 200**. The other 59,800
requests never get in: they sit in the kernel accept queue, which is cheap, or get
rejected. Clients time out, the dashboard turns red, and the process stays alive.

The thread pool was an **accidental bulkhead**. It was never only an optimization for
thread creation cost: it was also your in-flight load limit, and it propagated
backpressure all the way down to TCP.

With virtual threads, that ceiling is gone. All 60,000 requests get in, become 60,000
virtual threads, and each one holds:

- its own stack, as an object on the heap
- the request object, the response buffer, the parsed body
- the socket
- everything it accumulated before blocking

How much does that cost? I measured it instead of estimating. The test program spawns N
virtual threads that block on a slow resource from a call stack of configurable depth,
each holding a realistic request object (header map, customer, three line items, a 512
byte JSON body). After forcing GC, it measures the heap retained per in-flight request.

Java 25.0.2, ParallelGC, 30,000 parked requests:

| Stack depth | Heap per request | 60,000 in flight |
|---|---|---|
| 10 frames | 5.2 KB | 307 MB |
| 30 frames | 6.2 KB | 366 MB |
| 60 frames | 7.3 KB | 429 MB |
| 100 frames | 8.8 KB | 518 MB |

A real framework stack (HTTP handler, filters, CDI interceptors, resource, service,
repository, JDBC) easily sits between 30 and 100 frames. So the honest number is **300 to
520 MB of nothing but waiting requests**, before cache, sessions, and the rest of the
application.

In a container with `-Xmx512m`, that is the end.

Note that the cost grows with **stack depth**, not just request count. Every extra frame
you push before blocking is memory multiplied by your concurrency.

> **The inversion that matters:** virtual threads convert a **latency** problem into a
> **memory** problem. Before, the slow resource gave you a 503. Now it gives you an
> `OutOfMemoryError`. The second is much worse, because it kills the whole process instead
> of refusing one request.

There is a quieter aggravating factor too: with no limit, you keep accepting work the
client already gave up on. The server processes 60,000 requests nobody will ever read.

### The recipe: semaphore, timeout, fail fast

The solution is not mine, it is the canonical one, and it shows up in **the same words**
across every primary source. Ron Pressler, in State of Loom:

> If we don't pool them, how do we limit concurrent access to some service? [...] use a
> **semaphore** in the service-call code to limit concurrency: **this is how it should be
> done.**

JEP 444 says the same:

> do not be tempted to pool virtual threads in order to limit concurrency. Instead use
> constructs specifically designed for that purpose, **such as semaphores**.

The framing that closes the argument: the thread pool always did **two** jobs at once, and
nobody noticed because it was a single object.

1. **Work isolation:** one worker per task.
2. **Resource bounding:** at most N tasks at a time.

Virtual threads **decouple** them. The first becomes unbounded. The second becomes your
code's explicit responsibility, at every scarce resource.

```java
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.ServiceUnavailableException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

@ApplicationScoped
public class ReportService {

    private static final Semaphore DB_PERMITS = new Semaphore(50);

    private final ReportRepository repository;

    public ReportService(ReportRepository repository) {
        this.repository = repository;
    }

    public Report generate(String id) throws InterruptedException {
        if (!DB_PERMITS.tryAcquire(2, TimeUnit.SECONDS)) {
            throw new ServiceUnavailableException("database saturated");
        }
        try {
            return repository.find(id);
        } finally {
            DB_PERMITS.release();
        }
    }
}
```

`jakarta.ws.rs.ServiceUnavailableException` already maps to HTTP 503, which is exactly the
semantics you want: refuse fast instead of accepting and holding memory.

Note the `tryAcquire` with a timeout instead of `acquire`. That is the difference between
**queueing forever** and **failing fast**. With a plain `acquire()`, you have recreated the
problem: 60,000 virtual threads politely waiting in the semaphore queue, all alive on the
heap.

A `Semaphore` limits concurrency. It is **not** backpressure: it queues or rejects, it
does not make the producer slow down. If your problem is a stream where the producer
outruns the consumer, you still need a reactive model.

### What to configure, concretely

If you use Quarkus, most of this already exists and just needs sizing:

```properties
# The connection pool ALREADY IS your database semaphore. Default: 50.
quarkus.datasource.jdbc.max-size=50

# This already defaults to 5S. Under a degraded resource, 5s per request
# can be too long to hold memory. Shorten it deliberately.
quarkus.datasource.jdbc.acquisition-timeout=2S

# Every external HTTP client needs both, in milliseconds.
quarkus.rest-client.external-service.connect-timeout=2000
quarkus.rest-client.external-service.read-timeout=5000
```

Two details worth checking yourself rather than trusting an article, this one included.

**The `max-size` default is 50, not 20.** A lot of material (including Clement Escoffier's
excellent 2023 post) cites 20. The confusion probably comes from the fact that the
**reactive** pool really does default to 20: `quarkus.datasource.reactive.max-size` is 20,
while `quarkus.datasource.jdbc.max-size` is 50. Two different pools, two different
defaults.

**`acquisition-timeout` is not infinite by default.** It ships as **5S**. That is good, it
means you do not get a literally unbounded queue even if you forget. But 5 seconds per
request, with tens of thousands of them alive, is still a lot of parked memory. Tune it on
purpose, do not leave it at the default by accident.

> Values verified against the Quarkus **3.38.x** documentation. Defaults change between
> versions, so confirm on yours.

For messaging, Quarkus already applies the pattern for you: methods annotated with
`@RunOnVirtualThread` have a default maximum concurrency of **1024**, applied separately
per method. You can tune it:

```properties
smallrye.messaging.worker.<virtual-thread>.max-concurrency=256
```

It is the semaphore pattern baked into the framework, and it exists precisely so the
application does not consume millions of messages at once and blow up memory.

And if you want the declarative version instead of a hand-rolled `Semaphore`, SmallRye
Fault Tolerance offers `@Bulkhead`, `@Timeout`, and `@CircuitBreaker` as annotations.

### How to test this before it happens

One suggestion worth more than any configuration: **inject latency on purpose**. Put a
proxy between your application and the database, add 30 seconds of delay, drive load, and
watch the heap. If `-Xmx` climbs monotonically until it dies, you found the problem before
it found you.

---

## The three traps that never throw

### 1. ThreadLocal stops being a cache and becomes an allocator

`ThreadLocal` was designed in 1998 for a few long-lived threads in a pool. Libraries use
that pattern to pool expensive objects: `SimpleDateFormat`, `ObjectMapper`, byte buffers.

With virtual threads, every request gets a fresh thread. The "cache" is rebuilt from
scratch every time. I measured it with an instrumented `ThreadLocal.withInitial()`, same
code, same 200,000 tasks, only the executor swapped:

```
tasks executed: 200,000
platform threads (pool of 200):     200 ThreadLocal initializations
virtual threads:                200,000 ThreadLocal initializations
ratio: 1000x
```

And notice that **1000x is not a magic number**: it is exactly `tasks / pool size`. With a
platform thread pool you initialize once per pooled thread, forever. With virtual threads,
once per task. The ratio keeps growing as your traffic grows, because the denominator is
fixed and the numerator is not.

It never throws, it never logs. What reaches you is "unexplained GC pressure after we
turned on virtual threads", and it is easy to wrongly conclude that virtual threads have
high overhead.

For a sense of scale: the OpenJDK team itself had to **hunt down and remove `ThreadLocal`
usage from `java.base`** to make virtual threads viable.

The Java 25 answer is `ScopedValue`:

```java
// Before
private static final InheritableThreadLocal<Context> CTX = new InheritableThreadLocal<>();

void handle(Request req) {
    CTX.set(new Context(req.userId(), req.traceId()));
    try { process(); }
    finally { CTX.remove(); } // easy to forget on the error path
}

// After (JEP 506, the final Java 25 API)
private static final ScopedValue<Context> CTX = ScopedValue.newInstance();

void handle(Request req) {
    ScopedValue.where(CTX, new Context(req.userId(), req.traceId()))
               .run(this::process);
    // context cleared automatically when the block exits
}
```

> Careful if you are writing this from older material: the `ScopedValue.runWhere(...)`
> method existed in the preview releases and is **not in the final API**. The correct form
> on Java 25 is `where(...).run(...)`. One more change at finalization:
> `ScopedValue.orElse(null)` is no longer permitted.

Subtasks forked with `StructuredTaskScope.fork()` **inherit** the `ScopedValue`
automatically. I verified this by running it: the child reads the parent's value with no
configuration at all.

> **A myth I nearly published myself:** it is widely repeated that with
> `InheritableThreadLocal` the forked children read `null`. **They do not.** I tested on
> Java 25: virtual threads inherit `InheritableThreadLocal` by default, whether created
> through `Thread.ofVirtual()`, `newVirtualThreadPerTaskExecutor()`, or
> `StructuredTaskScope.fork()`. It is only `null` if you deliberately disable it with
> `.inheritInheritableThreadLocals(false)`.
>
> The real problem with `InheritableThreadLocal` is different, and it is twofold. First,
> **cost**: inheritance is a copy made when each child thread is created, which JEP 506
> calls *"expensive inheritance"*. With a million virtual threads, that is a million
> copies. Second, **stale values**: the copy happens when the thread is born. With a
> platform thread pool the thread is born once, so it holds forever whatever the parent
> had at that instant. I measured that too: I changed the value in the parent and the
> pooled thread kept reading the old one.

With `ScopedValue` neither happens: no per-child copy, and the binding is structural, tied
to the block.

When you **genuinely** need per-thread reuse, the answer is different: use a bounded
`ExecutorService` with platform threads for the work that needs the cached objects, and
keep virtual threads for the I/O parts.

To hunt this down in your own code, `-Djdk.traceVirtualThreadLocals=true` prints a stack
trace every time a virtual thread writes to a thread-local.

### 2. Monopolization, or why CPU-bound is poison

The virtual thread scheduler **is not preemptive**. There is no time slice that forces a
switch. The virtual thread releases its carrier when it wants to, and pure computation
never wants to.

If you run a 5-second calculation on a virtual thread, it monopolizes that carrier for 5
seconds, and you are down one of your four.

For long computation, use a dedicated platform thread pool. That is not a regression, it
is using the right tool.

**An honest caveat:** there is a second-order effect that complicates this rule. The C2
compiler runs on background threads and competes for the same cores as your application.
With 100 connections, Tomcat creates ~130 platform threads; with virtual threads, only ~4
carriers are on-CPU. In
[Francesco Nigro's benchmarks](https://quarkus.io/blog/when-the-jit-cant-keep-up/), on a
**deliberately CPU-bound** workload, virtual threads took Spring from ~3,300 to ~9,900
req/s and let Quarkus reach peak in 15 seconds instead of 60.

The gain is not your code's, it is the **JIT's**, which finally got CPU to compile with.
The rule stays literally true (a virtual thread does not compute any faster), but fewer
on-CPU threads can help a CPU-bound service through an indirect path.

### 3. The stack moved pockets

A platform thread keeps its stack in **native** memory, outside the heap, bounded by
`-Xss`. The GC never sees it.

A virtual thread keeps its stack **on the heap**, as `StackChunk` objects. It is in JEP
444, it is specification:

> The stacks of virtual threads are stored in Java's garbage-collected heap as **stack
> chunk objects**.

The direct and frequently ignored consequence: **the `-Xmx` that used to be enough may not
be anymore**. That container with `-Xmx512m` that worked perfectly with worker threads can
behave strangely after you add `@RunOnVirtualThread`. It is not a bug, the stack changed
address.

Two concrete gotchas to remember:

**Do not pool virtual threads.** Beyond contradicting the design,
[Nigro's benchmark](https://quarkus.io/blog/to-cache-or-not-to-cache-virtual-threads/)
shows why: on a 4 GB heap, pooling won by 13.5%; on 1 GB, it lost 34%, with 461 Full GCs
against 4. The reason is that a long-lived virtual thread gets its `StackChunk` promoted
to the old generation, and the JVM then allocates fresh chunks and abandons the old ones
every cycle. Pooling converts cheap young-gen garbage into expensive old-gen retention.

**Watch out for deep recursion on G1.** G1 does not support humongous `StackChunk`
objects. If a virtual thread's stack reaches half the region size (which can be 512 KB on
a small heap), you can get a `StackOverflowError` that has nothing to do with your code
recursing too deeply.

---

## The actual pocket guide

If you only keep one part of this post, keep this one.

**Use virtual threads when:**

- thousands of concurrent tasks, and
- I/O-bound, and
- downstream resources are abundant, or you already put a semaphore on them

**Do not use them when:**

- purely CPU-bound (use a platform thread pool)
- low concurrency, a few hundred tasks (it will not move the needle)
- you already have a reactive stack that works (do not migrate for fashion)

**Before enabling in production, do these five:**

| # | Action | Why |
|---|---|---|
| 1 | Semaphore or sized pool at **every** scarce resource | otherwise a degraded resource becomes an OOM |
| 2 | Timeout on **every** blocking call, and `tryAcquire` with a timeout | otherwise the queue is infinite |
| 3 | Alert on `jdk.VirtualThreadPinned` in JFR | pinning fails in silence |
| 4 | Audit `ThreadLocal` in your code and your libraries | it becomes an allocator without warning |
| 5 | Load test **with the resource deliberately degraded** | it is the only way to watch item 1 fail |

**Commands worth keeping around:**

```bash
# thread dump that sees virtual threads, without pausing the application
jcmd <pid> Thread.dump_to_file -format=json /tmp/dump.json

# JFR with profiling, for pinning and compilation
-XX:StartFlightRecording=settings=profile,dumponexit=true

# hunt ThreadLocal during migration
-Djdk.traceVirtualThreadLocals=true
```

---

## What to do with this

If you are on Java 21 and gave up on virtual threads because "they caused problems": it is
worth revisiting. The specific problem that made you give up (pinning on `synchronized`)
was probably that one, and it ended in Java 24.

If you are on Java 25 and have not enabled them on an I/O-bound service yet: start with
one, the simplest one, and run the degraded-resource test before celebrating. The gain is
real. So is the failure mode.

And if you have to pick a single thing from this entire list, pick the **semaphore**. Not
because virtual threads are dangerous, but because they are honest: they remove an
artificial ceiling and show you where your limit always actually was. Your job is to
decide what that limit is before production decides for you.

---

## References

Primary sources, in the order they are worth reading:

- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444), Ron Pressler and Alan Bateman.
  The specification. Read the whole "Do not pool virtual threads" section, the part about
  semaphores is almost never quoted.
- [Java 21 Virtual Threads: Dude, Where's My Lock?](https://netflixtechblog.com/java-21-virtual-threads-dude-wheres-my-lock-3052540e231d),
  Netflix. The best published account of how pinning turns into a silent deadlock.
- [JEP 491: Synchronize Virtual Threads without Pinning](https://openjdk.org/jeps/491).
  What changed in Java 24 and why.
- [JEP 506: Scoped Values](https://openjdk.org/jeps/506). The `ThreadLocal` replacement.
- [State of Loom](https://cr.openjdk.org/~rpressler/loom/loom/sol1_part1.html),
  Ron Pressler. Dense, but it is the worldview behind all of it.

Analysis and production reports:

- [Virtual Threads after JDK 24: What Changed for Production Java](https://www.infoq.com/articles/virtual-threads-after-jdk24/),
  InfoQ. Public benchmark, with the `ThreadLocal` and connection pool numbers.
- [To Cache or Not to Cache Virtual Threads](https://quarkus.io/blog/to-cache-or-not-to-cache-virtual-threads/),
  Francesco Nigro. Why not to pool, with the JVM internals.
- [Harder, Better, Faster, Stronger... Earlier!](https://quarkus.io/blog/when-the-jit-cant-keep-up/),
  Francesco Nigro. C2 compiler starvation and time to peak.

Quarkus:

- [Virtual Thread support reference](https://quarkus.io/guides/virtual-threads). The hard
  rules and the honest table comparing worker, reactive, and virtual thread models.
- [When Quarkus meets Virtual Threads](https://quarkus.io/blog/virtual-thread-1/) and
  [Writing CRUD applications using virtual threads](https://quarkus.io/blog/virtual-threads-2/),
  Clement Escoffier. The best didactic introduction, with the caveat that the pinning
  detection section has aged.
