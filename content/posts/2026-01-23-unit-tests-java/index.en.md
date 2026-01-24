---
title: "Unit Tests in Java - Introduction"
date: 2026-01-23T17:50:00-03:00
draft: false
tags: ["Java", "Testing", "JUnit", "Mockito"]
author: "Matheus Oliveira"
slug: "unit-tests-java"
summary: "A complete beginner's guide to unit testing in Java, covering concepts, best practices, and examples with JUnit 5 and Mockito."
cover:
  image: "unit-tests.png"
  alt: "Testing errors"
  caption: "Testing errors"
  relative: true
---

## 1. What are Unit Tests?

### Definition
Unit tests are automated tests that verify the behavior of a small unit of code, usually a function or method, in isolation.

### Objective
To ensure that each part of your code works correctly independently.

### Benefits
*   **Early bug detection:** Find errors quickly, before they propagate to other parts of the system.
*   **Safe refactoring:** Change code with confidence, knowing that tests will alert you if something breaks.
*   **Living documentation:** Tests serve as examples of how the code should work.
*   **Better design:** Writing tests forces you to think about how the code should be used, leading to a cleaner and more modular design.

---

## 2. Best Practices for Unit Tests

### AAA (Arrange, Act, Assert)
*   **Arrange:** Set up the test environment, creating objects, mocks, and defining the initial state.
*   **Act:** Execute the unit of code you are testing.
*   **Assert:** Verify if the execution result is as expected.

### FIRST
*   **Fast:** Tests should run quickly so as not to hinder the development flow.
*   **Independent:** Each test should be independent of others. Execution order should not matter.
*   **Repeatable:** Tests should produce the same result every time they are executed.
*   **Self-validating:** Tests should be able to determine if they passed or failed without human intervention.
*   **Thorough:** Tests should cover all possible scenarios, including success and failure cases.

### Code Coverage
*   **Objective:** Measure the percentage of your code exercised by tests.
*   **Importance:** High coverage indicates that your tests are checking a large part of the code.
*   **Caution:** High coverage does not guarantee quality, but it is a good indicator.

### Descriptive Names
*   **Clarity:** Test names should clearly describe what is being tested.
    *   *Example:* `addItem_ValidItem_ReturnsSavedItem` is better than `test1`.

### Isolation
*   **Mocks:** Use mocks to isolate the unit of code you are testing from its dependencies.
*   **Objective:** Test only the logic of the unit, not the behavior of dependencies.

### Edge Cases
*   **Importance:** Test the limits of your code, such as minimum values, check if the code handles invalid inputs or error situations correctly.
*   **Example:** Testing if an exception is thrown when a null value is passed.

### Test Refactoring
*   **DRY (Don't Repeat Yourself):** If you have repeated code in your tests, refactor it.
*   **Helper Methods:** Create helper methods to set up the test environment or create example objects.

### Use the Right Tools
*   **JUnit 5:** Testing framework for Java.
*   **Mockito:** Framework for creating mocks in Java.
*   **AssertJ:** Library for more readable and powerful assertions.

---

## 3. Practical Example (Java with JUnit 5 and Mockito)

Suppose you have a `Calculator` class with an `add` and `divide` method:

```java
public class Calculator {
    public int add(int a, int b) {
        return a + b;
    }

    public int divide(int a, int b){
        if(b == 0){
            throw new ArithmeticException("Cannot divide by zero");
        }
        return a / b;
    }
}
```

Here is how you can write unit tests for it:

```java
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class CalculatorTest {

    private Calculator calculator;

    @BeforeEach
    void setUp() {
        calculator = new Calculator();
    }

    @Test
    void add_TwoPositiveNumbers_ReturnsSum() {
        // Arrange
        int a = 5;
        int b = 3;
        int expectedSum = 8;

        // Act
        int actualSum = calculator.add(a, b);

        // Assert
        assertEquals(expectedSum, actualSum);
    }

    @Test
    void add_OneNegativeNumber_ReturnsSum() {
        // Arrange
        int a = 5;
        int b = -3;
        int expectedSum = 2;

        // Act
        int actualSum = calculator.add(a, b);

        // Assert
        assertEquals(expectedSum, actualSum);
    }

    @Test
    void divide_ValidDivision_ReturnsResult(){
        //Arrange
        int a = 10;
        int b = 2;
        int expectedResult = 5;

        //Act
        int actualResult = calculator.divide(a,b);

        //Assert
        assertEquals(expectedResult, actualResult);
    }

    @Test
    void divide_DivisionByZero_ThrowsArithmeticException(){
        //Arrange
        int a = 10;
        int b = 0;

        //Act & Assert
        assertThrows(ArithmeticException.class, () -> calculator.divide(a,b));
    }
}
```

### Explanation of the Example:
*   `@BeforeEach`: The `setUp` method is executed before each test, creating a new instance of `Calculator`.
*   `@Test`: Indicates that a method is a test.
*   `assertEquals()`: Verifies if two values are equal.
*   `assertThrows()`: Verifies if an exception is thrown.
*   **Descriptive Names**: The test names clearly indicate what is being tested.

---

I hope this was a fruitful reading for you, leave your comment and share if you want more people to see this content.

See you next time!
