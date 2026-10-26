// All simulation settings live here. Change them after the pilot without touching engine code.
export const CONFIG = {
  brandName: 'Trovra',
  timezone: 'Africa/Lagos',
  maxTrials: 3,
  maxResetsPerTrial: 1,

  chat: { replySec: 90, extendedSec: 120, maxReplies: 5 },
  email: { replySec: 180, extendSec: 30, maxReplies: 3 },
  noteSec: 180,

  // Email cases (B and D) arrive, and customer emails reply, this long after the learner's reply.
  nextEmailDelaySec: 60,
  // Short pause before a live-chat customer message appears.
  chatCustomerDelaySec: 3,

  // A client that has not been seen for longer than this is treated as offline.
  offlineGapThresholdSec: 30,
  // Three missed windows in a row close a case as unresolved.
  missedToClose: 3,

  // Client polling interval (seconds).
  pollSec: 4,
  maxMessageChars: 4000
};
