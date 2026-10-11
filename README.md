# Nourish — Smart Community Fridge

CodeRED Orion 2026 project for community food donation and fridge monitoring.

Start the integrated two-screen MVP with **Launch MVP.command**. See [local startup, device pairing and test flow](RUN_LOCAL.md).

## Components

- **Hardware:** Arduino UNO R4 WiFi with temperature, contact-moisture, air-response and acceleration sensors.
- **Sensor backend:** USB ingestion into a Tiger Data TimescaleDB hypertable, with a local authenticated API.
- **Monitoring:** Live readings, independent condition alerts, thermal exposure and data-coverage calculations.
- **Camera service:** Gemini food identification and scheduled inventory observations from two cameras.

## Documentation

- [Hardware wiring and data flow](hardware/WIRING.md)
- [Database and sensor startup](tiger-data/README.md)
- [Thermal calculations](tiger-data/THERMAL_METRICS.md)
- [Sensor alerts and voice integration](tiger-data/SENSOR_ALERTS.md)
- [Camera service setup](camera-service/README.md)
- [Camera and ElevenLabs integration](CAMERA_INTEGRATION.md)
- [Vision and barcode requirements](VISION_REQUIREMENTS.md)

Use the `.env.example` files to configure credentials privately. API keys,
database passwords and recorded sensor data are not stored in Git.

## Validation and scope

Sensor tests recorded moisture response and recovery, air-sensor vapor response
and recovery, temperature changes and cart-movement threshold crossings.
Automated tests cover parsing, thermal calculations, alert logic and camera API
behavior. Run `npm test` in each service directory.

Monitoring confidence measures data completeness, not food safety. Contact
moisture is not humidity; air response is not a spoilage measurement. Smooth
cart rolling can evade the movement threshold. The vision requirements include
integration work such as barcode lookup, shared inventory updates and voice
workflows; refer to each component's documentation for its implemented scope.
