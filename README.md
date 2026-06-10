# Paper Reader

Independent bilingual paper-reading site for daily Zotero reader outputs.

- Local app: React + Vite + TypeScript
- Data source: copied reader packages under `public/library/`
- Public site: `https://lipengchem.github.io/paper-reader/`

## Daily Sync

```powershell
npm run sync:library
npm run build
git add .
git commit -m "Add daily reader"
git push
```

The sync script copies from `D:\codex\文献阅读\自动化文献阅读` by default and updates
`public/library/index.json`. It only consumes a copy of each reader package and does
not modify the original reading folder.
