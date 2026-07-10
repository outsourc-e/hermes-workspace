# YouTube Content Output Formats

Use these patterns after the transcript has been fetched and validated.

## Transcript

Return the transcript only. Preserve the source language unless the user asks for translation.

## Timestamped Transcript

Use one segment per line:

```text
[00:03:12] transcript text
```

Keep timestamps from the transcript. Do not invent missing timestamps.

## Summary

Include:

- one-sentence gist
- 5-10 key points
- practical takeaways
- source caveats, such as transcript-only analysis

For long transcripts, summarize chunks first, then synthesize the whole.

## Chapters

Use timestamped chapter starts:

```markdown
- [00:00:00] Opening context
- [00:04:18] Main argument
- [00:12:44] Demo or example
```

Chapter titles should describe what happens, not just repeat phrases.

## Quotes

Use short exact excerpts only. Include timestamps:

```markdown
- [00:07:31] "short quote"
```

Avoid long verbatim blocks. If a quote would be long, paraphrase and keep the timestamp.

## X Thread

Structure:

1. Hook post with the main tension or claim.
2. 5-10 numbered posts with one idea each.
3. Practical application post.
4. Closing post with a caveat that it is transcript-derived.

Do not overclaim visual details unless the video was visually inspected.

## Blog Post

Structure:

- title
- short intro
- section headings
- concrete examples from transcript
- practical implications
- conclusion
- source caveat

Use quotes sparingly and keep them short.

## Implementation Notes

Use when Taylor asks how the video applies to Nova, Hermes, LoomOS, Neon Moon, or the local workflows.

Include:

- relevant idea
- why it matters
- implementation target
- likely files/systems affected
- risk or dependency
- suggested next step

## Steal/Build Analysis

Use when Taylor asks what to copy, adapt, or add.

Structure:

- Steal directly: proven ideas that fit current goals
- Adapt: ideas that need Nova/Hermes/Neon Moon translation
- Avoid: ideas that are off-brand, risky, or not worth it
- Build next: prioritized implementation steps
- Evidence: timestamps or transcript references

## Completeness Check

Before finalizing:

- Verify every timestamp used exists in the transcript.
- Verify recommendations are labeled as inference.
- Verify the output answers the user's requested format.
- Verify missing transcript, language fallback, or private/unavailable states are disclosed.
