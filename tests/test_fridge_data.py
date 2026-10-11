import sys, types, unittest, uuid, tempfile
from pathlib import Path
from unittest.mock import Mock
# Adapter tests need no credentials or third-party runtime.
try:
    import dotenv
except ImportError:
    sys.modules.setdefault('dotenv', types.SimpleNamespace(dotenv_values=lambda *a: {}))
from fridge_data import FridgeData

class DataTests(unittest.TestCase):
    def setUp(self):
        self.data=FridgeData(token='test',fridge_id='test-fridge')
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.data.outbox=Path(self.temp.name)
        self.data.request=Mock(side_effect=lambda method,path,body=None: {'id':'product-id'} if path=='/products' else {'stored':True})
    def test_confirmation_reuses_product_and_proposal_on_retry(self):
        op=str(uuid.uuid4())
        self.data.confirm_donation('Milk',1,operation_id=op)
        self.data.confirm_donation('Milk',1,operation_id=op)
        calls=self.data.request.call_args_list
        self.assertEqual(sum(c.args[1]=='/products' for c in calls),1)
        self.assertEqual([c.args[2]['id'] for c in calls if c.args[1]=='/donations/propose'],[op,op])
    def test_unsuitable_item_cannot_write_stock(self):
        with self.assertRaises(ValueError):self.data.confirm_donation('Soap',1,{'is_food':False})
        self.data.request.assert_not_called()
    def test_unavailable_check_is_saved_without_claiming_gemini_analysis(self):
        self.data.save_audit({'status':'unavailable','time':'2026-10-11T03:00:00+00:00'})
        body=self.data.request.call_args.args[2]
        self.assertEqual(body['image_quality'],'unusable')
        self.assertEqual(body['model'],'camera-check-not-analyzed')
    def test_audit_id_stable_and_observation_only(self):
        report={'status':'discrepancy','time':'2026-10-11T03:00:00+00:00','missing':['Milk']}
        self.data.save_audit(report);self.data.save_audit(report)
        bodies=[c.args[2] for c in self.data.request.call_args_list]
        self.assertEqual(bodies[0]['id'],bodies[1]['id'])
        self.assertEqual(bodies[0]['comparison']['policy'],'observation_only_stock_unchanged')
        self.assertTrue(all(c.args[1]=='/inventory/audits' for c in self.data.request.call_args_list))
    def test_remote_token_destination_rejected(self):
        with self.assertRaises(ValueError):FridgeData(base_url='https://example.com',token='test')

    def test_audit_outage_retries_same_id_from_disk(self):
        from fridge_data import DataUnavailable
        report={'status':'ok','time':'2026-10-11T03:00:00+00:00'}
        self.data.request.side_effect=DataUnavailable('offline')
        with self.assertRaises(DataUnavailable): self.data.save_audit(report)
        files=list(self.data.outbox.glob('*.json'))
        self.assertEqual(len(files),1)
        second=FridgeData(token='test',fridge_id='test-fridge'); second.outbox=self.data.outbox
        second.request=Mock(return_value={'stored':True})
        second.flush_outbox()
        self.assertEqual(self.data.request.call_args.args[2]['id'],second.request.call_args.args[2]['id'])
        self.assertFalse(list(self.data.outbox.glob('*.json')))
    def test_scan_does_not_block_or_create_inventory(self):
        self.data.save_scan({'product_name':'Milk'})
        self.data.request.assert_not_called()
        self.data.flush_outbox()
        self.assertEqual(self.data.request.call_args.args[1],'/inventory/scans')
        self.assertEqual(self.data.request.call_args.args[2]['result']['stage'],'identified_not_deposited')
    def test_matched_stock_photo_is_preserved_and_text_search_is_not_barcode_proof(self):
        self.data.confirm_donation('Milk',1,{'catalog':{'barcode':'0123456789012','image_url':'https://images.openfoodfacts.org/fallback.jpg'},'catalog_match_method':'text','catalog_photo':{'url':'https://images.openfoodfacts.org/matched.jpg','verdict':'same'}},operation_id=str(uuid.uuid4()))
        product=next(c.args[2] for c in self.data.request.call_args_list if c.args[1]=='/products')
        self.assertIsNone(product['barcode'])
        self.assertEqual(product['match_method'],'visual')
        self.assertEqual(product['display_image_url'],'https://images.openfoodfacts.org/matched.jpg')

if __name__=='__main__':unittest.main()
