export async function readStream(
    response: Response,
    onChunk: (chunk: string) => void,
    onEvent?: (event: { status: string; message?: string; html?: string; error?: string }) => void
) {
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Request failed');
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No readable stream');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            // If it's a raw text stream (like for transformation)
            if (!onEvent) {
                onChunk(chunk);
            } else {
                // SSE parsing for initial generation
                buffer += chunk;
                const messages = buffer.split('\n\n');
                buffer = messages.pop() || '';

                for (const message of messages) {
                    const line = message.trim();
                    if (!line || !line.startsWith('data: ')) continue;
                    try {
                        const data = JSON.parse(line.slice(6));
                        onEvent(data);
                    } catch (e) {
                        console.debug('Malformed SSE message:', e);
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}
