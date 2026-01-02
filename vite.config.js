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
  graph: {
    entry: resolve(__dirname, 'Now/entry-graph.js'),
    name: 'now.graph.min.js',
    css: 'now.graph.min.css',
    libName: 'NowGraph'
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
  },
  eventcalendar: {
    entry: resolve(__dirname, 'Now/entry-eventcalendar.js'),
    name: 'eventcalendar.min.js',
    css: 'eventcalendar.min.css',
    libName: 'EventCalendar'
  },
  editor: {
    entry: resolve(__dirname, 'js/components/editor/entry-editor.js'),
    name: 'richtext-editor.min.js',
    css: 'richtext-editor.min.css',
    libName: 'RichTextEditor'
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
