---
title: "Injecao de Dependencia no Quarkus: O Guia Definitivo para Desenvolvedores Spring"
date: 2026-02-14T10:00:00-03:00
draft: false
tags: ["Quarkus", "Spring", "Java", "CDI", "MicroProfile", "Dependency Injection", "Configuração", "Quarkus for Spring Developers"]
author: "Matheus Oliveira"
slug: "dominando-injecao-dependencia-configuracao-quarkus"
summary: "Entenda como o Quarkus reinventou a Injeção de Dependência com ArC: zero reflexão em runtime, inicialização imediata e configuração flexível."
description: "Aprenda como o Quarkus reinventou a Injeção de Dependência com ArC. Um guia de migração para quem vem do Spring Boot: escopos, @Inject e configurações."
cover:
  image: "quarkus-di-config.png"
  alt: "Mascote Duke no estilo Cuphead carregando uma seringa gigante do Quarkus"
  caption: "Injetando performance e eficiência com ArC"
  relative: true
---

*Este artigo faz parte de uma série de artigos sobre o livro Quarkus for Spring Developers.*

O mundo Java mudou. Se você vem do ecossistema Spring, está acostumado com um framework que faz quase tudo em tempo de execução. Mas o Quarkus chegou para virar esse jogo, trazendo o conceito de **`Build-time Efficiency`**. Neste artigo, vamos mergulhar no coração do Quarkus: o **`ArC`** e o seu sistema de Injeção de Dependência, construindo um serviço de pedidos do zero.

## Mãos à obra: Criando o Projeto

Para começar, vamos gerar o nosso projeto via terminal. Note que já incluímos as extensões necessárias para RESTEasy e o suporte ao CDI Lite 4.1 que já vem no Core.

### Usando Quarkus CLI:
```bash
quarkus create app org.acme:injecao-dependencia \
    --extension="resteasy" \
    --no-code
```

### Usando Maven
```bash
mvn io.quarkus.platform:quarkus-maven-plugin:3.31.1:create \
    -DprojectGroupId=org.acme \
    -DprojectArtifactId=injecao-dependencia \
    -Dextensions="resteasy" \
    -DnoCode
```

## Spring DI vs. ArC (Quarkus CDI)

A grande diferença entre os dois não está na sintaxe, mas no momento em que a "mágica" acontece. Enquanto o Spring utiliza reflexão (Reflection) em runtime para escanear pacotes, o Quarkus utiliza o **`ArC`**.

O **`ArC`** analisa sua aplicação durante o build, valida as dependências e gera o bytecode necessário. Isso significa que, se você esquecer de anotar um componente ou tiver uma dependência ambígua, o erro aparecerá na sua tela antes mesmo da aplicação tentar subir.

**Dica para Executáveis Nativos:** Para que o GraalVM otimize ao máximo sua aplicação, evite usar **`private`**. Use o modificador de pacote (package-private) em campos e métodos injetados. Isso elimina a necessidade de Reflection e deixa o seu binário mais leve e rápido.

## Mapeando Beans: A Tabela Completa de Escopos

No Quarkus, os escopos definem o ciclo de vida dos seus beans. Aqui está a comparação direta com o que você já conhece no Spring:

| Quarkus (CDI) | Spring Equivalent | Descrição |
| --- | --- | --- |
| **`@ApplicationScoped`** | **`@Scope("singleton")`** | Instância única via Proxy (Lazy). Recomendado para a maioria dos casos. |
| **`@Singleton`** | **`@Scope("singleton")`** | Instância única sem Proxy (Eager). Criada na injeção. |
| **`@RequestScoped`** | **`@Scope("request")`** | Uma instância associada à requisição HTTP atual. |
| **`@Dependent`** | **`@Scope("prototype")`** | **Escopo padrão**. Nova instância para cada ponto de injeção. |
| **`@SessionScoped`** | **`@Scope("session")`** | Vinculado à sessão HTTP (requer extensão **`quarkus-undertow`**). |

### Qual escolher: **`@ApplicationScoped`** ou **`@Singleton`**?

Embora ambos criem instâncias únicas, prefira sempre o **`@ApplicationScoped`**. O uso de um **`Client Proxy`** permite que o Quarkus gerencie melhor o ciclo de vida, facilite a substituição por mocks em testes e resolva dependências circulares de forma mais elegante. Use **`@Singleton`** apenas se precisar espremer o máximo de performance e não precisar de proxies.

## Implementando o nosso Serviço de Pedidos

Vamos criar o nosso primeiro Bean. No Spring, você usaria **`@Service`**, aqui usaremos **`@ApplicationScoped`**. Repare que não usamos **`private`** nos campos para seguir as boas práticas que comentamos.

```java
package org.acme;

import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class OrderService {
    
    public String process() {
        return "Pedido processado com sucesso!";
    }
}
```

## Injeção de Dependências: **`@Inject`** e Construtores

O Quarkus incentiva a **injeção via construtor**. Vamos criar um **`TaxService`** e injetá-lo no **`OrderService`**. Repare que, por haver apenas um construtor, a anotação **`@Inject`** torna-se opcional. Além disso, o Quarkus gera o construtor padrão necessário para o Proxy automaticamente.

```java
@ApplicationScoped
public class TaxService {
    public double getRate() {
        return 0.1;
    }
}

@ApplicationScoped
public class OrderService {

    final TaxService taxService; // Campos 'final' são permitidos em injeção por construtor

    OrderService(TaxService taxService) {
        this.taxService = taxService;
    }

    public double calculateTotal(double amount) {
        return amount + (amount * taxService.getRate());
    }
}
```

## Configuração Dinâmica com **`@ConfigProperty`**

Agora, vamos tornar o serviço dinâmico usando o **`@ConfigProperty`**. Diferente do Spring, se você usa um qualificador como este em um campo, o **`@Inject`** é opcional!

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

**Dica Pro:** Se precisar de identificadores baseados em String para seus beans, evite o **`@Named`** (que pode causar ambiguidades com o qualificador **`@Default`**) e utilize o **`@Identifier("nome-do-bean")`**.

## Gerindo Ambientes com Profiles: **`%dev`**, **`%test`** e **`%prod`**

Para finalizar, vamos configurar nossa aplicação para se comportar de forma diferente em cada ambiente sem complicação. Basta usar prefixos no seu arquivo **`application.properties`**:

```properties
# Valor padrão para produção (prod)
%prod.order.service.fee=15.0

# Valor reduzido para desenvolvimento (dev)
%dev.order.service.fee=5.0

# Valor zerado para testes unitários (test)
%test.order.service.fee=0.0
```
---

## Conclusão

Migrar do Spring para o Quarkus é uma mudança de mentalidade para o mundo Cloud Native. Ao mover a resolução de dependências para o tempo de build com o **`ArC`** e adotar o **`CDI Lite 4.1`**, ganhamos aplicações que iniciam instantaneamente e consomem o mínimo de recursos.

Neste artigo, vimos como criar um projeto, mapear beans, injetar dependências e gerir configurações por perfil. Agora você já tem uma base sólida para construir serviços eficientes.

Se esse guia te ajudou, **compartilhe com seu time** para facilitar a migração tecnológica do projeto. No próximo artigo, vamos mergulhar em **Programação Reativa e Testes Integrados** com Mutiny!