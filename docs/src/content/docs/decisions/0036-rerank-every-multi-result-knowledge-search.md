---
title: 'ADR 0036: Rerank every multi-result knowledge search before the agent reads it'
description: Improve the order of search results even when search returns fewer items than requested.
---

## Status

Accepted.

## Context

Knowledge search returns a list ordered by relevance. K is the number of results that the caller
requests.

The position of a result inside K matters. Earlier results are more likely to be read by the agent.
They are also more likely to remain when a later step needs a smaller list.

Vector search finds a broad set of related text. It does not always put the best text first. A
reranker is a model that reads the query and the candidates and improves their order.

The old search flow skipped the reranker when vector search returned K or fewer candidates. This
kept the same candidates but left them in the weaker vector order.

The product owner has seen reranking improve production search without making it worse. The product
accepts the small added cost and delay.

ADR 0004 lets the agent choose its search query. ADR 0019 treats source context and ranking as
product behavior. This decision defines how search orders the text that it returns to the agent.

## Decision

We chose to rerank every knowledge search that returns at least two candidates. This rule also
applies when search returns K or fewer candidates.

We do not rerank one candidate because its position cannot change.

If the reranker is unavailable, search returns the requested number of candidates in vector order.
The rerank trace retains the provider failure. Reranking may improve ordering, but its availability
must not decide whether already-retrieved knowledge reaches the agent.

We use a low-latency reranker by default. We send the query as the agent wrote it. We do not add
extra strategy text to the query.

We send the title, section, and content as YAML. YAML is a text format for named fields. These fields
give the reranker the source context required by ADR 0019.

The reranker improves order. The agent still decides what the results mean. It must resolve
conflicting symptoms and text that says when a procedure does not apply.

The exact model can change without a new ADR. A replacement must keep useful order at K. Evaluations
must show that its cost and delay remain acceptable.

This decision covers search over saved knowledge. It does not cover discovery of agent tools.

## Consequences

- Every search with two or more candidates makes one rerank request.
- Search pays the cost and delay of that request.
- Earlier positions contain stronger evidence than vector order alone can provide.
- A failed rerank degrades ordering to vector order instead of failing knowledge search.
- The agent can still need more than the first result when documents share symptoms.
- Search tests must prove that the reranker ran. A result list alone cannot prove this.
- A model change needs results from realistic retrieval cases.

We will reconsider this design if the agent often fails when the correct text is present in K. We
will also reconsider the default model when another model improves order without too much cost or
delay.

## Evidence

- `src/lib/server/services/knowledge-search/semantic.ts` reranks every set with at least two
  candidates.
- `src/lib/server/services/knowledge-search/reranking.spec.ts` proves that reranker order is used
  when the candidate count is below K and that provider failure preserves vector candidates.
- `src/lib/server/services/knowledge-search/ranking.ts` sends the original query and YAML fields.
- `src/evals/lab/cache/cached-clients.spec.ts` proves that a cached order works with new document IDs
  and changes when document content changes.
- `src/evals/cases/retrieval.ts` separates direct ranking checks from cases where the agent must
  resolve ambiguity.
- Cohere recommends YAML for structured data. It also provides separate quality and low-latency
  model variants: <https://docs.cohere.com/v2/docs/reranking-best-practices> and
  <https://docs.cohere.com/v2/docs/rerank>.

The implementation experiment used one sample for each case. The results show the behavior that
supported this decision. They do not predict pass rates across repeated runs.

| Configuration                               | Result | Finding                                                  |
| ------------------------------------------- | -----: | -------------------------------------------------------- |
| Reranking skipped                           |    3/7 | Vector search found useful text, but its order was weak. |
| Rerank 4 Fast                               |    4/7 | Reranking improved direct order.                         |
| Rerank 4 Fast with extra query instructions |    2/7 | The extra text made the incident query less clear.       |
| Rerank 4 Pro                                |    4/7 | Pro changed some results but did not improve the total.  |
| Rerank 4 Pro with YAML                      |    4/7 | YAML did not resolve negative conditions by itself.      |
| Rerank 4 Fast followed by agent reasoning   |    7/7 | The agent resolved ambiguity from the returned text.     |

The implementation and experiment are recorded in commit
`08b87baddf7dc223b405cce70c7cf872848d5acf`.
