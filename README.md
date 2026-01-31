 # Mini App Factory

A powerful AI-powered web application that generates production-ready static websites from natural language descriptions. Simply describe what you want to build, and the AI will create a complete, responsive HTML website for you.

## Features

- **Natural Language Input**: Describe your website in plain English
- **Two-Pass AI Pipeline**:
  - **Conceptualize**: AI creates a detailed design specification from your description
  - **Generate**: AI builds production-ready HTML with Tailwind CSS
- **Live Preview**: See your generated website in real-time
- **Code View**: Inspect the generated HTML code
- **Polish Pass**: Run a full polish from the code view to refine images, typography, animations, and mobile layout via the LLM
- **Download & Deploy**: Export as HTML file or deploy directly
- **Responsive Design**: All generated websites work perfectly on mobile, tablet, and desktop
- **Modern UI**: Built with Tailwind CSS v4 and shadcn/ui components

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **AI Providers**:
  - **Primary**: Cerebras SDK with `zai-glm-4.7` (requires `CEREBRAS_API_KEY`)
  - **Fallback**: Groq with `moonshotai/kimi-k2-instruct-0905` (requires `GROQ_API_KEY`)
- **Styling**: Tailwind CSS v4 with custom dark theme
- **Components**: shadcn/ui
- **Language**: TypeScript

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   bun install
   ```

3. Set up your AI providers in `.env.local`:
   
   ```bash
   # Required: Cerebras API Key (Primary Provider - zai-glm-4.7)
   CEREBRAS_API_KEY=your_cerebras_api_key
   
   # Required: Groq API Key (Fallback Provider - Moonshot Kimi K2)
   GROQ_API_KEY=your_groq_api_key
   ```
   
   See [AI_SETUP.md](AI_SETUP.md) for detailed configuration instructions.

4. Note: This project now requires `jszip` for ZIP downloads. Running `pnpm install` or `npm install` will pick it up from `package.json`.

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

### Testing

Run unit tests (Vitest):

```bash
npm test
```

## How It Works

1. **Input Your Description**: Tell the AI what kind of website you want to create
2. **AI Conceptualizes**: The AI analyzes your request and creates a detailed design specification
3. **AI Generates**: Using the specification, the AI generates complete, production-ready HTML
4. **Preview & Export**: View your website and download the HTML or deploy it

## Example Prompts

- "A modern SaaS landing page for a project management tool with hero, features, pricing, and CTA"
- "An e-commerce product page with image gallery, reviews, and add to cart button"
- "A portfolio website showcasing design work with a grid layout and case studies"

## Deployment

Deploy easily to Vercel:

```bash
npm run build
npm run start
```

Or use the Vercel CLI:

```bash
vercel deploy
```

## License

MIT
