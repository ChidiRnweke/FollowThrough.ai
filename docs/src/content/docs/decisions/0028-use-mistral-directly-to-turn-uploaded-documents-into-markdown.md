---
title: "ADR 0028: Use Mistral directly to turn uploaded documents into Markdown"
description: Preserve reading order and document structure before indexing uploaded files.
---

# ADR 0028: Use Mistral directly to turn uploaded documents into Markdown

## Status

Accepted.

## Context

Search cannot use a PDF, office document, ebook, screenshot, or scan until the application extracts
ordered text and structure. This conversion determines most of what later retrieval can find.

A simple text parser or image fallback does not provide the same document result. The OpenRouter
path also does not expose the full Mistral document-processing contract used here.

## Decision

We chose to call Mistral Document AI directly and use its ordered Markdown as the input to indexing.

If OCR fails, the attachment reports failure. We do not silently replace it with a weaker parser.

We will keep the direct provider call while other provider paths do not offer the required result.

## Consequences

- Uploaded documents keep useful reading order and structure for search.
- OCR failure is visible and retryable.
- The application needs a separate Mistral key.
- Mistral must be able to fetch the signed object-storage URL.
- Changing OCR providers requires a quality comparison of produced Markdown.

## Evidence

- Attachment processing calls Mistral OCR directly.
- Configuration requires `MISTRAL_API_KEY` separately from OpenRouter.
- Self-hosting docs require object storage reachable by Mistral.
- Commit `4eae319` records the direct-provider choice and no-fallback rule.
