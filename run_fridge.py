"""One local entry point: hardware API/uploader plus camera or voice test window."""
import argparse
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from dotenv import load_dotenv, dotenv_values

ROOT=Path(__file__).resolve().parent

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--data-only',action='store_true',help='Run sensors, Tiger Data API and the original team dashboard without cameras or voice')
    parser.add_argument('--dev',action='store_true',help='Use the frontend development server rather than an available production build')
    parser.add_argument('--mvp',action='store_true',help='Run the unified browser kiosk and hardware dashboard')
    parser.add_argument('--voice',action='store_true',help='Run ElevenLabs camera/voice window instead of the feature test bench')
    parser.add_argument('--configure-agent',action='store_true',help='Create/update the ElevenLabs agent tools before starting voice')
    args,extra=parser.parse_known_args()
    args.voice = args.voice or args.mvp
    camera_lock = None
    if not args.data_only and sys.platform == "darwin":
        import fcntl
        (ROOT / "runtime").mkdir(exist_ok=True)
        camera_lock = open(ROOT / "runtime" / "camera-desktop.lock", "a")
        try:
            fcntl.flock(camera_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Nourish is already running. Use its existing window instead of opening the cameras twice.")
    load_dotenv(ROOT/'.env')
    if args.voice and not os.getenv('ELEVENLABS_API_KEY'):
        raise SystemExit('Enter ELEVENLABS_API_KEY privately in .env before running --voice.')
    if args.voice and not os.getenv('ELEVENLABS_AGENT_ID') and not args.configure_agent:
        raise SystemExit('Enter ELEVENLABS_AGENT_ID or use --configure-agent to create the configured voice agent.')
    settings=dotenv_values(ROOT/'tiger-data'/'.env')
    if not settings.get('DATA_API_TOKEN'):
        raise SystemExit('Private tiger-data/.env credentials are required.')
    children=[]
    logs=[]
    runtime=ROOT/'runtime';runtime.mkdir(exist_ok=True)
    def start(command,label,cwd=ROOT):
        file=open(runtime/(label+'.log'),'a',buffering=1);logs.append(file)
        process=subprocess.Popen(command,cwd=cwd,stdout=file,stderr=subprocess.STDOUT)
        children.append(process);return process
    try:
        try:
            with urllib.request.urlopen('http://127.0.0.1:3200/health',timeout=2) as r:
                if r.status!=200:raise OSError('API unhealthy')
        except Exception:
            api=start(['npm','start'],'data-api',ROOT/'tiger-data')
            for _ in range(30):
                if api.poll() is not None:raise SystemExit('Data API failed. See runtime/data-api.log.')
                try:
                    with urllib.request.urlopen('http://127.0.0.1:3200/health',timeout=2):break
                except Exception:time.sleep(0.5)
            else:raise SystemExit('Data API did not become ready. See runtime/data-api.log.')
        port=settings.get('SERIAL_PORT','')
        if port and Path(port).exists():
            # Reuse another uploader/Serial Monitor's ownership instead of
            # opening the Arduino twice. This launcher never uploads firmware.
            ownership=subprocess.run(['lsof','-t',port],capture_output=True,text=True)
            if not ownership.stdout.strip():start(['npm','run','sensors'],'sensors',ROOT/'tiger-data')
            else:print('Arduino port is already in use; reusing the running reader. Close Serial Monitor if data stays stale.',flush=True)
        else:print('Arduino USB port is missing. Camera software can run; reconnect Arduino for sensor data.',flush=True)
        if args.data_only:
            built=(ROOT/'frontend'/'.next-check'/'BUILD_ID').exists() and not args.dev
            if built:os.environ['NEXT_DIST_DIR']='.next-check'
            try:
                urllib.request.urlopen('http://127.0.0.1:3001',timeout=2)
                print('Dashboard is already running: http://localhost:3001/dashboard/operator',flush=True)
                while True:time.sleep(1)
            except (OSError, urllib.error.URLError):
                frontend=start(['npm','run','start' if built else 'dev','--','--hostname','0.0.0.0','--port','3001'],'frontend',ROOT/'frontend')
                print('Original frontend: http://localhost:3001 · Live dashboard: http://localhost:3001/dashboard/operator',flush=True)
                return frontend.wait()
        camera=os.getenv('FRIDGE_CAMERA_INDEX','0');shelf=os.getenv('FRIDGE_INVENTORY_CAMERA','1')
        command=[sys.executable,'fridge_ui.py' if args.voice else 'fridge_testbench.py','--camera',camera,'--inventory-camera',shelf,*extra]
        if args.voice and args.configure_agent:
            from elevenlabs.client import ElevenLabs
            import fridge_voice_agent as voice
            agent=voice.setup_agent(ElevenLabs(api_key=os.environ['ELEVENLABS_API_KEY']))
            os.environ['ELEVENLABS_AGENT_ID']=agent
        if args.mvp:
            command.append('--web')
            built=(ROOT/'frontend'/'.next-check'/'BUILD_ID').exists() and not args.dev
            if built:os.environ['NEXT_DIST_DIR']='.next-check'
            start(['npm','run','start' if built else 'dev','--','--hostname','0.0.0.0','--port','3001'],'frontend',ROOT/'frontend')
            print('Fridge kiosk: http://127.0.0.1:3001/kiosk',flush=True)
            for interface in ('en0','en1'):
                ip=subprocess.run(['ipconfig','getifaddr',interface],capture_output=True,text=True).stdout.strip()
                if ip:
                    print(f'Other-device dashboard: http://{ip}:3001/dashboard/operator',flush=True)
                    break
        window=subprocess.Popen(command,cwd=ROOT)
        children.append(window)
        return window.wait()
    finally:
        for child in children:
            if child.poll() is None:child.terminate()
        for child in children:
            try:child.wait(timeout=8)
            except subprocess.TimeoutExpired:child.kill()
        for file in logs:file.close()

if __name__=='__main__':raise SystemExit(main())
