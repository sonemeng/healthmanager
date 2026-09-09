import { createRouter } from "./init";
import { observationsRouter } from "./routers/observations";
import { medicationsRouter } from "./routers/medications";
import { importJobsRouter } from "./routers/importJobs";
import { sharingRouter } from "./routers/sharing";
import { aiRouter } from "./routers/ai";
import { aiChannelsRouter } from "./routers/ai-channels";
import { profilesRouter } from "./routers/profiles";
import { preferencesRouter } from "./routers/preferences";
import { metricsRouter } from "./routers/metrics";
import { integrationsRouter } from "./routers/integrations";
import { optimalRangesRouter } from "./routers/optimalRanges";
import { feedbackRouter } from "./routers/feedback";
import { testingRouter } from "./routers/testing";
import { conditionsRouter } from "./routers/conditions";
import { encountersRouter } from "./routers/encounters";

export const appRouter = createRouter({
  observations: observationsRouter,
  medications: medicationsRouter,
  importJobs: importJobsRouter,
  sharing: sharingRouter,
  ai: aiRouter,
  aiChannels: aiChannelsRouter,
  profiles: profilesRouter,
  preferences: preferencesRouter,
  metrics: metricsRouter,
  integrations: integrationsRouter,
  optimalRanges: optimalRangesRouter,
  feedback: feedbackRouter,
  testing: testingRouter,
  conditions: conditionsRouter,
  encounters: encountersRouter,
});

export type AppRouter = typeof appRouter;
