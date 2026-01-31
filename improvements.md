# Improvements for Mini App Factory

This document outlines technical and user experience improvements that can be made to the current codebase and functionality of the Mini App Factory.

## Technical Improvements

### 1. Code Modularization
- **Component Refactoring**: The `editor-workspace.tsx` and `page.tsx` files are becoming quite large. Breaking them down into smaller, focused components (e.g., `PreviewPanel`, `TransformSidebar`, `CodeEditor`, `FabricationForm`) would improve maintainability and testability.
- **Shared Logic**: Extract common API handling logic, especially the error handling for AI providers, into a dedicated hook or utility.

### 2. AI Streaming
- **Real-time Feedback**: Implement server-sent events (SSE) or streaming responses in `/api/generate` and `/api/transform`. This would allow users to see the website being built or modified in real-time, significantly improving the perceived performance.

### 3. Editor Experience
- **Advanced Editor**: Replace the current basic CodeMirror setup with a more robust editor like **Monaco Editor** (the engine behind VS Code). This would provide better syntax highlighting, indent guides, and potentially autocomplete for Tailwind CSS classes.
- **Side-by-Side View**: Allow users to choose between stacked and side-by-side views for the code and preview.

### 4. Robust Error Handling
- **Graceful Fallbacks**: Further refine the fallback mechanism between AI providers. Currently, if both Cerebras and Groq fail, the user gets a generic or technical error. Implementing a more user-friendly "System busy" or "Retry" UI would be beneficial.
- **Validation**: Improve client-side validation for project names and prompts to catch errors before sending requests to the server.

### 5. Preview Enhancements
- **Device Toggles**: Add buttons to the preview panel to quickly toggle between **Desktop**, **Tablet**, and **Mobile** viewports.
- **Refresh Mechanism**: Add a manual refresh button for the iframe in case the `srcDoc` update fails or gets stuck.

### 6. Performance Optimization
- **Asset Caching**: Cache common design patterns or conceptualization steps to speed up generation for similar prompts.
- **Iframe Sandboxing**: Audit and tighten the iframe sandbox attributes to ensure maximum security while maintaining functionality.

## UX Improvements

### 1. Version Control (Undo/Redo)
- Implement a simple history stack for the generated HTML. After a "Transform" or "Polish" pass, users should be able to undo if they don't like the AI's changes.

### 2. Onboarding Flow
- Add a "Quick Start" or interactive tutorial for new users to explain the "Fabricate -> Preview -> Transform -> Polish" workflow.

### 3. Progress Visualization
- Instead of a simple "Processing..." text, show a more detailed progress bar or step-by-step indicator (e.g., "1. Analyzing Prompt", "2. Designing Layout", "3. Generating Code").

### 4. Interactive Help
- Add tooltips or a "Help" sidebar that provides tips on how to write better prompts for the AI.
