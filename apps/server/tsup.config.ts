import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  clean: true,
  // 工作区里的 @niumadate/shared 直接以 TS 源码形式分发，没有构建产物，
  // 必须打进 bundle，否则运行时会去 require 一个不存在的 .ts。
  noExternal: ['@niumadate/shared'],
});
