# Report template

```
# Screen reader test: <task name>
Page: <url> | Screen reader: <NVDA/JAWS, version, verbosity if known> | Bridge: <url> | Session id: <id>

## Summary
<2-3 sentences: did the workflow work for a screen reader user? count of pass / fail / unclear>

## Steps
### 1. <action> — PASS | FAIL | UNCLEAR
- Input: <`press <keys>`, or the MCP tool for typing; note a `browser_click` used to get past a keyboard failure>
- Expected: <from the agreed plan>
- Heard (seq 41-44; capture status, if captured: silent | no-speech | timeout): "<exact text from the bridge>"
- Evidence: <DOM/snapshot detail from MCP, e.g. button has no accessible name>
- Note: <likely cause / suggested fix>

## Page findings
<numbered, most severe first, each with the step it came from>

## Environment doubts / not verified
<focus uncertainty, wording that depends on verbosity, noise ignored, anything unverified>
```
