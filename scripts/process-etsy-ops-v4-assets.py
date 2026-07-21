#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
from collections import deque
from pathlib import Path

from PIL import Image, ImageEnhance


ROOT = Path("/Users/mac/hermes-workspace")
SRC = ROOT / "generated-candidates/war-room/2026-06-18-etsy-ops-v4-from-scratch"
OUT = ROOT / "public/war-room/etsy-ops-v4"
ROOM_OUT = OUT / "room"
STATION_OUT = OUT / "stations"
AGENT_OUT = OUT / "agents"
ICON_OUT = OUT / "icons"

STATIONS = [
    "product-intake",
    "seo-oracle",
    "supplier-proof",
    "media-sources",
    "shotlab-prep",
    "listing-draft",
    "price-margin",
    "dlv-approval",
    "archive-vault",
]

AGENT_FRAME_SIZE = 192

AGENTS = {
    "athena-market-strategist": "03_athena_96f_sprite_sheet.png",
    "hephaestus-shotlab-artificer": "04_hephaestus_davinci_96f_sprite_sheet.png",
    "caesar-hermes-approval-commander": "05_caesar_hermes_96f_sprite_sheet.png",
}

AGENT_SOURCE_COLS = {
    "athena-market-strategist": 9,
    "hephaestus-shotlab-artificer": 8,
    "caesar-hermes-approval-commander": 8,
}

AGENT_SOURCE_ROWS = {
    "athena-market-strategist": 12,
    "hephaestus-shotlab-artificer": 12,
    "caesar-hermes-approval-commander": 9,
}

AGENT_BAND_DETECTION = {
    "athena-market-strategist": False,
    "hephaestus-shotlab-artificer": True,
    "caesar-hermes-approval-commander": True,
}

AGENT_ROW_MAP = {
    "hephaestus-shotlab-artificer": {
        "idle": 0,
        "walk-south": 1,
        "walk-north": 2,
        "walk-east": 3,
        "walk-west": 4,
        "walk-south-east": 5,
        "walk-south-west": 6,
        "walk-north-east": 7,
        "walk-north-west": 7,
        "work-at-station": 8,
        "talk-status": 9,
        "carry-packet": 10,
    },
    "caesar-hermes-approval-commander": {
        "idle": 0,
        "walk-south": 1,
        "walk-north": 2,
        "walk-east": 3,
        "walk-west": 4,
        "walk-south-east": 5,
        "walk-south-west": 5,
        "walk-north-east": 5,
        "walk-north-west": 5,
        "work-at-station": 6,
        "talk-status": 7,
        "carry-packet": 8,
    },
}

ROWS = [
    "idle",
    "walk-south",
    "walk-north",
    "walk-east",
    "walk-west",
    "walk-south-east",
    "walk-south-west",
    "walk-north-east",
    "walk-north-west",
    "work-at-station",
    "talk-status",
    "carry-packet",
]


