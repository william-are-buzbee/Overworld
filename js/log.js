// ==================== LOG ====================
const logEl = document.getElementById('log');

export function log(msg, cls=''){
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = '› ' + msg;
  logEl.appendChild(line);
  while (logEl.children.length > 140) logEl.removeChild(logEl.firstChild);
  logEl.scrollTop = logEl.scrollHeight;
}

export { logEl };
