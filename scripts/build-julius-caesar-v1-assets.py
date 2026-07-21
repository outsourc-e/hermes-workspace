#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps


ROOT = Path("/Users/mac/hermes-workspace")
SOURCE = ROOT / "generated-candidates/war-room/2026-06-18-etsy-ops-v4-from-scratch/05_caesar_hermes_96f_sprite_sheet.png"
OUT = ROOT / "public/war-room/etsy-ops-julius-v1"
AGENT_OUT = OUT / "agents/julius-caesar"
QA_OUT = OUT / "qa"
FRAME_SIZE = 192
FRAMES_PER_STRIP = 8
VERSION = "julius-v1-20260619"

STATE_TO_BAND: dict[str, tuple[int, bool]] = {
    "idle": (0, False),
    "walk-south": (1, False),
    "walk-north": (2, False),
    "walk-east": (3, False),
    "walk-west": (4, False),
    "walk-south-east": (5, False),
    "walk-south-west": (5, True),
    "walk-north-east": (5, False),
    "walk-north-west": (5, True),
    "work-at-station": (6, False),
    "talk-status": (7, False),
    "carry-packet": (8, False),
    "wait-approval": (8, False),
    "rest-or-blocked": (0, False),
}


def flood_alpha(image: Image.Image) -> Image.Image:
    im = image.convert("RGBA")
    pixels = im.load()
    width, height = im.size

    edge_samples: list[tuple[int, int, int]] = []
    for x in range(width):
        for y in (0, height - 1):
            r, g, b, a = pixels[x, y]
            if a > 0:
                edge_samples.append((r, g, b))
    for y in range(height):
        for x in (0, width - 1):
            r, g, b, a = pixels[x, y]
            if a > 0:
                edge_samples.append((r, g, b))

    if not edge_samples:
        return im

    buckets: dict[tuple[int, int, int], tuple[int, int, int, int]] = {}
    for r, g, b in edge_samples:
        key = (r // 8, g // 8, b // 8)
        count, sr, sg, sb = buckets.get(key, (0, 0, 0, 0))
        buckets[key] = (count + 1, sr + r, sg + g, sb + b)

    references = [
        (round(sr / count), round(sg / count), round(sb / count))
        for count, sr, sg, sb in sorted(buckets.values(), reverse=True)[:10]
    ]

    def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
        return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])

    def is_background(pixel: tuple[int, int, int, int]) -> bool:
        r, g, b, a = pixel
        if a == 0:
            return True
        luma = r * 0.299 + g * 0.587 + b * 0.114
        if luma > 96:
            return False
        return min(color_distance((r, g, b), reference) for reference in references) <= 34

    queue: deque[tuple[int, int]] = deque()
    seen: set[tuple[int, int]] = set()
    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= width or y >= height or (x, y) in seen:
            continue
        seen.add((x, y))
        if not is_background(pixels[x, y]):
            continue
        r, g, b, _a = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    return im


def mask_from_background(image: Image.Image) -> np.ndarray:
    rgba = np.asarray(image.convert("RGBA"))
    bg = rgba[0, 0, :3].astype(np.int16)
    diff = np.abs(rgba[:, :, :3].astype(np.int16) - bg).sum(axis=2)
    return diff > 28


def detect_bands(image: Image.Image) -> list[tuple[int, int]]:
    mask = mask_from_background(image)
    projection = mask.sum(axis=1)
    raw: list[tuple[int, int]] = []
    start: int | None = None
    for y, count in enumerate(list(projection) + [0]):
        if count > 12 and start is None:
            start = y
        elif count <= 12 and start is not None:
            if y - start > 18:
                raw.append((start, y - 1))
            start = None

    merged: list[tuple[int, int]] = []
    for start_y, end_y in raw:
        if merged and start_y - merged[-1][1] < 18:
            merged[-1] = (merged[-1][0], end_y)
        else:
            merged.append((start_y, end_y))
    return merged


def detect_clean_centers(image: Image.Image, bands: list[tuple[int, int]]) -> list[float]:
    mask = mask_from_background(image)
    all_centers: list[list[float]] = [[] for _ in range(FRAMES_PER_STRIP)]
    for start_y, end_y in bands[:6]:
        projection = mask[start_y : end_y + 1].sum(axis=0)
        spans: list[tuple[int, int]] = []
        start: int | None = None
        for x, count in enumerate(list(projection) + [0]):
            if count > 8 and start is None:
                start = x
            elif count <= 8 and start is not None:
                if x - start > 14:
                    spans.append((start, x - 1))
                start = None

        merged: list[tuple[int, int]] = []
        for start_x, end_x in spans:
            if merged and start_x - merged[-1][1] < 18:
                merged[-1] = (merged[-1][0], end_x)
            else:
                merged.append((start_x, end_x))

        if len(merged) == FRAMES_PER_STRIP:
            for index, (start_x, end_x) in enumerate(merged):
                all_centers[index].append((start_x + end_x) / 2)

    centers: list[float] = []
    for index, values in enumerate(all_centers):
        if values:
            centers.append(float(np.median(values)))
        else:
            centers.append(90 + index * 120)
    return centers


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").getbbox()


