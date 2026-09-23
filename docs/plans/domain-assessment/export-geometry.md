# Export geometry values

svgViewBoxSize constructs an optional positive DiagramSize from an SVG viewBox attribute. It is
used by browser render preparation and server export preparation. The image repository's unused
svgDimensions alias is removed. The reader stays in models; it does not choose an export workflow,
authorize assets or choose a rendering fallback. It is not an XML validator.

columnShares validates declared column widths and constructs their normalized proportions. PDF
and DOCX renderers consume that value in their own units. They choose format-specific automatic
layout when complete usable widths are absent. This geometry constructor also remains in models.
Moving it into a service would introduce a service-to-service dependency without changing ownership.
Heading spacing is a different concern: it chooses export typography and still needs preparation ownership.

## Confirmed fixes and test dispositions

Five regressions failed before the fix: single-quoted, comma-separated and scientific SVG view boxes
were missed; an invalid origin was accepted; two finite widths of 1e308 produced zero proportions
because their sum overflowed. Valid finite dimensions are now read using both XML quote forms and
number syntax. Invalid tuples, non-finite components and nonpositive sizes are declined. This follows
the [SVG viewBox definition](https://www.w3.org/TR/SVG2/coords.html#ViewBoxAttribute) and its referenced
[number syntax](https://www.w3.org/TR/css-values-3/#numbers).

Width construction preserves ordinary arithmetic and results. If the positive finite widths overflow
their sum, it scales by the largest width before normalization. It adds no guessed size or column cap.
Keep the seven existing width-validity tests. Add overflow and SVG syntax/invalid-value cases, plus a
preparation regression that carries scientific comma-separated dimensions into the renderer input.
Existing PDF, DOCX and export orchestration tests remain. No public shape or database migration changes.
These dispositions cover three helper meanings, not the full deliverables model or W15 workflow family.
