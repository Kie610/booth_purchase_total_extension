"""拡張機能のアイコン(16/32/48/128)を生成する。

アイコンは手描きのPNGではなくこのスクリプトを原本として管理する。
バイナリを差分で追えないため、形や色を変えたいときはここを直して再生成する。

    python tools/make_icons.py

小さいサイズはPNGを縮小せず、サイズごとに輪郭を描き直してから縮小する。
16pxでは取っ手が細くなりすぎて消えるため、サイズが小さいほど太くしている。
"""

from pathlib import Path

from PIL import Image, ImageDraw

BG = (165, 150, 199, 255)  # #a596c7
WHITE = (255, 255, 255, 255)

SIZES = (16, 32, 48, 128)
OUT_DIR = Path(__file__).resolve().parent.parent / "extension" / "icons"

# 縮小前に描く倍率。曲線のジャギーを均すための単純なスーパーサンプリング
SCALE = 16


def stroke_ratio(size):
    """Bの線の太さ(キャンバス比)。

    小さいサイズほど細くする。128pxと同じ太さだと16pxで文字の内側の穴が
    1px未満になり、縮小時に埋まって「B」が四角い塊に見える。
    """
    if size <= 16:
        return 0.072
    if size <= 32:
        return 0.080
    return 0.090


def draw_icon(size):
    canvas = size * SCALE
    img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    def px(v):
        return v * canvas

    # 背景: 角丸の正方形を全面に敷く。ツールバー上でも輪郭が分かるようにする
    draw.rounded_rectangle([0, 0, canvas - 1, canvas - 1], radius=px(0.22), fill=BG)

    # 「B」をフォントではなく図形で描く。フォントを使うと環境ごとに字形が変わり、
    # 再生成しただけでPNGの中身が変わってしまう
    s = stroke_ratio(size)
    left, top, bottom = 0.315, 0.225, 0.775
    stem_right = left + s
    upper_right, lower_right = 0.650, 0.700  # 下のふくらみを少し大きくする
    middle = 0.500

    # 縦棒
    draw.rectangle([px(left), px(top), px(stem_right), px(bottom)], fill=WHITE)

    def bowl(box, color):
        """右側だけ角を丸めた矩形。丸めの半径は辺の長さを超えられない"""
        x0, y0, x1, y1 = (px(v) for v in box)
        # ちょうど半分だとPillowが内部で高さ0の矩形を作って落ちるので少しだけ小さくする
        radius = min(y1 - y0, x1 - x0) / 2 - 1
        draw.rounded_rectangle(
            [x0, y0, x1, y1],
            radius=radius,
            corners=(False, True, True, False),
            fill=color,
        )

    # 上下のふくらみを縦棒に重ねる
    bowl((left, top, upper_right, middle), WHITE)
    bowl((left, middle, lower_right, bottom), WHITE)

    # 内側の穴を背景色でくり抜く。中央の横棒は上下の穴の間隔として残る
    half = s / 2
    bowl((stem_right, top + s, upper_right - s, middle - half), BG)
    bowl((stem_right, middle + half, lower_right - s, bottom - s), BG)

    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        path = OUT_DIR / f"icon{size}.png"
        draw_icon(size).save(path, "PNG", optimize=True)
        print(f"{path.relative_to(OUT_DIR.parent.parent)}  {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
