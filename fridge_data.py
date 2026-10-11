"""Private, local API adapter shared by the vision test bench and voice app."""
from __future__ import annotations
import base64
import threading
from datetime import datetime, timezone
import json
import os
import uuid
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote, urlparse
from dotenv import dotenv_values
from fridge_storage_policy import storage_verdict

class DataUnavailable(RuntimeError):
    pass

class FridgeData:
    def __init__(self, base_url=None, token=None, fridge_id=None):
        settings=dotenv_values(Path(__file__).parent/'tiger-data'/'.env')
        self.base_url=(base_url or os.getenv('FRIDGE_DATA_API_URL','http://127.0.0.1:3200')).rstrip('/')
        parsed=urlparse(self.base_url)
        if parsed.scheme not in ('http','https') or parsed.hostname not in ('127.0.0.1','localhost'):
            raise ValueError('The test bench data API must be on localhost.')
        self.token=token or os.getenv('DATA_API_TOKEN') or settings.get('DATA_API_TOKEN')
        self.fridge_id=fridge_id or os.getenv('FRIDGE_ID') or settings.get('FRIDGE_ID') or 'orion-fridge-01'
        self._products={}
        self.outbox = Path(__file__).parent/'runtime'/'vision-outbox'
        self._sync_lock = threading.Lock()
        self._stop = threading.Event()
        self._worker = None

    def request(self, method, path, body=None):
        if not self.token:
            raise DataUnavailable('Data API token missing: configure tiger-data/.env privately.')
        payload=None if body is None else json.dumps(body,allow_nan=False).encode()
        req=urllib.request.Request(self.base_url+path,data=payload,method=method,headers={
            'Authorization':'Bearer '+self.token,'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(req,timeout=8) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            raise DataUnavailable(f'Data API returned HTTP {exc.code}.') from None
        except (urllib.error.URLError,TimeoutError,OSError,ValueError):
            raise DataUnavailable('Data API unavailable. Start the Tiger data API and check connectivity.') from None

    def conditions(self):
        return self.request('GET',f'/fridges/{quote(self.fridge_id,safe="")}/conditions')

    def inventory(self):
        return self.request('GET',f'/fridges/{quote(self.fridge_id,safe="")}/inventory')

    def confirm_donation(self,name,count,details=None,operation_id=None):
        details=details or {}
        if details.get('is_food') is False or details.get('fridge_ok') in ('no','unsure'):
            raise ValueError('This scan needs review before recording a donation.')
        verdict, reason = storage_verdict(name, details)
        if verdict != 'yes':
            raise ValueError(reason)
        count=int(count)
        if not name.strip() or not 1<=count<=10000:
            raise ValueError('A product name and valid quantity are required.')
        operation_id=operation_id or str(uuid.uuid4())
        catalog=details.get('catalog') or {}
        photo=details.get('catalog_photo') or {}
        barcode_matched=details.get('catalog_match_method')=='barcode'
        barcode=str(catalog.get('barcode') or '')
        barcode=barcode if barcode_matched and barcode.isdigit() and 8<=len(barcode)<=14 else None
        def https(value):
            return value if isinstance(value,str) and value.startswith('https://') else None
        if operation_id not in self._products:
            product=self.request('POST','/products',{
                'id':str(uuid.uuid5(uuid.NAMESPACE_URL,'donation-product:'+operation_id)),
                'canonical_name':name[:200], 'barcode':barcode,
                'brand':str(details.get('brand') or catalog.get('brand') or '')[:200] or None,
                'package_size':str(details.get('size') or catalog.get('size') or '')[:100] or None,
                'display_image_url':https(photo.get('url')) if photo.get('verdict')=='same' else https(catalog.get('image_url')),
                'image_source_url':https(catalog.get('source_url')) or ('https://world.openfoodfacts.org/product/'+str(catalog.get('barcode')) if str(catalog.get('barcode') or '').isdigit() else None),
                'match_method':'barcode' if barcode else 'visual' if details else 'manual',
                'metadata':{'vision_details':details,'expiry_status':'donor_reported' if (details.get('expiration') or {}).get('source') == 'donor_reported' else 'unverified'}})
            self._products[operation_id]=product['id']
        self.request('POST','/donations/propose',{
            'id':operation_id,'fridge_id':self.fridge_id,'product_id':self._products[operation_id],
            'quantity':count,'identification_method':'barcode' if barcode else 'gemini' if details else 'manual',
            'certainty':'unknown','details':{'confirmation':'operator_confirmed_placement','vision_details':details}})
        return self.request('POST','/donations/confirm',{'proposal_id':operation_id})

    def authenticate_pickup(self, username, code):
        return self.request('POST', '/pickups/authenticate', {'username':username, 'code':code, 'fridge_id':self.fridge_id})

    def complete_pickup(self, authorization_id, product_id, quantity, evidence):
        return self.request('POST', '/pickups/complete', {'authorization_id':authorization_id, 'product_id':product_id,
            'quantity':quantity, 'pickup_confirmed':True, 'evidence':evidence})

    def start_audit_sync(self):
        """Retry persisted scan/audit uploads without holding either camera."""
        if self._worker is not None: return
        def run():
            while not self._stop.wait(5):
                try: self.flush_outbox()
                except DataUnavailable: pass
        self._worker = threading.Thread(target=run,daemon=True,name='vision-tiger-sync')
        self._worker.start()

    def _persist(self, path, payload, flush=True):
        self.outbox.mkdir(parents=True,exist_ok=True)
        filename=self.outbox/(payload['id']+'.json')
        temp=filename.with_suffix('.tmp')
        temp.write_text(json.dumps({'path':path,'payload':payload},allow_nan=False),encoding='utf8')
        temp.chmod(0o600)
        temp.replace(filename)
        if flush: self.flush_outbox()
        return {'stored':flush,'queued':not flush,'id':payload['id']}

    def flush_outbox(self):
        with self._sync_lock:
            if not self.outbox.exists(): return
            for file in sorted(self.outbox.glob('*.json')):
                try:
                    entry=json.loads(file.read_text(encoding='utf8'))
                except (ValueError,OSError):
                    raise DataUnavailable('Local vision upload entry cannot be read; retained for recovery.') from None
                if entry['path'] not in ('/inventory/scans','/inventory/audits'):
                    raise DataUnavailable('Invalid local vision upload queue entry.')
                self.request('POST',entry['path'],entry['payload'])
                file.unlink(missing_ok=True)

    def save_scan(self, details, scan_id=None):
        scan_id=scan_id or str(uuid.uuid4())
        return self._persist('/inventory/scans',{
            'id':scan_id,'fridge_id':self.fridge_id,
            'captured_at':datetime.now(timezone.utc).isoformat(),
            'result':{'stage':'identified_not_deposited','product':details}},flush=False)

    def save_audit(self,report):
        # All scheduled checks are recorded, including skipped/failed checks.
        # A reused observation is never represented as a new Gemini analysis.
        if not report.get('time'): return None
        report=dict(report)
        status=report.get('status','unavailable')
        snapshot=Path(report.pop('snapshot','') or '.')
        audit_root=Path(__file__).with_name('audits').resolve()
        if snapshot.is_file() and snapshot.resolve().is_relative_to(audit_root):
            try:
                import cv2
                frame=cv2.imread(str(snapshot))
                if frame is not None:
                    width=320
                    frame=cv2.resize(frame,(width,max(1,int(frame.shape[0]*width/frame.shape[1]))))
                    ok,encoded=cv2.imencode('.jpg',frame,[cv2.IMWRITE_JPEG_QUALITY,60])
                    if ok and len(encoded)<90000:
                        report['shelf_thumbnail']={'mime_type':'image/jpeg','data_base64':base64.b64encode(encoded).decode()}
            except (ImportError,OSError,ValueError): pass
        audit_id=str(uuid.uuid5(uuid.NAMESPACE_URL,self.fridge_id+':'+report['time']))
        return self._persist('/inventory/audits',{
            'id':audit_id,'fridge_id':self.fridge_id,'captured_at':report['time'],
            'image_quality':'usable' if status in ('ok','discrepancy') else 'limited' if status=='unchanged' else 'unusable',
            'model':'gemini-shelf-audit' if status in ('ok','discrepancy') else 'camera-check-not-analyzed',
            'result':report,
            'comparison':{'missing':report.get('missing',[]),'unexpected':report.get('unexpected',[]),
                          'policy':'observation_only_stock_unchanged'}})

def condition_summary(data):
    parts=[]
    for item in data.get('conditions',[]):
        value=item.get('value')
        parts.append(f"{item['label']}: {item['state']}, {'unavailable' if value is None else str(value)+' '+item['unit']}")
    parts.append(f"Monitoring coverage {data.get('monitoring_confidence_percent',0):.1f}%; this is not food safety confidence.")
    return ' | '.join(parts)
