"""Offline Edge regression checks of all routed pages, mobile and desktop."""
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

workspace = Path(__file__).resolve().parents[4]
output = workspace / 'diagnostics' / 'frontend-rebuild'
assert (output / 'fixture.js').is_file(), 'Build the offline fixture first.'
routes = [
    '/My_Team', '/Chip_Team', '/Team_Overview', '/AI_Model/Players', '/AI_Model/Fixtures',
    '/Adjustment_Analysis/Adjustment_Player', '/Adjustment_Analysis/Adjustment_Teams',
    '/Adjustment_Analysis/Adjustment_Fixture', '/Adjustment_Analysis/Adjustment_Simulator',
    '/Team_Analytics/Team_Rankings', '/Team_Analytics/Team_Individual', '/Team_Analytics/Team_Analysis',
    '/Player_Analytics/Individual', '/Season_Analysis/Season_Players',
    '/Season_Analysis/Season_Teams', '/Season_Analysis/Season_Matches',
    '/Weekly_Review', '/Personal_Analysis', '/Score_Predictions', '/Price_Changes', '/News',
    '/TeamPredictionsFuture',
]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(output)))
threading.Thread(target=server.serve_forever, daemon=True).start()
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    debug_port = sock.getsockname()[1]
report = {'routes': [], 'interactions': [], 'exceptions': []}
with tempfile.TemporaryDirectory(prefix='frontend-rebuild-browser-') as profile:
    process = subprocess.Popen([
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', '--headless=new',
        '--no-first-run', '--no-default-browser-check', f'--user-data-dir={profile}',
        f'--remote-debugging-port={debug_port}', 'about:blank',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
    connection = None
    try:
        for _ in range(100):
            try:
                tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{debug_port}/json', timeout=1))
                tab = next(tab for tab in tabs if tab['type'] == 'page')
                break
            except Exception:
                time.sleep(.1)
        connection = websocket.create_connection(tab['webSocketDebuggerUrl'], suppress_origin=True, timeout=40)
        sequence = 0
        responses = {}
        transparent = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='

        def send(method, params):
            global sequence
            sequence += 1
            connection.send(json.dumps({'id': sequence, 'method': method, 'params': params}))
            return sequence

        def command(method, params=None):
            request_id = send(method, params or {})
            while request_id not in responses:
                event = json.loads(connection.recv())
                if 'id' in event:
                    responses[event['id']] = event
                elif event.get('method') == 'Runtime.exceptionThrown':
                    report['exceptions'].append(event['params']['exceptionDetails'])
                elif event.get('method') == 'Fetch.requestPaused':
                    paused = event['params']
                    if paused['request']['url'].startswith(f'http://127.0.0.1:{server.server_port}/'):
                        send('Fetch.continueRequest', {'requestId': paused['requestId']})
                    else:
                        # External images/fonts/scripts receive a local placeholder.
                        # The test must not send requests to any external service.
                        image = paused['resourceType'] == 'Image'
                        send('Fetch.fulfillRequest', {'requestId': paused['requestId'], 'responseCode': 200,
                            'responseHeaders': [{'name': 'Content-Type', 'value': 'image/png' if image else 'text/plain'}],
                            'body': transparent if image else ''})
            response = responses.pop(request_id)
            assert 'error' not in response, response
            return response.get('result', {})

        def js(expression):
            result = command('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
            assert 'exceptionDetails' not in result, result
            return result.get('result', {}).get('value')

        def settle():
            js('new Promise(resolve => setTimeout(resolve, 200))')

        def until(expression, label):
            for _ in range(100):
                if js(expression):
                    return
                settle()
            raise AssertionError(f'Timed out: {label}')

        def navigate(path):
            js(f'location.hash={json.dumps(path)}')
            until("!!document.querySelector('.app-content') && !document.querySelector('.app-content [role=status]')", path)
            settle()
            assert not js("document.body.textContent.includes('This page could not be loaded')"), path

        def screenshot(name):
            (output / name).write_bytes(base64.b64decode(command('Page.captureScreenshot', {'format': 'png'})['data']))

        def check_split_layout(width):
            layout = js('''(() => {
                const team = document.querySelector('.optimizer-test-workspace__team').getBoundingClientRect();
                const tools = document.querySelector('.optimizer-test-workspace__tools').getBoundingClientRect();
                const main = document.querySelector('main').getBoundingClientRect();
                return {teamWidth:team.width, toolsWidth:tools.width, teamTop:team.top,
                    toolsTop:tools.top, teamBottom:team.bottom, mainWidth:main.width,
                    layoutWidth:document.documentElement.getBoundingClientRect().width,
                    teamVisible:document.querySelector('.optimizer-test-workspace__team').checkVisibility(),
                    toolsVisible:document.querySelector('.optimizer-test-workspace__tools').checkVisibility()};
            })()''')
            assert abs(layout['mainWidth'] - layout['layoutWidth']) < 1, (width, layout)
            if width >= 1024:
                assert layout['teamVisible'] and layout['toolsVisible'], (width, layout)
                assert abs(layout['teamWidth'] - layout['toolsWidth']) < 1, (width, layout)
                assert abs(layout['teamTop'] - layout['toolsTop']) < 1, (width, layout)
            else:
                assert layout['teamVisible'] and not layout['toolsVisible'], (width, layout)
            report.setdefault('split_layouts', []).append({'width': width, **layout})

        def select_optimizer_view(view):
            js("(()=>{const group=document.querySelector('[aria-label=\"Optimizer view\"]');if(group?.checkVisibility())Array.from(group.querySelectorAll('button')).find(el=>el.textContent.trim()===" + json.dumps(view) + ").click();})()")
            settle()

        command('Runtime.enable')
        command('Page.enable')
        command('Fetch.enable', {'patterns': [{'urlPattern': 'http*', 'requestStage': 'Request'}]})
        command('Emulation.setDeviceMetricsOverride', {'width': 1440, 'height': 1000, 'deviceScaleFactor': 1, 'mobile': False})
        command('Page.navigate', {'url': f'http://127.0.0.1:{server.server_port}/index.html#/My_Team'})
        until('!!window.__frontend?.user.authReady && !!document.querySelector(".app-content")', 'application initialized')
        until('!window.__frontend.adjustments.loading', 'statistical data loaded')
        js("window.__frontend.myTeam.setTeamId('2440')")
        settle()
        js('window.__frontend.myTeam.fetchMyTeam()')
        until('window.__frontend.myTeam.teamData?.length === 15', 'saved team loaded')

        for width in (320, 390, 768, 1024, 1440):
            command('Emulation.setDeviceMetricsOverride', {'width': width, 'height': 1000, 'deviceScaleFactor': 1, 'mobile': width < 640})
            for path in routes:
                navigate(path)
                dimensions = js('({viewport:innerWidth,scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth})')
                report['routes'].append({'path': path, 'width': width, **dimensions})
                if dimensions['scroll'] > width + 1:
                    screenshot('overflow.png')
                    offenders = js('Array.from(document.querySelectorAll("main *")).filter(el=>el.getBoundingClientRect().right>document.documentElement.clientWidth+1).slice(0,12).map(el=>({tag:el.tagName,class:el.className,right:el.getBoundingClientRect().right}))')
                    raise AssertionError(f'Horizontal overflow {path}, {width}px: {dimensions}; {offenders}')
                navigation = js('''(() => {
                    const nav = document.querySelector('.section-tabs');
                    if (!nav) return null;
                    const rect = nav.getBoundingClientRect();
                    const items = nav.querySelector('.section-tabs__items').getBoundingClientRect();
                    const buttons = Array.from(nav.querySelectorAll('a')).map(el => {
                        const r = el.getBoundingClientRect();
                        return {left:r.left, right:r.right, width:r.width, height:r.height};
                    });
                    return {position:getComputedStyle(nav).position, left:rect.left, right:rect.right,
                        bottom:rect.bottom, viewportHeight:innerHeight, layoutWidth:document.documentElement.getBoundingClientRect().width,
                        itemsLeft:items.left, itemsRight:items.right, buttons};
                })()''')
                if navigation:
                    report['routes'][-1]['bottom_navigation'] = navigation
                    assert navigation['position'] == 'fixed', (path, width, navigation)
                    # The root's stable scrollbar gutter can remain reserved even
                    # when a page hides the native scrollbar.
                    assert abs(navigation['left']) < 1 and abs(navigation['right'] - navigation['layoutWidth']) < 1, (path, width, navigation)
                    assert abs(navigation['bottom'] - navigation['viewportHeight']) < 1, (path, width, navigation)
                    buttons = navigation['buttons']
                    assert max(b['width'] for b in buttons) - min(b['width'] for b in buttons) < 1, (path, width, navigation)
                    assert abs(buttons[0]['left'] - navigation['itemsLeft']) < 1 and abs(buttons[-1]['right'] - navigation['itemsRight']) < 1, (path, width, navigation)
                    assert all(b['height'] >= 44 for b in buttons), (path, width, navigation)
                assert not report['exceptions'], {'route': path, 'errors': report['exceptions']}
                if path == '/My_Team':
                    check_split_layout(width)
                if path in ('/My_Team', '/AI_Model/Players', '/Price_Changes') and width in (390, 1440):
                    screenshot(f'{path.strip("/").replace("/", "-")}-{width}.png')
            print(f'All {len(routes)} pages rendered at {width}px without overflow or JS exceptions.', flush=True)

        for width in (1920, 2560):
            command('Emulation.setDeviceMetricsOverride', {'width': width, 'height': 1080, 'deviceScaleFactor': 1, 'mobile': False})
            navigate('/My_Team')
            check_split_layout(width)
        report['interactions'].append('Main optimizer fills wide screens and shows one view at a time on small screens')

        for width in (390, 1440):
            command('Emulation.setDeviceMetricsOverride', {'width': width, 'height': 1000, 'deviceScaleFactor': 1, 'mobile': width < 640})
            navigate('/My_Team')
            js("window.__splitTeamElement = document.querySelector('.optimizer-test-workspace__team'); true")
            pitch_before = js("document.querySelector('.optimizer-test-workspace__team .tree-node-pitch').getAttribute('aria-label')")
            select_optimizer_view('Optimization')
            assert js("document.querySelector('.optimizer-test-workspace__tools').checkVisibility()")
            if width < 1024:
                assert not js("document.querySelector('.optimizer-test-workspace__team').checkVisibility()")
            tree_name = js("document.querySelector('input[aria-label=\"Tree name\"]').value")
            js("document.querySelectorAll('[role=tablist][aria-label=\"Workspace panel\"] [role=tab]')[1].click()")
            until('!!document.querySelector(".ai-predictions-embedded input[placeholder=\\\"Type player name...\\\"]")', 'embedded predictions loaded')
            player_name = js("document.querySelector('.ai-predictions-embedded tbody tr[role=button] td:first-child').textContent.trim()")
            js("(()=>{const el=document.querySelector('.ai-predictions-embedded input[placeholder=\"Type player name...\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el," + json.dumps(player_name) + ");el.dispatchEvent(new Event('input',{bubbles:true}));})()")
            settle()
            assert js('document.querySelector(".ai-predictions-embedded tbody").textContent.includes(' + json.dumps(player_name) + ')')
            assert js('document.querySelector(".optimizer-test-workspace__team") === window.__splitTeamElement')
            screenshot(f'optimizer-test-predictions-{width}.png')
            select_optimizer_view('Pitch')
            assert js("document.querySelector('.optimizer-test-workspace__team').checkVisibility()")
            assert js("document.querySelector('.optimizer-test-workspace__team .tree-node-pitch').getAttribute('aria-label')") == pitch_before
            if width < 1024:
                assert not js("document.querySelector('.optimizer-test-workspace__tools').checkVisibility()")
                screenshot(f'optimizer-mobile-pitch-{width}.png')
            select_optimizer_view('Optimization')
            assert js("document.querySelector('.ai-predictions-embedded input[placeholder=\"Type player name...\"]').value") == player_name
            assert js('document.querySelector(".optimizer-test-workspace__team") === window.__splitTeamElement')
            js("document.querySelectorAll('[role=tablist][aria-label=\"Workspace panel\"] [role=tab]')[0].click()")
            assert js("document.querySelector('input[aria-label=\"Tree name\"]').value") == tree_name
            js("document.querySelectorAll('[role=tablist][aria-label=\"Workspace panel\"] [role=tab]')[1].click()")
            assert js("document.querySelector('.ai-predictions-embedded input[placeholder=\"Type player name...\"]').value") == player_name
            assert js('document.querySelector(".optimizer-test-workspace__team") === window.__splitTeamElement')
            # Exercise keyboard navigation back to the optimization controls.
            js("document.querySelectorAll('[role=tablist][aria-label=\"Workspace panel\"] [role=tab]')[1].focus()")
            command('Input.dispatchKeyEvent', {'type': 'keyDown', 'key': 'ArrowLeft', 'code': 'ArrowLeft', 'windowsVirtualKeyCode': 37})
            command('Input.dispatchKeyEvent', {'type': 'keyUp', 'key': 'ArrowLeft', 'code': 'ArrowLeft', 'windowsVirtualKeyCode': 37})
            assert js("document.activeElement.textContent.includes('Optimization') && document.activeElement.getAttribute('aria-selected') === 'true'")
        report['interactions'].append('Mobile Pitch/Optimization and embedded AI toggles preserve pitch selection, filters, team DOM and tree state; keyboard tabs work')

        js("document.querySelector('.optimizer-test-workspace__action button').click()")
        until('Object.values(window.__frontend.myTeam.treeOptimizationResults).some(result => result.rows?.length > 0) && !window.__frontend.myTeam.loading', 'main page optimization finished')
        cached_roots = js('Object.keys(window.__frontend.myTeam.treeOptimizationResults)')
        navigate('/Price_Changes')
        navigate('/My_Team')
        assert js('Object.keys(window.__frontend.myTeam.treeOptimizationResults)') == cached_roots
        assert js('document.querySelector(".optimizer-test-workspace__team").textContent.includes("Optimized squad")')
        report['interactions'].append('Optimization runs from the main page and keeps results after leaving and returning')

        command('Emulation.setDeviceMetricsOverride', {'width': 390, 'height': 900, 'deviceScaleFactor': 1, 'mobile': True})
        navigate('/My_Team')
        js("document.querySelector('[aria-label=\"Open navigation\"]').click()")
        until('document.querySelector(".app-drawer").open', 'mobile menu opened')
        assert js('document.querySelector(".app-drawer").contains(document.activeElement)')
        screenshot('mobile-navigation.png')
        command('Input.dispatchKeyEvent', {'type': 'keyDown', 'key': 'Escape', 'code': 'Escape', 'windowsVirtualKeyCode': 27})
        command('Input.dispatchKeyEvent', {'type': 'keyUp', 'key': 'Escape', 'code': 'Escape', 'windowsVirtualKeyCode': 27})
        until('!document.querySelector(".app-drawer").open', 'Escape closes navigation')
        assert js('document.activeElement.getAttribute("aria-label") === "Open navigation"')
        report['interactions'].append('Mobile menu contains focus; Escape closes and restores focus')

        navigate('/Price_Changes')
        js("(()=>{const el=document.querySelector('input[placeholder=\"Type player name...\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Haaland');el.dispatchEvent(new Event('input',{bubbles:true}));})()")
        settle()
        assert js('document.querySelectorAll("tbody tr").length === 1 && document.querySelector("tbody").textContent.includes("Haaland")')
        report['interactions'].append('Price search filters the actual table')

        for width in (390, 1440):
            command('Emulation.setDeviceMetricsOverride', {'width': width, 'height': 900, 'deviceScaleFactor': 1, 'mobile': width < 640})
            navigate('/AI_Model/Players')
            js('document.querySelector("details").open = true')
            settle()
            js("(()=>{const trigger=document.querySelector('button[aria-label^=\"Teams:\"]');trigger.scrollIntoView({block:'center'});trigger.click();})()")
            until('!!document.querySelector(".filter-popover")', 'team filter opened')
            settle()
            rect = js('(()=>{const r=document.querySelector(".filter-popover").getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})()')
            assert rect['left'] >= 0 and rect['right'] <= width and rect['top'] >= 0 and rect['bottom'] <= 901, rect
            if width == 390:
                screenshot('mobile-team-filter.png')
            js('document.querySelector(".filter-popover input[type=checkbox]").click()')
            settle()
            assert js('document.querySelector("button[aria-label^=\\\"Teams:\\\"]").textContent.includes("1 selected")')
            command('Input.dispatchKeyEvent', {'type': 'keyDown', 'key': 'Escape', 'code': 'Escape', 'windowsVirtualKeyCode': 27})
            command('Input.dispatchKeyEvent', {'type': 'keyUp', 'key': 'Escape', 'code': 'Escape', 'windowsVirtualKeyCode': 27})
            until('!document.querySelector(".filter-popover")', 'Escape closes team filter')
            assert js('document.activeElement.getAttribute("aria-label").startsWith("Teams:")')
            js('Array.from(document.querySelectorAll("button")).find(el=>el.textContent.includes("Reset filters and sorting")).click()')
            settle()
        report['interactions'].append('Shared team filters select values, stay in the viewport, and support Escape on mobile/desktop')
        command('Emulation.setDeviceMetricsOverride', {'width': 390, 'height': 900, 'deviceScaleFactor': 1, 'mobile': True})

        navigate('/Adjustment_Analysis/Adjustment_Player')
        js("(()=>{const el=document.getElementById('new-scenario-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Browser scenario');el.dispatchEvent(new Event('input',{bubbles:true}));})()")
        settle()
        js("Array.from(document.querySelectorAll('.scenario-manager button')).find(el=>el.textContent.includes('Create')).click()")
        until('window.__frontend.adjustments.scenarios.length === 2', 'scenario created')
        assert js('window.__frontend.adjustments.scenarios.some(item=>item.name === "Browser scenario")')
        navigate('/AI_Model/Players')
        navigate('/Adjustment_Analysis/Adjustment_Player')
        assert js('window.__frontend.adjustments.scenarios.length === 2')
        report['interactions'].append('Statistical scenarios can be created and survive navigation')

        for source, destination in [('/My_Team_Test', '/My_Team'), ('/My_Team_Testcase', '/My_Team'), ('/Wildcard_Team', '/Chip_Team'),
                                    ('/FreeHitTeam', '/Chip_Team'), ('/Matches', '/Season_Analysis/Season_Matches'),
                                    ('/AI_Model/Teams', '/AI_Model/Fixtures'), ('/Player_Analytics/Rankings', '/AI_Model/Players')]:
            navigate(source)
            until(f'location.hash.startsWith("#{destination}")', source)
        report['interactions'].append('Legacy links still redirect correctly')

        navigate('/does-not-exist')
        assert js('document.body.textContent.includes("Page not found")')
        assert not report['exceptions'], report['exceptions']
        report['interactions'].append('Unknown URLs show a usable recovery page')
        print(json.dumps({'route_checks': len(report['routes']), 'interactions': report['interactions']}, indent=2), flush=True)
    finally:
        (output / 'browser-results.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        if connection:
            try:
                command('Browser.close')
            except Exception:
                pass
            connection.close()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.terminate()
            process.wait(timeout=5)
        server.shutdown()
