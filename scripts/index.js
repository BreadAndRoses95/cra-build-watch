'use strict';

process.env.NODE_ENV = 'development'; // eslint-disable-line no-process-env

const importCwd = require('import-cwd');
const fs = require('fs-extra');
const path = require('path');
const ora = require('ora');
const overrideFunction = require('../../../config-overrides');

const {
  flags: { buildPath, publicPath, reactScriptsVersion, verbose, jsonpFunction, override },
} = require('../utils/cliHandler');
const { getReactScriptsVersion, isEjected } = require('../utils');

const { major, concatenatedVersion } = getReactScriptsVersion(reactScriptsVersion);

const paths = isEjected ? importCwd('./config/paths') : importCwd('react-scripts/config/paths');
const webpack = importCwd('webpack');

const config =
  concatenatedVersion >= 212
    ? (isEjected
        ? importCwd('./config/webpack.config')
        : importCwd('react-scripts/config/webpack.config'))('development')
    : isEjected
    ? importCwd('./config/webpack.config.dev')
    : importCwd('react-scripts/config/webpack.config.dev');

const HtmlWebpackPlugin = importCwd('html-webpack-plugin');
const InterpolateHtmlPlugin = importCwd('react-dev-utils/InterpolateHtmlPlugin');
const getClientEnvironment = isEjected
  ? importCwd('./config/env')
  : importCwd('react-scripts/config/env');

console.log();
const spinner = ora('Update webpack configuration').start();

// we need to set the public_url ourselves because in dev mode
// it is supposed to always be an empty string as they are using
// the in-memory development server to serve the content
const env = getClientEnvironment(process.env.PUBLIC_URL || ''); // eslint-disable-line no-process-env

/**
 * We need to update the webpack dev config in order to remove the use of webpack devserver
 */
config.entry = config.entry.filter(fileName => !fileName.match(/webpackHotDevClient/));
config.plugins = config.plugins.filter(
  plugin => !(plugin instanceof webpack.HotModuleReplacementPlugin)
);

if (override) {
  overrideFunction(config, process.env.NODE_ENV);
}

/**
 * We also need to update the path where the different files get generated.
 */
const resolvedBuildPath = buildPath ? handleBuildPath(buildPath) : paths.appBuild; // resolve the build path

// update the paths in config
config.output.path = resolvedBuildPath;
config.output.jsonpFunction = jsonpFunction || config.output.jsonpFunction;

// update media path destination

// we need to override the InterpolateHtmlPlugin because in dev mod
// they don't provide it the PUBLIC_URL env

spinner.succeed();
spinner.start('Clear destination folder');

let inProgress = false;

fs.emptyDir(paths.appBuild)
  .then(() => {
    spinner.succeed();

    return new Promise((resolve, reject) => {
      const webpackCompiler = webpack(config);
      webpackCompiler.apply(
        new webpack.ProgressPlugin(() => {
          if (!inProgress) {
            spinner.start('Start webpack watch');
            inProgress = true;
          }
        })
      );

      webpackCompiler.watch({}, (err, stats) => {
        if (err) {
          return reject(err);
        }

        spinner.succeed();
        inProgress = false;

        if (verbose) {
          console.log();
          console.log(
            stats.toString({
              chunks: false,
              colors: true,
            })
          );
          console.log();
        }

        return resolve();
      });
    });
  })
  .then(() => copyPublicFolder());

function copyPublicFolder() {
  return fs.copy(paths.appPublic, resolvedBuildPath, {
    dereference: true,
    filter: file => file !== paths.appHtml,
  });
}

function handleBuildPath(userBuildPath) {
  if (path.isAbsolute(userBuildPath)) {
    return userBuildPath;
  }

  return path.join(process.cwd(), userBuildPath);
}
