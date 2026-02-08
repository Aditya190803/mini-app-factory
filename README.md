 # Mini App Factory

A powerful AI-powered web application that generates production-ready multi-page websites from natural language descriptions. Simply describe what you want to build, and the AI will create a complete, responsive project for you.

## Features

- **Natural Language Input**: Describe your website in plain English
- **Multi-page Architecture**: Automatically generates multiple linked pages based on description
- **Two-Pass AI Pipeline**:
  - **Conceptualize**: AI creates a detailed design specification and site map
  - **Generate**: AI builds production-ready files with Tailwind CSS v4
- **Project Dashboard**: Manage and track all your generated sites (including redeploys)
- **Authentication**: Secure access to your projects via Stack Auth
- **Live Preview & Editor**: Interactive workspace to see and edit your sites in real-time
- **Download & Deploy**: Export as ZIP with all assets or deploy to the web (Netlify default)
- **Modern UI**: Built with Tailwind CSS v4 and shadcn/ui components

## How It Works

1. **Input Your Description**: Tell the AI what kind of website you want to create.
2. **AI Conceptualizes**: The AI analyzes your request, creates a design spec, and plans the page structure.
3. **AI Generates**: The AI generates all necessary HTML, CSS (Tailwind), and assets.
4. **Manage & Edit**: Access your project from the dashboard to preview, edit, or export.

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) with App Router
- **Database & Backend**: [Convex](https://convex.dev/)
- **Authentication**: [Stack Auth](https://stack-auth.com/)
- **AI Providers**:
  - **Primary**: Cerebras SDK with `gpt-oss-120b`
  - **Fallback**: Groq with `moonshotai/kimi-k2-instruct-0905`
- **Styling**: Tailwind CSS v4
- **Components**: shadcn/ui
- **Runtime & Package Manager**: [Bun](https://bun.sh/)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed on your machine

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   bun install
   ```

3. Set up your environment variables in `.env.local` (you can start from `.env.example` or `.env.local.example`):
   
   ```bash
   # AI Providers
   CEREBRAS_API_KEY=your_cerebras_api_key
   CEREBRAS_MODEL=gpt-oss-120b
   GROQ_API_KEY=your_groq_api_key
   GROQ_MODEL=moonshotai/kimi-k2-instruct-0905
   
   # Convex
   CONVEX_DEPLOYMENT_KEY=your_convex_key # or run bun convex dev
   NEXT_PUBLIC_CONVEX_URL=your_convex_url
   
   # Stack Auth
   NEXT_PUBLIC_STACK_PROJECT_ID=your_stack_project_id
   NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY=your_stack_key
   STACK_SECRET_SERVER_KEY=your_stack_secret

   # GitHub OAuth (Deployments)
   GITHUB_CLIENT_ID=your_github_oauth_client_id
   GITHUB_CLIENT_SECRET=your_github_oauth_client_secret

   # Netlify OAuth (Deployments)
   NETLIFY_CLIENT_ID=your_netlify_oauth_client_id
   NETLIFY_CLIENT_SECRET=your_netlify_oauth_client_secret

   # Vercel OAuth (Legacy/Hidden)
   VERCEL_CLIENT_ID=your_vercel_oauth_client_id
   VERCEL_CLIENT_SECRET=your_vercel_oauth_client_secret

   # Integration Token Encryption
   INTEGRATION_TOKEN_SECRET=your_32+_char_secret
   ```

### One-Click Deploy (GitHub + Netlify)

The editor includes a Deploy flow that creates or reuses a GitHub repo and triggers a Netlify deployment (default provider).

1. Create a GitHub OAuth app and add `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.
2. Create a Netlify OAuth app and add `NETLIFY_CLIENT_ID` / `NETLIFY_CLIENT_SECRET`.
3. Open a project in the editor, click **Deploy**, connect GitHub and Netlify, then deploy.
4. Optional: choose repo visibility (public/private) and a GitHub org as the repo owner.
5. Optional: set a Netlify site name override (separate from the GitHub repo name).
6. Deploy options include GitHub + Netlify (default), GitHub repo only, and a hosted-by-us option for the fastest path to a live URL.
7. Redeploys can be triggered from the dashboard without opening the editor.

### Project Settings

Each project has a settings page at `/edit/[projectName]/settings` that centralizes deployment info, Netlify site details, and metadata/SEO.

#### How to Create OAuth Apps

GitHub OAuth App:
1. Go to GitHub Developer Settings → OAuth Apps → New OAuth App.
2. Set **Homepage URL** to your app URL (for local dev: `http://localhost:3000`).
3. Set **Authorization callback URL** to:
   ```text
   http://localhost:3000/api/integrations/github/callback
   ```
4. Copy the **Client ID** and **Client Secret** into `.env.local`.

Netlify OAuth App:
1. Go to Netlify User Settings → Applications → OAuth applications → New OAuth app.
2. Set **Redirect URL** to:
   ```text
   http://localhost:3000/api/integrations/netlify/callback
   ```
3. Copy the **Client ID** and **Client Secret** into `.env.local`.

4. Initialize Convex:
   ```bash
   bun convex dev
   ```

### Development

Run the development server:

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

### Testing

Run unit tests (Vitest):

```bash
bun test
```

Build the project:

```bash
bun run build
```
