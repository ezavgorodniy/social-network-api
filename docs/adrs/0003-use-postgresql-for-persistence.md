# 3. Use PostgreSQL for persistence

## Status

Accepted

## Context

The core data is strongly relational. A comment belongs to a post, and a reply
belongs to a parent comment — a self-referential relationship that forms threads.
The system needs:

- Referential integrity between posts, comments, and replies.
- Indexed lookups of comments by post, with ordered, cursor-based pagination.
- A uniqueness guarantee on `(platform, externalId)` so that re-syncing the same
  comment from an external platform is idempotent.

We considered the main storage families against these needs.

- **PostgreSQL (relational)** — first-class foreign keys, self-referential
  relations for threaded replies, composite unique constraints, and secondary
  indexes for the read paths. Mature, ubiquitous, strong consistency, excellent
  tooling and hosting options. Rich types (e.g. `jsonb`, arrays) leave room for
  future platform-specific metadata without a rigid schema everywhere.
- **MySQL / MariaDB (relational)** — would also satisfy the relational needs and
  is equally battle-tested. The decision between it and PostgreSQL is largely
  ecosystem preference; we favour PostgreSQL for its stronger support of advanced
  types and constraints and its first-class support in our chosen ORM.
- **MongoDB (document)** — flexible schema, but our data is inherently relational.
  We would reimplement joins and integrity checks in application code, and
  enforcing cross-document uniqueness for idempotent sync is awkward and
  error-prone.
- **Key-value store (e.g. Redis, DynamoDB)** — excellent for point lookups and
  caching, but a poor fit for the ordered, filtered, paginated relational queries
  this API needs as its primary access pattern.

## Decision

We use **PostgreSQL** as the primary datastore. The schema models `Post` and
`Comment` with a foreign key from comment to post and a nullable self-relation
(`parentCommentId`) for replies. A composite unique constraint on
`(platform, externalId)` makes ingesting the same platform comment idempotent,
and indexes on `postId` and `parentCommentId` support the read paths.

## Consequences

- The relational model directly expresses the domain (posts, comments, threaded
  replies) with database-enforced integrity.
- Idempotent sync is guaranteed at the storage layer, not reimplemented in
  application code.
- We take on a PostgreSQL operational dependency for real deployments; CI runs a
  real PostgreSQL service container so integration tests exercise it faithfully,
  while unit and e2e tests use an in-memory repository (see the repository-pattern
  and testing ADRs).
- Choosing PostgreSQL over MySQL is a soft preference; a future team standard
  could revisit it via a new ADR without disturbing the repository abstraction.
