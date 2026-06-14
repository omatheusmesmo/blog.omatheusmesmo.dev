---
title: "Java SPI: o superpoder embutido que todo desenvolvedor deveria conhecer"
date: 2026-06-13T10:00:00-03:00
draft: false
tags: ["Java", "SPI", "ServiceLoader", "Service Provider Interface", "AutoService", "JPMS", "Java Modules", "Quarkus", "CDI", "Padrões de Projeto", "Open Closed Principle", "Plugins", "Emulador NES", "Build Time"]
author: "Matheus Oliveira"
slug: "java-spi-serviceloader-poder"
summary: "Existe um sistema de plugins escondido dentro do JDK que a maioria dos desenvolvedores nunca usa de propósito. O Java SPI (ServiceLoader) deixa você adicionar comportamento sem tocar no código que o consome. Mostro com código real do meu emulador de NES, mato o frágil arquivo META-INF com o Google AutoService, cubro a variante moderna com JPMS e fecho com a forma como o Quarkus faz a mesma ideia em tempo de build."
description: "Um guia prático sobre o Service Provider Interface (SPI) do Java. Aprenda ServiceLoader do zero com código real do sistema de mappers de um emulador de NES, substitua o arquivo manual META-INF/services pelo Google AutoService, declare serviços com module-info do JPMS e veja como o Quarkus troca o ServiceLoader em runtime por descoberta de beans CDI em tempo de build."
cover:
  image: "java-spi-serviceloader-cover.png"
  alt: "Pixel art estilo NES: um console retrô com vários cartuchos flutuando acima do slot, cada cartucho rotulado como um plugin (NROM, MMC1, MMC3), e um rótulo brilhante 'ServiceLoader' no console lendo todos automaticamente"
  caption: "Providers plugados como cartuchos de NES: o console (ServiceLoader) descobre o que você encaixa"
  relative: true
---

Pense no método mais feio que você escreveu este ano. Aposto que ele se parece com isto: um `switch` gigante que ganha um `case` novo toda vez que o time de produto inventa um "tipo" novo. Um novo provedor de pagamento, um novo formato de exportação, um novo dispositivo. Cada um significa abrir o mesmo arquivo, adicionar mais um ramo e torcer para não ter quebrado os outros.

Agora imagine o oposto. Você joga uma classe nova no projeto, não toca em uma única linha do código que a usa, e o comportamento novo simplesmente aparece. Sem registro para atualizar, sem factory para editar, sem `if` para estender.

Isso não é um framework. Não é uma biblioteca que você precisa instalar. Está dentro do JDK desde o Java 6 e se chama **SPI: o Service Provider Interface**, movido por uma classe chamada `ServiceLoader`. Neste artigo vamos passar por tudo, passo a passo e em termos simples: o que é SPI, como usar com código real do meu emulador de NES, como parar de editar à mão aquele arquivo frágil do `META-INF`, como ele fica no sistema de módulos moderno do Java e, por fim, como um framework moderno como o Quarkus pega a mesma ideia e a torna ainda mais poderosa. Vamos.

> **Testado com**
> Java 17 (o emulador de NES) e Java 25 para os exemplos isolados · Maven 3.9 · Google AutoService 1.1.1 · Quarkus 3.x (quarkus-langchain4j)

---

## 1. O problema: código que você fica reabrindo

Digamos que você esteja construindo algo que precisa lidar com muitas variações "da mesma coisa". No meu caso é um emulador de NES. Um cartucho de NES não é só ROM: ele contém um chip chamado **mapper**, que decide como o console enxerga a memória do cartucho. Existem dezenas deles. O Mapper 0 (NROM) é o simples. O Mapper 1 (MMC1) e o Mapper 4 (MMC3) adicionam troca de bancos de memória e outros truques. O cabeçalho da ROM diz com qual número você está lidando.

A solução ingênua se escreve sozinha:

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

Funciona. Mas cada mapper novo me obriga a voltar para este método. A classe que constrói mappers tem que conhecer todos os mappers que existem. Isso é acoplamento forte, e viola silenciosamente o **Princípio Aberto/Fechado** (Open/Closed): o código deveria estar aberto para extensão e fechado para modificação. Aqui ele está fechado para extensão e escancarado para modificação, exatamente ao contrário.

O que eu realmente quero: adicionar um mapper adicionando uma classe, e nunca mais reabrir o construtor.

---

## 2. O que SPI é de verdade

SPI é um mecanismo de plugins baseado em contrato embutido na linguagem. Ele tem três papéis, e tudo se encaixa quando você consegue nomeá-los:

- **O serviço** é uma interface (ou classe abstrata). É o contrato: "qualquer coisa que queira ser uma factory de mapper precisa implementar isto".
- **O provider** é uma classe concreta que implementa o serviço. Cada provider é um plugin.
- **O consumidor** pede ao `java.util.ServiceLoader` todos os providers que ele conseguir encontrar no classpath, sem nomear nenhum deles.

