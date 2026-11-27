// 只抓真的錯（寫錯屬性、重複、無效值）；專案自己的設計規則由 tools/style_check.py 檢查。
export default {
  extends: ["stylelint-config-recommended"],
  rules: {
    "no-descending-specificity": null,
    "selector-pseudo-class-no-unknown": [true, { ignorePseudoClasses: ["state"] }],
  },
};
