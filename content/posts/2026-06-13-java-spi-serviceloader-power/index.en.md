---
title: "Java SPI: The Built-in Superpower Every Developer Should Know"
date: 2026-06-13T10:00:00-03:00
draft: false
tags: ["Java", "SPI", "ServiceLoader", "Service Provider Interface", "AutoService", "JPMS", "Java Modules", "Quarkus", "CDI", "Design Patterns", "Open Closed Principle", "Plugins", "NES Emulator", "Build Time"]
author: "Matheus Oliveira"
slug: "java-spi-serviceloader-power"
summary: "There is a plugin system hiding inside the JDK that most developers never use on purpose. Java SPI (ServiceLoader) lets you add behavior without touching the code that consumes it. I show it with real code from my NES emulator, kill the fragile META-INF file with Google AutoService, cover the modern JPMS variant, and finish with how Quarkus does the same idea at build time."
description: "A hands-on guide to Java's Service Provider Interface (SPI). Learn ServiceLoader from scratch with real code from a NES emulator's mapper system, replace the manual META-INF/services file with Google AutoService, declare services with JPMS module-info, and see how Quarkus replaces runtime ServiceLoader with build-time CDI discovery."
cover:
  image: "java-spi-serviceloader-cover.png"
  alt: "NES-style pixel art: a retro game console with several cartridges floating above its slot, each cartridge labeled like a plugin (NROM, MMC1, MMC3), a glowing 'ServiceLoader' label on the console reading them automatically"
  caption: "Providers plugged in like NES cartridges: the console (ServiceLoader) discovers whatever you slot in"
  relative: true
---

Picture the ugliest method you have written this year. I will bet it looks something like this: a giant `switch` that grows a new `case` every time the product team invents a new "type". A new payment provider, a new export format, a new device. Each one means opening the same file, adding another branch, and praying you did not break the others.

Now imagine the opposite. You drop a new class into the project, you do not touch a single line of the code that uses it, and the new behavior just shows up. No registry to update, no factory to edit, no `if` to extend.

That is not a framework. It is not a library you need to install. It has been sitting inside the JDK since Java 6, and it is called **SPI: the Service Provider Interface**, driven by a class named `ServiceLoader`. In this article we are going to walk through all of it, step by step and in plain terms: what SPI is, how to use it with real code from my NES emulator, how to stop hand-editing that fragile `META-INF` file, how it looks in the modern Java module system, and finally how a modern framework like Quarkus takes the same idea and makes it even more powerful. Let's go.

> **Tested on**
> Java 17 (the NES emulator) and Java 25 for the standalone examples · Maven 3.9 · Google AutoService 1.1.1 · Quarkus 3.x (quarkus-langchain4j)

---

## 1. The problem: code that you keep reopening

Say you are building something that has to handle many variants of "the same thing". In my case it is a NES emulator. A NES cartridge is not just ROM: it contains a chip called a **mapper** that decides how the console sees the cartridge's memory. There are dozens of them. Mapper 0 (NROM) is the simple one. Mapper 1 (MMC1) and Mapper 4 (MMC3) add bank switching and other tricks. The ROM header tells you which number you are dealing with.

The naive solution writes itself:

```java
public Mapper createMapper(int mapperNumber, /* ... */) {
    switch (mapperNumber) {
        case 0: return new NRomMapper(/* ... */);
        case 1: return new MMC1Mapper(/* ... */);
        case 4: return new MMC3Mapper(/* ... */);
        default: throw new UnsupportedOperationException("Mapper " + mapperNumber);
    }
}
```

It works. But every new mapper forces me back into this method. The class that builds mappers has to know about every mapper that exists. That is tight coupling, and it quietly violates the **Open/Closed Principle**: the code should be open for extension but closed for modification. Here it is closed for extension and wide open for modification, which is exactly backwards.

What I actually want: add a mapper by adding a class, and never reopen the builder again.

---

## 2. What SPI actually is

SPI is a contract-based plugin mechanism built into the language. It has three roles, and the whole thing clicks once you can name them:

- **The service** is an interface (or abstract class). It is the contract: "anything that wants to be a mapper factory must implement this".
- **The provider** is a concrete class that implements the service. Each provider is one plugin.
- **The consumer** asks `java.util.ServiceLoader` for all the providers it can find on the classpath, without naming any of them.

The magic is in that last point. The consumer depends only on the interface. It never imports a single concrete implementation. New providers can come from your own code, from another module, or from a third-party JAR you dropped on the classpath, and the consumer picks them up the same way.

You are already using this every day without noticing:

