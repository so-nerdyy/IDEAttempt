import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import gulp from 'gulp';
import fancyLog from 'fancy-log';
import * as task from '../lib/task.ts';
import * as util from '../lib/util.ts';

const root = path.dirname(import.meta.dirname);
const kiloCodeExtPath = path.join(root, 'extensions', 'kilo-code');
const kilocodeRoot = path.join(root, '..', 'kilocode');
const kilocodeOut = path.join(kiloCodeExtPath, 'out');
const kilocodeDist = path.join(kiloCodeExtPath, 'dist');

const KILOCODE_PACKAGES = [
	'kilo-i18n',
	'kilo-ui',
	'sdk',
];

function runBun(args: string[], cwd: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn('bun', args, {
			cwd,
			stdio: 'inherit',
			shell: process.platform === 'win32',
		});
		proc.on('close', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`bun ${args.join(' ')} exited with code ${code}`));
		});
		proc.on('error', reject);
	});
}

function kilocodePackagesInstalled(): boolean {
	try {
		return fs.existsSync(path.join(kilocodeRoot, 'node_modules'));
	} catch {
		return false;
	}
}

const compileKiloCodePackagesTask = task.define('compile-kilocode-packages', async () => {
	fancyLog('Compiling KiloCode packages...');

	if (!kilocodePackagesInstalled()) {
		fancyLog('Installing KiloCode dependencies...');
		await runBun(['install'], kilocodeRoot);
	}

	for (const pkg of KILOCODE_PACKAGES) {
		const pkgPath = path.join(kilocodeRoot, 'packages', pkg);
		if (fs.existsSync(path.join(pkgPath, 'package.json'))) {
			fancyLog(`Building ${pkg}...`);
			const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgPath, 'package.json'), 'utf8'));
			if (pkgJson.scripts?.build) {
				await runBun(['run', 'build'], pkgPath);
			} else if (pkgJson.scripts?.compile) {
				await runBun(['run', 'compile'], pkgPath);
			}
		}
	}

	fancyLog('KiloCode packages compiled.');
});

const compileKiloCodeExtensionTask = task.define('compile-kilo-code-extension', task.series(
	compileKiloCodePackagesTask,
	task.define('kilo-code-extension-build', async () => {
		fancyLog('Building Kilo Code extension...');

		const esbuildScript = path.join(kiloCodeExtPath, 'esbuild.mjs');
		if (fs.existsSync(esbuildScript)) {
			await runBun(['run', esbuildScript], kiloCodeExtPath);
		} else {
			fancyLog('No esbuild script found, running tsc...');
			await runBun(['x', 'tsc', '-p', 'tsconfig.json'], kiloCodeExtPath);
		}

		fancyLog('Kilo Code extension built.');
	}),
));

gulp.task(compileKiloCodeExtensionTask);

const watchKiloCodeExtensionTask = task.define('watch-kilo-code-extension', () => {
	fancyLog('Watching Kilo Code extension...');
	return gulp.watch(
		[
			path.join(kiloCodeExtPath, 'src', '**', '*.ts'),
			path.join(kiloCodeExtPath, 'webview-ui', '**', '*.{ts,tsx,js,jsx}'),
		],
		{ ignoreInitial: false },
		async () => {
			fancyLog('Rebuilding Kilo Code extension...');
			try {
				await runBun(['x', 'tsc', '-p', 'tsconfig.json'], kiloCodeExtPath);
			} catch (err) {
				fancyLog('Build error:', err);
			}
		}
	);
});

gulp.task(watchKiloCodeExtensionTask);

export { compileKiloCodeExtensionTask, watchKiloCodeExtensionTask };
