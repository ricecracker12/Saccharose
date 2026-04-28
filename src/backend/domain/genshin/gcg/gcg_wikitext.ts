import { GCGControl } from './gcg_control.ts';
import {
  GCGCardExcelConfigData,
  GCGCharExcelConfigData,
  GCGCommonCard,
  GCGGameExcelConfigData, GCGSkillExcelConfigData, isActionCard, isCharacterCard,
} from '../../../../shared/types/genshin/gcg-types.ts';
import { SbOut } from '../../../../shared/util/stringUtil.ts';
import { ol_gen_from_id } from '../../abstract/basic/OLgen.ts';
import { ExcelChangeRef } from '../../../../shared/types/changelog-types.ts';

// Cards
// --------------------------------------------------------------------------------------------------------------

export async function generateSkillPage(gcg: GCGControl, parentCard: GCGCommonCard, skill: GCGSkillExcelConfigData, index: number): Promise<string> {
  const sb = new SbOut();

  sb.line(`{{Genius Invokation TCG Skill Infobox`);
  sb.setPropPad(11);
  sb.prop('id', skill.Id);
  sb.prop('image', `${skill.WikiNameEN} ${parentCard.WikiTypeEN} Skill.png`, true);
  sb.prop('type', skill.WikiType);
  sb.prop('character', parentCard.WikiName);
  sb.prop('element', parentCard.WikiElement);

  for (let cost of skill.CostList) {
    if (cost.CostType === 'GCG_COST_ENERGY') {
      sb.prop('energy', cost.Count);
    } else if (cost.CostType === 'GCG_COST_DICE_SAME') {
      sb.prop('matching', cost.Count);
    } else if (cost.CostType === 'GCG_COST_DICE_VOID') {
      sb.prop('unaligned', cost.Count);
    }
  }

  sb.prop('effect', skill.WikiDesc);
  sb.prop('order', index + 1);
  sb.line('}}');
  sb.line(`'''${skill.WikiName}''' là [[${parentCard.WikiType} ${skill.WikiType}|${skill.WikiType}]] của ` +
    `[[${parentCard.WikiName} (${parentCard.WikiType})|${parentCard.WikiName}]] trong [[Thất Thánh Triệu Hồi]].`);
  sb.line();

  sb.line('==Ngôn Ngữ Khác==');
  sb.line((await ol_gen_from_id(gcg.ctrl, skill.NameTextMapHash))?.result);
  sb.line();
  sb.line('==Lịch Sử Cập Nhật==');
  const crRecord = await gcg.ctrl.excelChangelog.selectChangeRefAddedAt(skill.Id, 'GCGSkillExcelConfigData');
  sb.line('{{Change History|' + (crRecord?.version?.label || '<!-- phiên bản -->') + '}}');
  sb.line();
  sb.line('==Điều Hướng==');
  sb.line(`{{Genius Invokation TCG Skill Navbox|${parentCard.WikiName}}}`);
  sb.line();

  return sb.toString();
}

