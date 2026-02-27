import * as fs from 'fs/promises';
import * as path from 'path';

export type Framework = 'next' | 'vite-react' | 'svelte';

export async function ensureFrameworkFiles(outputDir: string, framework?: Framework) {
  if (!framework) return;

  if (framework === 'vite-react') {
    await fs.writeFile(path.join(outputDir, 'package.json'), VITE_REACT_PACKAGE_JSON.trim(), 'utf8');
    await fs.mkdir(path.join(outputDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(outputDir, 'src', 'main.jsx'), VITE_MAIN_JSX.trim(), 'utf8');
    await fs.writeFile(path.join(outputDir, 'index.html'), VITE_INDEX_HTML.trim(), 'utf8');
    await fs.writeFile(path.join(outputDir, 'vite.config.ts'), VITE_CONFIG.trim(), 'utf8');
  }

  if (framework === 'next') {
    await fs.writeFile(path.join(outputDir, 'package.json'), NEXT_PACKAGE_JSON.trim(), 'utf8');
    await fs.mkdir(path.join(outputDir, 'app'), { recursive: true });
    await fs.writeFile(path.join(outputDir, 'app', 'page.tsx'), NEXT_APP_PAGE.trim(), 'utf8');
    await fs.writeFile(path.join(outputDir, 'next.config.mjs'), NEXT_CONFIG.trim(), 'utf8');
    await fs.writeFile(path.join(outputDir, 'tsconfig.json'), NEXT_TSCONFIG.trim(), 'utf8');
  }

  if (framework === 'svelte') {
    await fs.writeFile(path.join(outputDir, 'package.json'), SVELTE_PACKAGE_JSON.trim(), 'utf8');
    await fs.mkdir(path.join(outputDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(outputDir, 'src', 'main.js'), SVELTE_MAIN.trim(), 'utf8');
    await fs.writeFile(path.join(outputDir, 'index.html'), SVELTE_INDEX.trim(), 'utf8');
    await fs.writeFile(path.join(outputDir, 'svelte.config.js'), SVELTE_CONFIG.trim(), 'utf8');
  }
}

const VITE_REACT_PACKAGE_JSON = `{
  "name": "generated-vite-react",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.0.0"
  }
}`;

const VITE_INDEX_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`;

const VITE_MAIN_JSX = `import React from 'react'
import { createRoot } from 'react-dom/client'

function App(){
  return <div style={{padding:20,fontFamily:'sans-serif'}}>Hello from generated Vite+React app</div>
}

createRoot(document.getElementById('root')).render(<App />)
`;

const VITE_CONFIG = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()]
})`;

const NEXT_PACKAGE_JSON = `{
  "name": "generated-next",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}`;

const NEXT_APP_PAGE = `export default function Page(){
  return (
    <main style={{padding:24,fontFamily:'Inter, system-ui'}}>
      <h1>Generated Next.js App</h1>
      <p>This is a minimal generated Next.js page.</p>
    </main>
  )
}
`;

const NEXT_CONFIG = `export default {
  reactStrictMode: true,
}
`;

const NEXT_TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "jsx": "react-jsx",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true
  }
}`;

const SVELTE_PACKAGE_JSON = `{
  "name": "generated-svelte",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "svelte": "^4.0.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@sveltejs/vite-plugin-svelte": "^3.0.0"
  }
}`;

const SVELTE_MAIN = `import App from './App.svelte'

const app = new App({ target: document.body })

export default app
`;

const SVELTE_INDEX = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Svelte App</title>
  </head>
  <body></body>
  <script type="module" src="/src/main.js"></script>
</html>`;

const SVELTE_CONFIG = `import { svelte } from '@sveltejs/vite-plugin-svelte'
export default { plugins: [svelte()] }
`;
