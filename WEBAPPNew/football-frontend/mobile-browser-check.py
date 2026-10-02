"""Offline Edge checks for mobile layout and real touch gestures. Build fixture first."""
import base64
import functools
import http.server
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import urllib.request
import websocket

root = Path(__file__).resolve().parent / '.mobile-check'
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(root)))
threading.Thread(target=server.serve_forever, daemon=True).start()
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    debug_port = sock.getsockname()[1]
with tempfile.TemporaryDirectory(prefix='fpl-mobile-browser-') as profile:
    process = subprocess.Popen([r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', '--headless=new',
        '--no-first-run', '--no-default-browser-check', f'--user-data-dir={profile}',
        f'--remote-debugging-port={debug_port}', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW)
    ws = None
    try:
        for _ in range(100):
            try:
                tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{debug_port}/json', timeout=1))
                tab = next(tab for tab in tabs if tab['type'] == 'page')
                break
            except Exception:
                time.sleep(0.1)
        ws = websocket.create_connection(tab['webSocketDebuggerUrl'], suppress_origin=True, timeout=20)
        sequence = 0
        errors = []
        def command(method, params=None):
            global sequence
            sequence += 1
            ws.send(json.dumps({'id': sequence, 'method': method, 'params': params or {}}))
            while True:
                item = json.loads(ws.recv())
                if item.get('method') == 'Runtime.exceptionThrown': errors.append(item)
                if item.get('id') == sequence:
                    assert 'error' not in item, item
                    return item.get('result', {})
        def js(expression):
            result = command('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
            assert 'exceptionDetails' not in result, result
            return result.get('result', {}).get('value')
        def settle(): js('new Promise(resolve => setTimeout(resolve, 150))')
        def touch(kind, points):
            command('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [dict(x=x, y=y, id=i+1) for i, (x,y) in enumerate(points)]})
            settle()
        command('Runtime.enable')
        command('Page.enable')
        for width in (320, 390, 768, 1440):
            command('Emulation.setDeviceMetricsOverride', {'width': width, 'height': 900, 'deviceScaleFactor': 1, 'mobile': width < 640})
            command('Emulation.setTouchEmulationEnabled', {'enabled': width < 640, 'maxTouchPoints': 5})
            command('Page.navigate', {'url': f'http://127.0.0.1:{server.server_port}/index.html'})
            for _ in range(60):
                if js("!!document.querySelector('.tree-node-pitch')"): break
                settle()
            assert js("!!document.querySelector('.tree-node-pitch')"), errors
            dimensions = js("({width:innerWidth, overflow:document.documentElement.scrollWidth, pitch:document.querySelector('.tree-node-pitch').getBoundingClientRect().height})")
            assert dimensions['overflow'] <= width + 1, dimensions
            assert (dimensions['pitch'] <= 620 if width < 640 else dimensions['pitch'] >= 650), dimensions
            print('Layout', width, dimensions, flush=True)
            js("document.querySelector('.tree-toolbar').scrollIntoView({block:'start'})")
            settle()
            (root / f'tree-{width}.png').write_bytes(base64.b64decode(command('Page.captureScreenshot', {'format': 'png'})['data']))
            if width == 390:
                js("document.querySelector('.tree-viewport').scrollIntoView({block:'center'}); document.querySelector('.tree-viewport').scrollTop=400; document.querySelector('.tree-viewport').scrollLeft=200")
                rect = js("(()=>{const r=document.querySelector('.tree-viewport').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
                x, y = rect['x'], rect['y']
                touch('touchStart', [(x-60,y), (x+60,y)])
                touch('touchMove', [(x-40,y), (x+40,y)])
                touch('touchEnd', [])
                zoom = js("document.querySelector('[title=\"Reset zoom\"]').textContent.trim()")
                assert zoom == '67%', zoom
                before = js("document.querySelector('.tree-viewport').scrollTop")
                touch('touchStart', [(x,y)])
                touch('touchMove', [(x,y-80)])
                touch('touchEnd', [])
                after = js("document.querySelector('.tree-viewport').scrollTop")
                assert after > before + 60, (before, after)
                js("document.querySelector('[aria-label=\"Zoom tree in\"]').click()")
                settle()
                assert js("document.querySelector('[title=\"Reset zoom\"]').textContent.trim()") == '80%'
                js("document.querySelector('.tree-node-pitch').scrollIntoView({block:'center'}); document.querySelector('.pitch-player-button').click()")
                settle()
                assert js("document.querySelector('.pitch-player-actions').open")
                buttons = js("Array.from(document.querySelectorAll('.pitch-player-actions button')).map(b=>b.getBoundingClientRect().height)")
                assert min(buttons) >= 44, buttons
                (root / 'player-actions.png').write_bytes(base64.b64decode(command('Page.captureScreenshot', {'format': 'png'})['data']))
                js("Array.from(document.querySelectorAll('.pitch-player-actions button')).find(b=>b.textContent==='Swap position').click()")
                settle()
                assert not js("document.querySelector('.pitch-player-actions').open")
                js("document.querySelector('[title=\"View Player 12\"]').click()")
                settle()
                assert js("document.querySelector('.pitch-starters .pitch-player-button').title") == 'View Player 12'
                js("document.querySelector('[title=\"View Player 12\"]').click()")
                settle()
                js("Array.from(document.querySelectorAll('.pitch-player-actions button')).find(b=>b.textContent==='Plan transfer').click()")
                settle()
                assert not js("document.querySelector('.pitch-player-actions').open")
                print('Pinch, one-finger pan, zoom buttons and player actions passed.', flush=True)
            js("document.querySelector('.tree-node-pitch').scrollIntoView({block:'center'})")
            settle()
            screenshot = command('Page.captureScreenshot', {'format': 'png'})
            (root / f'pitch-{width}.png').write_bytes(base64.b64decode(screenshot['data']))
        assert not errors, errors
        print('Mobile and desktop browser checks passed.', flush=True)
    finally:
        if ws:
            try: command('Browser.close')
            except Exception: pass
            ws.close()
        try: process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.terminate()
            process.wait(timeout=5)
        server.shutdown()
