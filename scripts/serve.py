"""Local dev server: python3 scripts/serve.py [port]

Like `python3 -m http.server`, but tells browsers to recheck every file, so an edit shows up on a
normal reload instead of hiding behind a cached app.js or page.
"""
import functools, http.server, pathlib, sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 4321
root = pathlib.Path(__file__).resolve().parent.parent
handler = functools.partial(NoCache, directory=str(root))
http.server.ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()
