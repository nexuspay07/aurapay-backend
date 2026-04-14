module.exports = async function measureExecution(fn) {
  const start = Date.now();
  const result = await fn();
  result.latency = Date.now() - start;
  return result;
};