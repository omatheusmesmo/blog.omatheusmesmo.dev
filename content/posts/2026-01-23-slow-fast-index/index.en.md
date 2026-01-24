---
title: "Do you know about slow index and fast index?"
date: 2026-01-23T16:00:00-03:00
draft: false
tags: ["Algorithms", "Java", "Performance", "Tips"]
author: "Matheus Oliveira"
slug: "slow-fast-index"
summary: "Learn how to reduce algorithm complexity from O(n²) to O(n) using the two-pointer technique."
cover:
  image: "two-pointers.svg"
  alt: "Two Pointers Technique Diagram"
  caption: "Diagram visualizing slow and fast index"
  relative: true
---

From time to time, when we need to traverse a linear structure, we end up creating nested loops, which makes the complexity at least quadratic ($O(n^2)$). But did you know there is a simple way to avoid this when comparing elements in sequence?

This is where the **slow** and **fast index** come in. The idea is simple: we use two indices that traverse the structure at the same time, but at different speeds. The fast index examines or explores new elements, while the slow index records or modifies the structure when it meets a desired condition. This allows traversing the structure only once, reducing the complexity to $O(n)$.

## When to use it?

You can use this when you need to:

*   Traverse a linear structure (array, string, or linked list).
*   Detect patterns (palindromes, subarrays, cycles).
*   Compare elements based on distance, frequency, or order.
*   Solve problems in $O(n)$ or $O(\log n)$ without nested loops.

## Practical Example: Removing Duplicates from Sorted Array

In this code, the goal is to modify the original array and count the number of distinct elements without creating new arrays. The index `i` represents the *slow index*, while `j` is the *fast index*. Whenever a new unique element is found, it is moved to the correct position.

### Java Solution

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
        
        return i + 1; // Returns the number of unique elements
    }
}
```

### Input and Output Example:

**Input:** `nums = [0,0,1,1,1,2,2,3,3,4]`  
**Output:** `5`, `nums = [0,1,2,3,4,_,_,_,_,_]`

## Conclusion

The fast and slow index technique is extremely versatile and can be used in strings, arrays, and linked lists. Whenever you find the need to compare elements in sequence, try using this approach! 🚀
