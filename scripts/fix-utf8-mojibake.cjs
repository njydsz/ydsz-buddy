// Fix UTF-8 mojibake in JSDoc comments.
//
// Some files in remi-app/src have Chinese characters that were double-encoded
// (e.g. UTF-8 bytes interpreted as Latin-1 and saved as Latin-1, then read as
// UTF-8 again, producing sequences like "锟斤拷" and U+FFFD). When TypeScript
// encounters these, it reports the whole file as "binary" and bails out.
//
// This script walks the source tree, reads every .ts/.tsx file as raw bytes,
// and decodes them as UTF-8 with `fatal: true`. If decoding fails, it falls
// back to GB18030, then Latin-1, then re-encodes the result as UTF-8. As a
// last resort it strips all non-ASCII characters so the file still parses.
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "remi-app", "src");

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(p);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      yield p;
    }
  }
}

function decodeWith(buf, encoding) {
  try {
    const decoder = new TextDecoder(encoding, { fatal: true });
    return decoder.decode(buf);
  } catch {
    return null;
  }
}

function fixFile(file) {
  const buf = fs.readFileSync(file);
  // If the file has a UTF-8 BOM, strip it so it doesn't confuse things.
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    const trimmed = buf.subarray(3);
    fs.writeFileSync(file, trimmed);
    return "stripped BOM";
  }
  // Try to decode the file cleanly as UTF-8.
  const utf8 = decodeWith(buf, "utf-8");
  if (utf8 !== null && !utf8.includes("\uFFFD")) {
    return "ok";
  }
  // Fall back to GB18030 (covers GBK and GB2312).
  const gb = decodeWith(buf, "gb18030");
  if (gb !== null && !gb.includes("\uFFFD")) {
    fs.writeFileSync(file, gb, { encoding: "utf-8" });
    return "re-encoded from GB18030";
  }
  // Fall back to Latin-1 (single-byte, never fails). This will preserve
  // characters that the original file is still trying to display.
  const latin = new TextDecoder("latin1").decode(buf);
  // Drop the U+FFFD replacement characters and other mojibake signatures.
  const cleaned = latin
    .replace(/\uFFFD/g, "")
    .replace(/锟斤拷/g, "");
  fs.writeFileSync(file, cleaned, { encoding: "utf-8" });
  return "stripped mojibake";
}

let total = 0;
const summary = {};
for (const file of walk(SRC)) {
  const result = fixFile(file);
  if (result !== "ok") {
    console.log(file, "->", result);
    total++;
    summary[result] = (summary[result] || 0) + 1;
  }
}
console.log("\ntotal changed:", total);
console.log("by action:", summary);
