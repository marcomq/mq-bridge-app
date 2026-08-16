import { describe, expect, test } from "vitest";
import { explainConfigSaveError, jsonPathAtOffset } from "../../ui/src/lib/save-error";

// Mirrors what the backend rejects: a file endpoint whose at-rest encryption block
// was filled in except for the required `key`.
const CONFIG = {
  consumers: [
    { name: "kafka-in", endpoint: { kafka: { url: "kafka:9092", topic: "events" }, middlewares: [] } },
    {
      name: "file-sink",
      endpoint: {
        file: {
          path: "/tmp/out.jsonl",
          encryption: { cipher: "chacha20poly1305", key_id: "default" },
        },
        middlewares: [],
      },
      response: null,
      output: { mode: "none" },
    },
  ],
};

const BODY = JSON.stringify(CONFIG);

function serdeError(detail: string, marker: string, offsetInMarker = 0) {
  const column = BODY.indexOf(marker) + offsetInMarker + 1;
  return `Json deserialize error: ${detail} at line 1 column ${column}\nAt: ...${BODY.slice(column - 31, column + 29)}...`;
}

describe("jsonPathAtOffset", () => {
  test("resolves the path of the value under the offset", () => {
    const offset = BODY.indexOf("chacha20poly1305");
    expect(jsonPathAtOffset(BODY, offset)).toEqual([
      "consumers",
      "[1]",
      "endpoint",
      "file",
      "encryption",
      "cipher",
    ]);
  });

  test("keeps the container a closing brace belongs to", () => {
    // The brace that closes consumers[1].endpoint, right before `,"response"`.
    const offset = BODY.indexOf('},"response"');
    expect(jsonPathAtOffset(BODY, offset)).toEqual(["consumers", "[1]", "endpoint"]);
  });

  test("tracks array indices", () => {
    const offset = BODY.indexOf('"file-sink"');
    expect(jsonPathAtOffset(BODY, offset)).toEqual(["consumers", "[1]", "name"]);
  });
});

describe("explainConfigSaveError", () => {
  test("names the consumer and the nested block a required field is missing from", () => {
    const message = serdeError("missing field `key`", '},"response"');

    expect(explainConfigSaveError(message, BODY)).toBe(
      "consumer “file-sink” › endpoint › file › encryption: missing field `key`",
    );
  });

  test("uses the offset path directly for value errors", () => {
    const message = serdeError("invalid type: string, expected u32", "chacha20poly1305");

    expect(explainConfigSaveError(message, BODY)).toBe(
      "consumer “file-sink” › endpoint › file › encryption › cipher: invalid type: string, expected u32",
    );
  });

  test("falls back to the position when the entry has no name", () => {
    const body = JSON.stringify({ consumers: [{ endpoint: { file: { path: "/tmp/a" } } }] });
    const column = body.indexOf('}}}') + 1;

    expect(
      explainConfigSaveError(`Json deserialize error: missing field \`key\` at line 1 column ${column}`, body),
    ).toBe("consumer 1 › endpoint › file: missing field `key`");
  });

  test("passes through errors that carry no position", () => {
    expect(explainConfigSaveError("Config is locked by another instance", BODY)).toBe(
      "Config is locked by another instance",
    );
  });

  test("passes through when the body is not the JSON that was rejected", () => {
    expect(explainConfigSaveError("Json deserialize error: missing field `key` at line 1 column 12", "not json")).toBe(
      "Json deserialize error: missing field `key` at line 1 column 12",
    );
  });
});
