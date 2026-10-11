import unittest
from unittest.mock import Mock
from fridge_voice_agent import FridgeVoiceAgent

class ConfirmationTests(unittest.TestCase):
    def test_identity_confirmation_cannot_record_or_award(self):
        agent=object.__new__(FridgeVoiceAgent)
        agent._donation_store=Mock()
        for flag in (None,False,"true",1):
            result=agent._tool_log_donation({"items":"Milk","item_count":1,"placement_confirmed":flag})
            self.assertIn("Not recorded",result)
        agent._donation_store.assert_not_called()
