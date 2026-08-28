import { runMcpProcess } from './mcpProxy'

void runMcpProcess(process.argv, process.stderr).then((exitCode) => {
  process.exitCode = exitCode
})
