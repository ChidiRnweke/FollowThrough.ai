# Chat run images

## Meaning and entry paths

This covers image input in W17.01/W17.04/W17.05. A user can attach images, and the application can
supply images such as diagram renders. Both channels share the existing four-image and combined
10 MiB budget and supported media types. They arrive at the model in attached-then-context order.

The image service owns validation, the frozen native/fallback reader choice and interpretation of
that choice for execution. Agent supplies catalog facts and resolved account/deployment choices.
The runner receives a resolved union: no images, native images, or images with a required caption
model. It no longer combines request channels or reads an optional model field to infer that mode.
The old model helper is removed. Caption cancellation and resource release stay with provider I/O.

A controller regression reproduced an unnecessary caption pass when the same trusted deployment
model filled both chat and vision roles but was absent from the provider catalog. Image selection
now uses the same configured-model rules as other model selection. Provider facts still win over
synthetic configured entries. Catalog failures propagate and roll back submission; the stale comment
claiming a lookup failure fell through to captioning is corrected. A turn without images does not
read the image catalog. Existing native vision still discards an irrelevant caption-model override.

Persisted input and public command/response schemas stay unchanged. The resolved union is an internal
runner input. No migration is required.

## Test dispositions and remaining review

Add controller coverage for the reproduced model-role mismatch, text-only fallback, authoritative
provider capabilities, catalog rollback, image-free turns and the combined count budget. Add service
cases for image order, saved fallback interpretation, absent images, media mismatch and combined
bytes. Keep provider failure/cancellation/release tests and add app-supplied images for both native
vision and captions. Provider fixtures use canonical UUID image identifiers and a running timestamp.
Existing reasoning and execution suites receive the resolved mode explicitly.

The PR records observed validation. Web research configuration, provider session representation and
the remaining model declaration/workflow inventory still need review. This is not completion of P17
or the repository-wide assessment.
