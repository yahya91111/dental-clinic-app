// V2: Better inline style scaling using brace counting for nested objects
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

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
  `(\\b(?:${SCALABLE_PROPS.join('|')}))\\s*:\\s*(-?\\d+(?:\\.\\d+)?)(?=[,\\s})])`,
  'g'
);

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

/**
 * Find matching closing brace for an opening brace at index.
 */
function findMatchingBrace(text, openIndex) {
  let depth = 1;
  let i = openIndex + 1;
  while (i < text.length && depth > 0) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth === 0) return i;
    i++;
  }
  return -1;
}

/**
 * Process a style object's inner content (between { and }).
 */
function processStyleContent(content) {
  // Replace already-scaled patterns first to avoid double-scaling
  let result = content.replace(PROP_REGEX, (match, prop, num) => {
    return `${prop}: scale(${num})`;
  });

  result = result.replace(OUTPUT_RANGE_REGEX, (match, n1, n2) => {
    return `outputRange: [scale(${n1}), scale(${n2})]`;
  });

  return result;
}

/**
 * Find all `style={{...}}` blocks in the file (top-level only - not nested style props).
 * Returns array of [startIndex, endIndex, newContent].
 */
function findStyleBlocks(text) {
  const blocks = [];
  const styleStarts = [];
  let i = 0;
  while (i < text.length) {
    const idx = text.indexOf('style={{', i);
    if (idx === -1) break;
    styleStarts.push(idx);
    i = idx + 8;
  }

  for (const startIdx of styleStarts) {
    // Find matching outer }} for the {{
    // The pattern is style={{ ... }}
    // The outer braces are at startIdx+6 (first {) and we need to find its match,
    // then check if next char is also }
    const firstBrace = startIdx + 6; // position of first {
    const firstMatch = findMatchingBrace(text, firstBrace);
    if (firstMatch === -1) continue;
    // Now we need style={...}} - the wrapping brace
    // Actually style={{ }} is style={  {  }  }
    // Outer { is at startIdx+6, inner { at startIdx+7
    const innerBrace = startIdx + 7;
    const innerMatch = findMatchingBrace(text, innerBrace);
    if (innerMatch === -1) continue;
    // Verify the next char after innerMatch is }
    if (text[innerMatch + 1] !== '}') continue;

    const inner = text.substring(innerBrace + 1, innerMatch);
    const newInner = processStyleContent(inner);
    if (newInner === inner) continue;

    blocks.push({
      start: innerBrace + 1,
      end: innerMatch,
      newContent: newInner,
    });
  }

  return blocks;
}

const files = walk(ROOT);
let processed = 0;

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf8');

  const blocks = findStyleBlocks(content);
  if (blocks.length === 0) continue;

  // Apply changes from end to start to preserve indices
  blocks.sort((a, b) => b.start - a.start);
  for (const block of blocks) {
    content = content.substring(0, block.start) + block.newContent + content.substring(block.end);
  }

  // Add scale import if not present
  if (!content.match(/import\s*{[^}]*\bscale\b[^}]*}\s*from\s*['"][^'"]*lib\/scale['"]/)) {
    if (content.match(/from\s*['"][^'"]*lib\/scale['"]/)) {
      content = content.replace(
        /import\s*{([^}]*)}\s*from\s*(['"][^'"]*lib\/scale['"])/,
        (match, imports, source) => {
          const items = imports.split(',').map(s => s.trim()).filter(Boolean);
          if (!items.includes('scale')) items.push('scale');
          return `import { ${items.join(', ')} } from ${source}`;
        }
      );
    } else {
      const importPath = getRelativeImportPath(filePath);
      content = content.replace(
        /(import\s*{[^}]*}\s*from\s*['"]react-native['"];?\s*\n)/,
        `$1import { scale } from '${importPath}';\n`
      );
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Processed: ${path.relative(ROOT, filePath)} (${blocks.length} blocks)`);
  processed++;
}

console.log(`\nDone. Files modified: ${processed}`);
