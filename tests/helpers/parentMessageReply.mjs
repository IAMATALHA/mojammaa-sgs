import { readFileSync } from 'node:fs'
import ts from 'typescript'
const output = ts.transpileModule(readFileSync(new URL('../../src/utils/parentMessageReply.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', output)(() => ({}), module, module.exports)
export const { parentMessageReplyTarget } = module.exports
