"""Private, local API adapter shared by the vision test bench and voice app."""
from __future__ import annotations
import json
import os
import uuid
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote, urlparse
from dotenv import dotenv_values

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
        count=int(count)
        if not name.strip() or not 1<=count<=10000:
            raise ValueError('A product name and valid quantity are required.')
        operation_id=operation_id or str(uuid.uuid4())
        catalog=details.get('catalog') or {}
        barcode=str(catalog.get('barcode') or '')
        barcode=barcode if barcode.isdigit() and 8<=len(barcode)<=14 else None
        def https(value):
            return value if isinstance(value,str) and value.startswith('https://') else None
        if operation_id not in self._products:
            product=self.request('POST','/products',{
                'canonical_name':name[:200], 'barcode':barcode,
                'brand':str(details.get('brand') or catalog.get('brand') or '')[:200] or None,
                'package_size':str(details.get('size') or catalog.get('size') or '')[:100] or None,
                'display_image_url':https(catalog.get('image_url')),
                'image_source_url':https(catalog.get('source_url')),
                'match_method':'barcode' if barcode else 'visual' if details else 'manual',
                'metadata':{'vision_details':details,'expiry_status':'unverified'}})
            self._products[operation_id]=product['id']
        self.request('POST','/donations/propose',{
            'id':operation_id,'fridge_id':self.fridge_id,'product_id':self._products[operation_id],
            'quantity':count,'identification_method':'barcode' if barcode else 'gemini' if details else 'manual',
            'certainty':'unknown','details':{'confirmation':'operator_confirmed_placement','vision_details':details}})
        return self.request('POST','/donations/confirm',{'proposal_id':operation_id})

    def save_audit(self,report):
        # Failed/unchanged local checks are not new Gemini observations.
        if report.get('status') not in ('ok','discrepancy'):
            return None
        audit_id=str(uuid.uuid5(uuid.NAMESPACE_URL,self.fridge_id+':'+report['time']))
        return self.request('POST','/inventory/audits',{
            'id':audit_id,'fridge_id':self.fridge_id,'captured_at':report['time'],
            'image_quality':'usable','model':'gemini-shelf-audit','result':report,
            'comparison':{'missing':report.get('missing',[]),'unexpected':report.get('unexpected',[]),
                          'policy':'observation_only_stock_unchanged'}})

def condition_summary(data):
    parts=[]
    for item in data.get('conditions',[]):
        value=item.get('value')
        parts.append(f"{item['label']}: {item['state']}, {'unavailable' if value is None else str(value)+' '+item['unit']}")
    parts.append(f"Monitoring coverage {data.get('monitoring_confidence_percent',0):.1f}%; this is not food safety confidence.")
    return ' | '.join(parts)
