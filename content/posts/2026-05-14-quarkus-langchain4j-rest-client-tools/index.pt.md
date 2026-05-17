---
title: "Agents com Tools no Quarkus LangChain4j: Quando o REST Client Vira a Mão Direita da LLM"
date: 2026-05-14T10:00:00-03:00
draft: false
tags: ["Quarkus", "LangChain4j", "Java", "AI", "Agent", "Function Calling", "REST Client", "Ollama"]
author: "Matheus Oliveira"
slug: "agents-ai-tools-quarkus-langchain4j"
summary: "Crie um agente AI que chama APIs REST reais como tools, sem escrever orquestração nenhuma. REST Client + @Tool = tool automática. A LLM decide quando chamar, qual chamar e com quais argumentos. Tudo local com Ollama via Dev Services, zero API key."
description: "Tutorial end-to-end de agents com tools no Quarkus LangChain4j. Crie um agente meteorologista que usa APIs de geocoding e previsão do tempo como tools via REST Client, rodando 100% local com Ollama e Dev Services."
cover:
  image: "quarkus-langchain4j-rest-client-tools-cover.png"
  alt: "Pixel art SNES de um robô mago com capa vermelha segurando ferramentas flutuantes de clima e geocoding, com runas de código ao fundo"
  caption: "A LLM orquestra, o REST Client executa, você só declara as tools"
  relative: true
---

Você já ouviu falar de "agents com tools" e pensou que era coisa de framework Python? Boa notícia: no Quarkus LangChain4j, seu REST Client vira tool automaticamente. Uma anotação. É isso.

Neste artigo, vamos criar do zero um agente meteorologista que recebe perguntas em linguagem natural, consulta APIs REST reais de geocoding e previsão do tempo, e responde em linguagem natural. Tudo isso com 5 arquivos + 4 records e um `application.properties`. Sem banco de dados, sem boilerplate, sem orquestração manual. E o melhor: **rodando 100% local com Ollama**, sem API key, sem custo, sem depender de nuvem.

---

## 1. O Que São Agents com Tools?

Um **agent** é um AI Service que tem acesso a **tools**, ou métodos que a LLM pode invocar durante uma conversa para buscar dados, executar ações ou fazer cálculos.

O conceito-chave é simples: em vez de a LLM apenas gerar texto, ela pode **decidir chamar uma tool**, passar os argumentos, receber o resultado, e então formular a resposta final. Tudo autonomamente.

Pense nisso como dar à LLM um canivete suíço de ferramentas. Você define quais ferramentas estão disponíveis e o que cada uma faz. A LLM decide quando usá-las.

O Quarkus LangChain4j abstrai toda a complexidade desse processo: ele gera automaticamente os prompts do sistema com as descrições das tools, invoca os métodos quando a LLM solicita, e retorna os resultados de volta à LLM para que ela continue raciocinando.

---

## 2. O Conceito-Chave: REST Client + @Tool = Tool Automática

No Quarkus, você já conhece o padrão do REST Client: uma interface anotada com `@RegisterRestClient` que representa uma API remota. Você define os endpoints, os parâmetros, e o Quarkus gera a implementação.

A mágica do Quarkus LangChain4j é que **essa mesma interface pode ser uma tool da LLM**. Basta adicionar `@Tool` no método. Pronto. O Quarkus registra automaticamente esse REST Client como uma ferramenta disponível ao agente.

```java
@RegisterRestClient(configKey = "openmeteo")
@Path("/v1")
public interface WeatherForecastService {

    @GET
    @Path("/forecast")
    @Tool("Forecasts the weather for the given latitude and longitude")
    WeatherForecast forecast(
        @RestQuery @P("Latitude of the location") double latitude,
        @RestQuery @P("Longitude of the location") double longitude);
}
```

Duas anotações na mesma interface. `@RegisterRestClient` para o Quarkus REST Client. `@Tool` para o LangChain4j. O Quarkus faz a ponte. A LLM decide quando chamar.

Repare no `@P`: ele descreve o parâmetro para a LLM. Sem ele, a LLM só vê o nome do parâmetro (`latitude`, `longitude`). Com ele, a LLM entende o que cada parâmetro significa, o que melhora a precisão do function calling.