def remove_edge_fragments(image: Image.Image) -> Image.Image:
    im = image.convert("RGBA")
    alpha = im.getchannel("A")
    width, height = im.size
    seen: set[tuple[int, int]] = set()
    components: list[tuple[int, tuple[int, int, int, int], list[tuple[int, int]]]] = []

    for start_y in range(height):
        for start_x in range(width):
            if (start_x, start_y) in seen or alpha.getpixel((start_x, start_y)) <= 20:
                continue
            queue: deque[tuple[int, int]] = deque([(start_x, start_y)])
            pixels_in_component: list[tuple[int, int]] = []
            left = right = start_x
            top = bottom = start_y
            seen.add((start_x, start_y))
            while queue:
                x, y = queue.popleft()
                pixels_in_component.append((x, y))
                left = min(left, x)
                right = max(right, x)
                top = min(top, y)
                bottom = max(bottom, y)
                for nx in (x - 1, x, x + 1):
                    for ny in (y - 1, y, y + 1):
                        if nx == x and ny == y:
                            continue
                        if nx < 0 or ny < 0 or nx >= width or ny >= height or (nx, ny) in seen:
                            continue
                        seen.add((nx, ny))
                        if alpha.getpixel((nx, ny)) > 20:
                            queue.append((nx, ny))
            components.append((len(pixels_in_component), (left, top, right + 1, bottom + 1), pixels_in_component))

    if not components:
        return im

    max_area = max(area for area, _box, _pixels in components)
    kept: set[tuple[int, int]] = set()
    for area, (left, top, right, bottom), pixels_in_component in components:
        touches_edge = left <= 1 or top <= 1 or right >= width - 1 or bottom >= height - 1
        tiny = area < max(14, max_area * 0.018)
        if tiny or (touches_edge and area < max_area * 0.42):
            continue
        kept.update(pixels_in_component)

    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    src = im.load()
    dst = out.load()
    for x, y in kept:
        dst[x, y] = src[x, y]
    return out


def normalize_cell(cell: Image.Image, row_index: int) -> Image.Image:
    cleaned = remove_edge_fragments(flood_alpha(cell))
    bbox = alpha_bbox(cleaned)
    out = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    if bbox is None:
        return out

    max_w = 182 if row_index == 6 else 148
    max_h = 170 if row_index == 6 else 162
    scale = min(max_w / max(1, bbox[2] - bbox[0]), max_h / max(1, bbox[3] - bbox[1]), 1.0)
    if scale < 0.999:
        new_size = (max(1, round(cleaned.width * scale)), max(1, round(cleaned.height * scale)))
        cleaned = cleaned.resize(new_size, Image.Resampling.LANCZOS)
        bbox = alpha_bbox(cleaned)
        if bbox is None:
            return out

    x = round((FRAME_SIZE - cleaned.width) / 2)
    bottom_padding = 8 if row_index == 6 else 9
    y = round((FRAME_SIZE - bottom_padding) - bbox[3])
    x = min(max(x, -8), FRAME_SIZE - cleaned.width + 8)
    y = min(max(y, -4), FRAME_SIZE - cleaned.height + 4)
    out.alpha_composite(cleaned, (x, y))
    return out


def crop_source_frame(sheet: Image.Image, centers: list[float], bands: list[tuple[int, int]], row_index: int, col_index: int) -> Image.Image:
    center_x = centers[col_index]
    crop_w = 150 if row_index == 6 else 140 if row_index == 8 else 134
    if row_index in {0, 1, 2}:
        crop_w = 126
    y0, y1 = bands[row_index]
    y_pad = 13 if row_index == 6 else 10
    x0 = round(center_x - crop_w / 2)
    x1 = round(center_x + crop_w / 2)
    return sheet.crop((max(0, x0), max(0, y0 - y_pad), min(sheet.width, x1), min(sheet.height, y1 + y_pad)))


def strip_from_frames(frames: list[Image.Image]) -> Image.Image:
    strip = Image.new("RGBA", (FRAME_SIZE * len(frames), FRAME_SIZE), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * FRAME_SIZE, 0))
    return strip


