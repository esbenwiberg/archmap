import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Some tests exercise config discovery / cache writes via process.chdir(),
    // which the default worker-thread pool forbids. The forks pool allows it.
    pool: "forks",
  },
});
