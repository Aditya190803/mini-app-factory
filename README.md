 # Mini App Factory

A powerful AI-powered web application that generates production-ready multi-page websites from natural language descriptions. Simply describe what you want to build, and the AI will create a complete, responsive project for you.

## Features

- **Natural Language Input**: Describe your website in plain English
- **Multi-page Architecture**: Automatically generates multiple linked pages based on description
- **Two-Pass AI Pipeline**:
  - **Conceptualize**: AI creates a detailed design specification and site map
  - **Generate**: AI builds production-ready files with Tailwind CSS v4
- **Project Dashboard**: Manage and track all your generated sites
- **Authentication**: Secure access to your projects via Stack Auth
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
  - **Primary**: Cerebras SDK with `zai-glm-4.7`
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

3. Set up your environment variables in `.env.local`:
   
   ```bash
   # AI Providers
   CEREBRAS_API_KEY=your_cerebras_api_key
   CEREBRAS_MODEL=zai-glm-4.7
   GROQ_API_KEY=your_groq_api_key
   GROQ_MODEL=moonshotai/kimi-k2-instruct-0905
   
   # Convex
   CONVEX_DEPLOYMENT_KEY=your_convex_key # or run bun convex dev
   NEXT_PUBLIC_CONVEX_URL=your_convex_url
   
   # Stack Auth
   NEXT_PUBLIC_STACK_PROJECT_ID=your_stack_project_id
   NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY=your_stack_key
   STACK_SECRET_SERVER_KEY=your_stack_secret
   ```

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
