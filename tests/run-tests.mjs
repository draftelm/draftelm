import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Compile with the project's existing TypeScript; no runtime loader or test dependency.
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const output = mkdtempSync(join(tmpdir(), "draftelm-furniture-tests-"));
try {
  execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "--project", "tests/tsconfig.json", "--outDir", output], { cwd: root, stdio: "inherit" });
  execFileSync(process.execPath, ["--test", join(output, "tests/furniture.test.js")], { cwd: root, stdio: "inherit" });
} catch (error) {
  process.exitCode = typeof error.status === "number" ? error.status : 1;
} finally {
  rmSync(output, { recursive: true, force: true });
}
