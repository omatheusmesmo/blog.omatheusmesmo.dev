---
title: "AI Agent Tools in Quarkus LangChain4j: When the REST Client Becomes the LLM's Right Hand"
date: 2026-05-14T10:00:00-03:00
draft: false
tags: ["Quarkus", "LangChain4j", "Java", "AI", "Agent", "Function Calling", "REST Client", "Ollama"]
author: "Matheus Oliveira"
slug: "quarkus-langchain4j-ai-agent-tools"
summary: "Build an AI agent that calls real REST APIs as tools, without writing any orchestration logic. REST Client + @Tool = automatic tool. The LLM decides when to call, which to call, and with what arguments. Everything runs locally with Ollama via Dev Services, zero API key."
description: "End-to-end tutorial on AI agent tools in Quarkus LangChain4j. Build a weather forecaster agent that uses geocoding and weather forecast APIs as tools via REST Client, running 100% locally with Ollama and Dev Services."
cover:
  image: "quarkus-langchain4j-rest-client-tools-cover.png"
  alt: "SNES 16-bit pixel art of a robot wizard in a red cape holding floating weather and geocoding tools, with code runes in the background"
  caption: "The LLM orchestrates, the REST Client executes, you just declare the tools"
  relative: true
---

Have you heard about "agents with tools" and thought it was a Python-framework thing? Good news: in Quarkus LangChain4j, your REST Client becomes a tool automatically. One annotation. That's it.

In this article, we'll create from scratch a weather forecaster agent that receives natural language questions, queries real REST APIs for geocoding and weather forecasts, and responds in natural language. All of this with 5 files + 4 records and an `application.properties`. No database, no boilerplate, no manual orchestration. And the best part: **running 100% locally with Ollama**, no API key, no cost, no cloud dependency.

---

## 1. What Are Agents with Tools?

An **agent** is an AI Service that has access to **tools**, methods the LLM can invoke during a conversation to fetch data, execute actions, or perform calculations.

The key concept is simple: instead of the LLM just generating text, it can **decide to call a tool**, pass arguments, receive the result, and then formulate the final answer. All autonomously.

Think of it as giving the LLM a Swiss army knife of tools. You define which tools are available and what each one does. The LLM decides when to use them.

Quarkus LangChain4j abstracts all the complexity of this process: it automatically generates the system prompts with tool descriptions, invokes the methods when the LLM requests it, and returns the results back to the LLM so it can continue reasoning.

---

## 2. The Key Concept: REST Client + @Tool = Automatic Tool

In Quarkus, you already know the REST Client pattern: an interface annotated with `@RegisterRestClient` that represents a remote API. You define the endpoints, the parameters, and Quarkus generates the implementation.

The magic of Quarkus LangChain4j is that **this same interface can be a tool for the LLM**. Just add `@Tool` to the method. Done. Quarkus automatically registers this REST Client as a tool available to the agent.

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

Two annotations on the same interface. `@RegisterRestClient` for the Quarkus REST Client. `@Tool` for LangChain4j. Quarkus bridges the gap. The LLM decides when to call.

Notice the `@P` annotation: it describes the parameter to the LLM. Without it, the LLM only sees the parameter name (`latitude`, `longitude`). With it, the LLM understands what each parameter means, which improves function calling accuracy.

**The LLM orchestrates, not you.** It decides which tool to call, in what order, and with what arguments. You only declare the available tools.

---

## 3. The Use Case: Weather Forecaster Agent

Our agent will:

1. Receive questions like "What's the weather in São Paulo?"
2. Use the geocoding API (Nominatim) to get latitude and longitude of the city
3. Use the Open-Meteo API to get the weather forecast
4. Respond in natural language, in up to 3 lines
5. Reject questions that are not about weather (input guardrail)

Both APIs are public and free, no API key required.

### External APIs

- **Nominatim Geocoding**: `GET https://nominatim.openstreetmap.org/v1/search?name=Paris&count=1` (returns lat/lon)
- **Open-Meteo Forecast**: `GET https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&daily=temperature_2m_max,...&forecast_days=1` (returns forecast)

---

## 4. Creating the Project

Let's use the Quarkus CLI to create the project with the required extensions:

```bash
quarkus create app io.quarkiverse.langchain4j.weather:weather-forecast-agent:1.0.0-SNAPSHOT \
  -x=quarkus-rest-jackson,quarkus-rest-client-jackson,quarkus-cache \
  --no-code \
  --maven
```

This creates the project with:

