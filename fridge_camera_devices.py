"""Resolve macOS webcams by physical name instead of unstable numeric order."""
import logging
import sys

log = logging.getLogger('fridge.camera')

def camera_names():
    if sys.platform != 'darwin':
        return []
    import AVFoundation
    devices = list(AVFoundation.AVCaptureDevice.devicesWithMediaType_(AVFoundation.AVMediaTypeVideo))
    devices += list(AVFoundation.AVCaptureDevice.devicesWithMediaType_(AVFoundation.AVMediaTypeMuxed))
    # OpenCV AVFoundation sorts by uniqueID, not discovery order.
    devices.sort(key=lambda device: str(device.uniqueID()))
    return [str(device.localizedName()) for device in devices]

def named_camera(name, fallback):
    if not name:
        return fallback
    names = camera_names()
    matches = [i for i, candidate in enumerate(names) if name.casefold() in candidate.casefold()]
    if len(matches) != 1:
        raise RuntimeError(f'Camera {name!r} must match exactly one connected webcam. Available: {names}. Reconnect the named camera; do not substitute the donor camera for the shelf camera.')
    log.info('Camera assignment: %s = index %d', names[matches[0]], matches[0])
    return matches[0]