A mágica está nesse último ponto. O consumidor depende só da interface. Ele nunca importa uma única implementação concreta. Providers novos podem vir do seu próprio código, de outro módulo ou de um JAR de terceiro que você jogou no classpath, e o consumidor os encontra do mesmo jeito.

Você já usa isso todos os dias sem perceber:

- **JDBC.** Você nunca chama `new PostgresDriver()`. O JAR do PostgreSQL traz um provider, e o `DriverManager` o encontra via SPI.
- **SLF4J / logging.** O binding que você coloca no classpath é descoberto, não fixado no código.
- **Formatação do `java.time`, charset providers, engines de scripting, JSON-P e a maioria dos annotation processors** usam o mesmo mecanismo.

Então SPI não é exótico. É a maquinaria silenciosa por baixo de boa parte do ecossistema Java. A sacada é usá-lo de propósito, no seu próprio código.

---

## 3. ServiceLoader na prática: o sistema de mappers do NES

Veja como o problema dos mappers fica quando o SPI assume o controle. Este é código real do meu [emulador de NES SelfMat](https://github.com/omatheusmesmo/SelfMat-NES-Emulator), não um brinquedo.

Primeiro, o **serviço**: o contrato que uma factory de mapper precisa honrar.

```java
public interface MapperFactory {

    int getSupportedMapperNumber();

    Mapper create(int prgRomSizeBytes, int chrDataSizeBytes, boolean isVerticalMirroring);
}
```

Dois métodos: "qual número de mapper você atende?" e "construa uma instância para mim". É esse o ponto de extensão por inteiro.

Em seguida, o **consumidor**: um manager que pede ao `ServiceLoader` cada `MapperFactory` do classpath e os indexa por número de mapper.

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

Releia o bloco `static` e repare no que está faltando: não existe uma lista de mappers. O `ServiceLoader.load(MapperFactory.class)` devolve algo que você pode iterar, e cada volta do laço entrega um provider que ele descobriu. O manager monta um `Map<Integer, MapperFactory>` a partir do que existir. Ele não importa `NRomMapper`, `MMC1Mapper`, nem nenhuma factory concreta.

Por fim, um **provider**:

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

Agora a recompensa. Para suportar um mapper totalmente novo, digamos o Mapper 7, eu escrevo `AxRomFactory implements MapperFactory`, registro como provider, e acabou. O `MapperManager` nunca muda. O `switch` da seção 1 sumiu, e com ele o acoplamento. Isso é o Princípio Aberto/Fechado, garantido pelo runtime em vez de pela disciplina.

Tem uma peça que passei por cima: como o `ServiceLoader` sabe que `NRomFactory` existe? Essa é a próxima seção, e é onde a maioria das pessoas encontra atrito pela primeira vez.

---

## 4. O atrito: aquele arquivo META-INF/services

O `ServiceLoader` não varre seu classpath inteiro procurando implementadores. Isso seria lento e imprevisível. Em vez disso, cada JAR de provider declara seus providers em um arquivo de texto puro, sob um caminho rígido:

```
src/main/resources/META-INF/services/dev.omatheusmesmo.selfmat.nes.emulator.core.rom.mappers.factory.MapperFactory
```

O nome do arquivo é o **nome totalmente qualificado da interface do serviço**. O conteúdo são os nomes totalmente qualificados das implementações, um por linha:

```
dev.omatheusmesmo.selfmat.nes.emulator.core.rom.mappers.factory.NRomFactory
dev.omatheusmesmo.selfmat.nes.emulator.core.rom.mappers.factory.MMC1Factory
dev.omatheusmesmo.selfmat.nes.emulator.core.rom.mappers.factory.MMC3Factory
```

Funciona, e por muito tempo foi o único jeito. Mas veja no que você está se metendo. É um arquivo de texto mantido à mão, cheio de nomes de classe como strings que o compilador nunca verifica. Renomeie um pacote e sua ferramenta de refactor deixa silenciosamente este arquivo apontando para uma classe que não existe mais. Esqueça de adicionar uma linha e seu provider novo simplesmente nunca carrega, sem erro, sem aviso, sem nada. Você só percebe que uma funcionalidade está faltando. É o tipo de bug que come uma tarde inteira.

Existe um jeito melhor, e ele custa quase nada.

---

## 5. Matando o arquivo manual com o Google AutoService

O [Google AutoService](https://github.com/google/auto/tree/main/service) é um annotation processor minúsculo com um único trabalho: gerar aquele arquivo `META-INF/services` para você, em tempo de compilação, a partir de uma anotação. Você anota o provider, e o arquivo se escreve sozinho.

Aqui está o mesmo `NRomFactory`, a versão que de fato roda no meu emulador:

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

Essa única linha, `@AutoService(MapperFactory.class)`, é a mudança inteira. Durante a compilação, o processor vê a anotação e emite a entrada correta em `META-INF/services` na saída do build. Sem arquivo escrito à mão, sem erros de digitação, e os refactors continuam seguros porque a anotação referencia `MapperFactory.class` diretamente, algo que o compilador verifica de verdade.

A configuração no Maven tem duas partes: as anotações no classpath de compilação e o processor no caminho de annotation processor. É exatamente o que o emulador usa:

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

Agora adicionar um mapper novo é genuinamente um passo: escrever a classe da factory, anotar, buildar. O registro vira um subproduto da compilação. Essa é a combinação que eu escolheria hoje em qualquer sistema de plugins em Java puro: `ServiceLoader` para a descoberta e `@AutoService` para remover a única parte frágil.

---

## 6. SPI no sistema de módulos (JPMS)

Tudo acima vive no mundo do classpath, e é o que o meu emulador usa. Mas se o seu projeto for modularizado com o Java Platform Module System (Java 9 em diante), o SPI ganha uma sintaxe de primeira classe e type-safe. Quero mostrar porque é genuinamente mais agradável, com uma ressalva honesta: **não foi isto que fiz no emulador de NES** (o emulador é um projeto de classpath). Trate esta seção como a variante moderna que você deveria saber que existe.

Em vez de um arquivo de texto, você declara serviços e providers direto no `module-info.java`. O módulo do provider diz o que oferece:

```java
module nes.mappers.mmc {
    requires nes.core;
    provides dev.omatheusmesmo.nes.spi.MapperFactory
        with dev.omatheusmesmo.nes.mappers.MMC1Factory,
             dev.omatheusmesmo.nes.mappers.MMC3Factory;
}
```

E o módulo consumidor declara que usa o serviço:

```java
module nes.core {
    exports dev.omatheusmesmo.nes.spi;
    uses dev.omatheusmesmo.nes.spi.MapperFactory;
}
```

`provides ... with ...` e `uses ...` são verificados pelo compilador: os nomes são tipos reais, não strings, então uma referência ruim quebra o build em vez de falhar silenciosamente em runtime. O código do consumidor não muda, você continua chamando `ServiceLoader.load(MapperFactory.class)`, mas agora a fiação faz parte do descritor do módulo e respeita o encapsulamento forte.

Já que estamos aqui, duas conveniências do `ServiceLoader` que a API de stream moderna te dá, independente de classpath ou módulos:

```java
// Percorre os providers de forma lazy sem instanciar os que você pula:
Optional<MapperFactory> mapper0 = ServiceLoader.load(MapperFactory.class)
        .stream()
        .map(ServiceLoader.Provider::get)
        .filter(f -> f.getSupportedMapperNumber() == 0)
        .findFirst();
```

O `ServiceLoader.Provider::get` é o que de fato instancia um provider, então filtrar pelo `Provider` antes de chamar `get()` deixa você pular a construção de objetos que não precisa. Vale lembrar: providers são carregados de forma lazy e a ordem deles não é garantida, então nunca escreva código que assuma "o primeiro é o padrão".

---

## 7. O próximo nível: como o Quarkus faz SPI por você

O SPI puro é ótimo, mas tem um custo em runtime: o `ServiceLoader` varre e instancia enquanto sua aplicação está rodando. Para um emulador de NES desktop isso é irrelevante. Para um serviço na nuvem que quer subir em milissegundos e compilar para um binário nativo, varredura em runtime e reflexão são exatamente as coisas que você quer evitar.

É aqui que um framework moderno muda o jogo. O [Quarkus](https://quarkus.io/) mantém a *ideia* do SPI, um núcleo que define pontos de extensão e providers que se plugam neles, mas resolve a fiação em **tempo de build** através da descoberta de beans CDI, em vez de em runtime através do `ServiceLoader`. Você define uma interface, expõe implementações como beans CDI, e o framework descobre e conecta tudo enquanto constrói sua aplicação. Sem `META-INF/services` para manter, sem varredura de classpath em runtime, e o resultado é compatível com native image porque tudo é conhecido antes da app iniciar.

Esbarrei nisso de forma concreta contribuindo com a extensão [quarkus-langchain4j](https://github.com/quarkiverse/quarkus-langchain4j). Uma feature que construí e que foi mergeada (o [PR #2563](https://github.com/quarkiverse/quarkus-langchain4j/pull/2563)) permite que a system message enviada a uma LLM dependa de qual modelo está em uso. A forma limpa de expressar isso é uma SPI, e a lição de design vale mais que a própria feature: **como adicionar uma capacidade a uma interface já lançada sem quebrar todo mundo que já a implementa?**

A resposta *não* foi adicionar um método à interface existente. Isso forçaria toda implementação existente a mudar. Em vez disso, a nova capacidade virou uma segunda interface, separada, e o implementador escolhe a de que precisa:

```java
// Existente, já lançada: intacta.
public interface SystemMessageProvider extends BaseSystemMessageProvider {
    Optional<String> getSystemMessage(Object memoryId);
}

// Nova, ciente do modelo. Você implementa esta se precisa do contexto extra.
public interface SystemMessageProviderWithContext extends BaseSystemMessageProvider {
    Optional<String> getSystemMessage(InvocationContext context);
}
```

O `InvocationContext` carrega qual provider e qual modelo estão prestes a ser chamados, então adaptar o prompt por modelo é só um `if` com fallback:

```java
@Override
public Optional<String> getSystemMessage(InvocationContext context) {
    if (context.modelProvider() == ModelProvider.OPEN_AI) {
        return Optional.of("You are a helpful assistant. Be concise.");
    }
    return Optional.of("You are a helpful assistant.");
}
```

Você implementa uma interface ou a outra, nunca as duas, e o Quarkus descobre sua implementação como um bean e despacha para a que você forneceu. Uma feature mergeada relacionada, o handler [`@OnThinking`](https://github.com/quarkiverse/quarkus-langchain4j/pull/2460) para saída de raciocínio, segue o mesmo formato: define um ponto de plugue, deixa o usuário fornecer um handler, conecta tudo em tempo de build.

A lição que atravessa frameworks: quando o núcleo precisa de um comportamento que só uma peça externa pode fornecer, não acople o núcleo à implementação e não recorra à reflexão em runtime. Defina uma SPI, deixe as implementações se plugarem e resolva a conexão o mais cedo que conseguir. O Java puro faz isso com `ServiceLoader`; o Quarkus faz com CDI em tempo de build. Mesmo princípio, teto diferente.

---

## 8. Quando usar SPI, e quando não usar

SPI é uma ferramenta afiada, o que significa que ela tem um tamanho certo.

**Use quando:**

- Você está construindo um **ponto de plugin ou extensão**: drivers, handlers de formato, mappers, estratégias que terceiros (ou o você do futuro) possam adicionar.
- Você quer **desacoplamento através de fronteiras de módulo ou JAR**, onde o consumidor não pode conhecer seus providers.
- Você está escrevendo uma **biblioteca ou framework** e quer que os usuários a estendam sem fazer fork.

**Evite quando:**

- Tudo vive em um único módulo e você controla todas as implementações. Um `Map` simples, um enum ou injeção de dependência são mais simples e mais óbvios.
- Você precisa de ordem garantida ou de um único padrão bem definido. O `ServiceLoader` não promete ordem, então você estaria brigando com a ferramenta.
- A indireção custa mais clareza do que a flexibilidade vale. Se só vão existir duas implementações e ambas são suas, um `switch` é honesto.

E algumas notas operacionais: providers carregam de forma lazy, erros durante a descoberta podem passar despercebidos, e "nada aconteceu" é o modo de falha clássico do SPI, geralmente um registro faltando. O `@AutoService` remove a maior parte dessa dor, e é por isso que eu o trato como o companheiro padrão do `ServiceLoader`.

---

## 9. Fechando

O Java SPI é desacoplamento embutido na linguagem. O formato nunca muda: uma interface define um contrato, providers a implementam, e um consumidor os descobre sem conhecer seus nomes. Esse mesmo formato move os drivers JDBC que você usa há anos, o sistema de mappers de um emulador de NES feito por hobby e o modelo de extensão de um framework de produção como o Quarkus.

Se você levar uma coisa daqui: da próxima vez que sentir que está reabrindo o mesmo `switch` para adicionar "só mais um tipo", pare. É o SPI pedindo para ser usado. Defina a interface, deixe o `ServiceLoader` encontrar as implementações, adicione `@AutoService` para nunca mais tocar num arquivo `META-INF` à mão, e deixe o comportamento novo se plugar sozinho. Seu código de núcleo para de mudar, que é o ponto inteiro.

Encaixe o cartucho. O console já sabe como lê-lo.

---

### Fontes e leitura adicional

- [Google AutoService](https://github.com/google/auto/tree/main/service) - annotation processor que gera o `META-INF/services`
- [ServiceLoader (API do Java SE 21)](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ServiceLoader.html)
- [quarkus-langchain4j PR #2563: Allow the system message to depend on the model in use](https://github.com/quarkiverse/quarkus-langchain4j/pull/2563) (mergeado)
- [quarkus-langchain4j PR #2460: Introduce @OnThinking annotation for reasoning output handlers](https://github.com/quarkiverse/quarkus-langchain4j/pull/2460) (mergeado)
