import nextPlugin from "eslint-config-next";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextPlugin,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
];
