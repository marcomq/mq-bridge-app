# Import/Export Samples

Use these JSON files for quick manual UI checks.

## Import samples

1. Open the UI and go to `App Config`.
2. Click one of:
   - `Import Postman` -> use `postman.collection.sample.json`
   - `Import OpenAPI` -> use `openapi.sample.json`
   - `Import AsyncAPI` -> use `asyncapi.sample.json`
3. Enter a target publisher name when prompted.
4. Verify presets appear in `Publishers -> Presets`.

## Native MQB samples

- `mqb-presets.sample.json` can be imported with native preset import logic (used in automated tests).
- `mqb-export.sample.json` demonstrates a full config export payload shape.

## Export checks

From `App Config`:
- `Export Config` -> validate output contains only `config`.
- `Export All` -> validate output contains `config`, `presets`, and `envVars`.

From `Publishers -> Presets`:
- `Export Presets` -> validate output contains only current publisher presets + `envVars`.
