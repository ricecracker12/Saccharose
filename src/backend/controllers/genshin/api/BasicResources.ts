import { create } from '../../../routing/router';
import { getGenshinControl } from '../../../domain/genshin/genshinControl';
import {
  handleIdUsagesEndpoint,
  handleOlEndpoint,
  handleTextMapSearchEndpoint,
} from '../../generic/api/basicResourceResources';
import { NextFunction, Request, Response, Router } from 'express';

const router: Router = create();

router.endpoint('/search-textmap', {
  get: async (req: Request, res: Response) => {
    await handleTextMapSearchEndpoint(getGenshinControl(req), req, res)
  }
});

router.endpoint('/OL/generate', {
  get: async (req: Request, res: Response) => {
    await handleOlEndpoint(getGenshinControl(req), req, res);
  }
});

router.endpoint('/id-usages', {
  get: async (req: Request, res: Response) => {
    await handleIdUsagesEndpoint(getGenshinControl(req), req, res);
  }
});

export default router;
