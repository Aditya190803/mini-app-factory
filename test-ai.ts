
import { getAIClient } from './lib/ai-client';

async function test() {
    try {
        console.log('Initializing AI client...');
        const client = await getAIClient();
        console.log('Creating session...');
        const session = await client.createSession();
        console.log('Sending test prompt...');
        const resp = await session.sendAndWait({ prompt: 'Hello' });
        console.log('Response:', resp.data.content);
        await session.destroy();
        console.log('Test successful');
    } catch (err) {
        console.error('Test failed:', err);
    }
}

test();