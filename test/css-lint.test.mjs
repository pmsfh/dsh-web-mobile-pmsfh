// CSS 语法防线：app.css 不在任何工具的解析范围内，改动出一处缺陷（漏分号、
// 属性名或单位拼写错、同块重复属性、无效色值）不会让任何检查挂红，只会在
// 页面静默失效。这里用 stylelint 的错误类规则校验，只抓缺陷不裁风格，规则
// 集内嵌本文件。
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import stylelint from 'stylelint'

const root = fileURLToPath(new URL('..', import.meta.url))

test('app.css has no stylelint error-rule violations', async () => {
  const result = await stylelint.lint({
    files: [path.join(root, 'mobile/app.css')],
    config: {
      rules: {
        'block-no-empty': true,
        'comment-no-empty': true,
        'color-no-invalid-hex': true,
        'declaration-block-no-duplicate-properties': [
          true,
          { ignore: ['consecutive-duplicates-with-different-values'] },
        ],
        'declaration-block-no-shorthand-property-overrides': true,
        'function-no-unknown': [true, { ignoreFunctions: ['var'] }],
        'keyframe-declaration-no-important': true,
        'media-feature-name-no-unknown': true,
        'property-no-unknown': true,
        'selector-pseudo-class-no-unknown': true,
        'selector-pseudo-element-no-unknown': true,
        'string-no-newline': true,
        'unit-no-unknown': true,
      },
    },
  })
  const problems = result.results.flatMap((r) => r.warnings.map(
    (w) => `${w.line}:${w.column} ${w.text} (${w.rule})`,
  ))
  assert.deepEqual(problems, [], `app.css stylelint errors:\n${problems.join('\n')}`)
})
