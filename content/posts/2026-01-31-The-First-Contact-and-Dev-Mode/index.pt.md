---
title: "O primeiro contato e o Modo de Desenvolvimento do Quarkus"
date: 2026-01-31T10:00:00-03:00
draft: false
tags: ["Java", "Quarkus", "Spring", "Dev Productivity", "Hot Reload", "Quarkus for Spring Developers"]
author: "Matheus Oliveira"
slug: "primeiro-contato-e-o-modo-de-desenvolvimento-do-quarkus"
summary: "O primeiro contato prático: criando sua primeira API e descobrindo por que o Dev Mode do Quarkus muda as regras do jogo para quem vem do Spring."
description: "Aprenda a criar um projeto Quarkus, entenda a estrutura das extensões e experimente o Hot Reload em tempo real, eliminando o tempo de espera por reinicialização."
cover:
  image: "quarkus-dev-mode.png"
  relative: true
---

*Este artigo faz parte de uma série de artigos sobre o livro Quarkus for Spring Developers.*

## O Ponto de Partida: Onde tudo nasce

Tudo começa pelo início, e se no ecossistema Spring o ponto de partida é o **Spring Initializr**, no Quarkus temos o **code.quarkus.io**. Em ambos, o objetivo é selecionar os componentes do seu projeto, mas embora pareçam equivalentes, os conceitos de **Starter** e **Extension** possuem uma diferença fundamental de arquitetura.

## A Diferença de Mentalidade: Starter vs Extension

Um **Spring Boot Starter** atua principalmente como um agregador de dependências. Quando a aplicação sobe, o Spring precisa escanear o classpath, ler anotações e configurar o contexto de injeção de dependência — tudo isso em tempo de execução (**Runtime**).

Já uma **Quarkus Extension** é dividida em duas partes: um módulo de execução (Runtime) e um módulo de **Aumentação (Deployment)**. A grande magia acontece no build: a extensão varre o seu código, processa anotações, lê descritores e já deixa tudo "pré-mastigado" e gravado diretamente no bytecode.

Como o livro destaca, o resultado desse trabalho feito durante o build (**Build-time**) é o que torna o Quarkus incrivelmente rápido e eficiente em termos de memória, pois ele remove a necessidade de reflexão e varredura pesada durante o startup.

### Tabela de Equivalência

| Quarkus Extension | Spring Boot Starter |
| --- | --- |
| `quarkus-resteasy-jackson` | `spring-boot-starter-web` / `spring-boot-starter-webflux` |
| `quarkus-resteasy-reactive-jackson` | `spring-boot-starter-web` / `spring-boot-starter-webflux` |
| `quarkus-hibernate-orm-panache` | `spring-boot-starter-data-jpa` |
| `quarkus-hibernate-orm-rest-data-panache` | `spring-boot-starter-data-rest` |
| `quarkus-hibernate-reactive-panache` | `spring-boot-starter-data-r2dbc` |
| `quarkus-mongodb-panache` | `spring-boot-starter-data-mongodb` / `...-reactive` |
| `quarkus-hibernate-validator` | `spring-boot-starter-validation` |
| `quarkus-qpid-jms` | `spring-boot-starter-activemq` |
| `quarkus-artemis-jms` | `spring-boot-starter-artemis` |
| `quarkus-cache` | `spring-boot-starter-cache` |
| `quarkus-redis-client` | `spring-boot-starter-data-redis` / `...-reactive` |
| `quarkus-mailer` | `spring-boot-starter-mail` |
| `quarkus-quartz` | `spring-boot-starter-quartz` |
| `quarkus-oidc` | `spring-boot-starter-oauth2-resource-server` |
| `quarkus-oidc-client` | `spring-boot-starter-oauth2-client` |
| `quarkus-smallrye-jwt` | `spring-boot-starter-security` |

## Criando uma API: code.quarkus.io vs Spring Initializr

