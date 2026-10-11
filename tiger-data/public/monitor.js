const $=id=>document.getElementById(id);
let busy=false;
const format=n=>n.toLocaleString(undefined,{maximumFractionDigits:2});
function svgNode(tag,attributes,text){const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);if(text!==undefined)node.textContent=text;return node;}
function chart(m){
  const svg=$('chart');svg.replaceChildren();
  if(!m.segments.length){$('chart-note').textContent='No covered intervals yet. Collection may be paused; no temperature history is invented.';return;}
  const temps=m.segments.flatMap(s=>[s.temperature_start_c,s.temperature_end_c]);
  const low=Math.min(m.threshold_c,...temps)-1,high=Math.max(m.threshold_c,...temps)+1;
  const start=Date.parse(m.window_start),end=Date.parse(m.window_end);
  const x=t=>55+800*(Date.parse(t)-start)/(end-start),y=t=>220-190*(t-low)/(high-low);
  svg.append(svgNode('line',{x1:55,x2:855,y1:y(m.threshold_c),y2:y(m.threshold_c),stroke:'#a66538','stroke-dasharray':'5 5'}));
  svg.append(svgNode('text',{x:60,y:y(m.threshold_c)-8,fill:'#865128','font-size':13},`Threshold ${m.threshold_c} °C`));
  for(const s of m.segments)svg.append(svgNode('line',{x1:x(s.start),y1:y(s.temperature_start_c),x2:x(s.end),y2:y(s.temperature_end_c),stroke:'#246847','stroke-width':2}));
  for(const t of [low,high])svg.append(svgNode('text',{x:0,y:y(t),fill:'#506356','font-size':13},`${format(t)} °C`));
  svg.append(svgNode('text',{x:55,y:248,fill:'#506356','font-size':13},new Date(start).toLocaleTimeString()));
  svg.append(svgNode('text',{x:855,y:248,'text-anchor':'end',fill:'#506356','font-size':13},new Date(end).toLocaleTimeString()));
  $('chart-note').textContent='Green segments are covered intervals. Blank stretches are unknown; they are not bridged.';
}
async function refresh(){
  if(busy)return;busy=true;
  try{
    const end=new Date(),start=new Date(+end-Number($('window').value)*60000);
    const q=new URLSearchParams({start:start.toISOString(),end:end.toISOString(),threshold_c:$('threshold').value});
    const response=await fetch(`/fridges/${encodeURIComponent($('fridge').value)}/thermal?${q}`,{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)throw new Error(response.status===401?'Refresh this page to reconnect.':`Metrics request failed (${response.status}); check the API/database connection.`);
    const m=await response.json();$('error').textContent='';
    $('exposure').textContent=m.covered_minutes?format(m.observed_exposure_c_minutes):'Unknown';
    $('above').textContent=m.covered_minutes?format(m.observed_minutes_above_threshold):'Unknown';
    $('coverage').textContent=`${format(m.coverage_fraction*100)}%`;$('coverage-meter').value=m.coverage_fraction;
    $('unknown').textContent=`${format(m.unmonitored_minutes)} minutes unmonitored`;$('gap').textContent=format(m.longest_missing_interval_minutes);
    $('status').textContent=m.sensor_status==='reporting'?'Sensor is reporting.':m.sensor_status==='stale'?'Sensor is stale: readings have stopped arriving.':m.sensor_status==='invalid_latest'?'Latest temperature is invalid; monitoring is interrupted.':'No sensor data. Collection may be paused.';
    $('average').textContent=`Time-weighted mean over covered intervals: ${m.time_weighted_temperature_c===null?'unknown':format(m.time_weighted_temperature_c)+' °C'}. Valid samples: ${m.valid_sample_count}; invalid samples: ${m.invalid_sample_count}.`;
    $('updated').textContent=`Updated ${new Date().toLocaleTimeString()} · ${m.device_id} · last valid sample: ${m.last_valid_reading_at?new Date(m.last_valid_reading_at).toLocaleString():'none'}`;
    chart(m);
  }catch(error){$('error').textContent=error.message;if(!$('dashboard').hidden)$('status').textContent='Refresh failed. Displayed values are from the last successful update.';}
  finally{busy=false;}
}
$('refresh').addEventListener('click',refresh);
for(const id of ['window','threshold','fridge'])$(id).addEventListener('change',refresh);
void refresh();
setInterval(refresh,10000);
