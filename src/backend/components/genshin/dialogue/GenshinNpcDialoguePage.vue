<template>
  <section class="card">
    <h2>NPC Dialogue Generator</h2>
    <div class="content">
      <p class="spacer10-bottom">Generate dialogue for a specific NPC. You can also enter a specific NPC ID.</p>
      <div class="field valign">
        <div class="valign grow" style="max-width:700px">
          <div class="posRel valign grow">
            <input class="npc-dialogue-generate-input grow" type="text" placeholder="Enter the exact name of an NPC (case insensitive)" />
            <button class="npc-dialogue-generate-input-paste input-paste-button"><Icon name="clipboard" /></button>
            <button class="npc-dialogue-generate-input-clear input-clear-button hide"><Icon name="x-circle" /></button>
          </div>
          <button class="npc-dialogue-generate-submit primary primary--2 spacer5-left">Generate</button>
        </div>
        <div class="npc-dialogue-generate-submit-pending hide loading small spacer5-left"></div>
      </div>
      <div style="margin-bottom:-8px">
        <a id="npc-dialogue-info-show" style="font-size:13px;cursor:pointer;opacity:0.8" ui-action="delete-cookie: NPC-Dialogue.info; remove-class: #npc-dialogue-info, hide; add-class: this, hide"
           :class="ctx.cookieTernary('NPC-Dialogue.info').isEmpty().then('hide')">[Show info]</a>
        <div id="npc-dialogue-info" :class="ctx.cookieTernary('NPC-Dialogue.info').equals('hidden').then('hide')">
          <hr class="spacer10-bottom spacer10-top">
          <ul style="font-size:14.5px;line-height:20px;">
            <li>If you can't find the dialogue you're looking for, try entering part of the first line of the dialogue (if you have it) into the "Single Branch Dialogue Generator" tool.</li>
            <li>It may not find results if the NPC is disguised as "???"</li>
            <li>Try the other tools if you can't find the dialogue you're looking for.</li>
            <li>You may get multiple NPC results with different IDs but the same name. This is generally the same "person" but in the different conditions/situations/quest states. In other cases, it might actually be different people with the same name &mdash; there's an "Iris" in Dragonspine and an "Iris" in Sumeru, for example.</li>
          </ul>
          <a style="font-size:13px;cursor:pointer" ui-action="set-cookie: NPC-Dialogue.info, hidden; add-class: #npc-dialogue-info, hide; remove-class: #npc-dialogue-info-show, hide">[Collapse info]</a>
        </div>
      </div>
    </div>
  </section>
  <div id="npc-dialogue-generate-result"></div>

</template>

<script setup lang="ts">
import Icon from '../../utility/Icon.vue';
import { getTrace } from '../../../middleware/request/tracer.ts';

const { ctx } = getTrace();

defineProps<{

}>();
</script>
