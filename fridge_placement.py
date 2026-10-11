"""Verify a new donation using before/after frames from the fixed shelf camera."""
import uuid

class PlacementPending(RuntimeError):
    pass

class PlacementGate:
    def __init__(self, capture, vision):
        self.capture=capture
        self.vision=vision
        self.before=None
        self.operation_id=None

    def begin(self):
        frame=self.capture() if self.capture else None
        self.before=frame.copy() if frame is not None else None
        self.operation_id=str(uuid.uuid4())

    def verify(self, item, count):
        if self.vision is None or self.capture is None or self.before is None:
            raise PlacementPending('The inside camera is not ready. Ask the operator to connect it, then scan the item again before placing it.')
        after=self.capture()
        if after is None:
            raise PlacementPending('The inside camera has no picture. No donation was recorded; ask the operator to reconnect it.')
        try:result=self.vision.verify_placement(after,self.before,item,int(count))
        except Exception:
            raise PlacementPending('The inside-camera check is unavailable. No donation was recorded. Ask the donor to wait, then retry confirmation.') from None
        # Qualitative model observations are evidence, not calibrated probabilities.
        if (result.get('image_usable') is not True or result.get('placed_inside') is not True
                or result.get('quantity_increased') is not True or result.get('item_match') != 'confirmed'
                or not isinstance(result.get('added_count'),int) or isinstance(result.get('added_count'),bool)
                or result['added_count'] < int(count)):
            raise PlacementPending('The inside camera cannot yet verify the new item. Ask the donor to place it visibly on the fridge shelf, uncover its label, and say when ready to check again.')
        return result

    def complete(self):
        self.before=None
        self.operation_id=None
