import {defineConfig} from 'vite';
import {resolve} from 'path';

const buildTarget = process.env.BUILD_TARGET || 'core';

const builds = {
  core: {
    entry: resolve(__dirname, 'Now/core-entry.js'),
    name: 'now.core.min.js',
    css: 'now.core.min.css',
    libName: 'NowCore'
  },
  table: {
    entry: resolve(__dirname, 'Now/entry-table.js'),
    name: 'now.table.min.js',
    css: 'now.table.min.css',
    libName: 'NowTable'
  },
  media: {
    entry: resolve(__dirname, 'Now/entry-media.js'),
    name: 'now.media.min.js',
    css: 'now.media.min.css',
    libName: 'NowMedia'
  },
  graph: {
    entry: resolve(__dirname, 'Now/entry-graph.js'),
    name: 'now.graph.min.js',
    css: 'now.graph.min.css',
    libName: 'NowGraph'
  },
  tabs: {
    entry: resolve(__dirname, 'Now/entry-tabs.js'),
    name: 'now.tabs.min.js',
    css: 'now.tabs.min.css',
    libName: 'NowTabs'
  },
  sortable: {
    entry: resolve(__dirname, 'Now/entry-sortable.js'),
    name: 'now.sortable.min.js',
    css: 'now.sortable.min.css',
    libName: 'NowSortable'
  },
  storage: {
    entry: resolve(__dirname, 'Now/entry-storage.js'),
    name: 'now.storage.min.js',
    css: 'now.storage.min.css',
    libName: 'NowStorage'
  },
  serviceworker: {
    entry: resolve(__dirname, 'Now/entry-serviceworker.js'),
    name: 'now.serviceworker.min.js',
    css: 'now.serviceworker.min.css',
    libName: 'NowServiceWorker'
  },
  queue: {
    entry: resolve(__dirname, 'Now/entry-queue.js'),
    name: 'now.queue.min.js',
    css: 'now.queue.min.css',
    libName: 'NowQueue'
  }
};

const targetConfig = builds[buildTarget];

export default defineConfig({
  build: {
    emptyOutDir: buildTarget === 'core', // Only empty for core build
    lib: {
      entry: targetConfig.entry,
      name: targetConfig.libName,
      formats: ['iife'],
      fileName: () => targetConfig.name
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') {
            return targetConfig.css;
          }
          return assetInfo.name || 'asset';
        }
      }
    },
    outDir: 'Now/dist',
    sourcemap: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
        drop_debugger: false
      },
      format: {
        comments: false
      },
      keep_classnames: true,
      keep_fnames: true
    }
  }
});
