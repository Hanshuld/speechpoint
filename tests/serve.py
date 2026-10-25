"""Serve SpeechPoint for its test bench (never cached):  python3 tests/serve.py
Then open http://127.0.0.1:8799/tests/harness.html and click "Run all checks"."""
import functools
import http.server
from pathlib import Path


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


root = Path(__file__).resolve().parent.parent
http.server.ThreadingHTTPServer(("127.0.0.1", 8799), functools.partial(NoCache, directory=str(root))).serve_forever()
