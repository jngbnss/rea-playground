import { defineConfig } from 'vite';

// 상대 경로 base: 정적 호스팅(file://, GitHub Pages 하위 경로) 어디서든 그대로 열리도록.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    // three.js 단일 번들이 500 kB 를 넘는 건 정상이라 경고 기준만 올린다.
    chunkSizeWarningLimit: 900,
  },
});
