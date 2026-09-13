import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const WEB_PORT = 43000;
const WORKER_PORT = 43001;
const POSTGRES_PORT = 43002;
const DESKTOP_AUTH_SECRET = 'healthmanager-desktop-auth-secret-v1-9d5b1c7e3a4f';

// Keep the established data directory while the internal package name evolves.
// This preserves existing local accounts, sessions, and health records.
app.setPath('userData', path.join(app.getPath('appData'), '@openvitals', 'desktop'));

let services: ChildProcess[] = [];
let postgresDataDir = '';
let postgresCtl = '';

function createApplicationMenu() {
  const focusedWindow = () => BrowserWindow.getFocusedWindow();
  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { role: 'close', label: '关闭窗口' },
        { type: 'separator' },
        { role: 'quit', label: '退出 HealthManager++' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: '刷新', accelerator: 'Ctrl+R', click: () => focusedWindow()?.reload() },
        { label: '强制刷新', accelerator: 'Ctrl+Shift+R', click: () => focusedWindow()?.webContents.reloadIgnoringCache() },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { label: '开发者工具', accelerator: 'Ctrl+Shift+I', click: () => focusedWindow()?.webContents.toggleDevTools() },
      ],
    },
    {
      label: 'Window',
      submenu: [
        {
          label: '软件更新',
          click: () => void shell.openExternal('https://github.com/sonemeng/healthmanager/releases'),
        },
        {
          label: '关于 HealthManager++',
          click: () => void dialog.showMessageBox({
            type: 'info',
            title: '关于 HealthManager++',
            message: `HealthManager++ ${app.getVersion()}`,
            detail: '本地优先的家庭健康档案管理工具。健康数据保存在此设备上。',
          }),
        },
        { type: 'separator' },
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '关闭窗口' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: '发布说明', click: () => void shell.openExternal('https://github.com/sonemeng/healthmanager/releases') },
        { label: '项目主页', click: () => void shell.openExternal('https://github.com/sonemeng/healthmanager') },
      ],
    },
  ]);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

function runtimePath(...parts: string[]) {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app', ...parts)
    : path.join(app.getAppPath(), '..', '..', 'desktop-runtime', 'app', ...parts);
}

function postgresPath(...parts: string[]) {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'postgres', ...parts)
    : path.join(app.getAppPath(), '..', '..', 'desktop-runtime', 'postgres', ...parts);
}

