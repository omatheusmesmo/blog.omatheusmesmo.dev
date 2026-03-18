---
title: "Stop Writing Manual Validations: The Definitive Guide to Bean Validation and DTOs in Quarkus"
date: 2026-03-18T12:00:00-03:00
draft: false
tags: ["Quarkus", "Spring", "Java", "Validation", "DTO", "Jakarta EE", "Hibernate Validator", "Quarkus for Spring Developers"]
author: "Matheus Oliveira"
slug: "data-validation-dto-quarkus-bean-validation"
summary: "Ditch the infinite 'if-else' blocks! Learn how to ensure data integrity across all layers using Bean Validation 3.1. A complete guide on DTOs, custom rules, method validation, and standalone usage."
description: "The most comprehensive guide to validation in Quarkus. Explore Hibernate Validator 9.1, custom constraints, method validation, and how to use the Jakarta engine even without frameworks."
cover:
  image: "validation-dto-cover.png"
  alt: "SNES 16-bit pixel art of a shield protecting a database from corrupted data blocks"
  caption: "Protecting your application against invalid data in the best 16-bit style"
  relative: true
---

*This article is part of the ["Quarkus for Spring Developers"](https://blog.omatheusmesmo.dev/en/tags/quarkus-for-spring-developers/) series.*

Validating data is a task that occurs across all layers, from presentation to persistence. If you are still doing it with dozens of `if (obj.getField() == null)` blocks, your application suffers from a "validation coupling" that makes code hard to read and error-prone. In the modern Java ecosystem, we use **Jakarta Bean Validation 3.1**, with **Hibernate Validator 9.1** as the reference implementation.

In this detailed guide, we will transform your way of validating data, ranging from basic annotations to method validation and advanced constraints.

---

## 1. System Evolution: DTOs and Recursive Validation

Following our Orders project started in previous articles, we now use **DTOs** to protect our entities. The `@Valid` annotation on lists is what allows "cascading" validation.

**OrderItemDTO.java**
```java
public class OrderItemDTO {
    @NotBlank(message = "Product code is mandatory")
    public String productCode;

    @Positive(message = "Quantity must be greater than zero")
    public int quantity;
}
```

**OrderDTO.java**
```java
public class OrderDTO {
    @NotBlank(message = "Customer name is mandatory")
    public String customerName;

    @NotEmpty(message = "Order must have at least one item")
    public List<@Valid OrderItemDTO> items; // @Valid enables validation on list objects

    @PositiveOrZero(message = "Total cannot be negative")
    public double totalAmount;
}
```

In your JAX-RS Resource (Quarkus REST):
```java
@POST
public Response create(@NotNull @Valid OrderDTO order) {
    // If code reaches here, data is 100% validated!
    return Response.status(Response.Status.CREATED).entity(order).build();
}
```

---

## 2. The Heart of Validation: Maven and Quarkus CLI

Unlike Spring Boot, where validation often comes in generic starters, in Quarkus we are explicit to ensure that the final binary (especially in Native mode with GraalVM) is optimized.

### In Quarkus (Optimized Extension)
To add support for Hibernate Validator:
```bash
quarkus ext add hibernate-validator
```
This adds the `io.quarkus:quarkus-hibernate-validator` dependency to your `pom.xml`, which already configures the EL engine and CDI integration automatically.

### In Pure Java Projects (Standalone)
Bean Validation is framework-agnostic. To use it in a library or CLI without Quarkus/Spring, you need the implementation and a **Jakarta Expression Language (EL)** engine to process dynamic messages.

```xml
<dependencies>
    <dependency>
        <groupId>org.hibernate.validator</groupId>
        <artifactId>hibernate-validator</artifactId>
        <version>9.1.0.Final</version>
    </dependency>
    <!-- Required for Pure Java to process variables like {min} in messages -->
    <dependency>
        <groupId>org.glassfish.expressly</groupId>
        <artifactId>expressly</artifactId>
        <version>6.0.0</version>
    </dependency>
</dependencies>
```

---

## 3. The Defense Arsenal: Essential Annotations Table

The annotations below are the core of the specification. They allow you to describe *what* should be validated directly in the model.

| Annotation | Description | Example |
| :--- | :--- | :--- |
| `@NotNull` | Field cannot be null. | `@NotNull String id;` |
| `@NotEmpty` | Not null and size > 0 (Strings, Collections, Maps). | `@NotEmpty List<@Valid Item> items;` |
| `@NotBlank` | Not null and contains at least one real character. | `@NotBlank String name;` |
| `@Size` | Defines size limits for Strings or collections. | `@Size(min = 3, max = 50)` |
| `@Min` / `@Max` | Inclusive numerical limits. | `@Min(18) int age;` |
| `@Positive` / `@PositiveOrZero` | Value must be greater than 0 (or >= 0). | `@Positive double price;` |
| `@Negative` / `@NegativeOrZero` | Value must be less than 0 (or <= 0). | `@Negative double debt;` |
| `@DecimalMin` / `@DecimalMax` | Decimal limits in String format. | `@DecimalMin("0.01")` |
| `@Email` | Validates email format (RFC compliant). | `@Email String email;` |
| `@Past` / `@PastOrPresent` | Dates in the past (e.g., birth date). | `@Past LocalDate birthday;` |
| `@Future` / `@FutureOrPresent`| Dates in the future (e.g., delivery). | `@Future LocalDateTime delivery;` |
| `@Digits` | Validates number of integer and fractional digits. | `@Digits(integer=5, fraction=2)` |
| `@Pattern` | Validates against a Regular Expression (Regex). | `@Pattern(regexp = "^[A-Z0-9]+$")` |
| `@AssertTrue` / `@AssertFalse`| Validates boolean state. | `@AssertTrue boolean accepted;` |

### Message Interpolation
You can use variables from the annotation itself in the messages:
```java
@Size(min = 2, max = 14, message = "The plate '${validatedValue}' must be between {min} and {max} characters")
private String licensePlate;
```

---

## 4. Method Validation: Pre and Post-conditions

Few developers know, but you can validate parameters and return values of **any CDI method**. This is excellent for enforcing business rules at the service layer.

```java
@ApplicationScoped
public class OrderService {

    public void processOrder(
        @NotNull @Valid OrderDTO order, 
        @Positive int priority
    ) {
        // Logic...
    }

    @NotNull @Size(min = 1)
    public List<Order> listRecentOrders() {
        return repository.findAll();
    }
}
```
If a rule is violated, Quarkus will throw a `ConstraintViolationException`.

---

## 5. Creating Your Own Rule: Custom Validation

When standard annotations are not enough, we create our own. In Quarkus, validators are CDI beans, allowing you to inject repositories.

**Step 1: The Annotation**
```java
@Target({ FIELD, PARAMETER, TYPE_USE })
@Retention(RUNTIME)
@Constraint(validatedBy = CustomerExistsValidator.class)
public @interface CustomerExists {
    String message() default "Customer not found";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}
```

**Step 2: The Validator**
```java
@ApplicationScoped
public class CustomerExistsValidator implements ConstraintValidator<CustomerExists, Long> {
    @Inject CustomerRepository repository;

    @Override
    public boolean isValid(Long id, ConstraintValidatorContext context) {
        if (id == null) return true; // Let @NotNull handle mandatoriness
        return repository.findById(id) != null;
    }
}
```

---

## 6. Advanced Attributes: Groups and Payload

*   **Groups**: Allows validating different parts of the object at different times. E.g.:
    ```java
    public interface OnCreate {}
    public interface OnUpdate {}

    public class User {
        @Null(groups = OnCreate.class)
        @NotNull(groups = OnUpdate.class)
        public Long id;
    }
    ```
*   **Payload**: Used to carry metadata. Useful for defining severity:
    ```java
    @NotNull(payload = Severity.Error.class)
    public String criticalField;
    ```

---

## 7. Using Bean Validation without a Framework (Pure Java)

You can use the validation engine manually, which is useful in unit tests or scripts:

```java
ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
Validator validator = factory.getValidator();

Set<ConstraintViolation<OrderDTO>> violations = validator.validate(myOrder);
if (!violations.isEmpty()) {
    violations.forEach(v -> System.out.println(v.getMessage()));
}
```

---

## Senior Tip: Annotation Processor

To avoid silly mistakes like putting `@Past` on an `int` variable, add the **Hibernate Validator Annotation Processor** to your project. It will turn these errors into compilation failures.

```xml
<dependency>
    <groupId>org.hibernate.validator</groupId>
    <artifactId>hibernate-validator-annotation-processor</artifactId>
    <version>9.1.0.Final</version>
</dependency>
```

## Conclusion

Bean Validation is the professional way to ensure the integrity of your data without polluting your code with `if-else`. In Quarkus, this tool gains extra performance thanks to build-time optimizations. Stop writing manual validations and let the Jakarta engine work for you!

---

## Resources
*   [Official Quarkus Guide: Hibernate Validator](https://quarkus.io/guides/validation)
*   [Hibernate Validator 9.1 Reference Guide](https://docs.jboss.org/hibernate/stable/validator/reference/en-US/html_single/)
*   [Jakarta Bean Validation 3.1 Specification](https://jakarta.ee/specifications/bean-validation/3.1/)
