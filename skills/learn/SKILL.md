---
name: learn
description: Teach a feature, module, or project, then test my understanding with questions. Use when I ask to understand, learn, or be quizzed on part of a codebase.
---

# Teach, then quiz

Goal: I should be able to own this code, not just have read a summary of it.

1. Teach (short, and grounded in real files): the purpose, module responsibilities and
   dependencies, the main execution path(s), state transitions and DB interactions, key
   invariants, and failure modes. Explain contracts and relationships, not line by line.
   Cite file:line.
2. Quiz: ask ONE realistic question at a time, then stop and wait for my answer. Mix these kinds:
   - change impact ("If requirement X changes, what has to change?")
   - debugging ("Behavior Y broke. Where do you look first?")
   - state ("What happens if Z runs twice / fails halfway?")
   - ownership ("Which layer owns this rule?")
   - removal ("What breaks if this module changes or goes away?")
3. After my answer: say what's right, what's missing or wrong, and point to the code that shows
   it. If I'm stuck, give a hint first, and reveal the answer only if I ask or I'm still stuck
   after the hint.
4. Raise the difficulty as I get answers right. After about 5 questions, or when I stop, list my
   weak spots and the files to reread.
