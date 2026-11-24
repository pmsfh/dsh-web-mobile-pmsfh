// 语法防线：vendor 压缩件不在 tsc 覆盖范围内，app.js 虽会被 tsc 解析，
// npm test 此前也从未完整解析过这些随包脚本。这里仅编译不执行，让语法
// 错误在 npm test 与 CI 即挂红，而不是部署后才暴露。
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

const files = [
  'mobile/app.js',
  ...fs.readdirSync(path.join(root, 'mobile', 'vendor'))
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => `mobile/vendor/${name}`),
]

for (const rel of files) {
  test(`compiles without syntax errors: ${rel}`, () => {
    const source = fs.readFileSync(path.join(root, rel), 'utf8')
    // 只解析不运行，浏览器侧代码在此环境中不执行任何逻辑
    new vm.Script(source, { filename: rel })
  })
}
