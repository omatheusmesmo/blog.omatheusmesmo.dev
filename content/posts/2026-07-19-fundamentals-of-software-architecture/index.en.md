---
title: "Software Architecture Fundamentals: the 3 laws and 8 expectations every developer should know"
date: 2026-07-19T09:00:00-03:00
draft: false
tags: ["Software Architecture", "Java", "Trade-offs", "Mark Richards", "Neal Ford", "Architecture Characteristics"]
author: "Matheus Oliveira"
slug: "fundamentals-of-software-architecture-chapter-1"
summary: "Everything in software architecture is a trade-off. A deep dive into Chapter 1 of Fundamentals of Software Architecture: the 3 laws that govern every architectural decision and the 8 expectations of an architect."
description: "A practical breakdown of Chapter 1 from Fundamentals of Software Architecture (2nd Edition) by Mark Richards and Neal Ford. Covers the 4 dimensions that define software architecture, why architectural characteristics matter more than non-functional requirements, the 3 universal laws of architecture (and their corollaries), and the 8 core expectations of a software architect, from making decisions to navigating organizational politics."
cover:
  image: "cover.png"
  alt: "Minimalist diagram showing four interconnected pillars labeled Style, Characteristics, Components, and Decisions, on a dark background"
  caption: "The 4 dimensions of software architecture: style, characteristics, components, and decisions"
  relative: true
---

You have probably heard someone say: "AI is coming for developers, so I should move into architecture." It sounds logical, until you realize that architecture is exactly the kind of work AI struggles with the most: making contextual trade-off decisions in complex, shifting environments. That is the opening argument of *Fundamentals of Software Architecture* by Mark Richards and Neal Ford, and it sets the tone for the entire book.

This article covers the core ideas from Chapter 1: what software architecture actually is, the 3 universal laws that govern every decision, and the 8 things expected of any architect, whether they have the title or not.

---

## What is Software Architecture?

Software architecture is defined by **4 dimensions**:

| Dimension | What it defines | Analyzed when |
|-----------|----------------|---------------|
| **Architecture Characteristics** | Capabilities of the system (-ilities) | First |
| **Logical Components** | Behavior of the system (domain) | Second |
| **Architecture Style** | Structural blueprint for implementation | After the two above |
| **Architecture Decisions** | Rules and constraints for construction | Throughout |

The order matters. You start with characteristics and components, then choose a style, and document decisions along the way. Skipping ahead to pick a style (like microservices) before understanding what the system actually needs to do is a recipe for over-engineering.

---

## Architecture Characteristics (-ilities)

These define the **capabilities** of a system: what it must be good at. Think performance, scalability, security, testability, observability.

The book avoids the term "non-functional requirements" on purpose. That label is self-deprecating (who wants to work on something "non-functional"?) and misleading. Architectural characteristics are critical to success, not secondary concerns.

### What makes something an architectural characteristic?

Three criteria must be met simultaneously:

1. **It is non-domain** (not a business feature)
2. **It influences structure** (requires a structural decision, not just a design tweak)
3. **It is critical to success** (if it fails, the system fails)

Example: *security* can sometimes be solved with design choices (hashing, encryption) in a simple monolith, so it might not be a structural characteristic. But *scalability* cannot be solved with design alone; it requires distributing the system, which is a structural change. That makes it an architectural characteristic.

### Implicit vs. Explicit

- **Implicit**: never appears in requirements documents, but is essential (availability, maintainability). No product manager asks for it, but the architect must identify it.
- **Explicit**: appears in requirements or direct instructions (response time under 200ms).

### Trade-offs are unavoidable

Every characteristic you add increases complexity. They are **synergistic**: changing one impacts all others. Improve security (more encryption) and you hurt performance.

> "Never strive for the *best* architecture; aim for the *least worst* architecture."

Architecture is about minimizing the worst-case scenario, not maximizing every quality at once.

---

## The 3 Laws of Software Architecture

Richards and Ford originally set out to find 10 or 15 universal truths. They found only 2 in the first edition, and uncovered a third while writing the second. These 3 laws inform everything else in the book.

### First Law: Everything is a trade-off

> "Everything in software architecture is a trade-off."

Every decision aarchitect makes must account for variables that change depending on context. Trade-offs are the essence of architecture.

