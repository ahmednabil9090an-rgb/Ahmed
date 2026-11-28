#!/usr/bin/env bash
# للتشغيل: اضغط على الملف مرتين.
# أول مرة فقط على الماك قد تحتاج: انقر بزر الفأرة الأيمن ← فتح ← فتح.

cd "$(dirname "$0")" || exit 1

printf '\n  جارٍ تشغيل إنستينكت تشارتس...\n\n'

if ! command -v node >/dev/null 2>&1; then
  printf '  [!] برنامج Node.js غير مثبّت على هذا الجهاز.\n\n'
  printf '      نزّل النسخة المكتوب عليها LTS من: https://nodejs.org/\n'
  printf '      ثم شغّل هذا الملف مرة أخرى.\n\n'
  command -v open >/dev/null 2>&1 && open https://nodejs.org/
  read -r -p '  اضغط Enter للإغلاق... '
  exit 1
fi

node server.js --open

printf '\n  توقّف التطبيق.\n'
read -r -p '  اضغط Enter للإغلاق... '
