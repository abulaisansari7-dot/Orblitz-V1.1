const socket = io();
const $ = id => document.getElementById(id);
const screens = ['home','lobby','game','results'];
let state=null,myId=null,keys={},animationFrame=null,lastSecond=-1,touchStart=null,lastMyScore=0,audioCtx=null,lastBoard='',lastFrameAt=0;
const visualPlayers=new Map();
let lastSnapshotAt=performance.now();
const SNAPSHOT_EXTRAPOLATION=.075, SMOOTH_RATE=10.6; // SMOOTH_RATE: how fast drawn players catch up per second (the old feel at 60 fps)
function show(id){screens.forEach(s=>$(s).classList.toggle('hidden',s!==id));$('roomBadge').classList.toggle('hidden',!state?.code||id==='home');if(id==='game'){resize();startRenderLoop()}else stopRenderLoop()}
function msg(t){$('error').textContent=t;clearTimeout(msg.timer);msg.timer=setTimeout(()=>$('error').textContent='',3500)}
function toast(t){$('toast').textContent=t;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),1700)}
function playerName(){return $('name').value.trim()||'Player'}
function escape(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function unlockAudio(){try{if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume()}catch{} }
function sfx(type){unlockAudio();if(!audioCtx)return;const now=audioCtx.currentTime,o=audioCtx.createOscillator(),g=audioCtx.createGain();o.connect(g);g.connect(audioCtx.destination);const f=type==='grab'?520:type==='gold'?760:type==='danger'?120:type==='power'?420:type==='start'?240:380;o.frequency.setValueAtTime(f,now);o.frequency.exponentialRampToValueAtTime(type==='danger'?f*.55:f*1.7,now+.12);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(type==='gold'||type==='power'?.12:.07,now+.01);g.gain.exponentialRampToValueAtTime(.0001,now+.16);o.start(now);o.stop(now+.18)}
$('howTo').onclick=()=>{unlockAudio();$('howModal').classList.remove('hidden')};$('closeHow').onclick=$('closeHow2').onclick=()=>$('howModal').classList.add('hidden');$('howModal').onclick=e=>{if(e.target===$('howModal'))$('howModal').classList.add('hidden')};
const openRules=()=>{unlockAudio();$('rulesModal').classList.remove('hidden')}; const closeRules=()=>$('rulesModal').classList.add('hidden');
$('rulesBtn').onclick=openRules; $('rulesLobby').onclick=openRules; $('rulesGame').onclick=openRules; $('rulesResults').onclick=openRules; $('closeRules').onclick=closeRules; $('closeRules2').onclick=closeRules; $('rulesModal').onclick=e=>{if(e.target===$('rulesModal'))closeRules()};
$('create').onclick=()=>{unlockAudio();socket.emit('createRoom',{name:playerName()})};$('join').onclick=()=>{unlockAudio();socket.emit('joinRoom',{name:playerName(),code:$('joinCode').value.trim().toUpperCase()})};
$('joinCode').oninput=e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);$('joinCode').onkeydown=e=>{if(e.key==='Enter')$('join').click()};$('name').onkeydown=e=>{if(e.key==='Enter')$('create').click()};
$('start').onclick=()=>{unlockAudio();sfx('start');socket.emit('startGame')};$('again').onclick=()=>{unlockAudio();sfx('start');socket.emit('playAgain')};$('homeBtn').onclick=()=>location.reload();$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(state.code);toast('Room code copied')}catch{toast('Code: '+state.code)}};
socket.on('connect_error',()=>msg('Could not connect to the game server. Refresh and try again.'));socket.on('errorMessage',msg);
socket.on('joined',d=>{myId=d.id;$('roomCode').textContent=d.code;$('lobbyCode').textContent=d.code;$('shareCode').textContent=d.code});socket.on('roomCreated',d=>{navigator.clipboard?.writeText(d.code).catch(()=>{});toast('Room created — code copied')});
socket.on('state',s=>{
 const oldPhase=state?.phase,mine=s.players.find(p=>p.id===myId),newScore=mine?.score||0;
 if(s.phase==='playing'&&oldPhase!=='playing'){lastMyScore=newScore;sfx('start');toast('GRAB • DODGE • DOMINATE')}
 if(s.phase==='playing'&&newScore>lastMyScore){sfx(newScore-lastMyScore>=3?'gold':'grab');if(mine)renderer.burst(mine.x,mine.y,mine.hue)}
 const now=performance.now(),snapshotDt=Math.max(.016,Math.min(.15,(now-lastSnapshotAt)/1000));lastSnapshotAt=now;
 for(const p of s.players){const v=visualPlayers.get(p.id);if(v){v.vx=(p.x-v.targetX)/snapshotDt;v.vy=(p.y-v.targetY)/snapshotDt;v.targetX=p.x;v.targetY=p.y;v.hue=p.hue;v.name=p.name}else visualPlayers.set(p.id,{x:p.x,y:p.y,targetX:p.x,targetY:p.y,vx:0,vy:0,hue:p.hue,name:p.name,trail:[]})}
 for(const id of [...visualPlayers.keys()])if(!s.players.some(p=>p.id===id))visualPlayers.delete(id);
 lastMyScore=newScore;state=s;$('roomCode').textContent=s.code;$('lobbyCode').textContent=s.code;$('shareCode').textContent=s.code;
 if(s.phase==='lobby'){show('lobby');renderLobby()}else if(s.phase==='playing'){show('game');renderGame()}else{show('results');renderResults()}
});
function renderLobby(){const isHost=state.hostId===myId;$('players').innerHTML=state.players.map(p=>`<div class="player"><span><i class="dot" style="background:hsl(${p.hue} 90% 65%)"></i>${escape(p.name)}${p.id===myId?' <em>(you)</em>':''}${p.id===state.hostId?' <small>HOST</small>':''}</span><span>${Math.floor(p.score)}</span></div>`).join('');$('start').disabled=!isHost||state.players.length<2;$('start').textContent=isHost?(state.players.length<2?'Waiting for a player…':'Start game'):'Host starts the game';$('lobbyHint').textContent=isHost?(state.players.length<2?'Need at least 2 players':'Everyone is ready? Start the round.'):'Waiting for the host to start…'}
function effectNames(p){const now=Date.now(),a=[];for(const [k,v] of Object.entries(p.effects||{})){if(v>now&&k!=='multiplier')a.push(k.toUpperCase())}if(p.effects?.multiplier>Date.now())a.push('2X');return a}
function renderGame(){const sec=Math.ceil(state.remaining/1000);if(sec!==lastSecond){$('timer').textContent=sec;lastSecond=sec}const ps=[...state.players].sort((a,b)=>b.score-a.score),board=ps.map(p=>`<div class="score ${p.id===state.bountyId?'bountyScore':''}"><span style="color:hsl(${p.hue} 90% 70%)">${escape(p.name)}${p.id===myId?' ★':''}${p.id===state.bountyId?' ◆':''}</span><b>${Math.floor(p.score)}</b>${p.combo>1?`<small>×${Math.min(4,1+Math.floor(p.combo/3))}</small>`:''}</div>`).join('');if(board!==lastBoard){$('scoreboard').innerHTML=board;lastBoard=board}const me=state.players.find(p=>p.id===myId);$('status').textContent=me?(me.combo>=3?`COMBO ×${Math.min(4,1+Math.floor(me.combo/3))}`:(effectNames(me).join(' • ')||'GRAB ENERGY')):'GRAB ENERGY'}
function renderResults(){const w=state.winner;$('winner').textContent=w?`${escape(w.name)} wins with ${Math.floor(w.score)}!`:'Round complete';const ps=[...state.players].sort((a,b)=>b.score-a.score);$('finalScores').innerHTML=ps.map((p,i)=>`<div class="final"><span>${i+1}. ${escape(p.name)}${p.id===myId?' (you)':''}</span><b>${Math.floor(p.score)}</b></div>`).join('');const isHost=state.hostId===myId;$('again').disabled=!isHost;$('again').textContent=isHost?'Play again':'Waiting for host…'}
const canvas=$('canvas'),renderer=OrbRenderer.create(canvas);
function resize(){renderer.resize(canvas.clientWidth,canvas.clientHeight,GFX.current().pixelRatio)}
addEventListener('resize',resize);if(window.ResizeObserver)new ResizeObserver(resize).observe(canvas);
GFX.onChange(g=>{renderer.setQuality(g);resize()});
function startRenderLoop(){if(animationFrame==null){lastFrameAt=0;animationFrame=requestAnimationFrame(renderLoop)}}function stopRenderLoop(){if(animationFrame!=null)cancelAnimationFrame(animationFrame);animationFrame=null}
function renderLoop(t){animationFrame=null;if(!state||state.phase!=='playing')return;animationFrame=requestAnimationFrame(renderLoop);if(!GFX.frame(t))return;const dt=lastFrameAt?Math.min(.1,(t-lastFrameAt)/1000):1/60;lastFrameAt=t;smoothPlayers(dt);const t0=performance.now();renderer.draw(state,visualPlayers,myId,t,dt);GFX.work(performance.now()-t0)}
// Ease drawn players toward the latest snapshot (plus a little extrapolation) at the same speed at any frame rate
function smoothPlayers(dt){const k=1-Math.exp(-SMOOTH_RATE*dt);for(const v of visualPlayers.values()){const lx=Math.max(-42,Math.min(42,v.vx*SNAPSHOT_EXTRAPOLATION)),ly=Math.max(-42,Math.min(42,v.vy*SNAPSHOT_EXTRAPOLATION));v.x+=(v.targetX+lx-v.x)*k;v.y+=(v.targetY+ly-v.y)*k}}
function send(){let x=0,y=0;if(keys.ArrowLeft||keys.a)x--;if(keys.ArrowRight||keys.d)x++;if(keys.ArrowUp||keys.w)y--;if(keys.ArrowDown||keys.s)y++;socket.emit('input',{x,y})}
addEventListener('keydown',e=>{if(!/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();keys[e.key]=true;send()});addEventListener('keyup',e=>{keys[e.key]=false;send()});setInterval(()=>{if(state?.phase==='playing')send()},50);
canvas.addEventListener('touchstart',e=>{const t=e.touches[0];touchStart={x:t.clientX,y:t.clientY}},{passive:true});canvas.addEventListener('touchmove',e=>{if(!touchStart)return;const t=e.touches[0],dx=t.clientX-touchStart.x,dy=t.clientY-touchStart.y,l=Math.hypot(dx,dy)||1;socket.emit('input',{x:dx/l,y:dy/l})},{passive:true});canvas.addEventListener('touchend',()=>{touchStart=null;socket.emit('input',{x:0,y:0})});
show('home');
