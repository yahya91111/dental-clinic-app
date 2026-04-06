// Restore StyleSheet import for files that still use StyleSheet.absoluteFill etc.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const FILES = [
  'ArchiveScreen.tsx',
  'DentalDepartmentsScreen.tsx',
  'DoctorsScreen.tsx',
  'DoctorProfileScreen.tsx',
  'MyPracticeScreen.tsx',
  'LoginScreen.tsx',
  'MyTimelineScreen.tsx',
  'PatientProfileScreen.tsx',
  'RegisterScreen.tsx',
  'ClinicDetailsScreen.tsx',
  'screens/DentalChart/OralHygieneContainer.tsx',
];

let processed = 0;
for (const relFile of FILES) {
  const filePath = path.join(ROOT, relFile);
  if (!fs.existsSync(filePath)) continue;
  let content = fs.readFileSync(filePath, 'utf8');

  // Check if StyleSheet is used but not imported
  if (!content.includes('StyleSheet.')) continue;

  // Add StyleSheet to react-native import if missing
  const reactNativeImportRegex = /import\s*{([^}]*)}\s*from\s*['"]react-native['"]/;
  const match = content.match(reactNativeImportRegex);
  if (!match) continue;

  const imports = match[1].split(',').map(s => s.trim()).filter(Boolean);
  if (imports.includes('StyleSheet')) continue;

  imports.unshift('StyleSheet');
  content = content.replace(reactNativeImportRegex, `import { ${imports.join(', ')} } from 'react-native'`);

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Fixed: ${relFile}`);
  processed++;
}

console.log(`Done. Fixed: ${processed}`);
