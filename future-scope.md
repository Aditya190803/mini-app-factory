# Future Scope for Mini App Factory

This document outlines ambitious new features and directions for the Mini App Factory to evolve into a full-fledged low-code/no-code fabrication engine.

## New Features

### 1. Multi-Page Project Support
- Move beyond single-page static sites. Allow users to describe a multi-page site (e.g., "Home", "About", "Pricing", "Contact").
- Implement internal linking logic so the AI can automatically connect these pages.

### 2. One-Click Deployment
- Integrate with Vercel, Netlify, or GitHub Pages.
- Allow users to deploy their generated site to a live URL (e.g., `project-name.miniappfactory.com` or a custom domain) directly from the dashboard.

### 3. Advanced Component Library
- Create a library of pre-built, AI-optimized interactive components (e.g., carousels, modals, tabbed interfaces, contact forms).
- Allow users to "drag and drop" these or specifically ask the AI to include them.

### 4. Data & Form Handling
- Provide built-in support for simple backends. For example, a contact form that actually sends emails or saves submissions to a Convex database without the user writing any server-side code.

### 5. Team Collaboration
- Enable shared projects where multiple users can work on the same site fabrication.
- Real-time cursor presence and collaborative AI prompting.

### 6. AI-Powered SEO & Accessibility
- Automatically generate optimized meta tags, JSON-LD structured data, and Open Graph images.
- Ensure all generated sites follow WCAG accessibility guidelines with proper semantic HTML and ARIA labels.

### 7. Visual CSS Editor
- A hybrid mode where users can use a visual sidebar to tweak colors, fonts, and spacing (like a "light" version of Webflow) which then updates the code.

### 8. Design-to-Code (Figma/Screenshot)
- Allow users to upload a screenshot or a Figma link. Use a Vision model (like GPT-4o or Gemini Flash) to analyze the design and fabricate the matching HTML/Tailwind code.

## Long-term Vision
The goal is to transform Mini App Factory into a **Living Web Engine**—where websites are not static files, but dynamic entities that can be continuously evolved through natural language conversation.
