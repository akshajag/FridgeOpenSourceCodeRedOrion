"""Verify a new donation using before/after frames from the fixed shelf camera."""
import uuid
import time
import logging
log = logging.getLogger("fridge.placement")

class PlacementPending(RuntimeError):
    pass

class PlacementGate:
    def __init__(self, capture, vision):
        self.capture=capture
        self.vision=vision
        self.before=None
        self.operation_id=None

    def begin(self):
        # A front-camera retry belongs to the same donation. Never replace
        # its empty-shelf evidence after the donor has already put food inside.
        if self.before is not None:
            return
        deadline = time.monotonic() + 2.5
        frame = self.capture() if self.capture else None
        while frame is None and self.capture and time.monotonic() < deadline:
            time.sleep(0.1)
            frame = self.capture()
        if frame is None:
            raise PlacementPending("The inside camera is not ready. Keep the item outside while the operator checks the shelf camera, then retry the item scan.")
        self.before=frame.copy()
        self.operation_id=str(uuid.uuid4())

    def verify(self, item, count):
        if self.vision is None or self.capture is None or self.before is None:
            raise PlacementPending('The inside camera is not ready. Ask the operator to connect it, then scan the item again before placing it.')
        after=self.capture()
        if after is None:
            raise PlacementPending('The inside camera has no picture. No donation was recorded; ask the operator to reconnect it.')
        try:result=self.vision.verify_placement(after,self.before,item,int(count))
        except Exception as exc:
            log.warning("Shelf verification failed: %s", exc)
            raise PlacementPending('The inside-camera AI check is temporarily unavailable. The donation is pending, not recorded. Keep the item visible inside and retry confirmation; do not rescan the front camera.') from None
        # Qualitative model observations are evidence, not calibrated probabilities.
        if (result.get('image_usable') is not True or result.get('placed_inside') is not True
                or result.get('quantity_increased') is not True or result.get('item_match') != 'confirmed'
                or not isinstance(result.get('added_count'),int) or isinstance(result.get('added_count'),bool)
                or result['added_count'] < int(count)):
            reason = str(result.get('reason') or 'The new item is not clearly visible.')[:300]
            raise PlacementPending(f'Not recorded yet. Shelf camera: {reason} Ask the donor to leave the new item visibly on the shelf, move their hand away, and say when ready to retry the inside check. Do not rescan the front camera.')
        return result

    def complete(self):
        self.before=None
        self.operation_id=None

class PickupGate(PlacementGate):
    """Compare fixed-camera shelf evidence for an authenticated collection."""
    def verify(self, item, count):
        if self.before is None or self.capture is None or self.vision is None:
            raise PlacementPending('The shelf camera is not ready. Authenticate before taking food, then retry.')
        after = self.capture()
        if after is None:
            raise PlacementPending('No fresh shelf image. Pickup is pending; no points or stock changes.')
        try:
            result = self.vision.verify_pickup(after, self.before, item, int(count))
        except Exception as exc:
            log.warning('Pickup check failed: %s', exc)
            raise PlacementPending('The inside-camera check is unavailable. No points or stock changes; retry the pickup check without restarting.') from None
        if (result.get('image_usable') is not True or result.get('removed_from_shelf') is not True
            or result.get('item_match') != 'confirmed' or type(result.get('removed_count')) is not int
            or result['removed_count'] != int(count)):
            raise PlacementPending('Pickup not verified. ' + str(result.get('reason') or 'The requested removal is not visible.')[:250] + ' Keep the camera fixed and retry; no points were awarded.')
        return result
