module.exports = {
  root: true,
  env: {
    node: true,
    es6: true
  },
  extends: [
    'eslint:recommended',
    'plugin:vue/recommended'
  ],
  parserOptions: {
    parser: '@babel/eslint-parser',
    requireConfigFile: false,
    ecmaVersion: 2018,
    sourceType: 'module'
  },
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off'
  }
}