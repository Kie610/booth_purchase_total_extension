"""拡張機能のアイコン(16/32/48/128)を生成する。

アイコンは手描きのPNGではなくこのスクリプトを原本として管理する。
バイナリを差分で追えないため、形や色を変えたいときはここを直して再生成する。

    python tools/make_icons.py

「B」は16x16のドット絵として持ち、各サイズでは1ドットを整数倍の正方形として
描く(16px→1px、32px→2px、48px→3px、128px→8px)。拡大縮小を通さないので
どのサイズでもドットの角が丸まらず、粗いドット感がそのまま残る。
背景の角丸だけは階段状になると汚いので、こちらは滑らかに描いている。
"""

from pathlib import Path

from PIL import Image, ImageDraw

BG = (239, 212, 252, 255)  # #efd4fc
WHITE = (255, 255, 255, 255)

SIZES = (16, 32, 48, 128)
OUT_DIR = Path(__file__).resolve().parent.parent / "extension" / "icons"

# 背景の角丸を縮小前に描く倍率。曲線のジャギーを均すための単純なスーパーサンプリング
SCALE = 16

# ドット絵の升目。全サイズがこの整数倍になるよう16にしてある
GRID = 16

# 「B」のドット。線は2ドット、ふくらみの右端は横棒より1ドット外へ出して段差を作る。
# 上下のふくらみは同じ形にする。幅は8ドットで、左右の余白が4ドットずつになり中央に来る
# (7ドット幅だと右の余白が1ドット多く、左に寄って見える)
GLYPH = [
    "................",
    "................",
    "....#######.....",
    "....#######.....",
    "....##....##....",
    "....##....##....",
    "....##....##....",
    "....#######.....",
    "....#######.....",
    "....##....##....",
    "....##....##....",
    "....##....##....",
    "....#######.....",
    "....#######.....",
    "................",
    "................",
]


def draw_icon(size):
    cell = size // GRID
    if cell * GRID != size:
        raise ValueError(f"{size}px は {GRID} の整数倍ではないためドットを割り当てられない")

    # 背景: 角丸の正方形を全面に敷く。ツールバー上でも輪郭が分かるようにする
    canvas = size * SCALE
    img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle(
        [0, 0, canvas - 1, canvas - 1], radius=canvas * 0.22, fill=BG
    )
    img = img.resize((size, size), Image.LANCZOS)

    # ドットは升目にぴったり合わせて塗る。にじませないため縮小は通さない
    draw = ImageDraw.Draw(img)
    for row, line in enumerate(GLYPH):
        for col, dot in enumerate(line):
            if dot != "#":
                continue
            x, y = col * cell, row * cell
            draw.rectangle([x, y, x + cell - 1, y + cell - 1], fill=WHITE)

    return img


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        path = OUT_DIR / f"icon{size}.png"
        draw_icon(size).save(path, "PNG", optimize=True)
        print(f"{path.relative_to(OUT_DIR.parent.parent)}  {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
