const fs = require('fs');
const path = require('path');

const CODE_START_RE = new RegExp(
  '^(?:' +
    'fn\\s|pub\\s|let\\s|mut\\s|self\\.|match\\s|Ok\\(|Err\\(|Some\\(|None\\)|' +
    'use\\s|mod\\s|struct\\s|enum\\s|impl\\s|async\\s|return\\s|if\\s|else\\s|' +
    'for\\s|while\\s|loop\\s|continue|break|await|drop\\(|#\\[|const\\s|static\\s|' +
    'type\\s|unsafe\\s|move\\s|yield\\s|async_trait|#\\[derive|\\}|\\)|\\{|\\]' +
  ')'
);

const COMMENT_CODE_SPLIT_RE = /\s{2,}(fn\s|let\s|mut\s|self\.|Ok\(|Err\(|Some\(|None\)|match\s|return\s|if\s|else\s|for\s|while\s|loop\s|continue|break|await|pub\s|async\s|unsafe\s|#\[|\}\s*$)/;

function isCodeLine(suffix) {
  const trimmed = suffix.replace(/^\s+/, '');
  return CODE_START_RE.test(trimmed);
}

function splitCommentCode(line) {
  const match = line.match(/^(\s*\/\/)(.*)$/);
  if (!match) return [line];
  const prefix = match[1];
  const rest = match[2];
  const idx = rest.search(COMMENT_CODE_SPLIT_RE);
  if (idx === -1) return [line];
  const commentPart = rest.slice(0, idx);
  const codePart = rest.slice(idx).replace(/^\s+/, '');
  return [prefix + commentPart, codePart];
}

function repairFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  let text = original.replace(/\uFFFD/g, '.');
  const lines = text.split(/\r?\n/);
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Comment line: starts with optional whitespace then // (but not ///? or //! handled).
    const commentMatch = line.match(/^(\s*)\/\/(.*)$/);
    if (commentMatch) {
      const leading = commentMatch[1];
      let rest = commentMatch[2];

      // Avoid unterminated doc-string quotes by using single quotes inside comments.
      rest = rest.replace(/"/g, "'");

      // Split at corrupted boundary markers that introduce another // comment.
      const segments = rest.split(/\?(?=\s*\/\/)/);
      for (let j = 0; j < segments.length; j++) {
        let seg = segments[j];
        if (j === 0) {
          seg = leading + '//' + seg;
        } else {
          seg = seg.replace(/^\s*/, '');
          if (!seg) continue;
          seg = leading + seg;
        }

        // Further split a comment line that has code appended after spaces.
        const split = splitCommentCode(seg);
        for (const part of split) out.push(part);
      }
      continue;
    }

    // Corrupted boundary line: starts with optional whitespace then ? then whitespace then rest.
    const markerMatch = line.match(/^(\s*)\?(\s*)(.*)$/);
    if (markerMatch) {
      const leading = markerMatch[1];
      const suffix = markerMatch[3];
      const trimmedSuffix = suffix.replace(/^\s+/, '');

      if (trimmedSuffix.startsWith('//')) {
        out.push(leading + trimmedSuffix);
      } else if (isCodeLine(suffix)) {
        out.push(suffix);
      } else {
        if (out.length > 0) {
          out[out.length - 1] += ' ' + suffix.trim();
        } else {
          out.push(line);
        }
      }
      continue;
    }

    out.push(line);
  }

  const result = out.join('\n');
  if (result !== original) {
    fs.copyFileSync(filePath, filePath + '.bak');
    fs.writeFileSync(filePath, result, 'utf8');
    console.log('repaired', filePath);
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    if (entry === 'target' || entry === 'node_modules' || entry === '.git') continue;
    const full = path.join(dir, entry);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full);
    else if (full.endsWith('.rs')) repairFile(full);
  }
}

walk('.');
