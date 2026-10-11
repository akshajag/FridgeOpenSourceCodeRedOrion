import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trustedDevice,deviceTicket} from '../src/lib/hardware/device.ts';
process.env.FRIDGE_HARDWARE_MODE='1';
process.env.FRIDGE_ALLOWED_HOSTS='localhost,127.0.0.1,192.168.1.5';
process.env.FRIDGE_DEVICE_KEY='test-only-key';
test('both local and LAN screens need a signed device ticket',()=>{
 assert.equal(trustedDevice('localhost:3001'),false);
 assert.equal(trustedDevice('localhost:3001',deviceTicket()),true);
 assert.equal(trustedDevice('192.168.1.5:3001'),false);
 assert.equal(trustedDevice('192.168.1.5:3001',deviceTicket()),true);
});
test('another host, forged and expired tickets are denied',()=>{
 assert.equal(trustedDevice('example.com',deviceTicket()),false);
 assert.equal(trustedDevice('192.168.1.5', '123.'+'0'.repeat(64)),false);
 const ticket=deviceTicket();const forged=ticket.slice(0,-1)+(ticket.endsWith('a')?'b':'a');
 assert.equal(trustedDevice('192.168.1.5',forged),false);
 assert.equal(trustedDevice('192.168.1.5','bad.bad'),false);
});
test('hardware access is disabled outside explicit local mode',()=>{
 process.env.FRIDGE_HARDWARE_MODE='0';assert.equal(trustedDevice('localhost'),false);process.env.FRIDGE_HARDWARE_MODE='1';
});