- **JDBC.** You never call `new PostgresDriver()`. The PostgreSQL JAR ships a provider, and `DriverManager` finds it through SPI.
- **SLF4J / logging.** The binding you put on the classpath is discovered, not hard-coded.
- **`java.time` formatting, charset providers, scripting engines, JSON-P, and most annotation processors** all use the same mechanism.

So SPI is not exotic. It is the quiet machinery under a big chunk of the Java ecosystem. The interesting move is using it on purpose, in your own code.

---

## 3. ServiceLoader in practice: the NES mapper system

Here is how the mapper problem looks once SPI is in charge. This is real code from my [SelfMat NES emulator](https://github.com/omatheusmesmo/SelfMat-NES-Emulator), not a toy.

First, the **service**: the contract a mapper factory must honor.

```java
public interface MapperFactory {

    int getSupportedMapperNumber();

    Mapper create(int prgRomSizeBytes, int chrDataSizeBytes, boolean isVerticalMirroring);
}
```

Two methods: "which mapper number do you handle?" and "build me an instance". That is the entire extension point.

Next, the **consumer**: a manager that asks `ServiceLoader` for every `MapperFactory` on the classpath and indexes them by mapper number.

```java
public class MapperManager {

    private static final Map<Integer, MapperFactory> factories = new HashMap<>();

    static {
        ServiceLoader<MapperFactory> loader = ServiceLoader.load(MapperFactory.class);

        for (MapperFactory factory : loader) {
            int mapperNumber = factory.getSupportedMapperNumber();
            factories.put(mapperNumber, factory);
        }
    }

    public static Mapper createMapper(int mapperNumber, int prgRomSizeBytes,
                                      int chrDataSizeBytes, boolean isVerticalMirroring) {
        MapperFactory factory = factories.get(mapperNumber);

        if (factory != null) {
            return factory.create(prgRomSizeBytes, chrDataSizeBytes, isVerticalMirroring);
        }
        throw new UnsupportedOperationException(
                "Mapper " + mapperNumber + " is not supported (no factory registered).");
    }
}
```

Read the `static` block again and notice what is missing: there is no list of mappers. `ServiceLoader.load(MapperFactory.class)` returns something you can iterate, and each loop turn hands you one provider it discovered. The manager builds a `Map<Integer, MapperFactory>` from whatever exists. It does not import `NRomMapper`, `MMC1Mapper`, or any concrete factory.

Finally, a **provider**:

```java
public class NRomFactory implements MapperFactory {

    private static final int SUPPORTED_MAPPER_NUMBER = 0;

    @Override
    public int getSupportedMapperNumber() {
        return SUPPORTED_MAPPER_NUMBER;
    }

    @Override
    public Mapper create(int prgRomSizeBytes, int chrDataSizeBytes, boolean isVerticalMirroring) {
        return new NRomMapper(getSupportedMapperNumber(), prgRomSizeBytes, chrDataSizeBytes, isVerticalMirroring);
    }
}
```

Now the payoff. To support a brand new mapper, say Mapper 7, I write `AxRomFactory implements MapperFactory`, register it as a provider, and I am done. `MapperManager` never changes. The `switch` from section 1 is gone, and with it the coupling. That is the Open/Closed Principle, enforced by the runtime instead of by discipline.

There is one piece I glossed over: how does `ServiceLoader` know `NRomFactory` exists? That is the next section, and it is where most people first meet friction.

---

## 4. The friction: that META-INF/services file

`ServiceLoader` does not scan your whole classpath looking for implementers. That would be slow and unpredictable. Instead, each provider JAR declares its providers in a plain text file under a strict path:

```
src/main/resources/META-INF/services/dev.omatheusmesmo.selfmat.nes.emulator.core.rom.mappers.factory.MapperFactory
```

The file name is the **fully qualified name of the service interface**. The contents are the fully qualified names of the implementations, one per line:

```
dev.omatheusmesmo.selfmat.nes.emulator.core.rom.mappers.factory.NRomFactory
dev.omatheusmesmo.selfmat.nes.emulator.core.rom.mappers.factory.MMC1Factory
dev.omatheusmesmo.selfmat.nes.emulator.core.rom.mappers.factory.MMC3Factory
```

This works, and for a long time it was the only way. But look at what you are signing up for. It is a hand-maintained text file full of stringly-typed class names that the compiler never checks. Rename a package and your refactor tool silently leaves this file pointing at a class that no longer exists. Forget to add a line and your new provider simply never loads, with no error, no warning, nothing. You just notice a feature is missing. It is the kind of bug that eats an afternoon.

There is a better way, and it costs you almost nothing.

---

## 5. Killing the manual file with Google AutoService

[Google AutoService](https://github.com/google/auto/tree/main/service) is a tiny annotation processor with one job: generate that `META-INF/services` file for you, at compile time, from an annotation. You annotate the provider, and the file writes itself.

Here is the same `NRomFactory`, the version that actually ships in my emulator:

```java
import com.google.auto.service.AutoService;

@AutoService(MapperFactory.class)
public class NRomFactory implements MapperFactory {

    private static final int SUPPORTED_MAPPER_NUMBER = 0;

    @Override
    public int getSupportedMapperNumber() {
        return SUPPORTED_MAPPER_NUMBER;
    }

    @Override
    public Mapper create(int prgRomSizeBytes, int chrDataSizeBytes, boolean isVerticalMirroring) {
        return new NRomMapper(getSupportedMapperNumber(), prgRomSizeBytes, chrDataSizeBytes, isVerticalMirroring);
    }
}
```

That single line, `@AutoService(MapperFactory.class)`, is the whole change. During compilation the processor sees the annotation and emits the correct `META-INF/services` entry into the build output. No hand-written file, no typos, and refactors stay safe because the annotation references `MapperFactory.class` directly, which the compiler does check.

The Maven setup is two parts: the annotations on the compile classpath, and the processor on the annotation-processor path. This is exactly what the emulator uses:

```xml
<dependency>
  <groupId>com.google.auto.service</groupId>
  <artifactId>auto-service-annotations</artifactId>
  <version>1.1.1</version>
  <scope>provided</scope>
</dependency>
```

```xml
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-compiler-plugin</artifactId>
  <configuration>
    <source>17</source>
    <target>17</target>
    <annotationProcessorPaths>
      <path>
        <groupId>com.google.auto.service</groupId>
        <artifactId>auto-service</artifactId>
        <version>1.1.1</version>
      </path>
    </annotationProcessorPaths>
  </configuration>
</plugin>
```

Now adding a new mapper is genuinely one step: write the factory class, annotate it, build. The registration is a compile-time byproduct. This is the combination I would reach for in any plain-Java plugin system today: `ServiceLoader` for discovery, `@AutoService` to remove the only fragile part.

---

## 6. SPI in the module system (JPMS)

Everything above lives in the classpath world, and it is what my emulator uses. But if your project is modularized with the Java Platform Module System (Java 9 and up), SPI gets a first-class, type-safe syntax. I want to show it because it is genuinely nicer, with one honest caveat: **this is not what I did in the NES emulator** (the emulator is a classpath project). Treat this section as the modern variant you should know exists.

Instead of a text file, you declare services and providers directly in `module-info.java`. The provider module says what it offers:

```java
module nes.mappers.mmc {
    requires nes.core;
    provides dev.omatheusmesmo.nes.spi.MapperFactory
        with dev.omatheusmesmo.nes.mappers.MMC1Factory,
             dev.omatheusmesmo.nes.mappers.MMC3Factory;
}
```

And the consumer module declares that it uses the service:

```java
module nes.core {
    exports dev.omatheusmesmo.nes.spi;
    uses dev.omatheusmesmo.nes.spi.MapperFactory;
}
```

`provides ... with ...` and `uses ...` are compiler-checked: the names are real types, not strings, so a bad reference fails the build instead of failing silently at runtime. The consumer code is unchanged, you still call `ServiceLoader.load(MapperFactory.class)`, but now the wiring is part of the module descriptor and respects strong encapsulation.

While we are here, two `ServiceLoader` niceties that the modern stream API gives you, regardless of classpath or modules:

```java
// Lazily stream providers without instantiating the ones you skip:
Optional<MapperFactory> mapper0 = ServiceLoader.load(MapperFactory.class)
        .stream()
        .map(ServiceLoader.Provider::get)
        .filter(f -> f.getSupportedMapperNumber() == 0)
        .findFirst();
```

`ServiceLoader.Provider::get` is what actually instantiates a provider, so filtering on the `Provider` before calling `get()` lets you skip building objects you do not need. Worth remembering: providers are loaded lazily and their order is not guaranteed, so never write code that assumes "the first one is the default".

---

## 7. The next level: how Quarkus does SPI for you

Plain SPI is great, but it has a runtime cost: `ServiceLoader` scans and instantiates while your application is running. For a desktop NES emulator that is a non-issue. For a cloud service that wants to boot in milliseconds and compile to a native binary, runtime scanning and reflection are exactly the things you want to avoid.

This is where a modern framework changes the game. [Quarkus](https://quarkus.io/) keeps the *idea* of SPI, a core that defines extension points and providers that plug into them, but it resolves the wiring at **build time** through CDI bean discovery instead of at runtime through `ServiceLoader`. You define an interface, you expose implementations as CDI beans, and the framework discovers and wires them while it builds your application. No `META-INF/services` to maintain, no runtime classpath scan, and the result is native-image friendly because everything is known before the app starts.

I ran into this concretely while contributing to the [quarkus-langchain4j](https://github.com/quarkiverse/quarkus-langchain4j) extension. One feature I built and that got merged ([PR #2563](https://github.com/quarkiverse/quarkus-langchain4j/pull/2563)) lets the system message sent to an LLM depend on which model is in use. The clean way to express that is an SPI, and the design lesson is worth more than the feature itself: **how do you add a capability to a released interface without breaking everyone who already implements it?**

The answer was *not* to add a method to the existing interface. That would force every existing implementation to change. Instead, the new capability became a second, separate interface, and the implementer picks the one they need:

```java
// Existing, already released: unchanged.
public interface SystemMessageProvider extends BaseSystemMessageProvider {
    Optional<String> getSystemMessage(Object memoryId);
}

// New, model-aware. You implement this one if you need the extra context.
public interface SystemMessageProviderWithContext extends BaseSystemMessageProvider {
    Optional<String> getSystemMessage(InvocationContext context);
}
```

`InvocationContext` carries which provider and model are about to be called, so adapting the prompt per model is just a branch with a fallback:

```java
@Override
public Optional<String> getSystemMessage(InvocationContext context) {
    if (context.modelProvider() == ModelProvider.OPEN_AI) {
        return Optional.of("You are a helpful assistant. Be concise.");
    }
    return Optional.of("You are a helpful assistant.");
}
```

You implement one interface or the other, never both, and Quarkus discovers your implementation as a bean and dispatches to whichever one you provided. A related merged feature, the [`@OnThinking`](https://github.com/quarkiverse/quarkus-langchain4j/pull/2460) handler for reasoning output, follows the same shape: define a plug point, let the user provide a handler, wire it at build time.

The takeaway that carries across frameworks: when the core needs behavior that only an external piece can supply, do not couple the core to the implementation and do not reach for runtime reflection. Define an SPI, let implementations plug in, and resolve the connection as early as you can. Plain Java does it with `ServiceLoader`; Quarkus does it with CDI at build time. Same principle, different ceiling.

---

## 8. When to use SPI, and when not to

SPI is a sharp tool, which means it has a right size.

**Reach for it when:**

- You are building a **plugin or extension point**: drivers, format handlers, mappers, strategies that third parties (or future-you) may add.
- You want **decoupling across module or JAR boundaries**, where the consumer must not know its providers.
- You are writing a **library or framework** and want users to extend it without forking it.

**Skip it when:**

- Everything lives in one module and you control all the implementations. A plain `Map`, an enum, or dependency injection is simpler and more obvious.
- You need guaranteed ordering or a single well-defined default. `ServiceLoader` does not promise an order, so you would be fighting the tool.
- The indirection costs more clarity than the flexibility is worth. If there will only ever be two implementations and both are yours, a `switch` is honest.

And a couple of operational notes: providers load lazily, errors during discovery can be easy to miss, and "nothing happened" is the classic SPI failure mode, usually a missing registration. `@AutoService` removes most of that pain, which is why I treat it as the default companion to `ServiceLoader`.

---

## 9. Wrapping up

Java SPI is decoupling baked into the language. The shape never changes: an interface defines a contract, providers implement it, and a consumer discovers them without knowing their names. That same shape powers JDBC drivers you have used for years, the mapper system in a hobby NES emulator, and the extension model of a production framework like Quarkus.

If you take one thing away: the next time you feel yourself reopening the same `switch` to add "just one more type", stop. That is SPI asking to be used. Define the interface, let `ServiceLoader` find the implementations, add `@AutoService` so you never touch a `META-INF` file by hand, and let new behavior plug itself in. Your core code gets to stop changing, which is the whole point.

Slot the cartridge in. The console already knows how to read it.

---

### Sources and further reading

- [Google AutoService](https://github.com/google/auto/tree/main/service) - annotation processor that generates `META-INF/services`
- [ServiceLoader (Java SE 21 API)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ServiceLoader.html)
- [quarkus-langchain4j PR #2563: Allow the system message to depend on the model in use](https://github.com/quarkiverse/quarkus-langchain4j/pull/2563) (merged)
- [quarkus-langchain4j PR #2460: Introduce @OnThinking annotation for reasoning output handlers](https://github.com/quarkiverse/quarkus-langchain4j/pull/2460) (merged)
