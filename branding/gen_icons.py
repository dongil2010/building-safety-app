from PIL import Image
import os

repo = r"C:\Users\dlawo\.cursor\클로드 코드 그록봇\building-safety-app"
logo_path = os.path.join(repo, "branding", "dongil-logo.png")
res = os.path.join(repo, "android", "app", "src", "main", "res")
logo = Image.open(logo_path).convert("RGBA")

# White background for adaptive icon (matches typical launcher)
BG = (255, 255, 255, 255)

def fit_on_canvas(src, size, pad_ratio=0.14, bg=BG):
    canvas = Image.new("RGBA", (size, size), bg)
    max_w = int(size * (1 - 2 * pad_ratio))
    max_h = int(size * (1 - 2 * pad_ratio))
    lw, lh = src.size
    scale = min(max_w / lw, max_h / lh)
    nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
    resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (size - nw) // 2
    y = (size - nh) // 2
    canvas.alpha_composite(resized, (x, y))
    return canvas

# Legacy + round launcher icons
legacy = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
# Adaptive foreground (full bleed canvas; safe zone ~66%)
foreground = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

for folder, size in legacy.items():
    out_dir = os.path.join(res, folder)
    icon = fit_on_canvas(logo, size, pad_ratio=0.12)
    icon.save(os.path.join(out_dir, "ic_launcher.png"))
    icon.save(os.path.join(out_dir, "ic_launcher_round.png"))
    print("wrote", folder, size)

for folder, size in foreground.items():
    out_dir = os.path.join(res, folder)
    # more padding so adaptive mask doesn't clip logo
    fg = fit_on_canvas(logo, size, pad_ratio=0.22, bg=(0, 0, 0, 0))
    # also solid white version behind for non-adaptive consumers of foreground alone
    fg_solid = fit_on_canvas(logo, size, pad_ratio=0.22, bg=BG)
    fg.save(os.path.join(out_dir, "ic_launcher_foreground.png"))
    print("wrote fg", folder, size)

# Splash screens — logo centered on white
splash_targets = [
    ("drawable", 480, 800),
    ("drawable-port-mdpi", 320, 480),
    ("drawable-port-hdpi", 480, 800),
    ("drawable-port-xhdpi", 720, 1280),
    ("drawable-port-xxhdpi", 1080, 1920),
    ("drawable-port-xxxhdpi", 1440, 2560),
    ("drawable-land-mdpi", 480, 320),
    ("drawable-land-hdpi", 800, 480),
    ("drawable-land-xhdpi", 1280, 720),
    ("drawable-land-xxhdpi", 1920, 1080),
    ("drawable-land-xxxhdpi", 2560, 1440),
]

def splash(src, w, h, max_logo_frac=0.55):
    canvas = Image.new("RGBA", (w, h), BG)
    max_w = int(w * max_logo_frac)
    max_h = int(h * 0.28)
    lw, lh = src.size
    scale = min(max_w / lw, max_h / lh)
    nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
    resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (w - nw) // 2
    y = (h - nh) // 2
    canvas.alpha_composite(resized, (x, y))
    return canvas.convert("RGB")

for folder, w, h in splash_targets:
    out_dir = os.path.join(res, folder)
    os.makedirs(out_dir, exist_ok=True)
    img = splash(logo, w, h)
    img.save(os.path.join(out_dir, "splash.png"), format="PNG")
    print("splash", folder, w, h)

# Also store a web branding copy for PWA if useful
web = fit_on_canvas(logo, 512, pad_ratio=0.1)
web.save(os.path.join(repo, "branding", "dongil-app-icon-512.png"))
print("done")