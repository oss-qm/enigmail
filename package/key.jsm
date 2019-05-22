/*global Components: false, Math: false */
/*jshint -W097 */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailKey"];

const Cu = Components.utils;

const KEY_BLOCK_UNKNOWN = 0;
const KEY_BLOCK_KEY = 1;
const KEY_BLOCK_REVOCATION = 2;
const SIG_TYPE_REVOCATION = 0x20;

Cu.import("resource://enigmail/log.jsm"); /*global EnigmailLog: false */
Cu.import("resource://enigmail/armor.jsm"); /*global EnigmailArmor: false */
Cu.import("resource://enigmail/locale.jsm"); /*global EnigmailLocale: false */
Cu.import("resource://enigmail/files.jsm"); /*global EnigmailFiles: false */
Cu.import("resource://enigmail/gpg.jsm"); /*global EnigmailGpg: false */
Cu.import("resource://enigmail/execution.jsm"); /*global EnigmailExecution: false */
Cu.import("resource://enigmail/openpgp.jsm"); /*global EnigmailOpenPGP: false */
Cu.import("resource://enigmail/lazy.jsm"); /*global EnigmailLazy: false */
const getKeyRing = EnigmailLazy.loader("enigmail/keyRing.jsm", "EnigmailKeyRing");
const getDialog = EnigmailLazy.loader("enigmail/dialog.jsm", "EnigmailDialog");

const ENTRY_ID = 0;
const KEY_TRUST_ID = 1;
const KEY_SIZE_ID = 2;
const KEY_ALGO_ID = 3;
const KEY_ID = 4;
const CREATED_ID = 5;
const EXPIRY_ID = 6;
const UID_ID = 7;
const OWNERTRUST_ID = 8;
const USERID_ID = 9;
const SIG_TYPE_ID = 10;
const KEY_USE_FOR_ID = 11;

