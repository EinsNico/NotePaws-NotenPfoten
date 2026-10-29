'use strict'
require('./check-versions')()

process.env.NODE_ENV = 'production'

const ora = require('ora')
const rm = require('rimraf')
const fs = require('fs')
const path = require('path')
const chalk = require('chalk')
const webpack = require('webpack')
const config = require('../config')
const webpackConfig = require('./webpack.prod.conf')

// Webpack 3 embeds a build-dependent hash in the runtime's debug-only name.
// Keep the source and mappings, but give that synthetic source a stable name so
// independently built APKs can retain the same developer signature.
function normalizeRuntimeSourceMaps () {
  const directory = path.join(config.build.assetsRoot, config.build.assetsSubDirectory, 'js')
  fs.readdirSync(directory).filter(name => name.endsWith('.js.map')).forEach(name => {
    const filename = path.join(directory, name)
    const map = JSON.parse(fs.readFileSync(filename, 'utf8'))
    let changed = false
    map.sources.forEach((source, index) => {
      if (!/^webpack:\/\/\/webpack\/bootstrap [a-f0-9]+$/.test(source)) return
      const footer = '// ' + source.slice('webpack:///'.length)
      if (map.sourcesContent && typeof map.sourcesContent[index] === 'string') {
        if (!map.sourcesContent[index].endsWith(footer)) {
          throw new Error('Unexpected Webpack runtime source-map footer: ' + name)
        }
        map.sourcesContent[index] = map.sourcesContent[index].slice(0, -footer.length) + '// webpack/bootstrap'
      }
      map.sources[index] = 'webpack:///webpack/bootstrap'
      changed = true
    })
    if (changed) fs.writeFileSync(filename, JSON.stringify(map))
  })
}

const spinner = ora('building for production...')
spinner.start()

rm(path.join(config.build.assetsRoot, config.build.assetsSubDirectory), err => {
  if (err) throw err
  webpack(webpackConfig, (err, stats) => {
    spinner.stop()
    if (err) throw err
    process.stdout.write(stats.toString({
      colors: true,
      modules: false,
      children: false, // If you are using ts-loader, setting this to true will make TypeScript errors show up during build.
      chunks: false,
      chunkModules: false
    }) + '\n\n')

    if (stats.hasErrors()) {
      console.log(chalk.red('  Build failed with errors.\n'))
      process.exit(1)
    }

    normalizeRuntimeSourceMaps()

    console.log(chalk.cyan('  Build complete.\n'))
    console.log(chalk.yellow(
      '  Tip: built files are meant to be served over an HTTP server.\n' +
      '  Opening index.html over file:// won\'t work.\n'
    ))
  })
})
