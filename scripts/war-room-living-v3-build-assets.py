#!/usr/bin/env python3
from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance


ROOT = Path("/Users/mac/hermes-workspace")
OUT = ROOT / "public/war-room/living-v3"
VERSION = "living-v3-20260619"

ROOM_OUT = OUT / "rooms"
STATION_OUT = OUT / "stations"
AGENT_OUT = OUT / "agents"
ICON_OUT = OUT / "icons"
BRIDGE_OUT = OUT / "bridges"
QA_OUT = OUT / "qa"

FRAME_SIZE = 192
FRAME_COUNT = 8
SAFE_MARGIN = 10
AGENT_STATES = [
    "idle",
    "walk-south",
    "walk-north",
    "walk-east",
    "walk-west",
    "walk-south-east",
    "walk-south-west",
    "walk-north-east",
    "walk-north-west",
    "work-standing",
    "talk-standing",
    "carry-packet",
    "wait-approval",
    "sleep",
]

AGENT_PALETTES = {
    "athena": {
        "skin": (222, 170, 122, 255),
        "hair": (42, 47, 52, 255),
        "cloth": (239, 235, 214, 255),
        "accent": (88, 214, 205, 255),
        "metal": (224, 190, 92, 255),
        "shadow": (26, 34, 42, 255),
        "cloak": (38, 82, 90, 255),
    },
    "hephaestus": {
        "skin": (176, 108, 60, 255),
        "hair": (72, 42, 26, 255),
        "cloth": (66, 58, 49, 255),
        "accent": (242, 112, 45, 255),
        "metal": (194, 130, 54, 255),
        "shadow": (38, 28, 22, 255),
        "cloak": (91, 55, 30, 255),
    },
    "julius": {
        "skin": (210, 146, 94, 255),
        "hair": (48, 35, 30, 255),
        "cloth": (218, 212, 190, 255),
        "accent": (156, 36, 30, 255),
        "metal": (232, 184, 72, 255),
        "shadow": (42, 35, 34, 255),
        "cloak": (114, 24, 27, 255),
    },
}


def ensure_dirs() -> None:
    for folder in [ROOM_OUT, STATION_OUT, AGENT_OUT, ICON_OUT, BRIDGE_OUT, QA_OUT]:
        folder.mkdir(parents=True, exist_ok=True)


def draw_pixel_grid(draw: ImageDraw.ImageDraw, w: int, h: int, tint: tuple[int, int, int, int]) -> None:
    for x in range(0, w, 48):
        draw.line((x, 0, x, h), fill=tint, width=1)
    for y in range(0, h, 48):
        draw.line((0, y, w, y), fill=tint, width=1)


