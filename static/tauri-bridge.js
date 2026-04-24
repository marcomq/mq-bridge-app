(function () {
    const invoke = window.__TAURI__?.core?.invoke;
    if (typeof invoke !== 'function') {
        return;
    }

    const originalFetch = window.fetch.bind(window);

    const isLocalUiRequest = (url) => {
        if (!url) return false;
        if (url.origin !== window.location.origin) return false;

        return [
            '/health',
            '/schema.json',
            '/config',
            '/consumer-status',
            '/consumer-start',
            '/consumer-stop',
            '/messages',
            '/publish',
            '/runtime-status',
            '/metrics',
        ].some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}?`));
    };

    const parseBody = async (requestLike) => {
        if (!requestLike) return null;
        const raw = requestLike.body;
        if (raw == null) return null;
        if (typeof raw === 'string') return raw;
        if (raw instanceof URLSearchParams) return raw.toString();
        if (raw instanceof Blob) return await raw.text();
        return String(raw);
    };

    const toResponse = (bridgeResponse) => {
        const headers = new Headers(bridgeResponse.headers || {});
        if (bridgeResponse.content_type) {
            headers.set('Content-Type', bridgeResponse.content_type);
        }

        const body = bridgeResponse.body_json != null
            ? JSON.stringify(bridgeResponse.body_json)
            : (bridgeResponse.body_text || '');

        return new Response(body, {
            status: bridgeResponse.status || 200,
            headers,
        });
    };

    window.fetch = async function tauriAwareFetch(input, init = {}) {
        const request = input instanceof Request ? input : null;
        const url = new URL(request ? request.url : String(input), window.location.origin);
        const normalizedInit = {
            method: request?.method || init.method || 'GET',
            body: init.body ?? (request ? await request.clone().text().catch(() => null) : null),
        };

        if (!isLocalUiRequest(url)) {
            return originalFetch(input, init);
        }

        const bridgeResponse = await invoke('execute_ui_request', {
            request: {
                method: normalizedInit.method,
                path: url.pathname,
                query: url.searchParams.toString(),
                body_text: await parseBody(normalizedInit) || '',
            },
        });
        return toResponse(bridgeResponse);
    };
})();
