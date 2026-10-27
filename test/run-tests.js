const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);
if (args.some(arg => arg !== "--exclude-workshop")) {
  process.stderr.write("Usage: node test/run-tests.js [--exclude-workshop]\n");
  process.exit(1);
}

const excludeWorkshop = args.includes("--exclude-workshop");
const tests = fs.readdirSync(__dirname).filter(name =>
  name.endsWith(".test.js") && (!excludeWorkshop || !name.startsWith("workshop"))
).sort();

if (tests.length === 0) {
  process.stderr.write("No test files found.\n");
  process.exit(1);
}

for (const name of tests) {
  process.stdout.write(`\n${name}\n`);
  const result = spawnSync(process.execPath, [path.join(__dirname, name)], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit"
  });
  if (result.error || result.status !== 0) {
    process.stderr.write(`Test failed: ${name}\n`);
    if (result.error) process.stderr.write(result.error.message + "\n");
    process.exit(result.status || 1);
  }
}

process.stdout.write(`\nAll ${tests.length} test files passed.\n`);