- `quarkus-rest-jackson`, REST endpoints with JSON support
- `quarkus-rest-client-jackson`, REST Client with JSON support
- `quarkus-cache`, cache to avoid repeated geocoding calls

### Adding Quarkus LangChain4j

Quarkus LangChain4j is a Quarkiverse extension, it's not part of the Quarkus Platform BOM. Therefore, we need to declare its version separately. The best approach is to import the Quarkiverse LangChain4j BOM in `dependencyManagement`:

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

Then we add the Ollama provider dependency **without a version** (the BOM handles it):

```xml
<dependency>
  <groupId>io.quarkiverse.langchain4j</groupId>
  <artifactId>quarkus-langchain4j-ollama</artifactId>
</dependency>
```

> **Why Ollama and not OpenAI?** Quarkus LangChain4j supports several providers (OpenAI, Ollama, HuggingFace, etc.). We chose Ollama because it lets you run the LLM locally, with no API key and no cost. And with Quarkus Dev Services, the Ollama container starts automatically in dev mode, zero manual configuration.

The full POM is on [GitHub](https://github.com/omatheusmesmo/weather-forecast-agent). The relevant parts are the BOM and dependencies, which we showed above. The rest is boilerplate from `quarkus create`.

---

## 5. File 1: GeoCodingService. The REST Client That Is a Tool

Let's start with geocoding. This tool converts a city name into latitude and longitude.

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

Let's break down each annotation:

| Annotation | Role |
|:---|:---|
| `@RegisterRestClient(configKey = "geocoding")` | Registers as a Quarkus REST Client. The base URL comes from `application.properties` via `quarkus.rest-client.geocoding.url` |
| `@Path("/v1")` | Base path of the Nominatim API |
| `@GET @Path("/search")` | Maps to the GET `/v1/search` endpoint |
| `@CacheResult(cacheName = "geo-results")` | Quarkus Cache, if we already looked up "São Paulo", we don't call the API again |
| `@ClientQueryParam(name = "count", value = "1")` | Automatically adds `?count=1` to every request, limits to 1 result |
| `@Tool("Finds the latitude and longitude of a given city")` | **The magic.** Registers this method as a tool available to the LLM. The description is what the LLM reads to decide when to use it |
| `@P("City name to search for, e.g. 'São Paulo' or 'Paris'")` | Describes the parameter to the LLM. Without it, the LLM only sees `name`. With it, the LLM understands it expects a city name |

`@Tool` is the bridge. Quarkus LangChain4j reads the `@Tool` description, parameter names and descriptions (via `@P`), and return type (`GeoResults`), and automatically builds the function calling schema the LLM expects.

### Response Records

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

We use `@JsonIgnoreProperties(ignoreUnknown = true)` to ensure that changes in the external API don't break our deserialization. Java records are perfect here: immutable, concise, and with native Jackson support.

---

## 6. File 2: WeatherForecastService. Another REST Client That Is a Tool

Now the weather forecast tool. Same pattern: REST Client + @Tool.

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

Note the multiple `@ClientQueryParam` annotations. Each adds a fixed query parameter to every request. This gives us control over which fields the API returns without depending on the LLM to pass these parameters. The LLM only needs to pass `latitude` and `longitude`, the dynamic parameters. The fixed ones are encapsulated in the REST Client.

The `@P` annotations on `latitude` and `longitude` explain to the LLM that these are geographic coordinates. Even though the names are self-explanatory, the description removes any ambiguity.

Response records:

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

We use `@JsonProperty` to map the API's snake_case fields to camelCase in Java. Each field is a list because the Open-Meteo API returns daily arrays, even with `forecast_days=1`, the format is a single-element array.

---

## 7. File 3: WeatherForecastAgent. The AI Service That Orchestrates

Here's the agent. An interface. No implementation. Quarkus LangChain4j generates everything.

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

Let's break it down:

| Element | Role |
|:---|:---|
| `@RegisterAiService(tools = {...})` | Registers as a CDI bean AI Service. The `tools` attribute declares which tools the LLM can use, in this case, our two REST Clients |
| `@InputGuardrails(WeatherTopicGuardrail.class)` | Input guardrail: validates the user message **before** calling the LLM. If the question is not about weather, it blocks the call |
| `@SystemMessage(...)` | System instructions sent to the LLM on every call. Defines the role (meteorologist), response format (3 lines), and explains the forecast JSON fields |
| `String chat(String message)` | The method the LLM implements. Receives the natural language question, returns the answer |

### @RegisterAiService(tools = ...) vs @ToolBox(...)

There are two ways to declare tools in an AI Service:

**`@RegisterAiService(tools = ...)`**, global tools, available to all methods in the interface:

```java
@RegisterAiService(tools = {GeoCodingService.class, WeatherForecastService.class})
public interface WeatherAgent {
    String chat(String query);
    String analyze(String request); // also has access to the same tools
}
```

**`@ToolBox(...)`**, per-method tools, finer control:

```java
@RegisterAiService
public interface WeatherAgent {

    @ToolBox({GeoCodingService.class, WeatherForecastService.class})
    String chat(String query);

    @ToolBox(GeoCodingService.class) // only geocoding, no forecast
    String findLocation(String query);
}
```

The Quarkus LangChain4j recommendation is to use `@ToolBox` for more granular control. Use `@RegisterAiService(tools = ...)` when all tools make sense for all methods, as in our case, where the agent has a single method.

---

## 8. File 4: WeatherResource. The REST Endpoint

The entry point for the user. A REST endpoint that receives a natural language message and delegates to the agent:

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

Constructor with CDI injection. The `WeatherForecastAgent` is automatically injected by Quarkus, after all, it's a CDI bean registered via `@RegisterAiService`.

We use POST instead of GET because the LLM interaction is not idempotent: each call may produce a different response, and the semantics are "send a message and receive a response". The request body is the free-text question, and the agent handles interpreting it.

---

## 9. application.properties. Configuration

```properties
quarkus.langchain4j.ollama.chat-model.model-name=qwen3:1.7b
quarkus.langchain4j.ollama.chat-model.temperature=0
quarkus.langchain4j.timeout=120s

quarkus.rest-client.geocoding.url=https://nominatim.openstreetmap.org
quarkus.rest-client.openmeteo.url=https://api.open-meteo.com
```

Four configurations, four purposes:

| Property | Role |
|:---|:---|
| `quarkus.langchain4j.ollama.chat-model.model-name` | LLM model to use. `qwen3:1.7b` is lightweight (~1 GB), supports function calling, and runs on modest hardware |
| `quarkus.langchain4j.ollama.chat-model.temperature` | Temperature 0 = deterministic responses. Important for function calling: the LLM should use tools consistently, not creatively |
| `quarkus.langchain4j.timeout` | Timeout for LLM calls. Local inference can be slow, 120s is conservative |
| `quarkus.rest-client.*.url` | Base URLs for REST Clients, referenced by their `configKey` |

### Ollama Dev Services. The Magic of Zero Config

Notice: **there is no API key in the configuration**. This is where Quarkus Dev Services shine. When you run `./mvnw quarkus:dev`:

1. Quarkus detects the `quarkus-langchain4j-ollama` extension on the classpath
2. Dev Services **automatically starts a Docker container with Ollama**
3. The `qwen3:1.7b` model is **downloaded and loaded** inside the container
4. The `quarkus.langchain4j.ollama.base-url` property is **automatically configured** to point to the container

You don't need to install Ollama, you don't need to download the model manually, you don't need to configure a URL. Everything happens automatically in dev mode. On the first run, the model download takes a few minutes. On subsequent runs, the model is already cached and the container starts in seconds.

> **What about production?** Dev Services are automatically disabled in production. For deployment, you configure `quarkus.langchain4j.ollama.base-url` pointing to your Ollama server, or use a cloud provider like OpenAI by simply swapping the dependency from `quarkus-langchain4j-ollama` to `quarkus-langchain4j-openai` and adding the API key. The Java code doesn't change, only the configuration.

The `configKey` from `@RegisterRestClient` connects the interface to its configuration block. `configKey = "geocoding"` points to `quarkus.rest-client.geocoding.url`. Simple and direct.

---

## 10. Input Guardrail: Filtering Out-of-Scope Questions

Our agent knows how to answer weather questions, but what happens if someone asks "Tell me a joke"? Without protection, the LLM tries to answer, wasting tokens and time on something that isn't the agent's purpose.

LangChain4j solves this with **input guardrails**: validations executed **before** the LLM is called. If the guardrail fails, the LLM is never called.

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

The guardrail implements `InputGuardrail` and overrides `validate(UserMessage)`. The logic is simple: it checks whether the message contains weather-related keywords (in English and Portuguese). If yes, it returns `success()` and the LLM is called normally. If not, it returns `fatal()` and the LLM call is blocked, returning an `InputGuardrailException`.

The `@ApplicationScoped` annotation registers the guardrail as a CDI bean. Quarkus LangChain4j discovers it automatically when it sees `@InputGuardrails(WeatherTopicGuardrail.class)` on `WeatherForecastAgent`.

This is a keyword-based guardrail, simple and fast. For more sophisticated cases, you can implement guardrails that use another LLM to classify the user's intent, or that check authorization before executing a tool.

---

## 11. Running and Understanding the Flow

No API key to export, just make sure Docker is running and execute:

```bash
./mvnw quarkus:dev
```

On the first run, the Ollama container starts and the model is downloaded (may take a few minutes). On subsequent runs, the model is already cached and starts in seconds.

And test with curl:

```bash
curl -X POST \
  -H "Content-Type: text/plain" \
  -d "What's the weather in São Paulo?" \
  http://localhost:8080/weather
```

Try it in Portuguese too:

```bash
curl -X POST \
  -H "Content-Type: text/plain" \
  -d "Qual a previsão para Paris?" \
  http://localhost:8080/weather
```

And test the guardrail with an out-of-scope question:

```bash
curl -X POST \
  -H "Content-Type: text/plain" \
  -d "Tell me a joke" \
  http://localhost:8080/weather
```

The guardrail blocks the LLM call. The question doesn't contain weather-related keywords, so the agent returns an error indicating it only answers weather questions.

### How it works under the hood

The function calling flow is a dialogue between your application and the LLM. The LLM never calls tools directly, it always goes through your code. Here's the general step-by-step:

1. **Input guardrail** validates the user message. If it fails, the flow stops here
2. **Your application** sends the user's question + tool descriptions to the LLM
3. **The LLM** analyzes and responds with a `function_call`, containing the tool name and arguments (e.g.: `search("São Paulo")`)
4. **Quarkus LangChain4j** intercepts the `function_call`, invokes the corresponding Java method, gets the result
5. **The result** is sent back to the LLM as additional context
6. **The LLM** may call more tools (if needed) or produce the final answer

These interactions are stored in the chat memory, maintaining context across reasoning steps.

In our case, when you send "What's the weather in São Paulo?", the actual flow is:

1. **Guardrail** checks: "weather" found → `success()`
2. **LLM** requests `function_call`: `GeoCodingService.search("São Paulo")` → Quarkus invokes the REST Client → returns `{lat: -23.55, lon: -46.63}`
3. **LLM** requests `function_call`: `WeatherForecastService.forecast(-23.55, -46.63)` → Quarkus invokes the REST Client → returns `{maxTemp: 28, minTemp: 18, ...}`
4. **LLM** responds: "In São Paulo, the high will be 28°C and the low 18°C..."

You didn't write any orchestration logic. Zero `if`, zero `switch`. The LLM decided everything.

---

## 12. Bonus: AI Service as Tool. Agent Composition

An agent can be a tool for another agent. This enables composition: a specialized agent solves a subtask and another agent uses that result.

In our case, we can create a `CityExtractorAgent` that extracts the city name from a natural language question, handling questions like "How's the weather in the capital of São Paulo state?" where the city name isn't explicit.

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

Then we reference this agent as a tool in the main agent:

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

Now the LLM has 3 tools available. When it receives "How's the weather in the capital of São Paulo state?", it can:

1. Call `CityExtractorAgent.extractCity("How's the weather in the capital of São Paulo state?")` → "São Paulo"
2. Call `GeoCodingService.search("São Paulo")` → {lat, lon}
3. Call `WeatherForecastService.forecast(lat, lon)` → forecast
4. Respond in natural language

The `CityExtractorAgent` is an AI Service (i.e., another LLM call) that functions as a tool. This is powerful: you can break complex tasks into specialized agents, each with its own prompt and memory.

The `NoChatMemoryProviderSupplier` disables the `CityExtractorAgent`'s memory, it doesn't need to remember previous conversations, just extract the city and return.

---

## 13. Tools Go Beyond REST Client

This article uses external REST APIs as tools, but **`@Tool` is not exclusive to REST Client**. Any method on a CDI bean can be a tool. The only requirement is the `@Tool` annotation with a clear description.

A tool can:

- **Query a database**: a Panache repository with `@Tool` that fetches entities by criteria received from the LLM
- **Read and write files**: methods that access the filesystem or an S3 bucket
- **Call internal services**: gRPC, SOAP, messaging (Kafka, RabbitMQ), any integration
- **Execute business logic**: calculations, validations, data transformations, anything Java can do
- **Compose multiple sources**: a method that aggregates data from a database + an API + a cache before returning to the LLM

REST Client is convenient because it's already an interface: just add `@Tool` to the method and `@RegisterRestClient` to the class. But for custom logic, just create a class annotated with `@ApplicationScoped` (or any CDI scope) and add `@Tool` to the methods the LLM can call.

```java
@ApplicationScoped
public class OrderService {

    @Tool("Finds an order by its ID")
    public Order findById(@P("The order ID") long id) {
        return Order.findById(id);
    }
}
```

The LLM doesn't know and doesn't need to know whether behind the `@Tool` there's a REST Client, a Panache repository, or a Kafka call. It only sees the tool description, parameters, and return type. What changes is the implementation, not the contract.

---

## 14. Moving to Production

The example we built is functional, but for production, some enhancements are important. The Quarkus and LangChain4j ecosystem offers several options:

**Resilience**: REST Clients that are tools can be slow or fail. Use `@Timeout` from MicroProfile Fault Tolerance to prevent the LLM from waiting indefinitely, and `@Retry` for transient failures.

**Caching**: We already used `@CacheResult` in `GeoCodingService`. For geocoding, it makes perfect sense: São Paulo will always have the same latitude/longitude. Consider caching for any tool whose results rarely change.

**Tool guardrails**: LangChain4j supports `@ToolInputGuardrails` and `@ToolOutputGuardrails` to validate parameters before execution and filter results after. Useful for security (authorization checks), validation (email format, numeric ranges), and privacy (filter sensitive data from outputs).

**Streaming**: For real-time responses, use `Multi<String>` as the AI Service return type. Quarkus LangChain4j emits each token on the event loop, and when blocking tools are invoked, execution is automatically shifted to a worker thread.

**Virtual threads**: Tools that do I/O (like REST Clients) can run on virtual threads with `@RunOnVirtualThread`, freeing the event loop thread while the HTTP call is in progress.

**Error handling**: You can define custom handlers for tool execution errors with `@HandleToolExecutionError`. When a tool fails, the handler returns a message to the LLM instead of throwing an exception, allowing the LLM to try an alternative approach.

See the [guardrails documentation](https://docs.quarkiverse.io/quarkus-langchain4j/dev/guardrails.html) and the [function calling documentation](https://docs.quarkiverse.io/quarkus-langchain4j/dev/function-calling.html) for details on each feature.

---

## 15. Conclusion

The pattern repeats: any REST Client becomes a tool. You just need `@Tool` on the same interface as `@RegisterRestClient`. Quarkus bridges the REST Client and the LLM. The LLM decides when to call, which to call, and with what arguments.

The minimum for a functional agent: **5 files + 4 records + application.properties**. No database, no manual orchestration, no boilerplate.

With `@P`, you give the LLM context about each parameter, improving function calling accuracy. With `@InputGuardrails`, you protect the agent from out-of-scope questions, saving tokens and ensuring the LLM only processes what's relevant.

And if you need composition, an AI Service can be a tool for another AI Service. The `CityExtractorAgent` demonstrates how to break complex tasks into specialized agents, each with its own prompt and memory.

The Quarkus LangChain4j ecosystem is evolving fast. Guardrails, streaming, error handling, and resilience make it viable to take agents from PoC to production.

In the next article, we'll explore how to add observability and tests to your agents with tools.

---

## Resources

* [Documentation: Function Calling in Quarkus LangChain4j](https://docs.quarkiverse.io/quarkus-langchain4j/dev/function-calling.html)
* [Documentation: AI Services Reference](https://docs.quarkiverse.io/quarkus-langchain4j/dev/ai-services.html)
* [Documentation: Guardrails in Quarkus LangChain4j](https://docs.quarkiverse.io/quarkus-langchain4j/dev/guardrails.html)
* [Documentation: Guardrails in LangChain4j](https://docs.langchain4j.dev/tutorials/guardrails/)
* [Guide: REST Client Reactive in Quarkus](https://quarkus.io/guides/rest-client)
* [Nominatim Geocoding API](https://nominatim.org/release-docs/latest/api/Search/)
* [Open-Meteo Forecast API](https://open-meteo.com/en/docs)
* [Demo source code from this article](https://github.com/omatheusmesmo/weather-forecast-agent)
* [Official Quarkus LangChain4j weather-agent sample](https://github.com/quarkiverse/quarkus-langchain4j/tree/main/samples/weather-agent): the demo in this article is inspired by that sample, with additions such as input guardrail, `@P` annotations, POST endpoint, and Ollama Dev Services
