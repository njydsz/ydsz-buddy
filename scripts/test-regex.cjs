const fs = require("fs");
const path = require("path");

const ROOT = "d:\\Code\\remi\\org\\modules\\remi-code";

const file = path.join(ROOT, "remi-auth", "src", "service.rs");
const content = fs.readFileSync(file, "utf8");
const lines = content.split("\n");

console.log("Lines 362-372:");
for (let i = 362; i < 372 && i < lines.length; i++) {
  console.log(i + ":", JSON.stringify(lines[i]));
}

console.log("\nLines 740-760:");
for (let i = 740; i < 760 && i < lines.length; i++) {
  console.log(i + ":", JSON.stringify(lines[i]));
}
