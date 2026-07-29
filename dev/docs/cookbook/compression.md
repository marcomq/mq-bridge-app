# Compression

The `file` and `object_store` endpoints can compress each batch on write with the
`compression` field (requires the `compression` feature):

```yaml
output:
  file:
    path: "data.jsonl"
    format: json
    compression: lz4        # none | gzip | lz4 | zstd
```

| Codec | Notes |
|---|---|
| `none` | default — no compression |
| `gzip` | widest compatibility; standard `.gz` stream |
| `lz4` | fastest; standard `.lz4` stream |
| `zstd` | best ratio for the CPU cost |

`object_store` derives its default object extension from the codec (e.g. `.jsonl.gz` /
`.jsonl.lz4`).

## Reading it back

A file **source** must declare the **same** `compression` the data was written with:

```yaml
input:
  file:
    path: "data.jsonl"
    format: json
    compression: lz4
```

A mismatch — wrong codec, or a missing field — is a permanent decode failure: the route
ends `failed` with the error in its status rather than silently completing as if the
file were empty. Reading a compressed file with no `compression` set is likewise
rejected up front by sniffing the leading magic bytes, so raw compressed bytes are never
emitted as messages.

File compression supports only the default `consume` mode. `csv` works too: the header
row is written into the first member, so the decoded stream is a normal CSV file.

## Compression *and* encryption

Do **not** stack the [`encryption` middleware](encryption.md) on top of a sink's batch
`compression` on the same route — ciphertext does not compress. For compressed *and*
encrypted data at rest, use the endpoints' own fields, which apply
**compress-then-encrypt** per batch:

```yaml
output:
  file:
    path: "data.enc"
    format: raw
    compression: lz4
    encryption: { key: "${env:MQB_ENC_KEY}" }
```

An encrypted file is written as length-prefixed sealed frames (one per batch) and is
only readable through a matching consumer; `object_store` adds a trailing `.enc` since
the object is ciphertext, not a directly decompressible `.gz`.

## See also

- [Encryption at rest](encryption.md) — the encryption side and key handling.
- [Middleware & structural endpoints](../engine/reference.md) — the authoritative `compression`/`encryption` field docs.
- [Performance tuning → Compression & encryption cost](../operations/tuning.md).