Ao acessar o [gerador de projetos do Quarkus](https://code.quarkus.io/), você notará uma opção que o [Spring Initializr](https://start.spring.io/) ainda não possui: o **Starter Code**. Se você selecionar uma extensão como o **Quarkus REST**, o Quarkus gerará automaticamente um exemplo funcional (`GreetingResource.java`) para que você não comece com uma folha em branco.
Para o nosso exemplo, utilizaremos essa extensão, que é o equivalente ao **Spring Web**.

![Interface do code.quarkus.io com a extensão REST selecionada](code-with-quarkus.png)

Diferente do Spring, no code.quarkus.io você pode visualizar a dependência, ver os comandos de CLI para Maven/Quarkus ou até publicar o projeto diretamente no seu GitHub.

Este será o seu código Quarkus inicial:

```java
package org.acme;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/hello")
public class GreetingResource {

    @GET
    @Produces(MediaType.TEXT_PLAIN)
    public String hello() {
        return "Hello from Quarkus REST";
    }
}
```

### E como fica no Spring Initializr?

No lado do Spring, o processo no [Spring Initializr](https://start.spring.io/) é o que já conhecemos: você seleciona o **Spring Web**, gera o projeto e recebe um arquivo `.zip` contendo apenas a estrutura de pastas e uma classe principal vazia.

![Interface do Spring Iniatializr com Spring Web selecionado](start-spring.png)

Ao contrário do Quarkus, aqui não há o conceito de *Starter Code*. Você terá que criar manualmente o seu `Controller` para ter algo funcional. O seu código no Spring seria assim:

```java
package com.example.demo;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HelloController {

    @GetMapping("/hello")
    public String hello() {
        return "Hello from Spring Web";
    }
}

```

### O choque de realidade: JAX-RS vs Spring Web

Olhando os dois códigos lado a lado, você notará que, embora façam a mesma coisa, as anotações são diferentes. O Quarkus utiliza o padrão **Jakarta REST (JAX-RS)**, enquanto o Spring utiliza suas próprias anotações (Spring Web).

Essa é a primeira grande mudança de "sotaque" que o livro do Eric Deandrea aponta: no Quarkus, estamos mais próximos dos padrões do Jakarta EE, mas com toda a facilidade moderna que o Spring nos trouxe.

## Anatomia de um projeto Quarkus: O que muda no `pom.xml`

### Controle de Versões: O Quarkus BOM

Se você já desenvolveu com Spring antes do Spring Boot, lembra-se da dificuldade de conciliar versões compatíveis de diferentes bibliotecas. O Spring Boot resolveu isso com o seu *Parent POM*.

O Quarkus oferece a mesma facilidade, mas utiliza o conceito de **BOM (Bill of Materials)**. Em vez de herdar obrigatoriamente de um "pai", você importa o `quarkus-bom` na seção `<dependencyManagement>`.

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>${quarkus.platform.group-id}</groupId>
            <artifactId>${quarkus.platform.artifact-id}</artifactId>
            <version>${quarkus.platform.version}</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
```

**Por que isso é útil?**
Ao declarar uma extensão (como o REST) nas suas `<dependencies>`, você **não precisa especificar a versão**. O BOM garante que a versão utilizada é a mais estável para aquela release do Quarkus. Para atualizar seu projeto inteiro, você altera apenas a propriedade `${quarkus.platform.version}` no topo do arquivo.

### Estrutura de Arquivos: O que muda na prática?

A estrutura de pastas de uma aplicação Quarkus é quase idêntica à do Spring Boot, facilitando a vida de quem está migrando. No entanto, existe uma ausência notável: não há uma classe Java com o método `main`. Enquanto o Spring Boot exige uma classe anotada com `@SpringBootApplication` para iniciar o container, o Quarkus não precisa disso, pois ele gerencia a inicialização de forma interna e otimizada.

| Arquivo / Diretório | Descrição no Quarkus | Equivalente ou Diferença no Spring |
| --- | --- | --- |
| **`src/main/docker`** | Já traz Dockerfiles prontos para modo JVM e Nativo. | Geralmente criado do zero pelo desenvolvedor. |
| **`application.properties`** | Centraliza tudo num único arquivo, inclusive perfis. | Comum usar múltiplos arquivos (`application-dev.yml`). |
| **`META-INF/resources`** | Local para arquivos estáticos (Frontend/Index). | Pasta `static` ou `public` dentro de `resources`. |
| **`pom.xml`** | Gerencia extensões e o ciclo de build-time. | Gerencia Starters e o runtime do Spring. |
| **`README.md`** | Instruções automáticas de build e geração nativa. | Geralmente contém apenas a descrição do projeto. |

---

## O Dev Mode: O fim do "Wait for Restart"

Se existe uma funcionalidade que resume a "alegria de desenvolver com Quarkus", é o **Dev Mode**. No Spring, mesmo com o *DevTools*, é comum encararmos restarts lentos conforme o projeto cresce, com aquele log subindo o banner do framework repetidamente.

No Quarkus, basta rodar o comando abaixo:

```bash
./mvnw quarkus:dev
```
### Teste o Live Reload agora

Com o modo dev rodando, acesse `localhost:8080/hello`.

No IDE, mude o retorno para `"Olá Quarkus!"` e salve.

Dê F5 no navegador. A mudança é instantânea!

### O segredo da velocidade: Restart vs Live Reload

Muitos desenvolvedores Spring podem pensar: *"Mas o Spring DevTools já não faz o reload?"*. A diferença é sutil no nome, mas gigante na execução:

* **Spring DevTools (Restart):** Ele utiliza dois *ClassLoaders*. Ao alterar um arquivo, o Spring descarta o carregador do seu código e cria um novo. O problema é que o framework precisa **reiniciar todo o contexto**: re-escanear anotações, remontar o grafo de injeção de dependência e subir o servidor novamente. É um "reboot" otimizado, mas ainda é um reboot.
* **Quarkus (Live Reload):** Graças à arquitetura de **Build-time** que discutimos, o Quarkus já sabe como a sua aplicação é estruturada. Quando você altera uma classe, ele faz o *hot-replacement* apenas do bytecode modificado. **O processo Java nunca morre.** O Quarkus não precisa re-descobrir seus endpoints; ele apenas atualiza o comportamento deles de forma cirúrgica.

## Dev Services: Infraestrutura sob demanda

Se o Live Reload cuida do seu código, o **Dev Services** cuida da sua infraestrutura. No Spring, se você precisa de um banco de dados (PostgreSQL) ou um broker (Kafka), você geralmente precisa configurar um `docker-compose.yaml` manualmente ou instalar o serviço na sua máquina.

No Quarkus, se você tem o Docker (ou Podman) instalado, o fluxo é mágico:

1. Você adiciona a extensão do **PostgreSQL**.
2. Você **não** configura nenhuma URL no `application.properties`.
3. Ao rodar em modo dev, o Quarkus detecta a ausência de configuração e sobe automaticamente um container via **Testcontainers** para você.

Ele configura as portas e as credenciais sozinho. Quando você para o Dev Mode, ele limpa o ambiente. É o conceito de **Zero Config** levado ao extremo.

## Dev UI: O painel de controle da sua aplicação

Enquanto o Spring Boot nos oferece o excelente *Actuator* (focado em métricas JSON para produção), o Quarkus entrega a **Dev UI**: uma interface visual para o desenvolvedor, disponível em `http://localhost:8080/q/dev` durante o modo dev.

![Dev UI](dev-ui.png)

Nela, você pode:

* Visualizar e testar todas as extensões instaladas.
* Alterar configurações do `application.properties` visualmente.
* **Continuous Testing:** Ver o status dos seus testes unitários em tempo real. Se você pressionar `r` no terminal, o Quarkus passa a rodar os testes afetados a cada salvamento de arquivo, dando o feedback instantâneo se a sua última mudança quebrou algo.

## Conclusão

Neste primeiro contato, vimos que o Quarkus não tenta apenas ser "mais um framework". Ele ataca a raiz da perda de produtividade: o tempo de espera. A transição de anotações do Spring Web para o Jakarta REST é o de menos; o que muda o jogo é nunca mais precisar esperar um restart para ver sua alteração no ar.

No próximo artigo, vamos mergulhar em um dos temas favoritos de quem usa Spring: **Injeção de Dependências (CDI vs Spring DI)**. Veremos como o `@Autowired` se comporta no mundo Quarkus.