import { revealItemInDir } from "@tauri-apps/plugin-opener";

/** Open an exported application folder in the system file manager. */
export async function revealExportFolder(exportPath: string): Promise<void> {
  const base = exportPath.replace(/[/\\]+$/, "");
  await revealItemInDir(`${base}/README.txt`);
}
