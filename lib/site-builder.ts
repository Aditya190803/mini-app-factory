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
"\n\n---\nMade by [Mini App Factory](https://github.com/Aditya190803/mini-app-factory)"

Output only the Markdown content for the README.md file. No preamble or conversational filler.`;
}