export async function generateCardPage(gcg: GCGControl, card: GCGCommonCard): Promise<string> {
  if (!card) {
    return '';
  }

  const sb = new SbOut();

  sb.line(`{{Genius Invokation TCG Infobox`);
  sb.setPropPad(12);

  const cardFace = card.CardFace;
  const deckCard = card.DeckCard;

  sb.prop('id', card.Id);
  sb.prop('title', card.WikiName);
  sb.prop('image', `${card.WikiNameEN} ${card.WikiTypeEN}.png`, true);
  sb.prop('type', card.WikiType);
  if (isActionCard(card)) {
    sb.prop('group', card.MappedTagList.filter(x => !!x.Type).map(x => x.NameText).join(';'));
  }
  if (deckCard?.RelatedCharacter) {
    sb.prop('character', deckCard?.RelatedCharacter.WikiName);
  }
  if (isCharacterCard(card)) {
    sb.prop('health', card.Hp);
    sb.prop('element', card.WikiElement);
    sb.prop('faction', card.WikiFaction);
    sb.prop('weapon', card.WikiWeapon);
    if (card.WikiDesc) {
      sb.prop('description', card.WikiDesc);
    }
  }
  if (isActionCard(card)) {
    if (card.CardType === 'GCG_CARD_SUMMON') {
      sb.prop('summontype');
      sb.prop('createdby');
    }

    for (let cost of card.CostList) {
      if (cost.CostType === 'GCG_COST_ENERGY') {
        sb.prop('energy', cost.Count);
      } else if (cost.CostType === 'GCG_COST_DICE_SAME') {
        sb.prop('matching', cost.Count);
      } else if (cost.CostType === 'GCG_COST_DICE_VOID') {
        sb.prop('unaligned', cost.Count);
      }
    }

    sb.prop('effect', card.WikiDesc);

    const usageRegex = /\$\[K3]\s*:\s*([\-+]?\d+[\-+]?)/;
    if (card.DescText && usageRegex.test(card.DescText)) {
      sb.prop('usage', usageRegex.exec(card.DescText)[1]);
    }
  }
  sb.prop('source1', deckCard?.SourceText || '');
  if (isCharacterCard(card) && card.MappedTagList.some(tag => tag.Type.startsWith('GCG_TAG_NATION'))) {
    sb.prop('features', card.WikiName);
  }
  sb.line('}}');

  // Intro
  let preType = '';
  for (let tag of card.MappedTagList.filter(x => !!x.Type)) {
    if (tag.Type === 'GCG_TAG_TALENT') {
      preType += `[[Thẻ Thiên Phú|Thiên Phú]] `;
    } else if (tag.Type === 'GCG_TAG_SLOWLY') {
      preType += `[[Thẻ Hành Động Chiến Đấu|Hành Động Chiến Đấu]] `;
    } else if (tag.Type === 'GCG_TAG_FOOD') {
      preType += `[[Thẻ Thức Ăn|Thức Ăn]] `;
    } else if (tag.Type === 'GCG_TAG_PLACE') {
      preType += `[[Thẻ Địa Danh|Địa Danh]] `;
    } else if (tag.Type === 'GCG_TAG_ALLY') {
      preType += `[[Thẻ Đồng Đội|Đồng Đội]] `;
    } else if (tag.Type === 'GCG_TAG_ITEM') {
      preType += `[[Thẻ Đạo Cụ|Đạo Cụ]] `;
    } else if (tag.Type === 'GCG_TAG_RESONANCE') {
      preType += `[[Thẻ Cộng Hưởng Nguyên Tố|Cộng Hưởng Nguyên Tố]] `;
    }
  }

  if (isCharacterCard(card)) {
    if (card.IsCanObtain) {
      sb.line(`'''${card.WikiName}''' là một [[${card.WikiType}]]${preType} trong [[Thất Thánh Triệu Hồi]].`);
    } else {
      sb.line(`'''${card.WikiName}''' là một [[${card.WikiType}]]${preType} không thể nhận trong [[Thất Thánh Triệu Hồi]].`);
    }
  } else {
    let addendum = '';
    if (deckCard?.RelatedCharacter) {
      const relatedCharName = deckCard?.RelatedCharacter?.WikiName;
      addendum += `dành cho [[${relatedCharName} (Thẻ Nhân Vật)|${relatedCharName}]]`;
    }
    sb.line(`'''${card.WikiName}''' là một [[${card.WikiType}]] ` + `${preType}${addendum} trong [[Thất Thánh Triệu Hồi]].`);
  }
  sb.line();

  if (isCharacterCard(card)) {
    sb.line('==Kỹ Năng==');
    sb.line('{{Genius Invokation TCG Skills Table}}');
    sb.line();
    sb.line('==Thẻ Thiên Phú==');
    sb.line('{{Genius Invokation TCG Talent Cards Table}}');
    sb.line();
  }
  if (deckCard && deckCard.ProficiencyReward && deckCard.ProficiencyReward.ProficiencyRewardList.length) {
    sb.line('==Thưởng Độ Thuần Phục==');
    for (let prof of deckCard.ProficiencyReward.ProficiencyRewardList) {
      const cardFaceItem = prof?.Reward?.RewardItemList
        ?.find(item => item?.Material?.MaterialType === 'MATERIAL_GCG_CARD_FACE')?.Material;
      if (cardFaceItem) {
        const golden: boolean = cardFaceItem.Icon?.toLowerCase()?.includes('gold') || false;
        const platinum: boolean = cardFaceItem.Icon?.toLowerCase()?.includes('platinum') || false;
        if (golden) {
          sb.line(`Sau khi Độ Thuần Thục đạt cấp ${prof.Proficiency}, người chơi sẽ nhận được Mặt Bài Kỳ Ảo sau:<br>` +
            `{{TCG Card|${cardFaceItem.NameText}|1|golden=1|caption=1}}`);
          sb.line();
        }
        if (platinum) {
          sb.line(`Sau khi Độ Thuần Thục đạt cấp ${prof.Proficiency}, người chơi sẽ nhận được Mặt Bài Lấp Lánh sau:<br>` +
            `{{TCG Card|${cardFaceItem.NameText}|1|platinum=1|caption=1}}`);
          sb.line();
        }
      }
    }
  }
  if (deckCard && (deckCard.StoryTitleText || deckCard.StoryContextText)) {
    sb.line('==Câu Chuyện==');
    sb.line(`{{Description|${await gcg.normGcgText(deckCard.StoryContextText)}|title=${await gcg.normGcgText(deckCard.StoryTitleText)}}}`);
    sb.line();
  }
  sb.line('==Xuất Hiện Trong Trận==');
  sb.line('{{Genius Invokation TCG Stage Appearances}}');
  sb.line();
  if (isCharacterCard(card) && card.CardFace) {
    sb.line('==Thư Viện==');
    sb.line('<gallery>');
    sb.line(`${card.WikiNameEN} TCG Avatar Icon.png|Biểu tượng hình đại diện`)
    sb.line('</gallery>');
    sb.line();
    sb.line('==Hoạt Ảnh==');
    sb.line('{{Preview');
    sb.setPropPad(9)
    sb.prop('size', '200px');
    sb.prop('file1', `${card.WikiNameEN} Dynamic Skin`);
    sb.prop('caption', 'Hoạt ảnh nhàn rỗi Mặt Bài Kỳ Ảo');
    sb.line('}}');
    sb.line();
  }
  sb.line('==Ngôn Ngữ Khác==');
  if (isCharacterCard(card)) {
    sb.line(`{{Other Languages|Transclude=${card.WikiName}}}`);
  } else {
    sb.line((await ol_gen_from_id(gcg.ctrl, card.NameTextMapHash))?.result || '');
  }
  sb.line();

  sb.line('==Lịch Sử Cập Nhật==');
  let crRecord: ExcelChangeRef;
  if (isCharacterCard(card)) {
    crRecord = await gcg.ctrl.excelChangelog.selectChangeRefAddedAt(card.Id, 'GCGCharExcelConfigData');
  } else if (isActionCard(card)) {
    crRecord = await gcg.ctrl.excelChangelog.selectChangeRefAddedAt(card.Id, 'GCGCardExcelConfigData');
  } else {
    crRecord = null;
  }
  sb.line('{{Change History|' + (crRecord?.version?.label || '<!-- phiên bản -->') + '}}');
  sb.line();

  sb.line('==Điều Hướng==');
  if (isCharacterCard(card)) {
    sb.line(`{{Genius Invokation TCG Navbox|${card.WikiTypeEN} ${card.IsCanObtain ? 'Obtainable' : 'Unobtainable'}}}`);
  } else {
    sb.line(`{{Genius Invokation TCG Navbox|${card.WikiTypeEN}}}`);
  }
  sb.line();

  return sb.toString();
}

