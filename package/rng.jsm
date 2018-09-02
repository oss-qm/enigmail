/*global Components: false */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailRNG"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://enigmail/openpgp.jsm"); /*global EnigmailOpenPGP: false */

const SECURITY_RANDOM_GENERATOR = "@mozilla.org/security/random-generator;1";

let crypto = null;

function getCrypto() {
  if (crypto === null) {
    crypto = EnigmailOpenPGP.enigmailFuncs.getCrypto(); // get the browser crypto API
  }
  return crypto;
}

/**
 * Create a string of random characters of the set A-Z a-z 0-9 with numChars length,
 * using the browser crypto API that gets cryptographically strong random values
 *
 * @param numChar: Number - the length of the string to return
 *
 * @return String
 */
function generateRandomString(numChars) {

  // Map of characters that are allowed to be returned
  const charMap = new Array("A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
    "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
    "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
    "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9");

  const charMapLength = charMap.length; // 62 for the set A-Z a-z 0-9

  let randNumArray = new Uint16Array(numChars);
  getCrypto().getRandomValues(randNumArray);

  let randomString = "";

  for (let i = 0; i < numChars; i++) {
    // compute the modulo to get numbers between 0 and (charMapLength - 1)
    // Uint16 range 65536 modulo 62 is only 2, this minimal statistical imbalance is acceptable
    let modulo = randNumArray[i] % charMapLength;

    randomString += charMap[modulo];
  }

  return randomString;
}


/**
 * Generates a random UInt32 for use in randomising key selection and wait times between refreshing keys.
 *
 * @return random UInt32
 */
function generateRandomUint32() {
  let randomNumber = new Uint32Array(1);
  getCrypto().getRandomValues(randomNumber);
  return randomNumber[0];
}

var EnigmailRNG = {
  generateRandomUint32: generateRandomUint32,
  generateRandomString: generateRandomString
};
