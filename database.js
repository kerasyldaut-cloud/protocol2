const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const getUser = async (telegram_id) => {
  const { data } = await supabase.from('users').select('*').eq('telegram_id', telegram_id).single();
  return data;
};

const createUser = async (telegram_id, name) => {
  await supabase.from('users').upsert({ telegram_id, name, last_active: new Date().toISOString() }, { onConflict: 'telegram_id', ignoreDuplicates: true });
  return getUser(telegram_id);
};

const updateUser = async (telegram_id, fields) => {
  await supabase.from('users').update(fields).eq('telegram_id', telegram_id);
};

const getTodayTasks = async (telegram_id) => {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase.from('tasks').select('*').eq('telegram_id', telegram_id).eq('date', today);
  return data || [];
};

const addTask = async (telegram_id, name, sphere, xp) => {
  const today = new Date().toISOString().split('T')[0];
  await supabase.from('tasks').insert({ telegram_id, name, sphere, xp, date: today });
};

const completeTask = async (id, telegram_id) => {
  await supabase.from('tasks').update({ done: 1 }).eq('id', id).eq('telegram_id', telegram_id);
};

const getGoals = async (telegram_id) => {
  const { data } = await supabase.from('goals').select('*').eq('telegram_id', telegram_id);
  return data || [];
};

const addGoal = async (telegram_id, sphere, name) => {
  await supabase.from('goals').insert({ telegram_id, sphere, name });
};

const updateGoalProgress = async (id, progress) => {
  await supabase.from('goals').update({ progress }).eq('id', id);
};

const getLeaderboard = async () => {
  const { data } = await supabase.from('users').select('*').order('xp', { ascending: false }).limit(10);
  return data || [];
};

module.exports = {
  getUser, createUser, updateUser,
  getTodayTasks, addTask, completeTask,
  getGoals, addGoal, updateGoalProgress,
  getLeaderboard
};