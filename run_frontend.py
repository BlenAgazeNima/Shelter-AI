"""Optional standalone frontend on port 5173, forwarding API calls to port 8000.

Uses the built frontend. Run BUILD_WEBSITE.ps1 after source edits, then refresh.
For normal use, run_shelter.py already serves both frontend and backend on 8000.
"""
import http.client
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import json
import urllib.request

DIST=Path(__file__).resolve().parent/'frontend'/'dist'
HOP={'connection','transfer-encoding','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','upgrade'}

class Frontend(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(DIST),**kwargs)

    def proxy(self):
        backend=http.client.HTTPConnection('127.0.0.1',8000,timeout=45)
        started=False
        try:
            length=int(self.headers.get('Content-Length',0))
            if length<0 or length>11*1024*1024:
                self.send_error(413,'Request too large');return
            body=self.rfile.read(length) if length else None
            headers={k:v for k,v in self.headers.items() if k.lower() not in HOP|{'host'}}
            headers['Host']='127.0.0.1:8000'
            backend.request(self.command,self.path,body=body,headers=headers)
            response=backend.getresponse()
            self.send_response(response.status)
            started=True
            for key,value in response.getheaders():
                if key.lower() not in HOP:self.send_header(key,value)
            self.send_header('Connection','close');self.end_headers()
            if self.command!='HEAD':
                while chunk:=response.read(65536):self.wfile.write(chunk)
            self.close_connection=True
        except (ConnectionError,OSError,http.client.HTTPException,ValueError):
            # The browser receives a clear backend error instead of an HTML login failure.
            if not started and not self.wfile.closed:
                data=json.dumps({'detail':'Backend unavailable. Start START_PROJECT.bat first.'}).encode()
                self.send_response(502);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers()
                self.wfile.write(data)
        finally:backend.close()

    def do_GET(self):
        if self.path.startswith('/api/'):return self.proxy()
        return super().do_GET()
    def do_HEAD(self):
        if self.path.startswith('/api/'):return self.proxy()
        return super().do_HEAD()
    def do_POST(self):self.proxy()
    def do_PATCH(self):self.proxy()
    def do_OPTIONS(self):self.proxy()
    def log_message(self,*args):pass

if __name__=='__main__':
    try:
        with urllib.request.urlopen('http://127.0.0.1:5173/api/auth/config',timeout=2) as response:
            running=json.load(response)
        if 'simulation' in running:
            print('A frontend is already running at http://127.0.0.1:5173',flush=True)
            raise SystemExit(0)
    except (OSError,ValueError):pass
    print('Frontend: http://127.0.0.1:5173\nBackend must be running on port 8000.\nPress Ctrl+C to stop.',flush=True)
    try:ThreadingHTTPServer(('127.0.0.1',5173),Frontend).serve_forever()
    except KeyboardInterrupt:pass
    except OSError as error:raise SystemExit('Port 5173 could not be opened. Stop an existing frontend before starting another. '+str(error))