ipcMain.handle('healthmanager:export-pdf', async (_event, requestedFilename: string) => {
  const window = BrowserWindow.getFocusedWindow();
  if (!window) return { cancelled: true };
  const baseName = path.basename(requestedFilename).replace(/[^\w.\-\u4e00-\u9fff]/g, '-');
  const defaultPath = path.join(app.getPath('downloads'), baseName.endsWith('.pdf') ? baseName : `${baseName}.pdf`);
  const result = await dialog.showSaveDialog(window, {
    title: '导出健康报告 PDF',
    defaultPath,
    filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return { cancelled: true };
  const pdf = await window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  await writeFile(result.filePath, pdf);
  return { cancelled: false, filePath: result.filePath };
});

async function requireRuntimeFile(file: string) {
  try {
    await access(file);
  } catch {
    throw new Error(`缺少桌面运行时文件：${file}`);
  }
}

function startService(command: string, args: string[], env: NodeJS.ProcessEnv, cwd?: string) {
  const child = spawn(command, args, {
    env,
    cwd,
    stdio: 'pipe',
    windowsHide: true,
  });
  child.stderr.on('data', (data) => console.error(`[desktop service] ${data}`));
  services.push(child);
  return child;
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: 'pipe', windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (data) => (stderr += data.toString()));
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} failed (${code}): ${stderr.trim()}`));
    });
  });
}

async function waitFor(url: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`本地服务启动超时：${url}`);
}

async function startLocalServices() {
  const dataDir = path.join(app.getPath('userData'), 'data');
  const blobsDir = path.join(dataDir, 'blobs');
  postgresDataDir = path.join(dataDir, 'postgres');
  const statePath = path.join(dataDir, 'desktop-state.json');
  await Promise.all([mkdir(blobsDir, { recursive: true }), mkdir(postgresDataDir, { recursive: true })]);

  postgresCtl = postgresPath('bin', 'pg_ctl.exe');
  const initdb = postgresPath('bin', 'initdb.exe');
  const pgIsReady = postgresPath('bin', 'pg_isready.exe');
  const createdb = postgresPath('bin', 'createdb.exe');
  const psql = postgresPath('bin', 'psql.exe');
  const postgresBinDir = postgresPath('bin');
  const postgresLibDir = postgresPath('lib');
  const webDir = runtimePath('web');
  const webServer = path.join(webDir, 'apps', 'web', 'server.js');
  const workerServer = runtimePath('worker', 'server.js');
  await Promise.all([
    requireRuntimeFile(postgresCtl),
    requireRuntimeFile(initdb),
    requireRuntimeFile(pgIsReady),
    requireRuntimeFile(createdb),
    requireRuntimeFile(psql),
    requireRuntimeFile(webServer),
    requireRuntimeFile(workerServer),
  ]);

  const versionFile = path.join(postgresDataDir, 'PG_VERSION');
  try {
    await access(versionFile);
  } catch {
    await run(initdb, ['-D', postgresDataDir, '-U', 'postgres', '--auth=trust', '--encoding=UTF8'], process.env);
  }

  const sharedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${postgresBinDir};${postgresLibDir};${process.env.PATH ?? ''}`,
    NODE_ENV: 'production',
    BETTER_AUTH_SECRET: DESKTOP_AUTH_SECRET,
    DATABASE_URL: `postgresql://postgres@127.0.0.1:${POSTGRES_PORT}/healthmanager`,
    BLOB_STORAGE_PROVIDER: 'local',
    LOCAL_BLOB_DIR: blobsDir,
    BETTER_AUTH_URL: `http://127.0.0.1:${WEB_PORT}`,
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${WEB_PORT}`,
    RENDER_WORKER_URL: `http://127.0.0.1:${WORKER_PORT}`,
    PORT: String(WEB_PORT),
  };
  // Do not inherit workstation-level PostgreSQL client overrides. In particular,
  // `timezone_abbreviations=Default` is invalid in the bundled runtime and makes
  // every web-server database connection fail.
  delete sharedEnv.PGOPTIONS;
  delete sharedEnv.PGTZ;

  // Reuse the local database after an interrupted restart. Calling pg_ctl start
  // against an already running cluster produces a misleading startup failure.
  let postgresReady = false;
  try {
    await run(pgIsReady, ['-h', '127.0.0.1', '-p', String(POSTGRES_PORT), '-U', 'postgres'], sharedEnv);
    postgresReady = true;
  } catch {
    // The isolated cluster is not running yet.
  }
  if (!postgresReady) {
    await run(postgresCtl, [
      'start', '-D', postgresDataDir, '-l', path.join(postgresDataDir, 'postgres-runtime.log'),
      '-o', `-p ${POSTGRES_PORT} -h 127.0.0.1`,
    ], sharedEnv);
    await run(pgIsReady, ['-h', '127.0.0.1', '-p', String(POSTGRES_PORT), '-U', 'postgres'], sharedEnv);
  }

  let initialized = false;
  let appliedMigrations: string[] = [];
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8')) as {
      databaseInitialized?: boolean;
      appliedMigrations?: string[];
    };
    initialized = state.databaseInitialized === true;
    appliedMigrations = state.appliedMigrations ?? [];
  } catch {
    // A missing state file means this is a new local database.
  }

  const migrationsDir = runtimePath('migrations');
  const migrations = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  // Existing desktop installations predate migration tracking and already have
  // migrations 0000 through 0010. Record only that baseline once. Later
  // migrations must remain pending so schema and ownership fixes are applied.
  if (initialized && appliedMigrations.length === 0) {
    appliedMigrations = migrations.filter((file) => file.slice(0, 4) <= '0010');
  }
  if (!initialized) {
    await run(createdb, ['-h', '127.0.0.1', '-p', String(POSTGRES_PORT), '-U', 'postgres', 'healthmanager'], sharedEnv);
    const seedProgram = runtimePath('bootstrap', 'run.js');
    await requireRuntimeFile(seedProgram);
  }

  for (const migration of migrations) {
    if (appliedMigrations.includes(migration)) continue;
    await run(psql, ['-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(POSTGRES_PORT), '-U', 'postgres', '-d', 'healthmanager', '-f', path.join(migrationsDir, migration)], sharedEnv);
    appliedMigrations.push(migration);
    await writeFile(statePath, JSON.stringify({ databaseInitialized: true, appliedMigrations }), 'utf8');
  }

  if (!initialized) {
    const seedProgram = runtimePath('bootstrap', 'run.js');
    await run(process.execPath, [seedProgram], { ...sharedEnv, ELECTRON_RUN_AS_NODE: '1' });
  }

  startService(process.execPath, [webServer], { ...sharedEnv, ELECTRON_RUN_AS_NODE: '1' }, webDir);
  startService(process.execPath, [workerServer], {
    ...sharedEnv,
    ELECTRON_RUN_AS_NODE: '1',
    PORT: String(WORKER_PORT),
  });
  // The worker only processes background document imports. Do not block the
  // desktop UI if it needs additional time to load its workflow dependencies.
  await waitFor(`http://127.0.0.1:${WEB_PORT}`, 60_000);
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await window.loadURL(`http://127.0.0.1:${WEB_PORT}`);
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) {
    app.quit();
    return;
  }
  try {
    await startLocalServices();
    Menu.setApplicationMenu(createApplicationMenu());
    await createWindow();
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'HealthManager 无法启动',
      message: error instanceof Error ? error.message : String(error),
      detail: '请勿删除应用数据目录。若问题持续，请将应用日志和版本号提供给维护者。',
    });
    app.quit();
  }
});

app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  for (const service of services) service.kill();
  services = [];
  if (postgresCtl && postgresDataDir) {
    spawn(postgresCtl, ['stop', '-D', postgresDataDir, '-m', 'fast'], { windowsHide: true });
  }
});
