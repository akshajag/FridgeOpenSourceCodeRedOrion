import {randomUUID,randomInt,createHash} from 'node:crypto';
import {z} from 'zod';
export const hashCode=code=>createHash('sha256').update(code).digest('hex');
export function pickupEvidenceValid(e,count){return e?.image_usable===true&&e?.removed_from_shelf===true&&e?.item_match==='confirmed'&&Number.isInteger(e.removed_count)&&e.removed_count===count;}
export function installPickups(app,pool){
 const attempts=new Map();
 app.post('/pickups/authorizations',async(req,res)=>{
  const b=z.object({user_id:z.string().min(1).max(200),username:z.string().min(1).max(100),fridge_id:z.string().min(1).max(100),role:z.enum(['food_bank','volunteer'])}).parse(req.body);
  const id=randomUUID(),code=String(randomInt(100000,1000000)),mission=b.role==='volunteer'?randomUUID():null;
  const r=await pool.query(`INSERT INTO fridge.pickup_authorizations(id,user_id,username,fridge_id,role,mission_id,mission_title,code_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '10 minutes') RETURNING expires_at`,[id,b.user_id,b.username,b.fridge_id,b.role,mission,mission?'Transfer one chilled-food pickup to the food bank receiving desk':null,hashCode(code)]);
  res.status(201).json({code,username:b.username,expires_at:r.rows[0].expires_at,mission_title:mission?'Chilled food transfer — pickup leg':null,points_on_verified_pickup:mission?10:0});
 });
 app.post('/pickups/authenticate',async(req,res)=>{
  const b=z.object({username:z.string().min(1).max(100),code:z.string().regex(/^\d{6}$/),fridge_id:z.string().min(1).max(100)}).parse(req.body);
  const key=b.fridge_id,now=Date.now();let state=attempts.get(key);
  if(!state||now-state.at>60000){state={at:now,n:0};attempts.set(key,state);}
  if(++state.n>10)return res.status(429).json({error:'Wait a minute before another code attempt.'});
  const r=await pool.query(`UPDATE fridge.pickup_authorizations SET authenticated_at=COALESCE(authenticated_at,now()) WHERE code_hash=$1 AND lower(username)=lower($2) AND fridge_id=$3 AND expires_at>now() AND completed_at IS NULL RETURNING id,username,role,mission_title,expires_at`,[hashCode(b.code),b.username.trim(),b.fridge_id]);
  if(!r.rowCount)return res.status(401).json({error:'Username/code invalid, expired or already used. Generate a new code while signed in.'});
  const inventory=(await pool.query('SELECT product_id,canonical_name,recorded_quantity FROM fridge.inventory_balances WHERE fridge_id=$1 AND recorded_quantity>0',[b.fridge_id])).rows;
  res.json({...r.rows[0],inventory});
 });
 app.post('/pickups/complete',async(req,res)=>{
  const b=z.object({authorization_id:z.string().uuid(),product_id:z.string().uuid(),quantity:z.number().int().min(1).max(100),pickup_confirmed:z.literal(true),evidence:z.record(z.string(),z.unknown())}).parse(req.body);
  if(!pickupEvidenceValid(b.evidence,b.quantity))return res.status(409).json({error:'Matching shelf removal is not verified. No points or stock changes.'});
  const client=await pool.connect();try{
   await client.query('BEGIN');
   const a=(await client.query('SELECT * FROM fridge.pickup_authorizations WHERE id=$1 FOR UPDATE',[b.authorization_id])).rows[0];
   if(!a||!a.authenticated_at)throw new Error('Authenticate first.');
   if(a.completed_at){
    if(a.product_id!==b.product_id||a.quantity!==b.quantity)throw new Error('This pickup code was already used for another item.');
    await client.query('COMMIT');return res.json({saved:true,points_awarded:a.points,already_recorded:true});
   }
   if(new Date(a.expires_at)<=new Date())throw new Error('Pickup code expired. Sign in and generate another code.');
   await client.query('SELECT id FROM fridge.fridges WHERE id=$1 FOR UPDATE',[a.fridge_id]);
   const stock=(await client.query('SELECT recorded_quantity FROM fridge.inventory_balances WHERE fridge_id=$1 AND product_id=$2',[a.fridge_id,b.product_id])).rows[0];
   if(!stock||stock.recorded_quantity<b.quantity)throw new Error('Not enough recorded stock. Ask an operator to review inventory.');
   const points=a.role==='volunteer'?10:0;
   await client.query(`INSERT INTO fridge.inventory_events(id,fridge_id,product_id,kind,quantity_delta,verification,details) VALUES($1,$2,$3,'pickup',$4,'operator_confirmed',$5)`,[a.id,a.fridge_id,b.product_id,-b.quantity,{user_id:a.user_id,mission_id:a.mission_id,confirmation:'authenticated_camera_verified_pickup',evidence:b.evidence}]);
   await client.query('UPDATE fridge.pickup_authorizations SET completed_at=now(),product_id=$2,quantity=$3,points=$4,evidence=$5 WHERE id=$1',[a.id,b.product_id,b.quantity,points,b.evidence]);
   await client.query('COMMIT');res.json({saved:true,points_awarded:points,mission_stage:'picked_up',delivery_verified:false});
  }catch(e){await client.query('ROLLBACK');res.status(409).json({error:e.message});}finally{client.release();}
 });
 app.get('/pickups/users/:id',async(req,res)=>{
  const r=await pool.query('SELECT id,mission_title,completed_at,points,quantity FROM fridge.pickup_authorizations WHERE user_id=$1 AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 100',[req.params.id]);
  res.json({pickups:r.rows,points:r.rows.reduce((n,r)=>n+r.points,0)});
 });
 app.get('/pickups/leaderboard',async(_req,res)=>res.json((await pool.query(`SELECT user_id,username,sum(points)::integer AS points,count(*)::integer AS pickups FROM fridge.pickup_authorizations WHERE completed_at IS NOT NULL AND points>0 GROUP BY user_id,username ORDER BY points DESC,username LIMIT 50`)).rows));
}
