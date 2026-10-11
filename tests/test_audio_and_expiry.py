import unittest
from unittest.mock import Mock,patch
import numpy as np
from fridge_voice_agent import SpeakerMicInterface
from fridge_local_vision import LocalVision

class AudioTests(unittest.TestCase):
    def test_buffers_and_keeps_partial_pcm_sample(self):
        a=SpeakerMicInterface();out=bytearray(4)
        a.output(b'\x01\x02\x03')
        with patch('fridge_voice_agent.time.monotonic',return_value=a._last_received+1):
            a._on_speaker(out,2,None,None)
        self.assertEqual(out,b'\x01\x02\x00\x00')
        self.assertEqual(a._playback,b'\x03')
        a.output(b'\x04')
        with patch('fridge_voice_agent.time.monotonic',return_value=a._last_received+1):
            a._on_speaker(out,2,None,None)
        self.assertEqual(out,b'\x03\x04\x00\x00')
    def test_short_first_chunk_waits_for_buffer(self):
        a=SpeakerMicInterface();a.output(b'\x01\x02'*100);out=bytearray(20)
        a._on_speaker(out,10,None,None)
        self.assertEqual(out,bytes(20));self.assertEqual(len(a._playback),200)
    def test_interruption_clears_buffer(self):
        a=SpeakerMicInterface();a.output(b'\x01\x02'*4000);a.interrupt()
        self.assertFalse(a._playback_ready);self.assertFalse(a._playback)

class ExpiryTests(unittest.TestCase):
    def test_ocr_failure_still_attempts_gemini(self):
        v=object.__new__(LocalVision);v.warm_up=Mock();v._get_frame=Mock(return_value=np.zeros((10,10,3),dtype=np.uint8));v._fallback=Mock();v._fallback.read_expiry_frame.return_value='BEST BEFORE 23 AUG 2027';v._ask_fallback=lambda f:f()
        with patch('fridge_local_vision.time.monotonic',side_effect=[0,7]):
            self.assertEqual(v.read_expiry('can'),'BEST BEFORE 23 AUG 2027')
        v._fallback.read_expiry_frame.assert_called_once()
