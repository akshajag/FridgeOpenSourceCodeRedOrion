import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pickupEvidenceValid,hashCode} from '../pickups.js';
test('uncertain, occluded, wrong-count and boolean-count removal never awards points',()=>{
 const good={image_usable:true,removed_from_shelf:true,item_match:'confirmed',removed_count:1};
 assert.equal(pickupEvidenceValid(good,1),true);
 for(const d of [{image_usable:false},{removed_from_shelf:false},{item_match:'uncertain'},{removed_count:true},{removed_count:2}])assert.equal(pickupEvidenceValid({...good,...d},1),false);
});
test('stored code hash is stable and does not reveal the pickup code',()=>{assert.equal(hashCode('123456'),hashCode('123456'));assert.notEqual(hashCode('123456'),hashCode('123457'));assert.equal(hashCode('123456').length,64);assert.ok(!hashCode('123456').includes('123456'));});
