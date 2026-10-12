# LeonardX operations and ecosystem plan

Current developer surfaces are documented in [`LEONARDX_DEVELOPER_PLATFORM_AUDIT.md`](./LEONARDX_DEVELOPER_PLATFORM_AUDIT.md), [`packages/sdk/README.md`](./packages/sdk/README.md), and [`packages/cli/README.md`](./packages/cli/README.md). The SDK and CLI support real API-key project operations; deploy/ship and arbitrary plugin execution remain intentionally unavailable.

Priorities:

1. Authorization/payment/webhook correctness and negative tests.
2. Durable worker lease/scheduler and canonical webhook migration.
3. Staging load, query plans, provider alerts and restore drill.
4. API compatibility, release gates, dependency patching and cost reviews.

No plugin sandbox, Redis service, paid worker, package publication, or provider integration should be added merely to imply maturity.
