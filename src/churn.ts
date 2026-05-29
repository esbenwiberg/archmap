import { execSync } from "child_process";

export interface ChurnData {
  commits: number;
  windowDays: number;
}

export function buildChurnMap(windowDays = 90): Map<string, ChurnData> {
  const churn = new Map<string, ChurnData>();

  let raw: string;
  try {
    raw = execSync(
      `git log --name-only --pretty=format:"COMMIT" --after="${windowDays} days ago"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }
    );
  } catch {
    return churn;
  }

  let currentFile = false;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "COMMIT") {
      currentFile = true;
      continue;
    }
    if (trimmed === "") {
      currentFile = false;
      continue;
    }
    if (currentFile && trimmed) {
      const existing = churn.get(trimmed);
      churn.set(trimmed, {
        commits: (existing?.commits ?? 0) + 1,
        windowDays,
      });
    }
  }

  return churn;
}
