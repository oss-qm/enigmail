/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailTime"];

const EnigmailLocale = ChromeUtils.import("chrome://enigmail/content/modules/locale.jsm").EnigmailLocale;

const DATE_2DIGIT = "2-digit";
const DATE_4DIGIT = "numeric";

var EnigmailTime = {
  /**
   * Transform a Unix-Timestamp to a human-readable date/time string
   *
   * @dateNum:  Number  - Unix timestamp
   * @withDate: Boolean - if true, include the date in the output
   * @withTime: Boolean - if true, include the time in the output
   *
   * @return: String - formatted date/time string
   */
  getDateTime: function(dateNum, withDate, withTime) {
    if (dateNum && dateNum !== 0) {
      let dat = new Date(dateNum * 1000);
      let appLocale = EnigmailLocale.get();

      var options = {};

      if (withDate) {
        options.day = DATE_2DIGIT;
        options.month = DATE_2DIGIT;
        let year = dat.getFullYear();
        if (year > 2099) {
          options.year = DATE_4DIGIT;
        }
        else {
          options.year = DATE_2DIGIT;
        }
      }
      if (withTime) {
        options.hour = DATE_2DIGIT;
        options.minute = DATE_2DIGIT;
      }

      let useLocale = appLocale.getCategory("NSILOCALE_TIME").substr(0, 5);
      useLocale = useLocale.replace(/_/g, "-");

      try {
        return new Intl.DateTimeFormat(useLocale, options).format(dat);
      } catch (ex) {
        return new Intl.DateTimeFormat("en-US", options).format(dat);
      }
    }
    else {
      return "";
    }
  }
};
