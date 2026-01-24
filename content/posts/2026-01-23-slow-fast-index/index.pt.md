---
title: "Você conhece o slow index e o fast index?"
date: 2026-01-23T16:00:00-03:00
draft: false
tags: ["Algoritmos", "Java", "Performance", "Dicas"]
author: "Matheus Oliveira"
slug: "slow-fast-index"
summary: "Aprenda como reduzir a complexidade de algoritmos de O(n²) para O(n) usando a técnica de dois ponteiros."
description: "Aprenda como reduzir a complexidade de algoritmos de O(n²) para O(n) usando a técnica de dois ponteiros."
cover:
  image: "two-pointers.svg"
  alt: "Diagrama da técnica de dois ponteiros"
  caption: "Diagrama visualizando o índice lento e o índice rápido"
  relative: true
---

De tempos em tempos, quando precisamos percorrer uma estrutura linear, acabamos criando laços aninhados, o que torna a complexidade no mínimo quadrática ($O(n^2)$). Mas sabia que existe uma forma simples de evitar isso para comparar elementos em sequência? 

É aqui que entra o **slow** e o **fast index**. A ideia é simples: usamos dois índices que percorrem a estrutura ao mesmo tempo, mas com velocidades diferentes. O índice rápido (*fast index*) examina ou explora novos elementos, enquanto o índice lento (*slow index*) registra ou modifica a estrutura quando encontra uma condição desejada. Isso permite percorrer a estrutura apenas uma vez, reduzindo a complexidade para $O(n)$.

## Quando usar?

Você pode usar isso quando precisa:

*   Percorrer uma estrutura linear (array, string ou lista encadeada).
*   Detectar padrões (palíndromos, subarrays, ciclos).
*   Comparar elementos com base em distância, frequência ou ordem.
*   Resolver problemas em $O(n)$ ou $O(\log n)$ sem laços aninhados.

## Exemplo Prático: Removendo Duplicatas de um Array Ordenado

Neste código, o objetivo é alterar o array original e contar o número de elementos distintos sem criar novos arrays. O índice `i` representa o *slow index*, enquanto `j` é o *fast index*. Sempre que um novo elemento único é encontrado, ele é movido para a posição correta.

### Solução em Java

```java
public class Solution {
    public int removeDuplicates(int[] nums) {
        if (nums.length == 0) return 0;
        
        int i = 0; // Slow index
        
        for (int j = 1; j < nums.length; j++) { // Fast index
            if (nums[j] != nums[i]) {
                i++;
                nums[i] = nums[j];
            }
        }
        
        return i + 1; // Retorna o número de elementos únicos
    }
}
```

### Exemplo de Entrada e Saída:

**Input:** `nums = [0,0,1,1,1,2,2,3,3,4]`  
**Output:** `5`, `nums = [0,1,2,3,4,_,_,_,_,_]`

## Conclusão

A técnica de índice rápido e lento é extremamente versátil, podendo ser usada em strings, arrays e listas encadeadas. Sempre que você perceber a necessidade de comparar elementos em sequência, experimente usar essa abordagem! 🚀
