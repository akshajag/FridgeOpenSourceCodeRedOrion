import threading, unittest
from unittest.mock import Mock, patch
from fridge_voice_agent import FridgeVoiceAgent
from fridge_local_vision import LocalVision

class KioskTests(unittest.TestCase):
    def make_agent(self):
        with patch('fridge_voice_agent.TranscriptLog'):
            a=FridgeVoiceAgent(Mock(),'test-agent',text_mode=True)
        self.addCleanup(a._barcode_pool.shutdown,wait=False,cancel_futures=True)
        return a
    def test_reset_clears_private_donor_state_keeps_shared_fridge_and_history(self):
        a=self.make_agent();a._pending_products=[{'name':'private scan'}];a._context={'FRIDGE SENSORS':['3 C',True],'FRIDGE VISION':['inventory',True],'DONOR AUTH':['old-user',True],'FRIDGE VISION CHECK':['old-item',True]};a._checks=4;a.donations=[{'items':'saved item'}];a._barcode_job=Mock();reset=Mock();a.on_session_reset(reset)
        with patch('fridge_voice_agent.TranscriptLog'):a.reset_donor_session()
        self.assertEqual(a._pending_products,[]);self.assertEqual(set(a._context),{'FRIDGE SENSORS','FRIDGE VISION'});self.assertEqual(a._context['FRIDGE SENSORS'],['3 C',False]);self.assertEqual(a.donations,[{'items':'saved item'}]);reset.assert_called_once();self.assertIsNone(a._barcode_job)
    def test_reset_failure_stops_kiosk_instead_of_reusing_auth(self):
        a=self.make_agent();a.on_session_reset(Mock(side_effect=RuntimeError('logout failed')))
        with patch('fridge_voice_agent.TranscriptLog'),patch('fridge_voice_agent.log'):a.reset_donor_session()
        self.assertTrue(a._stop.is_set())
    def test_normal_donor_loops_do_not_exhaust_reconnect_limit(self):
        a=self.make_agent();calls=[]
        def run_session():
            calls.append(1)
            if len(calls)==9:a.stop()
            return True
        a._run_session=run_session;a._print_summary=Mock()
        with patch.object(a._stop,'wait',return_value=False):a.run()
        self.assertEqual(len(calls),9)
    def test_barcode_from_previous_session_cannot_reach_new_donor(self):
        a=self.make_agent();a._session_generation=2;a._barcode_scanner=Mock(return_value='old barcode');a._live_conversation=Mock()
        self.assertIn('previous donor',a._barcode_scan_job(True,1));a._live_conversation.assert_not_called()
    def test_camera_reset_discards_product_metadata(self):
        v=LocalVision(lambda:None);v.last_details={'name':'old product'};v.product_photo=(1,'image','caption');v.overlay=(1,['old']);v.reset_session()
        self.assertIsNone(v.last_details);self.assertIsNone(v.product_photo);self.assertEqual(v.overlay,(0.0,[]))
