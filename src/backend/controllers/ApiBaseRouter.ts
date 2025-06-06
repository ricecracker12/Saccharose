import bodyParser from 'body-parser';
import { create } from '../routing/router.ts';
import { apiErrorHandler } from '../middleware/response/globalErrorHandler.ts';
import apiAccessControlHeaders from '../middleware/api/apiAccessControlHeaders.ts';
import apiAuth from '../middleware/api/apiAuth.ts';
import GenshinResources from './genshin/api/_index.ts';
import StarRailResources from './hsr/api/_index.ts';
import ZenlessResources from './zenless/api/_index.ts';
import WuwaResources from './wuwa/api/_index.ts';
import GenericResources from './generic/api/genericResources.ts';
import MwResources from './generic/api/mwResources.ts';
import ScriptJobResources from './generic/api/scriptJobResources.ts';
import UserResources from './site/api/userResources.ts';
import { getGenshinControl } from '../domain/genshin/genshinControl.ts';
import { getStarRailControl } from '../domain/hsr/starRailControl.ts';
import { getZenlessControl } from '../domain/zenless/zenlessControl.ts';
import { getWuwaControl } from '../domain/wuwa/wuwaControl.ts';
import { Request, Response, Router } from 'express';
import { GENSHIN_DISABLED, HSR_DISABLED, WUWA_DISABLED, ZENLESS_DISABLED } from '../loadenv.ts';
import { createLocalControls } from '../middleware/request/tracer.ts';

export default async function(): Promise<Router> {
  const router: Router = create({
    layouts: ['layouts/empty-layout'],
    locals: async (req: Request) => {
      const localControls = createLocalControls(req);
      return {
        ... localControls,
        outputLangCode: req.context.outputLangCode,
        inputLangCode: req.context.inputLangCode
      };
    }
  });

  // API Middleware
  // ~~~~~~~~~~~~~~
  router.use(bodyParser.json());
  router.use(apiAccessControlHeaders);
  router.use(apiAuth);

  // Add API Resources
  // ~~~~~~~~~~~~~~~~~
  if (!GENSHIN_DISABLED)
    GenshinResources(router)
  if (!HSR_DISABLED)
    StarRailResources(router);
  if (!ZENLESS_DISABLED)
    ZenlessResources(router);
  if (!WUWA_DISABLED)
    WuwaResources(router);
  GenericResources(router);
  MwResources(router);
  ScriptJobResources(router);
  UserResources(router);

  // Client Error Handlers
  // ~~~~~~~~~~~~~~~~~~~~~
  router.route('*').all((_req: Request, res: Response) => {
    res.status(404).send();
  });
  router.use(apiErrorHandler);

  return router;
}
