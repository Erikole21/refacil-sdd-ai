# Testing Patterns — Reference

> **NOTE**: This file is a generic reference. Generated tests must follow
> the actual project patterns (detected automatically). If the project already has
> tests, those patterns take priority over the ones in this file.

## Test file structure

The location of tests depends on the project. Common patterns:

```
# Same directory (common in JS/TS, Go, Rust)
file.ts          → file.spec.ts / file.test.ts
file.go          → file_test.go

# Separate directory (common in Java, Python, some JS/TS)
src/service.java   → test/service_test.java
src/module.py      → tests/test_module.py
```

## Universal principles

### Arrange-Act-Assert (AAA)
```
// Arrange — prepare data and mocks
// Act — execute the operation
// Assert — verify the result
```

### Naming conventions
```
# Recommended format (adapt to language/framework):
should [verb] [result] when [condition]

# Examples:
"should return product when valid id is provided"
"should throw error when input is empty"
"should update status when payment is confirmed"
```

## Anti-patterns to avoid

- Do NOT test private properties/methods directly
- Do NOT test internal implementation (call order) unless critical
- Do NOT create tests without assertions
- Do NOT create tests that depend on execution order
- Do NOT mock everything — only system boundaries (DB, external APIs, filesystem)
- Do NOT create brittle tests that break with cosmetic changes
- Do NOT duplicate the code logic in the test (the test must verify behavior, not re-implement)

## Mocks and Stubs

Mock only what is outside the test's control:
- Database calls
- External APIs / HTTP services
- File system (if applicable)
- Message queues
- Loggers (when they interfere with output)

Do not mock:
- Pure functions of the module itself
- DTOs, mappers, utilities without side effects
- Constants or static configuration
