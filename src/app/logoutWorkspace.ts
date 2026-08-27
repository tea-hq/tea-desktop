interface DisposableWorkspace {
  exit(): Promise<void>
}

export async function logoutWorkspace(
  workspace: DisposableWorkspace,
  logoutCenter: () => Promise<void>,
): Promise<void> {
  try {
    await workspace.exit()
  } catch {
    // Center session cleanup must not be blocked by best-effort renderer disposal.
  }
  await logoutCenter()
}
