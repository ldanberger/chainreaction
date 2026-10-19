"""
Static file server for testing/hosting Chain Reaction Workbench.

    python serve.py            -> http://localhost/  (default web port 80; also reachable from phones on the same Wi-Fi)
    python serve.py 8932       -> another port, e.g. if port 80 is taken

It only serves the files in this folder; there is no application backend.
Caching is disabled so a refresh always loads the latest files.
"""
import functools
import http.server
import os
import socket
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 80
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.webmanifest': 'application/manifest+json',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('10.255.255.255', 1))
            return s.getsockname()[0]
    except OSError:
        return None


if __name__ == '__main__':
    server = http.server.ThreadingHTTPServer(('0.0.0.0', PORT), functools.partial(Handler, directory=ROOT))
    suffix = '' if PORT == 80 else f':{PORT}'
    print(f'Chain Reaction Workbench: http://localhost{suffix}/', flush=True)
    ip = lan_ip()
    if ip:
        print(f'On your phone (same Wi-Fi):  http://{ip}{suffix}/', flush=True)
    print('Press Ctrl+C to stop.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