var EnigmailKey = {
  /**
   * Format a key fingerprint
   * @fingerprint |string|  -  unformated OpenPGP fingerprint
   *
   * @return |string| - formatted string
   */
  formatFpr: function(fingerprint) {
    //EnigmailLog.DEBUG("key.jsm: EnigmailKey.formatFpr(" + fingerprint + ")\n");
    // format key fingerprint
    let r = "";
    const fpr = fingerprint.match(/(....)(....)(....)(....)(....)(....)(....)(....)(....)?(....)?/);
    if (fpr && fpr.length > 2) {
      fpr.shift();
      r = fpr.join(" ");
    }

    return r;
  },

  // Extract public key from Status Message
  extractPubkey: function(statusMsg) {
    const matchb = statusMsg.match(/(^|\n)NO_PUBKEY (\w{8})(\w{8})/);
    if (matchb && (matchb.length > 3)) {
      EnigmailLog.DEBUG("enigmailCommon.jsm:: Enigmail.extractPubkey: NO_PUBKEY 0x" + matchb[3] + "\n");
      return matchb[2] + matchb[3];
    } else {
      return null;
    }
  },

  /**
   * import a revocation certificate form a given keyblock string.
   * Ask the user before importing the cert, and display an error
   * message in case of failures.
   */
  importRevocationCert: function(keyId, keyBlockStr) {

    let key = getKeyRing().getKeyById(keyId);

    if (key) {
      if (key.keyTrust === "r") {
        // Key has already been revoked
        getDialog().info(null, EnigmailLocale.getString("revokeKeyAlreadyRevoked", keyId));
      } else {

        let userId = key.userId + " - 0x" + key.keyId;
        if (!getDialog().confirmDlg(null,
            EnigmailLocale.getString("revokeKeyQuestion", userId),
            EnigmailLocale.getString("keyMan.button.revokeKey"))) {
          return;
        }

        let errorMsgObj = {};
        if (getKeyRing().importKey(null, false, keyBlockStr, keyId, errorMsgObj) > 0) {
          getDialog().alert(null, errorMsgObj.value);
        }
      }
    } else {
      // Suitable key for revocation certificate is not present in keyring
      getDialog().alert(null, EnigmailLocale.getString("revokeKeyNotPresent", keyId));
    }
  },

  /**
   * Split armored blocks into an array of strings
   */
  splitArmoredBlocks: function(keyBlockStr) {
    let myRe = /-----BEGIN PGP (PUBLIC|PRIVATE) KEY BLOCK-----/g;
    let myArray;
    let retArr = [];
    let startIndex = -1;
    while ((myArray = myRe.exec(keyBlockStr)) !== null) {
      if (startIndex >= 0) {
        let s = keyBlockStr.substring(startIndex, myArray.index);
        retArr.push(s);
      }
      startIndex = myArray.index;
    }

    retArr.push(keyBlockStr.substring(startIndex));

    return retArr;
  },

  /**
   * Get details (key ID, UID) of the data contained in a OpenPGP key block
   *
   * @param keyBlockStr  String: the contents of one or more public keys
   * @param errorMsgObj  Object: obj.value will contain an error message in case of failures
   * @param interactive  Boolean: if in interactive mode, may display dialogs (default: true)
   *
   * @return Array of objects with the following structure:
   *          - id (key ID)
   *          - fpr
   *          - name (the UID of the key)
   *          - state (one of "old" [existing key], "new" [new key], "invalid" [key cannot not be imported])
   */
  getKeyListFromKeyBlock: function(keyBlockStr, errorMsgObj, interactive = true) {
    EnigmailLog.DEBUG("key.jsm: getKeyListFromKeyBlock()\n");

    let blocks;
    let isBinary = false;

    errorMsgObj.value = "";

    let keyList = getGpgKeyData(keyBlockStr);
    let key = {};

    if (keyList.length === 0) {
      EnigmailLog.DEBUG("key.jsm: getKeyListFromKeyBlock: no data from GnuPG\n");
      if (keyBlockStr.search(/-----BEGIN PGP (PUBLIC|PRIVATE) KEY BLOCK-----/) >= 0) {
        blocks = this.splitArmoredBlocks(keyBlockStr);
      } else {
        isBinary = true;
        blocks = [EnigmailOpenPGP.enigmailFuncs.bytesToArmor(EnigmailOpenPGP.openpgp.enums.armor.public_key, keyBlockStr)];
      }

      for (let b of blocks) {
        let m = EnigmailOpenPGP.openpgp.message.readArmored(b);

        for (let i = 0; i < m.packets.length; i++) {
          let packetType = EnigmailOpenPGP.openpgp.enums.read(EnigmailOpenPGP.openpgp.enums.packet, m.packets[i].tag);
          switch (packetType) {
            case "publicKey":
            case "secretKey":
              key = {
                id: m.packets[i].getKeyId().toHex().toUpperCase(),
                fpr: m.packets[i].getFingerprint().toUpperCase(),
                name: null,
                isSecret: false
              };

              if (!(key.id in keyList)) {
                keyList[key.id] = key;
              }

              if (packetType === "secretKey") {
                keyList[key.id].isSecret = true;
              }
              break;
            case "userid":
              if (!key.name) {
                key.name = m.packets[i].userid.replace(/[\r\n]+/g, " ");
              }
              break;
            case "signature":
              if (m.packets[i].signatureType === SIG_TYPE_REVOCATION) {
                let keyId = m.packets[i].issuerKeyId.toHex().toUpperCase();
                if (keyId in keyList) {
                  keyList[keyId].revoke = true;
                } else {
                  keyList[keyId] = {
                    revoke: true,
                    id: keyId
                  };
                }
              }
              break;
          }
        }
      }
    }

    let retArr = [];
    for (let k in keyList) {
      retArr.push(keyList[k]);
    }

    if (interactive && retArr.length === 1) {
      key = retArr[0];
      if (("revoke" in key) && (!("name" in key))) {
        this.importRevocationCert(key.id, blocks.join("\n"));
        errorMsgObj.value = "";
        return [];
      }
    }

    return retArr;
  },

  /**
   * Get details of a key block to import. Works identically as getKeyListFromKeyBlock();
   * except that the input is a file instead of a string
   *
   * @param file         nsIFile object - file to read
   * @param errorMsgObj  Object - obj.value will contain error message
   *
   * @return Array (same as for getKeyListFromKeyBlock())
   */
  getKeyListFromKeyFile: function(path, errorMsgObj) {
    var contents = EnigmailFiles.readFile(path);
    return this.getKeyListFromKeyBlock(contents, errorMsgObj);
  },


  /**
   * Compare 2 KeyIds of possible different length (short, long, FPR-length, with or without prefixed
   * 0x are accepted)
   *
   * @param keyId1       string
   * @param keyId2       string
   *
   * @return true or false, given the comparison of the last minimum-length characters.
   */
  compareKeyIds: function(keyId1, keyId2) {
    var keyId1Raw = keyId1.replace(/^0x/, "").toUpperCase();
    var keyId2Raw = keyId2.replace(/^0x/, "").toUpperCase();

    var minlength = Math.min(keyId1Raw.length, keyId2Raw.length);

    if (minlength < keyId1Raw.length) {
      // Limit keyId1 to minlength
      keyId1Raw = keyId1Raw.substr(-minlength, minlength);
    }

    if (minlength < keyId2Raw.length) {
      // Limit keyId2 to minlength
      keyId2Raw = keyId2Raw.substr(-minlength, minlength);
    }

    return (keyId1Raw === keyId2Raw);
  }

};


