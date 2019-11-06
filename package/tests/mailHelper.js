/*global do_load_module: false, do_get_cwd: false, component: false, do_get_file: false */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var MailServices;
try {
  MailServices = component("/modules/MailServices.jsm").MailServices;
}
catch (x){
  MailServices = component("/modules/MailServices.js").MailServices;
}

var EnigmailFiles = component("enigmail/files.jsm").EnigmailFiles;
//component("/modules/iteratorUtils.jsm");

const MailHelper = {
  init: function() {
    if (!MailHelper.initialized) {
      try {
        MailServices.accounts.createLocalMailAccount();
      } catch (ex) {
        // This will fail if someone already called this.
      }

      let localAccount = MailServices.accounts.FindAccountForServer(MailServices.accounts.localFoldersServer);
      let identity = MailServices.accounts.createIdentity();
      identity.email = "tester@enigmail.org";
      localAccount.addIdentity(identity);
      localAccount.defaultIdentity = identity;
      MailHelper.incomingServer = MailServices.accounts.localFoldersServer;
      MailHelper.rootFolder = MailHelper.incomingServer.rootMsgFolder;
      if (!MailHelper.rootFolder.containsChildNamed("EngimailTestInbox")) {
        MailHelper.rootFolder.createSubfolder("EngimailTestInbox", null);
        MailHelper.inboxFolder = MailHelper.rootFolder.getChildNamed("EngimailTestInbox");
        MailHelper.inboxFolder.setFlag(Components.interfaces.nsMsgFolderFlags.Mail);
        MailHelper.inboxFolder.setFlag(Components.interfaces.nsMsgFolderFlags.Inbox);
      }
      MailHelper.initialized = true;
    }
  },

  deleteAllAccounts: function() {
    let ac = MailServices.accounts.accounts;
    for (let i = 0; i < ac.length; i++) {
      let aAccount = ac.queryElementAt(i, Components.interfaces.nsIMsgAccount);
      MailServices.accounts.removeAccount(aAccount, true);
    }

    MailHelper.initialized = false;
  },

  getRootFolder: function() {
    MailHelper.init();
    return MailHelper.rootFolder;
  },

  createMailFolder: function(name) {
    MailHelper.init();
    let localRoot = MailHelper.rootFolder.QueryInterface(Components.interfaces.nsIMsgLocalMailFolder);
    let mailFolder = localRoot.createLocalSubfolder(name);
    mailFolder.setFlag(Components.interfaces.nsMsgFolderFlags.Mail);
    return mailFolder;
  },

  cleanMailFolder: function(mailFolder) {
    MailHelper.init();
    let it = mailFolder.subFolders;
    while (it.hasMoreElements()) {
      mailFolder.propagateDelete(it.getNext(), true, null);
    }
  },

  loadEmailToMailFolder: function(emailFilePath, mailFolder) {
    let emailFile = do_get_file(emailFilePath, false);
    MailServices.copy.CopyFileMessage(emailFile, mailFolder, null, false, 0, null, null, null);
  },

  fetchFirstMessageHeaderIn: function(mailFolder) {
    let folderInfo = {};
    let msgDb = mailFolder.getDBFolderInfoAndDB(folderInfo);
    let enumerator = msgDb.EnumerateMessages();
    if (enumerator.hasMoreElements()) {
      return enumerator.getNext().QueryInterface(Components.interfaces.nsIMsgDBHdr);
    } else
      return null;
  }
};
