import { createVertex } from '@ai-sdk/google-vertex';
import { config } from 'dotenv';

config({ quiet: true });

export const geminiProvider = createVertex();
