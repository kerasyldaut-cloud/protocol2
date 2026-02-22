require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const db = require('./database');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

bot.onText(/\/start/, async (msg) => {
  const id = String(msg.from.id);
  const name = msg.from.first_name || 'Игрок';
  await db.createUser(id, name);
  bot.sendMessage(msg.chat.id, `👋 Привет, ${name}!\n\nДобро пожаловать в *Protocol 2.0* 🚀`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '🚀 Открыть Protocol 2.0', web_app: { url: process.env.WEBAPP_URL } }]] }
  });
});

bot.onText(/\/stats/, async (msg) => {
  const id = String(msg.from.id);
  const user = await db.getUser(id);
  if (!user) { bot.sendMessage(msg.chat.id, 'Сначала запусти /start'); return; }
  bot.sendMessage(msg.chat.id, `📊 *Твоя статистика*\n\n👤 ${user.name}\n⭐ Уровень: ${user.level}\n✨ XP: ${user.xp}\n🔥 Стрик: ${user.streak} дней`, { parse_mode: 'Markdown' });
});

bot.onText(/\/top/, async (msg) => {
  const leaders = await db.getLeaderboard();
  const medals = ['🥇','🥈','🥉'];
  let text = '🏆 *Топ игроков*\n\n';
  leaders.forEach((u, i) => { text += `${medals[i] || `${i+1}.`} ${u.name} — ${u.xp} XP\n`; });
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

app.get('/api/user/:id', async (req, res) => {
  const user = await db.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(user);
});

app.post('/api/user/:id/xp', async (req, res) => {
  const { amount } = req.body;
  const user = await db.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  let newXp = user.xp + amount;
  let newLevel = user.level;
  if (newXp >= newLevel * 100) { newXp -= newLevel * 100; newLevel++; }
  await db.updateUser(req.params.id, { xp: newXp, level: newLevel });
  res.json({ xp: newXp, level: newLevel });
});

app.get('/api/tasks/:id', async (req, res) => {
  const tasks = await db.getTodayTasks(req.params.id);
  res.json(tasks);
});

app.post('/api/tasks/:id', async (req, res) => {
  const { name, sphere, xp } = req.body;
  await db.addTask(req.params.id, name, sphere, xp || 10);
  res.json({ ok: true });
});

app.post('/api/tasks/:id/complete/:taskId', async (req, res) => {
  await db.completeTask(req.params.taskId, req.params.id);
  const { amount } = req.body;
  const user = await db.getUser(req.params.id);
  if (user) {
    let newXp = user.xp + (amount || 10);
    let newLevel = user.level;
    if (newXp >= newLevel * 100) { newXp -= newLevel * 100; newLevel++; }
    await db.updateUser(req.params.id, { xp: newXp, level: newLevel });
  }
  res.json({ ok: true });
});

app.get('/api/goals/:id', async (req, res) => {
  const goals = await db.getGoals(req.params.id);
  res.json(goals);
});

app.post('/api/goals/:id', async (req, res) => {
  const { sphere, name } = req.body;
  await db.addGoal(req.params.id, sphere, name);
  res.json({ ok: true });
});

app.get('/api/leaderboard', async (req, res) => {
  const data = await db.getLeaderboard();
  res.json(data);
});

cron.schedule('0 8 * * *', async () => {
  const users = await db.getLeaderboard();
  users.forEach(u => {
    if (u.notif_morning) bot.sendMessage(u.telegram_id, `🌅 *Доброе утро, ${u.name}!*\n\nВремя прокачиваться! 💪`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🚀 Открыть', web_app: { url: process.env.WEBAPP_URL } }]] } });
  });
});

cron.schedule('0 21 * * *', async () => {
  const users = await db.getLeaderboard();
  users.forEach(u => {
    if (u.notif_evening) bot.sendMessage(u.telegram_id, `🌙 *Вечерняя проверка*\n\nПодведи итоги и не сломай стрик! 🔥`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '📊 Итоги', web_app: { url: process.env.WEBAPP_URL } }]] } });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));