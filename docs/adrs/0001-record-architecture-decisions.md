# 1. Record architecture decisions

## Status

Accepted

## Context

This project makes a number of significant design choices — framework,
persistence, ORM, data-access pattern, platform abstraction, authentication,
testing, and CI. Decisions like these lose their rationale over time unless they
are written down. A reader (a teammate, a reviewer, or our future selves) needs
to understand not just *what* was built but *why* each choice was made and what
alternatives were weighed.

These decisions have already evolved during planning (for example, the framework
choice changed as scope grew), which makes a lightweight, explicit record of each
decision and its status especially valuable.

## Decision

We record architecturally significant decisions as Architecture Decision Records
(ADRs), following Michael Nygard's format: each ADR has **Status**, **Context**,
**Decision**, and **Consequences** sections. ADRs are numbered sequentially and
stored in `docs/adrs/`.

- Each ADR begins life with `Status: Proposed` and moves to `Status: Accepted`
  only once the decision is agreed.
- ADRs are immutable once accepted; a decision that changes later gets a new ADR
  that supersedes (and references) the old one, rather than editing history.
- Each ADR is committed individually so the decision history stays granular.

## Consequences

- The rationale behind each major choice lives next to the code and is reviewable
  in isolation.
- The `Status` field makes it clear which decisions are settled versus still open,
  which matters because our decisions have changed during planning.
- Readers can follow the decision trail without reverse-engineering it from the
  source or from chat history.
- There is a small ongoing cost: significant decisions must be written up rather
  than left implicit.
