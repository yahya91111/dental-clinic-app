// Script to apply scaledStyleSheet to all files using StyleSheet.create
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Files to process (from grep results)
const FILES = [
  'components/ToothDetailsModal.tsx',
  'DentalDepartmentsScreen.tsx',
  'ArchiveScreen.tsx',
  'PatientProfileScreen.tsx',
  'screens/DentalChart/SingleTooth.tsx',
  'screens/DentalChart/OralHygieneContainer.tsx',
  'screens/DentalChart/RecordCards.tsx',
  'MyStatisticsScreen.tsx',
  'MyPracticeScreen.tsx',
  'ClinicDetailsScreen.tsx',
  'DoctorProfileScreen.tsx',
  'ScheduleScreen.tsx',
  'RequestsScreen.tsx',
  'RegisterScreen.tsx',
  'NotificationsModal.tsx',
  'MyTimelineScreen.tsx',
  'LoginScreen.tsx',
  'DoctorsScreen.tsx',
  'ComingSoonScreen.tsx',
];

function getRelativeImportPath(filePath) {
  // Compute relative path from filePath to lib/scale
  const fileDir = path.dirname(filePath);
  const relPath = path.relative(fileDir, path.join(ROOT, 'lib/scale')).replace(/\\/g, '/');
  return relPath.startsWith('.') ? relPath : './' + relPath;
}

let processed = 0;
let skipped = 0;

for (const relFile of FILES) {
  const filePath = path.join(ROOT, relFile);
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP (not found): ${relFile}`);
    skipped++;
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes('scaledStyleSheet')) {
    console.log(`SKIP (already done): ${relFile}`);
    skipped++;
    continue;
  }

  // 1. Remove StyleSheet from react-native import
  content = content.replace(
    /import\s*{([^}]*)}\s*from\s*['"]react-native['"]/,
    (match, imports) => {
      const items = imports.split(',').map(s => s.trim()).filter(s => s && s !== 'StyleSheet');
      return `import { ${items.join(', ')} } from 'react-native'`;
    }
  );

  // 2. Add scaledStyleSheet import after react-native import
  const importPath = getRelativeImportPath(filePath);
  content = content.replace(
    /(import\s*{[^}]*}\s*from\s*['"]react-native['"];?\s*\n)/,
    `$1import { scaledStyleSheet } from '${importPath}';\n`
  );

  // 3. Replace StyleSheet.create with scaledStyleSheet
  content = content.replace(/StyleSheet\.create\b/g, 'scaledStyleSheet');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`OK: ${relFile}`);
  processed++;
}

console.log(`\nDone. Processed: ${processed}, Skipped: ${skipped}`);