def create_room(path: Path, label: str, accent: tuple[int, int, int], layout: str) -> None:
    w, h = 1402, 1122
    room = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(room)
    draw.rounded_rectangle((58, 58, w - 58, h - 58), radius=22, fill=(37, 28, 20, 255), outline=(238, 204, 132, 255), width=16)
    draw.rounded_rectangle((105, 105, w - 105, h - 105), radius=10, fill=(43, 66, 68, 255), outline=(119, 84, 42, 255), width=20)
    draw.rectangle((160, 160, w - 160, h - 160), fill=(180, 143, 91, 255), outline=(89, 63, 35, 255), width=6)
    for x in range(160, w - 160, 64):
        draw.line((x, 160, x, h - 160), fill=(115, 82, 47, 170), width=2)
    for y in range(160, h - 160, 64):
        draw.line((160, y, w - 160, y), fill=(115, 82, 47, 170), width=2)
    draw.rounded_rectangle((w // 2 - 82, 52, w // 2 + 82, 116), radius=12, fill=(214, 155, 44, 255), outline=(59, 84, 75, 255), width=7)
    draw.rounded_rectangle((w // 2 - 82, h - 116, w // 2 + 82, h - 52), radius=12, fill=(214, 155, 44, 255), outline=(59, 84, 75, 255), width=7)
    draw.rounded_rectangle((50, h // 2 - 82, 112, h // 2 + 82), radius=12, fill=(214, 155, 44, 255), outline=(59, 84, 75, 255), width=7)
    for corner in [(58, 58), (w - 180, 58), (58, h - 180), (w - 180, h - 180)]:
        x, y = corner
        draw.rectangle((x, y, x + 120, y + 120), fill=(220, 190, 139, 255), outline=(95, 70, 43, 255), width=8)
        draw.rectangle((x + 25, y + 25, x + 95, y + 95), fill=(232, 205, 155, 255), outline=(183, 145, 92, 255), width=3)
    draw.text((195, 186), label, fill=(248, 221, 156, 255))

    if layout == "command":
        draw.rounded_rectangle((295, 360, 612, 515), radius=10, fill=(86, 60, 35, 245), outline=(237, 197, 111, 230), width=6)
        draw.rounded_rectangle((755, 320, 1010, 520), radius=10, fill=(55, 64, 69, 245), outline=(*accent, 235), width=6)
        draw.ellipse((622, 600, 780, 758), fill=(84, 52, 34, 245), outline=(237, 197, 111, 240), width=8)
        draw.line((w // 2, 168, w // 2, h - 170), fill=(*accent, 130), width=5)
    elif layout == "etsy":
        draw.rounded_rectangle((260, 330, 510, 470), radius=10, fill=(88, 57, 31, 245), outline=(237, 197, 111, 230), width=6)
        draw.rounded_rectangle((635, 300, 835, 465), radius=10, fill=(55, 76, 70, 245), outline=(*accent, 235), width=6)
        draw.rounded_rectangle((260, 660, 525, 805), radius=10, fill=(79, 70, 50, 245), outline=(*accent, 180), width=6)
        draw.rounded_rectangle((930, 560, 1160, 710), radius=10, fill=(94, 61, 34, 245), outline=(237, 197, 111, 230), width=6)
        draw.ellipse((910, 770, 1062, 915), fill=(82, 47, 34, 245), outline=(237, 197, 111, 240), width=8)
        draw.line((160, h // 2, w - 160, h // 2), fill=(*accent, 110), width=5)
    else:
        draw.rounded_rectangle((280, 430, 680, 570), radius=14, fill=(59, 82, 70, 240), outline=(*accent, 220), width=6)
        draw.rounded_rectangle((785, 455, 1030, 590), radius=14, fill=(77, 56, 38, 240), outline=(237, 197, 111, 210), width=6)
        draw.line((w // 2, 160, w // 2, h - 170), fill=(*accent, 90), width=5)

    room = ImageEnhance.Contrast(room).enhance(1.04)
    room.save(path)


def create_rooms() -> None:
    create_room(ROOM_OUT / "olympus-command.png", "Olympus Command", (91, 204, 216), "command")
    create_room(ROOM_OUT / "etsy-ops.png", "Etsy Ops", (92, 218, 204), "etsy")
    create_room(ROOM_OUT / "rest-hall.png", "Rest Hall", (142, 205, 145), "rest")


def draw_station_frame(kind: str, frame: int) -> Image.Image:
    canvas = Image.new("RGBA", (256, 192), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    pulse = int(10 + 20 * (0.5 + 0.5 * math.sin(frame / FRAME_COUNT * math.tau)))
    gold = (232, 190, 104, 255)
    teal = (97, 221, 210, 170 + pulse)
    wood = (83, 55, 31, 245)
    stone = (62, 67, 68, 245)
    draw.ellipse((64, 130, 196, 158), fill=(0, 0, 0, 78))
    if kind in {"command-table", "mission-router", "etsy-intake", "etsy-listing"}:
        draw.rounded_rectangle((54, 78, 202, 128), radius=8, fill=wood, outline=gold, width=4)
        draw.rectangle((78, 58, 178, 84), fill=(34, 37, 35, 255), outline=gold, width=3)
        draw.line((92, 72, 164, 72), fill=teal, width=3)
    elif kind in {"etsy-seo", "etsy-media-forge"}:
        draw.rounded_rectangle((68, 80, 188, 132), radius=8, fill=stone, outline=gold, width=4)
        draw.polygon((128, 35 - frame % 3, 158, 82, 128, 128, 98, 82), fill=teal, outline=(25, 82, 83, 255))
        draw.line((128, 40, 128, 124), fill=(230, 246, 242, 160), width=2)
    elif kind in {"etsy-shotlab"}:
        draw.rounded_rectangle((72, 92, 184, 132), radius=10, fill=stone, outline=gold, width=4)
        draw.rectangle((110, 62, 148, 88), fill=(236, 101, 45, 255), outline=(64, 36, 24, 255), width=3)
        draw.line((160, 54, 184, 72), fill=gold, width=5)
    elif kind in {"approval-dais", "etsy-approval"}:
        draw.ellipse((74, 70, 182, 150), fill=(67, 50, 34, 245), outline=gold, width=6)
        draw.rectangle((112, 42, 144, 88), fill=(230, 196, 95, 255), outline=(62, 48, 28, 255), width=4)
        draw.line((128, 55, 128, 125), fill=(246, 230, 153, 210), width=3)
    elif kind == "rest-sleep-pods":
        draw.rounded_rectangle((38, 92, 218, 134), radius=10, fill=(42, 60, 55, 230), outline=gold, width=4)
        draw.rounded_rectangle((58, 74, 108, 104), radius=8, fill=(72, 101, 91, 235), outline=teal, width=3)
        draw.rounded_rectangle((118, 74, 168, 104), radius=8, fill=(72, 101, 91, 235), outline=teal, width=3)
        draw.text((178, 62 - frame % 2), "z", fill=(205, 245, 231, 180))
    else:
        draw.rounded_rectangle((56, 82, 200, 130), radius=8, fill=wood, outline=gold, width=4)
        draw.rectangle((76, 68, 112, 90), fill=(91, 64, 36, 240), outline=gold, width=2)
        draw.rectangle((144, 68, 180, 90), fill=(91, 64, 36, 240), outline=gold, width=2)
    return canvas


def create_strip(path: Path, drawer, frame_size: tuple[int, int] = (256, 192), frames: int = FRAME_COUNT) -> None:
    strip = Image.new("RGBA", (frame_size[0] * frames, frame_size[1]), (0, 0, 0, 0))
    for frame in range(frames):
        strip.alpha_composite(drawer(frame), (frame * frame_size[0], 0))
    strip.save(path)


def create_stations() -> None:
    for name in [
        "command-table",
        "mission-router",
        "approval-dais",
        "etsy-intake",
        "etsy-seo",
        "etsy-media-forge",
        "etsy-shotlab",
        "etsy-listing",
        "etsy-approval",
        "rest-sleep-pods",
        "rest-quiet-table",
    ]:
        create_strip(STATION_OUT / f"{name}.png", lambda frame, kind=name: draw_station_frame(kind, frame))


def draw_bridge_frame(orientation: str, frame: int) -> Image.Image:
    canvas = Image.new("RGBA", (192, 192), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    glow = int(30 + 35 * (0.5 + 0.5 * math.sin((frame / FRAME_COUNT) * math.tau)))
    if orientation == "horizontal":
        draw.rounded_rectangle((12, 66, 180, 126), radius=8, fill=(37, 54, 64, 255), outline=(228, 183, 93, 255), width=5)
        for x in range(18, 176, 28):
            draw.line((x, 72, x + 16, 120), fill=(69, 48, 70, 180), width=5)
        draw.line((20, 96, 172, 96), fill=(96, 226, 214, 90 + glow), width=3)
    else:
        draw.rounded_rectangle((66, 12, 126, 180), radius=8, fill=(37, 54, 64, 255), outline=(228, 183, 93, 255), width=5)
        for y in range(18, 176, 28):
            draw.line((72, y, 120, y + 16), fill=(69, 48, 70, 180), width=5)
        draw.line((96, 20, 96, 172), fill=(96, 226, 214, 90 + glow), width=3)
    return canvas


def create_bridges() -> None:
    create_strip(BRIDGE_OUT / "command-to-etsy.png", lambda frame: draw_bridge_frame("horizontal", frame), (192, 192))
    create_strip(BRIDGE_OUT / "command-to-rest.png", lambda frame: draw_bridge_frame("vertical", frame), (192, 192))


def limb_offsets(state: str, frame: int) -> tuple[int, int, int, int]:
    step = math.sin(frame / FRAME_COUNT * math.tau)
    alt = math.sin(frame / FRAME_COUNT * math.tau + math.pi)
    if state.startswith("walk"):
        return round(step * 7), round(alt * 7), round(alt * 5), round(step * 5)
    if state in {"work-standing", "talk-standing"}:
        return round(step * 2), round(alt * 2), -2, 2
    if state == "carry-packet":
        return round(step * 4), round(alt * 4), -6, 6
    return 0, 0, 0, 0


def direction_shift(state: str) -> tuple[int, int]:
    if "east" in state:
        return 4, 0
    if "west" in state:
        return -4, 0
    if "north" in state:
        return 0, -2
    if "south" in state:
        return 0, 2
    return 0, 0


def draw_agent_frame(agent: str, state: str, frame: int) -> Image.Image:
    palette = AGENT_PALETTES[agent]
    image = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    cx, feet = 96, 158
    bob = int(math.sin(frame / FRAME_COUNT * math.tau) * (3 if state.startswith("walk") else 1))
    dx, dy = direction_shift(state)
    cx += dx
    body_top = 82 + dy + bob

    if state == "sleep":
        draw.ellipse((46, 142, 148, 166), fill=(0, 0, 0, 68))
        draw.rounded_rectangle((46, 104, 154, 136), radius=12, fill=palette["cloak"], outline=palette["metal"], width=4)
        draw.ellipse((58, 78, 96, 116), fill=palette["skin"], outline=palette["shadow"], width=3)
        draw.arc((68, 56, 128, 96), 230, 310, fill=palette["metal"], width=4)
        draw.text((118, 70 - frame % 3), "z", fill=(210, 245, 235, 190))
        return image

    left_leg, right_leg, left_arm, right_arm = limb_offsets(state, frame)
    draw.ellipse((cx - 39, feet - 16, cx + 39, feet + 2), fill=(0, 0, 0, 70))
    draw.line((cx - 12, body_top + 48, cx - 20 + left_leg, feet - 8), fill=palette["shadow"], width=10)
    draw.line((cx + 12, body_top + 48, cx + 20 + right_leg, feet - 8), fill=palette["shadow"], width=10)
    draw.rectangle((cx - 27 + left_leg, feet - 13, cx - 8 + left_leg, feet - 7), fill=(37, 29, 22, 255))
    draw.rectangle((cx + 8 + right_leg, feet - 13, cx + 27 + right_leg, feet - 7), fill=(37, 29, 22, 255))

    draw.polygon(
        [(cx - 35, body_top + 10), (cx + 35, body_top + 10), (cx + 25, body_top + 70), (cx - 25, body_top + 70)],
        fill=palette["cloth"],
        outline=palette["shadow"],
    )
    draw.polygon(
        [(cx - 38, body_top + 18), (cx - 58, body_top + 80), (cx - 20, body_top + 72)],
        fill=palette["cloak"],
    )
    draw.rectangle((cx - 30, body_top + 34, cx + 30, body_top + 44), fill=palette["metal"])
    draw.line((cx - 31, body_top + 23, cx - 50 + left_arm, body_top + 58), fill=palette["skin"], width=9)
    draw.line((cx + 31, body_top + 23, cx + 50 + right_arm, body_top + 58), fill=palette["skin"], width=9)

    if state == "carry-packet":
        draw.rectangle((cx + 30, body_top + 44, cx + 64, body_top + 70), fill=(196, 128, 58, 255), outline=palette["metal"], width=3)
    elif state == "work-standing":
        draw.line((cx + 32, body_top + 45, cx + 65, body_top + 33), fill=palette["metal"], width=6)
    elif state == "talk-standing":
        draw.rounded_rectangle((cx + 42, body_top - 4, cx + 78, body_top + 22), radius=8, fill=(60, 210, 204, 120), outline=palette["accent"], width=2)

    draw.ellipse((cx - 30, body_top - 28, cx + 30, body_top + 30), fill=palette["skin"], outline=palette["shadow"], width=4)
    draw.rectangle((cx - 24, body_top - 8, cx + 24, body_top + 2), fill=palette["hair"])
    draw.rectangle((cx - 19, body_top - 1, cx - 12, body_top + 5), fill=(22, 24, 22, 255))
    draw.rectangle((cx + 12, body_top - 1, cx + 19, body_top + 5), fill=(22, 24, 22, 255))

    if agent == "athena":
        draw.arc((cx - 36, body_top - 45, cx + 36, body_top + 4), 200, 340, fill=palette["metal"], width=7)
        draw.polygon((cx, body_top - 50, cx - 12, body_top - 24, cx + 12, body_top - 24), fill=palette["accent"], outline=palette["metal"])
        draw.ellipse((cx - 54, body_top + 32, cx - 22, body_top + 72), fill=palette["accent"], outline=palette["metal"], width=3)
    elif agent == "hephaestus":
        draw.rectangle((cx - 24, body_top + 10, cx + 24, body_top + 24), fill=palette["hair"])
        draw.rectangle((cx + 46, body_top + 14, cx + 62, body_top + 50), fill=palette["metal"])
        draw.rectangle((cx + 37, body_top + 26, cx + 72, body_top + 42), fill=(86, 77, 65, 255), outline=palette["shadow"], width=2)
    else:
        draw.arc((cx - 36, body_top - 44, cx + 36, body_top), 210, 330, fill=palette["metal"], width=7)
        draw.rectangle((cx - 37, body_top - 29, cx + 37, body_top - 20), fill=palette["accent"], outline=palette["metal"], width=2)
        draw.polygon((cx + 28, body_top + 12, cx + 64, body_top + 76, cx + 18, body_top + 70), fill=palette["cloak"])

    if state == "wait-approval":
        draw.ellipse((cx - 15, body_top + 58, cx + 15, body_top + 88), fill=palette["metal"], outline=palette["shadow"], width=3)
        draw.line((cx, body_top + 64, cx, body_top + 82), fill=(255, 236, 154, 255), width=3)

    return image


def create_agent_sheet(agent: str, state: str, destination: Path) -> None:
    strip = Image.new("RGBA", (FRAME_SIZE * FRAME_COUNT, FRAME_SIZE), (0, 0, 0, 0))
    for frame in range(FRAME_COUNT):
        strip.alpha_composite(draw_agent_frame(agent, state, frame), (frame * FRAME_SIZE, 0))
    strip.save(destination)


def create_portrait(agent: str, destination: Path) -> None:
    frame = draw_agent_frame(agent, "idle", 0)
    crop = frame.crop((36, 20, 156, 156)).resize((192, 192), Image.Resampling.NEAREST)
    crop.save(destination)


def create_agents() -> None:
    for agent in AGENT_PALETTES:
        folder = AGENT_OUT / agent
        folder.mkdir(parents=True, exist_ok=True)
        for state in AGENT_STATES:
            create_agent_sheet(agent, state, folder / f"{state}.png")
        create_portrait(agent, folder / "portrait.png")


def create_icons() -> None:
    icon_specs = {
        "door-closed.png": (214, 155, 44),
        "door-open.png": (93, 218, 204),
    }
    for name, color in icon_specs.items():
        icon = Image.new("RGBA", (192, 96), (0, 0, 0, 0))
        draw = ImageDraw.Draw(icon)
        draw.rounded_rectangle((26, 20, 166, 78), radius=10, fill=(*color, 255), outline=(42, 65, 62, 255), width=7)
        if "open" in name:
            draw.polygon((58, 30, 148, 48, 58, 68), fill=(246, 226, 156, 185))
        else:
            draw.rectangle((56, 34, 136, 64), fill=(88, 64, 39, 170))
        icon.save(ICON_OUT / name)

    strip_specs = {
        "alert-strip.png": (245, 98, 70),
        "packet-strip.png": (93, 218, 204),
        "chat-strip.png": (148, 208, 169),
        "lock-strip.png": (229, 184, 80),
        "sparkle-strip.png": (126, 226, 216),
        "approval-seal-strip.png": (242, 196, 88),
    }
    for name, color in strip_specs.items():
        create_strip(
            ICON_OUT / name,
            lambda frame, c=color: draw_icon_frame(c, frame),
            (96, 96),
            8,
        )


def draw_icon_frame(color: tuple[int, int, int], frame: int) -> Image.Image:
    icon = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    draw = ImageDraw.Draw(icon)
    pulse = int(38 * (0.5 + 0.5 * math.sin(frame / 8 * math.tau)))
    draw.ellipse((18, 16 - frame % 2, 78, 76 - frame % 2), fill=(*color, 190 + pulse // 2), outline=(48, 42, 36, 255), width=4)
    draw.line((48, 30, 48, 54), fill=(255, 238, 183, 255), width=5)
    draw.rectangle((45, 62, 51, 68), fill=(255, 238, 183, 255))
    return icon


def frame_bbox(image: Image.Image, frame: int) -> tuple[int, int, int, int] | None:
    crop = image.crop((frame * FRAME_SIZE, 0, (frame + 1) * FRAME_SIZE, FRAME_SIZE))
    return crop.getchannel("A").getbbox()


def validate_agent_strip(path: Path) -> dict[str, object]:
    image = Image.open(path).convert("RGBA")
    frame_reports = []
    foot_values: list[int] = []
    ok = image.width == FRAME_SIZE * FRAME_COUNT and image.height == FRAME_SIZE
    for frame in range(FRAME_COUNT):
        bbox = frame_bbox(image, frame)
        if bbox is None:
            frame_reports.append({"frame": frame, "nonblank": False, "safe": False})
            ok = False
            continue
        left, top, right, bottom = bbox
        safe = left >= SAFE_MARGIN and top >= SAFE_MARGIN and right <= FRAME_SIZE - SAFE_MARGIN and bottom <= FRAME_SIZE - SAFE_MARGIN
        foot_values.append(bottom)
        frame_reports.append({"frame": frame, "nonblank": True, "safe": safe, "bbox": [left, top, right, bottom]})
        ok = ok and safe
    foot_span = max(foot_values) - min(foot_values) if foot_values else 999
    ok = ok and foot_span <= 10
    return {
        "frameCount": FRAME_COUNT,
        "frameSize": {"w": FRAME_SIZE, "h": FRAME_SIZE},
        "safeMargin": SAFE_MARGIN,
        "ok": ok,
        "footAnchorSpanPx": foot_span,
        "frames": frame_reports,
    }


def validate_png(path: Path) -> dict[str, object]:
    image = Image.open(path).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    return {
        "path": f"/war-room/living-v3/{path.relative_to(OUT)}",
        "size": {"w": image.width, "h": image.height},
        "nonblank": bbox is not None,
    }


def write_manifest() -> None:
    agents = {}
    for agent in AGENT_PALETTES:
        folder = AGENT_OUT / agent
        states = {}
        for state in AGENT_STATES:
            path = folder / f"{state}.png"
            states[state] = {**validate_png(path), "validation": validate_agent_strip(path)}
        states["portrait"] = validate_png(folder / "portrait.png")
        agents[agent] = {"totalFrames": len(AGENT_STATES) * FRAME_COUNT, "states": states}

    manifest = {
        "id": "war-room-living-v3-assets",
        "version": VERSION,
        "assetRoot": "/war-room/living-v3",
        "rooms": {path.stem: validate_png(path) for path in sorted(ROOM_OUT.glob("*.png"))},
        "stations": {path.stem: validate_png(path) for path in sorted(STATION_OUT.glob("*.png"))},
        "bridges": {path.stem: {**validate_png(path), "frameCount": FRAME_COUNT} for path in sorted(BRIDGE_OUT.glob("*.png"))},
        "agents": agents,
        "icons": {path.stem: validate_png(path) for path in sorted(ICON_OUT.glob("*.png"))},
        "legacyPolicy": "Living V3 runtime must reference only /war-room/living-v3 assets. Older packs remain available for explicit legacy routes only.",
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def main() -> None:
    ensure_dirs()
    create_rooms()
    create_stations()
    create_bridges()
    create_agents()
    create_icons()
    write_manifest()
    print(json.dumps({"ok": True, "manifest": str(OUT / "manifest.json")}, indent=2))


if __name__ == "__main__":
    main()
