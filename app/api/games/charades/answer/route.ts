import { requireFacilitator } from '@/lib/games/session';
import { GameRequestError, gameError, gameResponse, gameRpc, readGameBody, requireSameOrigin, requireUuid } from '@/lib/games/server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await requireFacilitator(request);
    if (!session) throw new GameRequestError('Facilitator access required.', 401);
    const body = await readGameBody(request);
    if (body.groupId !== undefined && body.groupId !== session.groupId) throw new GameRequestError('You can only record your assigned group.', 403);
    if (body.result !== 'correct' && body.result !== 'skip') throw new GameRequestError('Choose Correct or Skip.');
    return gameResponse(await gameRpc('gaap_charades_answer', { p_round_id: requireUuid(body.roundId, 'round'), p_group_id: session.groupId, p_word_id: requireUuid(body.wordId, 'word'), p_result: body.result, p_request_id: requireUuid(body.requestId, 'request ID'), p_credential_version: session.credentialVersion, p_actor: 'facilitator:' + session.sessionId }));
  } catch (error) { return gameError(error); }
}
