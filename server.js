require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');

const app = express();   // ← СНАЧАЛА создаём app
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== TELEGRAM BOT =====
const bot = new TelegramBot(process.env.BOT_TOKEN);
const WEBHOOK_PATH = `/telegram-webhook/${process.env.BOT_TOKEN}`;

app.post(WEBHOOK_PATH, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

(async () => {
  const url = `${process.env.PUBLIC_URL}${WEBHOOK_PATH}`;
  await bot.setWebHook(url);
  console.log('Webhook set to:', url);
})();

// ===== SUPABASE =====
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
););

// --- helpers ---
const xpNeed = (lvl) => Math.max(100, lvl * 100);

function asText(v){ return (v === undefined || v === null) ? null : String(v); }

async function getUser(telegram_id){
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegram_id)
    .maybeSingle();
  if(error){ console.error('getUser:', error.message); return null; }
  return data;
}

async function upsertUser(telegram_id, name){
  const payload = {
    telegram_id,
    name: name || 'User',
    last_active: new Date().toISOString(),
  };
  const { error } = await supabase.from('users').upsert(payload, { onConflict: 'telegram_id' });
  if(error){ console.error('upsertUser:', error.message); }
}

async function updateUser(telegram_id, fields){
  const { error } = await supabase
    .from('users')
    .update({ ...fields, last_active: new Date().toISOString() })
    .eq('telegram_id', telegram_id);
  if(error){ console.error('updateUser:', error.message); }
}

async function ensureUser(telegram_id, name){
  await upsertUser(telegram_id, name);
  let u = await getUser(telegram_id);
  // Initialize missing columns safely
  if(u){
    const patch = {};
    if(u.level === null || u.level === undefined) patch.level = 1;
    if(u.xp === null || u.xp === undefined) patch.xp = 0;
    if(u.streak === null || u.streak === undefined) patch.streak = 0;
    if(u.onboarded === null || u.onboarded === undefined) patch.onboarded = false;
    if(u.spheres === null || u.spheres === undefined) patch.spheres = [];
    if(Object.keys(patch).length) await updateUser(telegram_id, patch);
    u = await getUser(telegram_id);
  }
  return u;
}

// --- routes ---
app.get('/api/health', (req,res)=> res.json({ ok:true }));

app.post('/api/user', async (req,res)=>{
  try{
    const id = asText(req.body.id);
    const name = asText(req.body.name) || 'User';
    if(!id) return res.status(400).json({ error:'id required' });
    const user = await ensureUser(id, name);
    res.json(user || { ok:true });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'server error' });
  }
});

app.get('/api/user/:id', async (req,res)=>{
  try{
    const id = asText(req.params.id);
    const user = await getUser(id);
    if(!user) return res.status(404).json({ error:'Not found' });
    res.json(user);
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'server error' });
  }
});

// onboarding: sets name + spheres + onboarded=true
app.post('/api/user/:id/onboarding', async (req,res)=>{
  try{
    const id = asText(req.params.id);
    const name = asText(req.body.name) || 'User';
    const spheres = Array.isArray(req.body.spheres) ? req.body.spheres.map(String).slice(0,10) : [];
    if(!id) return res.status(400).json({ error:'id required' });
    await ensureUser(id, name);
    await updateUser(id, { name, spheres, onboarded: true });
    res.json({ ok:true });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'server error' });
  }
});

app.post('/api/user/:id/xp', async (req,res)=>{
  try{
    const id = asText(req.params.id);
    const amount = Number(req.body.amount || 0);
    if(!id) return res.status(400).json({ error:'id required' });

    const user = await ensureUser(id, 'User');
    if(!user) return res.status(404).json({ error:'Not found' });

    let xp = Number(user.xp || 0) + Math.max(0, amount);
    let level = Number(user.level || 1);

    // level up loop
    let need = xpNeed(level);
    while(xp >= need){
      xp -= need;
      level += 1;
      need = xpNeed(level);
    }

    await updateUser(id, { xp, level });
    res.json({ xp, level });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'server error' });
  }
});

