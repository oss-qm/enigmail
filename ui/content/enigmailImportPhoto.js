/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var Cu = Components.utils;
var Cc = Components.classes;
var Ci = Components.interfaces;


function onLoad() {
  document.getElementById("photoImage").setAttribute("src", window.arguments[0].photoUri);
  document.getElementById("keyDesc").setAttribute("value", "0x" + window.arguments[0].keyId +
    " - " + window.arguments[0].userId);
}

document.addEventListener("dialogaccept", function(event) {
  window.arguments[0].okPressed = true;
});
