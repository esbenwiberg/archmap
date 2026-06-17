import type { Contract } from "./contract.js";

export function makeOne(): Contract {
  return { id: "1", value: 1 };
}
