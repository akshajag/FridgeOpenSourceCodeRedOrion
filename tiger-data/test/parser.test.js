import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSensorLine} from '../sensor-parser.js';
test('parses actual Arduino firmware line',()=>assert.deepEqual(parseSensorLine('Temperature: 22.50 C / 72.50 F | Moisture raw: 0 | Air raw: 20'),{temperature_c:22.5,moisture_raw:0,air_quality_raw:20}));
test('skips bus/initialization diagnostics and invalid measurements',()=>{for(const line of ['Sensor ID: 0x11','Temperature: 99 C / 210 F | Moisture raw: 0 | Air raw: 20','Temperature: 22 C / 72 F | Moisture raw: 1024 | Air raw: 20'])assert.equal(parseSensorLine(line),null);});
