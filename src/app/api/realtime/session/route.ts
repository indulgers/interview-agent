import 'server-only';

import { postSession } from './handler';

export async function POST(request: Request) { return postSession(request); }
