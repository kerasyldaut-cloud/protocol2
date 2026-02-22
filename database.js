const { createClient } = require('@supabase/supabase-js');

// Используем service role key (SUPABASE_KEY) и URL
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// --- USERS ---
const getUser = async (telegram_id) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegram_id)
    .single();

  if (error) return null;
  return data;
};

const createUser = async (telegram_id, name, age = null) => {
  // upsert: если юзер есть, не создаст дубль
  const payload = {
    telegram_id,
    name: name || 'User',
    age: age ?? null,
    last_active: new Date().toISOString()
  };

  const { error } = await supabase
    .from('users')
    .upsert(payload, { onConflict: 'telegram_id' });

  if (error) {
    console.error('createUser error:', error.message);
    return null;
  }

  return getUser(telegram_id);
};

const updateUser = async (telegram_id, fields) => {
  const { error } = await supabase
    .from('users')
    .update(fields)
    .eq('telegram_id', telegram_id);

  if (error) console.error('updateUser error:', error.message);
};

// --- TASKS ---
const getTodayTasks = async (telegram_id) => {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('telegram_id', telegram_id)
    .eq('date', today);

  if (error) {
    console.error('getTodayTasks error:', error.message);
    return [];
  }

  return data || [];
};

const addTask = async (telegram_id, name, sphere, xp) => {
  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase
    .from('tasks')
    .insert({ telegram_id, name, sphere, xp, date: today, done: 0 });

  if (error) console.error('addTask error:', error.message);
};

const completeTask = async (id, telegram_id) => {
  const { error } = await supabase
    .from('tasks')
    .update({ done: 1 })
    .eq('id', id)
    .eq('telegram_id', telegram_id);

  if (error) console.error('completeTask error:', error.message);
};

// --- GOALS ---
const getGoals = async (telegram_id) => {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('telegram_id', telegram_id);

  if (error) {
    console.error('getGoals error:', error.message);
    return [];
  }

  return data || [];
};

const addGoal = async (telegram_id, sphere, name) => {
  const { error } = await supabase
    .from('goals')
    .insert({ telegram_id, sphere, name, progress: 0 });

  if (error) console.error('addGoal error:', error.message);
};

const updateGoalProgress = async (id, progress) => {
  const { error } = await supabase
    .from('goals')
    .update({ progress })
    .eq('id', id);

  if (error) console.error('updateGoalProgress error:', error.message);
};

// --- LEADERBOARD ---
const getLeaderboard = async () => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('xp', { ascending: false })
    .limit(10);

  if (error) {
    console.error('getLeaderboard error:', error.message);
    return [];
  }

  return data || [];
};

module.exports = {
  getUser,
  createUser,
  updateUser,
  getTodayTasks,
  addTask,
  completeTask,
  getGoals,
  addGoal,
  updateGoalProgress,
  getLeaderboard
};