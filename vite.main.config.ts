import { defineConfig } from 'vite'
import { builtinModules } from 'node:module'

// Bundles the Electron main + preload processes for distribution.
// electron and node builtins stay external; pure-ESM deps are inlined.
export default defineConfig({
  build: {
    ssr: true,
    outDir: 'dist-electron',
    emptyOutDir: true,
    target: 'node24',
    minify: false,
    sourcemap: false,
    rollupOptions: {
      input: {
        'main/main': 'src/main/main.ts',
        'preload/preload': 'src/preload/preload.ts',
      },
      output: {
        format: 'cjs',
        entryFileNames: '[name].cjs',
        preserveModules: true,
        preserveModulesRoot: 'src',
        exports: 'named',
      },
    },
  },
  ssr: {
    external: [
      'electron',
      'exceljs',
      'pdf-lib',
      ...builtinModules,
      ...builtinModules.map((m) => `node:${m}`),
    ],
  },
})
