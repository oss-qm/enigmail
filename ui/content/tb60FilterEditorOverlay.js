/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * Filter Editor Overlay for Thunderbird 60 and earlier
 */

"use strict";

/* global gActionListOrdered: false, checkActionsReorder: true */
/* global nsMsgFilterAction: false, gFilterActionStrings: false, gFilterActionList: true */

Components.utils.import("resource://enigmail/timer.jsm"); /*global EnigmailTimer: false */
Components.utils.import("resource://enigmail/log.jsm"); /*global EnigmailLog: false */


var EnigmailFilterEditor = {
  onLoad: function() {
    EnigmailLog.DEBUG("enigmailFilterEditor.js: onLoad()\n");
    let self = this;

    if ("arguments" in window && window.arguments[0]) {
      let args = window.arguments[0];

      if ("filter" in args) {
        // editing a filter
        this.reInitialize(args.filter);
      }
    }

    // Overwrite the original checkActionsReorder function
    this.enigmail_origCheckActionsReorder = checkActionsReorder;

    checkActionsReorder = function() {
      let r = self.enigmail_origCheckActionsReorder();
      EnigmailTimer.setTimeout(EnigmailFilterEditor.checkMoveAction.bind(EnigmailFilterEditor), 0);
      return r;
    };
  },

  onUnload: function() {
    window.removeEventListener("load-enigmail", EnigmailFilterEditor.onLoad, false);
    window.removeEventListener("unload-enigmail", EnigmailFilterEditor.onUnload, false);
    checkActionsReorder = this.enigmail_origCheckActionsReorder;
    EnigmailFilterEditor = undefined;
  },

  reInitialize: function(filter) {
    while (gFilterActionList.firstChild) {
      gFilterActionList.removeChild(gFilterActionList.firstChild);
    }

    let numActions = filter.actionCount;
    for (let actionIndex = 0; actionIndex < numActions; actionIndex++) {
      let filterAction = filter.getActionAt(actionIndex);

      var newActionRow = document.createElement('listitem');
      newActionRow.setAttribute('initialActionIndex', actionIndex);
      newActionRow.className = 'ruleaction';
      gFilterActionList.appendChild(newActionRow);
      newActionRow.setAttribute('value',
        filterAction.type == nsMsgFilterAction.Custom ?
        filterAction.customId : gFilterActionStrings[filterAction.type]);
      newActionRow.setAttribute('onfocus', 'this.storeFocus();');
    }
  },

  checkMoveAction: function() {
    let dlg = document.getElementById("FilterEditor");
    let acceptButton = dlg.getButton("accept");
    let forbidden = -1;
    let hasCopyAction = -1;
    let hasMoveAction = -1;

    const nsMsgFilterAction = Components.interfaces.nsMsgFilterAction;

    for (let i = 0; i < gActionListOrdered.length; i++) {
      let action = gActionListOrdered.queryElementAt(i, Components.interfaces.nsIMsgRuleAction);
      if (action.customId == "enigmail@enigmail.net#filterActionCopyDecrypt") {
        hasCopyAction = i;
        break;
      }

      if (action.customId == "enigmail@enigmail.net#filterActionMoveDecrypt") {
        hasMoveAction = i;
        if (i < gActionListOrdered.length - 1) {
          forbidden = i;
        }
      }

      if (action.type == nsMsgFilterAction.StopExecution &&
        i == gActionListOrdered.length - 1 &&
        forbidden == i - 1) {
        // allow "stop execution" if it's the only action after move
        forbidden = -1;
      }
    }

    if (forbidden >= 0 || (hasMoveAction >= 0 && hasCopyAction > hasMoveAction)) {
      document.getElementById("enigmailInfobar").removeAttribute("hidden");
      acceptButton.setAttribute("disabled", "true");
    } else {
      document.getElementById("enigmailInfobar").setAttribute("hidden", "true");
      acceptButton.setAttribute("disabled", "false");
    }
  }
};

window.addEventListener("load-enigmail", EnigmailFilterEditor.onLoad.bind(EnigmailFilterEditor), false);
window.addEventListener("unload-enigmail", EnigmailFilterEditor.onUnload.bind(EnigmailFilterEditor), false);
