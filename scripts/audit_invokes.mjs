import fs from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), 'src');

function walk(d) {
  let results = [];
  const list = fs.readdirSync(d);
  list.forEach(file => {
    const full = path.join(d, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) results = results.concat(walk(full));
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) results.push(full);
  });
  return results;
}

const files = walk(dir);
const invokes = new Map();
for (const f of files) {
  const content = fs.readFileSync(f, 'utf-8');
  const regex = /invoke(?:<[^>]+>)?\(\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const cmd = match[1];
    if (!invokes.has(cmd)) invokes.set(cmd, []);
    invokes.get(cmd).push(path.basename(f));
  }
}

console.log('Frontend invoke calls:');
for (const [cmd, list] of Array.from(invokes.entries()).sort()) {
  console.log(` - ${cmd} (used in: ${list.join(', ')})`);
}

// Now read src-tauri/src/commands.rs and src-tauri/src/lib.rs
const commandsFile = fs.readFileSync('src-tauri/src/commands.rs', 'utf-8');
const libFile = fs.readFileSync('src-tauri/src/lib.rs', 'utf-8');

const tauriRegex = /#\[tauri::command\]\s*(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)/g;
const rustCommands = new Set();
let rMatch;
while ((rMatch = tauriRegex.exec(commandsFile)) !== null) {
  rustCommands.add(rMatch[1]);
}
while ((rMatch = tauriRegex.exec(libFile)) !== null) {
  rustCommands.add(rMatch[1]);
}

console.log('\nRust commands implemented:');
Array.from(rustCommands).sort().forEach(c => console.log(' + ' + c));

console.log('\nChecking for missing backend commands:');
let missingCount = 0;
for (const [cmd, list] of invokes.entries()) {
  if (!rustCommands.has(cmd)) {
    console.log(` ! MISSING in Rust backend: "${cmd}" (called by ${list.join(', ')})`);
    missingCount++;
  }
}
if (missingCount === 0) console.log('All frontend invoke calls exist in Rust backend!');
