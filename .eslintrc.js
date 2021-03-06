module.exports = {
  "parserOptions": {
    "ecmaVersion": 2017
  },
  "rules": {
    "linebreak-style": [
      2,
      "unix"
    ],
    "semi": [
      2,
      "always"
    ],
    "strict": [2, "global"],
    "no-unused-vars": 0,
    "no-empty": 0,
    "comma-dangle": 2,
    "require-atomic-updates": 0,
    "consistent-return": 2,
    "block-scoped-var": 2,
    "dot-notation": 2,
    "no-alert": 2,
    "no-caller": 2,
    "no-case-declarations": 2,
    "no-div-regex": 2,
    "no-labels": 2,
    "no-empty-pattern": 2,
    "no-eq-null": 2,
    "no-eval": 2,
    "no-extend-native": 2,
    "no-extra-bind": 2,
    "no-fallthrough": 2,
    "no-floating-decimal": 2,
    "no-implicit-coercion": 2,
    "no-implied-eval": 2,
    "no-invalid-this": 2,
    "no-iterator": 2,
    "no-irregular-whitespace": 0,
    "no-labels": 2,
    "no-lone-blocks": 2,
    "no-loop-func": 2,
    "no-multi-str": 2,
    "no-native-reassign": 2,
    "no-new-func": 2,
    "no-new-wrappers": 2,
    "no-new": 2,
    "no-octal-escape": 2,
    "no-process-env": 2,
    "no-proto": 2,
    "no-redeclare": [2, {
      "builtinGlobals": true
    }],
    "no-return-assign": 2,
    "no-script-url": 2,
    "no-self-compare": 2,
    "no-sequences": 2,
    "no-unused-expressions": 2,
    "no-useless-call": 2,
    "no-useless-concat": 2,
    "no-useless-escape": 0,
    "no-void": 2,
    "no-with": 2,
    "radix": 2,
    "wrap-iife": [2, "inside"],
    "yoda": 2,
    // TODO:
    //"eqeqeq": 2,
  },
  "env": {
    "es6": true,
    "browser": true,
    "node": true,
  },
  "extends": "eslint:recommended",
  "globals": {
    "ChromeUtils": true,
    "Components": true,
    "Cc": true,
    "Cu": true,
    "Cr": true,
    "Ci": true
  }
};