def ensure_dirs() -> None:
    for folder in [ROOM_OUT, STATION_OUT, AGENT_OUT, ICON_OUT]:
        folder.mkdir(parents=True, exist_ok=True)


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

    average_luma = sum((r * 0.299 + g * 0.587 + b * 0.114) for r, g, b in edge_samples) / len(edge_samples)
    light_background = average_luma >= 120
    tolerance = 22 if light_background else 28

    buckets: dict[tuple[int, int, int], tuple[int, int, int, int]] = {}
    for r, g, b in edge_samples:
        key = (r // 10, g // 10, b // 10)
        count, sr, sg, sb = buckets.get(key, (0, 0, 0, 0))
        buckets[key] = (count + 1, sr + r, sg + g, sb + b)
    reference_colors = [
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
        if light_background and luma < 150:
            return False
        if not light_background and luma > 92:
            return False
        return min(color_distance((r, g, b), color) for color in reference_colors) <= tolerance

    seen: set[tuple[int, int]] = set()
    queue: deque[tuple[int, int]] = deque()
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


def paste_center_bottom(source: Image.Image, size: tuple[int, int], max_size: tuple[int, int]) -> Image.Image:
    source = flood_alpha(source)
    bbox = source.getbbox()
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    if not bbox:
        return out
    crop = source.crop(bbox)
    scale = min(max_size[0] / crop.width, max_size[1] / crop.height, 1)
    if scale < 1:
        crop = crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.Resampling.LANCZOS)
    x = (size[0] - crop.width) // 2
    y = size[1] - crop.height - 6
    out.alpha_composite(crop, (x, y))
    return out


def strip_from_frames(frames: list[Image.Image]) -> Image.Image:
    width, height = frames[0].size
    strip = Image.new("RGBA", (width * len(frames), height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * width, 0))
    return strip


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").getbbox()


def detect_foreground_bands(image: Image.Image) -> list[tuple[int, int]]:
    alpha = image.getchannel("A")
    width, height = image.size
    threshold = max(20, int(width * 0.018))
    counts: list[int] = []
    for y in range(height):
        count = 0
        for x in range(width):
            if alpha.getpixel((x, y)) > 20:
                count += 1
        counts.append(count)

    active = [count > threshold for count in counts]
    closed = active[:]
    for y, is_active in enumerate(active):
        if is_active:
            continue
        before = any(active[max(0, y - 3) : y])
        after = any(active[y + 1 : min(height, y + 4)])
        if before and after:
            closed[y] = True

    bands: list[tuple[int, int]] = []
    start: int | None = None
    for y, is_active in enumerate(closed + [False]):
        if is_active and start is None:
            start = y
        elif not is_active and start is not None:
            if y - start > 12:
                bands.append((max(0, start - 3), min(height, y + 3)))
            start = None
    return bands


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
    kept_pixels: set[tuple[int, int]] = set()
    for area, (left, top, right, bottom), pixels_in_component in components:
        touches_edge = left <= 1 or top <= 1 or right >= width - 1 or bottom >= height - 1
        tiny = area < max(18, max_area * 0.025)
        likely_neighbor_fragment = touches_edge and area < max_area * 0.65
        if tiny or likely_neighbor_fragment:
            continue
        kept_pixels.update(pixels_in_component)

    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    src = im.load()
    dst = out.load()
    for x, y in kept_pixels:
        dst[x, y] = src[x, y]
    return out


def lower_body_anchor_x(image: Image.Image, bbox: tuple[int, int, int, int]) -> float:
    alpha = image.getchannel("A")
    left, top, right, bottom = bbox
    start_y = top + round((bottom - top) * 0.58)
    xs: list[int] = []
    # Sample every second pixel; this is enough for stable anchors and keeps the
    # processor fast for repeated visual passes.
    center_left = round(image.width * 0.24)
    center_right = round(image.width * 0.76)
    sample_left = max(left, center_left)
    sample_right = min(right, center_right)
    if sample_right <= sample_left:
        sample_left, sample_right = left, right
    for y in range(start_y, bottom, 2):
        for x in range(sample_left, sample_right, 2):
            if alpha.getpixel((x, y)) > 24:
                xs.append(x)
    if not xs:
        return (left + right) / 2
    xs.sort()
    return xs[len(xs) // 2]


def align_agent_row(raw_frames: list[Image.Image]) -> list[Image.Image]:
    cleaned = [frame.convert("RGBA") for frame in raw_frames]
    anchors = []
    boxes = []
    for frame in cleaned:
        bbox = alpha_bbox(frame)
        if not bbox:
            anchors.append(64.0)
            boxes.append(None)
            continue
        anchors.append(lower_body_anchor_x(frame, bbox))
        boxes.append(bbox)

    target_anchor_x = AGENT_FRAME_SIZE // 2
    target_bottom = AGENT_FRAME_SIZE - 10

    aligned: list[Image.Image] = []
    for frame, anchor_x, bbox in zip(cleaned, anchors, boxes):
        if not bbox:
            aligned.append(Image.new("RGBA", (AGENT_FRAME_SIZE, AGENT_FRAME_SIZE), (0, 0, 0, 0)))
            continue
        crop = frame.crop(bbox)
        local_anchor_x = anchor_x - bbox[0]
        # Keep the generated cell coordinates, but translate the frame so the
        # feet/lower-body anchor sits on the same x/y baseline across the row.
        dx = round(target_anchor_x - local_anchor_x)
        dy = round(target_bottom - crop.height)
        dx = min(max(dx, 0), AGENT_FRAME_SIZE - crop.width)
        dy = min(max(dy, 0), AGENT_FRAME_SIZE - crop.height)
        out = Image.new("RGBA", (AGENT_FRAME_SIZE, AGENT_FRAME_SIZE), (0, 0, 0, 0))
        out.paste(crop, (dx, dy), crop)
        aligned.append(out)
    return aligned


def process_room() -> None:
    shutil.copy2(SRC / "01_room_base_top_down.png", ROOM_OUT / "room-base.png")


def process_stations() -> None:
    sheet = Image.open(SRC / "02_station_props_3x3.png").convert("RGBA")
    cell_w = sheet.width // 3
    cell_h = sheet.height // 3
    for index, station_id in enumerate(STATIONS):
        col = index % 3
        row = index // 3
        cell = sheet.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
        base = paste_center_bottom(cell, (256, 192), (236, 172))
        base.save(STATION_OUT / f"{station_id}.png")
        frames = []
        for frame_index in range(8):
            frame = Image.new("RGBA", base.size, (0, 0, 0, 0))
            brightness = 1 + (0.035 if frame_index in {2, 3, 4} else 0)
            shifted = ImageEnhance.Brightness(base).enhance(brightness)
            offset_y = -1 if frame_index in {3, 4} else 0
            frame.alpha_composite(shifted, (0, offset_y))
            frames.append(frame)
        strip_from_frames(frames).save(STATION_OUT / f"{station_id}-strip.png")


def process_agent(agent_id: str, filename: str) -> None:
    folder = AGENT_OUT / agent_id
    folder.mkdir(parents=True, exist_ok=True)
    sheet = flood_alpha(Image.open(SRC / filename).convert("RGBA"))
    source_cols = AGENT_SOURCE_COLS[agent_id]
    source_rows = AGENT_SOURCE_ROWS[agent_id]
    row_map = AGENT_ROW_MAP.get(agent_id, {})
    detected_bands = detect_foreground_bands(sheet) if AGENT_BAND_DETECTION[agent_id] else []
    runtime_cols = 8
    cell_h = sheet.height / source_rows
    for row_index, state in enumerate(ROWS):
        source_row_index = row_map.get(state, row_index)
        if detected_bands:
            if source_row_index >= len(detected_bands):
                raise ValueError(f"{agent_id} state {state} maps to missing source band {source_row_index}")
            band_y0, band_y1 = detected_bands[source_row_index]
        else:
            band_y0 = round(source_row_index * cell_h)
            band_y1 = round((source_row_index + 1) * cell_h)
        raw_frames = []
        for col_index in range(runtime_cols):
            x0 = round((col_index * sheet.width) / source_cols)
            x1 = round(((col_index + 1) * sheet.width) / source_cols)
            frame = sheet.crop((
                x0,
                band_y0,
                x1,
                band_y1,
            ))
            if frame.size != (128, 128):
                canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
                frame.thumbnail((128, 128), Image.Resampling.LANCZOS)
                canvas.alpha_composite(frame, ((128 - frame.width) // 2, 128 - frame.height))
                frame = canvas
            raw_frames.append(remove_edge_fragments(frame))
        frames = align_agent_row(raw_frames)
        strip_from_frames(frames).save(folder / f"{state}.png")
        if state == "idle":
            frames[0].save(folder / "portrait.png")
    if agent_id == "hephaestus-shotlab-artificer":
        # Hephaestus generated action rows include bulky forge/table props that
        # visually merge with the real room stations. Keep the worker as a clean
        # full-body sprite and let the station props carry the tool animation.
        shutil.copy2(folder / "idle.png", folder / "work-at-station.png")
        shutil.copy2(folder / "idle.png", folder / "talk-status.png")
        shutil.copy2(folder / "walk-south-east.png", folder / "carry-packet.png")
        shutil.copy2(folder / "idle.png", folder / "wait-approval.png")
    else:
        shutil.copy2(folder / "carry-packet.png", folder / "wait-approval.png")
    # Runtime aliases use the best available generated action rows.
    shutil.copy2(folder / "idle.png", folder / "rest-or-blocked.png")


def process_agents() -> None:
    for agent_id, filename in AGENTS.items():
        process_agent(agent_id, filename)


def process_icon_strip(
    sheet: Image.Image,
    name: str,
    box: tuple[int, int, int, int],
    frame_count: int,
    frame_size: tuple[int, int] = (96, 96),
) -> None:
    x0, y0, x1, y1 = box
    region = sheet.crop(box)
    cell_w = region.width / frame_count
    frames = []
    for index in range(frame_count):
        cell = region.crop((round(index * cell_w), 0, round((index + 1) * cell_w), region.height))
        frames.append(paste_center_bottom(cell, frame_size, (frame_size[0] - 8, frame_size[1] - 8)))
    strip_from_frames(frames).save(ICON_OUT / f"{name}.png")


def process_icons() -> None:
    source = SRC / "06_icons_packets_alerts_doors.png"
    if not source.exists():
        return
    sheet = Image.open(source).convert("RGBA")
    process_icon_strip(sheet, "packet-strip", (54, 36, 1394, 286), 8, (112, 112))
    process_icon_strip(sheet, "alert-strip", (54, 620, 470, 800), 4, (72, 72))
    process_icon_strip(sheet, "chat-strip", (500, 620, 870, 800), 4, (72, 72))
    process_icon_strip(sheet, "lock-strip", (930, 620, 1280, 800), 3, (72, 72))
    process_icon_strip(sheet, "sparkle-strip", (430, 824, 866, 1038), 5, (72, 72))
    process_icon_strip(sheet, "approval-seal-strip", (930, 824, 1390, 1038), 5, (72, 72))
    doors = sheet.crop((36, 794, 400, 1038))
    cell_w = doors.width // 2
    for index, name in enumerate(["door-closed", "door-open"]):
        cell = doors.crop((index * cell_w, 0, (index + 1) * cell_w, doors.height))
        paste_center_bottom(cell, (160, 128), (150, 118)).save(ICON_OUT / f"{name}.png")


def main() -> None:
    ensure_dirs()
    process_room()
    process_stations()
    process_agents()
    process_icons()
    manifest = {
        "source": str(SRC),
        "output": str(OUT),
        "room": "/war-room/etsy-ops-v4/room/room-base.png",
        "stations": [f"/war-room/etsy-ops-v4/stations/{station_id}-strip.png" for station_id in STATIONS],
        "icons": {
            "packet": "/war-room/etsy-ops-v4/icons/packet-strip.png",
            "alert": "/war-room/etsy-ops-v4/icons/alert-strip.png",
            "chat": "/war-room/etsy-ops-v4/icons/chat-strip.png",
            "lock": "/war-room/etsy-ops-v4/icons/lock-strip.png",
            "sparkle": "/war-room/etsy-ops-v4/icons/sparkle-strip.png",
            "approvalSeal": "/war-room/etsy-ops-v4/icons/approval-seal-strip.png",
            "doorClosed": "/war-room/etsy-ops-v4/icons/door-closed.png",
            "doorOpen": "/war-room/etsy-ops-v4/icons/door-open.png",
        },
        "agents": {
            agent_id: {
                "frameSizePx": {"w": AGENT_FRAME_SIZE, "h": AGENT_FRAME_SIZE},
                "states": ROWS + ["wait-approval", "rest-or-blocked"],
            }
            for agent_id in AGENTS
        },
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
