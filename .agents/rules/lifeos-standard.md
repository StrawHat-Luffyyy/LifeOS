---
trigger: model_decision
---

# LifeOS Project Standards

- Treat this repository as the LifeOS application and follow its existing architecture, conventions, and documentation.
- Read the relevant existing code, README, PRD, and configuration before making significant changes.
- Preserve the current architecture unless the requested change genuinely requires an architectural change.
- Prefer small, modular, maintainable changes over rewrites.
- Keep business logic separate from UI, data access, integrations, and infrastructure concerns.
- Reuse existing components, utilities, types, services, and patterns before creating new ones.
- Do not introduce dependencies when the existing stack can solve the problem cleanly.
- Keep data models, API contracts, validation, and application state consistent across the system.
- Treat authentication, authorization, user data, API keys, and other sensitive information securely.
- Never hard-code secrets or expose sensitive data in client-side code, logs, commits, or responses.
- Validate user-controlled input at system boundaries and handle expected failures explicitly.
- For UI work, maintain responsive behavior, accessibility, visual consistency, and good loading/error/empty states.
- Avoid unnecessary redesigns or unrelated refactoring while implementing a requested feature.
- Before modifying database schemas or migrations, inspect existing schema dependencies and consider backward compatibility.
- For AI/LLM functionality, keep model access, prompts, tool calling, validation, and application logic modular and replaceable.
- Add or update tests for meaningful behavioral changes.
- Run appropriate linting, type checking, tests, and builds after significant changes.
- Use browser tooling to verify important UI behavior when available.
- Do not claim that something works unless it has actually been verified.
- Before significant or irreversible changes, explain the approach and relevant trade-offs.
- At completion, report what changed, what was verified, and any remaining limitations or risks.