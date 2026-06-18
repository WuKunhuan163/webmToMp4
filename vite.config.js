import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // 这一行极其重要！保证 Vercel 根目录和 GitHub Pages 子目录都能完美工作
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
  }
});