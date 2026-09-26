const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.ALLOWED_ORIGIN || '*' }, transports: ['polling', 'websocket'] });
app.use(express.static(path.join(__dirname, 'public')));
const rooms = new Map();
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', players: [...rooms.values()].reduce((n, r) => n + r.players.size, 0) }));

const PORT = Number(process.env.PORT) || 3000;
const WIDTH = 1600, HEIGHT = 900, MAX_PLAYERS = 8, ROUND_SECONDS = 60;
const PLAYER_R = 18, BASE_SPEED = 330, ORB_COUNT = 34;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const code = () => { const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<4;i++) s += chars[Math.floor(Math.random()*chars.length)]; return s; };
function newRoom(){ let c; do c=code(); while(rooms.has(c)); return { code:c,hostId:null,phase:'lobby',players:new Map(),orbs:[],powerups:[],startedAt:0,endsAt:0,round:0,winner:null,nextPowerupAt:0,bountyId:null,center:{x:WIDTH/2,y:HEIGHT/2} }; }
function spawnOrb(now=Date.now(), near=null){
  const roll=Math.random(); let kind='energy', value=1, ttl=0;
  if(roll<0.07){ kind='volatile'; value=5; ttl=now+7000; }
  else if(roll<0.14){ kind='multiplier'; value=2; ttl=now+8000; }
  else if(roll<0.28){ kind='rare'; value=3; }
  else if(roll<0.33){ kind='void'; value=-2; }
  const x=near?clamp(near.x+rand(-130,130),70,WIDTH-70):rand(70,WIDTH-70);
  const y=near?clamp(near.y+rand(-130,130),145,HEIGHT-70):rand(145,HEIGHT-70);
  return {id:Math.random().toString(36).slice(2),x,y,kind,value,pulse:Math.random()*Math.PI*2,expiresAt:ttl};
}
function spawnPowerup(){ const types=['dash','shield','magnet','overdrive','phase']; const type=types[Math.floor(Math.random()*types.length)]; return {id:Math.random().toString(36).slice(2),x:rand(100,WIDTH-100),y:rand(170,HEIGHT-100),type,pulse:Math.random()*Math.PI*2,expiresAt:Date.now()+12000}; }
function resetRound(room){
  room.phase='playing'; room.round++; room.winner=null; room.startedAt=Date.now(); room.endsAt=room.startedAt+ROUND_SECONDS*1000;
  room.orbs=Array.from({length:ORB_COUNT},()=>spawnOrb(room.startedAt)); room.powerups=[]; room.nextPowerupAt=room.startedAt+6000; room.bountyId=null;
  for(const p of room.players.values()){ p.x=rand(120,WIDTH-120);p.y=rand(180,HEIGHT-100);p.score=0;p.input={x:0,y:0};p.combo=0;p.comboExpiresAt=0;p.effects={dash:0,shield:0,magnet:0,overdrive:0,phase:0,multiplier:0};p.hitCooldown=0;p.bountyTaken=0; }
}
function sanitizeName(s){ return String(s||'Player').trim().replace(/[^\w .-]/g,'').slice(0,16)||'Player'; }
function updateBounty(room){ const list=[...room.players.values()].sort((a,b)=>b.score-a.score); room.bountyId=list[0]?.id||null; }
function publicState(room){
  const now=Date.now();
  return { code:room.code,hostId:room.hostId,phase:room.phase,round:room.round,remaining:room.phase==='playing'?Math.max(0,room.endsAt-now):0,
    bountyId:room.bountyId,
    players:[...room.players.values()].map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,score:p.score,hue:p.hue,combo:p.combo,effects:p.effects})),
    orbs:room.orbs.map(o=>({id:o.id,x:o.x,y:o.y,kind:o.kind,value:o.value,pulse:o.pulse,expiresAt:o.expiresAt})),
    powerups:room.powerups.map(p=>({id:p.id,x:p.x,y:p.y,type:p.type,pulse:p.pulse,expiresAt:p.expiresAt})),
    winner:room.winner };
}
function emitState(room){ io.to(room.code).emit('state',publicState(room)); }
function finish(room){ if(room.phase!=='playing')return; room.phase='results'; updateBounty(room); const list=[...room.players.values()].sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)); room.winner=list[0]?{id:list[0].id,name:list[0].name,score:list[0].score}:null; for(const p of room.players.values())p.input={x:0,y:0}; emitState(room); }
function join(socket,room,name){ const hues=[190,275,335,45,125,220,15,160]; const p={id:socket.id,name:sanitizeName(name),x:rand(120,WIDTH-120),y:rand(180,HEIGHT-100),score:0,hue:hues[room.players.size%hues.length],input:{x:0,y:0},combo:0,comboExpiresAt:0,effects:{dash:0,shield:0,magnet:0,overdrive:0,phase:0},hitCooldown:0,bountyTaken:0}; room.players.set(socket.id,p); if(!room.hostId)room.hostId=socket.id; socket.join(room.code);socket.roomCode=room.code;socket.emit('joined',{code:room.code,id:socket.id});emitState(room); }

