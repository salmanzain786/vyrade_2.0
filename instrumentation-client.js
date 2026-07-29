// Sentry initialization on the client (browser). Shares the privacy-hardened
// options from lib/monitoring/sentryScrub.js.
//
// Session Replay is deliberately NOT enabled: it records the DOM, which in this
// app shows Blueprint text, emails and workflow content. Even with masking that
// is a PII vector we don't want by default. Re-enable only after a masking
// review (maskAllText + blockAllMedia + maskAllInputs) — it's a config flip.
import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions } from "./lib/monitoring/sentryScrub.js";

Sentry.init(baseSentryOptions());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
