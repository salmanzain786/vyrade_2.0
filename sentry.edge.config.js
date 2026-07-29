// Sentry initialization for the edge runtime (middleware, edge routes). Shares
// the privacy-hardened options from lib/monitoring/sentryScrub.js.
import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions } from "./lib/monitoring/sentryScrub.js";

Sentry.init(baseSentryOptions());
