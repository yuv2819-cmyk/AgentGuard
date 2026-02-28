import path from 'node:path';
import process from 'node:process';
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const databaseRootDir = path.join(rootDir, '.embedded-postgres');
const dbPortStart = Number(process.env.LOCAL_DB_PORT_START || 55432);
const apiPortStart = Number(process.env.LOCAL_API_PORT_START || 4000);
const webPortStart = Number(process.env.LOCAL_WEB_PORT_START || 3000);
const dbName = 'agentguard';
const dbUser = 'postgres';
const dbPassword = 'postgres';
const npmCmd = 'npm';

const cleanStaleDatabaseDirs = async () => {
  await mkdir(databaseRootDir, { recursive: true });
  const entries = await readdir(databaseRootDir, { withFileTypes: true });
  const staleDirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('data-run-'))
    .map((entry) => path.join(databaseRootDir, entry.name));

  await Promise.all(
    staleDirs.map(async (dir) => {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        // Ignore stale directory cleanup failures.
      }
    }),
  );
};

const findFreePort = async (startPort) => {
  let port = startPort;
  while (port < startPort + 100) {
    const isAvailable = await new Promise((resolve) => {
      const server = net.createServer();
      server.unref();
      server.on('error', () => resolve(false));
      server.listen(port, () => {
        server.close(() => resolve(true));
      });
    });

    if (isAvailable) {
      return port;
    }

    port += 1;
  }

  throw new Error(`Unable to find free port between ${startPort} and ${startPort + 99}.`);
};

const escapeArg = (value) => {
  if (!value.includes(' ') && !value.includes('"')) {
    return value;
  }
  return `"${value.replace(/"/g, '\\"')}"`;
};

const toCommandString = (command, args) => [command, ...args].map(escapeArg).join(' ');

const runCommand = (command, args, env, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(toCommandString(command, args), {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true,
      env,
      ...options,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`));
      }
    });

    child.on('error', reject);
  });

const startLongRunning = (label, command, args, env) => {
  const child = spawn(toCommandString(command, args), {
    cwd: rootDir,
    shell: true,
    env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${label}] ${chunk.toString()}`);
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${label}] ${chunk.toString()}`);
  });

  child.on('exit', (code) => {
    process.stderr.write(`[${label}] exited with code ${code}\n`);
  });

  return child;
};

const main = async () => {
  await cleanStaleDatabaseDirs();

  const databaseDir = await mkdtemp(path.join(databaseRootDir, 'data-run-'));
  const dbPort = await findFreePort(dbPortStart);
  const apiPort = await findFreePort(apiPortStart);
  const webPort = await findFreePort(webPortStart);

  const sharedEnv = {
    ...process.env,
    DATABASE_URL: `postgresql://${dbUser}:${dbPassword}@127.0.0.1:${dbPort}/${dbName}`,
    JWT_SECRET: process.env.JWT_SECRET || 'dev_jwt_secret_replace_this_value_123456',
    AGENT_KEY_SALT: process.env.AGENT_KEY_SALT || 'dev_agent_salt_replace_this_value',
    APPROVAL_SIGNING_SECRET:
      process.env.APPROVAL_SIGNING_SECRET || 'dev_approval_signing_secret_replace_this_value',
    CORS_ORIGIN: process.env.CORS_ORIGIN || `http://localhost:${webPort}`,
    PORT: String(apiPort),
    DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
    DEPLOY_REGION: process.env.DEPLOY_REGION || 'local-dev',
    PRIVATE_DEPLOYMENT_MODE: process.env.PRIVATE_DEPLOYMENT_MODE || 'false',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || `http://localhost:${apiPort}/v1`,
  };

  const pg = new EmbeddedPostgres({
    databaseDir,
    user: dbUser,
    password: dbPassword,
    port: dbPort,
    persistent: false,
    initdbFlags: ['--encoding=UTF8'],
    onLog: (message) => process.stdout.write(`[db] ${String(message)}\n`),
    onError: (message) => process.stderr.write(`[db] ${String(message)}\n`),
  });

  const cleanups = [];

  try {
    try {
      await pg.initialise();
    } catch (error) {
      process.stdout.write(`[db] initialise skipped: ${String(error)}\n`);
    }

    await pg.start();

    try {
      await pg.createDatabase(dbName);
      process.stdout.write(`[db] created database: ${dbName}\n`);
    } catch {
      process.stdout.write(`[db] database exists: ${dbName}\n`);
    }

    await runCommand(npmCmd, ['run', 'db:generate'], sharedEnv);
    await runCommand(npmCmd, ['run', 'db:migrate'], sharedEnv);
    await runCommand(npmCmd, ['run', 'db:seed'], sharedEnv);

    const api = startLongRunning('api', npmCmd, ['run', 'dev:api'], sharedEnv);
    const web = startLongRunning(
      'web',
      npmCmd,
      ['run', 'dev', '--workspace', '@agentguard/web', '--', '-p', String(webPort)],
      sharedEnv,
    );

    cleanups.push(async () => {
      if (api.exitCode === null && !api.killed) {
        api.kill('SIGINT');
      }
    });

    cleanups.push(async () => {
      if (web.exitCode === null && !web.killed) {
        web.kill('SIGINT');
      }
    });

    cleanups.push(async () => {
      await pg.stop();
    });

    process.stdout.write('\nAgentGuard local stack is running:\n');
    process.stdout.write(`  Web: http://localhost:${webPort}\n`);
    process.stdout.write(`  API: http://localhost:${apiPort}/v1\n\n`);
    process.stdout.write(`  DB: postgresql://${dbUser}:***@127.0.0.1:${dbPort}/${dbName}\n\n`);

    const shutdown = async () => {
      for (const cleanup of cleanups.reverse()) {
        try {
          await cleanup();
        } catch {
          // Ignore cleanup failures during shutdown.
        }
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    await new Promise(() => {
      // Keep process alive while child processes run.
    });
  } catch (error) {
    process.stderr.write(`Startup failed: ${String(error)}\n`);
    try {
      await pg.stop();
    } catch {
      // Ignore stop failure.
    }
    try {
      if (databaseDir.startsWith(path.join(rootDir, '.embedded-postgres'))) {
        await rm(databaseDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup failures after startup errors.
    }
    process.exit(1);
  }
};

main();
