# Future Scope for Mini App Factory

## New Features (Prioritized)

### 1. 🌐 Deployment & Sharing
- **One-Click Deployment**: Integrate with Vercel, Netlify, or GitHub Pages. Allow users to deploy to live directly from the dashboard.
- **Plan**: Implement OAuth for Vercel/GitHub and use their respective deployment APIs for automated site creation.

### 2. 📊 Data & Form Handling
- Provide built-in support for simple backends. For example, a contact form that sends emails or saves submissions to a Convex database without writing server-side code.
- **Plan**: Create standardized connection templates for Convex or Supabase that can be injected via AI prompts.

### 3. ⚡ Developer Experience
- **Hot Module Reloading (HMR)**: Instant preview updates using a virtual file system in the browser iframe.
- **Visual Selector**: Click an element in the preview to automatically highlight its code or target it with AI instructions.
- **Plan**: Integrate a virtual file system like `memfs` for the iframe and implement a DOM-to-code mapping strategy for the selector.

### 4. 👥 Team Collaboration
- Enable shared projects where multiple users can work on the same site fabrication.
- Real-time cursor presence and collaborative AI prompting.
- **Plan**: Implement WebSockets or Yjs (CRDTs) to synchronize state and editor sessions across multiple clients.