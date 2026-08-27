import { mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const targets = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'win32-x64': 'x86_64-pc-windows-msvc',
}

const target = process.env.TAURI_ENV_TARGET_TRIPLE
  || targets[`${process.platform}-${process.arch}`]
if (!target) throw new Error(`Unsupported sidecar build target: ${process.platform}-${process.arch}`)

const extension = target.includes('windows') ? '.exe' : ''
const output = resolve(`src-tauri/binaries/tea-channel-sidecar-${target}${extension}`)
mkdirSync(dirname(output), { recursive: true })

const result = spawnSync('deno', [
  'compile',
  '--config', 'src-channel-sidecar/deno.json',
  '--allow-net',
  '--target', target,
  '--output', output,
  'src-channel-sidecar/main.ts',
], { stdio: 'inherit' })

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
