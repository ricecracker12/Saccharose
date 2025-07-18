import '../../loadenv.ts';
import { pathToFileURL } from 'url';
import commandLineArgs, { OptionDefinition as ArgsOptionDefinition } from 'command-line-args';
import commandLineUsage, { OptionDefinition as UsageOptionDefinition } from 'command-line-usage';
import chalk from 'chalk';
import { getGenshinDataFilePath } from '../../loadenv.ts';
import { getGenshinControl } from '../../domain/genshin/genshinControl.ts';
import { closeKnex } from '../../util/db.ts';
import { importNormalize, importPlainTextMap } from '../util/import_file_util.ts';
import { importGcgSkill } from './module.gcg-skill.ts';
import { importVoiceItems } from './module.voice-items.ts';
import { writeDeobfExcels } from './module.deobf-excel.ts';
import { importVoiceOvers } from './module.voice-overs.ts';
import { importSearchIndex } from './module.search-index.ts';
import { generateAvatarAnimInteractionGoodBad, generateQuestDialogExcels } from './module.make-excels.ts';
import { loadInterActionQD } from './module.interaction.ts';
import { createChangelog } from '../util/createChangelogUtil.ts';
import { indexGenshinImages } from './module.index-images.ts';
import { exportExcel } from './module.export-excel.ts';
import { recordNewImages } from './module.new-images.ts';
import fs from 'fs';
import { writeDeobfBin } from './module.deobf-bin.ts';
import { isInt } from '../../../shared/util/numberUtil.ts';
import { genshinNormalize } from './module.normalize.ts';
import { genshinSchema } from './genshin.schema.ts';
import { GenshinVersions } from '../../../shared/types/game-versions.ts';

