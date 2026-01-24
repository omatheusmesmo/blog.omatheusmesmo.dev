---
title: "Testes Unitários em Java - Introdução"
date: 2026-01-23T17:50:00-03:00
draft: false
tags: ["Java", "Testing", "JUnit", "Mockito"]
author: "Matheus Oliveira"
slug: "testes-unitarios-java"
summary: "Um guia completo para iniciantes sobre testes unitários em Java, cobrindo conceitos, melhores práticas e exemplos com JUnit 5 e Mockito."
cover:
  image: "unit-tests.png"
  alt: "Testing errors"
  caption: "Testing errors"
  relative: true
---

## 1. O que são Testes Unitários?

### Definição
Testes unitários são testes automatizados que verificam o comportamento de uma pequena unidade de código, geralmente uma função ou método, de forma isolada.

### Objetivo
Garantir que cada parte do seu código funcione corretamente de forma independente.

### Benefícios
*   **Detecção precoce de bugs:** Encontre erros rapidamente, antes que eles se propaguem para outras partes do sistema.
*   **Refatoração segura:** Altere o código com confiança, sabendo que os testes vão te alertar se algo quebrar.
*   **Documentação viva:** Os testes servem como exemplos de como o código deve funcionar.
*   **Melhor design:** Escrever testes te força a pensar em como o código deve ser usado, levando a um design mais limpo e modular.

---

## 2. Melhores Práticas para Testes Unitários

### AAA (Arrange, Act, Assert)
*   **Arrange (Preparar):** Configure o ambiente de teste, criando objetos, mocks e definindo o estado inicial.
*   **Act (Agir):** Execute a unidade de código que você está testando.
*   **Assert (Afirmar):** Verifique se o resultado da execução é o esperado.

### FIRST
*   **Fast (Rápido):** Os testes devem rodar rapidamente para não atrapalhar o fluxo de desenvolvimento.
*   **Independent (Independente):** Cada teste deve ser independente dos outros. A ordem de execução não deve importar.
*   **Repeatable (Repetível):** Os testes devem produzir o mesmo resultado sempre que forem executados.
*   **Self-validating (Auto-validável):** Os testes devem ser capazes de determinar se passaram ou falharam sem intervenção humana.
*   **Thorough (Completo):** Os testes devem cobrir todos os cenários possíveis, incluindo casos de sucesso e falha.

### Cobertura de Código
*   **Objetivo:** Medir a porcentagem do seu código que é exercitada pelos testes.
*   **Importância:** Uma alta cobertura indica que seus testes estão verificando uma grande parte do código.
*   **Cuidado:** Cobertura alta não garante qualidade, mas é um bom indicador.

### Nomes Descritivos
*   **Clareza:** Os nomes dos testes devem descrever claramente o que está sendo testado.
    *   *Exemplo:* `addItem_ValidItem_ReturnsSavedItem` é melhor que `test1`.

### Isolamento
*   **Mocks:** Use mocks para isolar a unidade de código que você está testando de suas dependências.
*   **Objetivo:** Testar apenas a lógica da unidade, não o comportamento das dependências.

### Testes de Borda (Edge Cases)
*   **Importância:** Teste os limites do seu código, como valores mínimos, verifique se o código lida corretamente com entradas inválidas ou situações de erro.
*   **Exemplo:** Testar se uma exceção é lançada quando um valor nulo é passado.

### Refatoração de Testes
*   **DRY (Don't Repeat Yourself):** Se você tem código repetido nos seus testes, refatore-o.
*   **Métodos Auxiliares:** Crie métodos auxiliares para configurar o ambiente de teste ou criar objetos de exemplo.

### Usar as ferramentas corretas
*   **JUnit 5:** Framework de testes para Java.
*   **Mockito:** Framework para criar mocks em Java.
*   **AssertJ:** Biblioteca para asserções mais legíveis e poderosas.

---

## 3. Exemplo Prático (Java com JUnit 5 e Mockito)

Vamos supor que você tenha uma classe `Calculator` com um método `add` e `divide`:

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

Aqui está como você pode escrever testes unitários para ela:

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

### Explicação do Exemplo:
*   `@BeforeEach`: O método `setUp` é executado antes de cada teste, criando uma nova instância de `Calculator`.
*   `@Test`: Indica que um método é um teste.
*   `assertEquals()`: Verifica se dois valores são iguais.
*   `assertThrows()`: Verifica se uma exceção é lançada.
*   **Nomes Descritivos**: Os nomes dos testes indicam claramente o que está sendo testado.

---

Espero que tenha sido uma leitura proveitosa para ti, deixe seu comentário e compartilhe se deseja que mais pessoas vejam esse conteúdo.

Até a próxima!