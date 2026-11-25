import { describe, expect, it } from "vitest";

import { parseVoteMemo } from "./verify.js";

describe("vote memo parsing", () => {
  it("parses a well-formed ballot memo", () => {
    expect(parseVoteMemo("qorepoll:a1b2c3d4e5:2:9f3c1a")).toEqual({
      slug: "a1b2c3d4e5",
      optionIndex: 2,
      nonce: "9f3c1a",
    });
  });

  it("rejects a memo without the qorepoll prefix", () => {
    expect(parseVoteMemo("vote:a1b2c3d4e5:2:9f3c1a")).toBeNull();
  });

  it("rejects an out-of-range option shape", () => {
    expect(parseVoteMemo("qorepoll:a1b2c3d4e5:123:9f3c1a")).toBeNull();
  });

  it("rejects a missing nonce", () => {
    expect(parseVoteMemo("qorepoll:a1b2c3d4e5:1:")).toBeNull();
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseVoteMemo(" qorepoll:a1b2c3d4e5:1:abcd ")).toEqual({
      slug: "a1b2c3d4e5",
      optionIndex: 1,
      nonce: "abcd",
    });
  });
});
