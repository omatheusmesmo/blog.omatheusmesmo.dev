---
title: "Pare de Escrever Validações Manuais: O Guia Definitivo de Bean Validation e DTOs no Quarkus"
date: 2026-03-18T12:00:00-03:00
draft: false
tags: ["Quarkus", "Spring", "Java", "Validation", "DTO", "Jakarta EE", "Hibernate Validator", "Quarkus for Spring Developers"]
author: "Matheus Oliveira"
slug: "validacao-dados-dto-quarkus-bean-validation"
summary: "Abandone os 'if-else' infinitos! Aprenda como garantir a integridade dos dados em todas as camadas usando Bean Validation 3.1. Um guia completo sobre DTOs, validações brasileiras, regras customizadas, validação de métodos e uso standalone."
description: "O guia mais completo sobre validação no Quarkus. Explore Hibernate Validator 9.1, @CPF, @CNPJ, validação de métodos, grupos de restrição e como usar o motor do Jakarta até mesmo sem frameworks."
cover:
  image: "validation-dto-cover.png"
  alt: "SNES 16-bit pixel art of a shield protecting a database from corrupted data blocks"
  caption: "Protegendo sua aplicação contra dados inválidos no melhor estilo 16-bit"
  relative: true
---

*Este artigo faz parte da série ["Quarkus for Spring Developers"](https://blog.omatheusmesmo.dev/pt/tags/quarkus-for-spring-developers/).*

Validar dados é uma tarefa que ocorre em todas as camadas, da apresentação à persistência. Se você ainda faz isso com dezenas de blocos `if (obj.getCampo() == null)`, sua aplicação sofre de um "acoplamento de validação" que torna o código difícil de ler e propenso a erros. No ecossistema Java moderno, utilizamos o **Jakarta Bean Validation 3.1**, com o **Hibernate Validator 9.1** como implementação de referência.

Neste guia detalhado, vamos transformar sua forma de validar dados, indo desde anotações básicas até validação de métodos e documentos brasileiros.

---

## 1. Evolução do Sistema: DTOs e Validação Recursiva

Seguindo nosso projeto de Pedidos iniciado nos artigos anteriores, agora usamos **DTOs** para proteger nossas entidades. A anotação `@Valid` em listas é o que permite a validação "em cascata".

**OrderItemDTO.java**
```java
public class OrderItemDTO {
    @NotBlank(message = "Código do produto é obrigatório")
    public String productCode;

    @Positive(message = "A quantidade deve ser maior que zero")
    public int quantity;
}
```

**OrderDTO.java**
```java
public class OrderDTO {
    @NotBlank(message = "O nome do cliente é obrigatório")
    public String customerName;

    @NotEmpty(message = "O pedido deve ter pelo menos um item")
    public List<@Valid OrderItemDTO> items; // @Valid ativa a validação nos objetos da lista

    @PositiveOrZero(message = "O total não pode ser negativo")
    public double totalAmount;
}
```

No seu Resource JAX-RS (Quarkus REST):
```java
@POST
public Response create(@NotNull @Valid OrderDTO order) {
    // Se o código chegar aqui, os dados estão 100% validados!
    return Response.status(Response.Status.CREATED).entity(order).build();
}
```

---

## 2. O Coração da Validação: Maven e Quarkus CLI

Diferente do Spring Boot, onde a validação muitas vezes vem em starters genéricos, no Quarkus somos explícitos para garantir que o binário final (especialmente em modo Nativo com GraalVM) seja otimizado.

### No Quarkus (Extensão Otimizada)
Para adicionar o suporte ao Hibernate Validator:
```bash
quarkus ext add hibernate-validator
```
Isso adiciona a dependência `io.quarkus:quarkus-hibernate-validator` ao seu `pom.xml`, que já configura o motor EL e a integração com CDI automaticamente.

### Em Projetos Java Puros (Standalone)
O Bean Validation é agnóstico a framework. Para usá-lo em uma biblioteca ou CLI sem Quarkus/Spring, você precisa da implementação e de um motor de **Jakarta Expression Language (EL)** para processar as mensagens dinâmicas.

```xml
<dependencies>
    <dependency>
        <groupId>org.hibernate.validator</groupId>
        <artifactId>hibernate-validator</artifactId>
        <version>9.1.0.Final</version>
    </dependency>
    <!-- Necessário para Pure Java processar variáveis como {min} nas mensagens -->
    <dependency>
        <groupId>org.glassfish.expressly</groupId>
        <artifactId>expressly</artifactId>
        <version>6.0.0</version>
    </dependency>
</dependencies>
```

---

## 3. O Arsenal de Defesa: Tabela de Anotações Essenciais

As anotações abaixo são o núcleo da especificação. Elas permitem que você descreva *o que* deve ser validado diretamente no modelo.

| Anotação | Descrição | Exemplo |
| :--- | :--- | :--- |
| `@NotNull` | O campo não pode ser nulo. | `@NotNull String id;` |
| `@NotEmpty` | Não nulo e tamanho > 0 (Strings, Collections, Mapas). | `@NotEmpty List<@Valid Item> items;` |
| `@NotBlank` | String não nula e com pelo menos um caractere real. | `@NotBlank String name;` |
| `@Size` | Define limites de tamanho para Strings ou coleções. | `@Size(min = 3, max = 50)` |
| `@Min` / `@Max` | Limites numéricos inclusivos. | `@Min(18) int age;` |
| `@Positive` / `@PositiveOrZero` | O valor deve ser maior que 0 (ou >= 0). | `@Positive double price;` |
| `@Negative` / `@NegativeOrZero` | O valor deve ser menor que 0 (ou <= 0). | `@Negative double debt;` |
| `@DecimalMin` / `@DecimalMax` | Limites decimais em formato String. | `@DecimalMin("0.01")` |
| `@Email` | Valida o formato de e-mail (RFC compliant). | `@Email String email;` |
| `@Past` / `@PastOrPresent` | Datas no passado (ex: nascimento). | `@Past LocalDate birthday;` |
| `@Future` / `@FutureOrPresent`| Datas no futuro (ex: entrega). | `@Future LocalDateTime delivery;` |
| `@Digits` | Valida número de dígitos inteiros e frações. | `@Digits(integer=5, fraction=2)` |
| `@Pattern` | Valida contra uma Expressão Regular (Regex). | `@Pattern(regexp = "^[A-Z0-9]+$")` |
| `@AssertTrue` / `@AssertFalse`| Valida o estado de um booleano. | `@AssertTrue boolean accepted;` |

### Interpolação de Mensagens
Você pode usar variáveis da própria anotação nas mensagens:
```java
@Size(min = 2, max = 14, message = "A placa '${validatedValue}' deve ter entre {min} e {max} caracteres")
private String licensePlate;
```

---

## 4. Validações Brasileiras (Pacote BR)

O Hibernate Validator possui suporte nativo ao mercado brasileiro através do pacote `org.hibernate.validator.constraints.br`. Isso valida não apenas o formato, mas o algoritmo dos dígitos verificadores.

*   **`@CPF`**: Valida o Cadastro de Pessoa Física.
*   **`@CNPJ`**: Valida o Cadastro Nacional da Pessoa Jurídica (Suporta o novo formato alfanumérico de 2026).
*   **`@TituloEleitoral`**: Valida o número do Título de Eleitor brasileiro.

```java
import org.hibernate.validator.constraints.br.CPF;
import org.hibernate.validator.constraints.br.CNPJ;

public class CompanyDTO {
    @CNPJ(message = "CNPJ inválido")
    public String cnpj;
    
    @CPF(message = "CPF do responsável inválido")
    public String managerCpf;
}
```

---

## 5. Validação de Métodos: Pré e Pós-condições

Poucos desenvolvedores sabem, mas você pode validar os parâmetros e o retorno de **qualquer método CDI**. Isso é excelente para impor regras de negócio na camada de serviço.

```java
@ApplicationScoped
public class OrderService {

    public void processOrder(
        @NotNull @Valid OrderDTO order, 
        @Positive int priority
    ) {
        // Lógica...
    }

    @NotNull @Size(min = 1)
    public List<Order> listRecentOrders() {
        return repository.findAll();
    }
}
```
Se uma regra for violada, o Quarkus lançará uma `ConstraintViolationException`.

---

## 6. Criando sua Própria Regra: Validação Customizada

Quando as anotações padrão não bastam, criamos a nossa. No Quarkus, os validadores são beans CDI, permitindo injetar repositórios.

**Passo 1: A Anotação**
```java
@Target({ FIELD, PARAMETER, TYPE_USE })
@Retention(RUNTIME)
@Constraint(validatedBy = CustomerExistsValidator.class)
public @interface CustomerExists {
    String message() default "Cliente não encontrado";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}
```

**Passo 2: O Validator**
```java
@ApplicationScoped
public class CustomerExistsValidator implements ConstraintValidator<CustomerExists, Long> {
    @Inject CustomerRepository repository;

    @Override
    public boolean isValid(Long id, ConstraintValidatorContext context) {
        if (id == null) return true; // Deixe @NotNull cuidar da obrigatoriedade
        return repository.findById(id) != null;
    }
}
```

---

## 7. Atributos Avançados: Groups e Payload

*   **Groups (Grupos)**: Permite validar partes diferentes do objeto em momentos diferentes. Ex:
    ```java
    public interface OnCreate {}
    public interface OnUpdate {}

    public class User {
        @Null(groups = OnCreate.class)
        @NotNull(groups = OnUpdate.class)
        public Long id;
    }
    ```
*   **Payload**: Serve para carregar metadados. Útil para definir severidade:
    ```java
    @NotNull(payload = Severity.Error.class)
    public String criticalField;
    ```

---

## 8. Usando Bean Validation sem Framework (Pure Java)

Você pode usar o motor de validação manualmente, o que é útil em testes de unidade ou scripts:

```java
ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
Validator validator = factory.getValidator();

Set<ConstraintViolation<OrderDTO>> violations = validator.validate(myOrder);
if (!violations.isEmpty()) {
    violations.forEach(v -> System.out.println(v.getMessage()));
}
```

---

## Dica de Senior: Annotation Processor

Para evitar erros bobos como colocar `@Past` em uma variável do tipo `int`, adicione o **Hibernate Validator Annotation Processor** ao seu projeto. Ele transformará esses erros em falhas de compilação.

```xml
<dependency>
    <groupId>org.hibernate.validator</groupId>
    <artifactId>hibernate-validator-annotation-processor</artifactId>
    <version>9.1.0.Final</version>
</dependency>
```

## Conclusão

Bean Validation é a forma profissional de garantir a integridade dos seus dados sem poluir o código com `if-else`. No Quarkus, essa ferramenta ganha performance extra graças às otimizações de build time. Pare de escrever validações manuais e deixe o motor do Jakarta trabalhar por você!

---

## Recursos
*   [Guia Oficial Quarkus: Hibernate Validator](https://quarkus.io/guides/validation)
*   [Guia de Referência Hibernate Validator 9.1](https://docs.jboss.org/hibernate/stable/validator/reference/en-US/html_single/)
*   [Especificação Jakarta Bean Validation 3.1](https://jakarta.ee/specifications/bean-validation/3.1/)