function getGpgKeyData(armorKeyString) {
  if (!EnigmailGpg.getGpgFeature("supports-show-only")) return [];

  EnigmailLog.DEBUG("key.jsm: getGpgKeyData()\n");
  let command = EnigmailGpg.agentPath;
  let args = EnigmailGpg.getStandardArgs(false).concat(["--no-tty", "--batch", "--no-verbose", "--dry-run", "--with-fingerprint", "--with-colons", "--import-options", "show-only", "--import"]);

  let statusFlagsObj = {};
  let statusMsgObj = {};
  let exitCodeObj = {};
  let errorMsgObj = {};

  let output = EnigmailExecution.execCmd(command, args, armorKeyString, exitCodeObj, statusFlagsObj, statusMsgObj, errorMsgObj);

  let lines = output.split(/\r?\n/);
  let key = {};
  let keyId = "";
  let keyList = [];
  /*
  pub:u:256:22:84F83BE88C892606:1525969855:1683649855::u:::scESC:::::ed25519:::0:
  fpr:::::::::AFE1B65C5F39ACA7960B22CD84F83BE88C892606:
  uid:u::::1525969914::22DB32406212400B52CDC74DA2B33418637430F1::Patrick (ECC) <patrick@enigmail.net>::::::::::0:
  uid:u::::1525969855::F70B7A77F085AA7BA003D6AFAB6FF0DB1FC901B0::enigmail <patrick@enigmail.net>::::::::::0:
  sub:u:256:18:329DAB3350400C40:1525969855:1683649855:::::e:::::cv25519::
  fpr:::::::::3B154538D4DFAA19BDADAAD0329DAB3350400C40:
  */

  for (let i = 0; i < lines.length; i++) {
    const lineTokens = lines[i].split(/:/);

    switch (lineTokens[ENTRY_ID]) {
      case "pub":
      case "sec":
        key = {
          id: lineTokens[KEY_ID],
          fpr: null,
          name: null,
          isSecret: false
        };

        if (!(key.id in keyList)) {
          keyList[key.id] = key;
        }

        if (lineTokens[ENTRY_ID] === "sec") {
          keyList[key.id].isSecret = true;
        }
        break;
      case "fpr":
        if (!key.fpr) {
          key.fpr = lineTokens[USERID_ID];
        }
        break;
      case "uid":
        if (!key.name) {
          key.name = lineTokens[USERID_ID];
        }
        break;
      case "rvs":
      case "rvk":
        keyId = lineTokens[KEY_ID];
        if (keyId in keyList) {
          keyList[keyId].revoke = true;
        } else {
          keyList[keyId] = {
            revoke: true,
            id: keyId
          };
        }
        break;
    }
  }

  return keyList;
}