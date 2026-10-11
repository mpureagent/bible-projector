import js from '@eslint/js'
import nodePlugin from 'eslint-plugin-n'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/**', 'generated/**', 'node_modules/**', '.artifacts/**', 'release/**', '.qoder/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      // 类型层由 TS 编译器兜底，no-undef 对 TS 文件误报（document/console 等由 lib 定义）
      'no-undef': 'off',
    },
  },
  {
    files: ['src/main/**/*.ts'],
    plugins: { n: nodePlugin },
    rules: {
      // 主进程按 Node 16.17 语义编码（ADR-0001）：拦截更新版本才有的 API/语法
      'n/no-unsupported-features/node-builtins': ['error', { version: '16.17.0' }],
      'n/no-unsupported-features/es-builtins': ['error', { version: '16.17.0' }],
      'n/no-unsupported-features/es-syntax': ['error', { version: '16.17.0' }],
    },
  },
)
