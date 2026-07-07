---
name: youtube-content
description: Fetch and validate YouTube transcripts, then transform videos into summaries, timestamped chapters, quotes, X threads, blog posts, implementation notes, or build/steal analysis when a user shares YouTube URLs, Shorts, embeds, live URLs, youtu.be links, or video IDs.
license: MIT
metadata:
  version: 0.1.0
  author: gpt
  hermes:
    tags:
      - youtube
      - transcripts
      - media
      - synthesis
      - content-transformation
---

# YouTube Content

## Overview

Use this skill to turn a YouTube video into reliable working material. Fetch the transcript first, validate it, then transform it into the format Taylor asked for: plain transcript, timestamped transcript, summary, chapters, quote bank, X thread, blog post, implementation notes, or "what should we steal/build from this?" analysis.

## When To Use

Use when the user provides a YouTube URL/video ID, asks for a transcript, wants a video summarized, wants timestamped chapters, asks for quotes, wants social/blog content from a video, or wants to compare a video against Hermes/Nova/Neon Moon/LoomOS roadmaps and workflows.

Do not claim to have watched the video unless visual content was separately inspected. Transcript work is audio/text-derived.

## Setup

Install the transcript dependency into the Hermes-managed Python environment:

```bash
uv pip install youtube-transcript-api
```

If `uv` is unavailable, use the active project Python environment and report the substitution:

```bash
python -m pip install youtube-transcript-api
```

## Workflow

1. Normalize the input as a YouTube video ID.
2. Fetch the transcript with `scripts/fetch_transcript.py`.
3. Validate the result:
   - video ID is correct
   - segment count is nonzero
   - duration estimate is plausible
   - timestamps are monotonic
   - transcript language matches the request or fallback is disclosed
4. For long transcripts, chunk by timestamp before summarizing. Keep chunk boundaries natural and preserve timestamps.
5. Transform only after the transcript is available and checked.
6. Present source limits honestly: transcript-disabled, private, unavailable, age-restricted, or rate-limited videos may not return text.
7. Verify the final output is coherent, complete for the requested scope, and timestamp-consistent.

## Commands

From this skill directory or by passing the full path:

```bash
python scripts/fetch_transcript.py "https://www.youtube.com/watch?v=VIDEO_ID"
```

Plain readable transcript:

```bash
python scripts/fetch_transcript.py "https://youtu.be/VIDEO_ID" --text-only
```

Timestamped transcript:

```bash
python scripts/fetch_transcript.py "https://youtube.com/shorts/VIDEO_ID" --timestamps
```

Language chain with fallback:

```bash
python scripts/fetch_transcript.py "VIDEO_ID" --language tr,en
```

Force JSON when using other flags:

```bash
python scripts/fetch_transcript.py "https://youtube.com/embed/VIDEO_ID" --timestamps --json
```

Accepted inputs:

- `https://youtube.com/watch?v=VIDEO_ID`
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://youtube.com/shorts/VIDEO_ID`
- `https://youtube.com/embed/VIDEO_ID`
- `https://youtube.com/live/VIDEO_ID`
- raw 11-character video ID

## Output Formats

For detailed transformation patterns, read `references/output-formats.md` only when needed.

Core formats:

- `transcript`: complete text, no added interpretation
- `timestamped-transcript`: segment text with `[HH:MM:SS]`
- `summary`: concise bullets plus key takeaways
- `chapters`: timestamped sections with descriptive titles
- `quotes`: exact short excerpts with timestamps
- `x-thread`: hook, numbered posts, source-aware claims
- `blog-post`: title, intro, sections, conclusion, source caveats
- `implementation-notes`: buildable ideas, repo implications, risks
- `steal-build-analysis`: what to copy, adapt, avoid, or add to the roadmap

## Error Handling

Be explicit. Do not silently continue with fake transcript content.

- Missing `youtube-transcript-api`: install with `uv pip install youtube-transcript-api`.
- Transcript disabled: report that the video does not expose a transcript.
- Private/unavailable video: report that the video cannot be accessed through transcript APIs.
- Requested language unavailable: retry without language restriction and disclose the fallback language.
- Empty transcript: treat as failure unless the user asked only to validate availability.
- Rate limit/request failure: report the upstream issue and retry later or use a browser/manual transcript path if appropriate.

## Verification Checklist

Before presenting the transformed output:

- Confirm the command exited with code `0`.
- Confirm `video_id`, `segment_count`, `language`, and `duration_estimate` are present.
- Confirm timestamps are monotonic if timestamps are used.
- Confirm long transcripts were chunked before summary/synthesis.
- Confirm quotes are short and timestamped.
- Confirm the final answer distinguishes transcript-derived facts from inference or recommendations.
- Confirm unavailable/disabled/private videos are reported honestly.
