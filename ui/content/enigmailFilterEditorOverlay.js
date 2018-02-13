/*global Components: false, EnigmailTimer: false */
/*  * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* global Components: false */

"use strict";

/* global gActionListOrdered: false, checkActionsReorder: true */

Components.utils.import("resource://enigmail/timer.jsm"); /*global EnigmailTimer: false */


var EnigmailFilterEditor = {
  onLoad: function() {
    let self = this;
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
    }
    else {
      document.getElementById("enigmailInfobar").setAttribute("hidden", "true");
      acceptButton.setAttribute("disabled", "false");
    }
  }
};

window.addEventListener("load-enigmail", EnigmailFilterEditor.onLoad.bind(EnigmailFilterEditor), false);
window.addEventListener("unload-enigmail", EnigmailFilterEditor.onUnload.bind(EnigmailFilterEditor), false);
