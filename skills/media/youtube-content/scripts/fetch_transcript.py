#!/usr/bin/env python3
"""Fetch YouTube transcripts as JSON or readable text."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlparse


VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
VIDEO_ID_ANYWHERE_RE = re.compile(r"(?<![A-Za-z0-9_-])([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])")


@dataclass
class TranscriptResult:
    video_id: str
    language: str | None
    is_generated: bool | None
    segments: list[dict[str, Any]]
    requested_languages: list[str]
    used_language_fallback: bool


class TranscriptUnavailable(RuntimeError):
    """Raised when YouTube has no usable transcript for the video."""


def parse_video_id(value: str) -> str:
    candidate = value.strip()
    if VIDEO_ID_RE.match(candidate):
        return candidate

    parsed = urlparse(candidate)
    host = parsed.netloc.lower().replace("www.", "")
    path_parts = [part for part in parsed.path.split("/") if part]

    if host in {"youtube.com", "m.youtube.com", "music.youtube.com"}:
        query_id = parse_qs(parsed.query).get("v", [None])[0]
        if query_id and VIDEO_ID_RE.match(query_id):
            return query_id

        if path_parts and path_parts[0] in {"shorts", "embed", "live"}:
            if len(path_parts) > 1 and VIDEO_ID_RE.match(path_parts[1]):
                return path_parts[1]

    if host == "youtu.be" and path_parts and VIDEO_ID_RE.match(path_parts[0]):
        return path_parts[0]

    fallback = VIDEO_ID_ANYWHERE_RE.search(candidate)
    if fallback:
        return fallback.group(1)

    raise ValueError(f"Could not parse a YouTube video ID from: {value}")


def parse_language_chain(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def import_transcript_api() -> tuple[Any, dict[str, type[BaseException]]]:
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError as exc:
        raise RuntimeError(
            "Missing dependency: youtube-transcript-api. Install with: uv pip install youtube-transcript-api"
        ) from exc

    error_names = [
        "TranscriptsDisabled",
        "NoTranscriptFound",
        "VideoUnavailable",
        "TooManyRequests",
        "YouTubeRequestFailed",
        "RequestBlocked",
        "IpBlocked",
    ]
    errors: dict[str, type[BaseException]] = {}
    try:
        import youtube_transcript_api._errors as api_errors

        for name in error_names:
            error = getattr(api_errors, name, None)
            if isinstance(error, type) and issubclass(error, BaseException):
                errors[name] = error
    except Exception:
        pass

    return YouTubeTranscriptApi, errors


def fetch_transcript(video_id: str, languages: list[str]) -> TranscriptResult:
    YouTubeTranscriptApi, errors = import_transcript_api()

    try:
        api = YouTubeTranscriptApi()
        if hasattr(api, "fetch"):
            return fetch_modern(api, video_id, languages)
    except TypeError:
        pass

    return fetch_legacy(YouTubeTranscriptApi, errors, video_id, languages)


def fetch_modern(api: Any, video_id: str, languages: list[str]) -> TranscriptResult:
    used_fallback = False
    try:
        fetched = api.fetch(video_id, languages=languages or None)
    except Exception as first_error:
        if not languages:
            raise map_transcript_error(first_error) from first_error
        try:
            fetched = api.fetch(video_id)
            used_fallback = True
        except Exception as fallback_error:
            raise map_transcript_error(fallback_error) from fallback_error

    return TranscriptResult(
        video_id=video_id,
        language=getattr(fetched, "language_code", None) or getattr(fetched, "language", None),
        is_generated=getattr(fetched, "is_generated", None),
        segments=normalize_segments(fetched),
        requested_languages=languages,
        used_language_fallback=used_fallback,
    )


def fetch_legacy(
    YouTubeTranscriptApi: Any,
    errors: dict[str, type[BaseException]],
    video_id: str,
    languages: list[str],
) -> TranscriptResult:
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        transcript = select_legacy_transcript(transcript_list, languages)
        used_fallback = bool(languages and getattr(transcript, "language_code", None) not in languages)
        return TranscriptResult(
            video_id=video_id,
            language=getattr(transcript, "language_code", None) or getattr(transcript, "language", None),
            is_generated=getattr(transcript, "is_generated", None),
            segments=normalize_segments(transcript.fetch()),
            requested_languages=languages,
            used_language_fallback=used_fallback,
        )
    except Exception as error:
        raise map_transcript_error(error, errors) from error


def select_legacy_transcript(transcript_list: Any, languages: list[str]) -> Any:
    if languages:
        for finder in ("find_transcript", "find_generated_transcript"):
            try:
                return getattr(transcript_list, finder)(languages)
            except Exception:
                continue

    for transcript in transcript_list:
        return transcript

    raise TranscriptUnavailable("No transcript entries were returned for this video.")


def map_transcript_error(
    error: BaseException, errors: dict[str, type[BaseException]] | None = None
) -> BaseException:
    name = error.__class__.__name__
    message = str(error) or name
    unavailable_names = {
        "TranscriptsDisabled",
        "NoTranscriptFound",
        "VideoUnavailable",
        "RequestBlocked",
        "IpBlocked",
    }
    if name in unavailable_names:
        return TranscriptUnavailable(message)
    if errors:
        for error_name in unavailable_names:
            error_type = errors.get(error_name)
            if error_type and isinstance(error, error_type):
                return TranscriptUnavailable(message)
    return error


def normalize_segments(raw_segments: Any) -> list[dict[str, Any]]:
    if hasattr(raw_segments, "to_raw_data"):
        raw_segments = raw_segments.to_raw_data()

    segments: list[dict[str, Any]] = []
    for item in raw_segments:
        if isinstance(item, dict):
            start = item.get("start", 0)
            duration = item.get("duration", 0)
            text = item.get("text", "")
        else:
            start = getattr(item, "start", 0)
            duration = getattr(item, "duration", 0)
            text = getattr(item, "text", "")

        segments.append(
            {
                "start": float(start or 0),
                "duration": float(duration or 0),
                "text": clean_text(str(text or "")),
            }
        )

    return segments


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\n", " ")).strip()


def duration_estimate(segments: list[dict[str, Any]]) -> float:
    if not segments:
        return 0.0
    return max(float(segment["start"]) + float(segment["duration"]) for segment in segments)


def validate_segments(segments: list[dict[str, Any]]) -> None:
    if not segments:
        raise TranscriptUnavailable("Transcript returned zero segments.")

    previous = -1.0
    for index, segment in enumerate(segments):
        start = float(segment["start"])
        if start < previous:
            raise TranscriptUnavailable(f"Transcript timestamps are not monotonic at segment {index}.")
        previous = start


def format_timestamp(seconds: float) -> str:
    total = int(max(0, seconds))
    hours = total // 3600
    minutes = (total % 3600) // 60
    secs = total % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def render_text(segments: list[dict[str, Any]], timestamps: bool) -> str:
    if timestamps:
        return "\n".join(
            f"[{format_timestamp(float(segment['start']))}] {segment['text']}" for segment in segments
        )
    return " ".join(segment["text"] for segment in segments).strip()


def build_payload(result: TranscriptResult) -> dict[str, Any]:
    return {
        "video_id": result.video_id,
        "language": result.language,
        "is_generated": result.is_generated,
        "requested_languages": result.requested_languages,
        "used_language_fallback": result.used_language_fallback,
        "segment_count": len(result.segments),
        "duration_estimate": duration_estimate(result.segments),
        "transcript": result.segments,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Fetch a YouTube transcript.")
    parser.add_argument("video", help="YouTube URL or raw 11-character video ID")
    parser.add_argument("--text-only", action="store_true", help="Output readable transcript text")
    parser.add_argument("--timestamps", action="store_true", help="Output text with [HH:MM:SS] timestamps")
    parser.add_argument("--language", help="Language code or comma chain, e.g. en or tr,en")
    parser.add_argument("--json", action="store_true", help="Force JSON output")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        video_id = parse_video_id(args.video)
        languages = parse_language_chain(args.language)
        result = fetch_transcript(video_id, languages)
        validate_segments(result.segments)

        if args.json or not (args.text_only or args.timestamps):
            print(json.dumps(build_payload(result), ensure_ascii=False, indent=2))
        else:
            print(render_text(result.segments, timestamps=args.timestamps))
        return 0
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    except TranscriptUnavailable as error:
        print(f"error: {error}", file=sys.stderr)
        return 4
    except RuntimeError as error:
        print(f"error: {error}", file=sys.stderr)
        return 3
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        return 5


if __name__ == "__main__":
    raise SystemExit(main())
