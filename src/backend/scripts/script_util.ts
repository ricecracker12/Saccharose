// noinspection JSUnusedGlobalSymbols

import { Knex } from 'knex';
import { openKnex } from '../util/db';
import { AvatarExcelConfigData, ConfigCondition, NpcExcelConfigData } from '../../shared/types/general-types';
import { getTextMapItem, getVoPrefix } from './textmap';
import { Request } from '../util/router';
import SrtParser, { SrtLine } from '../util/srtParser';
import { promises as fs } from 'fs';
import { arrayIndexOf, arrayIntersect } from '../../shared/util/arrayUtil';
import { toInt, toNumber } from '../../shared/util/numberUtil';
import { normalizeRawJson } from './importer/import_run';
import { extractRomanNumeral, isStringBlank, replaceAsync, romanToInt } from '../../shared/util/stringUtil';
import {
  DialogExcelConfigData,
  LangCode,
  ManualTextMapConfigData,
  ReminderExcelConfigData,
  TalkExcelConfigData,
  TalkRole,
} from '../../shared/types/dialogue-types';
import {
  ChapterCollection,
  ChapterExcelConfigData,
  MainQuestExcelConfigData,
  QuestExcelConfigData,
  QuestType,
  ReputationQuestExcelConfigData,
} from '../../shared/types/quest-types';
import {
  ADVENTURE_EXP_ID,
  MaterialExcelConfigData,
  MaterialSourceDataExcelConfigData,
  MORA_ID,
  PRIMOGEM_ID,
  RewardExcelConfigData,
} from '../../shared/types/material-types';
import {
  FurnitureSuiteExcelConfigData,
  HomeWorldEventExcelConfigData,
  HomeWorldFurnitureExcelConfigData,
  HomeWorldFurnitureTypeExcelConfigData,
  HomeWorldNPCExcelConfigData,
} from '../../shared/types/homeworld-types';
import { grep, grepIdStartsWith, grepStream, normJsonGrep, normJsonGrepCmp } from '../util/shellutil';
import { getGenshinDataFilePath, getTextMapRelPath } from '../loadenv';

// TODO improve this method - it sucks
//   Only works for languages that use spaces for word boundaries (i.e. not chinese)
//   and only works for one word (i.e. doesn't expand the {{rubi}} to multiple words)
export const convertRubi = (text: string) => {
  let ruby = [];

  let i = 0;
  text = text.replace(/{RUBY#\[S]([^}]+)}/g, (match, p1) => {
    ruby.push(p1);
    return '{RUBY'+(i++)+'}';
  });

  let parts = text.split(/(\s+)/); // keep whitespace parts

  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes('{RUBY')) {
      parts[i] = parts[i].replace(/^(.*){RUBY(\d+)}(.*)/, (match, p1, p2, p3) => `{{Rubi|${p1}${p3}|${ruby[parseInt(p2)]}}}`);
    }
  }
  return parts.join('');
}

export const travelerPlaceholder = (langCode: LangCode = 'EN') => {
  switch (langCode) {
    case 'CHS': return '(旅行者)';
    case 'CHT': return '(旅行者)';
    case 'DE': return '{{MC|m=Reisender|f=Reisende}}';
    case 'EN': return '(Traveler)';
    case 'ES': return '{{MC|m=Viajero|f=Viajera}}';
    case 'FR': return '{{MC|m=Voyageur|f=Voyageuse}}'
    case 'ID': return '(Pengembara)';
    case 'IT': return '{{MC|m=Viaggiatore|f=Viaggiatrice}}';
    case 'JP': return '(旅人)';
    case 'KR': return '(여행자)';
    case 'PT': return '(Viajante)';
    case 'RU': return '{{MC|m=Путешественник|f=Путешественница}}';
    case 'TH': return '(นักเดินทาง)';
    case 'TR': return '(Gezgin)';
    case 'VI': return '(Nhà Lữ Hành)';
  }
  return '(Traveler)';
}

