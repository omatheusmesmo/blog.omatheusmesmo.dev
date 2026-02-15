---
title: "Quarkus Dependency Injection: The Ultimate Guide for Spring Developers"
date: 2026-02-14T10:00:00-03:00
draft: false
tags: ["Quarkus", "Spring", "Java", "CDI", "MicroProfile", "Dependency Injection", "Configuration", "Quarkus for Spring Developers"]
author: "Matheus Oliveira"
slug: "mastering-dependency-injection-configuration-quarkus"
summary: "Understand how Quarkus reinvented Dependency Injection with ArC: zero runtime reflection, instant startup, and flexible configuration."
description: "Learn how Quarkus reinvented Dependency Injection with ArC. A migration guide for Spring Boot developers covering scopes, @Inject, and config profiles."
cover:
  image: "quarkus-di-config.png"
  alt: "Duke mascot in Cuphead style carrying a giant Quarkus injection needle"
  caption: "Injecting performance and efficiency with ArC"
  relative: true
---

*This article is part of a series based on the book "Quarkus for Spring Developers".*

The Java world has changed. If you come from the Spring ecosystem, you are used to a framework that does almost everything at runtime. But Quarkus has arrived to flip the script by introducing the concept of **`Build-time Efficiency`**. In this article, we will dive into the heart of Quarkus: **`ArC`** and its Dependency Injection system, building an order service from scratch.

## Getting to Work: Creating the Project

To start, let's generate our project via the terminal. Note that we have already included the necessary extensions for RESTEasy and the CDI Lite 4.1 support that comes in the Core by default.

### Using Quarkus CLI:
```bash
quarkus create app org.acme:dependency-injection \
    --extension="resteasy" \
    --no-code
```

### Using Maven:

```bash
mvn io.quarkus.platform:quarkus-maven-plugin:3.31.1:create \
    -DprojectGroupId=org.acme \
    -DprojectArtifactId=dependency-injection \
    -Dextensions="resteasy" \
    -DnoCode
```

## Spring DI vs. ArC (Quarkus CDI)

The big difference between the two is not in the syntax, but in *when* the "magic" happens. While Spring uses Reflection at runtime to scan packages, Quarkus uses **`ArC`**.

**`ArC`** analyzes your application during the build, validates dependencies, and generates the necessary bytecode. This means that if you forget to annotate a component or have an ambiguous dependency, the error will appear on your screen before the application even tries to start.

**Tip for Native Executables:** For GraalVM to optimize your application to the fullest, avoid using **`private`**. Use the package-private modifier for injected fields and methods. This eliminates the need for Reflection, making your binary lighter and faster.

## Mapping Beans: The Complete Scope Table

In Quarkus, scopes define the lifecycle of your beans. Here is a direct comparison with what you already know from Spring:

| Quarkus (CDI) | Spring Equivalent | Description |
| --- | --- | --- |
| **`@ApplicationScoped`** | **`@Scope("singleton")`** | Single instance via Proxy (Lazy). Recommended for most cases. |
| **`@Singleton`** | **`@Scope("singleton")`** | Single instance without Proxy (Eager). Created upon injection. |
| **`@RequestScoped`** | **`@Scope("request")`** | An instance associated with the current HTTP request. |
| **`@Dependent`** | **`@Scope("prototype")`** | **Default scope**. A new instance for every injection point. |
| **`@SessionScoped`** | **`@Scope("session")`** | Bound to the HTTP session (requires the **`quarkus-undertow`** extension). |

### Which one to choose: **`@ApplicationScoped`** or **`@Singleton`**?

While both create single instances, always prefer **`@ApplicationScoped`**. Using a **`Client Proxy`** allows Quarkus to better manage the lifecycle, facilitates replacement with mocks in tests, and resolves circular dependencies more elegantly. Use **`@Singleton`** only if you need to squeeze out maximum performance and do not require proxies.

## Implementing our Order Service

Let's create our first Bean. In Spring, you would use **`@Service`**; here, we will use **`@ApplicationScoped`**. Notice we are not using **`private`** on fields to follow the best practices mentioned earlier.

```java
package org.acme;

import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class OrderService {
    
    public String process() {
        return "Order processed successfully!";
    }
}
```

## Dependency Injection: **`@Inject`** and Constructors

Quarkus encourages **constructor injection**. Let's create a **`TaxService`** and inject it into the **`OrderService`**. Notice that because there is only one constructor, the **`@Inject`** annotation becomes optional. Additionally, Quarkus automatically generates the default no-args constructor required for the Proxy.

```java
@ApplicationScoped
public class TaxService {
    public double getRate() {
        return 0.1; // 10% tax
    }
}

@ApplicationScoped
public class OrderService {

    final TaxService taxService; // 'final' fields are allowed in constructor injection

    OrderService(TaxService taxService) {
        this.taxService = taxService;
    }

    public double calculateTotal(double amount) {
        return amount + (amount * taxService.getRate());
    }
}
```

## Dynamic Configuration with **`@ConfigProperty`**

Now, let's make the service dynamic using **`@ConfigProperty`**. Unlike Spring, if you use a qualifier like this on a field, **`@Inject`** is optional!

```java
@ApplicationScoped
public class OrderService {

    final TaxService taxService;

    @ConfigProperty(name = "order.service.fee", defaultValue = "5.0")
    double serviceFee;

    OrderService(TaxService taxService) {
        this.taxService = taxService;
    }

    public double calculateTotal(double amount) {
        double tax = amount * taxService.getRate();
        return amount + tax + serviceFee;
    }
}
```

**Pro Tip:** If you need String-based identifiers for your beans, avoid **`@Named`** (which can cause unwanted ambiguity with the **`@Default`** qualifier) and use **`@Identifier("bean-name")`** instead.

## Managing Environments with Profiles: **`%dev`**, **`%test`**, and **`%prod`**

Finally, let's configure our application to behave differently in each environment without any hassle. Just use prefixes in your **`application.properties`** file:

```properties
# Default value for production (prod)
%prod.order.service.fee=15.0

# Reduced value for development (dev)
%dev.order.service.fee=5.0

# Zero value for unit tests (test)
%test.order.service.fee=0.0

```

---

## Conclusion

Migrating from Spring to Quarkus is a mindset shift toward the Cloud Native world. By moving dependency resolution to build-time with **`ArC`** and adopting **`CDI Lite 4.1`**, we gain applications that start instantly and consume minimal resources.

In this article, we covered creating a project, mapping beans, injecting dependencies, and managing configurations by profile. You now have a solid foundation to build efficient services.

If this guide helped you, **share it with your team** to facilitate your project's technological migration. In the next article, we will dive into **Reactive Programming and Integrated Testing** with Mutiny!