// tasks (today)
app.get('/api/tasks/:id', async (req,res)=>{
  try{
    const id = asText(req.params.id);
    const date = asText(req.query.date) || new Date().toISOString().slice(0,10);
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('telegram_id', id)
      .eq('date', date)
      .order('id', { ascending: false });
    if(error) return res.status(500).json({ error:error.message });
    res.json(data || []);
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'server error' });
  }
});

app.post('/api/tasks/:id', async (req,res)=>{
  try{
    const id = asText(req.params.id);
    const name = asText(req.body.name);
    const sphere = asText(req.body.sphere) || 'life';
    const xp = Number(req.body.xp || 10);
    const date = new Date().toISOString().slice(0,10);
    if(!name) return res.status(400).json({ error:'name required' });

    await ensureUser(id, 'User');
    const { error } = await supabase
      .from('tasks')
      .insert({ telegram_id:id, name, sphere, xp, date, done: 0 });
    if(error) return res.status(500).json({ error:error.message });
    res.json({ ok:true });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'server error' });
  }
});

app.post('/api/tasks/:id/complete/:taskId', async (req,res)=>{
  try{
    const id = asText(req.params.id);
    const taskId = asText(req.params.taskId);
    const amount = Number(req.body.amount || 10);

    // mark done
    const { error } = await supabase
      .from('tasks')
      .update({ done: 1 })
      .eq('id', taskId)
      .eq('telegram_id', id);
    if(error) return res.status(500).json({ error:error.message });

    // add xp
    const user = await ensureUser(id, 'User');
    if(user){
      let xp = Number(user.xp || 0) + Math.max(0, amount);
      let level = Number(user.level || 1);
      let need = xpNeed(level);
      while(xp >= need){
        xp -= need;
        level += 1;
        need = xpNeed(level);
      }
      await updateUser(id, { xp, level });
    }

    res.json({ ok:true });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'server error' });
  }
});

// goals
app.get('/api/goals/:id', async (req,res)=>{
  try{
    const id = asText(req.params.id);
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('telegram_id', id)
      .order('id', { ascending: false });
    if(error) return res.status(500).json({ error:error.message });
    res.json(data || []);
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'server error' });
  }
});

app.post('/api/goals/:id', async (req,res)=>{
  try{
    const id = asText(req.params.id);
    const name = asText(req.body.name);
    const sphere = asText(req.body.sphere) || 'life';
    if(!name) return res.status(400).json({ error:'name required' });

    await ensureUser(id, 'User');
    const { error } = await supabase
      .from('goals')
      .insert({ telegram_id:id, sphere, name, progress: 0 });
    if(error) return res.status(500).json({ error:error.message });
    res.json({ ok:true });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'server error' });
  }
});

app.patch('/api/goals/:id/:goalId', async (req,res)=>{
  try{
    const id = asText(req.params.id);
    const goalId = asText(req.params.goalId);
    const delta = Number(req.body.delta || 0);

    const { data: goal, error: gerr } = await supabase
      .from('goals')
      .select('*')
      .eq('id', goalId)
      .eq('telegram_id', id)
      .maybeSingle();
    if(gerr) return res.status(500).json({ error:gerr.message });
    if(!goal) return res.status(404).json({ error:'Not found' });

    const progress = Math.max(0, Math.min(100, Number(goal.progress||0) + delta));

    const { error } = await supabase
      .from('goals')
      .update({ progress })
      .eq('id', goalId)
      .eq('telegram_id', id);
    if(error) return res.status(500).json({ error:error.message });

    res.json({ ok:true, progress });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'server error' });
  }
});

app.delete('/api/goals/:id/:goalId', async (req,res)=>{
  try{
    const id = asText(req.params.id);
    const goalId = asText(req.params.goalId);

    const { error } = await supabase
      .from('goals')
      .delete()
      .eq('id', goalId)
      .eq('telegram_id', id);
    if(error) return res.status(500).json({ error:error.message });

    res.json({ ok:true });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:'server error' });
  }
});

// SPA fallback
app.get('*', (req,res)=>{
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Server listening on', PORT));
