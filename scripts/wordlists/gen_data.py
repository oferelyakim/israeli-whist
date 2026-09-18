# -*- coding: utf-8 -*-
"""Offline generator for the Word Wonders dictionaries.

Needs Python + `wordfreq`, so it is NOT part of the app build: it runs by hand
and its output is committed. See CLAUDE.md for provenance.
"""
import re, json
from wordfreq import zipf_frequency

SOFIT = {'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ'}
def norm_he(w): return ''.join(SOFIT.get(c,c) for c in w)

ACCEPT = 2.8   # counts as a bonus word
GRID   = 3.4   # common enough to be a word the crossword demands

D = '/tmp/claude-0/dicttest'

# ── English ──────────────────────────────────────────────────────────
en = set()
for line in open(f'{D}/package/words.txt', encoding='utf-8'):
    w = line.strip().lower()
    if 3 <= len(w) <= 7 and re.fullmatch(r'[a-z]+', w):
        en.add(w)
en_acc  = {w for w in en if zipf_frequency(w, 'en') >= ACCEPT}
en_grid = {w for w in en_acc if zipf_frequency(w, 'en') >= GRID}

# ── Hebrew ───────────────────────────────────────────────────────────
he_raw = set(open(f'{D}/he37.txt', encoding='utf-8').read().split())
he_acc, he_grid, he_display = set(), set(), {}
for w in he_raw:
    z = zipf_frequency(w, 'he')
    if z < ACCEPT:
        continue
    key = norm_he(w)
    he_acc.add(key)
    # keep the most frequent real spelling as the display form for this key
    prev = he_display.get(key)
    if prev is None or zipf_frequency(prev, 'he') < z:
        he_display[key] = w
    if z >= GRID:
        he_grid.add(key)

def emit(path, name, acc, grid, display=None):
    grid_sorted  = sorted(grid)
    other_sorted = sorted(acc - grid)
    words = grid_sorted + other_sorted
    body = ' '.join(words)
    lines = [
        '// GENERATED FILE — do not edit by hand.',
        '// Built by scripts/wordlists/gen_data.py from the sources named in CLAUDE.md.',
        f'// {len(words):,} words; the first {len(grid_sorted):,} are common enough to appear in a grid.',
        '',
        f'export const {name}_GRID_COUNT = {len(grid_sorted)};',
        '',
        f'export const {name}_WORDS =',
    ]
    # chunk the literal so the file stays diffable and editors cope
    step = 2000
    for i in range(0, len(body), step):
        chunk = body[i:i+step].replace('\\', '\\\\').replace("'", "\\'")
        tail = ';' if i + step >= len(body) else ' +'
        lines.append(f"  '{chunk}'{tail}")
    if display:
        pairs = {k: v for k, v in display.items() if k != v}
        lines += ['', '/** Grid key (no final letters) -> the spelling players actually read. */',
                  f'export const {name}_DISPLAY: Readonly<Record<string, string>> = ' +
                  json.dumps(pairs, ensure_ascii=False, sort_keys=True) + ';']
    open(path, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    return len(words), len(grid_sorted), len(open(path, encoding='utf-8').read())

print('EN', emit('/tmp/claude-0/packer/words-en.ts', 'EN', en_acc, en_grid))
print('HE', emit('/tmp/claude-0/packer/words-he.ts', 'HE', he_acc, he_grid, he_display))
