#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const backendDir = resolve(root, 'backend');
const prismaSchemaPath = resolve(backendDir, 'prisma', 'schema.prisma');
const generatedPrismaDir = resolve(backendDir, 'generated', 'prisma');
const isWindows = process.platform === 'win32';
const windowsShell = process.env.ComSpec || 'cmd.exe';

const quoteWindowsArg = (value) => {
  if (value.length === 0) {
    return '""';
  }

  if (!/[\s"&<>^|]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
};

const getSpawnConfig = (command, args) => {
  if (!isWindows) {
    return {
      command,
      args,
      options: { shell: false },
    };
  }

  const joined = [command, ...args].map(quoteWindowsArg).join(' ');
  return {
    command: windowsShell,
    args: ['/d', '/s', '/c', joined],
    options: {
      shell: false,
      windowsVerbatimArguments: true,
    },
  };
};

const stripWrappingQuotes = (value) => value.replace(/^['"]|['"]$/g, '').trim();

const readEnvFile = (filePath) => {
  if (!existsSync(filePath)) return {};

  const raw = readFileSync(filePath, 'utf8');
  const entries = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = stripWrappingQuotes(trimmed.slice(separatorIndex + 1));
    entries[key] = value;
  }

  return entries;
};

const parsePostgresTarget = (databaseUrl) => {
  if (!databaseUrl) return null;

  try {
    const parsed = new URL(databaseUrl);
    if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
      return null;
    }

    return {
      host: parsed.hostname || 'localhost',
      port: Number(parsed.port || '5432'),
    };
  } catch {
    return null;
  }
};

const waitForPort = ({ host, port, timeoutMs = 60_000 }) =>
  new Promise((resolvePromise, rejectPromise) => {
    const startedAt = Date.now();

    const attemptConnection = () => {
      const socket = new net.Socket();
      let finished = false;

      const retry = () => {
        if (finished) return;
        finished = true;
        socket.destroy();

        if (Date.now() - startedAt >= timeoutMs) {
          rejectPromise(new Error(`Timed out waiting for ${host}:${port}`));
          return;
        }

        setTimeout(attemptConnection, 1_000);
      };

      socket.setTimeout(1_500);
      socket.once('connect', () => {
        if (finished) return;
        finished = true;
        socket.destroy();
        resolvePromise();
      });
      socket.once('timeout', retry);
      socket.once('error', retry);
      socket.connect(port, host);
    };

    attemptConnection();
  });

const isPortAvailable = (port, host = '127.0.0.1') =>
  new Promise((resolvePromise) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolvePromise(false));
    server.once('listening', () => {
      server.close(() => resolvePromise(true));
    });
    server.listen(port, host);
  });

const findAvailablePort = async (preferredPort, { host = '127.0.0.1', attempts = 20 } = {}) => {
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidate = preferredPort + offset;
    if (await isPortAvailable(candidate, host)) {
      return candidate;
    }
  }

  throw new Error(`Could not find a free port starting at ${preferredPort}`);
};

const runCommand = (command, args, { cwd, label }) =>
  new Promise((resolvePromise, rejectPromise) => {
    const spawnConfig = getSpawnConfig(command, args);
    const child = spawn(spawnConfig.command, spawnConfig.args, {
      cwd,
      env: process.env,
      ...spawnConfig.options,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(chunk);
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(chunk);
    });

    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      const details = `${stdout}\n${stderr}`.trim();
      rejectPromise(new Error(details ? `${label} exited with code ${code ?? 'unknown'}\n${details}` : `${label} exited with code ${code ?? 'unknown'}`));
    });
  });

const cleanStalePrismaEngineTemps = () => {
  if (!existsSync(generatedPrismaDir)) {
    return;
  }

  for (const entry of readdirSync(generatedPrismaDir)) {
    if (!entry.startsWith('query_engine-windows.dll.node.tmp')) {
      continue;
    }

    try {
      rmSync(resolve(generatedPrismaDir, entry), { force: true });
    } catch {
      // Ignore leftover locked temp files; Prisma will report a real failure on generate if this matters.
    }
  }
};

const generatedClientMatchesSchema = () => {
  const generatedSchemaPath = resolve(generatedPrismaDir, 'schema.prisma');
  const generatedIndexPath = resolve(generatedPrismaDir, 'index.js');

  if (!existsSync(prismaSchemaPath) || !existsSync(generatedSchemaPath) || !existsSync(generatedIndexPath)) {
    return false;
  }

  return readFileSync(prismaSchemaPath, 'utf8') === readFileSync(generatedSchemaPath, 'utf8');
};

const isPrismaEngineRenameLockError = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  return isWindows
    && message.includes('EPERM: operation not permitted, rename')
    && message.includes('query_engine-windows.dll.node');
};

