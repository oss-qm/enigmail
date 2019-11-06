/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */


"use strict";

//var EXPORTED_SYMBOLS = ["getOpenPGPjsAPI"];


var Services = ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
const EnigmailLog = Cu.import("chrome://enigmail/content/modules/log.jsm").EnigmailLog;
const EnigmailLazy = Cu.import("chrome://enigmail/content/modules/lazy.jsm").EnigmailLazy;

const getOpenPGP = EnigmailLazy.loader("enigmail/openpgp.jsm", "EnigmailOpenPGP");
const getArmor = EnigmailLazy.loader("enigmail/armor.jsm", "EnigmailArmor");

// Load generic API
Services.scriptloader.loadSubScript("chrome://enigmail/content/modules/cryptoAPI/interface.js",
  null, "UTF-8"); /* global CryptoAPI */


/**
 * OpenPGP.js implementation of CryptoAPI
 */

class OpenPGPjsCryptoAPI extends CryptoAPI {
  constructor() {
    super();
    this.api_name = "OpenPGP.js";
  }

  async getStrippedKey(armoredKey, emailAddr) {
    EnigmailLog.DEBUG("openpgp-js.js: getStrippedKey()\n");

    let searchUid = undefined;
    if (emailAddr) {
      if (emailAddr.search(/^<.{1,500}>$/) < 0) {
        searchUid = `<${emailAddr}>`;
      } else searchUid = emailAddr;
    }

    try {
      const openpgp = getOpenPGP().openpgp;
      let msg = await openpgp.key.readArmored(armoredKey);

      if (!msg || msg.keys.length === 0) {
        if (msg.err) {
          EnigmailLog.writeException("openpgp-js.js", msg.err[0]);
        }
        return null;
      }

      let key = msg.keys[0];
      let uid = await key.getPrimaryUser(null, searchUid);
      if (!uid || !uid.user) return null;

      let signSubkey = await key.getSigningKey();
      let encSubkey = await key.getEncryptionKey();
      /*
            let encSubkey = null,
              signSubkey = null;

            for (let i = 0; i < key.subKeys.length; i++) {
              if (key.subKeys[i].subKey === encSubkeyPacket) {
                encSubkey = key.subKeys[i];
                break;
              }
            }
            if (!encSubkey) return null;

            if (!signSubkeyPacket.keyid) {
              for (let i = 0; i < key.subKeys.length; i++) {
                if (key.subKeys[i].subKey === signSubkeyPacket) {
                  signSubkey = key.subKeys[i];
                  break;
                }
              }
              if (!signSubkey) return null;
            }
      */

      let p = new openpgp.packet.List();
      p.push(key.primaryKey);
      p.concat(uid.user.toPacketlist());
      if (key !== signSubkey) {
        p.concat(signSubkey.toPacketlist());
      }
      if (key !== encSubkey) {
        p.concat(encSubkey.toPacketlist());
      }

      return p.write();
    } catch (ex) {
      EnigmailLog.DEBUG("openpgp-js.js: getStrippedKey: ERROR " + ex.message + "\n" + ex.stack + "\n");
    }
    return null;
  }

  async getKeyListFromKeyBlock(keyBlockStr) {
    return await this.OPENPGPjs_getKeyListFromKeyBlockkeyBlockStr(keyBlockStr);
  }

  async OPENPGPjs_getKeyListFromKeyBlock(keyBlockStr) {
    EnigmailLog.DEBUG("openpgp-js.js: getKeyListFromKeyBlock()\n");
    const EnigmailTime = ChromeUtils.import("chrome://enigmail/content/modules/time.jsm").EnigmailTime;

    const SIG_TYPE_REVOCATION = 0x20;

    let keyList = [];
    let key = {};
    let blocks;
    let isBinary = false;
    const EOpenpgp = getOpenPGP();

    if (keyBlockStr.search(/-----BEGIN PGP (PUBLIC|PRIVATE) KEY BLOCK-----/) >= 0) {
      blocks = getArmor().splitArmoredBlocks(keyBlockStr);
    } else {
      isBinary = true;
      blocks = [EOpenpgp.enigmailFuncs.bytesToArmor(EOpenpgp.openpgp.enums.armor.public_key, keyBlockStr)];
    }

    for (let b of blocks) {
      let m = await EOpenpgp.openpgp.message.readArmored(b);

      for (let i = 0; i < m.packets.length; i++) {
        let packetType = EOpenpgp.openpgp.enums.read(EOpenpgp.openpgp.enums.packet, m.packets[i].tag);
        switch (packetType) {
          case "publicKey":
          case "secretKey":
            key = {
              id: m.packets[i].getKeyId().toHex().toUpperCase(),
              fpr: m.packets[i].getFingerprint().toUpperCase(),
              uids: [],
              created: EnigmailTime.getDateTime(m.packets[i].getCreationTime().getTime()/1000, true, false),
              name: null,
              isSecret: false,
              revoke: false
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
            else {
              key.uids.push(m.packets[i].userid.replace(/[\r\n]+/g, " "));
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

    return keyList;
  }
}


function getOpenPGPjsAPI() {
  return new OpenPGPjsCryptoAPI();
}