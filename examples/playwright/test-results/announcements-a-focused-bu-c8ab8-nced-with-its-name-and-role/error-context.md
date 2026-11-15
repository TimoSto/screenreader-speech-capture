# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: announcements.spec.ts >> a focused button is announced with its name and role
- Location: tests/announcements.spec.ts:31:1

# Error details

```
BridgeUnreachableError: The bridge at http://192.168.122.177:5151 is not reachable (The operation was aborted due to timeout)
```

# Test source

```ts
  1376 | 			entries: page.entries.map(toEntry),
  1377 | 			truncated: page.truncated,
  1378 | 			hasMore: page.hasMore
  1379 | 		};
  1380 | 	}
  1381 | 	async clear() {
  1382 | 		await this.request("DELETE", "/speech");
  1383 | 	}
  1384 | 	async mark(label) {
  1385 | 		const body = { label };
  1386 | 		return toEntry(await this.json(SpeechEntrySchema, "POST", "/markers", { body }));
  1387 | 	}
  1388 | 	async startSession(request) {
  1389 | 		const body = {
  1390 | 			name: request.name,
  1391 | 			...request.run === void 0 ? {} : { run: request.run }
  1392 | 		};
  1393 | 		const started = await this.json(StartSessionResponseSchema, "POST", "/sessions", { body });
  1394 | 		return {
  1395 | 			...toSession(started),
  1396 | 			replaced: started.replaced && toSession(started.replaced)
  1397 | 		};
  1398 | 	}
  1399 | 	async endSession() {
  1400 | 		await this.request("POST", "/sessions/end");
  1401 | 	}
  1402 | 	async listSessions() {
  1403 | 		const list = await this.json(SessionListSchema, "GET", "/sessions");
  1404 | 		return {
  1405 | 			sessions: list.sessions.map(toSession),
  1406 | 			currentId: list.currentId
  1407 | 		};
  1408 | 	}
  1409 | 	async *streamSpeech(options) {
  1410 | 		const { lastEventId, session, signal } = options;
  1411 | 		const controller = new AbortController();
  1412 | 		const close = () => controller.abort(signal.reason);
  1413 | 		signal.addEventListener("abort", close, { once: true });
  1414 | 		let watchdog;
  1415 | 		const watch = (ms, reason) => {
  1416 | 			clearTimeout(watchdog);
  1417 | 			watchdog = setTimeout(() => controller.abort(new Error(reason)), ms);
  1418 | 		};
  1419 | 		try {
  1420 | 			watch(REQUEST_TIMEOUT_MS, `no answer within ${REQUEST_TIMEOUT_MS} ms`);
  1421 | 			const query = session === void 0 ? "" : `?session=${session}`;
  1422 | 			const response = await this.request("GET", `/speech/stream${query}`, {
  1423 | 				headers: {
  1424 | 					accept: "text/event-stream",
  1425 | 					...lastEventId === null ? {} : { "last-event-id": String(lastEventId) }
  1426 | 				},
  1427 | 				signal: controller.signal
  1428 | 			});
  1429 | 			if (!response.body) return;
  1430 | 			const text = response.body.pipeThrough(new TextDecoderStream());
  1431 | 			async function* watched() {
  1432 | 				watch(STREAM_IDLE_MS, `no data for ${STREAM_IDLE_MS} ms`);
  1433 | 				for await (const chunk of text) {
  1434 | 					watch(STREAM_IDLE_MS, `no data for ${STREAM_IDLE_MS} ms`);
  1435 | 					yield chunk;
  1436 | 				}
  1437 | 			}
  1438 | 			for await (const message of parseSse(watched())) {
  1439 | 				const event = toStreamEvent(message);
  1440 | 				if (event) yield event;
  1441 | 			}
  1442 | 		} catch (error) {
  1443 | 			if (signal.aborted) return;
  1444 | 			if (error instanceof BridgeUnreachableError || error instanceof BridgeHttpError) throw error;
  1445 | 			const cause = controller.signal.aborted ? controller.signal.reason : error;
  1446 | 			throw new BridgeUnreachableError(await this.base(), { cause });
  1447 | 		} finally {
  1448 | 			clearTimeout(watchdog);
  1449 | 			signal.removeEventListener("abort", close);
  1450 | 			controller.abort();
  1451 | 		}
  1452 | 	}
  1453 | 	/** The answer's JSON body, checked against `schema` (`INVALID_RESPONSE` if it doesn't match). */
  1454 | 	async json(schema, method, path, options) {
  1455 | 		const response = await this.request(method, path, options);
  1456 | 		return parseBody(schema, await response.json(), response.status, `${method} ${path.split("?")[0]}`);
  1457 | 	}
  1458 | 	async request(method, path, options = {}) {
  1459 | 		const base = await this.base();
  1460 | 		const { body } = options;
  1461 | 		const { clientName } = this.options;
  1462 | 		const headers = {
  1463 | 			...options.headers,
  1464 | 			...clientName === void 0 ? {} : { [CLIENT_HEADER]: clientName },
  1465 | 			...body === void 0 ? {} : { "content-type": "application/json" }
  1466 | 		};
  1467 | 		let response;
  1468 | 		try {
  1469 | 			response = await (this.options.fetch ?? fetch)(`${base}${API_PREFIX}${path}`, {
  1470 | 				method,
  1471 | 				signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  1472 | 				headers,
  1473 | 				...body === void 0 ? {} : { body: JSON.stringify(body) }
  1474 | 			});
  1475 | 		} catch (error) {
> 1476 | 			throw new BridgeUnreachableError(base, { cause: error });
       |          ^ BridgeUnreachableError: The bridge at http://192.168.122.177:5151 is not reachable (The operation was aborted due to timeout)
  1477 | 		}
  1478 | 		if (!response.ok) throw await toHttpError(response);
  1479 | 		return response;
  1480 | 	}
  1481 | 	base() {
  1482 | 		this.#baseUrl ??= this.options.baseUrl().catch((error) => {
  1483 | 			this.#baseUrl = void 0;
  1484 | 			throw error;
  1485 | 		});
  1486 | 		return this.#baseUrl;
  1487 | 	}
  1488 | };
  1489 | /**
  1490 | * `body` checked against the contract. A body that doesn't match fails here, at the boundary,
  1491 | * with what was wrong, instead of somewhere inside the client.
  1492 | */
  1493 | function parseBody(schema, body, status, what) {
  1494 | 	const checked = checkDto(schema, body);
  1495 | 	if (checked.ok) return checked.value;
  1496 | 	throw new BridgeHttpError(status, INVALID_RESPONSE, `The bridge answered ${what} with an unexpected body: ${checked.field}: ${checked.message}`);
  1497 | }
  1498 | async function toHttpError(response) {
  1499 | 	const body = await response.json().catch(() => void 0);
  1500 | 	const parsed = checkDto(AnyErrorBodySchema, body);
  1501 | 	if (!parsed.ok) return new BridgeHttpError(response.status, "HTTP_ERROR", response.statusText);
  1502 | 	const { error } = parsed.value;
  1503 | 	return new BridgeHttpError(response.status, error.code, error.message, error.details);
  1504 | }
  1505 | /** The feed event for one SSE message, `undefined` for events this client doesn't know. */
  1506 | function toStreamEvent({ event, data, id }) {
  1507 | 	switch (event) {
  1508 | 		case "entry": return {
  1509 | 			type: "entry",
  1510 | 			entry: toEntry(parseEvent(SpeechEntrySchema, data, event))
  1511 | 		};
  1512 | 		case "session": return {
  1513 | 			type: "session",
  1514 | 			session: toSession(parseEvent(SessionSchema, data, event))
  1515 | 		};
  1516 | 		case "position": {
  1517 | 			const seq = id !== void 0 && /^\d+$/.test(id) ? Number(id) : NaN;
  1518 | 			if (!Number.isSafeInteger(seq)) throw new BridgeHttpError(200, INVALID_RESPONSE, `the live feed's position event has no valid id (${JSON.stringify(id)})`);
  1519 | 			return {
  1520 | 				type: "position",
  1521 | 				seq
  1522 | 			};
  1523 | 		}
  1524 | 		case "clear":
  1525 | 		case "truncated": return { type: event };
  1526 | 		default: return;
  1527 | 	}
  1528 | }
  1529 | /** The data of an SSE event, checked against the contract like a response body. */
  1530 | function parseEvent(schema, data, event) {
  1531 | 	let body;
  1532 | 	try {
  1533 | 		body = JSON.parse(data);
  1534 | 	} catch {
  1535 | 		body = data;
  1536 | 	}
  1537 | 	return parseBody(schema, body, 200, `the live feed's ${event} event`);
  1538 | }
  1539 | const toEntry = (dto) => ({
  1540 | 	seq: dto.seq,
  1541 | 	kind: dto.kind,
  1542 | 	text: dto.text,
  1543 | 	receivedAt: dto.receivedAt,
  1544 | 	source: dto.source,
  1545 | 	voice: dto.voice,
  1546 | 	connectionId: dto.connectionId,
  1547 | 	sessionId: dto.sessionId ?? null
  1548 | });
  1549 | const toSession = (dto) => ({
  1550 | 	id: dto.id,
  1551 | 	name: dto.name,
  1552 | 	run: dto.run,
  1553 | 	client: dto.client,
  1554 | 	startedAt: dto.startedAt,
  1555 | 	endedAt: dto.endedAt,
  1556 | 	startSeq: dto.startSeq,
  1557 | 	firstSeq: dto.firstSeq,
  1558 | 	lastSeq: dto.lastSeq,
  1559 | 	entries: dto.entries
  1560 | });
  1561 | const toServiceStatus = (dto) => ({
  1562 | 	state: dto.state,
  1563 | 	version: dto.version,
  1564 | 	port: dto.port,
  1565 | 	restarts: dto.restarts,
  1566 | 	exitCode: dto.exitCode
  1567 | });
  1568 | const toStatus = ({ bridge, tcp, buffer, playwright, mcp, session }) => ({
  1569 | 	bridge: {
  1570 | 		version: bridge.version,
  1571 | 		apiVersion: bridge.apiVersion,
  1572 | 		state: bridge.state,
  1573 | 		startedAt: bridge.startedAt
  1574 | 	},
  1575 | 	tcp: {
  1576 | 		listening: tcp.listening,
```