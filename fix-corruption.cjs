const fs = require('fs');

// Fix ProjectPicker.tsx line 326
let file1 = 'apps/desktop/src/ui/components/chat/ProjectPicker.tsx';
let lines1 = fs.readFileSync(file1, 'utf8').split('\n');
lines1[325] = '              ? "Loading folders…"';
fs.writeFileSync(file1, lines1.join('\n'), 'utf8');
console.log('Fixed:', file1);

// Fix DirectoryTreePicker.tsx line 47
let file2 = 'apps/desktop/src/ui/components/chat/DirectoryTreePicker.tsx';
let lines2 = fs.readFileSync(file2, 'utf8').split('\n');
lines2[46] = '          loadingLabel={includeFiles ? "Loading entries…" : "Loading folders…"}';
fs.writeFileSync(file2, lines2.join('\n'), 'utf8');
console.log('Fixed:', file2);

// Fix TerminalChrome.tsx line 268
let file3 = 'apps/desktop/src/ui/components/terminal/TerminalChrome.tsx';
let lines3 = fs.readFileSync(file3, 'utf8').split('\n');
lines3[267] = '                        <span className="text-[10px] text-muted-foreground/80">{groupVisualIdentity?.title}</span>';
fs.writeFileSync(file3, lines3.join('\n'), 'utf8');
console.log('Fixed:', file3);

console.log('\nAll 3 files fixed!');
