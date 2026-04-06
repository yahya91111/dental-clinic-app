// Scale numeric values in inline style objects across tsx files
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Properties that should be scaled
const SCALABLE_PROPS = [
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'paddingHorizontal', 'paddingVertical', 'paddingStart', 'paddingEnd',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
  'top', 'bottom', 'left', 'right',
  'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
  'borderBottomLeftRadius', 'borderBottomRightRadius',
  'borderWidth', 'borderTopWidth', 'borderBottomWidth',
  'borderLeftWidth', 'borderRightWidth',
  'fontSize', 'lineHeight', 'letterSpacing',
  'gap', 'rowGap', 'columnGap',
];

const PROP_REGEX = new RegExp(
  `(\\b(?:${SCALABLE_PROPS.join('|')}))\\s*:\\s*(-?\\d+(?:\\.\\d+)?)(?=[,\\s}])`,
  'g'
);

// Match outputRange: [num, num] (used in animations)
const OUTPUT_RANGE_REGEX = /outputRange:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g;

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
  const originalContent = content;

  // Find inline style objects: style={{ ... }} or style={[..., { ... }]}
  // We process the entire file but only inside style props
  // Approach: find style={{...}} patterns and process their interior

  let modified = content;

  // Match style={{ ... }} - non-greedy, allowing nested braces? Actually JSX style is shallow
  // We need to handle multi-line style objects
  modified = modified.replace(/style=\{\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\}/g, (match, inner) => {
    let newInner = inner.replace(PROP_REGEX, (m, prop, num) => {
      // Skip if already wrapped in scale()
      return `${prop}: scale(${num})`;
    });
    // Also handle outputRange in inline styles
    newInner = newInner.replace(OUTPUT_RANGE_REGEX, (m, n1, n2) => {
      return `outputRange: [scale(${n1}), scale(${n2})]`;
    });
    return `style={{${newInner}}}`;
  });

  // Also handle style={[..., { ... }]} array form
  modified = modified.replace(/style=\{\[([\s\S]*?)\]\}/g, (match, inner) => {
    // Process { ... } objects inside the array
    const processed = inner.replace(/\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (m, objInner) => {
      let newInner = objInner.replace(PROP_REGEX, (mm, prop, num) => {
        return `${prop}: scale(${num})`;
      });
      newInner = newInner.replace(OUTPUT_RANGE_REGEX, (mm, n1, n2) => {
        return `outputRange: [scale(${n1}), scale(${n2})]`;
      });
      return `{${newInner}}`;
    });
    return `style={[${processed}]}`;
  });

  if (modified === originalContent) continue;

  // Add scale import if not present
  if (!modified.includes('scale(') || !modified.match(/from\s*['"][^'"]*lib\/scale['"]/)) {
    // No, scale( IS present now since we just added it
  }

  if (!modified.match(/import\s*{[^}]*\bscale\b[^}]*}\s*from\s*['"][^'"]*lib\/scale['"]/)) {
    const importPath = getRelativeImportPath(filePath);

    // Check existing import from lib/scale
    if (modified.match(/from\s*['"][^'"]*lib\/scale['"]/)) {
      // Existing import - add scale to it
      modified = modified.replace(
        /import\s*{([^}]*)}\s*from\s*(['"][^'"]*lib\/scale['"])/,
        (match, imports, source) => {
          const items = imports.split(',').map(s => s.trim()).filter(Boolean);
          if (!items.includes('scale')) items.push('scale');
          return `import { ${items.join(', ')} } from ${source}`;
        }
      );
    } else {
      // Add new import after react-native import
      modified = modified.replace(
        /(import\s*{[^}]*}\s*from\s*['"]react-native['"];?\s*\n)/,
        `$1import { scale } from '${importPath}';\n`
      );
    }
  }

  fs.writeFileSync(filePath, modified, 'utf8');
  console.log(`Processed: ${path.relative(ROOT, filePath)}`);
  processed++;
}

console.log(`\nDone. Files modified: ${processed}`);
