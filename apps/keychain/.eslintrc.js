module.exports = {
  extends: require.resolve("./eslint/react.js"),
  parserOptions: {
    ecmaVersion: 12,
    sourceType: "module",
    tsconfigRootDir: __dirname,
    project: [`./tsconfig.json`],
  },
  overrides: [
    {
      files: ["*.ts", "*.tsx"],
      rules: {
        "@typescript-eslint/no-floating-promises": ["warn"],
      },
    },
  ],
};