// Stages
// --------------------------------------------------------------------------------------------------------------

export async function generateStageTemplate(control: GCGControl, stage: GCGGameExcelConfigData): Promise<string> {
  const sb = new SbOut();
  sb.setPropPad(13);
  sb.line('{{Genius Invokation TCG Stage')
  sb.prop('title', stage.WikiLevelName);
  sb.prop('type', stage.WikiType);
  sb.prop('group', stage.WikiGroup);
  sb.prop('character', stage.WikiCharacter);
  sb.prop('requirement', stage.MinPlayerLevel);
  sb.prop('introduction', control.ctrl.normText(stage.Reward?.LevelDecText || '', control.ctrl.outputLangCode));

  if (stage.Reward && stage.Reward.ObjectiveTextList && stage.Reward.ObjectiveTextList.length) {
    for (let index = 0; index < stage.Reward.ObjectiveTextList.length; index++) {
      const objectiveText = stage.Reward.ObjectiveTextList[index];
      const reward = stage.Reward.ChallengeRewardList[index];

      sb.prop('objective_' + (index + 1), objectiveText);
      sb.prop('reward_' + (index + 1), reward?.Reward?.RewardSummary?.CombinedStringsNoLocale);
    }
  }

  if (stage.EnemyCardGroup) {
    // Active/Lineup:
    sb.prop('lineup', stage.EnemyCardGroup.WikiActiveText);

    // Action:${card.WikiType}
    sb.prop('action', stage.EnemyCardGroup.WikiActionText);

    // Reserve:
    sb.prop('reserve', stage.EnemyCardGroup.WikiReserveText);
  }

  if (stage.CardGroup && stage.CardGroup.DeckNameText) {
    sb.prop('preset_deck', stage.CardGroup.DeckNameText);
  }

  sb.line('}}');

  return sb.toString();
}
