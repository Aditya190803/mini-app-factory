import { exec as _exec } from 'child_process';
import * as util from 'util';
import * as path from 'path';
import { BuildJob } from './site-builder';

const exec = util.promisify(_exec);

export async function installAndBuild(outputDir: string, jobId: string, job?: BuildJob, packageManager: 'npm' | 'pnpm' | 'yarn' = 'npm', timeoutMs = 300000): Promise<string | undefined> {
  const pmInstall = packageManager === 'pnpm' ? 'pnpm install --frozen-lockfile' : packageManager === 'yarn' ? 'yarn install --frozen-lockfile' : 'npm ci';
  const buildCmd = packageManager === 'yarn' ? 'yarn build' : packageManager === 'pnpm' ? 'pnpm build' : 'npm run build';

  try {
    job?.addLog(`Running install: ${pmInstall}`);
    await exec(pmInstall, { cwd: outputDir, timeout: timeoutMs });
    job?.addLog('Install finished');

    job?.addLog(`Running build: ${buildCmd}`);
    await exec(buildCmd, { cwd: outputDir, timeout: timeoutMs });
    job?.addLog('Build finished');

    return undefined;
  } catch (err:any) {
    const msg = err?.message || String(err);
    job?.addLog(`Install/Build failed: ${msg}`);
    job!.error = msg;
    return undefined;
  }
}

export async function deployToVercel(outputDir: string, jobId: string, job?: BuildJob): Promise<string | undefined> {
  try {
    job?.addLog('Deploying to Vercel via CLI');
    await exec('vercel --prod --confirm', { cwd: outputDir, timeout: 5 * 60 * 1000 });
    job?.addLog('Vercel deploy command finished (check CLI output for URL)');
    // We don't try to parse URL here; recommend CI or user to run CLI interactively.
    return undefined;
  } catch (err:any) {
    job?.addLog(`Vercel deploy failed: ${err?.message || String(err)}`);
    return undefined;
  }
}
