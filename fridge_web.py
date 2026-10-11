"""Loopback-only camera/voice bridge. The Next.js server keeps its bearer token private."""
import json, os, queue, secrets, threading, time, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import cv2
from fridge_data import FridgeData

class FridgeWebUI:
    def __init__(self, agent, camera, vision, shelf_camera=None, auditor=None):
        self.agent,self.camera,self.vision,self.shelf_camera,self.auditor=agent,camera,vision,shelf_camera,auditor
        self._events=queue.Queue();self._lock=threading.Lock()
        self._state={'epoch':str(uuid.uuid4()),'active':False,'identity':None,'status':'Ready for the next donor','agent':'','user':'','product':'','notice':'','donation':''}
        self._token=FridgeData().token
        if not self._token:raise RuntimeError('Private bridge token missing')
        agent._session_permission=threading.Event()
        agent.on_caption(self.caption);agent.on_session_reset(self.reset)
        self.camera.start()
        if self.shelf_camera:self.shelf_camera.start()
    def caption(self,role,text):
        with self._lock:self._state[role]=text
    def reset(self):
        self.agent._session_permission.clear()
        with self._lock:
            self._state.update(epoch=str(uuid.uuid4()),active=False,identity=None,status='Ready for the next donor',agent='',user='',product='',notice='',donation='')
    def begin(self,identity=None):
        with self._lock:
            if self._state['active']:return False
            self._state.update(active=True,identity=identity,status='Connecting voice',agent='',user='',product='',notice='',donation='')
        self.agent._session_permission.set();return True
    def snapshot(self):
        while True:
            try:self.caption(*self._events.get_nowait())
            except queue.Empty:break
        with self._lock:return dict(self._state)
    def run(self):
        ui=self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def send(self,status,body,kind='application/json'):
                payload=json.dumps(body).encode() if kind=='application/json' else body
                self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
            def authorized(self):
                return self.headers.get('Host','').split(':')[0] in ('127.0.0.1','localhost') and secrets.compare_digest(self.headers.get('Authorization',''),'Bearer '+ui._token)
            def do_GET(self):
                if not self.authorized():return self.send(401,{'error':'unauthorized'})
                self.path=self.path.split('?',1)[0]
                if self.path=='/state':return self.send(200,ui.snapshot())
                if self.path in ('/stream/front','/stream/shelf'):
                    camera=ui.camera if self.path.endswith('front') else ui.shelf_camera
                    if camera is None:return self.send(503,{'error':'Camera unavailable'})
                    self.send_response(200);self.send_header('Content-Type','multipart/x-mixed-replace; boundary=frame');self.send_header('Cache-Control','no-store');self.end_headers()
                    try:
                        while True:
                            started=time.monotonic();frame=camera.get_frame()
                            if frame is not None:
                                height,width=frame.shape[:2]
                                if width>800:frame=cv2.resize(frame,(800,round(height*800/width)))
                                ok,image=cv2.imencode('.jpg',frame,[cv2.IMWRITE_JPEG_QUALITY,65])
                                if ok:
                                    payload=image.tobytes()
                                    self.wfile.write(b'--frame\r\nContent-Type: image/jpeg\r\nContent-Length: '+str(len(payload)).encode()+b'\r\n\r\n'+payload+b'\r\n');self.wfile.flush()
                            time.sleep(max(0,1/15-(time.monotonic()-started)))
                    except (BrokenPipeError,ConnectionResetError,OSError):pass
                    return
                if self.path in ('/frame/front','/frame/shelf'):
                    camera=ui.camera if self.path.endswith('front') else ui.shelf_camera
                    frame=camera.get_frame() if camera else None
                    if frame is None:return self.send(503,{'error':'Camera unavailable'})
                    ok,image=cv2.imencode('.jpg',frame,[cv2.IMWRITE_JPEG_QUALITY,70])
                    return self.send(200,image.tobytes(),'image/jpeg') if ok else self.send(503,{'error':'Frame unavailable'})
                self.send(404,{'error':'not_found'})
            def do_POST(self):
                if not self.authorized():return self.send(401,{'error':'unauthorized'})
                try:
                    size=int(self.headers.get('Content-Length','0'))
                    if size>4096:raise ValueError()
                    body=json.loads(self.rfile.read(size) or '{}')
                except Exception:return self.send(400,{'error':'Invalid request'})
                if self.path=='/begin':
                    identity=body.get('identity')
                    if identity is not None and (not isinstance(identity,dict) or not isinstance(identity.get('id'),str)):return self.send(400,{'error':'Invalid identity'})
                    if not ui.begin(identity):return self.send(409,{'error':'A donor session is already active'})
                    return self.send(200,ui.snapshot())
                if self.path=='/finish':
                    ui.agent._session_permission.clear()
                    if ui.agent._conversation is not None:ui.agent._conversation.end_session()
                    else:ui.reset()
                    return self.send(200,{'ok':True})
                if self.path=='/say':
                    text=body.get('text','')
                    if not isinstance(text,str) or not text.strip() or len(text)>1500:return self.send(400,{'error':'Invalid message'})
                    if not ui.agent._live_conversation():return self.send(409,{'error':'Voice is still connecting'})
                    ui.agent.say_as_user(text);return self.send(200,{'ok':True})
                self.send(404,{'error':'not_found'})
        server=ThreadingHTTPServer(('127.0.0.1',3201),Handler)
        threading.Thread(target=self.agent.run,name='kiosk-voice',daemon=True).start()
        print('Kiosk camera/voice bridge ready on 127.0.0.1:3201',flush=True)
        try:server.serve_forever()
        finally:
            self.agent.stop();server.server_close();self.camera.stop()
            if self.shelf_camera:self.shelf_camera.stop()
            if self.auditor:self.auditor.stop()
