#!/usr/bin/env python3
"""portal-build.py - upload-ready HTML5 portal builds of Tiny Print Shop (pattern shared with Deep Buddies' portals branch).

usage: tools/portal-build.py <game-slug> <include>... [--portals crazygames,itchio]
Output: dist/<portal>/<game>.zip (index.html at the zip root) and the unzipped folder dist/<portal>/<game>/ for testing.

  crazygames  CrazyGames SDK v3, Basic Launch: SDK init + data-module saves, loadingStart/Stop around the load,
              gameplayStart/Stop from the game (only after loading has stopped), happytime on expo day,
              respects the portal's muteAudio setting. No ads (Basic Launch has none).
  itchio      no SDK, same files (the plain standalone game with the portal hardening below).
Every build: dev files dropped, user-select off, all paths relative (asserted), < 20 MB / < 1000 files (asserted).
The GitHub Pages build (the repo itself) never contains the SDK.
"""
import json, os, re, shutil, sys, zipfile

SDK = 'https://sdk.crazygames.com/crazygames-sdk-v3.js'
PORTALS = {'crazygames': {'backend': 'crazygames', 'sdk': SDK}, 'itchio': {'backend': 'none', 'sdk': None}}
LIMIT_MB = 20

def transform(html, portal, cfg):
    scripts = []
    def grab(m):
        src = m.group(1)
        if src == 'js/platform.js': return '@@PLATFORM@@'
        scripts.append(src); return ''
    html = re.sub(r'[ \t]*<script src="([^"]+)"></script>\n?', grab, html)
    assert '@@PLATFORM@@' in html, 'index.html must load js/platform.js'
    head = [f'<script>window.PORTAL_BUILD={json.dumps(portal)};window.PLATFORM_BACKEND={json.dumps(cfg["backend"])};</script>']
    if cfg['sdk']: head.append(f'<script src="{cfg["sdk"]}"></script>')
    head += ['<script src="js/platform.js"></script>', f'<script>window.__GAME_SCRIPTS={json.dumps(scripts)};</script>',
             '<script src="js/portal-boot.js"></script>']
    html = html.replace('@@PLATFORM@@', '\n'.join(head) + '\n')
    css = ('<style>/* portal QA: no text selection / long-press callouts */body{-webkit-user-select:none;user-select:none;'
           '-webkit-touch-callout:none}</style>')
    html = html.replace('</head>', css + '\n</head>', 1)
    bad = re.findall(r'(?:src|href)="(/[^"]*|https?://(?!sdk\.crazygames\.com)[^"]*)"', html)
    assert not bad, f'absolute paths / external links in index.html: {bad}'
    return html

def main():
    args = sys.argv[1:]
    portals = list(PORTALS)
    if '--portals' in args:
        i = args.index('--portals'); portals = args[i + 1].split(','); del args[i:i + 2]
    game, includes = args[0], args[1:]
    root = os.getcwd(); files = []
    for inc in includes:
        p = os.path.join(root, inc)
        if os.path.isdir(p):
            for d, _, fs in os.walk(p): files += [os.path.relpath(os.path.join(d, f), root) for f in fs]
        else: files.append(inc)
    files = sorted(set(f for f in files if f != 'index.html' and not f.endswith(('.md', '.map'))))
    src = open(os.path.join(root, 'index.html'), encoding='utf-8').read()
    for portal in portals:
        cfg = PORTALS[portal]
        out = os.path.join(root, 'dist', portal, game)
        shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
        for f in files:
            os.makedirs(os.path.dirname(os.path.join(out, f)) or out, exist_ok=True)
            shutil.copy2(os.path.join(root, f), os.path.join(out, f))
        open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(transform(src, portal, cfg))
        for f in os.listdir(os.path.join(out, 'js')):
            body = open(os.path.join(out, 'js', f), encoding='utf-8').read()
            assert not re.search(r'["\'](https?:)?//(?!sdk\.crazygames\.com|www\.w3\.org/2000/svg)[a-z]', body), f'external URL in js/{f}'
        z = os.path.join(root, 'dist', portal, game + '.zip')
        if os.path.exists(z): os.remove(z)
        with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
            for d, _, fs in os.walk(out):
                for f in sorted(fs):
                    full = os.path.join(d, f); zf.write(full, os.path.relpath(full, out))
        n = sum(len(fs) for _, _, fs in os.walk(out))
        raw = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(out) for f in fs)
        size = os.path.getsize(z)
        assert size < LIMIT_MB * 1024 * 1024 and n < 1000, f'{portal}: too big ({size} bytes, {n} files)'
        print(f'{portal:11s} dist/{portal}/{game}.zip  {size/1024:6.1f} KB zipped, {raw/1024:6.1f} KB unzipped, {n} files')

main()