export const normText = (text: string, langCode: LangCode = 'EN') => {
  if (!text) {
    return text;
  }
  text = text.replace(/—/g, '&mdash;').trim();
  text = text.replace(/{NICKNAME}/g, travelerPlaceholder(langCode));
  text = text.replace(/{NON_BREAK_SPACE}/g, '&nbsp;');
  text = text.replace(/{F#([^}]+)}{M#([^}]+)}/g, '{{MC|m=$2|f=$1}}');
  text = text.replace(/{M#([^}]+)}{F#([^}]+)}/g, '{{MC|m=$1|f=$2}}');
  text = text.replace(/<color=#00E1FFFF>([^<]+)<\/color>/g, '{{color|buzzword|$1}}');
  text = text.replace(/<color=#FFCC33FF>([^<]+)<\/color>/g, '{{color|help|$1}}');

  text = text.replace(/<color=#FFACFFFF>([^<]+)<\/color>/g, '{{Electro|$1}}');
  text = text.replace(/<color=#99FFFFFF>([^<]+)<\/color>/g, '{{Cryo|$1}}');
  text = text.replace(/<color=#80C0FFFF>([^<]+)<\/color>/g, '{{Hydro|$1}}');
  text = text.replace(/<color=#FF9999FF>([^<]+)<\/color>/g, '{{Pyro|$1}}');
  text = text.replace(/<color=#99FF88FF>([^<]+)<\/color>/g, '{{Dendro|$1}}');
  text = text.replace(/<color=#80FFD7FF>([^<]+)<\/color>/g, '{{Anemo|$1}}');
  text = text.replace(/<color=#FFE699FF>([^<]+)<\/color>/g, '{{Geo|$1}}');

  text = text.replace(/<color=#37FFFF>([^<]+) ?<\/color>/g, "'''$1'''");
  text = text.replace(/<color=(#[0-9a-fA-F]{6})FF>([^<]+)<\/color>/g, '{{color|$1|$2}}');

  text = text.replace(/\\"/g, '"');
  text = text.replace(/\r/g, '');
  text = text.replace(/\\?\\n|\n/g, '<br />');
  text = text.replace(/#\{REALNAME\[ID\(1\)(\|HOSTONLY\(true\))?]}/g, '(Wanderer)');

  if (text.includes('RUBY#[S]')) {
    text = convertRubi(text);
  }

  if (text.startsWith('#')) {
    text = text.slice(1);
  }
  return text;
}

const DEFAULT_LANG: LangCode = 'EN';

export class ControlState {
  // Instances:
  KnexInstance: Knex = null;
  Request: Request = null;

  // Caches:
  dialogCache:  {[Id: number]: DialogExcelConfigData} = {};
  npcCache:     {[Id: number]: NpcExcelConfigData}    = {};
  avatarCache:  {[Id: number]: AvatarExcelConfigData} = {};

  // Preferences:
  ExcludeOrphanedDialogue = false;

  get inputLangCode(): LangCode {
    return this.Request ? this.Request.cookies['inputLangCode'] || DEFAULT_LANG : DEFAULT_LANG;
  }

  get outputLangCode(): LangCode {
    return this.Request ? this.Request.cookies['outputLangCode'] || DEFAULT_LANG : DEFAULT_LANG;
  }
}

export function getControl(controlState?: Request|ControlState) {
  return new Control(controlState);
}

// TODO: Make this not a god object
export class Control {
  readonly state: ControlState;
  private knex: Knex;

  private IdComparator = (a: any, b: any) => a.Id === b.Id;
  private sortByOrder = (a: any, b: any) => {
    return a.Order - b.Order || a.Order - b.Order;
  };

  constructor(controlState: Request|ControlState) {
    if (!!controlState && controlState.hasOwnProperty('url')) {
      this.state = new ControlState();
      this.state.Request = controlState as Request;
    } else if (!!controlState) {
      this.state = controlState as ControlState;
    } else {
      this.state = new ControlState();
    }

    this.knex = this.state.KnexInstance || openKnex();
  }

  postProcessCondProp(obj: any, prop: string) {
    if (!Array.isArray(obj[prop])) {
      return;
    }
    let condArray = obj[prop] as ConfigCondition[];
    let newCondArray = [];
    for (let cond of condArray) {
      if (cond.Param) {
        cond.Param = cond.Param.filter(x => !!x);
      }
      if (cond.Param && cond.Param.length) {
        newCondArray.push(cond);
      }
    }
    if (newCondArray.length) {
      obj[prop] = newCondArray;
    } else {
      delete obj[prop];
    }
  }

  async postProcess<T>(object: T): Promise<T> {
    if (!object)
      return object;
    const objAsAny = object as any;
    for (let prop in object) {
      if (prop.endsWith('MapHash')) {
        let textProp = prop.slice(0, -7);
        //let text = await knex.select('Text').from('TextMap').where({Id: object[prop]}).first().then(x => x && x.Text);
        let text = getTextMapItem(this.outputLangCode, object[prop]);
        if (!!text)
          object[textProp] = text;
        else
          delete object[prop];
      }
      if (prop === 'TitleTextMapHash') {
        object['TitleTextEN'] = getTextMapItem('EN', object['TitleTextMapHash']);
      }
      if (prop.endsWith('Cond') && objAsAny[prop]) {
        this.postProcessCondProp(objAsAny, prop);
      }
      if (prop.endsWith('Exec') && objAsAny[prop]) {
        this.postProcessCondProp(objAsAny, prop);
      }
      if ((prop.endsWith('NpcList') || prop.endsWith('NpcId')) && Array.isArray(objAsAny[prop])) {
        let slicedProp = prop.endsWith('NpcList') ? prop.slice(0, -4) : prop.slice(0, -2);
        let dataList: NpcExcelConfigData[] = (await this.getNpcList(object[prop] as any, false));
        object[slicedProp+'DataList'] = dataList;
        object[slicedProp+'NameList'] = dataList.map(x => x.NameText);
      }
      if (prop.endsWith('NpcId') && !Array.isArray(objAsAny[prop])) {
        let slicedProp = prop.slice(0, -2);
        object[slicedProp] = await this.getNpc(objAsAny[prop]);
      }
      if (prop == 'TalkRole') {
        let TalkRole = (<any> object[prop]) as TalkRole;
        let TalkRoleId: number = null;

        if (typeof TalkRole.Id === 'string') {
          TalkRoleId = parseInt(TalkRole.Id);
          if (isNaN(TalkRoleId)) {
            TalkRole.NameText = TalkRole.Id as string;
          }
        } else {
          TalkRoleId = TalkRole.Id;
        }

        if (TalkRole.Type === 'TALK_ROLE_PLAYER') {
          delete TalkRole.Id;
          continue;
        }

        let npc = await this.getNpc(TalkRoleId);
        if (npc) {
          TalkRole.NameTextMapHash = npc.NameTextMapHash;
          TalkRole.NameText = npc.NameText;
        }
      }
      if (prop === 'AvatarId' && typeof objAsAny[prop] === 'number') {
        objAsAny.Avatar = await this.selectAvatarById(objAsAny[prop]);
      }
      if (object[prop] === null || objAsAny[prop] === '') {
        delete object[prop];
      }
    }
    if (!objAsAny.TalkRoleNameText && !!objAsAny.TalkRole) {
      objAsAny.TalkRoleNameText = objAsAny.TalkRole.NameText;
      objAsAny.TalkRoleNameTextMapHash = objAsAny.TalkRole.NameTextMapHash;
    }
    return object;
  }

  readonly commonLoad = async (result: any[]) => await Promise.all(
    result.map(record => !record || !record.json_data ? this.postProcess(record) : this.postProcess(JSON.parse(record.json_data)))
  );

  readonly commonLoadFirst = async (record: any) => !record ? record : await this.postProcess(JSON.parse(record.json_data));

  async getNpc(npcId: number): Promise<NpcExcelConfigData> {
    if (!npcId) return null;
    return await this.getNpcList([ npcId ]).then(x => x && x.length ? x[0] : null);
  }

  async getNpcList(npcIds: number[], addToCache: boolean = true): Promise<NpcExcelConfigData[]> {
    if (!npcIds || !npcIds.length) return [];

    let notCachedIds = npcIds.filter(id => !this.state.npcCache[id]);
    let cachedList = npcIds.map(id => this.state.npcCache[id]).filter(x => !!x);

    let uncachedList: NpcExcelConfigData[] = await this.knex.select('*').from('NpcExcelConfigData')
      .whereIn('Id', notCachedIds).then(this.commonLoad);

    if (addToCache) {
      uncachedList.forEach(npc => this.state.npcCache[npc.Id] = npc);
    }

    return cachedList.concat(uncachedList);
  }

  private postProcessMainQuest(mainQuest: MainQuestExcelConfigData): MainQuestExcelConfigData {
    if (!mainQuest) {
      return mainQuest;
    }
    let tempType: string = mainQuest.Type;

    if (!tempType && mainQuest.LuaPath && /Quest\/[ALEWM]Q/.test(mainQuest.LuaPath)) {
      tempType = /Quest\/([ALEWM]Q)/.exec(mainQuest.LuaPath)[1];
    }
    if (tempType === 'MQ') {
      tempType = 'AQ';
    }
    if (tempType === 'LQ') {
      tempType = 'SQ';
    }
    mainQuest.Type = tempType as QuestType;
    return mainQuest;
  }

  private postProcessMainQuests(mainQuestList: MainQuestExcelConfigData[]): MainQuestExcelConfigData[] {
    return mainQuestList.map(mainQuest => this.postProcessMainQuest(mainQuest)).filter(x => !!x);
  }

  async selectMainQuestsByNameOrId(name: string|number, limit: number = 25): Promise<MainQuestExcelConfigData[]> {
    if (typeof name === 'string') {
      let matches = await this.getTextMapMatches(this.inputLangCode, name);
      let textMapIds = Object.keys(matches).map(i => parseInt(i));

      return await this.knex.select('*').from('MainQuestExcelConfigData')
        .whereIn('TitleTextMapHash', textMapIds)
        .limit(limit).then(this.commonLoad).then(x => this.postProcessMainQuests(x));
    } else {
      return [await this.selectMainQuestById(name)];
    }
  }

  async selectMainQuestById(id: number): Promise<MainQuestExcelConfigData> {
    return await this.knex.select('*').from('MainQuestExcelConfigData')
      .where({Id: id}).first().then(this.commonLoadFirst).then(x => this.postProcessMainQuest(x));
  }

  async selectMainQuestsByChapterId(chapterId: number): Promise<MainQuestExcelConfigData[]> {
    return await this.knex.select('*').from('MainQuestExcelConfigData')
      .where({ChapterId: chapterId}).then(this.commonLoad).then(x => this.postProcessMainQuests(x));
  }

  async selectMainQuestsBySeries(series: number): Promise<MainQuestExcelConfigData[]> {
    return await this.knex.select('*').from('MainQuestExcelConfigData')
      .where({Series: series}).then(this.commonLoad).then(x => this.postProcessMainQuests(x));
  }

  async selectAllQuestExcelConfigDataByMainQuestId(id: number): Promise<QuestExcelConfigData[]> {
    return await this.knex.select('*').from('QuestExcelConfigData')
      .where({MainId: id}).then(this.commonLoad)
      .then(quests => quests.sort(this.sortByOrder));
  }

  async selectQuestExcelConfigData(id: number): Promise<QuestExcelConfigData> {
    return await this.knex.select('*').from('QuestExcelConfigData')
      .where({SubId: id}).first().then(this.commonLoadFirst);
  }

  async selectManualTextMapConfigDataById(id: string): Promise<ManualTextMapConfigData> {
    return await this.knex.select('*').from('ManualTextMapConfigData')
      .where({TextMapId: id}).first().then(this.commonLoadFirst);
  }

  async selectTalkExcelConfigDataById(id: number): Promise<TalkExcelConfigData> {
    return await this.knex.select('*').from('TalkExcelConfigData')
      .where({Id: id}).orWhere({QuestCondStateEqualFirst: id}).first().then(this.commonLoadFirst);
  }

  async selectTalkExcelConfigDataByQuestSubId(id: number): Promise<TalkExcelConfigData> {
    return await this.knex.select('*').from('TalkExcelConfigData')
      .where({Id: id}).orWhere({QuestCondStateEqualFirst: id}).first().then(this.commonLoadFirst);
  }

  async selectTalkExcelConfigDataIdsByPrefix(idPrefix: number|string): Promise<number[]> {
    let allTalkExcelTalkConfigIds = this.state.ExcludeOrphanedDialogue ? []
      : await grepIdStartsWith('Id', idPrefix, './ExcelBinOutput/TalkExcelConfigData.json');
    return allTalkExcelTalkConfigIds.map(i => toNumber(i));
  }

  async selectTalkExcelConfigDataByFirstDialogueId(firstDialogueId: number): Promise<TalkExcelConfigData> {
    return await this.knex.select('*').from('TalkExcelConfigData').where({InitDialog: firstDialogueId}).first().then(this.commonLoadFirst);
  }

  async addOrphanedDialogueAndQuestMessages(mainQuest: MainQuestExcelConfigData) {
    let allDialogueIds = this.state.ExcludeOrphanedDialogue ? [] : await grepIdStartsWith('id', mainQuest.Id, './ExcelBinOutput/DialogExcelConfigData.json');
    let allQuestMessageIds = await grepIdStartsWith('TextMapId', 'QUEST_Message_Q' + mainQuest.Id, './ExcelBinOutput/ManualTextMapConfigData.json');
    let consumedQuestMessageIds = [];

    const handleOrphanedDialog = async (quest: MainQuestExcelConfigData|QuestExcelConfigData, id: number) => {
      if (this.state.dialogCache[id])
        return;
      let dialog = await this.selectSingleDialogExcelConfigData(id as number);
      if (dialog) {
        if (!quest.OrphanedDialog)
          quest.OrphanedDialog = [];
        let dialogs = await this.selectDialogBranch(dialog);
        quest.OrphanedDialog.push(dialogs);
      }
    }

    for (let quest of mainQuest.QuestExcelConfigDataList) {
      for (let id of allDialogueIds) {
        if (!id.toString().startsWith(quest.SubId.toString()))
          continue;
        await handleOrphanedDialog(quest, id as number);
      }
      if (allQuestMessageIds && allQuestMessageIds.length) {
        quest.QuestMessages = [];
        for (let id of allQuestMessageIds) {
          if (!id.toString().startsWith('QUEST_Message_Q' + quest.SubId.toString()))
            continue;
          quest.QuestMessages.push(await this.selectManualTextMapConfigDataById(id as string));
          consumedQuestMessageIds.push(id);
        }
      }
    }
    for (let id of allDialogueIds) {
      await handleOrphanedDialog(mainQuest, id as number);
    }
    if (allQuestMessageIds && allQuestMessageIds.length) {
      mainQuest.QuestMessages = [];
      for (let id of allQuestMessageIds) {
        if (consumedQuestMessageIds.includes(id))
          continue;
        mainQuest.QuestMessages.push(await this.selectManualTextMapConfigDataById(id as string));
      }
    }
  }

  async selectTalkExcelConfigDataByQuestId(questId: number): Promise<TalkExcelConfigData[]> {
    return await this.knex.select('*').from('TalkExcelConfigData')
      .where({QuestId: questId})
      .orWhere({QuestCondStateEqualFirst: questId}).then(this.commonLoad);
  }

  async selectTalkExcelConfigDataByNpcId(npcId: number): Promise<TalkExcelConfigData[]> {
    let talkIds: number[] = await this.knex.select('TalkId').from('Relation_NpcToTalk')
      .where({NpcId: npcId}).pluck('TalkId').then();
    return Promise.all(talkIds.map(talkId => this.selectTalkExcelConfigDataById(talkId)));
  }

  async selectDialogExcelConfigDataByTalkRoleId(talkRoleId: number): Promise<DialogExcelConfigData[]> {
    return await this.knex.select('*').from('DialogExcelConfigData')
      .where({TalkRoleId: talkRoleId}).then(this.commonLoad);
  }

  async selectSingleDialogExcelConfigData(id: number): Promise<DialogExcelConfigData> {
    if (this.state.dialogCache[id])
      return this.state.dialogCache[id];
    let result: DialogExcelConfigData = await this.knex.select('*').from('DialogExcelConfigData')
      .where({Id: id}).first().then(this.commonLoadFirst);
    if (!result) {
      return result;
    }
    this.state.dialogCache[id] = result;
    return result && result.TalkContentText ? result : null;
  }

  saveDialogExcelConfigDataToCache(x: DialogExcelConfigData): void {
    this.state.dialogCache[x.Id] = x;
  }
  isDialogExcelConfigDataCached(x: number|DialogExcelConfigData): boolean {
    return !!this.state.dialogCache[typeof x === 'number' ? x : x.Id];
  }

  async selectMultipleDialogExcelConfigData(ids: number[]): Promise<DialogExcelConfigData[]> {
    return await Promise.all(ids.map(id => this.selectSingleDialogExcelConfigData(id)))
      .then(arr => arr.filter(x => !!x && !!x.TalkContentText));
  }

  copyDialogForRecurse(node: DialogExcelConfigData) {
    let copy: DialogExcelConfigData = JSON.parse(JSON.stringify(node));
    copy.Recurse = true;
    return copy;
  }

  async getDialogFromTextContentId(textMapId: number): Promise<DialogExcelConfigData> {
    let result: DialogExcelConfigData = await this.knex.select('*').from('DialogExcelConfigData')
      .where({TalkContentTextMapHash: textMapId})
      .first().then(this.commonLoadFirst);
    if (!result) {
      return undefined;
    }
    this.state.dialogCache[result.Id] = result;
    return result;
  }

  isPlayerDialogueOption(dialog: DialogExcelConfigData): boolean {
    return dialog.TalkRole.Type === 'TALK_ROLE_PLAYER' && dialog.TalkShowType && dialog.TalkShowType === 'TALK_SHOW_FORCE_SELECT';
  }

  async selectDialogBranch(start: DialogExcelConfigData, dialogSeenAlready: number[] = []): Promise<DialogExcelConfigData[]> {
    if (!start)
      return [];
    let currBranch: DialogExcelConfigData[] = [];
    let currNode = start;
    while (currNode) {
      if (dialogSeenAlready.includes(currNode.Id)) {
        currBranch.push(this.copyDialogForRecurse(currNode));
        break;
      } else {
        dialogSeenAlready.push(currNode.Id);
      }

      if (currNode.TalkContentText) {
        currBranch.push(currNode);
      }

      const nextNodes: DialogExcelConfigData[] = await this.selectMultipleDialogExcelConfigData(currNode.NextDialogs);
      if (nextNodes.length === 1) {
        // If only one next node -> same branch
        currNode = nextNodes[0];
      } else if (nextNodes.length > 1) {
        // If multiple next nodes -> branching
        const branches: DialogExcelConfigData[][] = await Promise.all(nextNodes.map(node => this.selectDialogBranch(node, dialogSeenAlready.slice())));
        //console.log('Branches:', branches.map(b => b[0]));
        const intersect = arrayIntersect<DialogExcelConfigData>(branches, this.IdComparator).filter(x => x.TalkRole.Type !== 'TALK_ROLE_PLAYER'); // do not rejoin on a player talk
        //console.log('Intersect:', intersect.length ? intersect[0] : null);
        if (!intersect.length) {
          // branches do not rejoin
          currNode.Branches = branches;
          currNode = null;
        } else {
          // branches rejoin
          let rejoinNode = intersect[0];
          for (let i = 0; i < branches.length; i++) {
            let branch = branches[i];
            branches[i] = branch.slice(0, arrayIndexOf(branch, rejoinNode, this.IdComparator));
          }
          currNode.Branches = branches;
          currNode = rejoinNode;
        }
      } else {
        // No more dialog
        currNode = null;
      }
    }
    return currBranch;
  }

  async selectNpcListByName(nameOrTextMapId: number|string|number[]): Promise<NpcExcelConfigData[]> {
    if (typeof nameOrTextMapId === 'string') {
      nameOrTextMapId = await this.findTextMapIdListByExactName(this.inputLangCode, nameOrTextMapId);
    }
    if (typeof nameOrTextMapId === 'number') {
      nameOrTextMapId = [ nameOrTextMapId ];
    }
    return await this.knex.select('*').from('NpcExcelConfigData')
      .whereIn('NameTextMapHash', <number[]>nameOrTextMapId).then(this.commonLoad);
  }

  doesDialogHaveNpc(dialog: DialogExcelConfigData, npcNames: string[]) {
    if (npcNames.includes(dialog.TalkRole.NameText)) {
      return true;
    }
    if (dialog.Branches) {
      for (let branch of dialog.Branches) {
        for (let branchDialog of branch) {
          if (this.doesDialogHaveNpc(branchDialog, npcNames)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  doesQuestSubHaveNpc(questSub: QuestExcelConfigData, npcNames: string[]) {
    if (questSub.TalkExcelConfigDataList) {
      for (let talkConfig of questSub.TalkExcelConfigDataList) {
        for (let dialog of talkConfig.Dialog) {
          if (this.doesDialogHaveNpc(dialog, npcNames)) {
            return true;
          }
        }
      }
    }
    if (questSub.OrphanedDialog) {
      for (let dialogs of questSub.OrphanedDialog) {
        for (let dialog of dialogs) {
          if (this.doesDialogHaveNpc(dialog, npcNames)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  isBlackScreenDialog(dialog: DialogExcelConfigData): boolean {
    return dialog.TalkRole.Type === 'TALK_ROLE_BLACK_SCREEN' || dialog.TalkRole.Type === 'TALK_ROLE_CONSEQUENT_BLACK_SCREEN'
      || dialog.TalkRole.Type === 'TALK_ROLE_NEED_CLICK_BLACK_SCREEN' || dialog.TalkRole.Type === 'TALK_ROLE_CONSEQUENT_NEED_CLICK_BLACK_SCREEN';
  }

  async generateDialogueWikiText(dialogLines: DialogExcelConfigData[], dialogDepth = 1,
        originatorDialog: DialogExcelConfigData = null, originatorIsFirstOfBranch: boolean = false,
        firstDialogOfBranchVisited: Set<number> = new Set()): Promise<string> {
    let out = '';
    let numSubsequentNonBranchPlayerDialogOption = 0;
    let previousDialog: DialogExcelConfigData = null;

    if (dialogLines.length) {
      firstDialogOfBranchVisited.add(dialogLines[0].Id);
    }

    for (let i = 0; i < dialogLines.length; i++) {
      let dialog: DialogExcelConfigData = dialogLines[i];

      // DIcon Prefix
      // ~~~~~~~~~~~~
      let diconPrefix: string;

      if (i == 0 && dialog.TalkRole.Type === 'TALK_ROLE_PLAYER') {
        if (originatorDialog && originatorDialog.TalkRole.Type === 'TALK_ROLE_PLAYER' && !originatorIsFirstOfBranch) {
          diconPrefix = ':'.repeat(dialogDepth);
          dialogDepth += 1;
        } else {
          diconPrefix = ':'.repeat((dialogDepth - 1 ) || 1);
        }
      } else {
        diconPrefix = ':'.repeat(dialogDepth);
      }

      let prefix: string = ':'.repeat(dialogDepth);
      let text: string = normText(dialog.TalkContentText, this.outputLangCode);

      // Traveler SEXPRO
      // ~~~~~~~~~~~~~~~

      if (text.includes('SEXPRO')) {
        text = await replaceAsync(text, /\{PLAYERAVATAR#SEXPRO\[(.*)\|(.*)]}/g, async (_fullMatch, g1, g2) => {
          let g1e = await this.selectManualTextMapConfigDataById(g1);
          let g2e = await this.selectManualTextMapConfigDataById(g2);
          if (g1.includes('FEMALE')) {
            return `{{MC|m=${g2e.TextMapContentText}|f=${g1e.TextMapContentText}}}`;
          } else {
            return `{{MC|m=${g1e.TextMapContentText}|f=${g2e.TextMapContentText}}}`;
          }
        });
      }

      // Subsequent Non-Branch Dialogue Options
      // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

      if (previousDialog && this.isPlayerDialogueOption(dialog) && this.isPlayerDialogueOption(previousDialog) &&
          (previousDialog.NextDialogs.length === 1 || previousDialog.Branches.map(b => b[0]).every(x => this.isPlayerDialogueOption(x))) &&
          previousDialog.NextDialogs.some(x => x === dialog.Id)) {
        // This is for if you have non-branch subsequent player dialogue options for the purpose of generating an output like:
        // :'''Paimon:''' Blah blah blah
        // :{{DIcon}} Paimon, you're sussy baka
        // ::{{DIcon}} And you're emergency food too
        // :'''Paimon:''' Nani!?!?
        // The second dialogue option is indented to show it is an option that follows the previous option rather than
        // the player being presented with two dialogue options at the same time.
        numSubsequentNonBranchPlayerDialogOption++;
      } else {
        numSubsequentNonBranchPlayerDialogOption = 0;
      }

      // Voice-Overs
      // ~~~~~~~~~~~
      let voPrefix = getVoPrefix('Dialog', dialog.Id, text, dialog.TalkRole.Type);

      // Output Append
      // ~~~~~~~~~~~~~

      if (this.isBlackScreenDialog(dialog)) {
        if (!previousDialog || !this.isBlackScreenDialog(previousDialog)) {
          out += '\n';
        }
        out += `\n${prefix}'''${text}'''`;
        out += '\n';
      } else if (dialog.TalkRole.Type === 'TALK_ROLE_PLAYER') {
        if (voPrefix) {
          out += `\n${diconPrefix}${voPrefix}'''(Traveler):''' ${text}`;
        } else {
          out += `\n${diconPrefix}${':'.repeat(numSubsequentNonBranchPlayerDialogOption)}{{DIcon}} ${text}`;
        }
      } else if (dialog.TalkRole.Type === 'TALK_ROLE_NPC' || dialog.TalkRole.Type === 'TALK_ROLE_GADGET') {
        let name = normText(dialog.TalkRoleNameText, this.outputLangCode);
        out += `\n${prefix}${voPrefix}'''${name}:''' ${text}`;
      } else if (dialog.TalkRole.Type === 'TALK_ROLE_MATE_AVATAR') {
        out += `\n${prefix}${voPrefix}'''(Traveler's Sibling):''' ${text}`;
      } else {
        if (text) {
          out += `\n${prefix}:'''Cutscene_Character_Replace_me:''' ${text}`;
        } else {
          console.warn('Dialog with unknown TalkRole.Type "' + dialog.TalkRole.Type + '" and without text:', dialog);
        }
      }

      if (dialog.Recurse) {
        if (dialog.TalkRole.Type === 'TALK_ROLE_PLAYER') {
          out += `\n${diconPrefix};(Return to option selection)`;
        } else {
          out += `\n${diconPrefix.slice(0,-1)};(Return to option selection)`;
        }
      }

      // Next Branches
      // ~~~~~~~~~~~~~

      if (dialog.Branches && dialog.Branches.length) {
        let temp = new Set<number>(firstDialogOfBranchVisited);
        for (let dialogBranch of dialog.Branches) {
          if (!dialogBranch.length) {
            continue;
          }
          temp.add(dialogBranch[0].Id);
        }

        let excludedCount = 0;
        let includedCount = 0;
        for (let dialogBranch of dialog.Branches) {
          if (!dialogBranch.length) {
            continue;
          }
          if (firstDialogOfBranchVisited.has(dialogBranch[0].Id)) {
            excludedCount++;
            continue;
          }
          includedCount++;
          out += await this.generateDialogueWikiText(dialogBranch, dialogDepth + 1, dialog, i === 0, temp);
        }
        if (includedCount === 0 && excludedCount > 0) {
          out += `\n${diconPrefix};(Return to option selection)`;
        }
      }

      previousDialog = dialog;
    }
    return out;
  }

  getPrefs(): ControlState {
    return this.state;
  }

  get inputLangCode() {
    return this.state.inputLangCode;
  }

  get outputLangCode() {
    return this.state.outputLangCode;
  }

  readonly FLAG_EXACT_WORD = '-w';
  readonly FLAG_REGEX = '-E';

  async getTextMapMatches(langCode: LangCode, searchText: string, flags?: string): Promise<{[id: number]: string}> {
    if (isStringBlank(searchText)) {
      return {};
    }
    let lines = await grep(searchText, getTextMapRelPath(langCode), flags);
    let out = {};
    for (let line of lines) {
      let parts = /^"(\d+)":\s+"(.*)",?$/.exec(line);
      out[parts[1]] = normJsonGrep(parts[2]);
    }
    return out;
  }

  async streamTextMapMatches(langCode: LangCode, searchText: string, stream: (textMapId: number, text: string) => void, flags?: string): Promise<number|Error> {
    if (isStringBlank(searchText)) {
      return 0;
    }
    return await grepStream(searchText, getTextMapRelPath(langCode), line => {
      if (!line)
        return;
      let parts = /^"(\d+)":\s+"(.*)",?$/.exec(line.trim());
      if (!parts)
        return;
      let textMapId = toInt(parts[1]);
      let text = normJsonGrep(parts[2]);
      stream(textMapId, text);
    }, flags);
  }

  async getTextMapIdStartsWith(langCode: LangCode, idPrefix: string): Promise<{[id: number]: string}> {
    let lines = await grep(`^\\s*"${idPrefix}\\d+": "`, getTextMapRelPath(langCode), this.FLAG_REGEX);
    let out = {};
    for (let line of lines) {
      let parts = /^"(\d+)":\s+"(.*)",?$/.exec(line);
      out[parts[1]] = normJsonGrep(parts[2]);
    }
    return out;
  }

  async findTextMapIdByExactName(langCode: LangCode, name: string): Promise<number> {
    let matches = await this.getTextMapMatches(langCode, name, this.FLAG_EXACT_WORD);
    for (let [id,value] of Object.entries(matches)) {
      if (normJsonGrepCmp(value, name)) {
        return parseInt(id);
      }
    }
    return 0;
  }

  async findTextMapIdListByExactName(langCode: LangCode, name: string): Promise<number[]> {
    let results = [];
    let matches = await this.getTextMapMatches(langCode, name, this.FLAG_EXACT_WORD);
    for (let [id,value] of Object.entries(matches)) {
      if (normJsonGrepCmp(value, name)) {
        results.push(parseInt(id));
      }
    }
    return results;
  }

  equivDialog(d1: DialogExcelConfigData, d2: DialogExcelConfigData): boolean {
    if (!d1 || !d2) return false;

    return d1.TalkContentText === d2.TalkContentText && d1.TalkRoleNameText === d2.TalkRoleNameText && d1.TalkRole.Type === d2.TalkRole.Type;
  }

  async selectAvatarById(id: number): Promise<AvatarExcelConfigData> {
    if (this.state.avatarCache.hasOwnProperty(id)) {
      return this.state.avatarCache[id];
    }
    let avatar: AvatarExcelConfigData = await this.knex.select('*').from('AvatarExcelConfigData')
      .where({Id: id}).first().then(this.commonLoadFirst);
    this.state.avatarCache[id] = avatar;
    return avatar;
  }

  async selectAllAvatars(): Promise<AvatarExcelConfigData[]> {
    return await this.knex.select('*').from('AvatarExcelConfigData').then(this.commonLoad);
  }

  async selectAllReminders(): Promise<ReminderExcelConfigData[]> {
    return await this.knex.select('*').from('ReminderExcelConfigData').then(this.commonLoad);
  }

  async selectReminderById(id: number): Promise<ReminderExcelConfigData> {
    return await this.knex.select('*').from('ReminderExcelConfigData')
      .where({Id: id}).first().then(this.commonLoadFirst);
  }

  async selectReminderByContentTextMapId(id: number): Promise<ReminderExcelConfigData> {
    return await this.knex.select('*').from('ReminderExcelConfigData')
      .where({ContentTextMapHash: id}).first().then(this.commonLoadFirst);
  }

  private async postProcessChapter(chapter: ChapterExcelConfigData): Promise<ChapterExcelConfigData> {
    if (!chapter)
      return chapter;
    chapter.Quests = await this.selectMainQuestsByChapterId(chapter.Id);
    chapter.Type = chapter.Quests.find(x => x.Type)?.Type;
    if (chapter.Id === 1105) {
      chapter.Type = 'AQ';
    }

    let ChapterNumTextEN = getTextMapItem('EN', chapter.ChapterNumTextMapHash);

    if (chapter.ChapterNumText && (chapter.ChapterNumText.includes(':') || chapter.ChapterNumText.includes('-'))) {
      let chapterPart: string;
      let actPart: string;

      let chapterPartEN: string;
      let actPartEN: string;

      if (chapter.ChapterNumText.includes(':')) {
        [chapterPart, actPart]     = chapter.ChapterNumText.split(':', 2).map(x => x.trim());
        [chapterPartEN, actPartEN] = ChapterNumTextEN.split(':', 2).map(x => x.trim());
      } else if (chapter.ChapterNumText.includes('-')) {
        [chapterPart, actPart]     = chapter.ChapterNumText.split('-', 2).map(x => x.trim());
        [chapterPartEN, actPartEN] = ChapterNumTextEN.split('-', 2).map(x => x.trim());
      }

      chapter.Summary = {
        ChapterNum: romanToInt(extractRomanNumeral(chapterPart)),
        ChapterRoman: extractRomanNumeral(chapterPart),
        ChapterNumText: chapterPart,
        ChapterName: chapter.ChapterImageTitleText,

        ActNum: romanToInt(extractRomanNumeral(actPart)),
        ActRoman: extractRomanNumeral(actPart),
        ActNumText: actPart,
        ActName: chapter.ChapterTitleText,
        ActType: '',

        AQCode: '',
      };
      if (actPartEN && actPartEN.includes('Act')) {
        chapter.Summary.ActType = 'Act';
      } else if (actPartEN && actPartEN.includes('Part')) {
        chapter.Summary.ActType = 'Part';
      } else if (actPartEN && actPartEN.includes('Day')) {
        chapter.Summary.ActType = 'Day';
      } else {
        chapter.Summary.ActType = 'None';
      }
      if (chapter.Type === 'AQ' && chapterPartEN && chapterPartEN.includes('Prologue')) {
        chapter.Summary.ChapterNum = 0;
      }
      if (chapter.Type === 'AQ' && chapterPartEN && chapterPartEN.includes('Interlude Chapter')) {
        chapter.Summary.AQCode += 'IC';
      } else if (chapter.Summary.ChapterNum >= 0) {
        chapter.Summary.AQCode += 'C' + chapter.Summary.ChapterNum;
      }
      if (chapter.Summary.ActNum >= 0) {
        chapter.Summary.AQCode += 'A' + chapter.Summary.ActNum;
      }
    } else {
      chapter.Summary = {
        ChapterNum: -1,
        ChapterRoman: null,
        ChapterNumText: null,
        ChapterName: chapter.ChapterImageTitleText,

        ActNum: -1,
        ActRoman: null,
        ActNumText: null,
        ActName: chapter.ChapterTitleText,
        ActType: null,

        AQCode: null,
      };
    }

    return chapter;
  }

  private async postProcessChapters(chapters: ChapterExcelConfigData[]): Promise<ChapterExcelConfigData[]> {
    return Promise.all(chapters.map(x => this.postProcessChapter(x))).then(arr => arr.filter(item => !!item));
  }

  async selectAllChapters(): Promise<ChapterExcelConfigData[]> {
    return await this.knex.select('*').from('ChapterExcelConfigData')
      .then(this.commonLoad).then(x => this.postProcessChapters(x));
  }

  async selectChapterCollection(): Promise<ChapterCollection> {
    let map: ChapterCollection = {
      AQ: {},
      SQ: {},
      EQ: {},
      WQ: {},
    };

    let chapters = await this.selectAllChapters();
    for (let chapter of chapters) {
      if (!chapter.Type || !chapter.ChapterTitleText) {
        continue;
      }

      let chapterName = chapter.Summary.ChapterNumText || 'No Chapter';
      let subChapterName = chapter.Summary.ChapterName || 'No Sub-Chapter';

      if (!map[chapter.Type][chapterName]) {
        map[chapter.Type][chapterName] = [];
      }

      if (chapter.Type === 'EQ' || chapter.Type === 'WQ') {
        map[chapter.Type][chapterName].push(chapter);
      } else {
        if (!map[chapter.Type][chapterName][subChapterName]) {
          map[chapter.Type][chapterName][subChapterName] = [];
        }
        map[chapter.Type][chapterName][subChapterName].push(chapter);
      }
    }

    return map;
  }

  async selectChapterById(id: number): Promise<ChapterExcelConfigData> {
    return await this.knex.select('*').from('ChapterExcelConfigData').where({Id: id})
      .first().then(this.commonLoadFirst).then(x => this.postProcessChapter(x));
  }

  async readGenshinDataFile<T>(filePath: string): Promise<T> {
    let fileContents: string = await fs.readFile(getGenshinDataFilePath(filePath), {encoding: 'utf8'});
    let json = JSON.parse(fileContents);
    json = normalizeRawJson(json);
    if (Array.isArray(json)) {
      json = await this.commonLoad(json);
    } else {
      json = await this.commonLoadFirst(json);
    }
    return json;
  }

  async loadCutsceneSubtitlesByQuestId(questId: number): Promise<{[fileName: string]: string}> {
    let fileNames: string[] = await fs.readdir(getGenshinDataFilePath('./Subtitle/'+this.outputLangCode));

    let targetFileNames: string[] = [];
    for (let fileName of fileNames) {
      if (fileName.includes(`Q${questId}`) || fileName.includes(`Q_${questId}`)) {
        if (fileName.endsWith('.txt') && targetFileNames.includes(fileName.slice(0, -4)+'.srt')) {
          // If targetFileNames already contains the .srt version of the .txt file, then skip
          continue;
        }
        targetFileNames.push(fileName);
      }
    }

    if (!targetFileNames.length) {
      return {};
    }

    let inputs: {[genderlessFileName: string]: string[]} = {};
    for (let targetFileName of targetFileNames) {
      let genderlessFileName = targetFileName.replace('_Boy', '').replace('_Girl', '');
      if (!inputs.hasOwnProperty(genderlessFileName)) {
        inputs[genderlessFileName] = [];
      }
      inputs[genderlessFileName].push(targetFileName);
    }

    let parser = new SrtParser();
    let srtMap: {[fileNane: string]: SrtLine[]} = {};

    for (let inputKey of Object.keys(inputs)) {
      let input = inputs[inputKey];
      let filePath1: string = getGenshinDataFilePath('./Subtitle/'+this.outputLangCode+'/'+input[0]);
      let fileData1: string = await fs.readFile(filePath1, {encoding: 'utf8'});

      let srt1: SrtLine[] = parser.fromSrt(fileData1);
      let srt2: SrtLine[] = [];

      if (input.length > 1) {
        let filePath2: string = getGenshinDataFilePath('./Subtitle/'+this.outputLangCode+'/'+input[1]);
        let fileData2: string = await fs.readFile(filePath2, {encoding: 'utf8'});
        srt2 = parser.fromSrt(fileData2);
      }

      let allMatch = true;
      if (srt1.length === srt2.length) {
        for (let i = 0; i < srt1.length; i++) {
          let line1 = srt1[i];
          let line2 = srt2[i];
          if (line1.text !== line2.text) {
            allMatch = false;
          }
        }
      }

      if (!allMatch) {
        srtMap[input[0]] = srt1;
        if (input.length > 1) {
          srtMap[input[1]] = srt2;
        }
      } else {
        srtMap[inputKey] = srt1;
      }
    }

    let formattedResults: {[fileName: string]: string} = {};
    for (let srtFile of Object.keys(srtMap)) {
      let srtLines = srtMap[srtFile];
      let out = [];
      out.push(';(A cinematic plays)');
      for (let srtLine of srtLines) {
        out.push(`::'''CS_CHAR:''' ` + normText(srtLine.text, this.outputLangCode));
      }
      out.push(':;(Cinematic ends)');
      formattedResults[srtFile] = out.join('\n');
    }

    return formattedResults;
  }

  async selectAllHomeWorldEvents(): Promise<HomeWorldEventExcelConfigData[]> {
    return await this.knex.select('*').from('HomeWorldEventExcelConfigData').then(this.commonLoad);
  }
  async selectAllHomeWorldNPCs(): Promise<HomeWorldNPCExcelConfigData[]> {
    return await this.knex.select('*').from('HomeWorldNPCExcelConfigData').then(this.commonLoad);
  }
  async selectFurniture(id: number): Promise<HomeWorldFurnitureExcelConfigData> {
    return await this.knex.select('*').from('HomeWorldFurnitureExcelConfigData')
      .where({Id: id}).first().then(this.commonLoadFirst);
  }
  async selectFurnitureType(typeId: number): Promise<HomeWorldFurnitureTypeExcelConfigData> {
    return await this.knex.select('*').from('HomeWorldFurnitureTypeExcelConfigData')
      .where({TypeId: typeId}).first().then(this.commonLoadFirst);
  }
  async selectFurnitureSuite(suiteId: number): Promise<FurnitureSuiteExcelConfigData> {
    return await this.knex.select('*').from('FurnitureSuiteExcelConfigData')
      .where({SuiteId: suiteId}).first().then(this.commonLoadFirst);
  }

  async selectMaterialSourceDataExcelConfigData(id: number): Promise<MaterialSourceDataExcelConfigData> {
    let sourceData: MaterialSourceDataExcelConfigData = await this.knex.select('*')
      .from('MaterialSourceDataExcelConfigData').where({Id: id}).first().then(this.commonLoadFirst);
    if (!sourceData) {
      return sourceData;
    }
    sourceData.MappedTextList = [];
    for (let textMapHash of sourceData.TextList) {
      let text = getTextMapItem(this.outputLangCode, textMapHash);
      if (text) {
        sourceData.MappedTextList.push(text);
      }
    }
    return sourceData;
  }

  async selectMaterialExcelConfigData(id: number): Promise<MaterialExcelConfigData> {
    let material: MaterialExcelConfigData = await this.knex.select('*').from('MaterialExcelConfigData')
      .where({Id: id}).first().then(this.commonLoadFirst);
    if (material) {
      material.SourceData = await this.selectMaterialSourceDataExcelConfigData(material.Id);
    }
    return material;
  }

  async selectRewardExcelConfigData(rewardId: number): Promise<RewardExcelConfigData> {
    let reward: RewardExcelConfigData = await this.knex.select('*').from('RewardExcelConfigData')
      .where({RewardId: rewardId}).first().then(this.commonLoadFirst);

    if (!reward) {
      return reward;
    }

    await Promise.all(reward.RewardItemList.map(x => {
      if (!x.ItemId) {
        return Promise.resolve();
      }
      return this.selectMaterialExcelConfigData(x.ItemId).then(material => x.Material = material);
    }));

    return this.generateRewardSummary(reward);
  }

  combineRewardExcelConfigData(...rewardArray: RewardExcelConfigData[]): RewardExcelConfigData {
    if (!rewardArray.length) {
      return null;
    }
    if (rewardArray.length === 1) {
      return rewardArray[0];
    }
    let primary = rewardArray[0];
    for (let i = 1; i < rewardArray.length; i++) {
      for (let otherItem of rewardArray[i].RewardItemList) {
        let primaryItem = primary.RewardItemList.find(r => r.ItemId === otherItem.ItemId);
        if (primaryItem) {
          primaryItem.ItemCount += otherItem.ItemCount;
        } else {
          primary.RewardItemList.push(otherItem);
        }
      }
    }
    return this.generateRewardSummary(primary);
  }

  private generateRewardSummary(reward: RewardExcelConfigData): RewardExcelConfigData {
    if (!reward) {
      return reward;
    }

    reward.RewardSummary = {
      ExpCount: '',
      MoraCount: '',
      PrimogemCount: '',
      CombinedCards: '',
      OtherCards: '',
      QuestForm: '',
    };

    for (let item of reward.RewardItemList) {
      if (!item.Material) {
        continue;
      }

      let countForm = (item.ItemCount || 1).toLocaleString('en-US');
      let cardForm = `{{Card|${item.Material.NameText}|${countForm}}}`;

      if (item.ItemId === ADVENTURE_EXP_ID) {
        reward.RewardSummary.ExpCount = countForm;
      } else if (item.ItemId === MORA_ID) {
        reward.RewardSummary.MoraCount = countForm;
      } else if (item.ItemId === PRIMOGEM_ID) {
        reward.RewardSummary.PrimogemCount = countForm;
      } else {
        reward.RewardSummary.OtherCards += cardForm;
      }

      reward.RewardSummary.CombinedCards += cardForm;
    }

    reward.RewardSummary.QuestForm =
      `|exp           = ${reward.RewardSummary.ExpCount}\n` +
      `|mora          = ${reward.RewardSummary.MoraCount}\n` +
      `|primogems     = ${reward.RewardSummary.PrimogemCount}\n` +
      `|other         = ${reward.RewardSummary.OtherCards}`;

    return reward;
  }

  async selectCityNameById(cityId: number): Promise<string> {
    let textMapHash: number = await this.knex.select('CityNameTextMapHash')
      .from('CityConfigData').where({CityId: cityId}).first().then(x => x.CityNameTextMapHash);
    return getTextMapItem(this.outputLangCode, textMapHash);
  }

  async selectReputationQuestExcelConfigData(parentQuestId: number): Promise<ReputationQuestExcelConfigData> {
    let rep: ReputationQuestExcelConfigData = await this.knex.select('*')
      .from('ReputationQuestExcelConfigData')
      .where({ParentQuestId: parentQuestId})
      .first().then(this.commonLoadFirst);

    if (!rep) {
      return null;
    }

    let cityName = await this.selectCityNameById(rep.CityId);
    let reward = await this.selectRewardExcelConfigData(rep.RewardId);

    rep.QuestForm =
      `|rep           = ${cityName}\n` +
      `|repAmt        = ${reward.RewardItemList[0].ItemCount}\n` +
      `|repOrder      = ${rep.Order}`;
    rep.QuestFormWithTitle = rep.QuestForm + `\n` +
      `|repTitle      = ${rep.TitleText}`;

    return rep;
  }
}