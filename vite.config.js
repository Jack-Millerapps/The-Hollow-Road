import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  server: {
    host: true,
    port: 5173,
    open: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Split three.js (~600KB) into its own chunk so it can be cached
    // across deploys and parsed in parallel with the app code.
    rollupOptions: {
      output: {
        manualChunks: {
          three: [
            'three',
            'three/examples/jsm/postprocessing/EffectComposer.js',
            'three/examples/jsm/postprocessing/RenderPass.js',
            'three/examples/jsm/postprocessing/UnrealBloomPass.js',
            'three/examples/jsm/postprocessing/ShaderPass.js',
          ],
        },
      },
    },
  },
});
