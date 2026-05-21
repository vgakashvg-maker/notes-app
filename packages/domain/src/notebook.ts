import type { NotebookId, UserId } from "./ids.js";

export interface Notebook {
  readonly id: NotebookId;
  readonly ownerId: UserId;
  readonly name: string;
  readonly color: string;
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export function makeNotebook(input: Notebook): Notebook {
  if (input.name.trim().length === 0) {
    throw new Error("Notebook.name cannot be empty");
  }
  if (!HEX_COLOR_RE.test(input.color)) {
    throw new Error(`Notebook.color must be #RRGGBB hex, got ${JSON.stringify(input.color)}`);
  }
  if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0) {
    throw new Error("Notebook.sortOrder must be a non-negative integer");
  }
  assertIsoTimestamp("Notebook.createdAt", input.createdAt);
  assertIsoTimestamp("Notebook.updatedAt", input.updatedAt);
  return input;
}

export function assertIsoTimestamp(field: string, value: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be an ISO-8601 timestamp, got ${JSON.stringify(value)}`);
  }
}
