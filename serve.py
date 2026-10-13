"""Static dev server for the ProtectAll clone. Serves /path -> /path/index.html with no redirect.
Usage: python serve.py [port]   (default 8787)"""
import sys, os, http.server, functools
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")
class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = super().translate_path(path)
        if os.path.isdir(p): return os.path.join(p, "index.html")
        return p
    def log_message(self, *a): pass
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
http.server.ThreadingHTTPServer(("", port), functools.partial(H, directory=ROOT)).serve_forever()
