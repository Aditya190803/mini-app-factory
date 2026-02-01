import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getAIClient, SessionEvent } from './ai-client';

export enum BuildStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export class BuildJob {
  jobId: string;
  description: string;
  status: BuildStatus = BuildStatus.PENDING;
  progress = 0;
  message = '';
  outputDir?: string;
  siteUrl?: string;
  error?: string;
  createdAt: string = new Date().toISOString();
  updatedAt: string = new Date().toISOString();
  logs: string[] = [];

  constructor(jobId: string, description: string) {
    this.jobId = jobId;
    this.description = description;
  }

  addLog(message: string) {
    const ts = new Date().toISOString();
    this.logs.push(`[${ts}] ${message}`);
    this.message = message;
    this.updatedAt = new Date().toISOString();
  }
}

const _jobs: Record<string, BuildJob> = {};

export function getJob(jobId: string): BuildJob | undefined {
  return _jobs[jobId];
}

export function saveJob(job: BuildJob) {
  _jobs[job.jobId] = job;
}

export function createJob(jobId: string, description: string): BuildJob {
  const job = new BuildJob(jobId, description);
  job.addLog(`Job ${jobId} created`);
  saveJob(job);
  return job;
}

const MODEL = process.env.CEREBRAS_MODEL || 'zai-glm-4.7';