**Corollary 1:** If you think you found something that is *not* a trade-off, you probably just haven't identified the trade-off yet.

- Use caching? Better performance, but eventual consistency.
- Monolith? Operational simplicity, but hard to scale teams.
- Microservices? Deploy scalability, but insane operational complexity.

**Corollary 2:** You can't do trade-off analysis once and be done.

Contexts change. What works in project A can be catastrophic in project B. Teams that try to create a single standard (like "we always use choreography") discover it works sometimes and fails spectacularly others.

### Second Law: "Why" is more important than "how"

> "_Why_ is more important than _how_."

An experienced architect can understand *how* an unfamiliar architecture works. But understanding *why* specific decisions were made requires knowing the context: the trade-offs considered, the constraints at play, the alternatives rejected.

This is why Architecture Decision Records (ADRs) matter. Without documenting the "why", you risk:
- Redoing decisions that were already evaluated and rejected
- Breaking something that worked for a reason you don't understand

### Third Law: Most decisions are not binary

> "Most architecture decisions aren't binary but rather exist on a spectrum between extremes."

Decisions rarely are "this or that". They exist on a spectrum:

```
Monolith -> Modular Monolith -> Service-Based -> Microservices
```

Where you land depends on context. This connects directly to the First Law: if everything is a trade-off, decisions are about *where on the spectrum* you want to be, not about picking an extreme.

### How the 3 laws connect

1. **Everything is a trade-off** (foundation)
2. **That's why "why" matters** (trade-offs explain the context behind a decision)
3. **And why decisions are spectrums** (trade-offs are rarely absolute)

Together, these laws say: *architecture is contextual, continuous decision-making with no universal answer.*

---

## The 8 Expectations of a Software Architect

These apply regardless of title, role, or job description.

### 1. Make architecture decisions

**Guide**, don't specify. Deciding "use a reactive framework for the frontend" is architectural. Deciding "use React" is technical. The exception: when a specific technology choice is needed to preserve a characteristic like performance or scalability.

### 2. Continually analyze the architecture

*Architecture vitality* means assessing how viable an architecture defined 3+ years ago still is today. Most architects don't spend enough energy on this, and the result is *structural decay*: code changes that silently erode characteristics like performance and availability.

Also: if it takes weeks to test and months to release, the architecture is not agile, no matter how clean the code looks.

### 3. Keep current with trends

Architects' decisions are long-lasting and hard to reverse. Understanding trends (cloud, generative AI, platform engineering) helps make decisions that stay relevant.

### 4. Ensure compliance with decisions

If you decide that only the Business and Services layers can access the database, and a UI developer bypasses that for performance, the architecture fails. Compliance must be verified continuously, ideally with automated fitness functions.

### 5. Understand diverse technologies

Focus on **breadth**, not depth. Knowing the pros and cons of 10 caching products is more valuable than being an expert in 1. Modern environments are heterogeneous.

### 6. Know the business domain

An architect at a bank who doesn't understand financial terms loses credibility fast. The best architects combine broad technical knowledge with strong domain expertise. They can talk to C-level executives in their language.

### 7. Possess interpersonal skills

> "No matter what they tell you, it's always a people problem." (Gerald Weinberg)

Leadership skills are *at least half* of what makes an architect effective. The market is flooded with architects; those with strong soft skills stand out.

### 8. Navigate organizational politics

Almost every architectural decision will be challenged. Unlike a developer choosing a design pattern (no approval needed), an architect deciding to create application silos will face objections from product owners, PMs, stakeholders, and other developers. Negotiation skills are not optional.

---

## The Big Takeaway

Architecture, like art, can only be understood in context. In 2002, microservices would have been inconceivably expensive (50 Windows licenses, 30 app server licenses, 50 database licenses). Today they are viable because of open source and DevOps. **All architectures are products of their context.**

Keep that in mind. There is no universally "best" architecture. There is only the architecture that fits your constraints, your team, your timeline, and your trade-offs.

---

*This article is based on Chapter 1 of [Fundamentals of Software Architecture](https://www.oreilly.com/library/view/fundamentals-of-software/9781098134464/) by Mark Richards and Neal Ford (2nd Edition, 2025).*
