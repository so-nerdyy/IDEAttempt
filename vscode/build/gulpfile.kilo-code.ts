import { spawn, execSync } from 'child_process';
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
const kilocodeWebviewUi = path.join(kiloCodeExtPath, 'webview-ui');

const KILOCODE_PACKAGES = [
	'kilo-i18n',
	'kilo-ui',
	'sdk',
	'kilo-gateway',
	'kilo-telemetry',
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

	await runBun(['turbo', 'build'], kilocodeRoot);

	fancyLog('KiloCode packages compiled.');
});

const bundleKiloCodeWebviewAssetsTask = task.define('bundle-kilocode-webview-assets', () => {
	fancyLog('Bundling KiloCode webview assets...');

	const webviewSrc = path.join(kiloCodeExtPath, 'webview-ui');
	const webviewDest = path.join(kilocodeDist, 'webview-ui');

	if (fs.existsSync(webviewSrc)) {
		if (!fs.existsSync(kilocodeDist)) {
			fs.mkdirSync(kilocodeDist, { recursive: true });
		}

		return gulp.src([
			path.join(webviewSrc, '**', '*.{html,js,css,png,svg,json}'),
		], { base: webviewSrc })
			.pipe(gulp.dest(webviewDest));
	}

	fancyLog('No webview-ui directory found, skipping.');
	return Promise.resolve();
});

const compileKiloCodeExtensionTask = task.define('compile-kilo-code-extension', task.series(
	compileKiloCodePackagesTask,
	task.define('kilo-code-extension-build', async () => {
		fancyLog('Building Kilo Code extension...');

		const esbuildScript = path.join(kiloCodeExtPath, 'esbuild.js');
		if (fs.existsSync(esbuildScript)) {
			await runBun(['run', esbuildScript], kiloCodeExtPath);
		} else {
			fancyLog('No esbuild script found, running tsc...');
			await runBun(['x', 'tsc', '-p', 'tsconfig.json'], kiloCodeExtPath);
		}

		fancyLog('Kilo Code extension built.');
	}),
	bundleKiloCodeWebviewAssetsTask,
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
				const esbuildScript = path.join(kiloCodeExtPath, 'esbuild.js');
				if (fs.existsSync(esbuildScript)) {
					await runBun(['run', esbuildScript], kiloCodeExtPath);
				} else {
					await runBun(['x', 'tsc', '-p', 'tsconfig.json'], kiloCodeExtPath);
				}
			} catch (err) {
				fancyLog('Build error:', err);
			}
		}
	);
});

gulp.task(watchKiloCodeExtensionTask);

export { compileKiloCodeExtensionTask, watchKiloCodeExtensionTask };
