'use strict';

/**
 * Indica si el `ask` ya tiene una respuesta que lo cierra para este hilo.
 * Para el mismo correlationId con varios destinatarios (@all), solo cuenta
 * la respuesta emitida por la sesión que recibió ese ask (ask.to).
 */
function askHasMatchingReply(messages, ask) {
  if (!ask || ask.kind !== 'ask' || !ask.correlationId) return true;
  return messages.some((m) => {
    if (m.kind !== 'reply' || m.correlationId !== ask.correlationId) return false;
    if (ask.to) return m.from === ask.to;
    return m.to === ask.from;
  });
}

module.exports = { askHasMatchingReply };