def save_state(sheet: Image.Image, centers: list[float], bands: list[tuple[int, int]], state: str, row_index: int, mirror: bool) -> list[Image.Image]:
    frames: list[Image.Image] = []
    for col_index in range(FRAMES_PER_STRIP):
        cell = crop_source_frame(sheet, centers, bands, row_index, col_index)
        frame = normalize_cell(cell, row_index)
        if mirror:
            frame = ImageOps.mirror(frame)
        frames.append(frame)
    strip_from_frames(frames).save(AGENT_OUT / f"{state}.png")
    return frames


def validate_strip(path: Path) -> dict[str, object]:
    image = Image.open(path).convert("RGBA")
    width, height = image.size
    nonblank = 0
    boxes: list[tuple[int, int, int, int] | None] = []
    for index in range(FRAMES_PER_STRIP):
        frame = image.crop((index * FRAME_SIZE, 0, (index + 1) * FRAME_SIZE, FRAME_SIZE))
        bbox = alpha_bbox(frame)
        boxes.append(bbox)
        if bbox:
            nonblank += 1
            if bbox[1] <= 1 or bbox[3] >= FRAME_SIZE:
                raise ValueError(f"{path.name} frame {index} touches vertical edge: {bbox}")
    if (width, height) != (FRAME_SIZE * FRAMES_PER_STRIP, FRAME_SIZE):
        raise ValueError(f"{path.name} has wrong size {(width, height)}")
    if nonblank != FRAMES_PER_STRIP:
        raise ValueError(f"{path.name} has blank frames: {nonblank}/{FRAMES_PER_STRIP}")
    return {"path": str(path), "size": {"w": width, "h": height}, "nonblankFrames": nonblank, "boxes": boxes}


def build_contact_sheet(states: list[str]) -> None:
    cell_w, cell_h = 72, 72
    label_h = 24
    sheet = Image.new("RGBA", (cell_w * FRAMES_PER_STRIP, (cell_h + label_h) * len(states)), (7, 13, 22, 255))
    draw = ImageDraw.Draw(sheet)
    for row, state in enumerate(states):
        strip = Image.open(AGENT_OUT / f"{state}.png").convert("RGBA")
        for col in range(FRAMES_PER_STRIP):
            frame = strip.crop((col * FRAME_SIZE, 0, (col + 1) * FRAME_SIZE, FRAME_SIZE))
            preview = frame.resize((cell_w, cell_h), Image.Resampling.NEAREST)
            sheet.alpha_composite(preview, (col * cell_w, row * (cell_h + label_h)))
        draw.text((4, row * (cell_h + label_h) + cell_h + 5), state, fill=(240, 210, 142, 255))
    sheet.save(QA_OUT / "julius-caesar-v1-contact-sheet.png")


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    if AGENT_OUT.exists():
        shutil.rmtree(AGENT_OUT)
    AGENT_OUT.mkdir(parents=True, exist_ok=True)
    QA_OUT.mkdir(parents=True, exist_ok=True)

    sheet = Image.open(SOURCE).convert("RGBA")
    bands = detect_bands(sheet)
    if len(bands) < 9:
        raise ValueError(f"Expected at least 9 Julius bands, detected {len(bands)}: {bands}")
    centers = detect_clean_centers(sheet, bands)

    states = list(STATE_TO_BAND.keys())
    first_frames: dict[str, Image.Image] = {}
    for state, (row_index, mirror) in STATE_TO_BAND.items():
        frames = save_state(sheet, centers, bands, state, row_index, mirror)
        first_frames[state] = frames[0]

    first_frames["idle"].save(AGENT_OUT / "portrait.png")
    build_contact_sheet(states)

    validation = {state: validate_strip(AGENT_OUT / f"{state}.png") for state in states}
    manifest = {
        "id": "julius-caesar-v1",
        "version": VERSION,
        "source": str(SOURCE),
        "output": str(AGENT_OUT),
        "frameSizePx": {"w": FRAME_SIZE, "h": FRAME_SIZE},
        "framesPerStrip": FRAMES_PER_STRIP,
        "states": states,
        "bands": bands,
        "centers": [round(center, 2) for center in centers],
        "qa": {
            "contactSheet": "/war-room/etsy-ops-julius-v1/qa/julius-caesar-v1-contact-sheet.png",
            "validation": validation,
            "notes": [
                "Julius is packaged independently from the shared Etsy Ops V4 agent folder.",
                "Frames preserve source-cell alignment to avoid side-to-side anchor wobble.",
                "Every runtime strip is 8 alpha frames at 192px, with React text kept outside the art.",
            ],
        },
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "manifest": str(OUT / "manifest.json"), "states": states}, indent=2))


if __name__ == "__main__":
    main()
