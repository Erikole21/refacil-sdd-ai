# Backend Checklist — Refacil Team

> Complements the [general checklist](checklist.md). Applies to **backend** repositories (APIs, microservices, workers, queues).
> Detection: if the project has server frameworks (HTTP, gRPC, messaging), microservice structure, or database access, apply this checklist.
> Mark N/A in sections that do not apply to the change being reviewed (e.g. queues if the change does not touch messaging).

## B1. Input validation
- Endpoint DTOs/input objects use the framework's automatic validation mechanism
- Each field declares its type and constraints (required, format, range)
- Endpoints named in kebab-case (`get-user-info`, `create-payment`)
- Client data is not trusted without validation (query params, headers, body)

## B2. API contracts
- Responses use a consistent structure (do not return different formats depending on the case)
- HTTP codes are correct and specific (not everything is 200 or 500)
- Response DTOs do not expose internal fields (DB IDs, audit fields, internal relationships)
- If the endpoint is consumed by another service: verify that no breaking changes are introduced in the contract (renamed, removed, or differently-typed fields)
- Errors return a standard format with a message understandable to the consumer

## B3. Error handling (Refacil standard)
- No nested or multiple try/catch blocks in the same request thread
- Errors are captured, logged, and formatted responses are returned
- New modules/services use the project's global exception filter or middleware (if it exists)
- Client errors (4xx) are distinguished from server errors (5xx)
- External dependency errors (APIs, DB, queues) are handled with their own messages, not propagated as-is to the consumer

## B4. Architecture and patterns
- **Layer responsibility**: no business logic in the transport layer (controllers/handlers) or in the infrastructure layer (repositories/adapters)
- DTOs are in the correct layer (input in transport, output in application)
- Repository Pattern for data access (if the project has a base repository, new ones extend it)
- If it is a new microservice, follows the structure defined in AGENTS.md (hexagonal, clean architecture, etc.)
- Dependencies flow in the correct direction according to the project architecture

## B5. Concurrency and atomicity
- Operations that modify multiple records or tables use DB transactions (all or nothing)
- Critical write endpoints (payments, transfers, order creation) are **idempotent**: if retried, they do not duplicate the effect
  ```
  // Pattern: check if the operation was already executed before processing it
  IF operationExists(idempotencyKey) THEN return existing_result
  ELSE execute operation AND save result with idempotencyKey
  ```
- If multiple processes can modify the same resource simultaneously, distributed locks or optimistic versioning are used to avoid race conditions
- Read-modify-write operations are atomic (not read, process in memory and write without protection)

## B6. DB queries
- No loops to fetch information from different data sources
- If cross-data is needed, create a function that uses JOINs or internally optimized queries
- Queries use appropriate indexes
- No N+1 queries
- No SQL/NoSQL injection possible (parameterized queries with the project's ORM/driver)
- **Schema (DDL)**: by default, do not use TypeORM's migration system or `synchronize` to apply or version DB changes (neither `MigrationInterface`, nor relying on `migration:run` / `migration:generate` in the app deployment flow). Schema changes are delivered as **explicit scripts** (e.g. versioned `.sql` files under the repo convention) so **whoever operates the engine** executes them **manually and separately** in each environment (Postgres, MySQL, etc.). **Exception**: if `AGENTS.md` **explicitly** defines another mechanism as a rule for **that** repository (e.g. TypeORM migrations or another agreed pipeline), mark this bullet as **N/A** and only verify the change complies with what is documented there (without requiring manual scripts).
- If the default policy applies (manual scripts): the delivered schema scripts document execution order, are reversible or describe rollback, and do not destroy existing data without an explicit plan. If the exception applies via `AGENTS.md`, mark **N/A** or evaluate according to what that file requires for migrations.

## B7. Caching
- Repetitive DB queries use **distributed** cache (not in-process memory cache — avoid restarts due to RAM exhaustion)
- The pattern is: check cache -> if not found, query DB -> save to cache with TTL
- Cache keys are specific and predictable (include the parameters that make the query unique)
- Cache is invalidated when underlying data changes (if applicable)
- TTL is appropriate for the data type (configuration: long, transactional data: short or no cache)

## B8. Resilience and connections
- All external calls (HTTP, gRPC, DB, queues) have **configured timeout** (do not wait indefinitely)
- If an external dependency fails, the response degrades gracefully (fallback, clear error message, retry)
- Connection pooling in DB and HTTP clients (do not open/close a connection per request)
- Connections are properly released (in finally blocks or equivalent)
- If the project uses circuit breaker, calls to unstable services implement it

## B9. Queues and messaging (if applicable)
- Consumers are **idempotent**: processing the same message twice does not duplicate the effect
- Processing is acknowledged (ack) **after** completing the operation, not before
- Messages that fail repeatedly go to a dead letter queue (they are not lost or stuck in the queue)
- Producers do not lose messages if the queue is unavailable (retry or local persistence)
- Message payloads contain enough information to be processed without unnecessary additional queries

## B10. Performance
- Heavy or long-running operations are asynchronous (queues, workers, background jobs)
- No obvious memory leaks (subscriptions without unsubscribe, listeners without cleanup, unclosed connections, uncanceled timers)
- Endpoints with heavy responses use pagination
- Complete DB relationships are not loaded if only specific fields are needed (specific select)

## B11. Logging (Refacil standard)
- The project's centralized logger is used (not direct console prints), if already present in the repository
- Critical business operations (sales, transactions, payments) have logs
- Specific and necessary properties are logged — never complex objects or entities with full relationships
- Catch logs contain enough information to diagnose the error (what failed, with what data, in what context)
- Logs have appropriate level: error for failures, warn for recoverable unexpected situations, info for critical business flows

## B12. Backend testing
- Integration tests with a real DB for repositories and complex queries (not just mocks)
- API contract tests (valid request returns expected structure, invalid request returns formatted error)
- Error case tests (dependency down, timeout, invalid data)
- If there is critical concurrency: tests that validate idempotency or atomicity
