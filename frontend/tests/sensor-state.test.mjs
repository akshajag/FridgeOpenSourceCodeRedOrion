import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sensorState,metricSupported,bandFor} from '../src/components/operator/sensor-state.ts';
const now=Date.now(),thresholds={tempMinC:-19,tempMaxC:-15,airQualityMaxPpm:81,moistureMaxRaw:10,movementMaxG:0.2};
const reading=(metric,value,age=0)=>({id:'sample',fridgeId:'test',metric,value,unit:metric==='movement'?'g':'raw',source:'hardware',at:new Date(now-age).toISOString()});
test('contact moisture threshold is inclusive and uses its own raw limit',()=>{
 assert.equal(sensorState('moisture',reading('moisture',9),thresholds,now),'ok');
 assert.equal(sensorState('moisture',reading('moisture',10),thresholds,now),'warning');
 assert.deepEqual(bandFor('moisture',thresholds),{min:0,max:10});
});
test('movement threshold excludes exactly 0.20g and alerts above it',()=>{
 assert.equal(sensorState('movement',reading('movement',0.2),thresholds,now),'ok');
 assert.equal(sensorState('movement',reading('movement',0.201),thresholds,now),'warning');
 assert.deepEqual(bandFor('movement',thresholds),{min:0,max:0.2});
});
test('missing/stale readings cannot look normal and capabilities stay independent',()=>{
 assert.equal(sensorState('movement',undefined,thresholds,now),'stale');
 assert.equal(sensorState('moisture',reading('moisture',0,21000),thresholds,now),'stale');
 assert.equal(metricSupported('movement',{airQuality:true,movement:false}),false);
 assert.equal(metricSupported('moisture',{humidity:false,moisture:true}),true);
});
