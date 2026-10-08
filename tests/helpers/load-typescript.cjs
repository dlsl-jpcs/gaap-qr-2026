/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');

function makeLoader(overrides = {}) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const loaded = new Module(filename, module);
    loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    cache.set(filename, loaded);
    loaded.require = function (request) {
      if (request === 'server-only') return {};
      if (Object.hasOwn(overrides, request)) return overrides[request];
      if (request.startsWith('@/')) return load(request.slice(2) + '.ts');
      if (request.startsWith('.') && fs.existsSync(path.resolve(path.dirname(filename), request + '.ts'))) return load(path.resolve(path.dirname(filename), request + '.ts'));
      return Module.prototype.require.call(this, request);
    };
    loaded._compile(compiled, filename);
    return loaded.exports;
  }
  return load;
}
module.exports = { makeLoader, root };
