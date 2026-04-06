// Replace size={N} with size={scale(N)} in tsx files for icon sizing
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'scripts' || entry.name === 'lib' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.tsx')) files.push(full);
  }
  return files;
}

function getRelativeImportPath(filePath) {
  const fileDir = path.dirname(filePath);
  const relPath = path.relative(fileDir, path.join(ROOT, 'lib/scale')).replace(/\\/g, '/');
  return relPath.startsWith('.') ? relPath : './' + relPath;
}

const files = walk(ROOT);
let processed = 0;

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Match size={N} where N is a positive integer (avoid already-scaled)
  const newContent = content.replace(/size=\{(\d+)\}/g, (match, num) => {
    changed = true;
    return `size={scale(${num})}`;
  });

  if (!changed) continue;

  // Add scale import if missing
  if (!newContent.includes("from '../lib/scale'") && !newContent.includes("from './lib/scale'") && !newContent.includes("from '../../lib/scale'")) {
    const importPath = getRelativeImportPath(filePath);

    // Check if scaledStyleSheet is already imported - extend that import
    if (newContent.includes('scaledStyleSheet')) {
      const updated = newContent.replace(
        /import\s*{\s*scaledStyleSheet\s*}\s*from\s*(['"][^'"]+['"])/,
        `import { scaledStyleSheet, scale } from $1`
      );
      fs.writeFileSync(filePath, updated, 'utf8');
    } else {
      // Add new import after react-native import
      const updated = newContent.replace(
        /(import\s*{[^}]*}\s*from\s*['"]react-native['"];?\s*\n)/,
        `$1import { scale } from '${importPath}';\n`
      );
      fs.writeFileSync(filePath, updated, 'utf8');
    }
  } else {
    // Already imports from scale - check if scale is included
    const importMatch = newContent.match(/import\s*{([^}]*)}\s*from\s*['"][^'"]*lib\/scale['"]/);
    if (importMatch && !importMatch[1].includes('scale')) {
      const items = importMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      items.push('scale');
      const updated = newContent.replace(
        /import\s*{[^}]*}\s*from\s*(['"][^'"]*lib\/scale['"])/,
        `import { ${items.join(', ')} } from $1`
      );
      fs.writeFileSync(filePath, updated, 'utf8');
    } else if (importMatch && importMatch[1].includes('scaledStyleSheet') && !importMatch[1].includes('scale,') && !importMatch[1].match(/\bscale\s*[,}]/)) {
      // scale is not in the import yet
      const items = importMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      if (!items.includes('scale')) items.push('scale');
      const updated = newContent.replace(
        /import\s*{[^}]*}\s*from\s*(['"][^'"]*lib\/scale['"])/,
        `import { ${items.join(', ')} } from $1`
      );
      fs.writeFileSync(filePath, updated, 'utf8');
    } else {
      fs.writeFileSync(filePath, newContent, 'utf8');
    }
  }

  console.log(`Processed: ${path.relative(ROOT, filePath)}`);
  processed++;
}

console.log(`\nDone. Files modified: ${processed}`);
