import http from "node:http";
import { spawn } from "node:child_process";
import process from "node:process";

const host = process.env.WORKER_STACK_HOST ?? "127.0.0.1";
const port = Number(process.env.WORKER_STACK_PORT ?? 4300);
const cwd = process.cwd();

const workers = [
  { name: "collector", args: ["apps/worker-collector/dist/apps/worker-collector/src/index.js", "run"] },
  { name: "parser", args: ["apps/worker-parser/dist/apps/worker-parser/src/index.js", "run"] },
  { name: "scoring", args: ["apps/worker-scoring/dist/apps/worker-scoring/src/index.js", "run"] }
].map((worker) => {
  const child = spawn("node", worker.args, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[worker:${worker.name}] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[worker:${worker.name}] ${chunk}`);
  });

  return { ...worker, child };
});

let shuttingDown = false;

const server = http.createServer((_request, response) => {
  const unhealthy = workers.find(({ child }) => child.exitCode !== null);
  response.writeHead(unhealthy ? 503 : 200, { "content-type": "application/json" });
  response.end(JSON.stringify({
    status: unhealthy ? "degraded" : "ready",
    workers: workers.map(({ name, child }) => ({
      name,
      pid: child.pid,
      exited: child.exitCode !== null,
      exit_code: child.exitCode
    }))
  }));
});

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  server.close(() => {
    process.exit(0);
  });

  for (const { child } of workers) {
    if (child.exitCode === null) {
      child.kill(signal);
    }
  }

  setTimeout(() => {
    for (const { child } of workers) {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }
  }, 5_000).unref();
}

for (const { name, child } of workers) {
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      process.stderr.write(`[worker:${name}] exited unexpectedly (code=${code}, signal=${signal})\n`);
      shutdown("SIGTERM");
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

server.listen(port, host, () => {
  process.stdout.write(`[worker-stack] listening on http://${host}:${port}/healthz\n`);
});
