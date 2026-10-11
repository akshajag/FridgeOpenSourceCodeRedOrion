import unittest
from unittest.mock import Mock
from fridge_placement import PlacementGate,PlacementPending

class PlacementTests(unittest.TestCase):
    def setUp(self):
        self.frame=Mock();self.frame.copy.return_value=self.frame
        self.vision=Mock();self.capture=Mock(return_value=self.frame)
        self.gate=PlacementGate(self.capture,self.vision);self.gate.begin()
        self.good={'image_usable':True,'placed_inside':True,'quantity_increased':True,'item_match':'confirmed','added_count':1,'reason':'new can visible on shelf'}
    def test_new_visible_item_passes(self):
        self.vision.verify_placement.return_value=self.good
        self.assertEqual(self.gate.verify('Can',1),self.good)
        self.vision.verify_placement.assert_called_once_with(self.frame,self.frame,'Can',1)
    def test_existing_can_or_held_item_cannot_pass(self):
        for change in ({'quantity_increased':False},{'placed_inside':False},{'item_match':'uncertain'},{'added_count':0},{'added_count':True},{'image_usable':False}):
            self.vision.verify_placement.return_value={**self.good,**change}
            with self.assertRaises(PlacementPending):self.gate.verify('Can',1)
    def test_failed_check_retains_baseline_and_retry_id(self):
        op=self.gate.operation_id;self.vision.verify_placement.side_effect=RuntimeError('service down')
        with self.assertRaises(PlacementPending):self.gate.verify('Can',1)
        self.assertIs(self.gate.before,self.frame);self.assertEqual(op,self.gate.operation_id)
    def test_after_completion_requires_new_scan(self):
        self.gate.complete()
        with self.assertRaises(PlacementPending):self.gate.verify('Can',1)
    def test_quantity_must_cover_whole_donation(self):
        self.vision.verify_placement.return_value=self.good
        with self.assertRaises(PlacementPending):self.gate.verify('Can',2)
