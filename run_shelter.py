"""Start the complete local website, including the backend and video playback."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import json
import urllib.request

ROOT=Path(__file__).resolve().parent
os.chdir(ROOT)
PACKAGES=ROOT/'.runtime'/'python-packages'
sys.path.insert(0,str(PACKAGES))

def main():
    ai_python=ROOT/'.runtime'/'ai'/'Scripts'/'python.exe'
    if ai_python.exists() and Path(sys.executable).resolve()!=ai_python.resolve():
        raise SystemExit(subprocess.call([str(ai_python),str(Path(__file__).resolve())]))
    if sys.version_info < (3,10):
        raise SystemExit('Python 3.10 or newer is required.')
    missing=[name for name in ('fastapi','uvicorn','pydantic') if importlib.util.find_spec(name) is None]
    if missing:
        print('Installing the website backend. This is needed only on the first run.',flush=True)
        PACKAGES.mkdir(parents=True,exist_ok=True)
        subprocess.check_call([sys.executable,'-m','pip','install','--target',str(PACKAGES),'-r',str(ROOT/'backend'/'requirements-base.txt')])
        importlib.invalidate_caches()
    if not (ROOT/'frontend'/'dist'/'index.html').is_file():
        raise SystemExit('The built website is missing. Run BUILD_WEBSITE.ps1 after installing frontend dependencies.')
    config=ROOT/'.env'
    if config.exists():
        for raw in config.read_text(encoding='utf-8-sig').splitlines():
            line=raw.strip()
            if not line or line.startswith('#') or '=' not in line: continue
            key,value=line.split('=',1)
            key=key.strip()
            if key.startswith(('UAEPASS_','SHELTER_')):
                os.environ.setdefault(key,value.strip().strip('\"\''))
    # The requested presentation uses an explicit sandbox, isolated from real records.
    os.environ.setdefault('SHELTER_ENABLE_AI','1' if importlib.util.find_spec('ultralytics') else '0')
    os.environ.setdefault('SHELTER_AUTH_MODE','simulation')
    if os.environ['SHELTER_AUTH_MODE']=='simulation':
        os.environ['SHELTER_CASE_DB']=str(ROOT/'backend'/'data'/'sandbox-cases.db')
        os.environ['SHELTER_OPERATIONS_DB']=str(ROOT/'backend'/'data'/'sandbox-operations.db')
        os.environ['SHELTER_UPLOAD_DIR']=str(ROOT/'backend'/'data'/'sandbox-documents')
        print('UAE PASS SANDBOX: fictional identities only; no UAE PASS verification.',flush=True)
    # This launcher binds only to this computer. HTTPS deployments should use uvicorn directly.
    os.environ.setdefault('SHELTER_LOCAL_HTTP','1')
    port=int(os.getenv('SHELTER_PORT','8000'))
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health',timeout=2) as response:
            running=json.load(response)
        if running.get('service')=='GDRFA AI Shelter Backend':
            print(f'The backend and website are already running: http://127.0.0.1:{port}',flush=True)
            return
    except (OSError,ValueError):
        pass
    print(f'\nShelter website: http://127.0.0.1:{port}\nKeep this window open. Press Ctrl+C to stop.\n',flush=True)
    import uvicorn
    uvicorn.run('backend.app.main:app',host='127.0.0.1',port=port,access_log=False)

if __name__=='__main__':main()
