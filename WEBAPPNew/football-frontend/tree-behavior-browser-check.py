"""Run the offline React tree/context regression fixture in headless Edge."""
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

workspace = Path(__file__).resolve().parents[2]
root = workspace / "diagnostics" / "tree-behavior-check"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(root)))
threading.Thread(target=server.serve_forever, daemon=True).start()
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    debug_port = sock.getsockname()[1]

with tempfile.TemporaryDirectory(dir=root, prefix="edge-profile-") as profile:
    assert Path(profile).resolve().is_relative_to(root.resolve())
    process = subprocess.Popen([
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", "--headless=new",
        "--no-first-run", "--no-default-browser-check", f"--user-data-dir={profile}",
        f"--remote-debugging-port={debug_port}", "about:blank",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
    ws = None
    try:
        for _ in range(100):
            try:
                tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{debug_port}/json", timeout=1))
                tab = next(tab for tab in tabs if tab["type"] == "page")
                break
            except Exception:
                time.sleep(.1)
        else:
            raise RuntimeError("Headless Edge did not start")
        ws = websocket.create_connection(tab["webSocketDebuggerUrl"], suppress_origin=True, timeout=20)
        sequence = 0
        errors = []

        def command(method, params=None):
            global sequence
            sequence += 1
            ws.send(json.dumps({"id": sequence, "method": method, "params": params or {}}))
            while True:
                result = json.loads(ws.recv())
                if result.get("method") == "Runtime.exceptionThrown":
                    errors.append(result)
                if result.get("id") == sequence:
                    assert "error" not in result, result
                    return result.get("result", {})

        def evaluate(expression):
            result = command("Runtime.evaluate", {"expression": expression, "returnByValue": True})
            assert "exceptionDetails" not in result, result
            return result.get("result", {}).get("value")

        command("Runtime.enable")
        command("Page.enable")
        command("Page.navigate", {"url": f"http://127.0.0.1:{server.server_port}/index.html"})
        for _ in range(300):
            result = evaluate("window.testResult || null")
            if result:
                break
            if errors:
                raise AssertionError([item["params"]["exceptionDetails"].get("exception", {}).get("description") for item in errors])
            time.sleep(.1)
        else:
            raise AssertionError("Browser checks did not finish")
        (root / "results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
        assert not result.get("error"), result
        assert len(result["passed"]) == 9, result
        print(json.dumps(result, indent=2), flush=True)
    finally:
        if ws:
            try:
                command("Browser.close")
            except Exception:
                pass
            ws.close()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.terminate()
            process.wait(timeout=10)
        server.shutdown()
