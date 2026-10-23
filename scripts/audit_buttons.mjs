import fs from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), 'src', 'components');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));

console.log(`Checking ${files.length} components...`);

for (const file of files) {
  const content = fs.readFileSync(path.join(dir, file), 'utf-8');
  // Match all <button ... > tags
  const regex = /<button\b([^>]*)>/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const attrs = match[1];
    if (!attrs.includes('onClick') && !attrs.includes('type="submit"') && !attrs.includes("type='submit'")) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      console.log(`[NO ONCLICK] ${file}:${lineNum} -> <button ${attrs.slice(0, 60)}...>`);
    }
  }
}
