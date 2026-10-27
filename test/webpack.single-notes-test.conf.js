"use strict";

const path = require("path");
const baseConfig = require("../build/webpack.base.conf");

module.exports = Object.assign({}, baseConfig, {
  entry: {
    test: "./test/indexeddb-single-notes-write.js"
  },
  output: Object.assign({}, baseConfig.output, {
    path: path.resolve(__dirname, "browser-dist"),
    filename: "indexeddb-single-notes-write.bundle.js",
    publicPath: ""
  })
});
