from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1] / "apps" / "web" / "public"
INK = "#27231f"
PAPER = "#f4f0e8"
CARD = "#fffdf8"
VERMILLION = "#b4473f"
BLUE = "#365d70"
RED = "#b4473f"


def font(*names: str, size: int) -> ImageFont.FreeTypeFont:
    candidates = [Path("C:/Windows/Fonts") / name for name in names]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def icon(size: int) -> Image.Image:
    scale = 4
    canvas = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    def rect(box: tuple[float, float, float, float], fill: str, outline: str | None = None, width: float = 0) -> None:
        scaled = tuple(round(v * size * scale / 32) for v in box)
        draw.rectangle(scaled, fill=fill, outline=outline, width=max(1, round(width * size * scale / 32)) if outline else 1)

    rect((3.5, 3.5, 28.5, 28.5), PAPER, INK, 2)
    def line(points: list[tuple[float, float]], fill: str, width: float) -> None:
        scaled = [(round(x * size * scale / 32), round(y * size * scale / 32)) for x, y in points]
        draw.line(scaled, fill=fill, width=max(1, round(width * size * scale / 32)), joint="curve")
    line([(8, 18), (22, 18)], INK, 3)
    draw.ellipse(
        tuple(round(v * size * scale / 32) for v in (20.25, 8.75, 24.75, 13.25)),
        fill=INK,
    )
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def save_icon_family() -> None:
    icon_512 = icon(512)
    icon_512.save(ROOT / "icon-512.png", optimize=True)
    icon(192).save(ROOT / "icon-192.png", optimize=True)
    icon(180).save(ROOT / "apple-touch-icon.png", optimize=True)
    icon_512.save(ROOT / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])


def draw_grid(draw: ImageDraw.ImageDraw, size: tuple[int, int]) -> None:
    width, height = size
    for x in range(0, width, 32):
        draw.line((x, 0, x, height), fill=(16, 19, 31, 16), width=1)
    for y in range(0, height, 32):
        draw.line((0, y, width, y), fill=(16, 19, 31, 16), width=1)
    for x in range(8, width, 16):
        for y in range(8, height, 16):
            draw.ellipse((x, y, x + 1, y + 1), fill=(16, 19, 31, 24))


def draw_mark(draw: ImageDraw.ImageDraw, x: int, y: int, scale: int = 1) -> None:
    draw.rectangle((x + 7 * scale, y + 7 * scale, x + 57 * scale, y + 57 * scale), fill=PAPER, outline=INK, width=3 * scale)
    draw.line((x + 17 * scale, y + 36 * scale, x + 45 * scale, y + 36 * scale), fill=INK, width=5 * scale)
    draw.ellipse((x + 41 * scale, y + 19 * scale, x + 49 * scale, y + 27 * scale), fill=INK)


def og_image(language: str) -> Image.Image:
    width, height = 1200, 630
    image = Image.new("RGBA", (width, height), PAPER)
    draw = ImageDraw.Draw(image, "RGBA")
    draw_grid(draw, (width, height))

    draw.rectangle((740, 0, width, height), fill=INK)
    draw.rectangle((708, 0, 740, height), fill=VERMILLION)
    draw.rectangle((760, 64, 1118, 68), fill=BLUE)
    draw.rectangle((760, 570, 1118, 574), fill=VERMILLION)

    draw_mark(draw, 88, 72, 2)
    draw.text((214, 92), "LAMDA / RIA", fill=INK, font=font("arialbd.ttf", "NotoSans-Bold.ttf", size=24))
    draw.text((214, 126), "PRIVATE AI BRIEFING", fill=INK, font=font("arial.ttf", "NotoSans-Regular.ttf", size=16))

    title_font = font("arialbd.ttf", "NotoSans-Bold.ttf", size=88)
    title_y = 220
    if language == "zh":
        draw.text((88, title_y), "LAMDA 简报", fill=INK, font=font("msyhbd.ttc", "NotoSansSC-VF.ttf", "NotoSans-Bold.ttf", size=82))
        draw.text((92, title_y + 108), "给 Ria 的 AI 研究", fill=INK, font=font("msyhbd.ttc", "NotoSansSC-VF.ttf", "NotoSans-Bold.ttf", size=36))
    else:
        draw.text((88, title_y), "SIGNAL", fill=INK, font=title_font)
        draw.text((92, title_y + 108), "FOR RIA / AI", fill=INK, font=font("arialbd.ttf", "NotoSans-Bold.ttf", size=42))

    draw.rectangle((88, 454, 500, 488), fill=VERMILLION, outline=INK, width=3)
    tagline = "PAPERS / LAB UPDATES" if language == "en" else "论文与实验室更新"
    tagline_font = font("arialbd.ttf", "NotoSans-Bold.ttf", size=17) if language == "en" else font("msyhbd.ttc", "NotoSansSC-VF.ttf", size=17)
    draw.text((104, 460), tagline, fill=INK, font=tagline_font)

    side_font = font("arialbd.ttf", "NotoSans-Bold.ttf", size=48)
    side_small = font("arial.ttf", "NotoSans-Regular.ttf", size=18)
    draw.text((790, 116), "LAMDA", fill=VERMILLION, font=side_font)
    draw.text((790, 178), "FOR RIA", fill=CARD, font=font("arialbd.ttf", size=28))
    draw.text((790, 226), "A quiet research desk", fill=(245, 241, 230, 220), font=side_small)
    hourly = "Today's reading, retained 14 days" if language == "en" else "今日阅读，保留 14 天"
    hourly_font = font("arial.ttf", "NotoSans-Regular.ttf", size=18) if language == "en" else font("msyh.ttc", "NotoSansSC-VF.ttf", size=20)
    draw.text((790, 264), hourly, fill=(245, 241, 230, 180), font=hourly_font)

    labels = ["OPENAI", "ARXIV", "HUGGING FACE", "JUYA"]
    chip_x = 790
    for label in labels:
        bbox = draw.textbbox((0, 0), label, font=font("arialbd.ttf", "NotoSans-Bold.ttf", size=14))
        chip_w = bbox[2] - bbox[0] + 24
        draw.rectangle((chip_x, 360, chip_x + chip_w, 392), outline=(245, 241, 230, 120), width=2)
        draw.text((chip_x + 12, 368), label, fill=(245, 241, 230, 190), font=font("arialbd.ttf", "NotoSans-Bold.ttf", size=14))
        chip_x += chip_w + 10
        if chip_x > 1110:
            break

    draw.rectangle((790, 466, 1008, 512), fill=RED, outline=INK, width=3)
    draw.text((808, 478), "●  NOW PRINTING", fill=CARD, font=font("arialbd.ttf", size=17))
    draw.text((790, 536), "LAMDA AI BRIEFING", fill=(245, 241, 230, 180), font=font("arial.ttf", size=16))
    return image.convert("RGB")


def save_og_family() -> None:
    og_image("en").save(ROOT / "og.png", optimize=True)
    og_image("zh").save(ROOT / "og-zh.png", optimize=True)


if __name__ == "__main__":
    save_icon_family()
    save_og_family()
