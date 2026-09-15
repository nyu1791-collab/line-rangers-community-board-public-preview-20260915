# New character board — private evaluation

This checkout is isolated from line-rangers-fan/line-rangers-pvp. No production PvP source, workflows, data or history is modified or written by this application.

## Evaluation flow

The root page shows a compact board entry, a featured-comment/NEW activity preview, and a shortcut to the existing production rankings (a link, not a copied or recomputed ranking). `/boards` provides display names, two polls, text / local photo or video posts, video details with text-only replies, named likes, named helpful reactions, three sorting modes, one basic contribution title, pinning, hiding and restoration. Owner can grant/revoke moderators. Storage is D1 and R2; browser storage is only the selected language.

This evaluation is owner-private and uses platform ChatGPT authentication. Server identity comes from trusted platform headers; the server-only BOARD_OWNER_EMAIL setting binds the verified owner at profile creation, then ownership remains on the stored stable subject. Client role fields and display names never grant privileges. The general-public anonymous-authentication design is not yet enabled.

## Verified locally

- TypeScript type check and production Worker build.
- Thirty automated checks cover the real route implementation and built Worker: JST boundaries, media signatures and byte ranges, text-only reply rules, RBAC, authentication and cross-origin rejection, profile rename stability, unique/updatable votes, idempotent posts, named likes/helpful reactions, read markers, maximum two levels, moderation audit, rate limits, D1/R2 persistence and rendered entry output.
- The signed-out browser flow and failure isolation were checked in the supervised preview. These checks do not substitute for multiple real visitor accounts or a full range of physical phones and video codecs.

## Remaining before general release

- Translation controls are intentionally hidden from this lightweight board UI. The isolated API and cache remain behind the feature flag for compatibility, but no comment action sends users away from the board.
- September evaluation shows only the user-confirmed yellow-image `u1631e-sally` topic, under the plain name `かに座 サリー`. Historical evaluation rows are retained but no longer shown as a second evolution topic. A month rollover alone never switches topics: a catalog entry must carry an exact ID, image, JST release month and `confirmed: true`. Verified new-character release ingestion has not been enabled, and no PvP first-seen character is automatically called a new release.
- Uploaded-video list cards never mount a media element or call `/api/media`; the detail player uses `preload="metadata"`, HTTP Range and a 4 MiB per-response cap (including open-ended requests). The card displays a readable filename and play affordance until a background poster generator is introduced.
- Non-Japanese UI strings include English fallbacks. Full translation review remains.
- Full physical-phone codec playback and multiple-account deployed identity testing remain. Private owner-only access cannot test multiple real visitors simultaneously.
- More than 50 named likes and more than 100 moderation records need UI pagination before general release. Moderation deletion is a soft deletion; audit and original records are retained.
- Public deployment requires abuse testing, backup/restore drill, retention policy, source-release verification, secure anonymous identity and server translation provider configuration.

No claim is made that this evaluation is ready for unrestricted public traffic.
