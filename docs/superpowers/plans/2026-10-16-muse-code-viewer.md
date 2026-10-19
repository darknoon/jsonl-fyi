# Muse Code prototype implementation plan

1. Reuse the existing live-ledger parser and renderer on current main.
2. Fix unresolved-identity pairing, preserve original records and remove
   unsupported live-ledger timestamp conversion.
3. Add a separate pure durable-session decoder: retained frames, committed
   messages, tool calls/results, reasoning summaries and embedded images.
4. Adapt both decoders to shared UI components and existing loading controls.
5. Add handwritten synthetic fixtures and focused parser/rendering tests.
6. Verify with the browser, capture synthetic screenshots, run build and
   checks, and prepare the public review text.
7. Obtain the required content review before pushing and opening the PR.
   Leave the local preview running. Do not merge or deploy.
