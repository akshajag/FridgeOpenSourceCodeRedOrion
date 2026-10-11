import unittest
from unittest.mock import Mock,patch
import numpy as np
from fridge_inventory import InventoryAuditor
class AuditorTests(unittest.TestCase):
    def make(self):
        with patch.object(InventoryAuditor,'_load_ledger',return_value=[]):
            model=Mock()
            model.audit_shelves.return_value={'image_usable':True,'expected':[{'name':'Milk','seen_count':None},{'name':'Beans','seen_count':0}],'unexpected':[]}
            auditor=InventoryAuditor(0,gemini=model,capture=lambda:np.full((180,320,3),100,np.uint8),expected_provider=lambda:[{'name':'Milk','count':2},{'name':'Beans','count':1}])
        auditor._save_ledger=Mock();auditor._save_snapshot=Mock(return_value='')
        return auditor,model
    def test_hidden_items_are_not_reported_as_observed(self):
        auditor,_=self.make();result=auditor.audit_now()
        self.assertEqual(result['observed_items'],[{'name':'Beans','count':0}])
        self.assertEqual(result['unclear'],['Milk'])
        self.assertEqual(auditor.expected,[{'name':'Milk','count':2},{'name':'Beans','count':1}])
    def test_unchanged_image_is_analyzed_again_after_five_minutes(self):
        auditor,model=self.make()
        with patch('fridge_inventory.time.monotonic',return_value=1000):auditor.audit_now()
        with patch('fridge_inventory.time.monotonic',return_value=1100):self.assertEqual(auditor.audit_now()['status'],'unchanged')
        with patch('fridge_inventory.time.monotonic',return_value=1301):auditor.audit_now()
        self.assertEqual(model.audit_shelves.call_count,2)
