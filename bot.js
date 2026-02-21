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
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/protocol2.html');
});

// ── КОМАНДЫ БОТА ──
bot.onText(/\/start/, (msg) => {
  const id = String(msg.from.id);
  const name = msg.from.first_name || 'Игрок';
  db.createUser(id, name);

  bot.sendMessage(msg.chat.id, `👋 Привет, ${name}!\n\nДобро пожаловать в *Protocol 2.0* 🚀\n\nНажми кнопку ниже чтобы открыть приложение:`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{
        text: '🚀 Открыть Protocol 2.0',
        web_app: { url: process.env.WEBAPP_URL }
      }]]
    }
  });
});

bot.onText(/\/stats/, (msg) => {
  const id = String(msg.from.id);
  const user = db.getUser(id);
  if (!user) { bot.sendMessage(msg.chat.id, 'Сначала запусти /start'); return; }
  bot.sendMessage(msg.chat.id,
    `📊 *Твоя статистика*\n\n` +
    `👤 Имя: ${user.name}\n` +
    `⭐ Уровень: ${user.level}\n` +
    `✨ XP: ${user.xp}\n` +
    `🔥 Стрик: ${user.streak} дней`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/top/, (msg) => {
  const leaders = db.getLeaderboard();
  const medals = ['🥇','🥈','🥉'];
  let text = '🏆 *Топ игроков*\n\n';
  leaders.forEach((u, i) => {
    text += `${medals[i] || `${i+1}.`} ${u.name} — ${u.xp} XP\n`;
  });
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// ── API ДЛЯ MINI APP ──

// Получить данные пользователя
app.get('/api/user/:id', (req, res) => {
  const user = db.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// Обновить XP
app.post('/api/user/:id/xp', (req, res) => {
  const { amount } = req.body;
  const user = db.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  let newXp = user.xp + amount;
  let newLevel = user.level;
  if (newXp >= newLevel * 100) { newXp -= newLevel * 100; newLevel++; }
  db.updateUser(req.params.id, { xp: newXp, level: newLevel });
  res.json({ xp: newXp, level: newLevel });
});

// Получить задачи
app.get('/api/tasks/:id', (req, res) => {
  res.json(db.getTodayTasks(req.params.id));
});

// Добавить задачу
app.post('/api/tasks/:id', (req, res) => {
  const { name, sphere, xp } = req.body;
  db.addTask(req.params.id, name, sphere, xp || 10);
  res.json({ ok: true });
});

// Выполнить задачу
app.post('/api/tasks/:id/complete/:taskId', (req, res) => {
  db.completeTask(req.params.taskId, req.params.id);
  const { amount } = req.body;
  const user = db.getUser(req.params.id);
  if (user) {
    let newXp = user.xp + (amount || 10);
    let newLevel = user.level;
    if (newXp >= newLevel * 100) { newXp -= newLevel * 100; newLevel++; }
    db.updateUser(req.params.id, { xp: newXp, level: newLevel });
  }
  res.json({ ok: true });
});

// Получить цели
app.get('/api/goals/:id', (req, res) => {
  res.json(db.getGoals(req.params.id));
});

// Добавить цель
app.post('/api/goals/:id', (req, res) => {
  const { sphere, name } = req.body;
  db.addGoal(req.params.id, sphere, name);
  res.json({ ok: true });
});

// Лидерборд
app.get('/api/leaderboard', (req, res) => {
  res.json(db.getLeaderboard());
});

// ── УВЕДОМЛЕНИЯ (крон) ──
cron.schedule('0 8 * * *', () => {
db.getLeaderboard().then(users => {
    if (u.notif_morning) {
      bot.sendMessage(u.telegram_id,
        `🌅 *Доброе утро, ${u.name}!*\n\nВремя прокачиваться! Открывай Protocol 2.0 и выполняй задачи 💪`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🚀 Открыть', web_app: { url: process.env.WEBAPP_URL } }]] } }
      );
    }
  });
});

cron.schedule('0 13 * * *', () => {
  db.getLeaderboard().then(users => {
    if (u.notif_noon) {
      bot.sendMessage(u.telegram_id,
        `☀️ *Полдень!*\n\nПроверь свой прогресс — не забудь про задачи на сегодня!`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '📋 Задачи', web_app: { url: process.env.WEBAPP_URL } }]] } }
      );
    }
  });
});

cron.schedule('0 21 * * *', () => {
 db.getLeaderboard().then(users => {
    if (u.notif_evening) {
      bot.sendMessage(u.telegram_id,
        `🌙 *Вечерняя проверка*\n\nКак прошёл день? Подведи итоги и не сломай стрик! 🔥`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '📊 Итоги', web_app: { url: process.env.WEBAPP_URL } }]] } }
      );
    }
  });
});

// ── ЗАПУСК ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));