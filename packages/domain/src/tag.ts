import type { TagId, UserId } from "./ids.js";
import { assertIsoTimestamp } from "./notebook.js";

export interface Tag {
  readonly id: TagId;
  readonly ownerId: UserId;
  readonly name: string;
  readonly color: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export function makeTag(input: Tag): Tag {
  if (input.name.trim().length === 0) {
    throw new Error("Tag.name cannot be empty");
  }
  if (!HEX_COLOR_RE.test(input.color)) {
    throw new Error(`Tag.color must be #RRGGBB hex, got ${JSON.stringify(input.color)}`);
  }
  assertIsoTimestamp("Tag.createdAt", input.createdAt);
  assertIsoTimestamp("Tag.updatedAt", input.updatedAt);
  return input;
}
