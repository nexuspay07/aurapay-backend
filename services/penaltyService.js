const ProviderState = require("../models/ProviderState");

// 🔍 Get or create provider state
async function getOrCreate(provider) {
  let state = await ProviderState.findOne({ provider });

  if (!state) {
    state = new ProviderState({ provider, penalty: 0 });
    await state.save();
  }

  return state;
}

// 🔻 Increase penalty
async function increasePenalty(provider) {
  const state = await getOrCreate(provider);

  state.penalty += 0.2;
  state.lastUpdated = new Date();

  await state.save();

  console.log(`⚠️ Penalty increased for ${provider}:`, state.penalty);
}

// 🔺 Decrease penalty
async function decreasePenalty(provider) {
  const state = await getOrCreate(provider);

  state.penalty = Math.max(0, state.penalty - 0.05);
  state.lastUpdated = new Date();

  await state.save();

  console.log(`✅ Penalty decreased for ${provider}:`, state.penalty);
}

// 📊 Get penalty
async function getPenalty(provider) {
  const state = await getOrCreate(provider);
  return state.penalty;
}

module.exports = {
  increasePenalty,
  decreasePenalty,
  getPenalty,
};