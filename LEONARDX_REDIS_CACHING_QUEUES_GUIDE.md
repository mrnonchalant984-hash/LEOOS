# LeonardX Redis, caching and queues guide

No Redis service is currently configured. Do not add one until measured multi-instance coordination, cache, or queue requirements justify its cost and operations. Never cache authorization, credits or payment ledger state as the source of truth. Current durable primitives are Supabase tables/functions and the opt-in `agent_jobs` queue. See [`LEONARDX_QUEUES_AND_WORKERS_DESIGN.md`](./LEONARDX_QUEUES_AND_WORKERS_DESIGN.md).

Official references: [Redis](https://redis.io/docs/latest/), [BullMQ](https://docs.bullmq.io/guide/queues), [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting).
