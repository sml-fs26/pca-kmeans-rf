"""Local dev server that disables ALL caching headers.

Python's stock http.server doesn't set Cache-Control, which lets some browsers
cache aggressively (a known frustration during local development). This wrapper
forces every response to be fresh.

Run from congress-story/:
    .venv/bin/python serve.py 8765
"""

import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    addr = ("127.0.0.1", port)
    print(f"Serving with no-cache headers at http://{addr[0]}:{addr[1]}/")
    HTTPServer(addr, NoCacheHandler).serve_forever()


if __name__ == "__main__":
    main()