**Quem orquestra é a LLM, não você.** Ela decide qual tool chamar, em qual ordem, e com quais argumentos. Você só declara as ferramentas disponíveis.

---

## 3. O Caso de Uso: Agente Meteorologista

Nosso agente vai:

1. Receber perguntas como "Qual a previsão para São Paulo?"
2. Usar a API de geocoding (Nominatim) para obter latitude e longitude da cidade
3. Usar a API Open-Meteo para obter a previsão do tempo
4. Responder em linguagem natural, em até 3 linhas
5. Recusar perguntas que não são sobre clima (guardrail de input)

Ambas as APIs são públicas e gratuitas, sem API key necessária.

### APIs Externas

- **Nominatim Geocoding**: `GET https://nominatim.openstreetmap.org/v1/search?name=Paris&count=1` (retorna lat/lon)
- **Open-Meteo Forecast**: `GET https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&daily=temperature_2m_max,...&forecast_days=1` (retorna previsão)

---

## 4. Criando o Projeto

Vamos usar o Quarkus CLI para criar o projeto com as extensões necessárias:

```bash
quarkus create app io.quarkiverse.langchain4j.weather:weather-forecast-agent:1.0.0-SNAPSHOT \
  -x=quarkus-rest-jackson,quarkus-rest-client-jackson,quarkus-cache \
  --no-code \
  --maven
```

Isso cria o projeto com:

- `quarkus-rest-jackson`, para endpoints REST com suporte a JSON
- `quarkus-rest-client-jackson`, para REST Client com suporte a JSON
- `quarkus-cache`, para cache e evitar chamadas repetidas ao geocoding

### Adicionando o Quarkus LangChain4j

O Quarkus LangChain4j é uma extensão do Quarkiverse, não faz parte do BOM do Quarkus Platform. Por isso, precisamos declarar sua versão separadamente. A melhor forma é importar o BOM do próprio Quarkiverse LangChain4j no `dependencyManagement`:

```xml
<properties>
  <quarkus-langchain4j.version>1.10.0</quarkus-langchain4j.version>
</properties>

<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>io.quarkus.platform</groupId>
      <artifactId>quarkus-bom</artifactId>
      <version>${quarkus.platform.version}</version>
      <type>pom</type>
      <scope>import</scope>
    </dependency>
    <dependency>
      <groupId>io.quarkiverse.langchain4j</groupId>
      <artifactId>quarkus-langchain4j-bom</artifactId>
      <version>${quarkus-langchain4j.version}</version>
      <type>pom</type>
      <scope>import</scope>
    </dependency>
  </dependencies>
</dependencyManagement>
```

E então adicionamos a dependência do provider Ollama **sem versionar** (o BOM cuida disso):

```xml
<dependency>
  <groupId>io.quarkiverse.langchain4j</groupId>
  <artifactId>quarkus-langchain4j-ollama</artifactId>
</dependency>
```

> **Por que Ollama e não OpenAI?** O Quarkus LangChain4j suporta vários providers (OpenAI, Ollama, HuggingFace, etc.). Escolhemos Ollama porque permite rodar a LLM localmente, sem API key e sem custo. E com os Dev Services do Quarkus, o container Ollama sobe automaticamente em dev mode, zero configuração manual.

