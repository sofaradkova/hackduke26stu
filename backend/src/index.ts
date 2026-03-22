import { mkdir } from "node:fs/promises";
import path from "node:path";
import { buildServer } from "./lib/server.js";
import { env, useMockAi } from "./lib/env.js";

async function main() {
  const storageRoot = path.resolve(env.storageDir);
  await mkdir(storageRoot, { recursive: true });

  const app = await buildServer();
  await app.listen({ port: env.port, host: "0.0.0.0" });

  app.log.info(
    {
      port: env.port,
      storageDir: storageRoot,
      mockAi: useMockAi,
      openaiModel: env.openaiModel,
    },
    "Server listening",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
