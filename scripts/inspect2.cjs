const fs = require("fs");
const path = require("path");
const ROOT = "d:\\Code\\remi\\org\\modules\\remi-code";
const files = ["remi-auth/src/service.rs", "remi-auth/src/session_credential.rs", "remi-auth/src/secret_store.rs"];
for (const f of files) {
  const full = path.join(ROOT, f);
  console.log("===", f, "===");
  const c = fs.readFileSync(full, "utf8");
  const lines = c.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.includes("```")) {
      console.log(i + ": [" + l + "]");
    }
  }
}
