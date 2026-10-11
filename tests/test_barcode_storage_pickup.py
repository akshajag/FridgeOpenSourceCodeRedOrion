import unittest
from unittest.mock import Mock,patch
import numpy as np
import cv2
import zxingcpp
from fridge_local_vision import LocalVision,decode_barcode
from fridge_storage_policy import storage_verdict
from fridge_placement import PickupGate,PlacementPending
from fridge_voice_agent import FridgeVoiceAgent

class BarcodeTests(unittest.TestCase):
    def image(self):
        b=zxingcpp.create_barcode('4006381333931',zxingcpp.BarcodeFormat.EAN13)
        return cv2.cvtColor(np.asarray(zxingcpp.write_barcode_to_image(b,scale=3)),cv2.COLOR_GRAY2BGR)
    def test_real_decoder_handles_normal_mirror_and_rotation(self):
        frame=self.image()
        for image in (frame,cv2.flip(frame,1),cv2.rotate(frame,cv2.ROTATE_90_CLOCKWISE)):
            self.assertEqual(decode_barcode(image)[0],'4006381333931')
    def test_barcode_success_never_loads_ocr_or_invokes_gemini(self):
        v=LocalVision(lambda:self.image(),fallback=Mock())
        v.warm_up=Mock(side_effect=AssertionError('OCR/YOLO not needed'))
        v._lookup_barcode=Mock(return_value=('Catalog match',''));v.last_product={'barcode':'4006381333931','name':'Milk'}
        v._enrich_item=Mock();v._gemini_catalog_note=Mock(side_effect=AssertionError('No Gemini allowed'))
        self.assertEqual(v.scan_barcode(),'Catalog match')
        v.warm_up.assert_not_called();v._fallback.product_metadata.assert_not_called()
    def test_unknown_barcode_does_not_fall_back_to_gemini(self):
        v=LocalVision(lambda:self.image(),fallback=Mock())
        v._lookup_barcode=Mock(return_value=('','Barcode was read but not in the catalog.'))
        self.assertIn('decoding succeeded',v.scan_barcode())
        v._fallback.product_metadata.assert_not_called()
    def test_expiry_ocr_tries_mirrored_text(self):
        frame=np.arange(300,dtype=np.uint8).reshape(10,10,3)
        v=LocalVision(lambda:frame);v.warm_up=Mock()
        lines=[('BEST BEFORE 23 AUG 2027',.99,(1,1,8,8))]
        v._read_text=Mock(side_effect=[[],lines]);v._find_date=Mock(side_effect=[None,('BEST BEFORE 23 AUG 2027',.99),('BEST BEFORE 23 AUG 2027',.99)])
        self.assertEqual(v.read_expiry(),'BEST BEFORE 23 AUG 2027')
        np.testing.assert_array_equal(v._read_text.call_args_list[1].args[0],cv2.flip(frame,1))

class StorageTests(unittest.TestCase):
    def test_doritos_cannot_bypass_policy_with_false_cold_storage_claim(self):
        self.assertEqual(storage_verdict('Doritos Nacho Cheese Tortilla Chips',{'storage':'refrigerate'})[0],'no')
    def test_unknown_storage_is_not_automatically_accepted(self):
        self.assertEqual(storage_verdict('Mystery package')[0],'unsure')
    def test_milk_and_chilled_drinks_pass_but_open_pack_does_not(self):
        self.assertEqual(storage_verdict('Milk')[0],'yes')
        self.assertEqual(storage_verdict('Red Bull energy drink')[0],'yes')
        self.assertEqual(storage_verdict('Milk',{'sealed':False})[0],'no')

class PickupTests(unittest.TestCase):
    def test_hidden_or_unconfirmed_removal_cannot_pass(self):
        frame=Mock();frame.copy.return_value=frame;vision=Mock()
        gate=PickupGate(lambda:frame,vision);gate.begin()
        good={'image_usable':True,'removed_from_shelf':True,'removed_count':1,'item_match':'confirmed'}
        for delta in ({'removed_from_shelf':False},{'removed_count':True},{'removed_count':2},{'item_match':'uncertain'}):
            vision.verify_pickup.return_value={**good,**delta}
            with self.assertRaises(PlacementPending):gate.verify('Milk',1)
        vision.verify_pickup.return_value=good
        self.assertEqual(gate.verify('Milk',1),good)
    def test_username_only_cannot_authenticate_or_credit_points(self):
        with patch('fridge_voice_agent.TranscriptLog'):
            a=FridgeVoiceAgent(Mock(),'test',text_mode=True)
        self.addCleanup(a._barcode_pool.shutdown,wait=False,cancel_futures=True)
        a._pickup_authenticator=Mock();a._pickup_store=Mock()
        self.assertIn('six-digit',a._tool_authenticate_pickup({'username':'Volunteer'}))
        self.assertIn('Authenticate',a._tool_record_pickup({'pickup_confirmed':True,'quantity':1,'product_id':'milk'}))
        a._pickup_authenticator.assert_not_called();a._pickup_store.assert_not_called()
        a._pickup_auth={'username':'old user'}
        with patch('fridge_voice_agent.TranscriptLog'):a.reset_donor_session()
        self.assertIsNone(a._pickup_auth)
