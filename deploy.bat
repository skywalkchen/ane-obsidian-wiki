@echo off
echo 開始上傳最新筆記至 GitHub...
git add .
git commit -m "Update wiki: %date% %time%"
git push origin main
echo 上傳完成！
pause