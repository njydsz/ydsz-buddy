const fs = require('fs');

// Files that were corrupted and fixed with newlines
const files = [
  'd:/Code/remi/org/modules/remi-code/remi-app/src/store.ts',
  'd:/Code/remi/org/modules/remi-code/remi-app/src/routes/__root.tsx',
  'd:/Code/remi/org/modules/remi-code/remi-app/src/routes/_chat.settings.tsx',
  'd:/Code/remi/org/modules/remi-code/remi-app/src/hooks/useDisposableThreadLifecycle.ts',
  'd:/Code/remi/org/modules/remi-code/remi-app/src/components/ChatView.logic.ts',
];

for (const file of files) {
  console.log(`\nProcessing: ${file}`);
  let content = fs.readFileSync(file, 'utf8');
  
  // Pattern 1: Remove standalone "?" lines that are artifacts of corruption
  // These appear as lines with just "?" or "?..." in comments
  content = content.replace(/\n\?\s*\n/g, '\n');
  
  // Pattern 2: Fix broken comment lines where "?" appears at start of continuation
  // e.g., " * 立即同步持久化当前应用状\n\n? * @param" -> " * 立即同步持久化当前应用状态\n * @param"
  // The "?" replaces a Chinese character that was corrupted
  content = content.replace(/\n\?\s*\*\s/g, '\n * ');
  
  // Pattern 3: Fix lines that end abruptly and have "?..." on next line
  // Merge them back together
  content = content.replace(/([\u4e00-\u9fff])\n\n\?\s*(.+)/g, (match, char, rest) => {
    // Try to reconstruct: the "?" replaced part of a Chinese character
    // Just merge the lines and add a reasonable ending
    return char + rest;
  });
  
  // Pattern 4: Fix "// comment\n\n?continuation" patterns
  content = content.replace(/(\/\/[^\n]+)\n\n\?([^\n]+)/g, '$1$2');
  
  fs.writeFileSync(file, content, 'utf8');
  console.log(`  Cleaned up`);
}

console.log('\nDone!');