io.on('connection',socket=>{
 socket.on('createRoom',({name}={})=>{const room=newRoom();rooms.set(room.code,room);join(socket,room,name);socket.emit('roomCreated',{code:room.code});});
 socket.on('joinRoom',({code:raw,name}={})=>{const room=rooms.get(String(raw||'').toUpperCase());if(!room)return socket.emit('errorMessage','Room not found. Check the code.');if(room.players.size>=MAX_PLAYERS)return socket.emit('errorMessage','Room is full (8 players max).');if(room.phase!=='lobby')return socket.emit('errorMessage','That round has already started.');join(socket,room,name);});
 socket.on('startGame',()=>{const room=socket.roomCode&&rooms.get(socket.roomCode);if(!room||room.hostId!==socket.id||room.phase!=='lobby')return;if(room.players.size<2)return socket.emit('errorMessage','Invite at least one more player to start.');resetRound(room);emitState(room);});
 socket.on('playAgain',()=>{const room=socket.roomCode&&rooms.get(socket.roomCode);if(!room||room.hostId!==socket.id||room.phase!=='results')return;resetRound(room);emitState(room);});
 socket.on('input',({x=0,y=0}={})=>{const room=socket.roomCode&&rooms.get(socket.roomCode),p=room?.players.get(socket.id);if(!p||room.phase!=='playing')return;const nx=Number(x)||0,ny=Number(y)||0,len=Math.hypot(nx,ny);p.input=len>0?{x:nx/len,y:ny/len}:{x:0,y:0};});
 socket.on('disconnect',()=>{const room=socket.roomCode&&rooms.get(socket.roomCode);if(!room)return;room.players.delete(socket.id);if(room.hostId===socket.id)room.hostId=room.players.keys().next().value||null;if(!room.players.size)rooms.delete(room.code);else{updateBounty(room);emitState(room);}});
});

let last=Date.now();
setInterval(()=>{
 const now=Date.now(),dt=Math.min(.05,(now-last)/1000);last=now;
 for(const room of rooms.values()){
  if(room.phase!=='playing')continue;
  if(now>=room.endsAt){finish(room);continue;}
  if(now>=room.nextPowerupAt&&room.powerups.length<3){room.powerups.push(spawnPowerup());room.nextPowerupAt=now+rand(7000,10000);}
  room.orbs=room.orbs.filter(o=>!o.expiresAt||o.expiresAt>now); while(room.orbs.length<ORB_COUNT)room.orbs.push(spawnOrb(now));
  room.powerups=room.powerups.filter(p=>p.expiresAt>now);
  for(const p of room.players.values()){
   const speed=BASE_SPEED*(p.effects.overdrive>now?1.55:1)*(p.effects.dash>now?1.9:1)*(p.effects.phase>now?1.2:1)*(p.hitCooldown>now?.48:1);
   p.x=clamp(p.x+p.input.x*speed*dt,PLAYER_R+10,WIDTH-PLAYER_R-10);p.y=clamp(p.y+p.input.y*speed*dt,125,HEIGHT-PLAYER_R-10);
   if(p.comboExpiresAt&&p.comboExpiresAt<now)p.combo=0;
   for(let i=room.orbs.length-1;i>=0;i--){const o=room.orbs[i];let reach=PLAYER_R+16;if(p.effects.magnet>now)reach+=85;if(Math.hypot(p.x-o.x,p.y-o.y)>=reach)continue;
    if(o.kind==='void'){p.score=Math.max(0,p.score-2);p.combo=0;} else {if(p.comboExpiresAt>now)p.combo++;else p.combo=1;p.comboExpiresAt=now+2500;const mult=p.effects.multiplier>now?2:1;const comboMult=Math.min(4,1+Math.floor(p.combo/3));p.score+=o.value*mult*comboMult;if(o.kind==='multiplier')p.effects.multiplier=now+5000;if(o.kind==='volatile')p.score+=2;}
    room.orbs.splice(i,1);room.orbs.push(spawnOrb(now));break;
   }
   for(let i=room.powerups.length-1;i>=0;i--){const pu=room.powerups[i];if(Math.hypot(p.x-pu.x,p.y-pu.y)>PLAYER_R+20)continue;p.effects[pu.type]=now+5000;room.powerups.splice(i,1);break;}
  }
  updateBounty(room);
  const leader=room.players.get(room.bountyId); if(leader&&room.orbs.filter(o=>o.kind==='bounty').length<1&&Math.random()<dt*.22){const special=spawnOrb(now,leader);special.kind='bounty';special.value=5;special.expiresAt=now+5000;room.orbs.push(special);}
 }
},1000/30);
setInterval(()=>{for(const room of rooms.values())if(room.phase!=='lobby')emitState(room);},1000/15);
server.listen(PORT,'0.0.0.0',()=>console.log(`OrBlitz running on port ${PORT}`));
