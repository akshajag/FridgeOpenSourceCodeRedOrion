import express from 'express';
import {timingSafeEqual,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {makePool} from './db.js';
const pool=makePool(), app=express();
if(!process.env.DATA_API_TOKEN)throw new Error('DATA_API_TOKEN required');
app.disable('x-powered-by');app.use(express.json({limit:'256kb'}));
app.get('/health',async(_req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true,database:'connected'});}catch{res.status(503).json({ok:false,database:'unavailable'});}});
app.use((req,res,next)=>{
  const supplied=Buffer.from(req.get('authorization')||''),expected=Buffer.from(`Bearer ${process.env.DATA_API_TOKEN}`);
  if(supplied.length!==expected.length || !timingSafeEqual(supplied,expected))return res.status(401).json({error:'unauthorized'});
  next();
});
const uuid=z.string().uuid(), timestamp=z.string().datetime({offset:true});
const fridge=z.string().min(1).max(100), json=z.record(z.string(),z.unknown());
const url=z.string().url().refine(s=>s.startsWith('https://'),'Use HTTPS').nullable().optional();
const product=z.object({id:uuid.optional(),canonical_name:z.string().min(1).max(200),barcode:z.string().regex(/^\d{8,14}$/).nullable().optional(),brand:z.string().max(200).nullable().optional(),variant:z.string().max(200).nullable().optional(),package_size:z.string().max(100).nullable().optional(),display_image_url:url,image_source_url:url,match_method:z.enum(['barcode','visual','manual','generic']),metadata:json.default({})});
app.post('/products',async(req,res)=>{
  const p=product.parse(req.body);
  const result=await pool.query(`INSERT INTO fridge.products(id,canonical_name,barcode,brand,variant,package_size,display_image_url,image_source_url,match_method,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(barcode) DO UPDATE SET canonical_name=EXCLUDED.canonical_name,brand=EXCLUDED.brand,variant=EXCLUDED.variant,package_size=EXCLUDED.package_size,display_image_url=COALESCE(EXCLUDED.display_image_url,fridge.products.display_image_url),image_source_url=COALESCE(EXCLUDED.image_source_url,fridge.products.image_source_url),match_method=EXCLUDED.match_method,metadata=EXCLUDED.metadata RETURNING *`,[p.id||randomUUID(),p.canonical_name,p.barcode||null,p.brand,p.variant,p.package_size,p.display_image_url,p.image_source_url,p.match_method,p.metadata]);
  res.status(201).json(result.rows[0]);
});
app.post('/donations/propose',async(req,res)=>{
  const p=z.object({id:uuid,fridge_id:fridge,product_id:uuid,quantity:z.number().int().min(1).max(10000),identification_method:z.enum(['gemini','barcode','manual']),certainty:z.enum(['high','medium','low','unknown']),observation_image_url:url,details:json.default({})}).parse(req.body);
  const result=await pool.query(`INSERT INTO fridge.donation_proposals(id,fridge_id,product_id,quantity,identification_method,certainty,observation_image_url,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING RETURNING *`,[p.id,p.fridge_id,p.product_id,p.quantity,p.identification_method,p.certainty,p.observation_image_url,p.details]);
  res.status(result.rowCount?201:200).json(result.rows[0]||(await pool.query('SELECT * FROM fridge.donation_proposals WHERE id=$1',[p.id])).rows[0]);
});
app.post('/donations/confirm',async(req,res)=>{
  const {proposal_id}=z.object({proposal_id:uuid}).parse(req.body),client=await pool.connect();
  try{
    await client.query('BEGIN');
    const p=(await client.query('SELECT * FROM fridge.donation_proposals WHERE id=$1 FOR UPDATE',[proposal_id])).rows[0];
    if(!p || p.status==='cancelled'){await client.query('ROLLBACK');return res.status(409).json({error:'proposal_unavailable'});}
    await client.query(`INSERT INTO fridge.inventory_events(id,fridge_id,product_id,proposal_id,kind,quantity_delta,verification) VALUES($1,$2,$3,$4,'donation',$5,'donor_confirmed') ON CONFLICT(proposal_id) DO NOTHING`,[randomUUID(),p.fridge_id,p.product_id,p.id,p.quantity]);
    await client.query("UPDATE fridge.donation_proposals SET status='donor_confirmed',confirmed_at=COALESCE(confirmed_at,now()) WHERE id=$1",[p.id]);
    await client.query('COMMIT');res.json({proposal_id,status:'donor_confirmed',camera_verified:false});
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
});
app.post('/inventory/audits',async(req,res)=>{
  const a=z.object({id:uuid,fridge_id:fridge,captured_at:timestamp,image_quality:z.enum(['usable','limited','unusable']),model:z.string().min(1).max(100),result:json,comparison:json.default({}),observation_image_url:url}).parse(req.body);
  const result=await pool.query(`INSERT INTO fridge.camera_audits(id,fridge_id,captured_at,image_quality,model,result,comparison,observation_image_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING RETURNING id`,[a.id,a.fridge_id,a.captured_at,a.image_quality,a.model,a.result,a.comparison,a.observation_image_url]);
  res.status(result.rowCount?201:200).json({id:a.id,stored:true,requires_review:true,inventory_changed:false});
});
app.get('/fridges/:id/inventory',async(req,res)=>res.json((await pool.query('SELECT * FROM fridge.inventory_balances WHERE fridge_id=$1 ORDER BY canonical_name',[fridge.parse(req.params.id)])).rows));
app.get('/fridges/:id/audits',async(req,res)=>res.json((await pool.query('SELECT * FROM fridge.camera_audits WHERE fridge_id=$1 ORDER BY captured_at DESC LIMIT 100',[fridge.parse(req.params.id)])).rows));
app.get('/fridges/:id/sensors',async(req,res)=>res.json((await pool.query('SELECT * FROM fridge.sensor_readings WHERE fridge_id=$1 ORDER BY captured_at DESC LIMIT 100',[fridge.parse(req.params.id)])).rows));
app.use((error,_req,res,_next)=>{if(error instanceof z.ZodError)return res.status(400).json({error:'invalid_input',fields:error.issues.map(i=>i.path.join('.'))});if(error.type==='entity.too.large')return res.status(413).json({error:'payload_too_large'});res.status(500).json({error:'data_operation_failed'});});
const server=app.listen(Number(process.env.DATA_PORT||3200),'127.0.0.1',()=>console.log('Fridge data API: http://127.0.0.1:'+(process.env.DATA_PORT||3200)));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await pool.end();process.exit(0);}));