export function buildMainPrompt(description: string): string {
  return `Create a complete, production-ready multi-page site for: ${description}

Output each file in a separate fenced code block with the language and path:

${'```'}html:index.html
[index page content]
${'```'}

${'```'}css:styles.css
[global styles]
${'```'}

${'```'}html:about.html
[about page content]
${'```'}

Recommended structure:
- index.html (Main page)
- styles.css (Extracted styles)
- script.js (Extracted scripts)
- partials/header.html (Reusable header)
- partials/footer.html (Reusable footer)

You can use <!-- include:partials/header.html --> to include fragments.

## 2026 Design Requirements

**Typography** (pick ONE distinctive pairing from Google Fonts):
- Display: Playfair Display, Cormorant Garamond, Fraunces, Libre Baskerville, DM Serif Display, or Instrument Serif
- Body: Source Sans 3, Karla, Work Sans, Manrope, or Outfit
- Use large, bold headlines (clamp(2.5rem, 5vw, 4.5rem))
- Headlines should sound natural, not clever or marketing-speak

**Color & Theme** (commit to ONE aesthetic):
- Dark moody: Deep charcoal (#1a1a1a to #2d2d2d) with warm amber (#e8934c) or copper accents
- Light editorial: Off-white (#faf9f6) with deep navy (#1a2332) and gold details
- Warm organic: Cream (#f5f0e8) with terracotta (#c4673d) and forest (#2d4a3e)
- Bold modern: Near-black with electric accents (cyan #00d9ff, magenta #ff006e, or lime #b5ff00)
Pick one. Execute it fully. No timid, evenly-distributed palettes.

**Layout**:
- Hero section with ONE clear message and ONE call-to-action
- Strategic negative space (don't fill every pixel)
- Asymmetric grid or intentional overlap for visual interest
- Mobile-first: thumb-friendly buttons, readable on small screens

**Images** (CRITICAL - use REAL photos, never emojis):
- Use Picsum with seed for themed images: https://picsum.photos/seed/coffee/800/600 (change "coffee" to relevant keyword)
- For variety, increment the seed: seed/coffee1, seed/coffee2, seed/coffee3
- Example hero: https://picsum.photos/seed/hero/1200/800
- Example feature images: https://picsum.photos/seed/feature1/600/400, seed/feature2/600/400
- Every image needs descriptive alt text
- Use object-fit: cover for consistent sizing
- NEVER use source.unsplash.com (deprecated and broken!)

**Motion & Polish**:
- Page load: fade-in with staggered delays (animation-delay: 0.1s, 0.2s, etc.)
- Hover states: subtle transforms, color shifts, or underline reveals
- Keep it minimal and meaningful - one orchestrated entrance beats scattered effects

**Accessibility**:
- Proper heading hierarchy (h1 → h2 → h3)
- Color contrast ratio 4.5:1 minimum
- Focus states for keyboard navigation
- All images have alt text

**What to AVOID** (AI red flags):
- Generic fonts: Inter, Roboto, Arial, system-ui
- Purple gradient on white background
- Emojis as image/icon placeholders
- Buzzwords without specifics ("revolutionary", "cutting-edge", "seamless")
- Cookie-cutter layouts with no personality
- Walls of text with identical paragraph lengths

## Structure
Include in one HTML file with inline <style>:
- Navigation (minimal - logo + 2-3 links max)
- Hero section (headline, subhead, CTA button)
- 2-3 content sections showcasing value
- Footer with contact/social

Output the complete, working HTML file now.`;
}

export function buildPolishPrompt(description: string): string {
  return `Review and enhance the index.html file for: ${description}

Check and fix if needed:

1. **Images**: Ensure ALL images use Picsum URLs (NOT source.unsplash.com which is broken!)
   - Example: <img src="https://picsum.photos/seed/relevant/800/600" alt="descriptive text">
   - For variety use different seeds: seed/image1, seed/image2, seed/image3

2. **Typography**: Verify Google Fonts are loaded and applied correctly

3. **Mobile**: Test that layout works on small screens (use media queries if missing)

4. **Animations**: Add subtle entrance animations if missing:
   - @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
   - Apply with animation: fadeIn 0.6s ease-out forwards;

5. **Polish**: Smooth hover transitions (transition: all 0.3s ease)

Output the enhanced file:

${'```'}html:index.html
[complete enhanced HTML]
${'```'}

When done, output: <promise>COMPLETE</promise>`;
}

export function buildReadmePrompt(projectName: string, description: string, files: string[]): string {
  return `Create a high-quality, professional README.md file for the project: "${projectName}".

Context:
This project was generated based on the following prompt: "${description}"

Included files:
${files.map(f => `- ${f}`).join('\n')}

The README should include:
1. A clear project title.
2. A compelling project description based on the prompt.
3. Features list (infer from the prompt and files).
4. Project structure overview.
5. How to preview (open index.html in a browser).

Final line requirement:
The very last line of the README must be exactly:
"Made by Mini App Factory and the github repo link https://github.com/Aditya190803/mini-app-factory"

Output only the Markdown content for the README.md file. No preamble or conversational filler.`;
}

export async function parseAndSaveCodeBlocks(output: string, outputDir: string): Promise<string[]> {
  const saved: string[] = [];

  // Pattern: ```language:filename\ncontent\n```
  const blockRe = /```(\w+):([^\n`]+)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(output))) {
    const filename = m[2].trim();
    if (filename.includes('..') || path.isAbsolute(filename)) continue;
    const content = m[3];
    const filePath = path.join(outputDir, filename);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content.trim(), 'utf8');
    saved.push(filename);
  }

  // Fallback: plain ```html
  if (!saved.includes('index.html')) {
    const htmlRe = /```html\n([\s\S]*?)```/g;
    let last: RegExpExecArray | null = null;
    while ((m = htmlRe.exec(output))) last = m;
    if (last) {
      const content = last[1];
      const filePath = path.join(outputDir, 'index.html');
      await fs.writeFile(filePath, content.trim(), 'utf8');
      saved.push('index.html');
    }
  }

  return saved;
}

export function generateFallbackHtml(description: string, jobId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Site ${jobId}</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Source Sans 3', sans-serif;
            background: #1a1a1a;
            color: #f5f5f5;
            line-height: 1.6;
        }
        .hero {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            padding: 2rem;
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
        }
        h1 {
            font-family: 'DM Serif Display', serif;
            font-size: clamp(2.5rem, 5vw, 4rem);
            margin-bottom: 1rem;
            color: #e8934c;
        }
        p {
            max-width: 600px;
            margin-bottom: 2rem;
            opacity: 0.9;
        }
        .cta {
            display: inline-block;
            padding: 1rem 2.5rem;
            background: #e8934c;
            color: #1a1a1a;
            text-decoration: none;
            font-weight: 600;
            border-radius: 4px;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .cta:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(232, 147, 76, 0.3);
        }
    </style>
</head>
<body>
    <section class="hero">
        <h1>Welcome</h1>
        <p>${escapeHtml(description)}</p>
        <a href="#" class="cta">Get Started</a>
    </section>
</body>
</html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

export async function runAISession(prompt: string, outputDir: string, job?: BuildJob, timeout = 300000): Promise<{ success: boolean; output: string }> {
  const client = await getAIClient();
  const session = await client.createSession({ model: MODEL });
  try {
    let sessionError: Error | null = null;
    const outputs: string[] = [];

    const unsubscribe = session.on((event: SessionEvent) => {
      if (event.type === 'session.error') {
        sessionError = new Error(event.data?.message || 'session error');
        job?.addLog(`Session error: ${event.data?.message}`);
      }
      if (event.type === 'assistant.message') {
        outputs.push(event.data?.content || '');
      }
    });

    try {
      const sendPromise = session.sendAndWait({ prompt }, timeout);
      const resp = await sendPromise;
      if (resp?.data?.content) outputs.push(resp.data.content);
    } finally {
      unsubscribe();
    }

    const output = outputs.join('\n');
    const saved = await parseAndSaveCodeBlocks(output, outputDir);
    if (saved.length > 0) job?.addLog(`Saved: ${saved.join(', ')}`);

    return { success: !sessionError, output };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: msg };
  } finally {
    await session.destroy().catch(() => { });
  }
}

export async function buildSite(
  jobId: string,
  description: string,
  deployFunc?: (outputDir: string, jobId: string) => Promise<string | undefined>,
  onProgress?: (percent: number, message: string) => void,
  enablePolishPass = true
): Promise<BuildJob> {
  let job = getJob(jobId);
  if (!job) {
    job = createJob(jobId, description);
  }

  job.status = BuildStatus.RUNNING;
  job.addLog(`Starting build for ${jobId}`);
  saveJob(job);

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `ai-build-${jobId}-`));
  job.outputDir = tmp;
  job.addLog(`Created output directory: ${tmp}`);

  const updateProgress = (percent: number, message: string) => {
    job!.progress = percent;
    job!.addLog(message);
    saveJob(job!);
    if (onProgress) onProgress(percent, message);
  };

  try {
    updateProgress(10, 'Generating site...');
    const mainPrompt = buildMainPrompt(description);
    await fs.writeFile(path.join(tmp, '.prompt.md'), mainPrompt, 'utf8');

    const mainResult = await runAISession(mainPrompt, tmp, job);
    if (!mainResult.success) job.addLog(`Main generation failed: ${mainResult.output.slice(0, 200)}`);

    if (enablePolishPass && (await fileExists(path.join(tmp, 'index.html')))) {
      updateProgress(60, 'Polishing site...');
      const polishPrompt = buildPolishPrompt(description);
      await runAISession(polishPrompt, tmp, job, 120000);
    }

    if (!(await fileExists(path.join(tmp, 'index.html')))) {
      updateProgress(85, 'Creating fallback...');
      await fs.writeFile(path.join(tmp, 'index.html'), generateFallbackHtml(description, jobId), 'utf8');
    }

    updateProgress(90, 'Deploying...');

    if (deployFunc) {
      try {
        const siteUrl = await deployFunc(tmp, jobId);
        if (siteUrl) {
          job.siteUrl = siteUrl;
          updateProgress(100, `Deployed to ${siteUrl}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        job.addLog(`Deploy failed: ${msg}`);
        job.error = msg;
      }
    } else {
      updateProgress(100, 'Build complete');
    }

    job.status = BuildStatus.COMPLETED;
    job.addLog('Build completed successfully');
    saveJob(job);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    job.status = BuildStatus.FAILED;
    job.error = msg;
    job.addLog(`Build failed: ${msg}`);
    saveJob(job);
  }

  return job;
}

async function fileExists(fp: string) {
  try {
    await fs.access(fp);
    return true;
  } catch {
    return false;
  }
}