O POM completo está no [GitHub](https://github.com/omatheusmesmo/weather-forecast-agent). As partes relevantes são o BOM e as dependências, que já mostramos acima. O resto é boilerplate do `quarkus create`.

---

## 5. Arquivo 1: GeoCodingService. O REST Client Que É Tool

Vamos começar pelo geocoding. Essa é a tool que converte um nome de cidade em latitude e longitude.

```java
package io.quarkiverse.langchain4j.weather.agent.geo;

import dev.langchain4j.agent.tool.P;
import dev.langchain4j.agent.tool.Tool;
import io.quarkus.cache.CacheResult;
import io.quarkus.rest.client.reactive.ClientQueryParam;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;
import org.jboss.resteasy.reactive.RestQuery;

@RegisterRestClient(configKey = "geocoding")
@Path("/v1")
public interface GeoCodingService {

    @GET
    @Path("/search")
    @CacheResult(cacheName = "geo-results")
    @ClientQueryParam(name = "count", value = "1")
    @Tool("Finds the latitude and longitude of a given city")
    GeoResults search(
        @RestQuery @P("City name to search for, e.g. 'São Paulo' or 'Paris'")
        String name);
}
```

Vamos destrinchar cada anotação:

| Anotação | Papel |
|:---|:---|
| `@RegisterRestClient(configKey = "geocoding")` | Registra como REST Client do Quarkus. A URL base vem do `application.properties` via `quarkus.rest-client.geocoding.url` |
| `@Path("/v1")` | Path base da API Nominatim |
| `@GET @Path("/search")` | Mapeia o endpoint GET `/v1/search` |
| `@CacheResult(cacheName = "geo-results")` | Cache do Quarkus. Se já buscamos "São Paulo", não chamamos a API de novo |
| `@ClientQueryParam(name = "count", value = "1")` | Adiciona `?count=1` automaticamente em toda request, limitando a 1 resultado |
| `@Tool("Finds the latitude and longitude of a given city")` | **A mágica.** Registra esse método como tool disponível à LLM. A descrição é o que a LLM lê para decidir quando usar |
| `@P("City name to search for, e.g. 'São Paulo' or 'Paris'")` | Descreve o parâmetro para a LLM. Sem ele, a LLM só vê `name`. Com ele, a LLM entende que espera um nome de cidade |

O `@Tool` é a ponte. O Quarkus LangChain4j lê a descrição do `@Tool`, os nomes e descrições dos parâmetros (via `@P`), e o tipo de retorno (`GeoResults`), e constrói automaticamente o schema de function calling que a LLM espera.

### Os Records de Resposta

```java
package io.quarkiverse.langchain4j.weather.agent.geo;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record GeoResult(
    double lat,
    double lon,
    String name
) {}
```

```java
package io.quarkiverse.langchain4j.weather.agent.geo;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record GeoResults(
    List<GeoResult> results
) {}
```

Usamos `@JsonIgnoreProperties(ignoreUnknown = true)` para garantir que mudanças na API externa não quebrem nossa desserialização. Records do Java são perfeitos aqui: imutáveis, concisos, e com suporte nativo a Jackson.

---

## 6. Arquivo 2: WeatherForecastService. Outro REST Client Que É Tool

Agora a tool de previsão do tempo. Mesmo padrão: REST Client + @Tool.

```java
package io.quarkiverse.langchain4j.weather.agent.weather;

import dev.langchain4j.agent.tool.P;
import dev.langchain4j.agent.tool.Tool;
import io.quarkus.rest.client.reactive.ClientQueryParam;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;
import org.jboss.resteasy.reactive.RestQuery;

@RegisterRestClient(configKey = "openmeteo")
@Path("/v1")
public interface WeatherForecastService {

    @GET
    @Path("/forecast")
    @Tool("Forecasts the weather for the given latitude and longitude")
    @ClientQueryParam(name = "forecast_days", value = "1")
    @ClientQueryParam(name = "daily", value = {
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_sum",
        "wind_speed_10m_max",
        "weather_code"
    })
    WeatherForecast forecast(
        @RestQuery @P("Latitude of the location") double latitude,
        @RestQuery @P("Longitude of the location") double longitude);
}
```

Repare nos múltiplos `@ClientQueryParam`. Cada um adiciona um query parameter fixo em toda request. Isso nos dá controle sobre quais campos a API retorna, sem depender da LLM para passar esses parâmetros. A LLM só precisa passar `latitude` e `longitude`, os parâmetros dinâmicos. Os fixos ficam encapsulados no REST Client.

Os `@P` nos parâmetros `latitude` e `longitude` explicam à LLM que se trata de coordenadas geográficas. Mesmo que os nomes sejam autoexplicativos, a descrição remove qualquer ambiguidade.

Os records de resposta:

```java
package io.quarkiverse.langchain4j.weather.agent.weather;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record WeatherForecast(
    double latitude,
    double longitude,
    DailyWeather daily
) {}
```

```java
package io.quarkiverse.langchain4j.weather.agent.weather;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record DailyWeather(
    @JsonProperty("temperature_2m_max") List<Double> maxTemperature,
    @JsonProperty("temperature_2m_min") List<Double> minTemperature,
    @JsonProperty("precipitation_sum") List<Double> precipitation,
    @JsonProperty("wind_speed_10m_max") List<Double> windSpeed,
    @JsonProperty("weather_code") List<Integer> weatherCode
) {}
```

Usamos `@JsonProperty` para mapear os campos em snake_case da API para camelCase no Java. Cada campo é uma lista porque a API Open-Meteo retorna arrays diários, mesmo com `forecast_days=1`, o formato é um array de um elemento.

---

## 7. Arquivo 3: WeatherForecastAgent. O AI Service Que Orquestra

Aqui está o agente. Uma interface. Sem implementação. O Quarkus LangChain4j gera tudo.

```java
package io.quarkiverse.langchain4j.weather.agent;

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.guardrail.InputGuardrails;
import io.quarkiverse.langchain4j.RegisterAiService;
import io.quarkiverse.langchain4j.weather.agent.geo.GeoCodingService;
import io.quarkiverse.langchain4j.weather.agent.weather.WeatherForecastService;

@RegisterAiService(tools = {GeoCodingService.class, WeatherForecastService.class})
@InputGuardrails(WeatherTopicGuardrail.class)
public interface WeatherForecastAgent {

    @SystemMessage("""
        You are a meteorologist, and you need to answer questions
        asked by the user about weather using at most 3 lines.
        If the question is not about weather, politely decline to answer.
        The weather information is a JSON object and has the following fields:
        maxTemperature is the maximum temperature of the day in Celsius degrees
        minTemperature is the minimum temperature of the day in Celsius degrees
        precipitation is the amount of water in mm
        windSpeed is the speed of wind in kilometers per hour
        weather is the overall weather.
        """)
    String chat(String message);
}
```

Vamos destrinchar:

| Elemento | Papel |
|:---|:---|
| `@RegisterAiService(tools = {...})` | Registra como AI Service CDI bean. O atributo `tools` declara quais tools a LLM pode usar (nesse caso, nossos dois REST Clients) |
| `@InputGuardrails(WeatherTopicGuardrail.class)` | Guardrail de input: valida a mensagem do usuário **antes** de chamar a LLM. Se a pergunta não é sobre clima, bloqueia |
| `@SystemMessage(...)` | Instruções de sistema enviadas à LLM em toda chamada. Define o papel (meteorologista), o formato de resposta (3 linhas), e explica os campos do JSON de previsão |
| `String chat(String message)` | O método que a LLM implementa. Recebe a pergunta em linguagem natural, retorna a resposta |

### @RegisterAiService(tools = ...) vs @ToolBox(...)

Há duas formas de declarar tools em um AI Service:

**`@RegisterAiService(tools = ...)`**, para tools globais disponíveis para todos os métodos da interface:

```java
@RegisterAiService(tools = {GeoCodingService.class, WeatherForecastService.class})
public interface WeatherAgent {
    String chat(String query);
    String analyze(String request); // também tem acesso às mesmas tools
}
```

**`@ToolBox(...)`**, para tools por método com controle mais fino:

```java
@RegisterAiService
public interface WeatherAgent {

    @ToolBox({GeoCodingService.class, WeatherForecastService.class})
    String chat(String query);

    @ToolBox(GeoCodingService.class) // só geocoding, sem previsão
    String findLocation(String query);
}
```

A recomendação do Quarkus LangChain4j é usar `@ToolBox` para controle mais granular. Use `@RegisterAiService(tools = ...)` quando todas as tools fazem sentido para todos os métodos, como no nosso caso, onde o agente tem um único método.

---

## 8. Arquivo 4: WeatherResource. O Endpoint REST

O ponto de entrada para o usuário. Um endpoint REST que recebe uma mensagem em linguagem natural e delega ao agente:

```java
package io.quarkiverse.langchain4j.weather.agent;

import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@Path("/weather")
public class WeatherResource {

    private final WeatherForecastAgent agent;

    public WeatherResource(WeatherForecastAgent agent) {
        this.agent = agent;
    }

    @POST
    @Consumes(MediaType.TEXT_PLAIN)
    @Produces(MediaType.TEXT_PLAIN)
    public String chat(String message) {
        return agent.chat(message);
    }
}
```

Construtor com injeção CDI. O `WeatherForecastAgent` é injetado automaticamente pelo Quarkus, afinal, ele é um bean CDI registrado via `@RegisterAiService`.

Usamos POST em vez de GET porque a interação com a LLM não é idempotente: cada chamada pode gerar uma resposta diferente, e a semântica é de "enviar uma mensagem e receber uma resposta". O corpo da request é a pergunta em texto livre, e o agente se encarrega de interpretá-la.

---

## 9. application.properties. Configuração

```properties
quarkus.langchain4j.ollama.chat-model.model-name=qwen3:1.7b
quarkus.langchain4j.ollama.chat-model.temperature=0
quarkus.langchain4j.timeout=120s

quarkus.rest-client.geocoding.url=https://nominatim.openstreetmap.org
quarkus.rest-client.openmeteo.url=https://api.open-meteo.com
```

Quatro configurações, quatro propósitos:

| Propriedade | Papel |
|:---|:---|
| `quarkus.langchain4j.ollama.chat-model.model-name` | Modelo LLM a ser usado. `qwen3:1.7b` é leve (~1 GB), suporta function calling, e roda em máquinas modestas |
| `quarkus.langchain4j.ollama.chat-model.temperature` | Temperatura 0 = respostas determinísticas. Importante para function calling: a LLM deve usar as tools de forma consistente, não criativa |
| `quarkus.langchain4j.timeout` | Timeout para chamadas à LLM. Inferência local pode demorar, 120s é conservador |
| `quarkus.rest-client.*.url` | URLs base dos REST Clients, referenciadas pelos `configKey` |

### Ollama Dev Services. A Mágica do Zero Config

Repare: **não há API key nenhuma na configuração**. É aqui que os Dev Services do Quarkus brilham. Quando você roda `./mvnw quarkus:dev`:

1. O Quarkus detecta a extensão `quarkus-langchain4j-ollama` no classpath
2. Os Dev Services **sobem automaticamente um container Docker com o Ollama**
3. O modelo `qwen3:1.7b` é **baixado e carregado** dentro do container
4. A propriedade `quarkus.langchain4j.ollama.base-url` é **configurada automaticamente** para apontar para o container

Você não precisa instalar o Ollama, não precisa baixar o modelo manualmente, não precisa configurar URL. Tudo acontece automaticamente em dev mode. Na primeira execução, o download do modelo leva alguns minutos. Nas execuções seguintes, o modelo já está em cache e o container sobe em segundos.

> **E em produção?** Os Dev Services são desabilitados automaticamente em produção. Para deploy, você configura `quarkus.langchain4j.ollama.base-url` apontando para seu servidor Ollama, ou usa um provider cloud como OpenAI bastando trocar a dependência de `quarkus-langchain4j-ollama` para `quarkus-langchain4j-openai` e adicionar a API key. O código Java não muda, só a configuração.

O `configKey` do `@RegisterRestClient` conecta a interface ao seu bloco de configuração. `configKey = "geocoding"` aponta para `quarkus.rest-client.geocoding.url`. Simples e direto.

---

## 10. Guardrail de Input: Filtrando Perguntas Fora do Escopo

Nosso agente sabe responder sobre clima, mas o que acontece se alguém perguntar "Conte uma piada"? Sem proteção, a LLM tenta responder, gastando tokens e tempo para algo que não é o propósito do agente.

O LangChain4j resolve isso com **input guardrails**: validações executadas **antes** da chamada à LLM. Se o guardrail falha, a LLM nem é chamada.

### WeatherTopicGuardrail

```java
package io.quarkiverse.langchain4j.weather.agent;

import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.guardrail.InputGuardrail;
import dev.langchain4j.guardrail.InputGuardrailResult;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.Set;

@ApplicationScoped
public class WeatherTopicGuardrail implements InputGuardrail {

    private static final Set<String> WEATHER_KEYWORDS = Set.of(
        "weather", "forecast", "temperature", "rain", "sun",
        "snow", "wind", "climate", "humidity", "storm",
        "clima", "previsão", "temperatura", "chuva", "sol",
        "neve", "vento", "umidade", "tempestade",
        "frio", "quente", "calor", "gelo", "geada");

    @Override
    public InputGuardrailResult validate(UserMessage userMessage) {
        String text = userMessage.singleText().toLowerCase();
        boolean isWeatherRelated = WEATHER_KEYWORDS.stream()
            .anyMatch(text::contains);
        if (isWeatherRelated) {
            return success();
        }
        return fatal(
            "This question is not about weather. "
            + "I can only answer weather-related questions.");
    }
}
```

O guardrail implementa `InputGuardrail` e sobrescreve `validate(UserMessage)`. A lógica é simples: verifica se a mensagem contém palavras relacionadas a clima (em inglês e português). Se sim, retorna `success()` e a LLM é chamada normalmente. Se não, retorna `fatal()` e a chamada à LLM é bloqueada, retornando uma exceção `InputGuardrailException`.

A anotação `@ApplicationScoped` registra o guardrail como bean CDI. O Quarkus LangChain4j o descobre automaticamente ao ver `@InputGuardrails(WeatherTopicGuardrail.class)` no `WeatherForecastAgent`.

Esse é um guardrail baseado em keywords, simples e rápido. Para casos mais sofisticados, você pode implementar guardrails que usam outra LLM para classificar a intenção do usuário, ou que verificam autorização antes de executar uma tool.

---

## 11. Rodando e Entendendo o Fluxo

Sem API key para exportar, basta ter o Docker rodando e executar:

```bash
./mvnw quarkus:dev
```

Na primeira execução, o container Ollama sobe e o modelo é baixado (pode levar alguns minutos). Nas execuções seguintes, o modelo já está em cache e sobe em segundos.

E testar com curl:

```bash
curl -X POST \
  -H "Content-Type: text/plain" \
  -d "What's the weather in São Paulo?" \
  http://localhost:8080/weather
```

Teste também em português:

```bash
curl -X POST \
  -H "Content-Type: text/plain" \
  -d "Qual a previsão para Paris?" \
  http://localhost:8080/weather
```

E teste o guardrail com uma pergunta fora do escopo:

```bash
curl -X POST \
  -H "Content-Type: text/plain" \
  -d "Tell me a joke" \
  http://localhost:8080/weather
```

O guardrail bloqueia a chamada à LLM. A pergunta não contém palavras relacionadas a clima, então o agente retorna um erro indicando que só responde sobre clima.

### Como funciona por baixo dos panos

O fluxo de function calling é um diálogo entre seu aplicativo e a LLM. A LLM nunca chama as tools diretamente, ela sempre passa pelo seu código. Eis o passo a passo geral:

1. **Guardrail de input** valida a mensagem do usuário. Se falhar, o fluxo para aqui
2. **Sua aplicação** envia a pergunta do usuário + as descrições das tools para a LLM
3. **A LLM** analisa e responde com um `function_call`, contendo o nome da tool e os argumentos (ex: `search("São Paulo")`)
4. **O Quarkus LangChain4j** intercepta o `function_call`, invoca o método Java correspondente, obtém o resultado
5. **O resultado** é enviado de volta à LLM como contexto adicional
6. **A LLM** pode chamar mais tools (caso precise) ou produzir a resposta final

Essas interações são armazenadas na memória do chat, mantendo o contexto entre os passos de raciocínio.

No nosso caso, quando você envia "What's the weather in São Paulo?", o fluxo real é:

1. **Guardrail** verifica: "weather" encontrado → `success()`
2. **LLM** solicita `function_call`: `GeoCodingService.search("São Paulo")` → Quarkus invoca o REST Client → retorna `{lat: -23.55, lon: -46.63}`
3. **LLM** solicita `function_call`: `WeatherForecastService.forecast(-23.55, -46.63)` → Quarkus invoca o REST Client → retorna `{maxTemp: 28, minTemp: 18, ...}`
4. **LLM** responde: "Em São Paulo, a temperatura máxima será 28°C e a mínima 18°C..."

Você não escreveu nenhuma lógica de orquestração. Zero `if`, zero `switch`. A LLM decidiu tudo.

---

## 12. Bônus: AI Service Como Tool. Composição de Agents

Um agent pode ser tool de outro agent. Isso permite composição: um agente especializado resolve uma subtarefa e outro agente usa esse resultado.

No nosso caso, podemos criar um `CityExtractorAgent` que extrai o nome da cidade de uma pergunta em linguagem natural, lidando com perguntas como "Como vai estar o clima na capital paulista?" onde o nome da cidade não está explícito.

```java
@ApplicationScoped
@RegisterAiService(
    chatMemoryProviderSupplier =
        RegisterAiService.NoChatMemoryProviderSupplier.class)
public interface CityExtractorAgent {

    @UserMessage("""
        You are given one question and you have to extract city name from it
        Only reply the city name if it exists
        or reply 'unknown_city' if there is no city name in question
        Here is the question: {question}
        """)
    @Tool("Extracts the city from a question")
    String extractCity(String question);
}
```

E então referenciamos esse agent como tool no agente principal:

```java
@RegisterAiService(tools = {
    CityExtractorAgent.class,
    GeoCodingService.class,
    WeatherForecastService.class
})
public interface WeatherForecastAgent {

    @SystemMessage("""
        You are a meteorologist, and you need to answer questions
        asked by the user about weather using at most 3 lines.
        ...
        """)
    String chat(String message);
}
```

Agora a LLM tem 3 tools disponíveis. Quando recebe "Como vai estar o clima na capital paulista?", ela pode:

1. Chamar `CityExtractorAgent.extractCity("Como vai estar o clima na capital paulista?")` → "São Paulo"
2. Chamar `GeoCodingService.search("São Paulo")` → {lat, lon}
3. Chamar `WeatherForecastService.forecast(lat, lon)` → previsão
4. Responder em linguagem natural

O `CityExtractorAgent` é um AI Service (ou seja, outro LLM call) que funciona como tool. Isso é poderoso: você pode quebrar tarefas complexas em agents especializados, cada um com seu próprio prompt e memória.

O `NoChatMemoryProviderSupplier` desabilita a memória do `CityExtractorAgent`, já que ele não precisa lembrar de conversas anteriores, só extrair a cidade e retornar.

---

## 13. Tools Vão Além do REST Client

O exemplo deste artigo usa APIs REST externas como tools, mas **`@Tool` não é exclusivo do REST Client**. Qualquer método de um bean CDI pode ser uma tool. O único requisito é a anotação `@Tool` com uma descrição clara.

Uma tool pode:

- **Consultar um banco de dados**: um repository Panache com `@Tool` que busca entidades por critérios recebidos da LLM
- **Ler e escrever arquivos**: métodos que acessam o filesystem ou um bucket S3
- **Chamar serviços internos**: gRPC, SOAP, mensageria (Kafka, RabbitMQ), qualquer integração
- **Executar lógica de negócio**: cálculos, validações, transformações de dados, qualquer coisa que Java faz
- **Compor múltiplas fontes**: um método que agrega dados de um banco + uma API + um cache antes de retornar à LLM

O REST Client é conveniente porque já é uma interface: basta adicionar `@Tool` no método e `@RegisterRestClient` na classe. Mas para lógica customizada, basta criar uma classe anotada com `@ApplicationScoped` (ou qualquer scope CDI) e adicionar `@Tool` nos métodos que a LLM pode chamar.

```java
@ApplicationScoped
public class OrderService {

    @Tool("Finds an order by its ID")
    public Order findById(@P("The order ID") long id) {
        return Order.findById(id);
    }
}
```

A LLM não sabe nem precisa saber que por trás do `@Tool` há um REST Client, um repository Panache ou uma chamada Kafka. Ela só vê a descrição da tool, os parâmetros e o tipo de retorno. O que muda é a implementação, não o contrato.

---

## 14. Indo para Produção

O exemplo que construímos é funcional, mas para ir para produção, alguns aprimoramentos são importantes. O ecossistema Quarkus e LangChain4j oferece várias opções:

**Resiliência**: REST Clients que são tools podem demorar ou falhar. Use `@Timeout` do MicroProfile Fault Tolerance para evitar que a LLM espere indefinidamente, e `@Retry` para tentar novamente em caso de falha transitória.

**Cache**: Já usamos `@CacheResult` no `GeoCodingService`. Para o geocoding, faz todo sentido: São Paulo sempre vai ter a mesma latitude/longitude. Considere cache para qualquer tool cujo resultado raramente muda.

**Guardrails de tool**: O LangChain4j suporta `@ToolInputGuardrails` e `@ToolOutputGuardrails` para validar parâmetros antes da execução e filtrar resultados depois. Úteis para segurança (verificar autorização), validação (formato de email, ranges numéricos) e privacidade (filtrar dados sensíveis dos outputs).

**Streaming**: Para respostas em tempo real, use `Multi<String>` como retorno do AI Service. O Quarkus LangChain4j emite cada token no event loop, e quando tools blocking são invocadas, a execução é automaticamente deslocada para uma worker thread.

**Virtual threads**: Tools que fazem I/O (como REST Clients) podem rodar em virtual threads com `@RunOnVirtualThread`, liberando a thread do event loop enquanto a chamada HTTP está em andamento.

**Error handling**: Você pode definir handlers customizados para erros de execução das tools com `@HandleToolExecutionError`. Quando uma tool falha, o handler retorna uma mensagem à LLM em vez de estourar uma exceção, permitindo que a LLM tente uma abordagem alternativa.

Consulte a [documentação de guardrails](https://docs.quarkiverse.io/quarkus-langchain4j/dev/guardrails.html) e a [documentação de function calling](https://docs.quarkiverse.io/quarkus-langchain4j/dev/function-calling.html) para detalhes de cada recurso.

---

## 15. Conclusão

O pattern se repete: qualquer REST Client vira tool. Você só precisa de `@Tool` na mesma interface do `@RegisterRestClient`. O Quarkus faz a ponte entre o REST Client e a LLM. A LLM decide quando chamar, qual chamar, e com quais argumentos.

O mínimo para um agent funcional: **5 arquivos + 4 records + application.properties**. Sem banco de dados, sem orquestração manual, sem boilerplate.

Com `@P`, você dá contexto à LLM sobre cada parâmetro, melhorando a precisão do function calling. Com `@InputGuardrails`, você protege o agente de perguntas fora do escopo, economizando tokens e garantindo que a LLM só processe o que é relevante.

E se precisar de composição, um AI Service pode ser tool de outro AI Service. O `CityExtractorAgent` demonstra como quebrar tarefas complexas em agents especializados, cada um com seu prompt e memória.

O ecossistema Quarkus LangChain4j está evoluindo rápido. Guardrails, streaming, error handling e resiliência tornam viável levar agents do PoC para produção.

No próximo artigo, vamos explorar como adicionar observabilidade e testes aos seus agents com tools.

---

## Recursos

* [Documentação: Function Calling no Quarkus LangChain4j](https://docs.quarkiverse.io/quarkus-langchain4j/dev/function-calling.html)
* [Documentação: AI Services Reference](https://docs.quarkiverse.io/quarkus-langchain4j/dev/ai-services.html)
* [Documentação: Guardrails no Quarkus LangChain4j](https://docs.quarkiverse.io/quarkus-langchain4j/dev/guardrails.html)
* [Documentação: Guardrails no LangChain4j](https://docs.langchain4j.dev/tutorials/guardrails/)
* [Guia: REST Client Reactive no Quarkus](https://quarkus.io/guides/rest-client)
* [API Nominatim Geocoding](https://nominatim.org/release-docs/latest/api/Search/)
* [API Open-Meteo Forecast](https://open-meteo.com/en/docs)
* [Código-fonte do demo deste artigo](https://github.com/omatheusmesmo/weather-forecast-agent)
* [Sample oficial weather-agent do Quarkus LangChain4j](https://github.com/quarkiverse/quarkus-langchain4j/tree/main/samples/weather-agent): o demo deste artigo é inspirado nesse sample, com adições como guardrail de input, `@P` annotations, endpoint POST e Ollama Dev Services
