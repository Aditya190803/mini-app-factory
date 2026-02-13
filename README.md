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
- **AI Control Panel**: Per-user persisted AI settings (BYOK + model/provider controls)
- **Admin-Only Controls**: Global provider controls restricted to `aditya.mer@somaiya.edu`
- **Live Preview & Editor**: Interactive workspace to see and edit your sites in real-time
- **Download & Deploy**: Export as ZIP with all assets or deploy to the web
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
   - Google Gemini (`@ai-sdk/google`)
   - Groq (`@ai-sdk/groq`)
   - OpenRouter (`@openrouter/ai-sdk-provider`)
   - Cerebras (`@ai-sdk/cerebras`)
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
   GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key
   GOOGLE_MODEL=gemini-3-flash-preview
   GOOGLE_FALLBACK_MODEL=gemini-2.5-flash
   GROQ_API_KEY=your_groq_api_key
   GROQ_MODEL=moonshotai/kimi-k2-instruct-0905
   GROQ_FALLBACK_MODEL=qwen/qwen3-32b
   OPENROUTER_API_KEY=your_openrouter_api_key
   OPENROUTER_MODEL=openai/gpt-oss-120b
   OPENROUTER_FALLBACK_MODEL=optional_openrouter_fallback_model
   CEREBRAS_API_KEY=your_cerebras_api_key
   CEREBRAS_MODEL=llama-3.3-70b
   CEREBRAS_FALLBACK_MODEL=optional_cerebras_fallback_model
   
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

   # Optional Deployment Integrations
   NETLIFY_CLIENT_ID=your_netlify_oauth_client_id
   NETLIFY_CLIENT_SECRET=your_netlify_oauth_client_secret
   VERCEL_CLIENT_ID=your_vercel_oauth_client_id
   VERCEL_CLIENT_SECRET=your_vercel_oauth_client_secret

   # Integration Token Encryption
   INTEGRATION_TOKEN_SECRET=your_32+_char_secret
   ```

### One-Click Deploy

The editor includes a deploy flow that can create or reuse a GitHub repo and publish the project.

1. Configure deployment integrations in your environment.
2. Open a project in the editor and click **Deploy**.
3. Connect required accounts when prompted.
4. Choose repo ownership and visibility.
5. Redeploy from the dashboard whenever needed.

### Project Settings

Each project has a settings page at `/edit/[projectName]/settings` that centralizes deployment info and metadata/SEO.

### AI Settings & Access Control

- BYOK keys are available to any signed-in user.
- AI admin controls (provider enable/disable, provider defaults, custom models) are restricted to:
   - `aditya.mer@somaiya.edu`
- AI settings are persisted per user in Convex and synchronized through `/api/ai/settings`.
- Admin config changes are audit logged in Convex.

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

Run type checks:

```bash
bun run typecheck
```

Run lint:

```bash
bun run lint
```

Build the project:

```bash
bun run build
```
