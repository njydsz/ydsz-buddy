// Quick debug
const pattern = /(?:(?<=^|[\s`(\[])(?:`)?)((?:\.{1,2}[\/\\]|\/|[A-Za-z]:[\\\/])?(?:[A-Za-z0-9_.-]+[\/\\])*[A-Za-z][A-Za-z0-9_.-]*\.[A-Za-z0-9]+)(?:`)?:(\d{1,6})(?:\s*-\s*(\d{1,6}))?(?::(\d{1,6}))?(?=[\s`.,;)\]}]|$)/g;
const text = "see `src/foo.ts:42` ok";
pattern.lastIndex = 0;
let match;
while ((match = pattern.exec(text)) !== null) {
  console.log("full match:", JSON.stringify(match[0]));
  console.log("filePath:", JSON.stringify(match[1]));
  console.log("starts with backtick:", match[0].startsWith("`"));
  console.log("ends with backtick:", match[0].endsWith("`"));
}
console.log("---");
const text2 = "see src/foo.ts:42 ok";
pattern.lastIndex = 0;
while ((match = pattern.exec(text2)) !== null) {
  console.log("full match2:", JSON.stringify(match[0]));
  console.log("starts with backtick:", match[0].startsWith("`"));
}
