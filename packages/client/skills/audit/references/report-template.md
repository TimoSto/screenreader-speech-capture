# Report template

```
# Screen reader test: <task name>
Page: <url> | Screen reader: <NVDA/JAWS, version, verbosity if known> | Bridge: <url> | Session id: <id>
WCAG: <version the references use, 2.2 unless the user named another>

## Summary
<2-3 sentences: did the workflow work for a screen reader user? count of steps pass / fail / unclear,
count of findings per severity>

## Steps
### 1. <action> — PASS | FAIL | UNCLEAR
- Input: <`press <keys>`, or the MCP tool for typing; note a `browser_click` used to get past a keyboard failure>
- Expected: <from the agreed plan>
- Heard (seq 41-44; capture status, if captured: silent | no-speech | timeout): "<exact text from the bridge>"
- Evidence: <DOM/snapshot detail from MCP, e.g. button has no accessible name>
- Findings: <F1, F2, or none>

## Page findings
<most severe first; "none" if there are none>

### F1. <what is wrong> — Critical | Serious | Moderate | Minor
- Steps: <step numbers, seq>
- WCAG: <number, name, level, e.g. 4.1.2 Name, Role, Value (A); or "no criterion identified">
- Impact: <what this means for the user>
- Fix: <likely cause and suggested fix>

## Environment doubts / not verified
<focus uncertainty, wording that depends on verbosity, noise ignored, anything unverified>
```

## Severity

Rate what the finding does to the user in this workflow, whatever the WCAG level says.

| Severity | The user |
|---|---|
| Critical | can't complete the workflow, or triggers something unintended without knowing. |
| Serious | can complete it only with much effort, guessing or a high risk of mistakes (an unnamed field, an error that isn't announced). |
| Moderate | is slowed down or confused, but finds the way (an odd focus order, a missing state that other speech makes up for). |
| Minor | is mildly bothered (duplicate or wordy speech). |

Environment doubts get no severity and no WCAG reference: they aren't findings.

## WCAG references

Common matches for what a screen reader run shows. Numbers and levels are the same in WCAG 2.1 and
2.2.

| Observed | Criterion |
|---|---|
| An image or icon control without a text alternative | 1.1.1 Non-text Content (A) |
| Headings, lists, tables, landmarks, label or required-field relations that aren't conveyed | 1.3.1 Info and Relationships (A) |
| Reading order changes the meaning | 1.3.2 Meaningful Sequence (A) |
| A control can't be reached or activated by keyboard | 2.1.1 Keyboard (A) |
| Focus can't leave a component | 2.1.2 No Keyboard Trap (A) |
| No way past repeated blocks | 2.4.1 Bypass Blocks (A) |
| Missing or misleading page title | 2.4.2 Page Titled (A) |
| Focus order breaks meaning or operation, focus lost after a dialog closes | 2.4.3 Focus Order (A) |
| A link's purpose isn't clear, even with its context | 2.4.4 Link Purpose (In Context) (A) |
| A heading or label doesn't describe its topic or purpose | 2.4.6 Headings and Labels (AA) |
| Focusing or changing a field moves the user elsewhere unannounced | 3.2.1 On Focus (A), 3.2.2 On Input (A) |
| An input error isn't identified or described in text | 3.3.1 Error Identification (A) |
| A field that needs input has no label or instruction | 3.3.2 Labels or Instructions (A) |
| A known correction isn't suggested | 3.3.3 Error Suggestion (AA) |
| A control's name, role, state or value is missing or wrong | 4.1.2 Name, Role, Value (A) |
| A status or error message appears without focus moving to it and isn't announced | 4.1.3 Status Messages (AA) |

Cite a criterion only when the captured speech and the evidence show that it fails, and name more
than one if several do. If none clearly fits, write "no criterion identified" instead of forcing a
number. The run covers one workflow with one screen reader, so the report is no conformance
statement, and it says nothing about visual criteria such as contrast or focus visibility.
