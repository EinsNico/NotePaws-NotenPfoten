const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const file = path.resolve(__dirname,
  "../cordova/local-plugins/noten-pfoten-save-data-file/www/save-data-file.js");
const calls = [];
const moduleStub = { exports: {} };
vm.runInNewContext(fs.readFileSync(file, "utf8"), {
  module: moduleStub,
  require(name) {
    assert.strictEqual(name, "cordova/exec");
    return (...args) => calls.push(args);
  }
}, { filename: file });

const plugin = moduleStub.exports;
const success = () => {};
const error = () => {};
plugin.openStream("application/json", success, error);
plugin.readChunk("test-token", success, error);
plugin.closeStream("test-token", success, error);
plugin.openWriteStream("backup.json", "application/json", success, error);
plugin.writeChunk("write-token", "{\"hello\":1}", success, error);
plugin.finishWriteStream("write-token", 123, success, error);
plugin.abortWriteStream("write-token", success, error);

assert.deepStrictEqual(calls.map(call => [call[2], call[3], Array.from(call[4])]), [
  ["NotenPfotenSaveDataFile", "openStream", ["application/json"]],
  ["NotenPfotenSaveDataFile", "readChunk", ["test-token"]],
  ["NotenPfotenSaveDataFile", "closeStream", ["test-token"]],
  ["NotenPfotenSaveDataFile", "openWriteStream", ["backup.json", "application/json"]],
  ["NotenPfotenSaveDataFile", "writeChunk", ["write-token", "{\"hello\":1}"]],
  ["NotenPfotenSaveDataFile", "finishWriteStream", ["write-token", 123]],
  ["NotenPfotenSaveDataFile", "abortWriteStream", ["write-token"]]
]);
assert.strictEqual(typeof plugin.open, "function");
assert.strictEqual(typeof plugin.save, "function");
process.stdout.write("Save-data stream plugin bridge tests passed.\n");
