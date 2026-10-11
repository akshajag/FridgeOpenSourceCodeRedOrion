import sys, types, unittest, uuid
from unittest.mock import Mock
# Adapter tests need no credentials or third-party runtime.
sys.modules.setdefault('dotenv', types.SimpleNamespace(dotenv_values=lambda *a: {}))
from fridge_data import FridgeData

class DataTests(unittest.TestCase):
    def setUp(self):
        self.data=FridgeData(token='test',fridge_id='test-fridge')
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
    def test_failed_audit_is_not_saved(self):
        self.assertIsNone(self.data.save_audit({'status':'unavailable'}))
        self.data.request.assert_not_called()
    def test_audit_id_stable_and_observation_only(self):
        report={'status':'discrepancy','time':'2026-10-11T03:00:00+00:00','missing':['Milk']}
        self.data.save_audit(report);self.data.save_audit(report)
        bodies=[c.args[2] for c in self.data.request.call_args_list]
        self.assertEqual(bodies[0]['id'],bodies[1]['id'])
        self.assertEqual(bodies[0]['comparison']['policy'],'observation_only_stock_unchanged')
        self.assertTrue(all(c.args[1]=='/inventory/audits' for c in self.data.request.call_args_list))
    def test_remote_token_destination_rejected(self):
        with self.assertRaises(ValueError):FridgeData(base_url='https://example.com',token='test')

if __name__=='__main__':unittest.main()
