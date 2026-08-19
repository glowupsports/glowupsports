---
name: Raw SQL result normalization
description: Driver-specific result shapes returned by Drizzle raw SQL execution in the Supabase runtime.
---

When consuming `db.execute(sql\`...\`)` results, support both an array result and a result object with a `rows` array before iterating.

**Why:** The Supabase PostgreSQL runtime used by tests returns a wrapped result object, while code written against an array-only shape fails at runtime even though the SQL is valid.

**How to apply:** Normalize the return shape at raw-SQL boundaries. Prefer the project query builder where it can express the query cleanly; preserve this normalization for metric/reporting queries that require raw SQL.