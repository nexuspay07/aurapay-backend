# Phase 12D.1 operational requirements

Phase 12D.1 declares database indexes but never creates, replaces, or removes
them. Automatic index creation is disabled on `ProviderWebhookEvent`, `Event`,
`Transaction`, and `Settlement` so application startup and tests cannot perform
an implicit migration.

Fresh databases therefore require an explicit, separately reviewed index
provisioning procedure for every index declared by those schemas. In an
existing database, the duplicate-Settlement audit must return zero before the
non-unique `transaction_1` index is replaced through a separately approved
migration. Phase 12D.1 does not supply or run that migration.

Financial readiness reads the actual index catalog, performs a bounded
duplicate audit, and executes a read-only transaction probe. Missing or
incorrect indexes leave financial processing unavailable while Phase 12C
webhook reception can remain operational.

Readiness is currently a startup snapshot. Phase 12D.2 must not treat the
in-memory result as permanent authorization: it must prevent stale readiness
from authorizing financial processing after index or database capability
changes.
