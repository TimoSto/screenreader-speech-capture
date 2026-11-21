# Quirks and risks

**tl;dr:** The engine is small and deliberately naive. The points below are where it can surprise a test setup,
with the symptom you'd see in the bridge. Each is traceable to the source; *(inferred)* marks Windows behaviour not visible in it.

## ANSI encoding

`CW2A` converts with the system ANSI code page. A wrong `tcp.encoding` in the bridge garbles accented
letters; characters missing from the code page arrive as `?` and can't be recovered. Home:
[Speech capture → Wire format](../../usage/speech-capture.md#wire-format).

## Lazy failure detection

`connect` is unchecked, and a `send` on a connection the peer has already closed often *succeeds* once
(TCP only reports the reset on a later call) *(inferred: standard TCP behaviour)*. So after a bridge restart the
first utterance can vanish without an error or retry. The following ones reconnect.
Symptom: the first speech after restarting the bridge is missing.

## Blocking connect inside the screen reader

`connect` is a blocking call made on the thread SAPI used to call `Speak`, inside the screen reader's
process, with no timeout or non-blocking mode. An unreachable but routable host can stall speech for
seconds *(inferred)*. For `127.0.0.1` with nothing listening it fails fast. Keep the host local.

## Silent data loss

Three paths drop text and tell nobody (SAPI always gets `S_OK`):

1. `GetAddrInfoW` returns no address: `sendData` returns.
2. Both attempts fail: the loop ends with `sock == NULL`.
3. A reconnect only re-sends the current chunk, not earlier chunks of the same utterance.

## Name resolution

Only the first resolved address is used. `localhost` may resolve to `::1` first *(inferred)*, and if the
bridge listens only on IPv4 the connection fails. The defaults use `127.0.0.1` for this reason; keep
`voiceHost` an IP literal unless you know both sides.

## One line per `Speak`, newlines unescaped

An utterance containing `\n` is split into several lines by the bridge. Empty utterances send nothing, so the blank lines
the bridge skips come from elsewhere (see [TCP capture](../tcp-capture.md#framing-and-decoding)).

## No locking around the socket

`CComMultiThreadModel` and `ThreadingModel=Both` allow concurrent calls, yet `sock` and the multi-`send` line
are unsynchronized. If SAPI calls `Speak` on one object from two threads, bytes of two utterances could interleave.
SAPI normally serializes `Speak` per voice object, so this is a theoretical risk.

## Bitness

A 32-bit DLL is loaded only by 32-bit processes (and registered in the 32-bit registry view), and 64-bit
likewise *(inferred: standard COM/SAPI behaviour)*. The screen reader's bitness must match the DLL
that `regsvr32` registered, otherwise the voice appears in a dialog (or not) but fails to load. The build
script doesn't pick an architecture; check which your package ships.

## Voice token side effects

- `removeVoice` on a missing id creates then deletes it (see [Voice registration](voice-registration.md#removevoice)).
- `addVoice` with an existing key name rewrites that token; there is no "already exists" check.
- Errors are reported with a `MessageBox`, which blocks a headless script until someone clicks it.
  An unattended provisioning script should check the exit code *and* look for a hung `rundll32`.
- `rundll32` itself returns no usable exit code for these entry points *(inferred)*, so verify
  by listing `HKLM\SOFTWARE\Microsoft\Speech\Voices\Tokens`.

## Not an audio voice

No audio, no purge handling, every `Speak` completes at once. Applications that wait on audio completion (for
instance to time pauses) see speech finishing instantly; a screen reader that speaks long text in many
small `Speak` calls simply produces many lines.