export async function importGenshinFilesCli() {
  const options_beforeDb: (ArgsOptionDefinition & UsageOptionDefinition)[] = [
    {name: 'fix-document-excel', type: Boolean, description: 'Fixes some issues unique to DocumentExcelConfigData.'},
    {name: 'deobf-excel', type: Boolean, description: 'Deobfuscate Excels.'},
    {name: 'deobf-bin', type: Boolean, description: 'Deobfuscate BinOutput.'},
    {name: 'make-excels', type: Boolean, description: 'Creates some of the excels that are no longer updated by the game client (run before normalize)'},
    {name: 'normalize', type: Boolean, description: 'Normalizes the JSON files.'},
    {name: 'plaintext', type: Boolean, description: 'Creates the PlainTextMap files.'},
    {name: 'voice-items', type: Boolean, description: 'Creates the normalized voice items file.'},
    {name: 'interaction', type: Boolean, description: 'Load QuestDialogue InterActions from BinOutput.'},
    {name: 'gcg-skill', type: Boolean, description: 'Creates file for GCG skill data'},
  ];

  const options_agnosticDb: (ArgsOptionDefinition & UsageOptionDefinition)[] = [
    {name: 'new-images', type: Boolean, description: 'Creates new images map per game version. Must be ran before index-images.'},
    {name: 'index-images', type: Boolean, description: 'Creates index for asset images. ' +
        'Must load all wanted Texture2D images into the EXT_GENSHIN_IMAGES directory first though.'},
  ];

  const options_afterDb: (ArgsOptionDefinition & UsageOptionDefinition)[] = [
    {name: 'index', type: Boolean, description: 'Creates the index files for PlainTextMap.'},
    {name: 'voice-overs', type: Boolean, description: 'Creates file for character voice over data (aka fetters)'},
    {name: 'changelog', type: String, typeLabel: '<version>', description: 'Creates changelog between the provided version and the version before it.'},
  ];

  const options_util: (ArgsOptionDefinition & UsageOptionDefinition)[] = [
    {name: 'export-excel', type: String, typeLabel: '<outputDir>', description: 'Copies excel files to output directory with renameFields applied.'},
    {name: 'help', type: Boolean, description: 'Display this usage guide.'},
    {name: 'avatar-anim-interaction', type: Boolean},
    {name: 'dry-run', type: Boolean},
  ];

  let options: commandLineArgs.CommandLineOptions;
  try {
    options = commandLineArgs([... options_beforeDb, ...options_agnosticDb, ... options_afterDb, ... options_util]);
  } catch (e) {
    if (typeof e === 'object' && e.name === 'UNKNOWN_OPTION') {
      console.warn(chalk.red('\nUnknown option: ' + e.optionName));
    } else {
      console.error(chalk.red('\n' + e?.message || e));
    }
    options = { help: true };
  }

  let dryRun: boolean = false;
  if (options['dry']) {
    dryRun = true;
    delete options['dry'];
  }
  if (options['dry-run']) {
    dryRun = true;
    delete options['dry-run'];
  }

  if (!Object.keys(options).length) {
    console.warn(chalk.yellow('\nNot enough arguments.'));
    options.help = true;
  }

  if (Object.keys(options).length > 1) {
    console.warn(chalk.red('\nAll arguments are mutually exclusive.'));
    options.help = true;
  }

  if (options.help) {
    const usage = commandLineUsage([
      {
        header: 'Genshin Data Files Importer',
        content: 'Imports Genshin Data json into other supporting files.'
      },
      {
        header: 'Must be ran before database import:',
        optionList: options_beforeDb
      },
      {
        header: 'Database import agnostic (can be run before or after)',
        optionList: options_agnosticDb
      },
      {
        header: 'Must be ran after database import:',
        optionList: options_afterDb
      },
      {
        header: 'Util',
        optionList: options_util
      }
    ])
    console.log(usage);
    return;
  }

  if (options.normalize) {
    await genshinNormalize();
  }
  if (options.plaintext) {
    const ctrl = getGenshinControl();
    await importPlainTextMap(ctrl, getGenshinDataFilePath);
  }
  if (options.index) {
    await importSearchIndex();
  }
  if (options['voice-items']) {
    await importVoiceItems();
  }
  if (options['gcg-skill']) {
    await importGcgSkill();
  }
  if (options['voice-overs']) {
    await importVoiceOvers();
  }
  if (options['deobf-excel']) {
    await writeDeobfExcels();
  }
  if (options['deobf-bin']) {
    await writeDeobfBin();
  }
  if (options['fix-document-excel']) {
    const filePath = getGenshinDataFilePath('./ExcelBinOutput/DocumentExcelConfigData.json');
    let fileContent = fs.readFileSync(filePath, {encoding: 'utf8'});

    let jsonContent: any[] = JSON.parse(fileContent);
    const check = jsonContent.find(x => x.Id === 192431 || x.id === 192431);
    const checkQid: number = (check.questIdList || check.QuestIdList || check.QuestIDList || check.questIDList)[0];

    if (!isInt(checkQid)) {
      console.error('Something is broken!', checkQid);
    } else if (checkQid === 1500418) {
      console.log('DocumentExcelConfigData is already correct or already has been fixed!');
    } else {
      fileContent = fileContent.replace(/"questidlist"/gi, '"__temp__"');
      fileContent = fileContent.replace(/"contentLocalizedIds?"/gi, '"QuestIdList"');
      fileContent = fileContent.replace(/"__temp__"/gi, '"ContentLocalizedIds"');
      fs.writeFileSync(filePath, fileContent, {encoding: 'utf8'});

      console.log('DocumentExcelConfigData was incorrect and has now been fixed!');
    }
  }
  if (options['export-excel']) {
    await exportExcel(options['export-excel']);
  }
  if (options['new-images']) {
    await recordNewImages();
  }
  if (options['index-images']) {
    await indexGenshinImages(dryRun);
  }
  if (options['make-excels']) {
    await generateQuestDialogExcels(getGenshinDataFilePath());
  }
  if (options['avatar-anim-interaction']) {
    await generateAvatarAnimInteractionGoodBad(getGenshinDataFilePath());
  }
  if (options['interaction']) {
    await loadInterActionQD(getGenshinDataFilePath());
  }
  if (options['changelog']) {
    await createChangelog(ENV.GENSHIN_CHANGELOGS, ENV.GENSHIN_ARCHIVES, genshinSchema, GenshinVersions, options['changelog']);
  }

  await closeKnex();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await importGenshinFilesCli();
}
