import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-manifest',
      closeBundle() {
        // Copy manifest.json to dist
        const manifestPath = resolve(__dirname, 'dist/manifest.json');
        copyFileSync(
          resolve(__dirname, 'manifest.json'),
          manifestPath
        );
        
        // Update manifest.json to include any chunk files (they'll be loaded as modules)
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        const distDir = resolve(__dirname, 'dist');
        const files = readdirSync(distDir);
        
        // Find chunk files (files ending in .js that aren't main entry points)
        const jsChunks = files.filter((f: string) => 
          f.endsWith('.js') && 
          f !== 'content.js' && 
          f !== 'background.js' &&
          f !== 'inject.js' &&
          f !== 'brute-force-scanner.js' &&
          !f.includes('vendor') // Exclude vendor chunk (it's shared)
        );
        
        // Add chunk files to content scripts BEFORE content.js (dependencies first)
        if (jsChunks.length > 0 && manifest.content_scripts && manifest.content_scripts[0]) {
          manifest.content_scripts[0].js = [...jsChunks, 'content.js'];
          console.log(`[Vite] Added ${jsChunks.length} chunk files to manifest (before content.js):`, jsChunks);
        }
        
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

        // Copy inject.js to dist
        if (existsSync(resolve(__dirname, 'src/content/inject.js'))) {
          copyFileSync(
            resolve(__dirname, 'src/content/inject.js'),
            resolve(__dirname, 'dist/inject.js')
          );
        }
        
        // Copy brute-force-scanner.js to dist
        if (existsSync(resolve(__dirname, 'src/content/brute-force-scanner.js'))) {
          copyFileSync(
            resolve(__dirname, 'src/content/brute-force-scanner.js'),
            resolve(__dirname, 'dist/brute-force-scanner.js')
          );
        }
        
        // Copy icons if they exist
        const iconsDir = resolve(__dirname, 'public/icons');
        const distIconsDir = resolve(__dirname, 'dist/icons');
        
        if (existsSync(iconsDir)) {
          if (!existsSync(distIconsDir)) {
            mkdirSync(distIconsDir, { recursive: true });
          }
          
          // Copy icon files if they exist
          ['icon16.png', 'icon48.png', 'icon128.png', 'SERVICEITLOGO.png'].forEach(icon => {
            const iconPath = resolve(iconsDir, icon);
            if (existsSync(iconPath)) {
              copyFileSync(iconPath, resolve(distIconsDir, icon));
            }
          });
        }
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content/index.tsx'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') {
            return 'content.css';
          }
          return '[name].[ext]';
        },
        // Force all shared code into each entry file (no shared chunks)
        manualChunks: (id) => {
          // If it's a shared module, include it in both entry points
          // This prevents chunk creation by duplicating shared code
          if (id.includes('configStorage')) {
            // Return undefined to include in all entry points
            return undefined;
          }
          // Don't create chunks - bundle everything into entry files
          return undefined;
        },
        format: 'es', // Use ES modules (works for both content and background in Manifest V3)
      },
    },
    cssCodeSplit: false,
    // Disable code splitting completely
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
});

