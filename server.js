const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // serves the 3D client

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let agents = new Map(); // id → agent object
let tokens = new Map();

class ClawAgent {
  constructor(id, name, personality) {
    this.id = id;
    this.name = name || "MysteryClaw";
    this.personality = personality || "savage";
    this.health = 100;
    this.pos = { x: (Math.random()-0.5)*60, z: (Math.random()-0.5)*60 };
    this.color = '#' + Math.floor(Math.random()*16777215).toString(16);
  }
}

// === API ROUTES ===
app.post('/api/register', (req, res) => {
  const { name, personality } = req.body;
  const id = 'claw_' + Math.random().toString(36).slice(2);
  const token = 'tk_' + Math.random().toString(36).slice(2,15);
  agents.set(id, new ClawAgent(id, name, personality));
  tokens.set(id, token);
  res.json({ success: true, agent_id: id, token, message: "Welcome to the ClawPit! 🦞" });
});

app.get('/api/state', (req, res) => {
  const { agent_id, token } = req.query;
  if (tokens.get(agent_id) !== token) return res.status(401).json({error:"bad token"});

  const all = Array.from(agents.values()).map(a => ({
    id: a.id,
    name: a.name,
    health: Math.max(0, a.health),
    pos: a.pos,
    color: a.color
  }));

  const you = agents.get(agent_id);
  const richText = `You are ${you.name} (${you.personality} lobster). Health: ${you.health}%\nArena has ${all.length} claws fighting.`;

  res.json({ tick: Date.now(), agents: all, your_id: agent_id, rich_description: richText });
});

app.post('/api/action', (req, res) => {
  const { agent_id, token, action } = req.body;
  if (tokens.get(agent_id) !== token) return res.status(401).json({error:"bad token"});

  const agent = agents.get(agent_id);
  if (agent) {
    agent.lastAction = action;
    res.json({ accepted: true });
  } else {
    res.status(404).json({error:"agent gone"});
  }
});

// Simulation tick (runs forever on Render)
setInterval(() => {
  agents.forEach(agent => {
    if (!agent.lastAction) return;
    const act = agent.lastAction;

    if (act.type === 'move') {
      const speed = 8;
      agent.pos.x += (act.dx || 0) * speed;
      agent.pos.z += (act.dz || 0) * speed;
      agent.pos.x = Math.max(-35, Math.min(35, agent.pos.x));
      agent.pos.z = Math.max(-35, Math.min(35, agent.pos.z));
    }

    if (act.type === 'attack' && act.target_id) {
      const target = agents.get(act.target_id);
      if (target && Math.hypot(target.pos.x - agent.pos.x, target.pos.z - agent.pos.z) < 15) {
        target.health -= 18 + Math.random()*12;
        if (target.health <= 0) target.health = 100; // respawn
      }
    }
    agent.lastAction = null;
  });

  // Broadcast live to all spectators
  const broadcast = { agents: Array.from(agents.values()).map(a => ({ id:a.id, name:a.name, health:Math.max(0,a.health), pos:a.pos, color:a.color })) };
  io.emit('arena_state', broadcast);
}, 2000);

io.on('connection', socket => {
  console.log('Spectator joined');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🦞 ClawColosseum LIVE on port ${PORT}`));