const backendEnv = readEnvFile(resolve(backendDir, '.env'));
const databaseTarget = parsePostgresTarget(process.env.DATABASE_URL || backendEnv.DATABASE_URL);

const ensureDatabaseReady = async () => {
  cleanStalePrismaEngineTemps();

  try {
    await runCommand('npx', ['prisma@6.19.2', 'generate'], {
      cwd: backendDir,
      label: 'prisma generate',
    });
  } catch (error) {
    if (!isPrismaEngineRenameLockError(error) || !generatedClientMatchesSchema()) {
      throw error;
    }

    console.warn('[dev-full] Prisma engine file is locked by another running process; reusing the existing generated client.');
  }

  if (!databaseTarget) {
    return;
  }

  const host = databaseTarget.host === '::1' ? '127.0.0.1' : databaseTarget.host;
  let databaseReady = false;

  try {
    await waitForPort({ host, port: databaseTarget.port, timeoutMs: 2_000 });
    databaseReady = true;
  } catch {
    databaseReady = false;
  }

  if (!databaseReady && host === 'localhost' && databaseTarget.port === 5434) {
    try {
      await runCommand('docker', ['compose', 'up', '-d', 'postgres'], {
        cwd: root,
        label: 'docker compose up -d postgres',
      });
      await waitForPort({ host, port: databaseTarget.port });
      databaseReady = true;
    } catch (error) {
      console.warn(`[dev-full] Local Postgres bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!databaseReady) {
    console.warn(`[dev-full] Skipping prisma db push because ${host}:${databaseTarget.port} is unavailable.`);
    return;
  }

  // Never run db push against a remote database from local dev — it would prompt
  // about data loss and potentially wipe production columns/tables.
  const isLocalDb = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!isLocalDb) {
    console.log(`[dev-full] Skipping prisma db push — database is remote (${host}). Schema is managed via manual migrations.`);
    return;
  }

  try {
    console.log('[dev-full] Synchronizing database schema...');
    const dbPushPromise = runCommand('npx', ['prisma@6.19.2', 'db', 'push', '--skip-generate'], {
      cwd: backendDir,
      label: 'prisma db push',
    });

    await Promise.race([
      dbPushPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Database sync timed out')), 15000))
    ]);

    await runCommand('node', ['scripts/ensure-cloud-sync-schema.cjs'], {
      cwd: backendDir,
      label: 'ensure cloud sync schema',
    });

    await runCommand('node', ['scripts/ensure-db-integrity.cjs'], {
      cwd: backendDir,
      label: 'ensure db integrity',
    });
  } catch (error) {
    console.warn(`[dev-full] Database synchronization skipped or failed: ${error instanceof Error ? error.message : String(error)}`);
    console.warn('[dev-full] Proceeding to start servers anyway...');
  }
};

const startLongRunningProcess = (command, args, cwd, envOverrides = {}) =>
  (() => {
    const spawnConfig = getSpawnConfig(command, args);
    return spawn(spawnConfig.command, spawnConfig.args, {
      stdio: 'inherit',
      cwd,
      env: {
        ...process.env,
        ...envOverrides,
      },
      ...spawnConfig.options,
    });
  })();

const main = async () => {
  await ensureDatabaseReady();

  const configuredBackendPort = Number(process.env.PORT || backendEnv.PORT || 3000);
  const backendPort = await findAvailablePort(configuredBackendPort);
  const backendBaseUrl = `http://localhost:${backendPort}`;

  if (backendPort !== configuredBackendPort) {
    console.warn(`[dev-full] Port ${configuredBackendPort} is in use. Starting backend on ${backendPort} instead.`);
  }

  const processes = [
    startLongRunningProcess('npm', ['run', 'dev:frontend'], root, {
      VITE_API_PROXY_TARGET: backendBaseUrl,
      VITE_SOCKET_URL: backendBaseUrl,
    }),
    startLongRunningProcess('npm', ['run', 'dev'], backendDir, {
      PORT: String(backendPort),
    }),
  ];

  let shuttingDown = false;
  let exitCode = 0;
  let closedCount = 0;

  const shutdown = (signal = 'SIGTERM') => {
    if (shuttingDown) return;
    shuttingDown = true;

    for (const proc of processes) {
      if (!proc.killed) {
        proc.kill(signal);
      }
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  processes.forEach((proc) => {
    proc.on('exit', (code) => {
      if (typeof code === 'number' && code !== 0) {
        exitCode = code;
        shutdown();
      }

      closedCount += 1;
      if (closedCount >= processes.length) {
        process.exit(exitCode);
      }
    });
  });
};

main().catch((error) => {
  console.error('[dev-full] Failed to start development stack:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
