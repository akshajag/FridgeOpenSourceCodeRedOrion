import threading
import unittest
from unittest.mock import Mock, patch
from datetime import datetime, timedelta
from fridge_placement import PlacementGate, PlacementPending
from fridge_voice_agent import FridgeVoiceAgent
from fridge_vision import GeminiVision

class DonationFlowTests(unittest.TestCase):
    def test_physical_camera_assignment_survives_reordered_devices(self):
        from fridge_camera_devices import named_camera
        with patch('fridge_camera_devices.camera_names', return_value=['iPhone', 'Brio 101', 'FaceTime HD Camera']):
            self.assertEqual(named_camera('Brio 101', 0), 1)
            self.assertEqual(named_camera('FaceTime HD Camera', 1), 2)
            with self.assertRaises(RuntimeError):
                named_camera('missing camera', 0)

    def test_front_rescan_keeps_original_shelf_evidence_and_operation(self):
        before, after = Mock(), Mock()
        before.copy.return_value = before
        camera = Mock(side_effect=[before, after])
        gate = PlacementGate(camera, Mock())
        gate.begin()
        operation = gate.operation_id
        gate.begin()
        self.assertIs(gate.before, before)
        self.assertEqual(gate.operation_id, operation)
        camera.assert_called_once()

    def test_missing_baseline_blocks_scan_before_donor_places_food(self):
        gate = PlacementGate(lambda: None, Mock())
        with patch('fridge_placement.time.monotonic', side_effect=[0, 3]):
            with self.assertRaisesRegex(PlacementPending, 'Keep the item outside'):
                gate.begin()
        self.assertIsNone(gate.operation_id)

    def test_camera_warmup_can_provide_baseline(self):
        frame = Mock(); frame.copy.return_value = frame
        gate = PlacementGate(Mock(side_effect=[None, frame]), Mock())
        with patch('fridge_placement.time.sleep'):
            gate.begin()
        self.assertIs(gate.before, frame)

    def make_agent(self):
        with patch('fridge_voice_agent.TranscriptLog'):
            agent = FridgeVoiceAgent(Mock(), 'test', text_mode=True)
        self.addCleanup(agent._barcode_pool.shutdown, wait=False, cancel_futures=True)
        return agent

    def test_spoken_date_requires_complete_date_and_readback_confirmation(self):
        agent = self.make_agent()
        for params in ({'date': '2027-05-20', 'donor_confirmed': False},
                       {'date': '05/20', 'donor_confirmed': True},
                       {'date': '2027-02-30', 'donor_confirmed': True}):
            self.assertIn('not saved', agent._tool_record_expiration_date(params))
            self.assertIsNone(agent._expiration)
        date = (datetime.now() + timedelta(days=100)).date().isoformat()
        self.assertIn('spoken', agent._tool_record_expiration_date({'date': date, 'donor_confirmed': True}))
        self.assertEqual(agent._expiration['source'], 'donor_reported')
        with patch('fridge_voice_agent.TranscriptLog'):
            agent.reset_donor_session()
        self.assertIsNone(agent._expiration)

    def test_expired_spoken_date_cannot_be_donated(self):
        agent = self.make_agent(); agent._donation_store = Mock()
        agent._tool_record_expiration_date({'date': '2000-01-01', 'donor_confirmed': True})
        self.assertIn('past', agent._tool_log_donation({'items':'Milk','item_count':1,'placement_confirmed':True}))
        agent._donation_store.assert_not_called()

    def test_timeout_on_first_model_still_tries_backup(self):
        vision = object.__new__(GeminiVision)
        vision._cooling_until = {}
        vision._ask = Mock(side_effect=[TimeoutError('timeout'), {'image_usable':True}])
        with patch('fridge_vision.time.monotonic', side_effect=[0, 0, 0, 10, 10]):
            result = vision._ask_with_fallback('prompt', {}, Mock(), ['first','backup'], 1280)
        self.assertTrue(result['image_usable'])
        self.assertEqual(vision._ask.call_count, 2)
