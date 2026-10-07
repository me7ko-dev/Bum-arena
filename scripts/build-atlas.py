"""
Сглобява спрайтовете на играта в един атлас (една текстура = по-бързо на телефон).

Източник: Microsoft Fluent Emoji 3D (лиценз MIT) от npm пакета @lobehub/fluent-emoji-3d.
Пускане:  python3 scripts/build-atlas.py
Резултат: packages/client/public/assets/sprites.webp + sprites.json (Phaser JSON Hash)
"""
import json
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'node_modules', '@lobehub', 'fluent-emoji-3d', 'assets')
OUT = os.path.join(ROOT, 'packages', 'client', 'public', 'assets')

CELL = 128  # размер на клетка в атласа
CAR_CELL = 192  # колите са по-детайлни

# име в играта → файл (кодова точка на емоджито)
SPRITES = {
    # ── Човечета (скинове) ──
    'skin_dog': '1f436', 'skin_cat': '1f431', 'skin_mouse': '1f42d', 'skin_hamster': '1f439',
    'skin_rabbit': '1f430', 'skin_fox': '1f98a', 'skin_bear': '1f43b', 'skin_panda': '1f43c',
    'skin_koala': '1f428', 'skin_tiger': '1f42f', 'skin_lion': '1f981', 'skin_cow': '1f42e',
    'skin_pig': '1f437', 'skin_frog': '1f438', 'skin_monkey': '1f435', 'skin_polarbear': '1f43b-200d-2744-fe0f',
    'skin_chicken': '1f414', 'skin_penguin': '1f427', 'skin_unicorn': '1f984', 'skin_dragon': '1f432',
    # ── Иконки ──
    'coin': '1fa99', 'crown': '1f451', 'shield': '1f6e1-fe0f', 'bolt': '26a1', 'boom': '1f4a5',
    'snowflake': '2744-fe0f', 'magnet': '1f9f2', 'dash': '1f4a8', 'trophy': '1f3c6', 'star': '2b50',
    'dizzy': '1f4ab', 'muscle': '1f4aa', 'fire': '1f525', 'mushroom': '1f344', 'glove': '1f94a',
    'shoe': '1f45f', 'ice': '1f9ca', 'anger': '1f4a2', 'bubbles': '1fae7', 'cart': '1f6d2',
    'party': '1f389', 'skull': '1f480', 'wrench': '1f527', 'flag': '1f3c1',
    # ── Декорация ──
    'tree': '1f333', 'palm': '1f334', 'cactus': '1f335', 'rock': '1faa8',
}
CARS = {
    'car_red': '1f697', 'car_taxi': '1f695', 'car_suv': '1f699', 'car_police': '1f693', 'car_race': '1f3ce-fe0f',
}


def main() -> None:
    items = [(k, v, CELL) for k, v in SPRITES.items()] + [(k, v, CAR_CELL) for k, v in CARS.items()]
    width = 1024
    frames = {}
    x = y = row_h = 0
    placed = []
    for name, code, size in items:
        if x + size > width:
            x = 0
            y += row_h
            row_h = 0
        placed.append((name, code, size, x, y))
        x += size
        row_h = max(row_h, size)
    height = y + row_h
    atlas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    for name, code, size, px, py in placed:
        img = Image.open(os.path.join(SRC, code + '.webp')).convert('RGBA').resize((size, size), Image.LANCZOS)
        atlas.alpha_composite(img, (px, py))
        frames[name] = {
            'frame': {'x': px, 'y': py, 'w': size, 'h': size},
            'rotated': False,
            'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': size, 'h': size},
            'sourceSize': {'w': size, 'h': size},
        }
    os.makedirs(OUT, exist_ok=True)
    atlas.save(os.path.join(OUT, 'sprites.webp'), 'WEBP', quality=90, method=6)
    meta = {'image': 'sprites.webp', 'size': {'w': width, 'h': height}, 'scale': '1'}
    with open(os.path.join(OUT, 'sprites.json'), 'w') as f:
        json.dump({'frames': frames, 'meta': meta}, f, indent=1)
    print(f'atlas {width}x{height}, {len(frames)} спрайта')


if __name__ == '__main__':
    main()
